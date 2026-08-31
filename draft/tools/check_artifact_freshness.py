# TERRITORY: A
"""check_artifact_freshness — the one generic tool that replaces N bespoke
`test_X_matches_regeneration` pytest functions.

Background (the full history is draft/audit/rebuild_refusal_diagnosis_2026-08-16.md
and draft/audit/artifact_freshness_infra_2026-08-16.md): a committed research
artifact legitimately drifts from a fresh regeneration of the same generator
every time its inputs move — the board gets rebuilt, a proj_series snapshot
advances a day, positions get refreshed. That is NOT a code defect. Cory's
ruling was to stop conflating that with CODE CORRECTNESS ("does this function
reproduce its own committed output on a FIXED input") and to stop hand-adding
a new @pytest.mark.repo_parity test + marker-registry entry every time a new
study lands. This script is the fix: it walks draft/data/artifact_registry.json
and, for each entry, regenerates the artifact and reports FRESH or STALE. It
is informational — staleness is expected and never fails the process.

THE ONE THING THIS SCRIPT DOES treat as a real error (nonzero exit): a
regenerate_command that itself crashes, times out, or prints something that
is not valid JSON. That is a code bug (or a broken registry entry), not
staleness, and the two must not be conflated in the other direction either.

⛔ EVERY REGENERATION RUNS IN A THROWAWAY GIT WORKTREE, AND THE REASON IS AN
INCIDENT THIS SCRIPT CAUSED (register 415)
────────────────────────────────────────────────────────────────────────────
Most registered generators write their artifact to disk as a SIDE EFFECT of
building it — `build()` ends with `path.write_text(...)` and `--json` only
changes what is PRINTED. So running this script overwrote the very artifacts
it was checking. Five tracked files moved in one run on 2026-08-29, one of
them `public/market_upside_2026.json` — the deploy path, what the site
serves — and `own_model_v6.py` created a new untracked file besides.

The verdicts were not wrong: `check_entry` reads the committed artifact
BEFORE regenerating. They were UNREPEATABLE. The first run reported STALE and
refreshed the file in the same breath, so the second run reported FRESH and
the drift was gone. A measurement that erases its own evidence reads exactly
like a clean tree.

The fix is the standing rule from registers 58, 65 and 109 — never
mutate-and-restore a tracked artifact, use a worktree so there is no restore
step to skip. `published_page_freshness.js` already worked this way; this
script did not. The worktree is seeded from the LIVE tree (dirty, untracked
and ignored inputs included), so generators read what the working tree holds
rather than what HEAD happens to carry.

Run: python3 draft/tools/check_artifact_freshness.py
     python3 draft/tools/check_artifact_freshness.py --verbose   (full diff paths)
     python3 draft/tools/check_artifact_freshness.py --id own_model_v6
     python3 draft/tools/check_artifact_freshness.py --self-test
"""
from __future__ import annotations

import argparse
import hashlib
import json
import io
import os
import subprocess
import tempfile
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent.parent
REGISTRY_PATH = ROOT / "draft" / "data" / "artifact_registry.json"

DEFAULT_TIMEOUT_S = 120
#: Pure fp noise (set/dict iteration order affecting float summation) can
#: move a value in the ~1e-9 range between two runs of the SAME inputs; a
#: tolerance below that would make every entry flap. This is generous on
#: purpose — the script's job is "did the board move", not "to the last
#: bit", and a value that moved by more than this is real drift either way.
FLOAT_TOL = 1e-6
#: Field-name fragments that, when they appear in a differing path, usually
#: explain WHY without a human having to read the diff — best-effort only.
DRIFT_HINTS = ("built_at", "snapshot_date", "fetched_at", "as_of",
              "date_spread", "_dates")


def _get_path(doc: Any, dotted: str) -> Any:
    cur = doc
    for part in dotted.split("."):
        cur = cur[part]
    return cur


def _is_number(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def tolerant_equal(a: Any, b: Any, tol: float = FLOAT_TOL) -> bool:
    if isinstance(a, dict) and isinstance(b, dict):
        return set(a) == set(b) and all(tolerant_equal(a[k], b[k], tol) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(tolerant_equal(x, y, tol) for x, y in zip(a, b))
    if _is_number(a) and _is_number(b):
        return abs(a - b) <= tol
    return a == b


def diff_paths(committed: Any, fresh: Any, path: str = "", limit: int = 5,
               tol: float = FLOAT_TOL, out: list | None = None) -> list:
    """First `limit` leaf-level differences between two JSON documents,
    depth-first, dict keys visited in sorted order for stable output."""
    if out is None:
        out = []
    if len(out) >= limit:
        return out
    if isinstance(committed, dict) and isinstance(fresh, dict):
        for k in sorted(set(committed) | set(fresh), key=str):
            if len(out) >= limit:
                break
            if k not in committed:
                out.append((f"{path}.{k}", "<absent>", "present"))
            elif k not in fresh:
                out.append((f"{path}.{k}", "present", "<absent>"))
            else:
                diff_paths(committed[k], fresh[k], f"{path}.{k}", limit, tol, out)
    elif isinstance(committed, list) and isinstance(fresh, list):
        if len(committed) != len(fresh):
            out.append((f"{path}[]", f"len {len(committed)}", f"len {len(fresh)}"))
        else:
            for i, (x, y) in enumerate(zip(committed, fresh)):
                if len(out) >= limit:
                    break
                diff_paths(x, y, f"{path}[{i}]", limit, tol, out)
    else:
        if not tolerant_equal(committed, fresh, tol):
            out.append((path or "(root)", repr(committed), repr(fresh)))
    return out


def _best_effort_reason(diffs: list) -> str | None:
    for p, _, _ in diffs:
        if any(hint in p for hint in DRIFT_HINTS):
            return f"{p} differs — looks like a board/input timestamp moved"
    return None


class RegenerationError(Exception):
    """The regenerate_command itself failed — a real bug, not staleness."""


#: Ignored paths that cannot be an input to anything and are expensive or
#: harmful to copy. Everything else that git calls ignored IS seeded — the
#: repo has real ignored inputs (`data/`, `draft/data/bbm/*.csv`), and a
#: sandbox missing them would turn "the tool could not find its input" into
#: something indistinguishable from staleness.
_SEED_SKIP = (".git/", "node_modules/", "__pycache__", ".pytest_cache")


def _git(args: list[str], cwd: Path = None) -> str:
    return subprocess.run(["git"] + args, cwd=str(cwd or ROOT), check=True,
                          capture_output=True, text=True).stdout


def _parse_porcelain_z(raw: str) -> list[str]:
    """Parse `git status --porcelain -z` output into paths.

    NUL-separated on purpose: a filename with a space or a quote cannot be
    mis-split, and this repo has ignored input paths under `data/` that a
    whitespace split would mangle silently. A rename record is followed by its
    ORIGINAL path as a separate record, which must be consumed, not read as a
    second changed file.
    """
    recs = [r for r in raw.split("\0") if r]
    paths, i = [], 0
    while i < len(recs):
        rec = recs[i]
        i += 1
        if len(rec) < 4:
            continue
        xy, p = rec[:2], rec[3:]
        if "R" in xy:
            i += 1
        paths.append(p)
    return paths


def _porcelain_paths(extra: list[str] = ()) -> list[str]:
    return _parse_porcelain_z(_git(["status", "--porcelain", "-z"] + list(extra)))


def _tree_signature() -> tuple:
    """A cheap fingerprint of the live working tree, so the script can PROVE it
    left nothing behind. Paths cover new and deleted files; the diff hash
    covers a tracked file overwritten in place — which is exactly the shape of
    register 415 (`public/market_upside_2026.json` rewritten by a checker)."""
    return (tuple(sorted(_porcelain_paths())),
            hashlib.sha256(_git(["diff"]).encode("utf8", "replace")).hexdigest())


class Sandbox:
    """One throwaway git worktree for the whole run, seeded from the live tree.

    Created LAZILY: a run that checks nothing (or `--id` naming one entry that
    errors early) should not pay for a 161MB checkout.
    """

    def __init__(self) -> None:
        self._tmp = None
        self.root = None

    def path(self) -> Path:
        if self.root is None:
            self._tmp = Path(tempfile.mkdtemp(prefix="freshness-wt-"))
            wt = self._tmp / "wt"
            _git(["worktree", "add", "-q", "--detach", str(wt), "HEAD"])
            self._seed(wt)
            self.root = wt
        return self.root

    def _seed(self, wt: Path) -> None:
        """Make the worktree byte-equivalent to the LIVE tree for anything a
        generator could read: dirty tracked files, untracked files, and
        ignored inputs."""
        import shutil
        for rel in _porcelain_paths() + _porcelain_paths(["--ignored"]):
            if any(s in rel for s in _SEED_SKIP):
                continue
            src, dst = ROOT / rel, wt / rel
            if src.is_dir():
                shutil.copytree(src, dst, dirs_exist_ok=True,
                                ignore=shutil.ignore_patterns("__pycache__",
                                                              ".pytest_cache"))
            elif src.is_file():
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
            elif not src.exists():
                #: deleted in the live tree — the sandbox must not resurrect it
                if dst.exists():
                    dst.unlink()

    def close(self) -> None:
        if self.root is None:
            return
        import shutil
        subprocess.run(["git", "worktree", "remove", "--force", str(self.root)],
                       cwd=str(ROOT), capture_output=True, text=True)
        shutil.rmtree(self._tmp, ignore_errors=True)
        subprocess.run(["git", "worktree", "prune"], cwd=str(ROOT),
                       capture_output=True, text=True)
        self.root = None


def regenerate(entry: dict, cwd: Path = None) -> Any:
    """Run the entry's regenerate_command and return the JSON it produced.

    `cwd` is the SANDBOX worktree (see Sandbox). It defaults to ROOT only so
    that a direct caller in a test can opt out deliberately; `check_entry`
    always passes a sandbox, because most generators write their artifact as a
    side effect and would otherwise overwrite the file under comparison
    (register 415).

    ── TWO SHAPES, AND THE SECOND ONE EXISTS BECAUSE HALF THE REPO CANNOT MEET
    ── THE FIRST (register 414)

    The original contract is "print JSON to stdout", which suits a Python study
    whose `main()` calls a no-argument `grade()`. Every one of the 27 registered
    entries is Python, and that is not a coincidence: the JavaScript tools print
    a HUMAN REPORT to stdout and write their JSON via `--json PATH`, so they
    could never satisfy it. MEASURED 2026-08-28: 37 artifacts under
    `draft/data/` have a same-named JS tool and NOT ONE is registered — the
    freshness mechanism had a Python-shaped contract and the JS half of the repo
    was structurally outside it.

    So an entry may instead declare `regenerate_writes_to: "{OUT}"`, and the
    token `{OUT}` in its command is replaced with a temp path the tool writes
    to.

    ⚠️ THIS PARAGRAPH USED TO END "Nothing is written into the repo, which also
    keeps register 58's defect away". That was true of the `{OUT}` branch and
    FALSE of the stdout branch directly below it, which is where the
    side-effecting Python studies live — a sentence written about one arm and
    read as describing the function. It is the defect class this repo keeps
    paying for, committed in the comment that explains the fix. The claim is
    true now, but it is true because of the SANDBOX, not because of `{OUT}`.

    ── AND A THIRD SHAPE, WHICH THE SANDBOX IS WHAT MAKES SAFE (register 415)

    27 of those 37 JS tools accept no output path at all: they write their
    artifact unconditionally, at a fixed path. Register 414 left them
    unregisterable because registering them would have overwritten the
    committed file. It no longer does — the write lands in the sandbox — so
    such an entry declares `regenerate_writes_artifact: true` and the fresh
    document is READ BACK from the sandbox copy of its own `artifact_path`.
    Nothing needs to be added to the 27 tools.

    ⚠️ A MISSING OUTPUT FILE IS AN ERROR, NOT A CLEAN RESULT. If the command
    exits 0 and writes nothing, that is a broken entry and it says so, because
    "could not check" and "checked and clean" must never look the same. That
    applies to this third shape too: an unchanged sandbox copy would otherwise
    read as a perfect FRESH, which is the most dangerous possible false
    negative — it is the register 415 bug wearing a green light.
    """
    cmd = list(entry["regenerate_command"])
    timeout = entry.get("timeout_s", DEFAULT_TIMEOUT_S)
    sandbox_artifact = None
    if entry.get("regenerate_writes_artifact"):
        if cwd is None:
            raise RegenerationError(
                "regenerate_writes_artifact requires a sandbox — without one "
                "the command would overwrite the committed artifact it is "
                "being compared against (register 415)")
        sandbox_artifact = Path(cwd) / entry["artifact_path"]
        #: Remove it so that "the tool did not run" cannot masquerade as
        #: "the tool reproduced the committed file exactly".
        if sandbox_artifact.exists():
            sandbox_artifact.unlink()
    out_path = None
    if entry.get("regenerate_writes_to"):
        fd, out_path = tempfile.mkstemp(prefix="freshness-", suffix=".json")
        os.close(fd)
        os.unlink(out_path)          # the tool creates it; its absence is the signal
        cmd = [c.replace("{OUT}", out_path) for c in cmd]
    try:
        proc = subprocess.run(cmd, cwd=str(cwd or ROOT), capture_output=True,
                              text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        if out_path and os.path.exists(out_path):
            os.unlink(out_path)
        raise RegenerationError(f"timed out after {timeout}s")
    if proc.returncode != 0:
        if out_path and os.path.exists(out_path):
            os.unlink(out_path)
        tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-15:]
        raise RegenerationError("regenerate_command exited "
                                f"{proc.returncode}:\n    " + "\n    ".join(tail))
    if sandbox_artifact is not None:
        if not sandbox_artifact.exists():
            raise RegenerationError(
                "regenerate_command exited 0 but wrote no artifact to "
                f"{entry['artifact_path']} in the sandbox — the entry declares "
                "regenerate_writes_artifact, so a missing file is a broken "
                "entry, not a clean result")
        try:
            return json.loads(sandbox_artifact.read_text(encoding="utf8"))
        except json.JSONDecodeError as e:
            raise RegenerationError(
                f"the artifact written in the sandbox is not valid JSON: {e}")
    if out_path is not None:
        if not os.path.exists(out_path):
            raise RegenerationError(
                "regenerate_command exited 0 but wrote no file to {OUT} — the "
                "entry declares regenerate_writes_to, so a missing file is a "
                "broken entry, not a clean result")
        try:
            with io.open(out_path, encoding="utf8") as fh:
                return json.load(fh)
        except json.JSONDecodeError as e:
            raise RegenerationError(f"the file written to {{OUT}} is not valid JSON: {e}")
        finally:
            os.unlink(out_path)
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        raise RegenerationError(f"regenerate_command did not print valid JSON: {e}")


#: An artifact's OWN generation time cannot be anything but different between
#: two runs, so comparing it makes the entry permanently STALE for no reason.
#:
#: ⚠️ THIS IS NARROW ON PURPOSE AND `built_at` IS DELIBERATELY NOT IN IT. A
#: changed `built_at` means the INPUT moved, which is exactly the drift this
#: script exists to report. Only the artifact's statement about when IT ran is
#: meaningless here. Register 414, found the same hour the first four
#: JS artifacts were registered: three of the four read STALE on nothing but
#: `._generated_at`, a permanent false positive I created myself by adding
#: those stamps earlier the same day (registers 393, 411, 413).
GENERATION_TIME_KEYS = ("_generated_at", "generated_at")


def _strip_generation_time(obj: Any, extra: tuple = ()) -> Any:
    """Drop generation-time keys at EVERY level, leaving everything else."""
    drop = set(GENERATION_TIME_KEYS) | set(extra)
    if isinstance(obj, dict):
        return {k: _strip_generation_time(v, extra)
                for k, v in obj.items() if k not in drop}
    if isinstance(obj, list):
        return [_strip_generation_time(v, extra) for v in obj]
    return obj


def check_entry(entry: dict, verbose: bool = False,
                sandbox: "Sandbox" = None) -> tuple[str, str]:
    """Returns (status, message) where status is FRESH / STALE / ERROR.

    The committed artifact is always read from the REAL tree and the fresh one
    always produced inside the SANDBOX, so a generator that writes its own
    artifact cannot overwrite the thing being compared (register 415).
    """
    art_path = ROOT / entry["artifact_path"]
    if not art_path.exists():
        return "ERROR", f"committed artifact missing: {entry['artifact_path']}"
    try:
        committed_full = json.loads(art_path.read_text())
    except json.JSONDecodeError as e:
        return "ERROR", f"committed artifact is not valid JSON: {e}"

    try:
        fresh_full = regenerate(entry, cwd=sandbox.path() if sandbox else None)
    except RegenerationError as e:
        return "ERROR", str(e)

    compare_keys = entry.get("compare_keys")
    if compare_keys:
        try:
            committed = {k: _get_path(committed_full, k) for k in compare_keys}
            fresh = {k: _get_path(fresh_full, k) for k in compare_keys}
        except (KeyError, TypeError) as e:
            return "ERROR", f"compare_keys path not found in output: {e}"
    else:
        committed, fresh = committed_full, fresh_full

    #: Generation timestamps are dropped from BOTH sides before comparing.
    #: An entry may name extra keys via `ignore_keys` when its output carries
    #: another value that cannot be stable (a seed drawn from the clock, say).
    extra = tuple(entry.get("ignore_keys", ()))
    committed = _strip_generation_time(committed, extra)
    fresh = _strip_generation_time(fresh, extra)

    if tolerant_equal(committed, fresh):
        return "FRESH", ""

    diffs = diff_paths(committed, fresh)
    reason = _best_effort_reason(diffs)
    if verbose:
        detail = "; ".join(f"{p}: committed={c} fresh={f}" for p, c, f in diffs)
    else:
        detail = "; ".join(f"{p}: committed={c} fresh={f}" for p, c, f in diffs[:3])
        if len(diffs) > 3:
            detail += f" (+{len(diffs) - 3} more, --verbose for all)"
    msg = (reason + " — " if reason else "") + detail
    return "STALE", msg


def self_test() -> int:
    """Prove the sandbox does what the docstring says.

    ⚠️ RULE 3e/3f: the point is a KNOWN POSITIVE. A sandbox that is never
    written to is indistinguishable from a sandbox that does not work, so C3
    runs a command whose whole purpose is to write into the repo and then
    checks BOTH sides — the file landed in the sandbox, and it did not land in
    the real tree. Register 415 happened because nothing ever demonstrated the
    second half.
    """
    passed = failed = 0

    def ck(name: str, ok: bool, detail: Any = None) -> None:
        nonlocal passed, failed
        if ok:
            passed += 1
            print(f"PASS  {name}")
        else:
            failed += 1
            print(f"FAIL  {name}" + (f"\n        {detail!r}"[:300] if detail is not None else ""))

    ck("C0 parse — a rename record's ORIGINAL path is consumed, not counted as "
       "a second changed file",
       _parse_porcelain_z("R  new name.json\0old name.json\0 M a.py\0")
       == ["new name.json", "a.py"],
       _parse_porcelain_z("R  new name.json\0old name.json\0 M a.py\0"))
    ck("  and a path containing a space survives, which a whitespace split "
       "would have mangled",
       _parse_porcelain_z("?? draft/data/bbm/best ball mania.csv\0")
       == ["draft/data/bbm/best ball mania.csv"])

    sb = Sandbox()
    try:
        wt = sb.path()
        ck("C1 the sandbox is a real directory and is NOT the repo root",
           wt.exists() and wt.resolve() != ROOT.resolve(), str(wt))

        #: C2 KNOWN POSITIVE for the SEEDING: this file is dirty right now (it
        #: is being edited), so the sandbox copy must match the LIVE bytes and
        #: differ from HEAD's. If seeding silently did nothing, the sandbox
        #: would carry HEAD and every generator would read stale inputs while
        #: reporting cleanly — the exact false-negative shape rule 3e is about.
        me = "draft/tools/check_artifact_freshness.py"
        live = (ROOT / me).read_bytes()
        head = subprocess.run(["git", "show", f"HEAD:{me}"], cwd=str(ROOT),
                              capture_output=True).stdout
        seeded = (wt / me).read_bytes()
        if live == head:
            ck("C2 SKIPPED — this file is not dirty, so seeding cannot be "
               "demonstrated from it (run the self-test from a dirty tree)", True)
        else:
            ck("C2 seeding — a file dirty in the live tree reaches the sandbox "
               "with its LIVE bytes, not HEAD's", seeded == live and seeded != head,
               (len(live), len(head), len(seeded)))

        #: C3 THE KNOWN POSITIVE. A command that exists to write into the repo.
        probe_rel = "draft/data/_freshness_sandbox_probe.json"
        entry = {"regenerate_command": [
            sys.executable, "-c",
            "import json,pathlib;p=pathlib.Path('" + probe_rel + "');"
            "p.write_text('{\"wrote\": true}');print(json.dumps({'wrote': True}))"]}
        got = regenerate(entry, cwd=wt)
        ck("C3 KNOWN POSITIVE — a side-effecting command DID write its file, so "
           "this test can fail", (wt / probe_rel).exists(), got)
        ck("  and the write landed in the SANDBOX ONLY — the live tree has no "
           "such file", not (ROOT / probe_rel).exists(), str(ROOT / probe_rel))

        #: C4 The protection is the sandbox argument, not something ambient.
        #: Demonstrated by reading the default cwd rather than by writing.
        where = regenerate({"regenerate_command": [
            sys.executable, "-c", "import json,os;print(json.dumps(os.getcwd()))"]})
        ck("C4 without a sandbox, regenerate() runs in the REPO ROOT — so "
           "passing one is what spares the tree",
           Path(where).resolve() == ROOT.resolve(), where)

        ck("C5 ignored inputs are seeded too (`data/` is gitignored and is a "
           "real input)", (wt / "data").exists() or not (ROOT / "data").exists())

        #: ── mode 3: the tool writes its artifact at a fixed path ───────────
        art_rel = "draft/data/_freshness_mode3_probe.json"
        writes = {"artifact_path": art_rel, "regenerate_writes_artifact": True,
                  "regenerate_command": [
                      sys.executable, "-c",
                      "import pathlib;pathlib.Path('" + art_rel
                      + "').write_text('{\"n\": 7}');print('a human report')"]}
        doc = regenerate(writes, cwd=wt)
        ck("C7 mode 3 — a tool that writes its artifact at a fixed path and "
           "prints a HUMAN REPORT is read back from the sandbox copy",
           doc == {"n": 7}, doc)
        ck("  and it still did not touch the live tree",
           not (ROOT / art_rel).exists())

        #: THE FALSE NEGATIVE THIS MODE COULD HAVE HAD. The sandbox already
        #: carries a copy of every artifact (it is seeded from the tree), so a
        #: command that runs and writes NOTHING would read back as a perfect
        #: match — FRESH, green, and completely wrong. Seed it, then run a
        #: command that writes nothing, and require an ERROR.
        (wt / art_rel).write_text('{"n": 7}')
        silent = dict(writes, regenerate_command=[
            sys.executable, "-c", "print('did nothing')"])
        try:
            regenerate(silent, cwd=wt)
            ck("C8 KNOWN POSITIVE — a command that writes NOTHING must ERROR, "
               "not read back the pre-existing sandbox copy as FRESH", False,
               "returned a document instead of raising")
        except RegenerationError as e:
            ck("C8 KNOWN POSITIVE — a command that writes NOTHING must ERROR, "
               "not read back the pre-existing sandbox copy as FRESH",
               "wrote no artifact" in str(e), str(e)[:160])

        try:
            regenerate(writes, cwd=None)
            ck("C9 mode 3 REFUSES to run without a sandbox, because that is "
               "exactly the overwrite register 415 is about", False)
        except RegenerationError as e:
            ck("C9 mode 3 REFUSES to run without a sandbox, because that is "
               "exactly the overwrite register 415 is about",
               "requires a sandbox" in str(e), str(e)[:160])
        ck("  and refusing left no file behind in the live tree",
           not (ROOT / art_rel).exists())
    finally:
        sb.close()

    ck("C6 the sandbox is removed and git no longer lists it as a worktree",
       "freshness-wt-" not in _git(["worktree", "list"]))

    print(f"\n{passed}/{passed + failed} self-tests passed")
    return 1 if failed else 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--verbose", action="store_true",
                    help="print every differing leaf, not just the first 3")
    ap.add_argument("--id", action="append", dest="ids", default=None,
                    help="only check this registry entry id (repeatable)")
    ap.add_argument("--self-test", action="store_true",
                    help="prove the sandbox actually spares the live tree")
    ap.add_argument("--skip-network", action="store_true",
                    help="skip entries marked needs_network. Their failure is a "
                         "fact about the RUNNER, not about the artifact, so a "
                         "scheduled ERROR-only gate must not go red on them "
                         "(register 418).")
    args = ap.parse_args(argv)

    if args.self_test:
        return self_test()

    registry = json.loads(REGISTRY_PATH.read_text())
    entries = registry["entries"]
    if args.ids:
        wanted = set(args.ids)
        entries = [e for e in entries if e["id"] in wanted]
        missing = wanted - {e["id"] for e in entries}
        if missing:
            print(f"ERROR: unknown registry id(s): {sorted(missing)}", file=sys.stderr)
            return 2

    before = _tree_signature()
    sandbox = Sandbox()
    #: ⚠️ A SKIP IS ANNOUNCED, NEVER SILENT. "did not check" and "checked and
    #: clean" must not look the same (rule 3e), and a gate that quietly drops
    #: entries is how coverage disappears without anyone deciding to drop it.
    skipped = []
    if args.skip_network:
        keep = []
        for e in entries:
            (skipped if e.get("needs_network") else keep).append(e)
        entries = keep

    fresh_n = stale_n = error_n = 0
    try:
        for entry in entries:
            status, msg = check_entry(entry, verbose=args.verbose, sandbox=sandbox)
            if status == "FRESH":
                fresh_n += 1
                print(f"FRESH  {entry['id']}")
            elif status == "STALE":
                stale_n += 1
                print(f"STALE  {entry['id']}  ({entry['artifact_path']})")
                if msg:
                    print(f"       {msg}")
            else:
                error_n += 1
                print(f"ERROR  {entry['id']}")
                for line in msg.splitlines():
                    print(f"       {line}")
    finally:
        sandbox.close()

    total = len(entries)
    print(f"\n{fresh_n} fresh, {stale_n} stale, {error_n} errored, {total} total.")
    if skipped:
        print(f"SKIPPED {len(skipped)} entry(ies) marked needs_network — NOT checked, "
              f"which is not the same as clean: "
              + ", ".join(e["id"] for e in skipped))
    if stale_n:
        print("STALE is expected and does not indicate a defect — it means "
              "the board/inputs moved since the artifact was committed. "
              "Regenerate the artifact (run the owner_module's main()) if "
              "you want it current.")

    #: ── THE GUARD THAT WOULD HAVE CAUGHT REGISTER 415 ─────────────────────
    #: Reporting "I ran in a sandbox" is a claim; comparing the tree before
    #: and after is a measurement. If this ever fires, the sandbox leaked and
    #: the run's verdicts are unrepeatable — that is an ERROR, not a note.
    after = _tree_signature()
    if after != before:
        moved = sorted(set(after[0]) - set(before[0])) or ["(content changed in place)"]
        print("\n🔴 THE LIVE WORKING TREE CHANGED DURING THIS RUN.\n"
              "   TWO CAUSES LOOK IDENTICAL HERE AND THIS CHECK CANNOT TELL "
              "THEM APART:\n"
              "     (a) a generator wrote into the repo — the sandbox leaked, "
              "and the\n         verdicts above do not reproduce (register 415); "
              "or\n"
              "     (b) SOMETHING ELSE EDITED THE TREE WHILE THIS RAN — an "
              "editor, a\n         commit, another agent. On 2026-08-29 this "
              "fired at exit 2 and\n         the cause was a commit landing "
              "mid-run, not a leak.\n"
              "   Re-run on a QUIET TREE before believing (a). In CI nothing "
              "else writes,\n   so there it means (a).")
        for p in moved[:20]:
            print(f"     {p}")
        return 2

    print("\n✅ the live working tree is byte-identical to how this run found it "
          "(register 415).")
    return 1 if error_n else 0


if __name__ == "__main__":
    raise SystemExit(main())
