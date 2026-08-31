#!/usr/bin/env python3
"""TERRITORY: D. Which readers of league_history admit the UNPLAYED season?

Register 339/340's open half, made runnable. REPORT-ONLY -- it gates nothing;
it swaps the store, runs each module twice and restores. Usage:

    python3 draft/tools/league_history_contamination_sweep.py \\
        $(grep -rl league_history draft/backtest --include=*.py | sort)

then triage what it flags with the sibling script, because a module that
merely PRINTS its exclusion count is doing its job out loud and a module
whose statistic moves is not.

Register 339/340's open half. Not a grep: a static scan would match on
vocabulary, which is exactly how a sweep for missing controls went wrong
before. This runs each module twice -- once against the store as shipped, once
against a store with every all-zero season removed -- and calls a module
SENSITIVE when its output changes. How the guard is written does not matter;
whether the phantom season reaches the result does.

Controls ship with it (Rule 3e/3f): _ctl_positive.py must come back SENSITIVE
and _ctl_negative.py INSENSITIVE, or the run is void.
"""
import subprocess, sys, shutil, os, re, json, hashlib, pathlib, time, signal, atexit

ROOT = pathlib.Path(__file__).resolve().parents[2]
STORE = ROOT / "draft/data/league_history.json"
REAL, PLAYED = "/tmp/lh_real.json", "/tmp/lh_played_only.json"
TIMEOUT = int(os.environ.get("SWEEP_TIMEOUT", "90"))

NOISE = [
    (re.compile(r"\d{4}-\d\d-\d\dT?[\d:.]*Z?"), "<TS>"),
    (re.compile(r"\b\d+\.\d+ ?s(ec)?\b"), "<DUR>"),
    (re.compile(r"0x[0-9a-f]+"), "<ADDR>"),
]

def build_stores():
    """The counterfactual. TWO modes, because a season is not one thing:

      whole   (default) drop every season whose owner-weeks are ALL zero
      weeks   keep the season and drop only the zero owner-weeks

    `whole` conflates two causes. The 2026 season carries a REAL completed
    draft AND 180 zero owner-weeks, so dropping it also removes a legitimate
    draft record -- and three tests that flipped under `whole` went green
    under `weeks`, i.e. they depend on the draft, not on the phantom weeks.
    Use `weeks` to isolate zero-contamination; use `whole` to find everything
    that reads the current season at all. Set LH_MODE=weeks.
    """
    mode = os.environ.get("LH_MODE", "whole")
    shutil.copy(STORE, REAL)
    d = json.load(open(REAL))

    def zero_weeks(v):
        n = 0
        for entries in (v.get("weeks") or {}).values():
            for m in (entries or []):
                if not any(float(x or 0) != 0
                           for x in ((m or {}).get("players_points") or {}).values()):
                    n += 1
        return n

    if mode == "weeks":
        removed = 0
        for v in d["seasons"]:
            wk = v.get("weeks") or {}
            for wnum in list(wk.keys()):
                keep = []
                for m in (wk[wnum] or []):
                    if any(float(x or 0) != 0
                           for x in ((m or {}).get("players_points") or {}).values()):
                        keep.append(m)
                    else:
                        removed += 1
                wk[wnum] = keep
        json.dump(d, open(PLAYED, "w"))
        print("counterfactual [weeks]: removed %d zero owner-week(s), all "
              "seasons and draft records kept\n" % removed)
        return [removed] if removed else []

    def played(v):
        for entries in (v.get("weeks") or {}).values():
            for m in (entries or []):
                if any(float(x or 0) != 0
                       for x in ((m or {}).get("players_points") or {}).values()):
                    return True
        return False
    kept = [v for v in d["seasons"] if played(v)]
    dropped = [v.get("season") for v in d["seasons"] if not played(v)]
    d["seasons"] = kept
    json.dump(d, open(PLAYED, "w"))
    print("counterfactual [whole]: dropped unplayed season(s) %s, kept %s\n"
          % (dropped, [v.get("season") for v in kept]))
    return dropped


def scrub(s):
    for rx, rep in NOISE:
        s = rx.sub(rep, s)
    return s

def snapshot():
    """CONTENT hashes of every file a run rewrote -- not just their names.
    The first version recorded `git status --porcelain` only, so two runs that
    both dirtied the same artifact looked identical and any module whose ONLY
    difference lived in its written JSON came back "insensitive". That is a
    false-negative source in a sweep whose whole job is finding false
    negatives, so it was fixed before the results were written down rather
    than after. The store being swapped is excluded, or everything is
    sensitive (that one the negative control caught).
    """
    out = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT,
                         capture_output=True, text=True).stdout
    parts = []
    for line in out.split("\n"):
        if not line.strip():
            continue
        path = line[3:].strip().strip('"')
        if "league_history.json" in path or "_lh_" in path:
            continue
        f = ROOT / path
        try:
            h = hashlib.sha1(f.read_bytes()).hexdigest()[:12] if f.is_file() else "DIR"
        except Exception as e:
            h = "ERR:" + type(e).__name__
        parts.append(path + " " + h)
    return "\n".join(sorted(parts))

def runner(mod):
    """How this file is executed. A pytest test invoked as a plain script exits
    0 having run nothing, and a .js file handed to python errors instantly --
    either way the arm executes nothing and the module reports as clean. That
    is a silent all-clear from a probe that never ran, so the sweep ships a
    pytest-path control and this dispatch is shared by both scripts."""
    if mod.endswith(".js"):
        return ["node", mod]
    b = os.path.basename(mod)
    if b.startswith("_lh_ctl_pytest"):
        return [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", mod]
    if "/tests/" in mod and b.startswith("test_"):
        return [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", mod]
    return [sys.executable, mod]


def run_once(mod, store):
    shutil.copy(store, STORE)
    before = snapshot()
    t0 = time.time()
    try:
        p = subprocess.run(runner(mod), cwd=ROOT, capture_output=True,
                           timeout=TIMEOUT)
        rc, so, se = p.returncode, p.stdout.decode("utf8", "replace"), p.stderr.decode("utf8", "replace")
    except subprocess.TimeoutExpired:
        return {"rc": "TIMEOUT", "out": "", "files": "", "secs": time.time() - t0}
    return {"rc": rc, "out": scrub(so + se), "files": snapshot(), "secs": time.time() - t0}

def classify(mod):
    a = run_once(mod, REAL)
    b = run_once(mod, PLAYED)
    # DETERMINISM FIRST, and this control exists because its absence put a
    # false positive in register 345. `exp_inverse_adjuster` was flagged
    # SENSITIVE by this tool and was not contaminated at all -- it was
    # NONDETERMINISTIC, and a study that disagrees with ITSELF reads exactly
    # like a study that disagrees across two stores. A (register 420) found
    # that; this tool could not have, because it never ran anything twice
    # against the same store. Only flagged modules pay the extra run.
    if (a["rc"] != b["rc"] or a["out"] != b["out"] or a["files"] != b["files"]):
        c = run_once(mod, REAL)
        if c["rc"] != a["rc"] or c["out"] != a["out"] or c["files"] != a["files"]:
            return "NOT-REPRODUCIBLE", a, b
    if a["rc"] == "TIMEOUT" or b["rc"] == "TIMEOUT":
        return "TIMEOUT", a, b
    if a["rc"] != 0 and b["rc"] != 0:
        return "ERRORS-BOTH", a, b
    if a["rc"] != b["rc"]:
        return "SENSITIVE", a, b
    if a["out"] != b["out"] or a["files"] != b["files"]:
        return "SENSITIVE", a, b
    return "insensitive", a, b

def _restore(*a):
    """The store MUST go back even on SIGTERM. A timeout killed the first run
    and left the played-only copy in the tree; `finally` does not cover that."""
    try: shutil.copy(REAL, STORE)
    except Exception: pass
    if a: os._exit(143)

atexit.register(_restore)
signal.signal(signal.SIGTERM, _restore)
signal.signal(signal.SIGINT, _restore)

if __name__ == "__main__":
    mods = sys.argv[1:]
    if not build_stores():
        print("no unplayed season in the store — nothing to compare. "
              "This SKIPS rather than passing: an exclusion sweep with nothing "
              "to exclude proves nothing.")
        sys.exit(0)
    # The positive control has to be one the MODE actually moves. The
    # season-list controls are blind to weeks mode (it keeps every season), so
    # running them there voids every run -- which is what they did, correctly,
    # the first time weeks mode was tried.
    WEEKS_MODE = os.environ.get("LH_MODE", "whole") == "weeks"
    POSITIVE = ("draft/tools/_lh_ctl_weeks.py" if WEEKS_MODE
                else "draft/tools/_lh_ctl_positive.py")
    CTL = [POSITIVE, "draft/tools/_lh_ctl_negative.py",
           "draft/tools/_lh_ctl_artifact.py", "draft/tools/_lh_ctl_random.py"]
    if any("/tests/" in m for m in mods):
        CTL.append("draft/tools/_lh_ctl_pytest_probe.py")
    mods = CTL + [m for m in mods if m not in CTL]
    results = {}
    try:
        for m in mods:
            verdict, a, b = classify(m)
            results[m] = {"verdict": verdict, "rc_real": a["rc"], "rc_played": b["rc"],
                          "secs": round(max(a["secs"], b["secs"]), 1)}
            print(f"{verdict:14s} {m}  (rc {a['rc']}/{b['rc']}, {results[m]['secs']}s)", flush=True)
    finally:
        shutil.copy(REAL, STORE)
    json.dump(results, open("/tmp/lh_sweep_results.json", "w"), indent=1)
    pos = results.get(POSITIVE, {}).get("verdict")
    neg = results.get("draft/tools/_lh_ctl_negative.py", {}).get("verdict")
    art = results.get("draft/tools/_lh_ctl_artifact.py", {}).get("verdict")
    if WEEKS_MODE:
        art = "SENSITIVE" if art == "SENSITIVE" else art
    pyt = results.get("draft/tools/_lh_ctl_pytest_probe.py", {}).get("verdict")
    if pyt is not None:
        print(f"PYTEST-PATH CONTROL: {pyt} (want SENSITIVE -- proves tests are "
              f"actually being RUN, not invoked as scripts and exiting 0)")
        if pyt != "SENSITIVE":
            print("*** PYTEST CONTROL FAILED -- this run is void.")
            sys.exit(2)
    rnd = results.get("draft/tools/_lh_ctl_random.py", {}).get("verdict")
    print(f"DETERMINISM CONTROL: random probe={rnd} (want NOT-REPRODUCIBLE), "
          f"steady probe={neg} (want insensitive)")
    if rnd != "NOT-REPRODUCIBLE":
        print("*** DETERMINISM CONTROL FAILED -- a self-disagreeing study would "
              "still be reported as contaminated (register 345's own false positive).")
        sys.exit(2)
    print(f"\nCONTROLS: stdout-positive={pos} (want SENSITIVE)  negative={neg} "
          f"(want insensitive)  artifact-positive={art} (want SENSITIVE)")
    if pos != "SENSITIVE" or neg != "insensitive" or art != "SENSITIVE":
        print("*** CONTROLS FAILED — this run is void. Every one of these has "
              "caught a real defect in this harness: the negative caught the "
              "swapped store being counted as a change, the artifact-positive "
              "caught file NAMES being compared instead of contents, and then "
              "caught this script's own exclusion filter swallowing it.")
        sys.exit(2)
