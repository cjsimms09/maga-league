#!/usr/bin/env python3
# TERRITORY: A
"""THE TUESDAY GRADE — closing the weekly loop, mechanically, with an alert.

Counterpart to draft/weekly_own_projection.py (read its header first). Every
committed own_weekly snapshot not yet graded gets graded here against real
player stats, and the grades ledger (draft/data/weekly_own/grades_<season>.json)
is the learning artifact: per-player rows, per-position MAE + rank correlation
per arm, the top-5 misses BY NAME (closing the loop to learn means a human can
read WHY), and the promotion history.

WHAT GETS GRADED, ARM BY ARM:
  - OUR arms: the champion + every challenger column in the snapshot, on one
    identical population (snapshot players ∩ players with a real stat row).
    A projected player with NO stat row that week is counted and named, never
    scored as zero (absent-not-zero).
  - PROVIDER study arms (Cory's 2026-08-16 ask: "between sleeper and fantasy
    pros projections should we be switching those depending on who is
    winning...? Should we be averaging them? Should we study that as well?"):
    `sleeper` and `fantasypros` wherever weekly_proj_snapshot.py's provider
    archive (proj_series.json, sources sleeper_weekly / fantasypros_weekly)
    carries that week — as of 2026-08-16 the archiver captures Sleeper only,
    so the FP arm starts grading the day the archive carries it — plus
    `sleeper_fp_average` (simple mean where BOTH providers price a player).
    Provider arms are graded on their own archived population AND on the
    shared population with our champion, honestly labeled when they differ.
  - `props_weekly_v1` — OUR OWN weekly-props-priced arm (the second half of
    Cory's 2026-08-16 split: "one for season projections for draft and
    another for weekly projections specific to that week?"), graded through
    this SAME provider pathway rather than as a champion/challenger — it is
    NOT a third-party feed, but it shares the provider arms' exact
    constraint (a partial, market-dependent population, never the full
    board), so it reuses their population-honest scoring instead of a
    parallel one. Full reasoning: draft/weekly_props_arm.py's header. Wired
    from draft/data/props/weekly_props_<season>_w<week>.json (produced by
    draft/tools/fetch_weekly_props.py) — empty on this branch pending a
    human-dispatched real fetch; see draft/audit/weekly_props_study_2026-08-16.md.

THE BOUNDARY, EXPLICIT: provider arms — and props_weekly_v1 — are STUDY arms.
The mechanical promotion rule below governs OUR OWN formula variants only —
no provider and no study arm is ever auto-promoted, and which source feeds
the LIVE waiver/lineup tools is actionable-this-year and stays a human ruling.

THE MECHANICAL PROMOTION RULE (Cory authorized frequent adaptation because
this data is non-actionable in 2026: "we can adjust more often, no harm if
we're wrong"). decide_promotion() is the rule; quoted verbatim in
draft/data/weekly_own/README.md. A challenger is promoted to champion when:
  (a) it has at least 3 graded weeks in common with the current champion;
  (b) it beat the champion on per-week overall MAE in >= 3 of the last 4
      common graded weeks (all 3 when only 3 exist);
  (c) it leads cumulative MAE (mean of per-week MAEs) over the full common
      span, without losing cumulative rank correlation by more than 0.02.
Best cumulative MAE among qualifiers wins. On promotion the version string
bumps (own_weekly_v1 -> v2 -> ...), the OLD champion remains active as a
challenger (a bad switch reverses itself under the same rule), and a new
variant may be seeded along the winning tilt axis. Humans and agents invent
new arms from the miss patterns; this rule only selects among them.

THE ALERT (Cory: "I'd also like an alert or someway to know if model adapted
and how"): a promotion writes its record into the ledger AND this CLI emits
promotion_title.txt + promotion_body.md (issue_text() below, pure and tested)
for own-weekly-grade.yml to open a GitHub issue — issues email Cory.

ACTUALS. Fetched in CI from the nflverse stats_player_week release via the
functions in draft/backtest/fetch_component_stats.py (same fetch pattern,
same gsis->sleeper crosswalk, scored under frozen_scoring_table() — the table
the own model's whole graded lineage was scored under). The sandbox cannot
reach api.sleeper.app or sportsgameodds; nflverse on github.com is the one
egress path, and even that is CI's job here. A week grades only when its
games are over (past its Tuesday) AND the release actually carries it
(>= 200 player rows, >= 20 teams) — a partial week is skipped by name and
retried next Tuesday, never half-graded.

Run: python3 draft/weekly_own_grade.py [--season 2026] [--date YYYY-MM-DD]
Env overrides (tests + dry-run): OWN_WEEKLY_DIR, OWN_WEEKLY_LEDGER_OUT,
OWN_WEEKLY_ACTUALS (path to {"weeks": {"1": {"players": {pid: pts},
"teams": N}}} — skips the network fetch), OWN_WEEKLY_PROJ_SERIES,
OWN_WEEKLY_ISSUE_DIR, PROPS_WEEKLY_DIR (weekly_props_<season>_w<week>.json
snapshots — see draft/weekly_props_arm.py; default draft/data/props/).
"""
from __future__ import annotations

import datetime as _dt
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "backtest"))

from lab_projections import spearman  # noqa: E402
from weekly_own_projection import (  # noqa: E402
    DEFAULT_ARMS,
    DEFAULT_CHAMPION,
    arm_formula,
    read_controls,
    week_window,
)
from weekly_props_arm import ARM_NAME as PROPS_ARM_NAME  # noqa: E402
from weekly_props_arm import load_props_arm  # noqa: E402

SEASON = 2026
MIN_WEEK_PLAYERS = 200   # a real NFL week has ~600 offensive player rows
MIN_WEEK_TEAMS = 20      # bye weeks bottom out at 24 playing teams
PROMOTION_MIN_WEEKS = 3
PROMOTION_RECENT_WINDOW = 4
PROMOTION_RECENT_WINS = 3
PROMOTION_SPEARMAN_TOLERANCE = 0.02
PROVIDER_SOURCES = {"sleeper": "sleeper_weekly",
                    "fantasypros": "fantasypros_weekly"}


# ── scoring helpers (pure) ───────────────────────────────────────────────────

def _score(pids: list, proj: dict, actuals: dict, positions: dict) -> dict:
    """MAE + Spearman overall and per position over pids (all of which must
    exist in both proj and actuals — the caller intersects)."""
    errs = [abs(proj[p] - actuals[p]) for p in pids]
    out = {
        "n": len(pids),
        "mae": round(sum(errs) / len(errs), 3) if errs else None,
        "spearman": (round(spearman([proj[p] for p in pids],
                                    [actuals[p] for p in pids]), 4)
                     if len(pids) >= 3 else None),
    }
    per_pos = {}
    for pos in ("QB", "RB", "WR", "TE"):
        sub = [p for p in pids if positions.get(p) == pos]
        if not sub:
            continue
        es = [abs(proj[p] - actuals[p]) for p in sub]
        per_pos[pos] = {
            "n": len(sub),
            "mae": round(sum(es) / len(es), 3),
            "spearman": (round(spearman([proj[p] for p in sub],
                                        [actuals[p] for p in sub]), 4)
                         if len(sub) >= 3 else None),
        }
    out["per_pos"] = per_pos
    return out


def provider_weeklies(series: list, week: int) -> dict:
    """{arm_name: {pid: points}} for the provider sources the archive REALLY
    carries for this week (latest date per source wins), plus
    sleeper_fp_average where both providers price a player."""
    out: dict[str, dict] = {}
    for arm, source in PROVIDER_SOURCES.items():
        rows = [s for s in (series or [])
                if s.get("source") == source and s.get("week") == week]
        if rows:
            rows.sort(key=lambda s: s.get("date") or "")
            out[arm] = {str(k): float(v) for k, v in
                        (rows[-1].get("proj") or {}).items()}
    if "sleeper" in out and "fantasypros" in out:
        both = set(out["sleeper"]) & set(out["fantasypros"])
        if both:
            out["sleeper_fp_average"] = {
                p: round((out["sleeper"][p] + out["fantasypros"][p]) / 2.0, 2)
                for p in both}
    return out


def grade_week(snapshot: dict, actuals: dict, provider_proj: dict | None = None,
               graded_at: str = "") -> dict:
    """The pure grade: one committed snapshot + one week of actual points
    ({pid: pts}) -> the ledger entry. Absent-not-zero throughout: a projected
    player with no stat row is counted+named, never scored as 0."""
    diag = snapshot.get("diagnostics") or {}
    champ_arm = diag.get("champion_arm") or "v1"
    names = snapshot.get("names") or {}
    projections = snapshot.get("projections") or {}
    positions = {pid: row.get("pos") for pid, row in projections.items()}
    arms_means: dict[str, dict] = {
        champ_arm: {pid: row["mean"] for pid, row in projections.items()}}
    for arm, means in (snapshot.get("challengers") or {}).items():
        arms_means[arm] = {str(k): float(v) for k, v in means.items()}

    projected = sorted(arms_means[champ_arm], key=lambda x: (len(x), x))
    with_actual = [p for p in projected if p in actuals]
    no_stat = [p for p in projected if p not in actuals]

    own_arms = {arm: _score(with_actual, means, actuals, positions)
                for arm, means in sorted(arms_means.items())}

    providers = {}
    for arm, proj in sorted((provider_proj or {}).items()):
        own_pop = sorted((set(proj) & set(actuals)),
                         key=lambda x: (len(x), x))
        shared = [p for p in with_actual if p in proj]
        # positions for provider-only players are unknown to the snapshot;
        # per_pos covers the players our board knows, the rest grade overall.
        providers[arm] = {
            "own_population": _score(own_pop, proj, actuals,
                                     positions),
            "shared_with_ours": {
                "n": len(shared),
                "note": ("identical players; comparable cells" if shared else
                         "no overlap with our graded population this week"),
                arm: _score(shared, proj, actuals, positions),
                "own_champion": _score(shared, arms_means[champ_arm],
                                       actuals, positions),
            },
            "population_note": (
                f"provider archive ∩ actuals n={len(own_pop)}; "
                f"ours n={len(with_actual)}; shared n={len(shared)} — "
                "different populations are labeled, never mixed"),
        }

    champ_means = arms_means[champ_arm]
    misses = sorted(with_actual,
                    key=lambda p: -abs(champ_means[p] - actuals[p]))[:5]
    top_misses = [{
        "player_id": p,
        "name": names.get(p),
        "pos": positions.get(p),
        "proj": champ_means[p],
        "actual": round(actuals[p], 2),
        "err": round(champ_means[p] - actuals[p], 2),
    } for p in misses]
    over = sum(1 for m in top_misses if m["err"] > 0)
    miss_pattern = (f"{over} of {len(top_misses)} top misses were "
                    "OVER-projections (we priced points that never came); "
                    f"{len(top_misses) - over} were UNDER (real blow-ups "
                    "we missed)") if top_misses else "no gradeable players"

    rows = {p: {
        "name": names.get(p),
        "pos": positions.get(p),
        "actual": round(actuals[p], 2),
        "proj": {arm: arms_means[arm][p] for arm in sorted(arms_means)},
        **({"sleeper": provider_proj["sleeper"][p]}
           if provider_proj and p in provider_proj.get("sleeper", {}) else {}),
        **({"fantasypros": provider_proj["fantasypros"][p]}
           if provider_proj and p in provider_proj.get("fantasypros", {})
           else {}),
    } for p in with_actual}

    return {
        "graded_at": graded_at,
        "snapshot": f"own_weekly_{snapshot['season']}_w{snapshot['week']}.json",
        "formula": diag.get("formula"),
        "champion_arm": champ_arm,
        "population": {
            "projected": len(projected),
            "with_actual": len(with_actual),
            "no_stat_row": {
                "count": len(no_stat),
                "note": "projected, no stat row that week — absent, not zero",
                "player_ids": no_stat,
            },
        },
        "own_arms": own_arms,
        "providers": providers,
        "top_misses": top_misses,
        "miss_pattern": miss_pattern,
        "rows": rows,
    }


# ── the mechanical promotion rule (pure) ─────────────────────────────────────

def _arm_series(weeks: dict, arm: str) -> dict:
    """{week:int -> (mae, spearman)} for one own arm across the ledger."""
    out = {}
    for wk, entry in weeks.items():
        cell = (entry.get("own_arms") or {}).get(arm)
        if cell and cell.get("mae") is not None:
            out[int(wk)] = (cell["mae"], cell.get("spearman"))
    return out


def decide_promotion(champion: dict, weeks: dict, active_arms: list) -> dict | None:
    """The rule, exactly as the module header states it. Returns None or a
    promotion record (no side effects — the caller applies it)."""
    champ_arm = champion["arm"]
    champ_series = _arm_series(weeks, champ_arm)
    qualifiers = []
    for arm_def in active_arms:
        arm = arm_def["name"]
        if arm == champ_arm:
            continue
        cand = _arm_series(weeks, arm)
        common = sorted(set(cand) & set(champ_series))
        if len(common) < PROMOTION_MIN_WEEKS:
            continue
        recent = common[-PROMOTION_RECENT_WINDOW:]
        wins = sum(1 for w in recent if cand[w][0] < champ_series[w][0])
        need = min(PROMOTION_RECENT_WINS, len(recent))
        if wins < need:
            continue
        cum_cand = sum(cand[w][0] for w in common) / len(common)
        cum_champ = sum(champ_series[w][0] for w in common) / len(common)
        if not cum_cand < cum_champ:
            continue
        rho_cand = [cand[w][1] for w in common if cand[w][1] is not None]
        rho_champ = [champ_series[w][1] for w in common
                     if champ_series[w][1] is not None]
        if rho_cand and rho_champ:
            if (sum(rho_cand) / len(rho_cand)
                    < sum(rho_champ) / len(rho_champ)
                    - PROMOTION_SPEARMAN_TOLERANCE):
                continue
        qualifiers.append({
            "arm": arm,
            "weeks_used": common,
            "recent_wins": f"{wins} of last {len(recent)}",
            "cum_mae": round(cum_cand, 3),
            "champion_cum_mae": round(cum_champ, 3),
            "cum_spearman": (round(sum(rho_cand) / len(rho_cand), 4)
                             if rho_cand else None),
            "champion_cum_spearman": (round(sum(rho_champ) / len(rho_champ), 4)
                                      if rho_champ else None),
            "per_week": {str(w): {"challenger": cand[w][0],
                                  "champion": champ_series[w][0]}
                         for w in common},
        })
    if not qualifiers:
        return None
    best = min(qualifiers, key=lambda q: q["cum_mae"])
    m = re.match(r"^own_weekly_v(\d+)$", champion["version"])
    nxt = f"own_weekly_v{int(m.group(1)) + 1}" if m else champion["version"] + "+1"
    return {
        "from": {"version": champion["version"], "arm": champ_arm},
        "to": {"version": nxt, "arm": best["arm"]},
        "evidence": best,
        # THE STANDING NULL (BLEND-SEARCH-DESIGN §3, D's condition 4, wired
        # 08-18): picking the best of K arms buys a margin for free, and that
        # free margin GROWS as arms are added. ATTACHED, NOT GATING — the
        # promotion rule above is Cory-ruled verbatim and this does not change
        # it; it makes every promotion carry the question "would K skill-free
        # arms have produced this margin?" so the human reading the promotion
        # issue sees the answer beside the win instead of nobody asking.
        "best_of_k": _best_of_k_null(weeks, [a["name"] for a in active_arms]),
    }


def _best_of_k_null(weeks: dict, arm_names: list) -> dict:
    """best_of_k over the arms' common graded weeks (rows = weeks, error =
    weekly MAE — exchangeable under 'arm identity carries no information').
    Never raises: a promotion must not fail because its null could not run —
    an unrunnable null is REPORTED as unrunnable, not silently absent."""
    try:
        from best_of_k import best_of_k
        series = {a: _arm_series(weeks, a) for a in arm_names}
        series = {a: s for a, s in series.items() if s}
        common = None
        for s in series.values():
            common = set(s) if common is None else common & set(s)
        common = sorted(common or [])
        if len(series) < 2 or len(common) < 3:
            return {"status": "NOT RUN — needs >=2 arms with >=3 common graded weeks",
                    "arms": len(series), "common_weeks": len(common)}
        errors_by_arm = {a: [series[a][w][0] for w in common] for a in series}
        out = best_of_k(errors_by_arm)
        out["status"] = "ran"
        out["rows_are"] = "weekly MAEs over common weeks " + str(common)
        return out
    except Exception as exc:                              # noqa: BLE001
        return {"status": f"FAILED to run ({type(exc).__name__}: {exc}) — "
                          "the null is missing, not passed"}


def seed_challenger(promoted_def: dict, active_arms: list) -> dict | None:
    """A new variant along the winning TILT axis: keep pushing the direction
    that just won (x1.5 further out, x0.5 further in). No seeding when the
    winner is no-tilt or a divisor variant — new AXES are invented by humans
    reading the misses, not extrapolated mechanically."""
    scale = promoted_def.get("tilt_scale")
    if not scale or scale == 1.0:
        return None
    if promoted_def.get("divisor") != 17:
        return None
    new_scale = round(scale * (1.5 if scale > 1.0 else 0.5), 4)
    name = f"v1_tilt{int(round(new_scale * 100)):03d}"
    if any(a["name"] == name for a in active_arms):
        return None
    return {"name": name, "divisor": 17, "tilt_scale": new_scale}


def issue_text(record: dict) -> tuple[str, str]:
    """(title, markdown body) for the adaptation alert — a GitHub issue
    emails Cory, which is the alert he asked for."""
    ev = record["evidence"]
    title = (f"Weekly model adapted: {record['from']['version']} -> "
             f"{record['to']['version']}")
    lines = [
        f"The weekly own-projection champion changed **mechanically** under "
        f"the promotion rule in `draft/weekly_own_grade.py` (contract: "
        f"`draft/data/weekly_own/README.md`).",
        "",
        f"- **New champion:** arm `{record['to']['arm']}` as "
        f"`{record['to']['version']}`",
        f"- **Replaced:** arm `{record['from']['arm']}` "
        f"(`{record['from']['version']}`) — stays active as a challenger, so "
        f"a bad switch reverses itself under the same rule",
        f"- **Recent weeks won:** {ev['recent_wins']}",
        f"- **Cumulative MAE:** {ev['cum_mae']} vs champion's "
        f"{ev['champion_cum_mae']} over weeks "
        f"{', '.join(str(w) for w in ev['weeks_used'])}",
        f"- **Cumulative Spearman:** {ev['cum_spearman']} vs "
        f"{ev['champion_cum_spearman']} (tolerance "
        f"{PROMOTION_SPEARMAN_TOLERANCE})",
        "",
        "| week | challenger MAE | champion MAE |",
        "|---|---|---|",
    ]
    for w in ev["weeks_used"]:
        pw = ev["per_week"][str(w)]
        lines.append(f"| {w} | {pw['challenger']} | {pw['champion']} |")
    lines += [
        "",
        "Provider arms (sleeper / fantasypros / sleeper_fp_average) are study "
        "arms and are never auto-promoted; which provider feeds the live "
        "tools stays a human ruling.",
        "",
        "Full grades: `draft/data/weekly_own/grades_*.json` — scoreboard: "
        "`/admin/model-scoreboard`.",
    ]
    return title, "\n".join(lines)


# ── ledger IO ────────────────────────────────────────────────────────────────

def empty_ledger(season: int) -> dict:
    return {
        "_territory": "TERRITORY: A — produced by draft/weekly_own_grade.py",
        "_note": ("The weekly-own-projection learning ledger: per-week grades "
                  "for every arm (ours + provider study arms), top misses by "
                  "name, champion + promotion history. Contract: "
                  "draft/data/weekly_own/README.md. Absent-not-zero: a "
                  "projected player with no stat row is counted, never "
                  "scored as 0."),
        "season": season,
        "champion": dict(DEFAULT_CHAMPION),
        # formula strings travel WITH the arm definitions so every reader
        # (the scoreboard page included) quotes them instead of re-deriving.
        "active_arms": [{**a, "formula": arm_formula(a)} for a in DEFAULT_ARMS],
        "promotions": [],
        "weeks": {},
    }


def week_games_complete(week: int, today: _dt.date) -> bool:
    """A week's games run Thursday..Monday of its window; grade no earlier
    than its Tuesday (window start + 6 days)."""
    start, _ = week_window(week)
    return today >= start + _dt.timedelta(days=6)


# ── CI actuals fetch (network — CI only; tests use OWN_WEEKLY_ACTUALS) ───────

def fetch_actuals_ci(season: int) -> dict | None:
    """{"weeks": {week:int: {"players": {pid: pts}, "teams": N}}} from the
    nflverse stats_player_week release, via fetch_component_stats' own fetch,
    crosswalk and build functions (reused, not re-implemented), scored under
    frozen_scoring_table(). None when the release has no season file yet."""
    import tempfile

    import fetch_component_stats as FCS
    import pandas as pd
    import scoring as scoring_mod

    workdir = Path(tempfile.mkdtemp(prefix="own_weekly_grade_"))
    raw = workdir / f"stats_{season}.parquet"
    df = None
    for url in (FCS.URL_PRIMARY.format(year=season),
                FCS.URL_FALLBACK.format(year=season)):
        if FCS._download(url, raw):  # noqa: SLF001 — the store's own fetch path
            try:
                df = pd.read_parquet(raw, engine="fastparquet")
                break
            except Exception:  # noqa: BLE001
                df = None
    if df is None:
        return None
    weeks, _counts = FCS.build_season(df, FCS._crosswalk())  # noqa: SLF001
    table = FCS.frozen_scoring_table()
    out: dict[int, dict] = {}
    for w in weeks:
        players = {}
        teams = set()
        for pid, line in w["players"].items():
            if pid.startswith("gsis:"):
                continue           # unmappable to board ids; never graded
            stat_line = {k: line[k] for k in FCS.SCORING_KEYS if k in line}
            players[pid] = round(scoring_mod.score_stat_line(stat_line, table), 2)
            if line.get("team"):
                teams.add(line["team"])
        out[int(w["week"])] = {"players": players, "teams": len(teams)}
    return {"weeks": out}


# ── CLI ──────────────────────────────────────────────────────────────────────

def main(argv: list | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    season = SEASON
    date = None
    for i, a in enumerate(args):
        if a == "--season" and i + 1 < len(args):
            season = int(args[i + 1])
        if a == "--date" and i + 1 < len(args):
            date = args[i + 1]
    today = (_dt.date.fromisoformat(date) if date
             else _dt.datetime.now(_dt.timezone.utc).date())

    own_dir = Path(os.environ.get("OWN_WEEKLY_DIR")
                   or HERE / "data" / "weekly_own")
    ledger_path = own_dir / f"grades_{season}.json"
    ledger_out = Path(os.environ.get("OWN_WEEKLY_LEDGER_OUT") or ledger_path)
    series_path = Path(os.environ.get("OWN_WEEKLY_PROJ_SERIES")
                       or HERE / "data" / "proj_series.json")
    props_dir = Path(os.environ.get("PROPS_WEEKLY_DIR")
                     or HERE / "data" / "props")
    issue_dir = os.environ.get("OWN_WEEKLY_ISSUE_DIR")

    snapshots = sorted(own_dir.glob(f"own_weekly_{season}_w*.json"))
    if not snapshots:
        print(f"no own_weekly snapshots for {season} in {own_dir} — nothing "
              "to grade yet. Exiting clean.")
        return 0

    ledger = (json.loads(ledger_path.read_text()) if ledger_path.exists()
              else empty_ledger(season))
    graded = set(ledger.get("weeks") or {})

    pending = []
    for snap_path in snapshots:
        snap = json.loads(snap_path.read_text())
        wk = int(snap["week"])
        if str(wk) in graded:
            continue
        if not week_games_complete(wk, today):
            print(f"week {wk}: games not complete until "
                  f"{week_window(wk)[0] + _dt.timedelta(days=6)} — waiting")
            continue
        pending.append((wk, snap))
    if not pending:
        print("every committed snapshot is either graded or still playing — "
              "nothing to do. Exiting clean.")
        return 0

    actuals_env = os.environ.get("OWN_WEEKLY_ACTUALS")
    if actuals_env:
        actuals_doc = json.loads(Path(actuals_env).read_text())
        actuals_weeks = {int(k): v for k, v in
                         (actuals_doc.get("weeks") or {}).items()}
    else:
        doc = fetch_actuals_ci(season)
        if doc is None:
            print(f"nflverse has no {season} stats release yet — nothing "
                  "gradeable. Exiting clean (retried next Tuesday).")
            return 0
        actuals_weeks = doc["weeks"]

    series = []
    if series_path.exists():
        try:
            series = (json.loads(series_path.read_text()) or {}).get("series") or []
        except ValueError:
            series = []

    controls = read_controls(Path(os.environ.get("OWN_WEEKLY_CONTROLS")
                                  or own_dir / "controls.json"))

    n_graded = 0
    for wk, snap in sorted(pending):
        aw = actuals_weeks.get(wk)
        if not aw:
            print(f"week {wk}: not in the stats release yet — skipped, "
                  "retried next run")
            continue
        players, teams = aw.get("players") or {}, aw.get("teams") or 0
        if len(players) < MIN_WEEK_PLAYERS or teams < MIN_WEEK_TEAMS:
            print(f"week {wk}: PARTIAL actuals ({len(players)} players, "
                  f"{teams} teams) — refusing to half-grade; retried next run")
            continue
        provider_proj = provider_weeklies(series, wk)
        props_map = load_props_arm(props_dir, season, wk)
        if props_map:
            # a NEW dict, never a mutation of provider_weeklies' return —
            # props_weekly_v1 is not a provider archive, it merges in only
            # here, at the point weekly_own_grade decides what counts as a
            # study arm this run.
            provider_proj = {**provider_proj, PROPS_ARM_NAME: props_map}
        entry = grade_week(snap, players, provider_proj,
                           graded_at=today.isoformat())
        ledger["weeks"][str(wk)] = entry
        n_graded += 1
        champ = entry["own_arms"].get(entry["champion_arm"]) or {}
        print(f"week {wk} graded: {entry['population']['with_actual']} of "
              f"{entry['population']['projected']} projected players had a "
              f"stat row; champion {entry['champion_arm']} "
              f"MAE {champ.get('mae')} rho {champ.get('spearman')}; "
              f"providers graded: {sorted(entry['providers']) or 'none'}; "
              f"{entry['miss_pattern']}")

    # ── the adaptation controls (Cory's wheel) ──────────────────────────────
    # An active manual override pins the champion column and PAUSES the
    # mechanical rule (it would fight the human's hand); the switch itself is
    # recorded in the promotion history ONCE and fires the same alert, because
    # "know if the model adapted and how" includes Cory's own switches.
    alert = None
    ov = controls.get("champion_override")
    if ov:
        already = any(p.get("type") == "manual_override"
                      and (p.get("to") or {}).get("arm") == ov
                      for p in ledger["promotions"])
        if not already:
            record = {
                "type": "manual_override",
                "from": dict(ledger["champion"]),
                "to": {"version": f"{ledger['champion']['version']}"
                                  f"+override:{ov}", "arm": ov},
                "promoted_at": today.isoformat(),
                "note": ("manual champion override via controls.json — the "
                         "mechanical rule is paused while it stands"),
            }
            ledger["promotions"].append(record)
            alert = (
                f"Weekly model adapted: manual override -> arm {ov}",
                (f"Cory (or a session acting on his word) pinned the weekly "
                 f"champion COLUMN to arm `{ov}` via "
                 "`draft/data/weekly_own/controls.json`.\n\n"
                 f"- Previous mechanical champion: arm "
                 f"`{ledger['champion']['arm']}` "
                 f"(`{ledger['champion']['version']}`) — still graded every "
                 "week\n- The mechanical promotion rule is PAUSED while the "
                 "override stands; clear `champion_override` to hand the "
                 "wheel back.\n\nScoreboard: `/admin/model-scoreboard`."))

    promo = None
    if n_graded and controls["auto_adapt"] and not ov:
        promo = decide_promotion(ledger["champion"], ledger["weeks"],
                                 ledger["active_arms"])
    elif n_graded and not controls["auto_adapt"]:
        print("adaptation PAUSED by controls.json (auto_adapt=false) — "
              "grading continues, promotions held")
    elif n_graded and ov:
        print(f"manual champion override active (arm {ov}) — mechanical "
              "promotions held while it stands")
    if promo:
        promoted_def = next(a for a in ledger["active_arms"]
                            if a["name"] == promo["to"]["arm"])
        latest = max(int(w) for w in ledger["weeks"])
        record = {**promo, "promoted_at": today.isoformat(),
                  "effective_from_week": latest + 1,
                  "formula": arm_formula(promoted_def)}
        seed = seed_challenger(promoted_def, ledger["active_arms"])
        if seed:
            ledger["active_arms"].append({**seed, "formula": arm_formula(seed)})
            record["seeded_challenger"] = {**seed, "formula": arm_formula(seed)}
        ledger["promotions"].append(record)
        ledger["champion"] = {"version": promo["to"]["version"],
                              "arm": promo["to"]["arm"],
                              "since_week": latest + 1}
        alert = issue_text(record)
        print(f"PROMOTION: {alert[0]}")
    if alert and issue_dir:
        d = Path(issue_dir)
        d.mkdir(parents=True, exist_ok=True)
        (d / "promotion_title.txt").write_text(alert[0])
        (d / "promotion_body.md").write_text(alert[1])
        print(f"alert payload written to {d}")

    changed = bool(n_graded or promo
                   or (alert and ov))
    if changed:
        ledger_out.parent.mkdir(parents=True, exist_ok=True)
        ledger_out.write_text(json.dumps(ledger, indent=1))
        print(f"wrote {ledger_out}: {len(ledger['weeks'])} week(s) graded, "
              f"{len(ledger['promotions'])} promotion(s), champion "
              f"{ledger['champion']['version']} "
              f"(arm {ledger['champion']['arm']})")
    else:
        print("no week could be graded this run (partial/missing actuals) — "
              "nothing written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
