#!/usr/bin/env python3
# TERRITORY: A
"""OUR OWN WEEKLY NUMBER, COMMITTED BEFORE KICKOFF — the missing half of the loop.

THE MANDATE, Cory verbatim (2026-08-16): "We need to be making our own
projections for every player, capturing, grading, and closing loop to learn!!"
And the same-day addendum that shapes the adaptation design: "since we aren't
making decisions using that data for this year, it needs to be quick to adapt
and try new things if it's losing... Model needs to adapt and look for ways to
try to beat current adjustments. Again closed loop system but since data isn't
actionable this year we can adjust more often, no harm if we're wrong. I'd also
like an alert or someway to know if model adapted and how."

Before this file the repo had NO own weekly per-player projection: the
season-total own model (proj_ownmodel on the committed board) drives the draft
board, in-season tools run on Sleeper's weekly numbers, and
weekly_proj_snapshot.py archives PROVIDER weeklies. This module prices OUR
weekly number for every QB/RB/WR/TE the board prices, every Thursday, committed
before kickoff (the commit timestamp IS the forward guarantee — see
own-weekly-proj.yml), graded every Tuesday by weekly_own_grade.py.

THE v1 FORMULA (champion arm "v1", version string "own_weekly_v1"),
deliberately simple and honest — it is graded weekly and earns complexity from
its own misses:

    weekly_mean = proj_ownmodel / 17
                  * (1 + tilt_scale * vg[pos] * (implied_team - mean_implied)
                                              / mean_implied)

  - proj_ownmodel is the committed board's own-model SEASON total (own_v6 at
    promotion time; whatever the board carries is what gets priced — one
    source, no re-derivation).
  - /17: a team plays 17 games; the per-game mean ignores rest-of-season
    schedule strength on purpose (named limitation, graded weekly).
  - vg[pos] is IMPORTED from the graded V5_CONFIG in
    draft/backtest/own_model_v5.py (QB .5 / RB .5 / WR .5 / TE 0.0) — the
    constants that survived the v5 preregistration, not new inventions.
  - implied_team is this week's Vegas implied team total; mean_implied is the
    league mean over teams WITH a line this week. Lines come from the captured
    odds snapshot (draft/data/odds/sgo_latest.json, implied_home/implied_away)
    when it carries games for the target week, else from the vegas store
    (draft/backtest/vegas_lines_2021_2026.json seasons["2026"], implied_home =
    total/2 + spread/2). A team with NO line this week gets tilt 1.0 and its
    players are NAMED in diagnostics under the no_line arm.
  - bye week => NO projection for that player (absent, not zero).

CHALLENGER ARMS (Cory's adaptation addendum). Every snapshot carries, beside
the champion, a small NAMED set of challenger columns computed from the same
inputs at zero extra fetch cost — variants along axes the grade can arbitrate:

    v1          tilt_scale 1.0, /17   (the v1 formula above)
    v1_tilt150  tilt_scale 1.5, /17   (is the vegas tilt too weak?)
    v1_tilt050  tilt_scale 0.5, /17   (is it too strong?)
    v1_notilt   tilt_scale 0.0, /17   (is the tilt earning anything at all?)
    v1_pg16     tilt_scale 1.0, /16   (is /17 too low a per-game bar?)

The Tuesday grader evaluates every arm on identical populations and PROMOTES a
challenger mechanically (rule in weekly_own_grade.decide_promotion — the rule
is quoted verbatim in draft/data/weekly_own/README.md). Which arm is champion
lives in the grades ledger; this writer reads it there and defaults to v1.
Humans and agents invent new arms by reading miss patterns; the mechanical
loop only selects among the arms it is given.

A DIFFERENT KIND OF ARM lives OUTSIDE this file's arm set on purpose:
`props_weekly_v1` (draft/weekly_props_arm.py, fed by
draft/tools/fetch_weekly_props.py) prices a week directly from THAT week's
fetched player-prop O/U lines rather than from proj_ownmodel/divisor*tilt, so
it cannot promise the full-population coverage every arm above guarantees (a
prop line exists only where a market was quoted). It is graded by
weekly_own_grade.py through the provider-study pathway instead of as a
challenger column here — see that module's header and
draft/audit/weekly_props_study_2026-08-16.md for the full reasoning.

THE WEEK CLOCK. The vegas store carries week numbers but NO game dates
(checked 2026-08-16: seasons["2026"] rows are week/home/away/spread/total
only), so the week helper anchors on the declared 2026 opener —
Thursday 2026-09-10 (UTC) — with weeks rolling on Wednesdays. Pure, tested.
If the schedule flexes enough to move a WEEK boundary (it has not in the
modern era), the constant is one line and the ledger records formulas per
week, so nothing silently mixes.

Zero-network: this module only reads committed files. The workflow runs it in
CI on Thursdays; the sandbox can run every code path from fixtures.

Run: python3 draft/weekly_own_projection.py [--week N] [--season 2026]
     [--date YYYY-MM-DD]
Writes draft/data/weekly_own/own_weekly_<season>_w<week>.json.
Env overrides (tests + dry-run): OWN_WEEKLY_BOARD, OWN_WEEKLY_ODDS,
OWN_WEEKLY_VEGAS, OWN_WEEKLY_OUT_DIR, OWN_WEEKLY_LEDGER.
"""
from __future__ import annotations

import datetime as _dt
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "backtest"))

from own_model_v5 import V5_CONFIG  # noqa: E402 — graded constants, import-only

FORMULA_VERSION_V1 = "own_weekly_v1"
POSITIONS = ("QB", "RB", "WR", "TE")
GAMES_PER_SEASON = 17
SEASON = 2026

#: vg per position, read once from the graded v5 configuration — never retyped.
VG = {pos: V5_CONFIG[pos]["vg"] for pos in POSITIONS}

#: The 2026 opener kicks off Thursday 2026-09-10 (UTC). Weeks roll on the
#: Wednesday before kickoff, so a Thursday capture always lands in the week it
#: prices. The vegas store has no dates to derive this from (checked — see
#: module docstring), so it is a declared, tested constant.
WEEK1_KICKOFF = _dt.date(2026, 9, 10)
WEEK1_START = WEEK1_KICKOFF - _dt.timedelta(days=1)   # Wednesday 2026-09-09
N_WEEKS = 18

#: The default arm set — the champion (v1) plus the challenger axes named in
#: the module docstring. The grades ledger may extend this (a promotion can
#: seed a new arm along the winning axis); the writer reads the ledger first.
DEFAULT_ARMS = [
    {"name": "v1",         "divisor": 17, "tilt_scale": 1.0},
    {"name": "v1_tilt150", "divisor": 17, "tilt_scale": 1.5},
    {"name": "v1_tilt050", "divisor": 17, "tilt_scale": 0.5},
    {"name": "v1_notilt",  "divisor": 17, "tilt_scale": 0.0},
    {"name": "v1_pg16",    "divisor": 16, "tilt_scale": 1.0},
]
DEFAULT_CHAMPION = {"version": FORMULA_VERSION_V1, "arm": "v1", "since_week": None}

#: SGO snapshots name teams in full; the board (and the crosswalked component
#: stores) use Sleeper-style codes. Static 32-team map, tested for coverage.
TEAM_NAME_TO_CODE = {
    "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL",
    "Baltimore Ravens": "BAL", "Buffalo Bills": "BUF",
    "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE",
    "Dallas Cowboys": "DAL", "Denver Broncos": "DEN",
    "Detroit Lions": "DET", "Green Bay Packers": "GB",
    "Houston Texans": "HOU", "Indianapolis Colts": "IND",
    "Jacksonville Jaguars": "JAX", "Kansas City Chiefs": "KC",
    "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC",
    "Los Angeles Rams": "LAR", "Miami Dolphins": "MIA",
    "Minnesota Vikings": "MIN", "New England Patriots": "NE",
    "New Orleans Saints": "NO", "New York Giants": "NYG",
    "New York Jets": "NYJ", "Philadelphia Eagles": "PHI",
    "Pittsburgh Steelers": "PIT", "San Francisco 49ers": "SF",
    "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB",
    "Tennessee Titans": "TEN", "Washington Commanders": "WAS",
}
#: nflverse (the vegas store) says LA where the board says LAR.
VEGAS_CODE_TO_BOARD = {"LA": "LAR"}


# ── the week clock (pure) ────────────────────────────────────────────────────

def week_window(week: int) -> tuple[_dt.date, _dt.date]:
    """[start, end) dates of an NFL week: Wednesday to Wednesday, week 1
    opening 2026-09-09 (the day before the Thursday opener)."""
    start = WEEK1_START + _dt.timedelta(days=7 * (week - 1))
    return start, start + _dt.timedelta(days=7)


def current_nfl_week(d: _dt.date) -> int | None:
    """The NFL week containing date d, or None outside the regular season
    (preseason before 2026-09-09; after week 18's window closes)."""
    if d < WEEK1_START:
        return None
    week = (d - WEEK1_START).days // 7 + 1
    return week if week <= N_WEEKS else None


def week_kickoff(week: int) -> _dt.date:
    """The Thursday that opens a week's slate — the forward-guarantee line:
    a snapshot for week w must be committed on or before this date."""
    return WEEK1_KICKOFF + _dt.timedelta(days=7 * (week - 1))


# ── lines -> implied team totals (pure) ──────────────────────────────────────

def implied_from_sgo(doc: dict, week: int) -> dict:
    """{board_team_code: implied_total} from a captured SGO snapshot, using
    only games whose kickoff UTC date falls inside the week's window and which
    carry BOTH implied totals. A game missing either side is absent, never
    zeroed; an unmappable team name is skipped, never guessed."""
    start, end = week_window(week)
    out: dict[str, float] = {}
    for g in doc.get("games") or []:
        kick = str(g.get("kickoff") or "")[:10]
        try:
            kd = _dt.date.fromisoformat(kick)
        except ValueError:
            continue
        if not (start <= kd < end):
            continue
        ih, ia = g.get("implied_home"), g.get("implied_away")
        if ih is None or ia is None:
            continue
        home = TEAM_NAME_TO_CODE.get(str(g.get("home") or ""))
        away = TEAM_NAME_TO_CODE.get(str(g.get("away") or ""))
        if home:
            out[home] = float(ih)
        if away:
            out[away] = float(ia)
    return out


def implied_from_vegas_store(doc: dict, season: int, week: int) -> dict:
    """{board_team_code: implied_total} from the committed closing-lines store.
    Sign convention verified in the store's own _note: spread_line is the
    expected HOME margin, so implied_home = total/2 + spread/2."""
    out: dict[str, float] = {}
    for g in (doc.get("seasons") or {}).get(str(season)) or []:
        if g.get("week") != week:
            continue
        total, spread = g.get("total_line"), g.get("spread_line")
        if total is None or spread is None:
            continue
        home = VEGAS_CODE_TO_BOARD.get(g["home"], g["home"])
        away = VEGAS_CODE_TO_BOARD.get(g["away"], g["away"])
        implied_home = total / 2.0 + spread / 2.0
        out[home] = round(implied_home, 2)
        out[away] = round(total - implied_home, 2)
    return out


def implied_for_week(week: int, season: int, odds_path: Path,
                     vegas_path: Path) -> tuple[dict, str]:
    """(implied-by-team, source name). Captured live lines first, the
    committed closing-lines store as fallback, honest 'none' when neither has
    the week."""
    if odds_path.exists():
        try:
            doc = json.loads(odds_path.read_text())
        except ValueError:
            doc = {}
        imp = implied_from_sgo(doc, week)
        if imp:
            return imp, "sgo_latest"
    if vegas_path.exists():
        try:
            doc = json.loads(vegas_path.read_text())
        except ValueError:
            doc = {}
        imp = implied_from_vegas_store(doc, season, week)
        if imp:
            return imp, "vegas_store"
    return {}, "none"


# ── pricing (pure) ───────────────────────────────────────────────────────────

def arm_formula(arm: dict) -> str:
    """The arm's formula, stated plainly — this string travels in every
    snapshot and grade so no reader ever reverse-engineers an arm."""
    if not arm["tilt_scale"]:
        return f"proj_ownmodel/{arm['divisor']} (no vegas tilt)"
    scale = ("" if arm["tilt_scale"] == 1.0
             else f"{arm['tilt_scale']:g}*")
    return (f"proj_ownmodel/{arm['divisor']} * (1 + {scale}vg[pos]"
            "*(implied_team-mean_implied)/mean_implied), vg from V5_CONFIG")


def price_week(players: list, week: int, implied: dict,
               arms: list | None = None) -> dict:
    """Price every arm for one week. Returns
    {"means": {arm_name: {pid: mean}}, "meta": {pid: {"team","pos","name"}},
     "byes": [pid...], "no_line": {"players": [pid...], "teams": [...]},
     "mean_implied": float|None}.

    Population rules (identical across arms, so grades compare like to like):
    QB/RB/WR/TE with a proj_ownmodel; bye week => ABSENT, not zero; a player
    whose team has no line this week prices at tilt 1.0 in every arm and is
    named here."""
    arms = arms if arms is not None else DEFAULT_ARMS
    mean_imp = (sum(implied.values()) / len(implied)) if implied else None
    means: dict[str, dict] = {a["name"]: {} for a in arms}
    meta: dict[str, dict] = {}
    byes: list[str] = []
    no_line_players: list[str] = []
    no_line_teams: set[str] = set()
    for p in players:
        pos = p.get("position")
        proj = p.get("proj_ownmodel")
        pid = str(p.get("player_id") or "")
        if pos not in POSITIONS or proj is None or not pid:
            continue
        if p.get("bye") == week:
            byes.append(pid)
            continue
        team = p.get("team")
        delta = None
        if mean_imp and team in implied:
            delta = (implied[team] - mean_imp) / mean_imp
        else:
            no_line_players.append(pid)
            if team:
                no_line_teams.add(team)
        for a in arms:
            base = float(proj) / a["divisor"]
            tilt = 1.0
            if delta is not None and a["tilt_scale"]:
                tilt = 1.0 + a["tilt_scale"] * VG[pos] * delta
            means[a["name"]][pid] = round(max(0.0, base * tilt), 2)
        meta[pid] = {"team": team, "pos": pos, "name": p.get("name")}
    return {
        "means": means,
        "meta": meta,
        "byes": sorted(byes, key=lambda x: (len(x), x)),
        "no_line": {"players": sorted(no_line_players, key=lambda x: (len(x), x)),
                    "teams": sorted(no_line_teams)},
        "mean_implied": round(mean_imp, 3) if mean_imp else None,
    }


def build_snapshot(players: list, week: int, season: int, implied: dict,
                   lines_source: str, date: str, champion: dict | None = None,
                   arms: list | None = None) -> dict:
    """The committed snapshot document: _territory first, champion under
    `projections` ({pid: {mean, team, pos}} — the graded contract), challenger
    columns beside it, diagnostics naming season/week/lines source/populations/
    formula version."""
    champion = champion or dict(DEFAULT_CHAMPION)
    arms = arms if arms is not None else DEFAULT_ARMS
    champ_name = champion["arm"]
    if champ_name not in {a["name"] for a in arms}:
        raise ValueError(f"champion arm {champ_name!r} not in the active arm set")
    priced = price_week(players, week, implied, arms)
    champ_means = priced["means"][champ_name]
    projections = {pid: {"mean": champ_means[pid],
                         "team": priced["meta"][pid]["team"],
                         "pos": priced["meta"][pid]["pos"]}
                   for pid in sorted(champ_means, key=lambda x: (len(x), x))}
    challengers = {a["name"]: {pid: priced["means"][a["name"]][pid]
                               for pid in sorted(priced["means"][a["name"]],
                                                 key=lambda x: (len(x), x))}
                   for a in arms if a["name"] != champ_name}
    return {
        "_territory": "TERRITORY: A — produced by draft/weekly_own_projection.py",
        "_note": ("OUR OWN weekly per-player projection, committed BEFORE "
                  "kickoff (the commit timestamp is the forward guarantee) and "
                  "graded by weekly_own_grade.py. A player on bye is ABSENT, "
                  "never zero. Champion + named challenger arms; the loop "
                  "contract lives in draft/data/weekly_own/README.md."),
        "season": season,
        "week": week,
        "date": date,
        "diagnostics": {
            "formula": champion["version"],
            "champion_arm": champ_name,
            "arms": {a["name"]: arm_formula(a) for a in arms},
            "lines_source": lines_source,
            "teams_with_lines": len(implied),
            "mean_implied": priced["mean_implied"],
            "players_priced": len(champ_means),
            "bye_week_absent": {"count": len(priced["byes"]),
                                "player_ids": priced["byes"]},
            "no_line": {"arm": "tilt 1.0 — team has no line this week",
                        "count": len(priced["no_line"]["players"]),
                        "teams": priced["no_line"]["teams"],
                        "player_ids": priced["no_line"]["players"]},
            "vg": dict(VG),
        },
        "projections": projections,
        "challengers": challengers,
        "names": {pid: priced["meta"][pid]["name"]
                  for pid in sorted(priced["meta"], key=lambda x: (len(x), x))
                  if priced["meta"][pid].get("name")},
    }


# ── ledger state (which arm is champion, which arms are active) ──────────────

def ledger_state(ledger_path: Path) -> tuple[dict, list]:
    """(champion, active_arms) from the grades ledger; defaults when the
    ledger does not exist yet (before the first grade) or lacks the keys."""
    if ledger_path.exists():
        try:
            doc = json.loads(ledger_path.read_text())
        except ValueError:
            doc = {}
        champ = doc.get("champion") or dict(DEFAULT_CHAMPION)
        arms = doc.get("active_arms") or [dict(a) for a in DEFAULT_ARMS]
        return champ, arms
    return dict(DEFAULT_CHAMPION), [dict(a) for a in DEFAULT_ARMS]


def read_controls(path: Path) -> dict:
    """Cory's controls (draft/data/weekly_own/controls.json, committed —
    OPTIONAL; absent means defaults). {"auto_adapt": bool (default True),
    "champion_override": arm-name or None}. The consuming code paths:
    weekly_own_grade holds promotions while auto_adapt is false; both the
    snapshot writer and the grader honor champion_override (the champion
    COLUMN prices under the named arm, labeled as an override, and the
    mechanical rule pauses while a human has the wheel)."""
    out = {"auto_adapt": True, "champion_override": None}
    if path.exists():
        try:
            doc = json.loads(path.read_text()) or {}
        except ValueError:
            doc = {}
        if doc.get("auto_adapt") is False:
            out["auto_adapt"] = False
        ov = doc.get("champion_override")
        if isinstance(ov, dict):
            ov = ov.get("arm")
        if isinstance(ov, str) and ov:
            out["champion_override"] = ov
    return out


def apply_override(champion: dict, arms: list, controls: dict) -> tuple[dict, bool]:
    """(effective champion, overridden?). An override names an ACTIVE own arm;
    an unknown name is ignored out loud by the caller (returned un-overridden)
    rather than pricing under a formula nobody defined. An override is an
    overlay, not a version bump — the version string gains a visible
    `+override:<arm>` suffix so no grade ever silently mixes."""
    ov = controls.get("champion_override")
    if not ov or ov == champion["arm"]:
        return champion, False
    if ov not in {a["name"] for a in arms}:
        return champion, False
    return {"version": f"{champion['version']}+override:{ov}", "arm": ov,
            "since_week": champion.get("since_week")}, True


# ── CLI ──────────────────────────────────────────────────────────────────────

def _board_players(path: Path) -> list:
    doc = json.loads(path.read_text())
    return doc.get("players") if isinstance(doc, dict) else doc


def snapshot_path(out_dir: Path, season: int, week: int) -> Path:
    return out_dir / f"own_weekly_{season}_w{week}.json"


def main(argv: list | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    week = season = None
    date = None
    for i, a in enumerate(args):
        if a == "--week" and i + 1 < len(args):
            week = int(args[i + 1])
        if a == "--season" and i + 1 < len(args):
            season = int(args[i + 1])
        if a == "--date" and i + 1 < len(args):
            date = args[i + 1]
    season = season or SEASON
    today = _dt.date.fromisoformat(date) if date else _dt.datetime.now(
        _dt.timezone.utc).date()

    board_path = Path(os.environ.get("OWN_WEEKLY_BOARD")
                      or HERE.parent / "public" / "draft_data.json")
    odds_path = Path(os.environ.get("OWN_WEEKLY_ODDS")
                     or HERE / "data" / "odds" / "sgo_latest.json")
    vegas_path = Path(os.environ.get("OWN_WEEKLY_VEGAS")
                      or HERE / "backtest" / "vegas_lines_2021_2026.json")
    out_dir = Path(os.environ.get("OWN_WEEKLY_OUT_DIR")
                   or HERE / "data" / "weekly_own")
    ledger_path = Path(os.environ.get("OWN_WEEKLY_LEDGER")
                       or out_dir / f"grades_{season}.json")
    controls_path = Path(os.environ.get("OWN_WEEKLY_CONTROLS")
                         or HERE / "data" / "weekly_own" / "controls.json")

    if week is None:
        week = current_nfl_week(today)
        if week is None:
            # Preseason/postseason is a CLEAN SKIP, not a failure — the
            # weekly_proj_snapshot lesson: a job red by design for a month is
            # a job nobody reads.
            print(f"{today} is outside the {season} regular-season week "
                  "windows — nothing to price yet. Exiting clean.")
            return 0

    # NEVER rewrite history: once a week's kickoff Thursday has passed, an
    # existing snapshot is frozen (it is the forward guarantee). A same-day
    # Thursday re-run may refresh it (kickoff is that evening, lines move).
    out_path = snapshot_path(out_dir, season, week)
    if out_path.exists() and today > week_kickoff(week):
        print(f"REFUSING to overwrite {out_path.name}: week {week} kicked off "
              f"{week_kickoff(week)} and the committed snapshot is the "
              "forward guarantee. A post-kickoff rewrite would be a backdated "
              "forecast.")
        return 1

    if not board_path.exists():
        print(f"! board not found at {board_path}; refusing")
        return 1
    players = _board_players(board_path)
    implied, source = implied_for_week(week, season, odds_path, vegas_path)
    champion, arms = ledger_state(ledger_path)
    controls = read_controls(controls_path)
    champion, overridden = apply_override(champion, arms, controls)
    if controls.get("champion_override") and not overridden \
            and controls["champion_override"] != champion["arm"]:
        print(f"! controls name champion_override="
              f"{controls['champion_override']!r} but no active arm has that "
              "name — IGNORED (pricing under the ledger champion instead of a "
              "formula nobody defined)")
    doc = build_snapshot(players, week, season, implied, source,
                         today.isoformat(), champion, arms)
    if overridden:
        doc["diagnostics"]["champion_override"] = True
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(doc, indent=1))
    d = doc["diagnostics"]
    print(f"wrote {out_path}: week {week} of {season}, "
          f"{d['players_priced']} players priced under {d['formula']} "
          f"(champion arm {d['champion_arm']}, {len(doc['challengers'])} "
          f"challengers), lines from {source} "
          f"({d['teams_with_lines']} teams), "
          f"{d['bye_week_absent']['count']} on bye (absent), "
          f"{d['no_line']['count']} priced tilt-1.0 (no line)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
