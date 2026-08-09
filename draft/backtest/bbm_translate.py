#!/usr/bin/env python3
"""BBM TRANSLATION LAYER — external best-ball data, re-scored to OUR rules.

The reason this exists: our league gives us 3 seasons and ~41 of Cory's draft
decisions, so every league experiment comes back thin. Underdog Best Ball Mania is
the largest outcome-labeled draft dataset in fantasy (millions of entries), so it
breaks the sample ceiling — but it is a DIFFERENT game, and a foreign number used
raw is noise. This module is the wall every BBM finding must cross: **nothing enters
an analysis without being re-scored to our rules, and every finding carries the
differences that cannot be translated away.** (Spec: docs/queued/bbm-ingestion.md.)

THE WEIGHTING RULE (kept honest here in code): league-specific evidence is PRIMARY;
BBM re-scored is SUPPORTING — it raises or lowers confidence in a thin league result
and settles questions our n cannot, but never overrides a league finding it
contradicts. Every finding is tagged with its source tier. Where the two agree,
confidence rises; where they disagree, THAT is a finding (our league is unusual, and
unusual is where edges live).

WHAT IS PURE + HERE (sandbox-testable, verified before we trust it):
  * the re-scoring VERIFICATION — prove our engine turns a known raw stat line into
    the known our-rules points, so a mis-scored season can never silently corrupt a
    finding (the spec's "verified against a known case before trusting anything");
  * the SPIKE-WEEK instrument — the count of weeks a player cleared a weekly-high-class
    bar, the ceiling/distribution signal our 37.5%-of-the-pot weekly-high economy
    actually rewards (grade by spike COUNT, not mean — the thing the league ignores);
  * the WINNING-ROSTER POSITIONAL SHAPE — the count-by-position shape of top-percentile
    rosters, the construction question exp 34 located the money leak in;
  * the CAVEAT WALL — the untranslatable differences, attached to every finding.

WHAT IS DEFERRED TO CI (egress + size): fetching the Underdog GCS CSVs and the
player-id crosswalk. Those feed the pure functions here; the Lab workflow is the home
for the fetch, same as the draft-replay bridge.

Pure core unit-tested in draft/tests/test_bbm_translate.py.
"""
from __future__ import annotations
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))   # draft/ on path for scoring
sys.path.insert(0, str(HERE))          # draft/backtest/ on path for money_grade
import scoring as SC                    # noqa: E402  the certified re-scoring engine

# The differences that CANNOT be translated away — they travel with every BBM finding.
# A finding that depends on one of these dimensions does NOT cross the wall.
CAVEAT_WALL = {
    "no_lineup_setting": ("best ball auto-starts the optimal lineup — it has NO lineup "
                          "dimension, so it cannot speak to our weekly-high efficiency edge "
                          "(which depends on setting lineups). Construction, yes; execution, no."),
    "team_size": "BBM is 12-team; we are 10-team. Their replacement level and scarcity are deeper.",
    "rounds_keepers": "BBM is 18 rounds, no keepers; we are 15 rounds with keepers.",
    "economics": ("BBM pays advance-rate (a tournament ladder); we pay weekly-high + "
                  "regular-season + a resimulated H2H bracket. Advance-rate ~ our high-pool + "
                  "entry blend, NOT our full economy."),
    "scoring_is_bbm": ("the pick-by-pick dumps carry BBM-SCORED points (half-PPR, 4-pt "
                       "passing TD), not raw stat lines — so they cannot be re-scored to our "
                       "6-pt passing TD. Ranking rosters by BBM points is robust for POSITIONAL "
                       "SHAPE (a 4-vs-6 pt QB shift barely reorders 18-man best-ball rosters), "
                       "but a finding that turns on absolute QB value does NOT cross the wall."),
}
SOURCE_TIER_LEAGUE = "league-primary"
SOURCE_TIER_BBM = "bbm-supporting"      # re-scored, translated, weighted below league data


# ─────────────────────────────────────── re-scoring VERIFICATION (the gate) ──
def rescore(stat_line: dict, scoring_cfg: dict) -> float:
    """Re-score ONE raw stat line under OUR scoring config. Thin wrapper over the
    certified engine so the whole translation layer scores identically to the grader."""
    return round(SC.score_stat_line(stat_line, scoring_cfg), 2)


def verify_rescoring(cases: list[dict], scoring_cfg: dict, tol: float = 0.01) -> dict:
    """Prove the re-scoring is right BEFORE trusting anything built on it. Each case:
    {stat_line, expected} where `expected` is the independently-known our-rules points.
    Returns {ok, n, worst_diff, failures}; a caller must not proceed on ok=False."""
    failures, worst = [], 0.0
    for c in cases:
        got = rescore(c["stat_line"], scoring_cfg)
        diff = abs(got - c["expected"])
        worst = max(worst, diff)
        if diff > tol:
            failures.append({"case": c.get("name", ""), "got": got, "expected": c["expected"], "diff": round(diff, 3)})
    return {"ok": not failures, "n": len(cases), "worst_diff": round(worst, 3), "failures": failures}


# ─────────────────────────────────────────── the SPIKE-WEEK instrument ──
def weekly_high_bar(history: dict | None = None, seasons: list[str] | None = None,
                    quantile: float = 0.5) -> float:
    """The spike-week bar, DERIVED from the harvested weekly-high winning scores, not
    a round number. The score that actually WINS a weekly-high IS the bar a ceiling
    week has to clear — so the bar is a measurement, not a constant
    (DERIVED-VS-DECLARED-AUDIT.md). Default = the median winning score (~148.5 on the
    three real seasons); `quantile` lets a caller ask for a TYPICAL win (0.5) vs a
    monster week (e.g. 0.9). Reads money_grade.weekly_high_threshold_distribution so
    the bar recomputes as seasons accrue — never hand-set. Raises rather than falling
    back to a magic number if the harvest has no winning scores to derive from."""
    import money_grade as MG
    h = history if history is not None else MG.load_history()
    if seasons is None:
        seasons = [str(s.get("season")) for s in (h.get("seasons") or [])]
    dist = MG.weekly_high_threshold_distribution(h, seasons)
    samples = dist["samples"]
    if not samples:
        raise ValueError("no harvested weekly-high scores to derive the spike-week bar from")
    if abs(quantile - 0.5) < 1e-9:
        return dist["median"]
    idx = min(len(samples) - 1, max(0, int(round(quantile * (len(samples) - 1)))))
    return samples[idx]


def spike_weeks(weekly_points: list[float], bar: float) -> int:
    """How many weeks a player cleared a weekly-high-class bar — the ceiling signal our
    37.5%-of-the-pot weekly-high pool rewards. Graded by COUNT, not mean, on purpose:
    a player who posts three monster weeks and is otherwise quiet wins weekly-highs a
    steady 15-a-week player never does, and the mean hides exactly that shape."""
    return sum(1 for p in weekly_points if p is not None and p >= bar)


def roster_spike_count(roster_weekly: dict[str, list[float]], bar: float) -> int:
    """Total spike weeks a roster's players deliver (the roster's ceiling supply)."""
    return sum(spike_weeks(w, bar) for w in roster_weekly.values())


# ─────────────────────────────────── winning-roster POSITIONAL SHAPE ──
def positional_shape(roster_ids: list[str], pos_by_id: dict[str, str]) -> dict[str, int]:
    """The count-by-position shape of one roster (RB/WR/TE/QB/K/DEF)."""
    out: dict[str, int] = {}
    for pid in roster_ids:
        pos = pos_by_id.get(str(pid))
        if pos:
            out[pos] = out.get(pos, 0) + 1
    return out


def winning_shape(rosters: list[dict], pos_by_id: dict[str, str], top_frac: float = 0.10) -> dict:
    """Mean positional shape of the TOP-`top_frac` rosters by outcome vs the field.
    `rosters`: [{ids: [player_id...], outcome: float}] (outcome = advance-rate/finish).
    The construction question with real power: what shape do winners actually have,
    and how does it differ from everyone's? Returns the winner shape, field shape, and
    the per-position delta — the thing to translate to our 15-round keeper format."""
    graded = [r for r in rosters if r.get("outcome") is not None]
    if not graded:
        return {"n": 0}
    graded.sort(key=lambda r: -r["outcome"])
    k = max(1, int(round(len(graded) * top_frac)))
    winners, field = graded[:k], graded
    def mean_shape(rs):
        agg: dict[str, float] = {}
        for r in rs:
            for pos, n in positional_shape(r["ids"], pos_by_id).items():
                agg[pos] = agg.get(pos, 0.0) + n
        return {pos: round(v / len(rs), 3) for pos, v in agg.items()}
    ws, fs = mean_shape(winners), mean_shape(field)
    delta = {pos: round(ws.get(pos, 0) - fs.get(pos, 0), 3) for pos in set(ws) | set(fs)}
    return {"n": len(graded), "n_winners": k, "winner_shape": ws, "field_shape": fs,
            "winner_minus_field": delta}


# ─────────────────────────────────────────────── the source-tier tag ──
def bbm_finding(value, note: str, *, depends_on: list[str] | None = None) -> dict:
    """Wrap a BBM-derived value so it can never surface unlabelled. Carries the source
    tier and the caveats it depends on; if it depends on an untranslatable dimension,
    it is flagged as NOT crossing the wall."""
    depends_on = depends_on or []
    blocked = [d for d in depends_on if d in CAVEAT_WALL and d == "no_lineup_setting"]
    return {
        "value": value, "note": note, "source_tier": SOURCE_TIER_BBM,
        "label": "BBM-derived, translated",
        "caveats": {d: CAVEAT_WALL[d] for d in depends_on if d in CAVEAT_WALL},
        "crosses_wall": not blocked,
        "weighting": ("SUPPORTING — raises/lowers confidence in a league result and settles "
                      "what our n cannot; never overrides a contradicting league finding."),
    }


def combine_tiers(league: dict, bbm: dict, transferability: float | None = None) -> dict:
    """DERIVED combination — the weight is computed from precision × measured
    transferability, NOT a fixed tier (see evidence_weight.py). `league`/`bbm` each carry
    {estimate, se, n} (se from the finding's own CI via evidence_weight.se_from_ci) and a
    `direction`. The weighting is dynamic: as our league accumulates seasons its se tightens
    and its weight rises automatically; BBM's weight follows whether it actually predicts our
    outcomes. Agreement raises confidence; disagreement is itself a finding.

    Backward-compatible: if only `direction` is supplied (no se), it falls back to the old
    tier language but FLAGS that the weight is undetermined — a reminder to feed it real
    intervals rather than let the static version stand."""
    import evidence_weight as EW
    ld, bd = league.get("direction", 0), bbm.get("direction", 0)
    have_precision = league.get("se") is not None or bbm.get("se") is not None
    combined = (EW.combine(league, bbm, transferability=transferability) if have_precision
                else {"weights": None, "dominant": "undetermined",
                      "transferability_is_placeholder": transferability is None})
    if ld == 0:
        state = "league inconclusive — BBM proposes a hypothesis to test on our data, does not settle it"
    elif bd == 0:
        state = "league stands alone; BBM could not speak to it"
    elif ld == bd:
        state = "AGREE — confidence up (weighted by precision × measured transferability, not a fixed tier)"
    else:
        state = ("DISAGREE — a finding in itself: our league behaves unlike the field here, and "
                 "unusual is where edges live. The derived weight decides how much each speaks; "
                 "as our n grows our side wins automatically.")
    out = {"league_direction": ld, "bbm_direction": bd, "state": state,
           "weights": combined.get("weights"), "dominant": combined.get("dominant"),
           "transferability_is_placeholder": combined.get("transferability_is_placeholder")}
    if not have_precision:
        out["warning"] = ("no intervals supplied — weight is UNDETERMINED, not the old static tier. "
                          "Feed {estimate, se, n} so the weight derives itself (evidence_weight.py).")
    return out
