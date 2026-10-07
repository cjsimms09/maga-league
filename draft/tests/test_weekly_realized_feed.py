"""THE COMPONENT GRADER'S FEED — the file six readers waited for, and its traps.

Cory, 2026-10-07: *"Are we learning?"*

`component_specs.js` declares six rows, `component_run.js` grades all six,
`component_write.js` writes the artifact and `standing-check.yml` runs it daily.
Every one of those works. They all read `draft/data/weekly_realized.json` and
NOTHING HAD EVER WRITTEN IT, so the entire surface reported `no_data` from the
day it was built. `build_weekly_realized.py` is that writer, and the component
grading surface went from 0 of 6 graded to 1 of 6 the moment it ran.

It could not have been written earlier: the feed needs realized weekly
outcomes, and `nflverse_weekly_points_2026.json` did not exist until the
realized fetch was fixed the same day.

── THE TWO THINGS THAT CAN SILENTLY RUIN THIS FEED ────────────────────────────

**A null prior becomes a prediction of ZERO.** `component_run`'s builder maps a
missing prior to `{predicted: null}` and `gradeComponent` computes
`Math.abs(Number(null) - realized)`. `Number(null)` is `0`. Measured in node on
identical pairs: a null baseline scores `effect +10.0` where the true baseline
scores `-2.0`. Every rookie in the feed would manufacture a large fake positive
effect for our own projection. Guarded below.

**A well-formed file of the wrong shape reads as a quiet season.** Register 154
proposed `{week: {player_id: points}}`, which parses perfectly, contains no
arrays, and makes `loadRealized` return `{}` — read by every caller as "nothing
has happened". Guarded below by running the real reader's own rule.

Run: python3 -m pytest draft/tests/test_weekly_realized_feed.py -q
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import build_weekly_realized as B  # noqa: E402

FEED = ROOT / "draft" / "data" / "weekly_realized.json"
SEASON = "2026"


@pytest.fixture(scope="module")
def feed() -> dict:
    if not FEED.exists():
        pytest.skip("the feed has not been written yet")
    return json.loads(FEED.read_text(encoding="utf8"))


@pytest.fixture(scope="module")
def built() -> dict:
    """Freshly built, so these assertions hold for what the NEXT run writes and
    not only for what happens to be committed."""
    return B.build(SEASON)


# ── the trap that would fake a positive result for our own model ────────────

@pytest.mark.parametrize("src", ["committed", "fresh"])
def test_NO_ROW_CARRIES_A_NULL_PRIOR_OR_A_NULL_PROJECTION(src, feed, built):
    """⚠️ THE ONE THAT MATTERS. A null prior is graded as a prediction of zero
    points, which hands our own projection a large fake win.

    Asserted on both the committed artifact and a fresh build: the first checks
    what the graders are reading right now, the second checks the writer.
    """
    doc = feed if src == "committed" else built
    rows = doc["projection"]
    assert rows, "the projection row is empty"
    bad_prior = [r for r in rows if r.get("prior_ppg") is None]
    bad_proj = [r for r in rows if r.get("proj_mean") is None]
    assert not bad_prior, (
        f"{len(bad_prior)} row(s) carry a null prior — each one will be graded "
        f"against a baseline that predicted ZERO (first: {bad_prior[:1]})")
    assert not bad_proj, f"{len(bad_proj)} row(s) carry a null projection"
    assert all(r.get("realized") is not None for r in rows)


def test_CONTROL_the_null_baseline_really_is_graded_as_zero():
    """Rule 3f: the guard above is only worth having if the hazard is real. This
    reproduces it through the shipped JS grader rather than asserting it from
    the source, because `Number(null) === 0` is the kind of claim that is easy
    to state and easy to get backwards."""
    import subprocess
    js = """
    const G = require('./src/component_grade.js');
    const imp = {earning:'e', hurting:'h', noise:'n'};
    const pairs = [{predicted:10, realized:12, cluster:1},
                   {predicted:10, realized:12, cluster:2}];
    const nul = G.gradeComponent({name:'n', material:1, implication:imp, pairs,
                  baseline:[{predicted:null},{predicted:null}]});
    const tru = G.gradeComponent({name:'t', material:1, implication:imp, pairs,
                  baseline:[{predicted:12},{predicted:12}]});
    console.log(JSON.stringify({nul:nul.effect, tru:tru.effect}));
    """
    out = subprocess.run(["node", "-e", js], cwd=str(ROOT), capture_output=True,
                         text=True, timeout=120)
    assert out.returncode == 0, out.stderr
    got = json.loads(out.stdout.strip().splitlines()[-1])
    assert got["nul"] > 0 > got["tru"], (
        f"the hazard did not reproduce: null baseline effect {got['nul']}, true "
        f"baseline effect {got['tru']} — if these now agree, the builder was "
        "fixed and this feed's drop-rows rule can be revisited")


# ── the shape the reader actually wants ─────────────────────────────────────

def test_the_feed_is_COMPONENT_KEYED_ARRAYS_and_survives_the_register_154_guard(feed):
    """Run `component_write.loadRealized`'s own rule: a file with keys but not
    one array is reported as a writer mismatch. A box-score-shaped file parses
    fine and is read as "the season is quiet", which is strictly worse than an
    absent file."""
    keys = list(feed.keys())
    arrays = [k for k in keys if isinstance(feed[k], list)]
    assert arrays, (
        "not one array in the feed — loadRealized would assign nothing and "
        "every caller would read it as an empty season (register 154)")
    assert "projection" in arrays, arrays


def test_the_feed_is_ACCEPTED_by_the_real_reader_not_just_by_this_test():
    """End to end through the shipped JS, because the reader is the authority on
    its own shape. Saves and restores the real path — this suite must not
    consume a committed artifact (registers 315/489/499)."""
    import subprocess
    out = subprocess.run(
        ["node", "-e",
         "const W=require('./src/component_write.js');"
         "const r=W.write(null);"
         "console.log(JSON.stringify({err:r.feed_error,"
         "graded:(r.rows||[]).filter(x=>x.verdict!=='no_data'&&x.verdict!=='no_builder')"
         ".map(x=>x.name)}));"],
        cwd=str(ROOT), capture_output=True, text=True, timeout=300)
    assert out.returncode == 0, out.stderr[-2000:]
    got = json.loads(out.stdout.strip().splitlines()[-1])
    assert got["err"] is None, f"the reader rejected the feed: {got['err']}"
    assert "projection" in got["graded"], (
        f"the feed is accepted but grades nothing: {got['graded']}")


# ── the numbers in it must be the numbers on disk (register 121) ────────────

def test_REALIZED_VALUES_ARE_VERBATIM_from_the_realized_store(built):
    """A feed that transforms the outcome is a feed that can quietly change a
    verdict. These are copied, not computed."""
    store = B.weekly_points(SEASON)
    assert store, "the realized store is missing"
    checked = 0
    for r in built["projection"]:
        want = store[r["week"]][r["player_id"]]
        assert abs(r["realized"] - want) < 1e-9, (
            f"week {r['week']} player {r['player_id']}: feed {r['realized']} "
            f"vs store {want}")
        checked += 1
    assert checked > 100, checked


def test_prior_ppg_is_PER_GAME_APPEARED_and_not_per_seventeen():
    """A player who missed nine games did not average half as much. Dividing by
    a fixed 17 would hand our own projection an easy win against an
    artificially deflated prior, which is the same shape of error as the
    missed-games bias the feed documents."""
    prior = B.prior_per_game("2025")
    assert prior, "no prior season per-game averages"
    store = B.weekly_points("2025")
    totals, games = {}, {}
    for _wk, pts in store.items():
        for pid, v in pts.items():
            totals[pid] = totals.get(pid, 0.0) + v
            games[pid] = games.get(pid, 0) + 1
    # a player who appeared in FEWER than 17 weeks is the discriminating case
    partial = [p for p in prior if games[p] < 17]
    assert partial, "no partial-season players to discriminate with"
    pid = max(partial, key=lambda p: totals[p])
    # 1e-4, not 1e-6: `prior_per_game` rounds to 4 decimals on purpose, so a
    # tighter tolerance tests the rounding rather than the denominator. (It
    # failed at 1e-6 on 25.9137 vs 414.62/16 = 25.913875.)
    assert abs(prior[pid] - totals[pid] / games[pid]) < 1e-4
    assert prior[pid] > totals[pid] / 17 + 1e-9, (
        f"player {pid} played {games[pid]} games; per-game {prior[pid]} must "
        f"exceed per-17 {totals[pid] / 17:.4f}")


def test_the_feed_only_references_weeks_that_were_actually_PLAYED(built):
    weeks = set(B.weekly_points(SEASON))
    assert weeks, "no realized weeks"
    assert {r["week"] for r in built["projection"]} <= weeks
    assert built["provenance"]["weeks"] == sorted(weeks)


def test_the_SCORING_of_the_two_seasons_is_confirmed_COMPARABLE(built):
    """Last season's per-game average is only a fair baseline if both seasons
    were scored under the same rules. Asserted rather than assumed, and the
    writer warns when it is false instead of comparing two different games."""
    pv = built["provenance"]
    assert pv["scoring_fingerprint"], "no scoring fingerprint on the realized store"
    assert pv["scoring_comparable"] is True, (
        f"2026 scored {pv['scoring_fingerprint']} but 2025 scored "
        f"{pv['prior_scoring_fingerprint']} — the prior is not a like-for-like "
        "baseline and the projection verdict rests on it")


def test_the_DIVISOR_matches_the_reader_that_consumes_it():
    """Two halves of one contract. The builder divides `proj_mean` by 17 to
    reach a per-week prediction; if that ever changes, this feed's documented
    bias analysis describes a different quantity."""
    src = (ROOT / "src" / "component_run.js").read_text(encoding="utf8")
    assert f"/ {B.WEEKS_PER_SEASON}" in src or f"/{B.WEEKS_PER_SEASON}" in src, (
        f"component_run.js no longer divides by {B.WEEKS_PER_SEASON} — the "
        "feed's per-week scale and its measured bias no longer line up")


# ── the writer must refuse rather than write a misleading file ──────────────

def test_it_REFUSES_when_there_are_no_realized_weeks(monkeypatch, capsys):
    """An empty feed reads as 'the season is quiet', which is a claim; an absent
    one reads as 'we do not have it yet'. Same discipline as the realized
    workflow's empty-store refusal."""
    monkeypatch.setattr(B, "weekly_points", lambda season: {})
    assert B.main(["--season", "2099", "--dry-run"]) == 1
    assert "no realized weeks" in capsys.readouterr().out


def test_it_NAMES_why_each_ungraded_component_is_absent(built):
    """Five of six rows have no input, and a reader in week 5 needs to know
    WHICH feed is missing rather than seeing a generic no_data. A substituted
    input would be worse than an absent one: a row graded against the wrong
    baseline is a number that looks like a finding."""
    absent = built["_absent"]
    for name in ("opportunity_adj", "consensus", "replacement", "survival",
                 "weekly_claims"):
        assert absent.get(name) and len(absent[name]) > 25, name
    assert "projection" not in absent, \
        "projection is written, so it must not also be listed as absent"


def test_the_METHOD_SENSITIVITY_is_recorded_beside_the_verdict(built):
    """The `projection` verdict reads `noise` under the shipped divisor and
    `hurting` under a de-biased one on the full population, so the full-sample
    reading is not a finding. It IS robust on established players — both
    divisors agree. That evidence has to travel with the feed, or the next
    reader quotes a method-sensitive verdict as a result."""
    ms = built["_method_sensitivity"]
    est = ms["established_players_14plus_games_2025"]
    assert est["proj_mean_over_17"]["verdict"] == "noise"
    assert est["proj_mean_over_games_played_2025"]["verdict"] == "noise"
    allp = ms["all_players"]
    assert allp["proj_mean_over_17"]["verdict"] != \
        allp["proj_mean_over_games_played_2025"]["verdict"], \
        "the full-population arms are recorded as agreeing; if they now do, " \
        "re-measure and rewrite this block rather than deleting the caveat"
    assert "bias" in ms["the_standing_bias"] or "-2.2" in ms["the_standing_bias"]
