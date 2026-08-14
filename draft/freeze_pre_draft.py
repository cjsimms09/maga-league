# TERRITORY: A
"""THE PRE-DRAFT FREEZE — the only irreversible item in the plan.

Cory, 2026-08-14: "This is the ONLY irreversible item. Every other defect can be
fixed in September. This data cannot be captured in September. If draft night
passes without it, 2026 produces zero learning signal and 2027 starts exactly
where 2026 started."

Every check in this repo so far answers "is this number CONSISTENT?" None answers
"was this number RIGHT?" — did the board say a player would be gone by pick 48,
and was he. As the repo stands there will be no record capable of answering that
on 23 August: the board is rebuilt nightly and the artifact is overwritten.

── WHY THIS FREEZES INPUTS AND NOT ONLY OUTPUTS ────────────────────────────

The work order asks for "VONA values per player, BOTH paths (old production, new
comparison)". The new path is Step 5, and Step 5 is gated behind Step 4 being
landed — the capture is blocked on an experiment that is blocked on the capture,
with eight days to the draft.

So this freezes the INPUTS each path consumes — projections, replacement level,
ADP mean AND spread, the keeper slate as applied, the pool at every one of my
picks. Output-only freezing can score exactly the paths that existed on 22
August. Input freezing can score any path, including the VORP one if it lands
late and including ones not yet invented. The old path's VONA is captured too,
because it exists; the new path's is recomputable rather than required.

That removes the circular dependency instead of resolving it, which is the point.

── AND WHY IT HAD TO WAIT FOR THE PICK-8 FIX ──────────────────────────────

A freeze taken on 13 August would have immortalised a board anchored on pick 8
instead of 33 — `applySlot` handed back the three keeper slots as picks I own, so
every availability curve here would have been computed twenty-five slots early
and the calibration curve in 4e would have been scored against them forever.
Input correctness genuinely precedes the freeze; it is not ceremony. This module
therefore REFUSES to freeze a board whose own pick list disagrees with the
keeper-aware one.

── IMMUTABILITY IS ENFORCED, NOT PROMISED ─────────────────────────────────

keepers.json was regenerated on every run and never committed, so a published
board could not be rebuilt from the repo. A freeze that a nightly cron can
overwrite is that failure with a different filename. So:

  * writing over an existing freeze REFUSES — there is no --force,
    because a flag that exists is a flag a cron will eventually pass;
  * the payload carries a sha256 OF ITSELF, and `test_pre_draft_freeze.py`
    recomputes it, so a hand edit after the fact is detectable rather than
    invisible.

Run:  python3 draft/freeze_pre_draft.py
      python3 draft/freeze_pre_draft.py --verify
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "draft"))

import keepers as K  # noqa: E402

ARTIFACT = ROOT / "public" / "draft_data.json"
OUT = ROOT / "draft" / "data" / "pre_draft_freeze_2026.json"

#: Fields a replay needs to recompute ANY valuation, not just the two that exist
#: today. `vorp` and `proj_mean` are the old path's inputs; `replacement` and the
#: positional table are what a VORP-space path needs; `adp`/`adp_sd` are what any
#: survival model needs; the provenance fields are what tells a reader in 2027
#: which denomination they are in.
PLAYER_FIELDS = (
    "player_id", "name", "position", "team", "bye",
    "proj_mean", "proj_sd", "proj_floor", "proj_ceiling", "proj_baseline",
    "vorp", "replacement", "tier", "tier_drop", "pos_rank", "overall_rank",
    "adp", "raw_adp", "adjusted_adp", "adp_sd",
    "adp_source", "adp_sd_source", "adp_season", "adp_stale",
    "games_expected", "injury_status", "age",
    # ⚠️ READ BY THE ENGINE AND NOT FROZEN. Measured by replaying the freeze:
    # removing `depth_chart_order` alone from a live board costs 4 of the top 25
    # under DEFAULT_WEIGHTS. `variance` is read by engine, value, mcts and
    # doctrine; `consensus_rank` and `pool_rank` by keepers.js (keeper option
    # value, a WEIGHT-1 term today); `years_exp` by composite; `tier_size` and
    # `tier_rank` by the war-room surfaces a replay would want to reproduce.
    #
    # None of them moved a score under the shipped weights, which is exactly why
    # they were droppable-looking. The freeze exists to answer "would a
    # DIFFERENT valuation have chosen differently", so "inert under the current
    # weights" is the one argument that cannot justify dropping a field.
    "depth_chart_order", "variance", "consensus_rank", "pool_rank",
    "years_exp", "tier_size", "tier_rank", "weekly_sd",
    # ⚠️ OPPORTUNITY, WITH THE AMBIGUITY THAT COMES WITH IT. Frozen because a
    # September regression of outcomes on `opportunity_z` is one of the things
    # this capture exists to make possible -- and because that regression is
    # exactly where the ambiguity below would bite.
    #
    # `projections.py:236` writes `round(z.get(pid, 0.0), 2)`, so a player
    # absent from the opportunity map scores 0.0 -- indistinguishable from one
    # measured at exactly league average. Counted on this board: 312 of 686 rows
    # are exactly 0.0, of which QB, K and DEF are 100% and CORRECT (opportunity
    # is a receiving metric; not-applicable genuinely is zero). The real cases
    # are 144 RB/WR/TE rows, six of them inside pick 150, and all six are
    # ROOKIES -- no prior-season NFL snaps by construction.
    #
    # NOT A LIVE DEFECT: `opportunity_adj` is 0.0 for every one of them, so the
    # adjustment is inert and no recommendation moves. It is a PROVENANCE gap,
    # and `opportunity_share` is what distinguishes the two cases -- None means
    # no data, a number means measured. Both are frozen so the distinction
    # survives into September instead of being re-derived from memory.
    "opportunity_z", "opportunity_share", "opportunity_adj",
)


def _sha(payload: dict) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _denomination(art: dict) -> dict:
    """THE SCORING GAP, DERIVED FROM BOTH SIDES RATHER THAN ASSERTED.

    Our league scores 6-point passing TDs; every public ADP feed is 4.0 and none
    serves a parameter for it. A reader in 2027 scoring these predictions must
    know the board's projections and its ADP were in DIFFERENT denominations, or
    the calibration curve silently measures that gap instead of the model.
    """
    scoring = (art.get("league") or {}).get("scoring") or {}
    adp_prov = ((art.get("provenance") or {}).get("adp") or {})
    return {
        "league_pass_td": scoring.get("pass_td"),
        "league_pass_int": scoring.get("pass_int"),
        "market_pass_td": 4.0,
        "market_pass_int": -1.0,
        "market_pass_td_basis":
            "every public ADP feed is 4.0 and none serves a parameter for it; "
            "recorded by both sources' format_axes_unmatched on 2026-08-14",
        "per_player_gap_formula": "delta(p) = 2*passTD(p) - INT(p)",
        "adp_primary_source": adp_prov.get("primary_source"),
        "gap_is_closed_form_not_fitted": True,
    }


def _availability(players: list, my_picks: list, board: list) -> dict:
    """P(still on the board) for every player at every pick I own.

    The field 4e's calibration curve is built from: of the players the board
    called 70% available at pick 48, how many were.

    ⚠️ BOTH SIDES MUST BE ON THE SELECTION SCALE, AND THE FIRST CUT OF THIS
    FUNCTION HAD NEITHER OF THEM ON IT.

    It computed `survival_probability(adp, board_pick)` — market ADP, which
    counts selections in a keeperless market, against a BOARD SLOT, which counts
    keeper slots too. Two errors in opposite directions that very nearly
    cancelled on today's board: Josh Allen read 4.6% against a true 4.0%.

    A cancellation is not a correctness argument. It holds only while the board
    carries three keepers; once the slate locks on 20 August it does not, and
    the frozen curves would have been permanently wrong in the artifact whose
    whole purpose is to be the trustworthy record.

    So: `adjusted_adp` (already on the live-selection scale) against
    `live_index_of(board_pick)`. The same pairing survival.js was fixed to use,
    and the one keepers.py has always documented.
    """
    out = {}
    for p in players:
        adp = p.get("adjusted_adp") or p.get("adp")
        if not adp:
            continue
        sd = p.get("adp_sd")
        out[str(p["player_id"])] = {
            str(pick): round(K.survival_probability(
                float(adp), K.live_index_of(int(pick), board), sd), 6)
            for pick in my_picks
        }
    return out


def _slate_status(slate: dict) -> tuple:
    """(status, reason) DERIVED from the keeper slate the board was built with.

    CONFIRMED requires all three, and each rules out a different way of being
    wrong: the lock has actually passed, the importer is willing to call the
    slate truth, and no designation disagrees with a placement. Any one missing
    leaves the freeze a rehearsal, and the reason SAYS WHICH — a freeze that
    says only "provisional" tells whoever reads it in January nothing about
    what it was provisional ABOUT.

    The reason carries the slate's own words rather than a sentence written
    here, so the two cannot drift apart.
    """
    locked = bool(slate.get("keeper_lock_passed"))
    truth = bool(slate.get("safe_to_treat_as_truth"))
    mismatches = list(slate.get("mismatches") or [])
    if locked and truth and not mismatches:
        return ("CONFIRMED",
                "the keeper lock has passed, the importer reports the slate "
                "safe to treat as truth, and no designation disagrees with a "
                "placement (%s/%s teams designated). This freeze is the "
                "grading baseline for the season."
                % (slate.get("teams_designated"), slate.get("teams_expected")))
    missing = []
    if not locked:
        missing.append("the keeper lock has not passed")
    if not truth:
        missing.append("the importer does not yet call the slate truth (%s)"
                       % (slate.get("reason") or "no reason given"))
    if mismatches:
        missing.append("%d designation/placement mismatch(es)" % len(mismatches))
    return ("PROVISIONAL",
            "validated against PREDICTED keeper state: " + "; ".join(missing)
            + ". Cory's 5f: the pre-lock run is a rehearsal. Re-take after the "
            "slate confirms; keepers disproportionately remove RB/WR value, so "
            "divergence between the two runs is evidence about keeper-driven "
            "scarcity, not a regression to chase away.")


def build() -> dict:
    art = json.loads(ARTIFACT.read_text())
    league = art["league"]
    po = art["pick_order"]
    my_picks = list(po["my_picks"])

    # ── THE PICK-8 GUARD. A freeze of a board on the wrong clock is worse than
    #    no freeze: it is a permanent record that looks authoritative. Re-derive
    #    the pick list the keeper-aware way and refuse on disagreement.
    slot = int(league["my_draft_slot"])
    derived = [r["overall"] for r in po["picks"]
               if int(r["slot"]) == slot and not r.get("keeper_slot")]
    if derived != my_picks:
        raise SystemExit(
            "REFUSING TO FREEZE: pick_order.my_picks %s disagrees with the "
            "keeper-aware derivation %s. This is the applySlot defect that had "
            "the board anchored on pick 8 instead of 33; freezing it would "
            "compute every availability curve 25 slots early and the error "
            "would be permanent." % (my_picks[:4], derived[:4]))

    # ── THE LINEUP-SHAPE GUARD. Same standing as the pick-8 guard above.
    #    A freeze without `starters` is not a degraded freeze, it is a permanent
    #    record that looks authoritative and cannot answer the question it was
    #    taken for. Refusing is cheap; discovering it in January is not.
    if not (league.get("starters") or {}):
        raise SystemExit(
            "REFUSING TO FREEZE: league.starters is empty or absent, so the "
            "board has no lineup shape. Every player would replay as bench, "
            "roster legality would never fire, and replacement levels could not "
            "be recomputed — while the artifact still claimed every valuation "
            "path was reproducible from it.")

    players = [{k: p.get(k) for k in PLAYER_FIELDS} for p in art["players"]]

    payload = {
        "season": 2026,
        "source_artifact_built_at": art["built_at"],
        "source_artifact_sha256": hashlib.sha256(ARTIFACT.read_bytes()).hexdigest(),
        # ⚠️ `starters` WAS NEVER CAPTURED, AND `roster` IS NOT A KEY THAT EXISTS.
        #
        # The live league object carries `roster_slots` and `starters`. This
        # asked for `roster`, got None, and never asked for `starters` at all —
        # so the frozen league had NO LINEUP SHAPE. Measured 2026-08-14 by
        # replaying the freeze through the real engine:
        #
        #   MEASURED_WEIGHTS   top-25 identical 25/25, score delta 0.0000
        #   DEFAULT_WEIGHTS    top-25 identical  1/25, score delta 80.4327
        #
        # With `starters` missing, starterSlotMarginal sees {} so EVERY player
        # reads fills:'bench', mandatoryGaps returns nothing, applyRosterLegality
        # never fires, and replacement levels cannot be recomputed.
        #
        # IT WAS INVISIBLE BECAUSE TWO DEFECTS COMPOSED. Under the shipped
        # weights the starter/bench branch is arithmetically inert (measured
        # this morning: 164 of 174 fills-flips produce a byte-identical score),
        # so the missing lineup shape changed nothing anyone would see. The
        # freeze looked perfect precisely while it was unusable for the one
        # question it exists to answer.
        #
        # And that question is the payload's own claim two fields below:
        # "any path consuming proj_mean, replacement, adp, adp_sd — including
        # ... paths not yet designed". A path that reads the lineup shape — which
        # is every roster-aware valuation anyone would try next, starting with
        # re-weighting `need` — was NOT recomputable, and the artifact said it
        # was.
        "league": {k: league.get(k) for k in
                   ("teams", "rounds", "my_draft_slot", "draft_type",
                    "scoring", "roster_slots", "starters", "keeper_rules",
                    "season", "reversal_round")},
        "my_picks": my_picks,
        "pick_order": po,

        # ── 4c: the keeper slate AS ACTUALLY APPLIED ──────────────────────
        # Not what the slate SAID — what the board was built with. The
        # injection test measured these apart: the slate reads "predicted" and
        # the board carries only MY keepers, because _keeper_map_for_board
        # withholds opponents until the slate confirms.
        "keeper_slate_declared": art.get("keeper_slate"),
        "keepers_actually_applied": art.get("kept_players"),
        "keepers_actually_applied_count": len(art.get("kept_players") or []),
        "opponent_keepers_applied": 0,
        "opponent_keepers_applied_basis":
            "test_keeper_injection.py measured this directly: under an "
            "unconfirmed slate kept_player_ids is exactly mine (3), and 17 "
            "under a confirmed one. The board carries NO opponent keepers.",

        # ── 4c: ADP spread values and the denomination in force ───────────
        "denomination": _denomination(art),
        "adp_sd_rule_in_force": {
            "floor": K.ADP_SD_FLOOR, "rate": K.ADP_SD_RATE, "cap": K.ADP_SD_CAP,
            "measured_rate_from_published_dispersion": 0.1083,
            "known_error":
                "the fitted rule measures ~1.20-1.29x published dispersion "
                "across adp 1-150 (n=144). HELD at 0.15 pending source review; "
                "see keepers.py. Anything scored against these curves inherits "
                "that width error and must not read it as model error.",
            "rows_with_published_sd": sum(
                1 for p in art["players"]
                if str(p.get("adp_sd_source") or "").startswith("ffc")),
        },

        "opportunity_ambiguity": {
            "field": "opportunity_z",
            "zero_means": "EITHER measured-at-league-average OR absent from the "
                          "opportunity map. The two are not distinguishable "
                          "from this field alone.",
            "disambiguator": "opportunity_share is None when there was no data",
            "why_it_matters":
                "A September regression of outcomes on opportunity_z that "
                "treats no-data rows as average will bias the coefficient "
                "toward zero. Filter on opportunity_share before fitting.",
            "inert_today":
                "opportunity_adj is 0.0 for every no-data row, so no "
                "recommendation on this board is affected.",
        },

        # ── 4c: replacement level per position ────────────────────────────
        "replacement": art.get("replacement"),

        # ── 4c: VONA per player — the path that EXISTS. See the header for
        #    why the comparison path is recomputable rather than required.
        "valuation_paths_captured": ["old_production"],
        "valuation_paths_recomputable_from_inputs":
            "any path consuming proj_mean, replacement, adp, adp_sd — including "
            "the VORP-space path in Step 5 and paths not yet designed",

        "players": players,
        "availability_by_pick": _availability(art["players"], my_picks, po["picks"]),
        "availability_basis": {
            "adp_field": "adjusted_adp (live-selection scale), falling back to adp",
            "pick_scale": "live_index_of(board_slot) — selections, not board slots",
            "why":
                "adjusted_adp counts SELECTIONS and pick numbers count BOARD "
                "SLOTS. Comparing them directly was a live defect in "
                "survival.js (3 slots of error today, 18 after the 20 August "
                "keeper lock). Both sides here are on the selection scale.",
            "matches_engine": "public/js/draft/survival.js liveIndexOf",
        },

        # ── 5f: THIS IS A REHEARSAL UNTIL THE SLATE LOCKS ─────────────────
        #
        # ⚠️ DERIVED FROM THE SLATE, NOT ASSERTED. This read `"status":
        # "PROVISIONAL"` as a literal, and that had two faults, the second
        # much worse than the first.
        #
        # It is a static assertion about pipeline state, which this project
        # forbids on its own terms. And it made the re-take IMPOSSIBLE TO
        # RECOGNISE: standing_check's freeze alarm escalates while the lock has
        # passed and status != CONFIRMED, so a re-take on 20 August would have
        # produced another PROVISIONAL freeze and left the alarm PERMANENTLY
        # RED. A permanent red gets muted, and a muted alarm is how the real
        # one goes unseen — which is the failure the alarm exists to prevent,
        # reintroduced by the artifact it watches.
        #
        # My own test asserted the alarm CLEARS for a CONFIRMED freeze and
        # never asked whether a CONFIRMED freeze was PRODUCIBLE. It was
        # vacuous in the direction that mattered.
        #
        # THE CONDITION IS THE BOARD'S OWN. safe_to_treat_as_truth is what the
        # importer publishes after checking placements against designations; a
        # second definition here would disagree with the board on the one day
        # it mattered.
        "status": _slate_status(art.get("keeper_slate") or {})[0],
        "status_reason": _slate_status(art.get("keeper_slate") or {})[1],
        "keepers_on_board_at_freeze": sum(
            1 for r in po["picks"] if r.get("keeper_slot")),
    }
    payload["_sha256_of_payload"] = _sha(
        {k: v for k, v in payload.items() if k != "_sha256_of_payload"})
    return payload


def verify() -> int:
    if not OUT.exists():
        print("NO FREEZE: %s does not exist." % OUT.name)
        return 1
    doc = json.loads(OUT.read_text())
    want = doc.get("_sha256_of_payload")
    got = _sha({k: v for k, v in doc.items() if k != "_sha256_of_payload"})
    if want != got:
        print("FREEZE ALTERED since it was written.\n  stamped %s\n  actual  %s"
              % (want, got))
        return 1
    print("freeze intact: %d players, %d picks, built from artifact %s"
          % (len(doc["players"]), len(doc["my_picks"]),
             doc["source_artifact_built_at"]))
    return 0


def main() -> int:
    if "--verify" in sys.argv:
        return verify()
    if OUT.exists():
        # NO --force. A flag that exists is a flag a cron eventually passes, and
        # this file's entire value is that it was written once, before the draft,
        # and never touched again.
        print("REFUSING: %s already exists.\n"
              "  A freeze is written ONCE. If it genuinely must be replaced, "
              "delete it by hand and say why in the commit — an overwrite that "
              "a script can perform is an overwrite a nightly run will perform."
              % OUT.name)
        return 2
    payload = build()
    OUT.write_text(json.dumps(payload, indent=1, sort_keys=True))
    print("froze %d players x %d picks -> %s"
          % (len(payload["players"]), len(payload["my_picks"]), OUT.name))
    print("payload sha256: %s" % payload["_sha256_of_payload"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
