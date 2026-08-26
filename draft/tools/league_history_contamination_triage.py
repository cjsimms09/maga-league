#!/usr/bin/env python3
"""TERRITORY: D. For each SENSITIVE module: WHAT changed when the unplayed season came out.

A module whose only difference is a reported skip/exclusion count is doing its
job out loud (start_sit prints skipped_unplayed_owner_weeks; draft_pick prints
"seasons SKIPPED for want of a weekly-points store"). A module whose STATISTIC
moves is admitting the phantom season into its result. This prints both sides
so the call is made by reading, not by matching vocabulary.
"""
import subprocess, sys, shutil, os, re, json, difflib, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
STORE = ROOT / "draft/data/league_history.json"
REAL, PLAYED = "/tmp/lh_real.json", "/tmp/lh_played_only.json"
TIMEOUT = int(os.environ.get("SWEEP_TIMEOUT", "60"))

def scrub(s):
    s = re.sub(r"\d{4}-\d\d-\d\dT?[\d:.]*Z?", "<TS>", s)
    return re.sub(r"\b\d+\.\d+ ?s(ec)?\b", "<DUR>", s)

def artifacts():
    out = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT,
                         capture_output=True, text=True).stdout
    d = {}
    for line in out.split("\n"):
        if not line.strip(): continue
        p = line[3:].strip().strip('"')
        if "league_history.json" in p or "_lh_" in p or "_ctl_" in p: continue
        f = ROOT / p
        if f.is_file() and f.stat().st_size < 4_000_000:
            try: d[p] = f.read_text("utf8", "replace")
            except Exception: pass
    return d

def run(mod, store):
    subprocess.run(["git", "checkout", "--", "."], cwd=ROOT, capture_output=True)
    shutil.copy(store, STORE)
    try:
        p = subprocess.run([sys.executable, mod], cwd=ROOT, capture_output=True, timeout=TIMEOUT)
        out = scrub(p.stdout.decode("utf8", "replace") + p.stderr.decode("utf8", "replace"))
    except subprocess.TimeoutExpired:
        out = "<TIMEOUT>"
    return out, artifacts()

try:
    for mod in sys.argv[1:]:
        ao, aa = run(mod, REAL)
        bo, ba = run(mod, PLAYED)
        print("=" * 100)
        print("### " + mod)
        d = list(difflib.unified_diff(ao.split("\n"), bo.split("\n"),
                                      "with-2026", "without-2026", lineterm="", n=0))
        if d:
            print("-- stdout diff --")
            for l in d[:40]: print("   " + l[:190])
        for k in sorted(set(aa) | set(ba)):
            x, y = aa.get(k, ""), ba.get(k, "")
            if x == y: continue
            print(f"-- artifact {k} --")
            ad = list(difflib.unified_diff(x.split("\n"), y.split("\n"),
                                           "with-2026", "without-2026", lineterm="", n=0))
            for l in ad[:24]: print("   " + l[:190])
        if not d and not (set(aa.items()) ^ set(ba.items())):
            print("   (no difference on re-run — check for nondeterminism)")
finally:
    subprocess.run(["git", "checkout", "--", "."], cwd=ROOT, capture_output=True)
    shutil.copy(REAL, STORE)
