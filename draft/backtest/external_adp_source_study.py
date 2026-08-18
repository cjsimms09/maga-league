# TERRITORY: C
"""ADP SOURCE STUDY — the matched-population join, per `ADP-SOURCE-2026-PREREG.md`.

Builds the population `draft/backtest/ADP-SOURCE-2026-PREREG.md` grades, and
attaches each arm's rank per player. It does NOT compute MAE, Spearman,
survival accuracy, or the decision rule — that is the study's grading half and
it belongs to whoever owns what the numbers mean, per the prereg's own line:
"You do not have to design any of that. You own getting the rows right."

GATE 1 IS ALREADY MET, ON DISK, NO FETCH NEEDED FOR THE POPULATION ITSELF.
`draft/data/league_history.json` → `seasons[].drafts[].picks` carries 2023,
2024 and 2025 at 150 picks each, with `round`, `pick_no` (the OVERALL 1-150
pick, confirmed by reading it: round boundaries fall exactly at pick_no
multiples of 10), `roster_id`, `player_id`, `is_keeper`. Only the FFC and
FantasyPros ARMS need the network, and `external_adp_historical.py` already
fetches those — this module reads its output, it does not re-fetch.

THE TWO TRAPS THE PREREG NAMES, HANDLED HERE:

  (a) KEEPERS. 2025 carries 20 keeper picks, 2024 carries 23 — grading a
      source on a slot a keeper rule pre-assigned measures the keeper rule,
      not the source. Excluded from the graded population; the count dropped
      is reported per season, not silently absorbed into a smaller n.

  (b) 2023 CARRIES TWO DRAFTS. `1001232801791856640` (150 picks, the real
      season) and `990840142107619329` (30 picks, `is_keeper: true` on every
      row — a keeper/startup event). `select_draft` prefers the larger draft
      and records both draft_ids and both pick counts, so a reader can see the
      choice rather than trust it silently.

A THIRD TRAP THE PREREG NAMES THAT ISN'T A SEASON PROBLEM: Sleeper
`search_rank` is a CURRENT field with no history. Substituting today's ranks
onto a 2023 draft would leak three years of hindsight into the arm the board
actually uses below pick 150. This module never fetches it for a historical
season — the SLEEPER arm is `UNAVAILABLE` everywhere here, structurally, by
construction, not because a fetch failed.

AND ONE THIS MODULE FOUND WHILE BUILDING IT, NOT NAMED IN THE PREREG:
`LAST_YEAR` needs the PRIOR season's draft, and there is no 2022 season in
`league_history.json` — the earliest is 2023. So `LAST_YEAR` is
`UNAVAILABLE` for the 2023 population specifically (nothing to compare
against), present for 2024 (vs 2023's real order) and 2025 (vs 2024's).

Run: python3 draft/backtest/external_adp_source_study.py
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
LEAGUE_HISTORY = HERE.parent / "data" / "league_history.json"
ADP_HISTORICAL = HERE / "external_adp_historical.json"
OUT = HERE / "external_adp_source_study.json"

SEASONS = (2023, 2024, 2025)
ARMS = ("ffc", "fp", "sleeper", "blend50", "last_year")

#: Below this fraction of the matched population, an arm is PARTIAL and
#: cannot win — the prereg's own bar, stated here rather than re-derived.
MIN_COVERAGE = 0.90


def select_draft(drafts: list) -> tuple[dict | None, dict]:
    """Which of a season's draft(s) is the real, graded event.

    ⚠ THE RULE IS "MOST PICKS", NOT "150" — a literal 150 would silently stop
    matching the moment a season's slate size changes (a bye week, a paused
    draft, a future expansion), and would have no reason to prefer the real
    draft over the startup one if that one ever happened to also carry 150
    rows. Size-relative is the rule that generalises; both counts are recorded
    either way so a reader never has to trust the choice blind.
    """
    real = [d for d in (drafts or []) if isinstance(d, dict) and d.get("picks")]
    if not real:
        return None, {"drafts_seen": 0, "reason": "no draft with picks on record"}
    chosen = max(real, key=lambda d: len(d["picks"]))
    diag = {
        "drafts_seen": len(real),
        "chosen_draft_id": chosen.get("draft_id"),
        "chosen_picks": len(chosen["picks"]),
        "other_draft_ids": [{"draft_id": d.get("draft_id"), "picks": len(d["picks"])}
                            for d in real if d is not chosen],
    }
    return chosen, diag


def non_keeper_picks(picks: list) -> tuple[list, int]:
    """`is_keeper` is `True` or `None` in the real data, never `False` —
    treat anything truthy as a keeper and everything else as draftable."""
    kept = [p for p in (picks or []) if not p.get("is_keeper")]
    dropped = len(picks or []) - len(kept)
    return kept, dropped


def _rank_lookup(arm_doc: dict | None) -> dict[str, float]:
    """{player_id: adp} out of one `external_adp_historical.py` arm entry, or
    {} if that arm did not capture — never raises on a VOID or missing arm."""
    if not isinstance(arm_doc, dict) or arm_doc.get("status") != "captured":
        return {}
    rows = arm_doc.get("rows") or {}
    return {str(pid): float(r["adp"]) for pid, r in rows.items()
           if isinstance(r, dict) and "adp" in r}


def _last_year_lookup(prior_picks: list | None) -> dict[str, int]:
    """{player_id: pick_no} from the FULL prior-season draft, keepers
    included. LAST_YEAR asks "where did this player actually go last time",
    and a keeper pick is still a real historical pick number — it is only
    THIS season's keeper slots that no market source is trying to predict."""
    out = {}
    for p in (prior_picks or []):
        pid = p.get("player_id")
        if pid is not None and p.get("pick_no") is not None:
            out[str(pid)] = int(p["pick_no"])
    return out


def build_population(season: int, picks: list, ffc_arm: dict | None,
                     fp_arm: dict | None, prior_picks: list | None) -> dict:
    """PURE. One season's matched population: every non-keeper drafted
    player, with every arm's rank attached where available."""
    kept, dropped = non_keeper_picks(picks)
    ffc = _rank_lookup(ffc_arm)
    fp = _rank_lookup(fp_arm)
    last_year = _last_year_lookup(prior_picks) if prior_picks is not None else None

    players = {}
    for p in kept:
        pid = str(p.get("player_id"))
        entry = {
            "actual_pick": p.get("pick_no"), "round": p.get("round"),
            "ffc": ffc.get(pid), "fp": fp.get(pid),
            # SLEEPER IS STRUCTURALLY UNAVAILABLE, NOT MISSING. No historical
            # search_rank exists to look up — this is not a lookup miss.
            "sleeper": None,
            "last_year": (last_year.get(pid) if last_year is not None else None),
        }
        avail = [v for v in (entry["ffc"], entry["fp"]) if v is not None]
        entry["blend50"] = round(sum(avail) / len(avail), 3) if avail else None
        players[pid] = entry

    n = len(players)
    coverage = {}
    for arm in ARMS:
        if arm == "last_year" and last_year is None:
            coverage[arm] = {"status": "UNAVAILABLE",
                             "reason": "no prior season on record"}
            continue
        if arm == "sleeper":
            coverage[arm] = {"status": "UNAVAILABLE",
                             "reason": "search_rank has no history; never "
                                       "fetched for a historical season"}
            continue
        have = sum(1 for e in players.values() if e.get(arm) is not None)
        frac = (have / n) if n else 0.0
        coverage[arm] = {"status": ("PARTIAL" if frac < MIN_COVERAGE else "OK"),
                         "covered": have, "of": n, "fraction": round(frac, 4)}

    return {
        "season": season, "graded_population": n,
        "keeper_picks_dropped": dropped,
        "total_picks_on_record": len(picks or []),
        "coverage": coverage, "players": players,
    }


def fetch_and_build() -> dict:  # pragma: no cover  (reads committed files; CI verifies freshness)
    """The whole join. Reads two already-committed files — no network here."""
    if not LEAGUE_HISTORY.exists():
        return _void("no league_history.json on disk — the gate this whole "
                     "study depends on is not met")
    history = json.loads(LEAGUE_HISTORY.read_text())
    by_season = {}
    for s in history.get("seasons") or []:
        try:
            by_season[int(s.get("season"))] = s
        except (TypeError, ValueError):
            continue

    adp_hist = {}
    if ADP_HISTORICAL.exists():
        adp_hist = (json.loads(ADP_HISTORICAL.read_text()).get("years")) or {}

    picks_by_season, draft_diag = {}, {}
    for season in SEASONS:
        s = by_season.get(season)
        if s is None:
            draft_diag[season] = {"status": "VOID", "reason": "season not on record"}
            continue
        chosen, diag = select_draft(s.get("drafts") or [])
        if chosen is None:
            draft_diag[season] = {"status": "VOID", **diag}
            continue
        picks_by_season[season] = chosen["picks"]
        draft_diag[season] = {"status": "selected", **diag}

    populations = {}
    for season in SEASONS:
        if season not in picks_by_season:
            populations[str(season)] = {"status": "VOID",
                                        "reason": draft_diag[season].get("reason",
                                                                        "no draft selected")}
            continue
        year_doc = adp_hist.get(str(season)) or {}
        prior = picks_by_season.get(season - 1)          # None if not on record
        pop = build_population(season, picks_by_season[season],
                               year_doc.get("ffc"), year_doc.get("fantasypros"),
                               prior)
        populations[str(season)] = {"status": "built", "draft_selection": draft_diag[season],
                                    **pop}

    return {
        "status": "built",
        "_territory": "TERRITORY: C — produced by "
                       "draft/backtest/external_adp_source_study.py",
        "_prereg": "draft/backtest/ADP-SOURCE-2026-PREREG.md",
        "_note": ("The matched population per season, every arm's rank "
                  "attached where available. No MAE, Spearman, survival "
                  "accuracy, or decision rule computed here — that is the "
                  "study's grading half. This module gets the rows."),
        "as_of": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "arm_source_status": {
            "ffc": "captured" if any((adp_hist.get(str(s)) or {}).get("ffc", {}).get("status")
                                     == "captured" for s in SEASONS) else "not yet fetched",
            "fp": "captured" if any((adp_hist.get(str(s)) or {}).get("fantasypros", {}).get("status")
                                    == "captured" for s in SEASONS) else "not yet fetched",
            "sleeper": "UNAVAILABLE for every historical season by construction",
        },
        "seasons": populations,
    }


def _void(reason: str) -> dict:
    return {"status": "VOID", "reason": reason,
           "_territory": "TERRITORY: C — produced by "
                          "draft/backtest/external_adp_source_study.py",
           "_note": "VOID is not an empty population. Nothing here licenses "
                    "a claim about any ADP source."}


def main() -> int:  # pragma: no cover
    doc = fetch_and_build()
    OUT.write_text(json.dumps(doc, indent=1) + "\n")
    if doc.get("status") == "VOID":
        print("VOID — %s" % doc["reason"], file=sys.stderr)
        return 1
    for season, pop in sorted(doc["seasons"].items(), key=lambda kv: int(kv[0])):
        if pop.get("status") != "built":
            print("%s: %s (%s)" % (season, pop.get("status"), pop.get("reason")))
            continue
        cov = ", ".join("%s=%s" % (a, pop["coverage"][a].get("status"))
                        for a in ARMS)
        print("%s: n=%d dropped_keepers=%d  %s"
             % (season, pop["graded_population"], pop["keeper_picks_dropped"], cov))
    print("wrote %s" % OUT.name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
