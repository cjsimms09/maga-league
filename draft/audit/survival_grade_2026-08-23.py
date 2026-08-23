"""THE GRADEABLE VERSION, built rather than asked for.

The freeze carries `availability_by_pick`: {player_id: {cory_pick: P(available)}}
for all 682 players at all twelve of his picks. That is a real forward
prediction set. The log tells us who was taken when, so every outcome is known.

For each of Cory's picks P (bar the last) and every player AVAILABLE at P:
    prediction = availability_by_pick[pid][next_pick_after_P]
    outcome    = survived iff he was not taken in picks [P, next)
Base rate FIRST, then the score -- register 265's rule, applied to my own work.
"""
import json, statistics, collections
R = "/home/user/maga-league/"
fz  = json.load(open(R+"draft/data/pre_draft_freeze_2026.json"))
rows= [json.loads(l) for l in open(R+"draft/data/draft_pick_log_2026.jsonl") if l.strip()]

taken_at = {str(r["player_id"]): r["pick"] for r in rows if r.get("player_id")}
MY = fz["my_picks"]
AB = fz["availability_by_pick"]
ids = [str(p["player_id"]) for p in fz["players"]]

pairs = []   # (pred, outcome, pick, next, pid)
for i, P in enumerate(MY[:-1]):
    nxt = MY[i+1]
    for pid in ids:
        t = taken_at.get(pid)
        if t is not None and t < P:      # already gone before this pick
            continue
        pred = (AB.get(pid) or {}).get(str(nxt))
        if pred is None:
            continue
        survived = (t is None) or (t >= nxt)
        pairs.append((float(pred), survived, P, nxt, pid))

n = len(pairs)
base = sum(1 for p in pairs if p[1]) / n
print("GRADED PAIRS: %d   (across %d of Cory's picks)" % (n, len(MY)-1))
print("BASE RATE (actually survived): %.4f   <- printed FIRST, register 265's rule\n" % base)

brier  = sum((p[0]-(1.0 if p[1] else 0.0))**2 for p in pairs)/n
brier0 = sum((base-(1.0 if p[1] else 0.0))**2 for p in pairs)/n
print("Brier  model %.4f   climatology %.4f   -> skill %+.1f%%" % (brier, brier0, 100*(1-brier/brier0)))

print("\nCALIBRATION (predicted band -> actual survival rate):")
bands = [(0,.05),(.05,.2),(.2,.4),(.4,.6),(.6,.8),(.8,.95),(.95,1.01)]
for lo,hi in bands:
    b=[p for p in pairs if lo <= p[0] < hi]
    if not b: continue
    print("   %.2f-%.2f  n=%5d  predicted %.3f   actual %.3f   %s"
          % (lo,hi,len(b),statistics.mean(x[0] for x in b),
             sum(1 for x in b if x[1])/len(b),
             "over-confident" if statistics.mean(x[0] for x in b) > sum(1 for x in b if x[1])/len(b)+.05
             else ("under-confident" if statistics.mean(x[0] for x in b) < sum(1 for x in b if x[1])/len(b)-.05 else "")))

print("\n=== THE DECISION-RELEVANT SET (predicted < 0.80) ===")
d=[p for p in pairs if p[0] < 0.80]
print("n=%d of %d (%.1f%% of pairs)" % (len(d), n, 100*len(d)/n))
print("mean predicted %.3f   actual survival %.3f   gap %+.3f"
      % (statistics.mean(x[0] for x in d), sum(1 for x in d if x[1])/len(d),
         sum(1 for x in d if x[1])/len(d) - statistics.mean(x[0] for x in d)))
under=sum(1 for x in d if x[1])
print("of %d players the model said were UNLIKELY to last, %d actually lasted (%.0f%%)"
      % (len(d), under, 100*under/len(d)))
print("\nby pick — is it one bad pick or all of them?")
for i,P in enumerate(MY[:-1]):
    b=[x for x in d if x[2]==P]
    if not b: continue
    print("   pick %-4d n=%3d  predicted %.3f  actual %.3f" %
          (P, len(b), statistics.mean(x[0] for x in b), sum(1 for x in b if x[1])/len(b)))
