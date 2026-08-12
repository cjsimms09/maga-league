# TERRITORY: C
"""C-001 AND C-003, RE-DERIVABLE. The runner that should have existed from the start.

WHY THIS FILE EXISTS, and it is not a tidiness argument.

Both persistence results were computed by ad-hoc scripts that were never committed.
C-001 stood for a day with a contamination that took ten minutes to find once anyone
looked — **and nobody could look, because reproducing the number meant rewriting the
analysis first.** An unreproducible finding is not a finding that happens to lack a
script; it is a finding whose only evidence is that someone says they ran it.

THE CONTAMINATION C-001 CARRIED, since this module's defaults encode the lesson:
keepers were counted as draft picks. Every keeper in this league lands in rounds 1-3
and keepers are 40.6% of all picks in rounds 1-5, which is the window `RB_share5`
measures. A kept player repeats BY CONSTRUCTION, so including them manufactures the
persistence the metric exists to detect. `persistence.tendencies` now excludes them by
default and `draft_side()` does not offer a way to include them silently.

C-003 WAS AUDITED THE SAME WAY AND SURVIVED. 289 of 1,091 transactions are failed
waiver claims — 26.5%, all of them waivers, and the per-owner failure rate runs 10% to
46%, so it is a live component of `waiver_share` rather than a rounding detail.
Recomputed on completed rows only, all three metrics still clear Bonferroni:

    txn_count      0.603 (p=0.0123)  ->  0.661 (p=0.0021)
    waiver_share   0.760 (p=0.0000)  ->  0.718 (p=0.0003)
    median_hour    0.684 (p=0.0020)  ->  0.626 (p=0.0078)

So `completed_only` is exposed as a parameter and defaults to False — the published
arm — because unlike a keeper, a failed claim IS an action the manager took. The
argument against including it is that whether a claim fails depends on OTHER managers'
bids, which makes the metric partly a property of the room. Both arms are reported so
the reader is not asked to take either framing on trust.

WHAT THIS DOES NOT SETTLE. `median_hour` did not replicate: this reconstruction gives
0.684 where the ledger records 0.535. `txn_count` matches exactly (0.603) and
`waiver_share` to within 0.006, so the disagreement is specific to the hour-of-week
derivation — most likely a timezone or bucketing choice in the original that was never
written down. **It is recorded as unreplicated rather than quietly overwritten**, and
that is precisely the cost of the ad-hoc script this file replaces.

NOT A SCAN AND NOT A DASHBOARD. Two functions and a `run()`. Rule 9.
"""
import collections
import datetime
import json
import statistics
from pathlib import Path

import persistence as P

HISTORY = "draft/data/league_history.json"
IN_SEASON_METRICS = ("txn_count", "waiver_share", "median_hour")


def load(path=HISTORY) -> dict:
    """{season: {"picks": [...], "transactions": [...]}} — seasons with no data omitted.

    Transactions arrive as a DICT keyed by week in this archive and as a list in
    others, so both are accepted. A season whose transactions are an empty dict is
    dropped rather than counted as a season with zero activity: absent is not zero,
    and 2026 has not been played.
    """
    doc = json.loads(Path(path).read_text())
    out = {}
    for s in doc.get("seasons") or []:
        picks = [p for dr in (s.get("drafts") or []) for p in (dr.get("picks") or [])]
        raw = s.get("transactions")
        txns = []
        if isinstance(raw, dict):
            for v in raw.values():
                txns += v if isinstance(v, list) else [v]
        elif isinstance(raw, list):
            txns = list(raw)
        txns = [x for x in txns if isinstance(x, dict)]
        if picks or txns:
            out[str(s.get("season"))] = {"picks": picks, "transactions": txns}
    return out


def draft_side(seasons, positions) -> dict:
    """{metric: {owner: [value per season]}} for the six drafting tendencies.

    Keepers are excluded, with no parameter to include them. `persistence.tendencies`
    can be called directly for the different question "how much of your early ROSTER is
    RB"; what this function computes is DRAFTING, and a keeper is settled before the
    draft starts.
    """
    by_metric = {m: {} for m in P.METRICS}
    for season in sorted(seasons):
        picks = seasons[season].get("picks") or []
        if not picks:
            continue
        for rid, vals in P.tendencies(picks, positions, exclude_keepers=True).items():
            for m in P.METRICS:
                if vals.get(m) is not None:
                    by_metric[m].setdefault(rid, []).append(vals[m])
    return {m: {r: v for r, v in d.items() if len(v) >= 2} for m, d in by_metric.items()}


def _hour_of_week(created_ms):
    """UTC weekday*24 + hour. UTC is STATED rather than assumed, because it is the one
    choice in this file that the original analysis and this one may not share — see the
    module note on `median_hour` failing to replicate."""
    dt = datetime.datetime.utcfromtimestamp(created_ms / 1000.0)
    return dt.weekday() * 24 + dt.hour


def in_season(seasons, completed_only=False) -> dict:
    """{metric: {owner: [value per season]}} for the three in-season behaviours.

    A trade carries two roster_ids; it is attributed to the first, which is how the
    published arm counted it. Six trades in 1,091 rows, so the choice is recorded
    rather than defended.
    """
    by_metric = {m: {} for m in IN_SEASON_METRICS}
    for season in sorted(seasons):
        txns = seasons[season].get("transactions") or []
        if completed_only:
            txns = [x for x in txns if x.get("status") == "complete"]
        per = collections.defaultdict(lambda: {"n": 0, "w": 0, "fa": 0, "hrs": []})
        for x in txns:
            rid = (x.get("roster_ids") or [None])[0]
            if rid is None:
                continue
            p = per[rid]
            p["n"] += 1
            if x.get("type") == "waiver":
                p["w"] += 1
            elif x.get("type") == "free_agent":
                p["fa"] += 1
            if x.get("created"):
                p["hrs"].append(_hour_of_week(x["created"]))
        for rid, p in per.items():
            den = p["w"] + p["fa"]
            vals = {"txn_count": p["n"],
                    # None, not 0.0 — an owner with no waiver-or-FA activity has no
                    # share to measure, and 0.0 would enter the variance as a value.
                    "waiver_share": (p["w"] / den) if den else None,
                    "median_hour": statistics.median(p["hrs"]) if p["hrs"] else None}
            for m in IN_SEASON_METRICS:
                if vals[m] is not None:
                    by_metric[m].setdefault(rid, []).append(vals[m])
    return {m: {r: v for r, v in d.items() if len(v) >= 2} for m, d in by_metric.items()}


def score(by_metric, reps=20000) -> dict:
    """ICC and permutation p per metric, plus the pooled joint test."""
    out = {}
    for m, vals in by_metric.items():
        if len(vals) < 3:
            out[m] = {"icc": None, "p": None, "owners": len(vals), "why": "too_thin"}
            continue
        obs, p = P.permutation_p(vals, reps=reps)
        out[m] = {"icc": obs, "p": p, "owners": len(vals)}
    pooled_icc, pooled_p = P.pooled_p(by_metric, reps=reps)
    return {"version": P.VERSION, "metrics": out,
            "pooled": {"mean_icc": pooled_icc, "p": pooled_p},
            "bonferroni": 0.05 / max(1, len(by_metric))}


def run(path=HISTORY, positions=None, reps=20000) -> dict:
    """Both halves, both arms of the in-season one. Returns; prints nothing."""
    seasons = load(path)
    out = {"seasons": sorted(seasons),
           "in_season_published_arm": score(in_season(seasons, False), reps),
           "in_season_completed_only": score(in_season(seasons, True), reps)}
    if positions:
        out["draft_side_keepers_excluded"] = score(draft_side(seasons, positions), reps)
    return out
