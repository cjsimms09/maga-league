#!/usr/bin/env python3
# TERRITORY: A
"""WHERE WOULD THE TOOL HAVE FINISHED, AND WHY IS 2024 SO MUCH WORSE?

Prereg: `draft/SEAT-RANK-PREREG-2026-08-19.md` (P125, P126), filed first and
NOT blind — every per-seat delta was already visible when it was written, which
that document says in its own first section.

Cory: *"rerun our model to see how we would've drafted compared to other owners.
Need to strive for top 3!"*

`draft/data/engine_seat_replay.json` already answers "by how much" per seat. It
has never answered "in what PLACE", which is the question actually asked. Rank
is one join away from numbers that have been committed for days — the same shape
as register 80, where the diagnostic that mattered sat unread in a file I wrote.

REPORT ONLY. Grades one configuration (the shipped one). Selects nothing.

Run: python3 draft/backtest/seat_rank_lab.py [--json <path>]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent            # draft/backtest
DRAFT = HERE.parent
ROOT = DRAFT.parent
sys.path.insert(0, str(HERE))

# THE OWNER ROSTERS COME FROM THE GRADING MODULE'S OWN CROSSWALK, NOT A SECOND
# ONE (rule 11). `engine_seat_replay.json` carries `engine_roster` and NO
# `owner_roster` — my first draft of this file read that missing key and would
# have printed a clean, plausible `0 players, 0.0 pts, 0.0% of total` for every
# owner in every season, which is exactly the shape P126 predicts and would have
# "confirmed" it with nothing. Caught by listing the seat's keys instead of
# assuming them.
import draft_replay_2025 as R                      # noqa: E402
from model_accuracy_backtest import positions_record  # noqa: E402

REPLAY = DRAFT / "data" / "engine_seat_replay.json"
WEEKLY = "nflverse_weekly_points_%d.json"
ARMS = ("optimal", "realistic")
TOP_N = 3
CHANCE = TOP_N / 10.0


# ── rank ────────────────────────────────────────────────────────────────────
def rank_of(tool_total, owner_totals, own_seat):
    """Rank of the tool among {tool} + the nine OTHER owners.

    The seat's own owner is REPLACED, not added — that is the fixed-opponents
    counterfactual the replay was built on, and adding him back would compare
    the tool against a team that no longer exists in its own history.
    """
    others = [t for s, t in owner_totals.items() if s != own_seat]
    return 1 + sum(1 for t in others if t > tool_total), len(others) + 1


# ── first appearance ────────────────────────────────────────────────────────
def first_seen(seasons):
    """player_id -> earliest season with ANY recorded weekly points.

    "Invisible to a walk-forward projection" is the mechanism, not "rookie": a
    player with no prior-season rows cannot be priced by a projection built
    only from prior seasons, whatever his formal status. This needs no rookie
    table and no Sleeper `years_exp` (the field that produced register E13's
    silent zero for ten of ten managers).
    """
    out = {}
    for season in seasons:
        path = HERE / (WEEKLY % season)
        if not path.exists():
            continue
        doc = json.loads(path.read_text())
        for wk in doc.get("weeks") or []:
            for pid in (wk.get("points") or {}):
                pid = str(pid)
                if pid not in out or season < out[pid]:
                    out[pid] = season
    return out


def share_first(roster, season, first):
    """(count, points from first-appearing, total points) for one roster."""
    tot = sum(float(p.get("actual") or 0.0) for p in roster)
    n = pts = 0
    for p in roster:
        pid = str(p.get("player_id"))
        if first.get(pid, season) >= season:      # never seen before `season`
            n += 1
            pts += float(p.get("actual") or 0.0)
    return n, pts, tot


# ── controls (rule 3e) ──────────────────────────────────────────────────────
def controls(years, first):
    """Four controls. Nothing below is quotable unless all four pass.

    "The tool ranks badly" and "my ranker is broken" print the same thing, so
    the ranker is exercised against cases whose answers are known by
    construction before it is pointed at a real number.
    """
    out = {}
    season = sorted(years)[0]
    owners = {s: d["arms"]["optimal"]["owner_total"]
              for s, d in years[season]["seats"].items()}

    hi = max(owners.values()) + 1000.0
    lo = min(owners.values()) - 1000.0
    r_hi, _ = rank_of(hi, owners, "1")
    r_lo, _ = rank_of(lo, owners, "1")
    out["rank_ceiling_is_1"] = {"got": r_hi, "ok": r_hi == 1}
    out["rank_floor_is_10"] = {"got": r_lo, "ok": r_lo == 10}

    # Rank the ten REAL owners against each other: must be a clean permutation.
    # A ranker that double-counts, or that silently drops the excluded seat,
    # shows up here as a gap or a repeat and nowhere else.
    ranks = sorted(1 + sum(1 for o, t in owners.items() if t > v and o != s)
                   for s, v in owners.items())
    out["real_owner_ranks_are_a_permutation"] = {
        "got": ranks, "ok": ranks == list(range(1, 11))}

    # First-appearance: a 2024 rookie must fire, a long-tenured veteran must
    # not. Both are looked up by NAME in the replay's own rosters, so this
    # control breaks loudly if the store stops carrying them rather than
    # quietly passing on an empty search.
    want_rookie, want_vet = "Malik Nabers", "Derrick Henry"
    got = {}
    for s, seat in years[2024]["seats"].items() if 2024 in years else []:
        for p in seat.get("engine_roster") or []:
            if p.get("name") in (want_rookie, want_vet):
                got[p["name"]] = first.get(str(p["player_id"]))
    ok = (got.get(want_rookie) == 2024 and
          got.get(want_vet) is not None and got.get(want_vet) < 2024)
    out["first_appearance_known_positive"] = {
        "rookie": want_rookie, "rookie_first_season": got.get(want_rookie),
        "veteran": want_vet, "veteran_first_season": got.get(want_vet),
        "ok": bool(ok),
        "why": "a 2024 rookie must be first-seen in 2024 and a veteran earlier; "
               "if this fails every point share below is the probe, not the data"}
    return out


POS: dict = {}


def main() -> int:
    global POS
    POS = positions_record()
    doc = json.loads(REPLAY.read_text())
    years = {int(k): v for k, v in doc["years"].items()}
    seasons = sorted(years)
    first = first_seen(range(2021, max(seasons) + 1))

    ctl = controls(years, first)
    all_ok = all(c["ok"] for c in ctl.values())

    per_season, pooled = {}, {a: [] for a in ARMS}
    for season in seasons:
        y = years[season]
        row = {"arms": {}, "first_appearing": {}}
        for arm in ARMS:
            owners = {s: d["arms"][arm]["owner_total"]
                      for s, d in y["seats"].items()}
            seats = []
            for s, d in sorted(y["seats"].items(), key=lambda kv: int(kv[0])):
                r, field = rank_of(d["arms"][arm]["tool_total"], owners, s)
                seats.append({"seat": int(s), "owner": d["owner"], "rank": r,
                              "of": field,
                              "tool_total": d["arms"][arm]["tool_total"],
                              "top3": r <= TOP_N})
                pooled[arm].append(r)
            rk = [x["rank"] for x in seats]
            row["arms"][arm] = {
                "seats": seats, "mean_rank": round(sum(rk) / len(rk), 2),
                "top3_n": sum(1 for r in rk if r <= TOP_N), "top3_of": len(rk)}

        # first-appearing decomposition, skill slots both sides (the engine
        # roster in the store is already skill-only, so the owner side is
        # filtered the same way or the comparison is between two populations)
        weekly = R.weekly_points_of(season)
        totals = {pid: round(sum(rows.values()), 2)
                  for pid, rows in weekly.items()}
        picks, _keepers = R.season_draft(R.season_record(season))
        eng_n = eng_p = eng_t = own_n = own_p = own_t = 0.0
        for s, d in y["seats"].items():
            n, p, t = share_first(d.get("engine_roster") or [], season, first)
            eng_n += n; eng_p += p; eng_t += t
            own = [{"player_id": str(pk["player_id"]),
                    "actual": totals.get(str(pk["player_id"]), 0.0)}
                   for pk in picks
                   if pk["roster_id"] == int(s)
                   and POS.get(str(pk["player_id"])) in ("QB", "RB", "WR", "TE")]
            n, p, t = share_first(own, season, first)
            own_n += n; own_p += p; own_t += t
        row["first_appearing"] = {
            "engine": {"players": eng_n, "points": round(eng_p, 1),
                       "share_of_points": round(eng_p / eng_t, 4) if eng_t else None},
            "owner": {"players": own_n, "points": round(own_p, 1),
                      "share_of_points": round(own_p / own_t, 4) if own_t else None},
            "owner_minus_engine_share": (round(own_p / own_t - eng_p / eng_t, 4)
                                         if eng_t and own_t else None),
        }
        per_season[season] = row

    report = {
        "_territory": "TERRITORY: A — draft/backtest/seat_rank_lab.py",
        "_prereg": "draft/SEAT-RANK-PREREG-2026-08-19.md (P125, P126)",
        "_note": "REPORT ONLY. One configuration graded (shipped MEASURED_WEIGHTS); "
                 "nothing swept, nothing selected. Engine-on-bundles, which is "
                 "given strictly LESS than the live board — risk term age-only, "
                 "injury/depth/opportunity declared absent, walk-forward "
                 "projections rather than the shipped multi-source mean.",
        "_source": "draft/data/engine_seat_replay.json",
        "chance_top3_rate": CHANCE,
        "controls": ctl,
        "controls_all_passed": all_ok,
        "per_season": per_season,
        "pooled": {a: {"mean_rank": round(sum(v) / len(v), 2),
                       "top3_n": sum(1 for r in v if r <= TOP_N),
                       "top3_of": len(v),
                       "top3_rate": round(sum(1 for r in v if r <= TOP_N) / len(v), 4)}
                   for a, v in pooled.items()},
    }

    print("SEAT RANK — where the shipped engine would have FINISHED, of 10\n")
    print("  CONTROLS (rule 3e):")
    for k, c in ctl.items():
        print("    %s %s  %s" % ("✅" if c["ok"] else "⛔", k,
                                 json.dumps({x: y for x, y in c.items()
                                             if x not in ("ok", "why")})))
    if not all_ok:
        print("\n  ⛔ A CONTROL FAILED. Nothing below is a measurement.\n")

    for arm in ARMS:
        p = report["pooled"][arm]
        print("\n  ── %s arm ──  mean rank %.2f of 10 · top-3 in %d of %d "
              "(%.0f%%, chance %.0f%%)"
              % (arm, p["mean_rank"], p["top3_n"], p["top3_of"],
                 100 * p["top3_rate"], 100 * CHANCE))
        for season in seasons:
            a = per_season[season]["arms"][arm]
            print("     %d  mean rank %.2f   top-3 %d/%d   ranks %s"
                  % (season, a["mean_rank"], a["top3_n"], a["top3_of"],
                     " ".join(str(x["rank"]) for x in a["seats"])))

    print("\n  ── first-appearing players (no weekly points in ANY prior "
          "season) — the population a walk-forward projection cannot price ──")
    print("     %-6s %-34s %-34s %s" % ("", "engine roster", "owner roster", "gap"))
    for season in seasons:
        f = per_season[season]["first_appearing"]
        e, o = f["engine"], f["owner"]
        fmt = lambda d: ("%3d players, %6.1f pts, %5.1f%% of total"
                         % (d["players"], d["points"],
                            100 * (d["share_of_points"] or 0)))
        gap = f["owner_minus_engine_share"]
        print("     %-6d %-34s %-34s %s" % (
            season, fmt(e), fmt(o),
            ("%+.1f pp" % (100 * gap)) if gap is not None else "n/a"))

    i = sys.argv.index("--json") if "--json" in sys.argv else -1
    if i >= 0:
        Path(sys.argv[i + 1]).write_text(json.dumps(report, indent=1))
        print("\n  wrote " + sys.argv[i + 1])
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
