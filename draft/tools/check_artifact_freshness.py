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

Run: python3 draft/tools/check_artifact_freshness.py
     python3 draft/tools/check_artifact_freshness.py --verbose   (full diff paths)
     python3 draft/tools/check_artifact_freshness.py --id own_model_v6
"""
from __future__ import annotations

import argparse
import json
import subprocess
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


def regenerate(entry: dict) -> Any:
    cmd = entry["regenerate_command"]
    timeout = entry.get("timeout_s", DEFAULT_TIMEOUT_S)
    try:
        proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                              timeout=timeout)
    except subprocess.TimeoutExpired:
        raise RegenerationError(f"timed out after {timeout}s")
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-15:]
        raise RegenerationError("regenerate_command exited "
                                f"{proc.returncode}:\n    " + "\n    ".join(tail))
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        raise RegenerationError(f"regenerate_command did not print valid JSON: {e}")


def check_entry(entry: dict, verbose: bool = False) -> tuple[str, str]:
    """Returns (status, message) where status is FRESH / STALE / ERROR."""
    art_path = ROOT / entry["artifact_path"]
    if not art_path.exists():
        return "ERROR", f"committed artifact missing: {entry['artifact_path']}"
    try:
        committed_full = json.loads(art_path.read_text())
    except json.JSONDecodeError as e:
        return "ERROR", f"committed artifact is not valid JSON: {e}"

    try:
        fresh_full = regenerate(entry)
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


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--verbose", action="store_true",
                    help="print every differing leaf, not just the first 3")
    ap.add_argument("--id", action="append", dest="ids", default=None,
                    help="only check this registry entry id (repeatable)")
    args = ap.parse_args(argv)

    registry = json.loads(REGISTRY_PATH.read_text())
    entries = registry["entries"]
    if args.ids:
        wanted = set(args.ids)
        entries = [e for e in entries if e["id"] in wanted]
        missing = wanted - {e["id"] for e in entries}
        if missing:
            print(f"ERROR: unknown registry id(s): {sorted(missing)}", file=sys.stderr)
            return 2

    fresh_n = stale_n = error_n = 0
    for entry in entries:
        status, msg = check_entry(entry, verbose=args.verbose)
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

    total = len(entries)
    print(f"\n{fresh_n} fresh, {stale_n} stale, {error_n} errored, {total} total.")
    if stale_n:
        print("STALE is expected and does not indicate a defect — it means "
              "the board/inputs moved since the artifact was committed. "
              "Regenerate the artifact (run the owner_module's main()) if "
              "you want it current.")
    return 1 if error_n else 0


if __name__ == "__main__":
    raise SystemExit(main())
