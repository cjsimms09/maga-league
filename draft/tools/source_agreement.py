# TERRITORY: A
"""WHERE DO THE SOURCES AGREE, AND WHERE DO THEY NOT?

Cory, 2026-08-20: "Have we built easy way for me to see players, where sources
disagree or agree. Think hard about best way to present this info to me... it
should be clean, easy to understand but let me know when sources disagree"

-- WHY POSITIONAL RANK AND NOT PROJECTED POINTS ----------------------------

The obvious build is to show four projections per player and let the spread
speak. Measured first, and it does not: the four sources are not on one scale.
Median ratio to the blend over the same top-250 players --

    Draft Sharks 1.04 | FantasyPros 1.01 | Sleeper 0.96 | our model 0.79

and our model's p10 ratio is 0.38. So a raw points spread would flag our model
on player after player for a reason that is not about the player at all. That is
register 64's shape (a blend averaging numbers that do not measure the same
thing) and rule 3i's (a true number that misleads).

POSITIONAL RANK IS SCALE-FREE. "Is he WR13 or WR55" is also the question a
drafter actually has, and the ranks already exist: rerank_by_source.py builds a
board per source through the SAME vorp.apply_vorp/assign_tiers the real board
uses. One derivation, reused (rule 11) -- nothing here re-ranks anything.

Overall rank was tried first and is wrong for this: onesie positions are sorted
to the tail, so K and DEF showed spreads of 430+ that were an artifact of that
sort rather than disagreement. Positional rank is immune.

-- WHY max-min IS NOT ENOUGH ------------------------------------------------

It conflates two situations that mean OPPOSITE things:

    Malik Nabers      ds 14  sleeper 16  fp 13  own 55   <- three agree, one dissents
    Nicholas Singleton ds 66 sleeper 54  own 64  fp 98   <- genuinely split

The first says "trust the three". The second says "nobody knows". A single
spread number cannot tell them apart, so this reports FOUR states:

    AGREE    the spread is no wider than this position's own median spread
    DISSENT  one source sits apart from a cluster of the others -- NAMED
    SPLIT    no cluster; the sources genuinely differ
    THIN     fewer than three sources cover him. NOT agreement -- absence.

-- NO TYPED THRESHOLDS ------------------------------------------------------

"How wide is wide" is derived from THIS board, per position, because positions
differ enormously: median spread WR 17, RB 8, QB 7, TE 9, DEF 4, K 5. A single
absolute bar would flag every WR and no DEF.

The DISSENT/SPLIT test is structural rather than numeric: sort the source ranks,
find the largest gap between neighbours, and ask whether that one gap accounts
for at least half the total spread AND falls at either end (leaving one source
alone). That is "is there a natural break", not a tuned constant.

-- THE BASE RATE, WITHOUT WHICH THE BADGE IS NOISE --------------------------

Measured on the live board: of 83 dissents in the top 250, 63 are OUR OWN MODEL.
So "our model disagrees" is weak evidence and "Draft Sharks disagrees" (3 cases)
is strong. Publishing the flag without the base rate would put a warning on a
quarter of the board and teach Cory to ignore it -- the same failure as the
"Draft Sharks covers 35%" button. Every dissent therefore ships with how often
that source dissents.

REPORT ONLY. Writes public/source_agreement.json.
Run: python3 draft/tools/source_agreement.py
"""
import json
import os
import statistics
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
sys.path.insert(0, os.path.join(ROOT, "draft"))

import draftable_scope as scope_mod  # noqa: E402  -- Cory's scope, not mine

PUB = os.path.join(ROOT, "public")
BOARD = os.path.join(PUB, "draft_data.json")

SOURCES = [("ds", "Draft Sharks"), ("sleeper", "Sleeper"),
           ("own", "our model"), ("fp", "FantasyPros")]


def load_source_ranks():
    """{key: {player_id: pos_rank}} from the per-source boards."""
    out = {}
    for key, _ in SOURCES:
        path = os.path.join(PUB, "board_%s.json" % key)
        if not os.path.exists(path):
            raise SystemExit(
                "  REFUSING: public/board_%s.json is missing. This tool reads "
                "the per-source boards rather than re-ranking anything; "
                "without them there is nothing to compare. Run "
                "draft/tools/rerank_by_source.py first." % key)
        doc = json.load(open(path))
        out[key] = {str(p["player_id"]): p.get("pos_rank")
                    for p in doc["players"]}
    return out


def classify(spread, ranks, baseline):
    """(state, dissenter_key). `ranks` is {source_key: pos_rank}."""
    if len(ranks) < 3:
        return "THIN", None
    if spread <= baseline:
        return "AGREE", None
    items = sorted(ranks.items(), key=lambda kv: kv[1])
    vals = [v for _, v in items]
    gaps = [(vals[i + 1] - vals[i], i) for i in range(len(vals) - 1)]
    biggest, at = max(gaps)
    # One natural break, at an end, accounting for half the spread or more.
    if spread and biggest / float(spread) >= 0.5 and at in (0, len(vals) - 2):
        return "DISSENT", (items[0][0] if at == 0 else items[-1][0])
    return "SPLIT", None


def main():
    board = json.load(open(BOARD))
    SCOPE = scope_mod.load()
    ranks = load_source_ranks()
    by_adp = scope_mod.by_adp(board["players"])
    players = [p for p in by_adp
               if scope_mod.adp_of(p) <= SCOPE["outer"]]

    # Per-player source ranks, and this board's own per-position spread.
    raw, spreads = [], {}
    for p in players:
        pid = str(p.get("player_id"))
        rs = {k: ranks[k].get(pid) for k, _ in SOURCES if ranks[k].get(pid)}
        spread = (max(rs.values()) - min(rs.values())) if len(rs) >= 2 else None
        if spread is not None:
            spreads.setdefault(p.get("position"), []).append(spread)
        raw.append((p, rs, spread))

    baseline = {pos: statistics.median(v) for pos, v in spreads.items()}

    rows = []
    for p, rs, spread in raw:
        state, odd = classify(spread if spread is not None else 0, rs,
                              baseline.get(p.get("position"), 0))
        rows.append({
            "player_id": str(p.get("player_id")),
            "name": p.get("name"),
            "position": p.get("position"),
            "pos_rank": p.get("pos_rank"),
            "adp": scope_mod.adp_of(p),
            "state": state,
            "spread": spread,
            "ranks": rs,
            "dissenter": odd,
        })

    # THE BASE RATE. A dissent is only informative against how often that
    # source dissents at all.
    dissent_n = {k: 0 for k, _ in SOURCES}
    for r in rows:
        if r["dissenter"]:
            dissent_n[r["dissenter"]] += 1
    judged = sum(1 for r in rows if r["state"] in ("AGREE", "DISSENT", "SPLIT"))
    base_rate = {k: (round(100.0 * dissent_n[k] / judged, 1) if judged else None)
                 for k, _ in SOURCES}

    # A dissent from a source that rarely dissents is the interesting one.
    for r in rows:
        r["dissenter_base_rate_pct"] = (
            base_rate.get(r["dissenter"]) if r["dissenter"] else None)

    counts = {}
    for r in rows:
        counts[r["state"]] = counts.get(r["state"], 0) + 1

    doc = {
        "_territory": "TERRITORY: A -- draft/tools/source_agreement.py",
        "_what": "Per-player agreement between the four projection sources, "
                 "measured on POSITIONAL RANK (scale-free) from the per-source "
                 "boards rerank_by_source.py already builds.",
        "_cannot": "THIN means fewer than three sources cover him. It is NOT "
                   "agreement and must never be drawn as agreement.",
        "_why_rank_not_points": "The four sources are not on one scale: median "
                                "ratio to the blend is DS 1.04, FP 1.01, "
                                "Sleeper 0.96, our model 0.79 (p10 0.38). A "
                                "points spread would flag our model for a "
                                "reason that is not about the player.",
        "built_from_board": board.get("built_at"),
        "draftable_scope": SCOPE,
        "sources": {k: lab for k, lab in SOURCES},
        "position_baseline_spread": {k: round(v, 1) for k, v in baseline.items()},
        "dissent_base_rate_pct": base_rate,
        "counts": counts,
        "players": rows,
    }
    out = os.path.join(PUB, "source_agreement.json")
    with open(out, "w") as fh:
        json.dump(doc, fh, separators=(",", ":"))

    print("\n  SOURCE AGREEMENT -- where the four sources agree, and where not\n")
    print("  scope: top %d by ADP (%d players)" % (SCOPE["outer"], len(rows)))
    print("  per-position median spread (this board's own): %s"
          % {k: int(v) for k, v in baseline.items()})
    print()
    for state in ("AGREE", "DISSENT", "SPLIT", "THIN"):
        print("    %-8s %3d" % (state, counts.get(state, 0)))
    print()
    print("  HOW OFTEN EACH SOURCE IS THE LONE DISSENTER:")
    for k, lab in SOURCES:
        print("    %-14s %4d  (%.1f%% of judged players)"
              % (lab, dissent_n[k], base_rate[k] or 0))
    print("\n  ⚠️  A dissent is only as informative as it is rare. Our model "
          "dissenting is\n      routine; Draft Sharks dissenting is not.")
    split = [r for r in rows if r["state"] == "SPLIT"]
    print("\n  NOBODY AGREES (%d) -- the ones worth a second look:" % len(split))
    for r in sorted(split, key=lambda r: -(r["spread"] or 0))[:8]:
        print("    %-22s %-3s %s%-4s spread %-3d  %s"
              % (r["name"][:22], r["position"], r["position"], r["pos_rank"],
                 r["spread"], r["ranks"]))
    print("\n  wrote public/source_agreement.json\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
