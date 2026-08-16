# TERRITORY: A
"""weekly_own_projection — the Thursday pricing, tested claim by claim.

The claims: tilt arithmetic reproduced BY HAND (never by re-running the code
under test); bye week = absent, not zero; no-line teams price at tilt 1.0 and
are NAMED; challenger arms differ from the champion exactly as their formula
strings say; the week clock matches the declared 2026 calendar; output is
deterministic byte for byte; the module imports and prices with the network
physically disabled; main() runs the dry-run path end to end through the same
env overrides the workflow uses; a post-kickoff rewrite is refused; the vg
constants are the graded V5_CONFIG ones, not retypes.
"""
import datetime as dt
import json
import os
import socket
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "draft"))
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import weekly_own_projection as WP  # noqa: E402


def _board(players):
    return {"players": players}


def _player(pid, pos="RB", team="DET", proj=170.0, bye=8, name="Test Player"):
    return {"player_id": pid, "position": pos, "team": team,
            "proj_ownmodel": proj, "bye": bye, "name": name}


# ── vg constants come from the graded config, never retyped ──────────────────

def test_vg_is_the_graded_v5_config():
    from own_model_v5 import V5_CONFIG
    assert WP.VG == {p: V5_CONFIG[p]["vg"] for p in ("QB", "RB", "WR", "TE")}
    # And the values the whole formula stands on, pinned so a silent upstream
    # change is a red test here rather than a silent re-pricing:
    assert WP.VG == {"QB": 0.5, "RB": 0.5, "WR": 0.5, "TE": 0.0}


# ── tilt arithmetic, recomputed by hand ──────────────────────────────────────

def test_tilt_arithmetic_by_hand():
    # Two teams with lines: DET implied 27.0, CHI implied 18.0 -> mean 22.5.
    # RB (vg .5), season 170: 170/17 = 10.0 base.
    #   DET tilt = 1 + .5*(27-22.5)/22.5 = 1.1        -> 11.0
    #   CHI tilt = 1 + .5*(18-22.5)/22.5 = 0.9        -> 9.0
    implied = {"DET": 27.0, "CHI": 18.0}
    players = [_player("1", team="DET"), _player("2", team="CHI")]
    priced = WP.price_week(players, week=1, implied=implied)
    assert priced["means"]["v1"]["1"] == 11.0
    assert priced["means"]["v1"]["2"] == 9.0
    assert priced["mean_implied"] == 22.5


def test_te_has_zero_tilt_by_graded_config():
    # TE vg is 0.0 in the graded config: lines exist, tilt must not move a TE.
    implied = {"DET": 27.0, "CHI": 18.0}
    players = [_player("1", pos="TE", team="DET", proj=136.0)]
    priced = WP.price_week(players, week=1, implied=implied)
    assert priced["means"]["v1"]["1"] == 8.0          # 136/17, untouched


def test_challenger_arms_by_hand():
    implied = {"DET": 27.0, "CHI": 18.0}
    players = [_player("1", team="DET")]              # RB 170, DET delta=+0.2
    priced = WP.price_week(players, week=1, implied=implied)
    # tilt_scale 1.5: 10 * (1 + 1.5*.5*.2) = 11.5
    assert priced["means"]["v1_tilt150"]["1"] == 11.5
    # tilt_scale 0.5: 10 * (1 + .5*.5*.2)  = 10.5
    assert priced["means"]["v1_tilt050"]["1"] == 10.5
    # no tilt: exactly the /17 rate
    assert priced["means"]["v1_notilt"]["1"] == 10.0
    # /16 divisor with full tilt: 170/16 * 1.1 = 11.69 (2dp)
    assert priced["means"]["v1_pg16"]["1"] == round(170 / 16 * 1.1, 2)


def test_populations_are_identical_across_arms():
    implied = {"DET": 27.0, "CHI": 18.0}
    players = [_player("1"), _player("2", team="CHI", bye=1),
               _player("3", team=None)]
    priced = WP.price_week(players, week=1, implied=implied)
    pops = {arm: set(m) for arm, m in priced["means"].items()}
    assert all(p == pops["v1"] for p in pops.values())


# ── bye week: absent, not zero ───────────────────────────────────────────────

def test_bye_week_is_absent_not_zero():
    players = [_player("1", bye=5), _player("2", bye=6)]
    priced = WP.price_week(players, week=5, implied={})
    assert "1" not in priced["means"]["v1"]           # absent — no 0.0 row
    assert "2" in priced["means"]["v1"]
    assert priced["byes"] == ["1"]


# ── no line: tilt 1.0, named ─────────────────────────────────────────────────

def test_no_line_team_prices_at_tilt_one_and_is_named():
    implied = {"DET": 27.0, "CHI": 18.0}
    players = [_player("1", team="SEA")]              # SEA has no line
    priced = WP.price_week(players, week=1, implied=implied)
    assert priced["means"]["v1"]["1"] == 10.0         # 170/17, no tilt
    assert priced["means"]["v1_tilt150"]["1"] == 10.0  # every arm: tilt 1.0
    assert "1" in priced["no_line"]["players"]
    assert "SEA" in priced["no_line"]["teams"]


def test_no_lines_at_all_prices_everyone_flat():
    players = [_player("1"), _player("2", pos="QB", team="KC", proj=340.0)]
    priced = WP.price_week(players, week=1, implied={})
    assert priced["means"]["v1"]["1"] == 10.0
    assert priced["means"]["v1"]["2"] == 20.0
    assert priced["mean_implied"] is None


# ── the lines sources ────────────────────────────────────────────────────────

def test_implied_from_sgo_filters_by_week_window_and_maps_names():
    doc = {"games": [
        {"kickoff": "2026-09-13T17:00:00.000Z", "home": "Detroit Lions",
         "away": "Chicago Bears", "implied_home": 27.0, "implied_away": 18.0},
        {"kickoff": "2026-08-16T00:00:00.000Z", "home": "Seattle Seahawks",
         "away": "Dallas Cowboys", "implied_home": 7.0, "implied_away": 17.5},
        {"kickoff": "2026-09-13T20:00:00.000Z", "home": "Kansas City Chiefs",
         "away": "Buffalo Bills", "implied_home": None, "implied_away": 21.0},
    ]}
    imp = WP.implied_from_sgo(doc, week=1)
    # preseason game outside the window: excluded; game with a missing implied
    # side: BOTH sides excluded from that game (absent, not zero).
    assert imp == {"DET": 27.0, "CHI": 18.0}


def test_implied_from_vegas_store_sign_convention_and_la_rename():
    # spread_line is the expected HOME margin: total 46, spread +4 ->
    # implied_home 25, implied_away 21. LA (nflverse) -> LAR (board).
    doc = {"seasons": {"2026": [
        {"week": 1, "home": "LA", "away": "SEA",
         "spread_line": 4.0, "total_line": 46.0},
        {"week": 2, "home": "KC", "away": "DEN",
         "spread_line": 0.0, "total_line": 40.0},
    ]}}
    imp = WP.implied_from_vegas_store(doc, 2026, 1)
    assert imp == {"LAR": 25.0, "SEA": 21.0}
    assert WP.implied_from_vegas_store(doc, 2026, 2) == {"KC": 20.0, "DEN": 20.0}


def test_implied_for_week_falls_back_sgo_then_vegas_then_none(tmp_path):
    odds = tmp_path / "sgo.json"
    vegas = tmp_path / "vegas.json"
    # No files at all -> none.
    assert WP.implied_for_week(1, 2026, odds, vegas) == ({}, "none")
    # Vegas only -> vegas_store.
    vegas.write_text(json.dumps({"seasons": {"2026": [
        {"week": 1, "home": "KC", "away": "DEN",
         "spread_line": 0.0, "total_line": 40.0}]}}))
    imp, src = WP.implied_for_week(1, 2026, odds, vegas)
    assert src == "vegas_store" and imp["KC"] == 20.0
    # SGO carrying the week wins over the store.
    odds.write_text(json.dumps({"games": [
        {"kickoff": "2026-09-13T17:00:00.000Z", "home": "Kansas City Chiefs",
         "away": "Denver Broncos", "implied_home": 24.0, "implied_away": 19.0}]}))
    imp, src = WP.implied_for_week(1, 2026, odds, vegas)
    assert src == "sgo_latest" and imp["KC"] == 24.0
    # SGO on disk but without this week's games -> store again.
    imp, src = WP.implied_for_week(3, 2026, odds, vegas)
    assert src == "none"


def test_team_name_map_covers_all_32():
    assert len(WP.TEAM_NAME_TO_CODE) == 32
    assert len(set(WP.TEAM_NAME_TO_CODE.values())) == 32


# ── the week clock ───────────────────────────────────────────────────────────

def test_week_clock_matches_the_declared_2026_calendar():
    d = dt.date
    assert WP.current_nfl_week(d(2026, 8, 16)) is None      # preseason
    assert WP.current_nfl_week(d(2026, 9, 8)) is None       # Tue before wk1
    assert WP.current_nfl_week(d(2026, 9, 9)) == 1          # window opens Wed
    assert WP.current_nfl_week(d(2026, 9, 10)) == 1         # kickoff Thursday
    assert WP.current_nfl_week(d(2026, 9, 15)) == 1         # still week 1
    assert WP.current_nfl_week(d(2026, 9, 16)) == 2         # next Wednesday
    assert WP.current_nfl_week(d(2026, 9, 17)) == 2         # Thursday cron
    assert WP.current_nfl_week(d(2027, 1, 6)) == 18
    assert WP.current_nfl_week(d(2027, 1, 13)) is None      # season over
    assert WP.week_kickoff(1) == d(2026, 9, 10)
    assert WP.week_kickoff(2) == d(2026, 9, 17)


# ── snapshot document ────────────────────────────────────────────────────────

def _snapshot(players=None, implied=None, week=1):
    return WP.build_snapshot(
        players if players is not None else [_player("1"), _player("2", team="CHI")],
        week, 2026, implied if implied is not None else {"DET": 27.0, "CHI": 18.0},
        "sgo_latest", "2026-09-10")


def test_snapshot_territory_first_and_contract_shape():
    doc = _snapshot()
    assert next(iter(doc)) == "_territory"
    assert doc["diagnostics"]["formula"] == "own_weekly_v1"
    row = doc["projections"]["1"]
    assert set(row) == {"mean", "team", "pos"}                # the contract
    assert doc["diagnostics"]["lines_source"] == "sgo_latest"
    assert doc["diagnostics"]["players_priced"] == 2
    # challenger columns present, champion not duplicated among them
    assert set(doc["challengers"]) == {"v1_tilt150", "v1_tilt050",
                                       "v1_notilt", "v1_pg16"}
    assert doc["names"]["1"] == "Test Player"


def test_snapshot_rounding_is_2dp():
    doc = _snapshot(players=[_player("1", proj=100.0)],
                    implied={"DET": 23.0, "CHI": 22.0})
    for arm_map in [doc["projections"]] + list(doc["challengers"].values()):
        for v in arm_map.values():
            mean = v["mean"] if isinstance(v, dict) else v
            assert mean == round(mean, 2)


def test_determinism_byte_for_byte():
    a = json.dumps(_snapshot(), indent=1)
    b = json.dumps(_snapshot(), indent=1)
    assert a == b


def test_champion_override_is_applied_and_labeled():
    champ, over = WP.apply_override(dict(WP.DEFAULT_CHAMPION), WP.DEFAULT_ARMS,
                                    {"champion_override": "v1_notilt"})
    assert over and champ["arm"] == "v1_notilt"
    assert champ["version"] == "own_weekly_v1+override:v1_notilt"
    # unknown arm: ignored, not priced under a formula nobody defined
    champ, over = WP.apply_override(dict(WP.DEFAULT_CHAMPION), WP.DEFAULT_ARMS,
                                    {"champion_override": "v9_wat"})
    assert not over and champ["arm"] == "v1"


def test_read_controls_defaults_and_values(tmp_path):
    p = tmp_path / "controls.json"
    assert WP.read_controls(p) == {"auto_adapt": True, "champion_override": None}
    p.write_text(json.dumps({"auto_adapt": False,
                             "champion_override": {"arm": "v1_pg16"}}))
    assert WP.read_controls(p) == {"auto_adapt": False,
                                   "champion_override": "v1_pg16"}


# ── zero-network import ──────────────────────────────────────────────────────

def test_module_imports_and_prices_with_the_network_disabled():
    """Run the import + a pricing in a subprocess whose socket.socket raises —
    the honest version of 'zero-network', enforced rather than asserted."""
    code = (
        "import socket\n"
        "def _no(*a, **k): raise AssertionError('network attempted')\n"
        "socket.socket = _no\n"
        "socket.create_connection = _no\n"
        "import sys\n"
        f"sys.path.insert(0, {str(ROOT / 'draft')!r})\n"
        f"sys.path.insert(0, {str(ROOT / 'draft' / 'backtest')!r})\n"
        "import weekly_own_projection as WP\n"
        "p = WP.price_week([{'player_id': '1', 'position': 'RB',\n"
        "                    'team': 'DET', 'proj_ownmodel': 170.0, 'bye': 8}],\n"
        "                  1, {'DET': 27.0, 'CHI': 18.0})\n"
        "assert p['means']['v1']['1'] == 11.0\n"
        "print('OK')\n"
    )
    r = subprocess.run([sys.executable, "-c", code], capture_output=True,
                       text=True, timeout=120)
    assert r.returncode == 0, r.stderr
    assert "OK" in r.stdout
    assert socket  # the import above is the reminder of what this test is for


# ── main(): the exact dry-run path the workflow drives ───────────────────────

def _write_fixtures(tmp_path):
    board = tmp_path / "board.json"
    board.write_text(json.dumps(_board([
        _player("1", team="DET"), _player("2", team="CHI"),
        _player("3", team="SEA"),                    # no line
        _player("4", team="DET", bye=1),             # on bye in week 1
    ])))
    odds = tmp_path / "sgo_latest.json"
    odds.write_text(json.dumps({"games": [
        {"kickoff": "2026-09-13T17:00:00.000Z", "home": "Detroit Lions",
         "away": "Chicago Bears", "implied_home": 27.0, "implied_away": 18.0}]}))
    vegas = tmp_path / "vegas.json"
    vegas.write_text(json.dumps({"seasons": {"2026": []}}))
    return board, odds, vegas


def _env(tmp_path, out_dir):
    board, odds, vegas = _write_fixtures(tmp_path)
    return {"OWN_WEEKLY_BOARD": str(board), "OWN_WEEKLY_ODDS": str(odds),
            "OWN_WEEKLY_VEGAS": str(vegas), "OWN_WEEKLY_OUT_DIR": str(out_dir),
            "OWN_WEEKLY_CONTROLS": str(tmp_path / "controls.json")}


def _run_main(argv, env):
    old = {k: os.environ.get(k) for k in env}
    os.environ.update(env)
    try:
        return WP.main(argv)
    finally:
        for k, v in old.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


def test_main_dry_run_end_to_end(tmp_path):
    out_dir = tmp_path / "out"
    rc = _run_main(["--week", "1", "--date", "2026-09-10"],
                   _env(tmp_path, out_dir))
    assert rc == 0
    out = out_dir / "own_weekly_2026_w1.json"
    assert out.exists()
    doc = json.loads(out.read_text())
    assert next(iter(doc)) == "_territory"
    assert doc["week"] == 1 and doc["season"] == 2026
    assert set(doc["projections"]) == {"1", "2", "3"}      # bye player absent
    assert doc["diagnostics"]["bye_week_absent"]["player_ids"] == ["4"]
    assert doc["diagnostics"]["no_line"]["player_ids"] == ["3"]
    assert doc["projections"]["1"]["mean"] == 11.0          # the hand number


def test_main_preseason_is_a_clean_skip(tmp_path):
    out_dir = tmp_path / "out"
    rc = _run_main(["--date", "2026-08-20"], _env(tmp_path, out_dir))
    assert rc == 0
    assert not out_dir.exists()                             # nothing written


def test_main_refuses_post_kickoff_rewrite(tmp_path):
    out_dir = tmp_path / "out"
    env = _env(tmp_path, out_dir)
    assert _run_main(["--week", "1", "--date", "2026-09-10"], env) == 0
    # Friday after kickoff: the committed snapshot is frozen history.
    assert _run_main(["--week", "1", "--date", "2026-09-11"], env) == 1
    # Same-day Thursday re-run stays allowed (lines move before kickoff).
    assert _run_main(["--week", "1", "--date", "2026-09-10"], env) == 0


def test_main_honors_champion_override(tmp_path):
    out_dir = tmp_path / "out"
    env = _env(tmp_path, out_dir)
    Path(env["OWN_WEEKLY_CONTROLS"]).write_text(
        json.dumps({"champion_override": "v1_notilt"}))
    assert _run_main(["--week", "1", "--date", "2026-09-10"], env) == 0
    doc = json.loads((out_dir / "own_weekly_2026_w1.json").read_text())
    assert doc["diagnostics"]["champion_arm"] == "v1_notilt"
    assert doc["diagnostics"]["champion_override"] is True
    assert doc["diagnostics"]["formula"] == "own_weekly_v1+override:v1_notilt"
    # the champion column is now the untitled rate; v1 moved to challengers
    assert doc["projections"]["1"]["mean"] == 10.0
    assert "v1" in doc["challengers"]


# ── the workflow YAMLs parse (a broken workflow fails SILENTLY on GitHub) ────

def test_own_weekly_workflow_yamls_parse_and_carry_dry_run():
    import yaml
    for name, cron in (("own-weekly-proj.yml", "0 14 * * 4"),
                       ("own-weekly-grade.yml", "0 6 * * 2")):
        doc = yaml.safe_load((ROOT / ".github" / "workflows" / name).read_text())
        assert isinstance(doc, dict) and "jobs" in doc
        on = doc.get("on") or doc.get(True)
        assert "workflow_dispatch" in on
        assert "dry_run" in on["workflow_dispatch"]["inputs"]
        assert {"cron": cron} in on["schedule"]
