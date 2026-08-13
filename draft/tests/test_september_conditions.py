# TERRITORY: C
"""THE SEPTEMBER COMMITMENT, MADE FALSIFIABLE.

Cory recorded three conditions and one requirement about them (2026-08-13):

    1. INGEST EMITS projected / absent / imputed PER FIELD.
    2. DERIVED VALUES ARE NULL WHEN AN INPUT IS ABSENT — never a fabricated numeric.
    3. THE ENGINE READS STATUS rather than inferring missingness from value.

    "Not 'improve status handling'. All three must hold, and A CHECK MUST BE ABLE TO
     FAIL ON EACH ONE ALONE."

That last clause is the whole specification, and it is why this exists now rather
than in September. A commitment with a check that currently fails RED is a
commitment; one without a check is a note. So the check ships first, reporting the
honest starting state, and September is when its colour changes.

THE TRAP CORY NAMED, AND CONDITION 2 ALONE IS WORSE THAN THE DEFECT. The engine reads
`p.vorp || 0` at engine.js:572, :981 and :992. `null || 0` is `0`, which is ABOVE the
-172.7 these players carry today — so shipping condition 2 without condition 3 would
PROMOTE all 1,183 unprojected players above every real negative-VORP player. The check
therefore reports 2 and 3 separately AND reports the pair, because "2 alone is green"
is the most dangerous state this can be in.

AND IT CANNOT GO GREEN VACUOUSLY (rule 13f). Handed no board, every condition reports
`uncounted`, never `pass` — a check that can only say "nothing yet" has not looked.

Run: python3 -m pytest draft/tests/test_september_conditions.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import september_conditions as S  # noqa: E402


def player(**kw):
    p = {"player_id": "1", "proj_mean": 100.0, "vorp": 12.0}
    p.update(kw)
    return p


# ── each condition fails ALONE, which is the specification ──────────────────
def test_CONDITION_1_fails_when_a_field_carries_no_STATUS():
    """Ingest must emit a status PER FIELD, not a report about the batch.
    MUTATION: accept a board with field_population attached — that is a report ABOUT
    the data, which is what we already have, and it is not what was committed."""
    r = S.check([player()], engine_src="p.vorp ?? null")
    assert r["conditions"]["1"]["status"] == "fail"
    assert "status" in r["conditions"]["1"]["why"].lower()

    ok = S.check([player(proj_mean_status="projected", vorp_status="derived")],
                 engine_src="p.vorp ?? null")
    assert ok["conditions"]["1"]["status"] == "pass"


def test_CONDITION_2_fails_when_a_DERIVED_value_is_a_NUMBER_off_an_ABSENT_input():
    """The 1,181-player tie block in one line: proj_mean absent, vorp a real
    negative number. MUTATION: only check that the field exists — a fabricated
    numeric passes and the whole defect survives the commitment."""
    bad = player(proj_mean=None, proj_mean_status="absent",
                 vorp=-172.67, vorp_status="derived")
    r = S.check([bad], engine_src="p.vorp ?? null")
    assert r["conditions"]["2"]["status"] == "fail"
    assert "-172.67" in r["conditions"]["2"]["why"] or "vorp" in r["conditions"]["2"]["why"]

    good = player(proj_mean=None, proj_mean_status="absent",
                  vorp=None, vorp_status="absent")
    assert S.check([good], engine_src="p.vorp ?? null")["conditions"]["2"]["status"] == "pass"


def test_CONDITION_3_fails_on_a_VALUE_COALESCE_in_the_engine():
    """`p.vorp || 0` infers missingness from value. MUTATION: look for the word
    `status` anywhere in the source — the engine mentions it in a comment and the
    condition goes green while the coalesce is still live."""
    r = S.check([player(proj_mean_status="projected", vorp_status="derived")],
                engine_src="const v = p.vorp || 0;")
    assert r["conditions"]["3"]["status"] == "fail"
    assert "||" in r["conditions"]["3"]["why"]


# ── the pair, because 2 alone is worse than neither ─────────────────────────
def test_CONDITION_2_PASSING_ALONE_IS_REPORTED_AS_A_HAZARD_not_a_win():
    """CORY'S EXPLICIT WARNING. null || 0 is 0, which outranks -172.7, so a null
    VORP without condition 3 PROMOTES all 1,183 above every real negative-VORP
    player. MUTATION: report the three independently and stop — the most dangerous
    single state this system can occupy reads as two-thirds done."""
    r = S.check([player(proj_mean=None, proj_mean_status="absent",
                        vorp=None, vorp_status="absent")],
                engine_src="const v = p.vorp || 0;")
    assert r["conditions"]["2"]["status"] == "pass"
    assert r["conditions"]["3"]["status"] == "fail"
    assert r["hazard"] is True
    assert "promot" in r["hazard_why"].lower() or "|| 0" in r["hazard_why"]


def test_no_hazard_when_BOTH_2_and_3_hold():
    r = S.check([player(proj_mean=None, proj_mean_status="absent",
                        vorp=None, vorp_status="absent")],
                engine_src="const v = p.vorp ?? null;")
    assert r["hazard"] is False


# ── rule 13f: it cannot go green on nothing ─────────────────────────────────
def test_AN_EMPTY_BOARD_REPORTS_UNCOUNTED_NEVER_PASS():
    """A check that can only say 'nothing yet' has not looked. MUTATION: return
    pass on an empty board — every condition goes green the day the artifact is
    missing, which is the one day you most need it to shout."""
    r = S.check([], engine_src="p.vorp ?? null")
    # 1 and 2 are claims about the BOARD; with no board they are unknown. 3 is a
    # claim about the ENGINE and the source WAS supplied, so it is legitimately
    # judged — asserting all three uncounted was a fixture that did not know which
    # condition reads which input.
    for k in ("1", "2"):
        assert r["conditions"][k]["status"] == "uncounted", k
    assert r["ok"] is False, "an uncounted condition is never a pass"


def test_a_MISSING_engine_source_is_UNCOUNTED_not_a_pass():
    """Condition 3 is a claim about the engine. With no engine to read, it is
    unknown. MUTATION: treat absent source as clean — the condition passes because
    nothing was examined."""
    r = S.check([player(proj_mean_status="projected", vorp_status="derived")],
                engine_src=None)
    assert r["conditions"]["3"]["status"] == "uncounted"
    assert r["ok"] is False


def test_ok_is_TRUE_only_when_all_three_pass_and_none_are_uncounted():
    r = S.check([player(proj_mean=None, proj_mean_status="absent",
                        vorp=None, vorp_status="absent")],
                engine_src="const v = p.vorp ?? null;")
    assert all(r["conditions"][k]["status"] == "pass" for k in "123")
    assert r["ok"] is True and r["hazard"] is False


def test_CONDITION_1_distinguishes_NO_STATUS_from_a_BAD_STATUS():
    """Two different failures, and they need different messages: a field with no
    status at all is ingest not emitting one; a field carrying `guessed` is ingest
    emitting a status nobody defined.

    THIS TEST EXISTS BECAUSE THE FIRST VERSION HAD NEITHER. The missing-status
    branch was unreachable in practice — a field with no status ALSO failed the
    valid-status branch, so deleting the missing-status check killed no test and the
    condition-1 test was passing on the other branch's verdict. Mutation testing
    found it; the fix was to the module, not the test."""
    no_status = S.check([player()], engine_src="p.vorp ?? null")["conditions"]["1"]
    bad_status = S.check([player(proj_mean_status="guessed", vorp_status="derived")],
                         engine_src="p.vorp ?? null")["conditions"]["1"]
    assert no_status["status"] == "fail" and bad_status["status"] == "fail"
    assert "_status" in no_status["why"], no_status
    assert "guessed" in bad_status["why"], bad_status
    assert no_status["why"] != bad_status["why"]


def test_CONDITION_2_is_UNCOUNTED_when_NOTHING_IS_ABSENT_to_test_against():
    """RULE 13F, BITING MY OWN CHECKER — found by running it against the real board.

    On the 2026 board `proj_mean` is populated 100%: the unprojected players carry
    0.0, not None. So there are NO absent inputs, condition 2 has nothing to judge,
    and it reported PASS. That pass is not evidence — it is the checker saying
    'nothing yet' in a voice that sounds like success, on a board whose defining
    defect is that absence is stored as zero.

    Worse, it made `hazard` fire on a vacuous pass, so the most alarming flag in the
    report was resting on the emptiest evidence in it.

    MUTATION: return pass when no input is absent — the condition can never fail on
    the exact board it was written for."""
    all_present = [player(proj_mean=100.0, proj_mean_status="projected",
                          vorp=12.0, vorp_status="derived")]
    r = S.check(all_present, engine_src="const v = p.vorp || 0;")
    assert r["conditions"]["2"]["status"] == "uncounted", r["conditions"]["2"]
    assert "absent" in r["conditions"]["2"]["why"].lower()
    assert r["ok"] is False
    assert r["hazard"] is False, "a vacuous pass must not raise the hazard flag"
