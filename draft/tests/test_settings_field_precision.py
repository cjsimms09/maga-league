# TERRITORY: A
"""FIVE SETTINGS SHARED ONE CONFIG OBJECT, SO ONE READ MARKED ALL FIVE AS USED.

EVIDENCE CLASS (directive §10): CORRECTNESS of the matcher, on both arms — that
it finds a real read (no false negative) and that it does not credit a sibling's
read (no false positive). It establishes nothing about whether any particular
setting SHOULD be read.

── THE DEFECT, ROUTED BY B AND REPRODUCED HERE ────────────────────────────────

`settings_influence._changed_fields` compared only TOP-LEVEL config keys, so
five settings that land inside `config.waivers` —

    daily_waivers, waiver_budget, waiver_clear_days, waiver_day_of_week,
    waiver_type

— all reported `reaches: ["waivers"]`. `has_consumer` then credited a read of
ANY field in that object to EVERY setting landing in it.

Nothing was wrong on main: `field_reads["waivers"]` measured 0. B then added a
legitimate read of `config.waivers.type_code` — the league's waiver rule,
correctly consumed — and that ONE read would have marked all five as consumed,
including `daily_waivers`, whose registry note is still exactly true: "Reaches
config.waivers.daily_waivers; read by nobody."

THE FIX IS NOT TO PROMOTE daily_waivers, which is what the failure message asks
for. That would label a setting as read when nothing reads it — the precise lie
this registry exists to prevent — and the promotion would immediately be pinned
by test_every_imported_key_has_a_consumer demanding a consumer that does not
exist. The granularity was lost in _changed_fields, so it is restored there.

── WHY THE MATCHER NEEDED A TABLE AND NOT A GLANCE ────────────────────────────

Making `reaches` field-precise turns the scanned name into a DOTTED PATH, and a
dotted path is not an identifier. Two false-negative bugs got through my reading
of the regex and were caught only by running it:

  1. `cfg["waivers"]["daily_waivers"]` — the closing `"]` after the first
     segment was never consumed, so ONLY the dot form matched. Every
     bracket-style read in the repo would have reported unread, turning a
     precision fix into a claim that the whole registry is dead.

  2. `cfg["waivers"].get("day_of_week")` — Python alternation is ordered, and a
     bare `\\.\\s*` consumed the dot before `get`, then demanded the leaf
     immediately and failed.

A false negative here is not cosmetic: it would mark live settings as unread and
invite someone to delete a consumer that exists.

── WHY THE BARE LEAF IS DELIBERATELY NOT MATCHED ──────────────────────────────

Matching `type_code` or `budget` alone would collide with any dict in the repo
carrying that key — the false positive settings_access.py already records for
`cfg["trades"]` matching the master sheet's trade NOTES. A false positive marks
a setting consumed when nothing consumes it, so the stricter half is the right
side to err on.
"""
import inspect
import pathlib
import re
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import settings_access as ACCESS        # noqa: E402
import settings_influence as INFL       # noqa: E402


def _pat(key):
    """The SHIPPED matcher, lifted out of scan() rather than reimplemented. A
    copy of the regex would pass while the shipped one was broken — which is the
    whole failure class here."""
    src = inspect.getsource(ACCESS.scan)
    body = src[src.index("def _pat"):src.index("pats = {k: _pat(k)")]
    ns = {"re": re}
    exec("\n".join(l[4:] if l.startswith("    ") else l
                   for l in body.splitlines()), ns)
    return ns["_pat"](key)


# ── NESTED PATHS ARE PRODUCED AT ALL ───────────────────────────────────────

def test_changed_fields_reports_dotted_paths_for_nested_objects():
    a = {"waivers": {"type_code": 2, "daily_waivers": 0}, "teams": 10}
    b = {"waivers": {"type_code": 1, "daily_waivers": 0}, "teams": 10}
    assert INFL._changed_fields(a, b) == ["waivers.type_code"], (
        "a nested change must name the LEAF; reporting 'waivers' is what let one "
        "read cover five settings"
    )


def test_a_sibling_change_is_not_reported():
    a = {"waivers": {"type_code": 2, "budget": 100}}
    b = {"waivers": {"type_code": 2, "budget": 50}}
    assert INFL._changed_fields(a, b) == ["waivers.budget"]


def test_top_level_scalars_still_report_bare_names():
    """The fix must not rename the flat majority of the config."""
    assert INFL._changed_fields({"teams": 10}, {"teams": 12}) == ["teams"]


def test_imported_at_is_still_ignored_at_top_level_only():
    """It is a timestamp and changes on every import; a nested field that
    happened to be called imported_at is a different thing and must not be."""
    assert INFL._changed_fields({"imported_at": "a"}, {"imported_at": "b"}) == []
    a = {"x": {"imported_at": "a"}}
    b = {"x": {"imported_at": "b"}}
    assert INFL._changed_fields(a, b) == ["x.imported_at"]


def test_recursion_is_not_depth_limited():
    """A rule that only holds at depth two is a rule waiting to be wrong."""
    a = {"x": {"y": {"z": 1}}}
    b = {"x": {"y": {"z": 2}}}
    assert INFL._changed_fields(a, b) == ["x.y.z"]


# ── THE MATCHER, ACROSS EVERY ACCESS STYLE IN THE REPO ─────────────────────

FINDS = [
    ("dot",         'const t = config.waivers.type_code;',        "waivers.type_code"),
    ("bracket",     'const t = cfg["waivers"]["daily_waivers"];', "waivers.daily_waivers"),
    ("mixed",       "const t = cfg['waivers'].clear_days;",       "waivers.clear_days"),
    ("spaced",      'const t = cfg[ "waivers" ][ "budget" ];',    "waivers.budget"),
    ("py_get",      'v = cfg["waivers"].get("day_of_week")',      "waivers.day_of_week"),
    ("py_bracket",  'v = cfg["waivers"]["day_of_week"]',          "waivers.day_of_week"),
]


@pytest.mark.parametrize("name,line,key", FINDS)
def test_the_matcher_finds_a_real_read_in_every_access_style(name, line, key):
    """FALSE NEGATIVES ARE THE DANGEROUS DIRECTION: they mark a live setting
    unread and invite someone to delete a consumer that exists."""
    assert _pat(key).search(line), (
        f"{name}: the shipped matcher does not see {key} in {line!r}"
    )


MISSES = [
    ("sibling_leaf", 'const t = config.waivers.type_code;', "waivers.daily_waivers"),
    ("object_only",  'const w = config.waivers;',           "waivers.daily_waivers"),
    ("other_parent", 'const t = other.type_code;',          "waivers.type_code"),
    ("bare_leaf",    'const t = someUnrelated.budget;',     "waivers.budget"),
]


@pytest.mark.parametrize("name,line,key", MISSES)
def test_the_matcher_does_not_credit_a_siblings_read(name, line, key):
    """THE ORIGINAL DEFECT, as an assertion. `sibling_leaf` is B's exact case:
    a read of type_code must not make daily_waivers look consumed."""
    assert not _pat(key).search(line), (
        f"{name}: {key} was credited by {line!r} — one read is covering a "
        "setting nothing reads"
    )


def test_plain_keys_are_unaffected():
    """Most of the registry is flat. The dotted branch must not change them."""
    assert _pat("waiver_type").search("settings.waiver_type")
    assert not _pat("waiver_type").search("settings.waiver_typo")


# ── THE LIVE MEASUREMENT, WHICH IS THE POINT ───────────────────────────────

def test_the_five_waiver_settings_no_longer_share_one_field():
    """Measured against the real config, not a fixture."""
    reaches = INFL.measure()["reaches_config"]
    waiver_keys = {k: v for k, v in reaches.items()
                   if any("waiver" in f for f in v)}
    assert len(waiver_keys) >= 4, waiver_keys
    landed = [f for v in waiver_keys.values() for f in v]
    assert len(set(landed)) == len(landed), (
        f"two settings still report the SAME config field: {waiver_keys}"
    )
    assert all(f.startswith("waivers.") for f in landed), landed
