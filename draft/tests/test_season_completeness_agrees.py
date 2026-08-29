# TERRITORY: A
"""THE TWO IMPLEMENTATIONS OF "HAS THIS SEASON BEEN PLAYED" MUST AGREE.

Register 419 needed the predicate in JavaScript (`objective_dp.js`,
`roster_builder_replay.js`, `waiver_realized_level.js`); register 420 needed
it in Python (`exp25_deadzone.load_picks`, shared by three studies). Two
languages, so two implementations — `draft/tools/season_completeness.js` and
`draft/tools/season_completeness.py`.

⚠️ THAT IS A RISK, NOT A DESIGN. Register 408's lesson was that a predicate
shipped more than once drifts; the answer there was one module, and here one
module is impossible. So the duplication is made VISIBLE instead: this file
asserts the two give the same verdict for every season in the live
`league_history.json`, and for the fixtures that pin the date trap.

A divergence is then a red test rather than two tools quietly disagreeing
about which seasons count — which, given the whole point is that a wrong
season silently enters a measurement, is the failure that would hurt most.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT / "draft" / "tools"))

from season_completeness import is_complete_season  # noqa: E402

JS = ROOT / "draft" / "tools" / "season_completeness.js"
HISTORY = ROOT / "draft" / "data" / "league_history.json"


def _js_verdicts(seasons: list) -> dict:
    """Ask the JS module directly, so what is compared is the shipped code
    rather than a Python restatement of what it is believed to do."""
    script = (
        "const {isCompleteSeason}=require(process.argv[1]);"
        "const s=JSON.parse(require('fs').readFileSync(process.argv[2],'utf8'));"
        "const out={};s.forEach((x,i)=>{out[x.season!==undefined?x.season:i]="
        "isCompleteSeason(x)});console.log(JSON.stringify(out));"
    )
    tmp = HERE / "_season_agree_fixture.json"
    tmp.write_text(json.dumps(seasons))
    try:
        p = subprocess.run(["node", "-e", script, str(JS), str(tmp)],
                           cwd=str(ROOT), capture_output=True, text=True, timeout=120)
        if p.returncode != 0:
            pytest.fail(f"the JS module would not run: {p.stderr[-400:]}")
        return json.loads(p.stdout)
    finally:
        tmp.unlink(missing_ok=True)


def test_the_two_implementations_agree_on_the_live_history():
    seasons = json.loads(HISTORY.read_text())["seasons"]
    js = _js_verdicts(seasons)
    py = {s["season"]: is_complete_season(s) for s in seasons}
    assert js == py, f"JS {js} vs Python {py}"


def test_the_live_history_exercises_BOTH_answers_so_the_agreement_is_not_vacuous():
    """Two implementations that both say True to everything also agree."""
    seasons = json.loads(HISTORY.read_text())["seasons"]
    py = [is_complete_season(s) for s in seasons]
    assert any(py) and not all(py), (
        "the live history is all-complete or all-incomplete, so the agreement "
        "test above proves nothing; add a fixture case")


def test_the_date_trap_is_pinned_in_BOTH_languages():
    """ONE scored week of eighteen must not count, in either implementation.

    This is the assertion that stops 2026-09-10 from silently re-opening
    register 419 — on that date 2026 gets its first real week, and an
    "any week scored" predicate would let a full-season measurement run on
    1 of 18.
    """
    zeros = {"season": "2026",
             "weeks": {str(i): [{"points": 0}] for i in range(1, 19)}}
    one = json.loads(json.dumps(zeros))
    one["weeks"]["1"] = [{"points": 101.5}]
    allw = json.loads(json.dumps(zeros))
    allw["weeks"] = {str(i): [{"points": 101.5}] for i in range(1, 19)}

    fixtures = [dict(zeros, season="z"), dict(one, season="one"),
                dict(allw, season="all")]
    js = _js_verdicts(fixtures)
    py = {f["season"]: is_complete_season(f) for f in fixtures}

    assert py == {"z": False, "one": False, "all": True}, py
    assert js == py, f"JS {js} vs Python {py}"
