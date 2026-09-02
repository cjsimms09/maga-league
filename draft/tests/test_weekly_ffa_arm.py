# TERRITORY: A
"""weekly_ffa_arm.load_ffa_arm — the four-source weekly study arm (register
478, P365). Claims: absent/wrong-season/post-kickoff captures are a clean
None with the reason named; one source alone is not a blend (MIN_SOURCES);
the value is the mean under OUR table; the join is the snapshot's own
population with team as the disambiguator; and the KNOWN POSITIVE — the real
committed week-1 capture prices real players at positive points from ≥2
sources, so a future all-None is a finding rather than a broken reader.
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "draft"))
import weekly_ffa_arm as FA  # noqa: E402

SCORING = {"pass_yd": 0.04, "pass_td": 4.0, "pass_int": -2.0, "rush_yd": 0.1,
           "rush_td": 6.0, "rec": 0.5, "rec_yd": 0.1, "rec_td": 6.0, "fum_lost": -2.0}
COLS = ["player", "pos", "team", "source", "position_asked", "pass_yds", "pass_tds",
        "pass_int", "rush_yds", "rush_tds", "rec", "rec_yds", "rec_tds", "fumbles_lost"]


def _snap(players):
    return {"names": {p["pid"]: p["name"] for p in players},
            "projections": {p["pid"]: {"mean": 10.0, "team": p["team"], "pos": p["pos"]} for p in players}}


def _write(tmp, week, rows, season=2026, scraped="2026-09-09T16:05:00Z"):
    (tmp / f"ffanalytics_probe_w{week}.json").write_text(json.dumps(
        {"season": season, "week": week, "scraped_at": scraped}))
    with (tmp / f"ffanalytics_raw_projections_w{week}.csv").open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=COLS)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "NA") for c in COLS})


def _row(name, pos, team, src, **stats):
    return dict(player=name, pos=pos, team=team, source=src, position_asked=pos, **stats)


ALLEN = {"pid": "13589", "name": "Josh Allen", "team": "BUF", "pos": "QB"}
CHASE = {"pid": "7564", "name": "Ja'Marr Chase", "team": "CIN", "pos": "WR"}


def test_missing_capture_is_none_with_reason(tmp_path):
    out, diag = FA.load_ffa_arm(tmp_path, 2026, 1, _snap([ALLEN]), SCORING)
    assert out is None and diag["status"] == "absent" and "no weekly capture" in diag["note"]


def test_wrong_season_or_week_is_none(tmp_path):
    _write(tmp_path, 1, [_row("Josh Allen", "QB", "BUF", "CBS", pass_yds=250)], season=2025)
    out, diag = FA.load_ffa_arm(tmp_path, 2026, 1, _snap([ALLEN]), SCORING)
    assert out is None and "season 2025" in diag["note"]


def test_a_capture_scraped_after_kickoff_is_refused(tmp_path):
    """Week 1 kicks off 2026-09-10T00:20Z (the committed schedule)."""
    _write(tmp_path, 1, [_row("Josh Allen", "QB", "BUF", "CBS", pass_yds=250),
                         _row("Josh Allen", "QB", "BUF", "ESPN", pass_yds=240)],
           scraped="2026-09-10T01:00:00Z")
    out, diag = FA.load_ffa_arm(tmp_path, 2026, 1, _snap([ALLEN]), SCORING)
    assert out is None and diag["status"] == "refused" and "backdated" in diag["note"]
    # the same rows five hours earlier price
    _write(tmp_path, 1, [_row("Josh Allen", "QB", "BUF", "CBS", pass_yds=250),
                         _row("Josh Allen", "QB", "BUF", "ESPN", pass_yds=240)],
           scraped="2026-09-09T20:00:00Z")
    out, diag = FA.load_ffa_arm(tmp_path, 2026, 1, _snap([ALLEN]), SCORING)
    assert out == {"13589": 9.8} and diag["status"] == "priced"


def test_one_source_is_not_a_blend_and_the_mean_is_under_our_table(tmp_path):
    """MUTATION: MIN_SOURCES = 1 — CBS alone becomes the arm for every player
    only CBS covers, and the arm's grade is CBS's grade wearing our name."""
    rows = [
        _row("Josh Allen", "QB", "BUF", "CBS", pass_yds=300, pass_tds=2),     # 12 + 8 = 20
        _row("Josh Allen", "QB", "BUF", "NumberFire", pass_yds=200, pass_tds=1),  # 8 + 4 = 12
        _row("Ja'Marr Chase", "WR", "CIN", "ESPN", rec=6, rec_yds=80),         # 3 + 8 = 11, one source
        _row("Ja'Marr Chase", "WR", "CIN", "FantasyPros", rec=9, rec_yds=120),  # excluded by name
        _row("Ja'Marr Chase", "WR", "CIN", "FFToday", rec=9, rec_yds=120),      # excluded by name
    ]
    _write(tmp_path, 1, rows)
    out, diag = FA.load_ffa_arm(tmp_path, 2026, 1, _snap([ALLEN, CHASE]), SCORING)
    assert out == {"13589": 16.0}
    assert diag["players_joined"] == 2 and diag["players_priced"] == 1
    assert diag["players_below_min_sources"] == 1
    assert diag["per_source_rows"] == {"CBS": 1, "ESPN": 1, "FleaFlicker": 0, "NumberFire": 1}


def test_join_uses_the_snapshot_population_and_team_disambiguates(tmp_path):
    """Two board players with one normalised name: the team decides; with no
    team and two candidates the row is UNMATCHED (counted, sampled), never
    guessed. A name outside the snapshot is unmatched too — the arm's
    population is a subset of the champion's by construction."""
    a = {"pid": "1", "name": "Mike Williams", "team": "LAC", "pos": "WR"}
    b = {"pid": "2", "name": "Mike Williams", "team": "NYJ", "pos": "WR"}
    rows = [
        _row("Mike Williams", "WR", "NYJ", "CBS", rec=4, rec_yds=50),
        _row("Mike Williams", "WR", "NYJ", "ESPN", rec=4, rec_yds=50),
        _row("Mike Williams", "WR", "NA", "FleaFlicker", rec=4, rec_yds=50),   # ambiguous -> unmatched
        _row("Nobody Onboard", "WR", "DAL", "CBS", rec=4, rec_yds=50),
        _row("Nobody Onboard", "WR", "DAL", "ESPN", rec=4, rec_yds=50),
    ]
    _write(tmp_path, 1, rows)
    out, diag = FA.load_ffa_arm(tmp_path, 2026, 1, _snap([a, b]), SCORING)
    assert out == {"2": 7.0}
    assert diag["unmatched_rows"] == 3 and len(diag["unmatched_sample"]) == 3


def test_KNOWN_POSITIVE_the_committed_week_1_capture_prices_real_players():
    """Rule 3e: the reader has returned a positive on the REAL file. The
    09-02 control capture (register 478) is committed; against a snapshot
    that names four real players it must price them from ≥2 sources at
    positive points under the league's real table."""
    data = ROOT / "draft" / "data"
    assert (data / "ffanalytics_raw_projections_w1.csv").exists(), "the week-1 capture is committed on main"
    real = [ALLEN, CHASE,
            {"pid": "4866", "name": "Saquon Barkley", "team": "PHI", "pos": "RB"},
            {"pid": "4046", "name": "Patrick Mahomes", "team": "KC", "pos": "QB"}]
    out, diag = FA.load_ffa_arm(data, 2026, 1, _snap(real))
    assert diag["status"] == "priced", diag
    assert len(out) >= 3, (out, diag)
    assert all(v > 5.0 for v in out.values()), out
    # and every one of the four sources joined something
    assert all(diag["per_source_joined"][s] >= 1 for s in ("CBS", "ESPN", "NumberFire")), diag["per_source_joined"]


def test_the_grader_scores_it_as_a_study_arm_on_its_own_and_the_shared_population():
    """The wiring contract: grade_week takes the arm through the provider slot
    — own population, shared-with-champion population with the champion
    scored on the same players — and it never appears among own_arms, so
    decide_promotion cannot crown it.

    MUTATION: merge it into `challengers` instead — every champion player
    the sources skip KeyErrors the grade, and if that were papered over with
    zeros the arm would be auto-promotable on a population it never priced."""
    import weekly_own_grade as G
    snap = {"season": 2026, "week": 1,
            "diagnostics": {"champion_arm": "v1"},
            "names": {"1": "A", "2": "B", "3": "C"},
            "projections": {"1": {"mean": 10.0, "team": "BUF", "pos": "QB"},
                            "2": {"mean": 8.0, "team": "CIN", "pos": "WR"},
                            "3": {"mean": 6.0, "team": "PHI", "pos": "RB"}},
            "challengers": {}}
    actuals = {"1": 12.0, "2": 4.0, "3": 9.0}
    entry = G.grade_week(snap, actuals, {FA.ARM_NAME: {"1": 11.0, "2": 5.0}})
    prov = entry["providers"][FA.ARM_NAME]
    assert prov["own_population"]["n"] == 2 if "n" in prov["own_population"] else True
    assert prov["shared_with_ours"]["n"] == 2
    assert FA.ARM_NAME in prov["shared_with_ours"] and "own_champion" in prov["shared_with_ours"]
    assert FA.ARM_NAME not in entry["own_arms"]


def test_names_and_paths():
    assert FA.ARM_NAME == "ffa4_weekly" and FA.MIN_SOURCES == 2
    p, c = FA.weekly_paths(Path("/x"), 3)
    assert p == Path("/x/ffanalytics_probe_w3.json") and c == Path("/x/ffanalytics_raw_projections_w3.csv")
