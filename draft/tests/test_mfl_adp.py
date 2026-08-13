"""MFL ADP parser + crosswalk — pure, no egress.
Run: python -m pytest draft/tests/test_mfl_adp.py -q
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import mfl_adp as M  # noqa: E402


ADP = {"adp": {"totalDrafts": "5011", "totalPicks": "1346", "player": [
    {"id": "13593", "averagePick": "1.5", "draftsSelectedIn": "5000"},
    {"id": "11192", "averagePick": "2.3", "draftsSelectedIn": "4980"},
    {"id": "99999", "averagePick": "40.1", "draftsSelectedIn": "12"},   # unknown id
]}}
PLAYERS = {"players": {"player": [
    {"id": "13593", "name": "Jefferson, Justin", "position": "WR", "team": "MIN"},
    {"id": "11192", "name": "McCaffrey, Christian", "position": "RB", "team": "SF"},
]}}


def test_join_resolves_names_and_sorts_by_adp():
    rows = M.parse(ADP, PLAYERS)
    assert rows[0]["name"] == "Justin Jefferson" and rows[0]["position"] == "WR"
    assert rows[0]["adp"] == 1.5 and rows[1]["adp"] == 2.3        # sorted ascending
    assert rows[1]["name"] == "Christian McCaffrey"


def test_name_normalization_last_first_to_first_last():
    assert M._norm_name("Jefferson, Justin") == "Justin Jefferson"
    assert M._norm_name("Kupp, Cooper") == "Cooper Kupp"
    assert M._norm_name("Mr. Irrelevant") == "Mr. Irrelevant"    # no comma -> unchanged


def test_unknown_id_kept_but_unnamed_and_coverage_reports_it():
    rows = M.parse(ADP, PLAYERS)
    unknown = [r for r in rows if r["mfl_id"] == "99999"][0]
    assert unknown["name"] is None                                # unresolved, not dropped
    cov = M.coverage(rows)
    assert cov["rows"] == 3 and cov["named"] == 2                 # 2 of 3 resolved
    assert cov["named_frac"] == round(2 / 3, 3)


def test_accepts_json_strings_and_field_variants():
    import json
    adp_variant = {"adp": {"player": [{"id": "1", "adp": "5.0"}]}}   # 'adp' not 'averagePick'
    players = {"players": {"player": {"id": "1", "name": "Solo, Han", "position": "QB"}}}  # single dict
    rows = M.parse(json.dumps(adp_variant), json.dumps(players))
    assert len(rows) == 1 and rows[0]["adp"] == 5.0 and rows[0]["name"] == "Han Solo"


def test_missing_adp_value_is_skipped():
    adp = {"adp": {"player": [{"id": "1"}, {"id": "2", "averagePick": "3.0"}]}}
    rows = M.parse(adp, PLAYERS)
    assert len(rows) == 1 and rows[0]["mfl_id"] == "2"


# ── DISPERSION, WHICH THE SOURCE PUBLISHES AND WE HAVE BEEN THROWING AWAY ────
#
# A's finding, 2026-08-13: 83% of the priced board carries one of two adp_sd
# values. `adp.fitted_sd` is `max(3.0, min(0.15*adp, 15.0))`, so every player at
# adp >= 100 gets EXACTLY 15.00; the search_rank fallback is
# `max(8.0, min(0.25*adp, 30.0))` over `adp = ffc_max + rank`, which is always
# >= 120, so that whole population gets EXACTLY 30.00 by construction. A clamp
# saturating in both directions carries no player-specific information, and it
# drives survival, which drives VONA.
#
# MFL publishes the dispersion. The recorded probe payload
# (draft/data/adp_sources_probe.json) is:
#   {"draftsSelectedIn":"3510","rank":"1","minPick":"1","id":"14836",
#    "draftSelPct":"70","averagePick":"3.04","maxPick":"200"}
# `parse` kept averagePick and draftsSelectedIn and dropped the rest. Every daily
# snapshot since 2026-08-11 has lost it, and it is perishable in exactly the way
# the ADP mean is.

def _adp_payload(**over):
    row = {"id": "1", "averagePick": "10.5", "draftsSelectedIn": "3510",
           "minPick": "2", "maxPick": "40", "draftSelPct": "70", "rank": "1"}
    row.update(over)
    return {"adp": {"totalDrafts": "5011", "player": [row]}}


def test_parse_KEEPS_the_dispersion_fields_the_source_publishes():
    """MUTATION: keep averagePick only — the board is left with a clamp, and no
    later code can recover a number the ingest already threw away."""
    rows = M.parse(_adp_payload(), {})
    r = rows[0]
    assert r["min_pick"] == 2 and r["max_pick"] == 40
    assert r["drafts"] == 3510
    assert r["sel_pct"] == 70.0


def test_a_missing_dispersion_field_is_NONE_not_zero():
    """A player MFL reports without minPick has unknown dispersion, not zero
    dispersion — zero would read as 'taken at exactly the same pick every time',
    the most confident possible claim. MUTATION: default to 0."""
    p = _adp_payload()
    del p["adp"]["player"][0]["minPick"]
    del p["adp"]["player"][0]["draftSelPct"]
    r = M.parse(p, {})[0]
    assert r["min_pick"] is None and r["sel_pct"] is None
    assert r["max_pick"] == 40, "the field that IS published still arrives"


def test_a_row_with_dispersion_but_no_adp_is_still_SKIPPED():
    """The mean is the load-bearing field; dispersion does not rescue a row
    without one. MUTATION: emit the row with adp None and let a consumer sort on it."""
    p = _adp_payload()
    del p["adp"]["player"][0]["averagePick"]
    assert M.parse(p, {}) == []
