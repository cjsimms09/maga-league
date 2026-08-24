"""Control for the register-283 fix, run against the COMMITTED board.

Simulates exactly what `attach_draftsharks` now does — apply_vorp over the
draftable pool with full_pool = draftable + keepers — and checks the published
replacement block moves to the values register 283 predicted.

C1  default (no full_pool) must reproduce the SHIPPED block byte-for-byte,
    so the change is opt-in and no existing caller moved.
C2  with full_pool it must produce RB 181.1 / WR 170.3 / TE 141.7 -- the numbers
    the register predicted from an independent derivation.
C3  the flex split must go 0/10 -> 4/6, matching realized outcomes and the
    board's own pre-lock value.
C4  every draftable player's vorp must still satisfy proj_mean - replacement.
"""
import json, sys
sys.path.insert(0, "draft")
import vorp

board = json.load(open("public/draft_data.json"))
cfg = board["league"]
avail = [dict(p) for p in board["players"]]
kept = [dict(p) for p in board.get("kept_players") or []]
fails = []
def ok(n, c, d):
    print("  %-4s %-62s %s" % (n, d, "OK" if c else "*** FAILED ***"))
    if not c: fails.append(n)

_, diag_old = vorp.apply_vorp([dict(p) for p in avail], cfg)
shipped = board["replacement"]["replacement_points"]
same = all(abs(diag_old["replacement_points"][k] - shipped[k]) < 0.01 for k in shipped)
ok("C1", same, "default call reproduces the SHIPPED block exactly")

priced, diag_new = vorp.apply_vorp([dict(p) for p in avail], cfg,
                                   full_pool=[dict(p) for p in avail] + kept)
rp = diag_new["replacement_points"]; sc = diag_new["starter_counts"]
print("\n  %-4s %-10s %-10s %s" % ("pos", "SHIPPED", "FIXED", "starter_counts"))
for p in ("QB", "RB", "WR", "TE"):
    print("  %-4s %-10.1f %-10.1f %d -> %d" % (p, shipped[p], rp[p],
          board["replacement"]["starter_counts"][p], sc[p]))
ok("C2", abs(rp["RB"] - 181.1) < 0.2 and abs(rp["WR"] - 170.3) < 0.2 and abs(rp["TE"] - 141.7) < 0.2,
   "RB 181.1 / WR 170.3 / TE 141.7, as register 283 predicted independently")
ok("C3", sc["RB"] == 24 and sc["WR"] == 26 and sc["TE"] == 10,
   "flex split RB+4 / WR+6 / TE+0 (was +0/+10/+0)")
bad = [p for p in priced
       if p.get("vorp") is not None and p.get("proj_mean") is not None
       and abs(p["proj_mean"] - rp.get(p["position"], 0) - p["vorp"]) > 0.02]
ok("C4", not bad, "vorp == proj_mean - replacement on all %d priced rows" % len(priced))
print("\n  %d control(s) failed" % len(fails) if fails else "\n  all controls passed")
sys.exit(1 if fails else 0)
