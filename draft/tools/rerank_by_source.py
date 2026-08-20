# TERRITORY: A
"""WHAT WOULD THE BOARD LOOK LIKE IF ONE SOURCE WERE RIGHT?

Cory, 2026-08-20: "And the board will rearrange based of the source I select?
Ie it will change rankings, VONA, recommended player, etc because the source of
data will change"

The toggle I shipped first did NOT do that -- it showed each source's numbers
beside the blend and left the ranking alone. That is half a feature, and he was
right to ask. This is the other half.

-- WHY THIS IS PYTHON AND NOT A FEW LINES OF JAVASCRIPT ----------------------

Because `vorp` and `tier` are computed HERE, in the build (build.py calls
vorp.apply_vorp then vorp.assign_tiers), and engine.js consumes them: 47
references to proj_mean, 78 to tier, 34 to vorp, 17 to proj_ceiling. Re-ranking
in the browser would mean a SECOND implementation of replacement level and
tiering, which is exactly the defect this project keeps paying for -- register
148 is two replacement tables that disagree by 2x at RB and WR. So the
alternate boards are produced by calling THE SAME FUNCTIONS the real board uses.
One derivation, reused (rule 11).

-- THE COVERAGE PROBLEM, AND WHY IT IS SMALLER THAN I FIRST SAID -------------

A player with no projection from a source cannot be ranked by it. I nearly
refused to build this on the grounds that Draft Sharks covers "only 35%" of the
board. That number is true and it is MISLEADING, which is rule 3i exactly:
across all 700 players DS covers 35%, but inside the range Cory actually drafts
it covers 99% of the top 150 and 94% of the top 200. The missing two thirds are
deep bench nobody takes. Measured before building rather than asserted after.

Which depth "the range Cory actually drafts" MEANS is no longer decided here.
Cory ruled it 2026-08-20 ("We really just need to focus on top 200 players maybe
250") and it lives in league_config.draftable_scope, read via
draft/draftable_scope.py -- the same block build.py puts on the board for the
client. Coverage is reported at every depth, all-700 included and labelled, so
nobody can quote one number as though it were the only one.

Players the source does not carry are DROPPED from that source's board and
COUNTED AND NAMED in its header -- never silently, and never with a zero, which
would rank them last and look like a judgement instead of an absence.

REPORT ONLY. Writes public/board_<key>.json per source.
Run: python3 draft/tools/rerank_by_source.py
"""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
sys.path.insert(0, os.path.join(ROOT, "draft"))

import vorp as vorp_mod  # noqa: E402  -- THE SAME MODULE build.py USES
import draftable_scope as scope_mod  # noqa: E402  -- Cory's scope, not mine

PUB = os.path.join(ROOT, "public")
BOARD_PATH = os.path.join(PUB, "draft_data.json")

# key -> (field, label). `blend` is deliberately absent: it IS draft_data.json,
# and emitting a copy would create a second file that can drift from the board.
SOURCES = {
    "ds": ("proj_ds", "Draft Sharks"),
    "sleeper": ("proj_sleeper", "Sleeper"),
    "own": ("proj_ownmodel", "our model"),
    "fp": ("proj_fantasypros", "FantasyPros"),
}


def main():
    board = json.load(open(BOARD_PATH))
    cfg = {"teams": 10, "starters": board["league"]["starters"]}
    # Cory's scope ruling, read -- not a cutoff chosen here. This used to be a
    # bare `[:150]` on the next-but-one line, which is how three tools ended up
    # measuring three different boards.
    SCOPE = scope_mod.load()
    DEPTHS = scope_mod.depths()
    by_adp = scope_mod.by_adp(board["players"])
    written = []

    for key, (field, label) in SOURCES.items():
        players = [dict(p) for p in board["players"]
                   if isinstance(p.get(field), (int, float))]
        dropped = [p for p in board["players"]
                   if not isinstance(p.get(field), (int, float))]

        # THE SWAP. Everything downstream keys off proj_mean, so this is the one
        # place the source enters -- and the ORIGINAL blend value is kept beside
        # it so the panel can always show what changed.
        for p in players:
            p["proj_blend"] = p.get("proj_mean")
            p["proj_mean"] = float(p[field])

        players, diag = vorp_mod.apply_vorp(players, cfg)
        players = vorp_mod.assign_tiers(players)

        players.sort(key=lambda p: (p.get("position") in vorp_mod.ONESIE_POSITIONS,
                                    -(p.get("vorp") if p.get("vorp") is not None else -1e9)))
        for i, p in enumerate(players, start=1):
            p["overall_rank"] = i
        seen = {}
        for p in players:
            q = p.get("position")
            seen[q] = seen.get(q, 0) + 1
            p["pos_rank"] = seen[q]

        # COVERAGE AT EVERY DEPTH CORY NAMED, NOT ONE I PICKED. The all-700
        # number is emitted last and labelled, because on its own it is the
        # number that made Draft Sharks look broken (35%) when in the 200
        # players he drafts from it is at 94%.
        def _cov(n):
            sub = by_adp[:n]
            hit = [p for p in sub if isinstance(p.get(field), (int, float))]
            return {
                "depth": n,
                "of": len(sub),
                "covered": len(hit),
                "pct": round(100.0 * len(hit) / len(sub), 1) if sub else None,
                "missing": sorted(
                    p.get("name") for p in sub
                    if not isinstance(p.get(field), (int, float))),
            }

        coverage = {label: _cov(n) for label, n in DEPTHS}
        coverage["all"] = _cov(len(board["players"]))
        headline = _cov(SCOPE["focus"])

        doc = {
            "_territory": "TERRITORY: A -- draft/tools/rerank_by_source.py",
            "_what": "The board re-ranked as if %s were the only projection "
                     "source. vorp and tier recomputed by the SAME functions "
                     "build.py uses, never a second implementation." % label,
            "_cannot": "A player this source does not project is ABSENT, not "
                       "bad. Never read a short list as a verdict.",
            "source_key": key,
            "source_field": field,
            "source_label": label,
            "built_from_board": board.get("built_at"),
            "board_post_processed": board.get("post_processed_at"),
            "players_ranked": len(players),
            "players_dropped": len(dropped),
            # THE SCOPE BLOCK, SHIPPED WITH THE NUMBERS IT SCOPED, so a reader
            # never has to ask "top what?" and a stale artifact cannot be read
            # against a newer ruling without the mismatch being visible.
            "draftable_scope": SCOPE,
            "coverage": coverage,
            "coverage_headline": headline,
            # LEGACY KEYS, still populated. public/board_*.json is regenerated
            # from the board rather than from itself, so there is no long-lived
            # skew -- but the deployed client is only replaced on a deploy, and
            # an older one reading a newer artifact must not silently lose the
            # coverage caveat. Removed once the deployed app.js no longer reads
            # them; draftable_scope_is_one_definition.test.js watches for that.
            "coverage_top150_pct": coverage[
                "top %d" % SCOPE["drafted"]]["pct"],
            "dropped_inside_top150": coverage[
                "top %d" % SCOPE["drafted"]]["missing"],
            "replacement_points": diag.get("replacement_points"),
            "starter_counts": diag.get("starter_counts"),
            "league": board["league"],
            "players": players,
        }
        out = os.path.join(PUB, "board_%s.json" % key)
        with open(out, "w") as fh:
            json.dump(doc, fh, separators=(",", ":"))
        written.append((key, label, len(players), len(dropped), coverage, headline))

    print("\n  ALTERNATE BOARDS -- what if one source were right?\n")
    print("  Cory's scope: \"%s\"" % SCOPE["cory_ruling_verbatim"])
    print("  drafted %d (teams x rounds) | focus %d | outer %d\n"
          % (SCOPE["drafted"], SCOPE["focus"], SCOPE["outer"]))
    cols = [lbl for lbl, _ in DEPTHS] + ["all"]
    print("  %-14s %7s %8s   %s"
          % ("source", "ranked", "dropped", "  ".join("%8s" % c for c in cols)))
    for key, label, n, d, cov, head in written:
        cells = "  ".join("%7.0f%%" % cov[c]["pct"] for c in cols)
        print("  %-14s %7d %8d   %s" % (label, n, d, cells))
    print()
    for key, label, n, d, cov, head in written:
        if head["missing"]:
            print("  %s does not project %d of your top %d: %s"
                  % (label, len(head["missing"]), head["depth"],
                     ", ".join(head["missing"][:6])))
    print("\n  wrote %d alternate boards to public/" % len(written))


if __name__ == "__main__":
    main()
