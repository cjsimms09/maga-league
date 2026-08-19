"""Tests for the produced-and-unread detector.

**THIS FILE EXISTS BECAUSE THE TOOL SHIPPED BROKEN TWICE AND BOTH BUGS LOOKED
LIKE FINDINGS.** Rule 3e says a null from a probe is a bug report until the probe
has demonstrated a positive. Both of these were the mirror image — a probe
producing confident output that was an artifact of its own construction:

  1. FALSE POSITIVES. The first run reported 39 of 116 artifacts unread, and
     roughly twenty were season-suffixed families (`snap_counts_2021..2025`,
     `advanced_stats_2022..2025`, `routes_*`, `fp_expert_ranks_*`). Every one is
     read, through an f-string: `(HERE / f"advanced_stats_{season}.json")`. A
     literal-filename search cannot see a name assembled at runtime, so the tool
     was substantially measuring "does this filename contain a year".

  2. A FALSE NEGATIVE ON ITS OWN FOUNDING CASE, which is worse.
     `nflverse_durability.json` — the artifact the tool was built to find — was
     reported as READ, by two files that are not consumers: `nflverse_run.py`,
     the pipeline runner that produces it and reads it back to print a report,
     and `unread_artifacts.py` ITSELF, which names every artifact it reports on.

The second one is the reason this file leads with a known-positive against the
live repo rather than with fixtures. A detector that cannot find the case it was
written for is not a detector, and nothing else here would have caught it.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import unread_artifacts as U  # noqa: E402


def _src(tmp_path, name, body):
    f = tmp_path / name
    f.write_text(body, encoding="utf8")
    return f


# ── THE KNOWN-POSITIVE, FIRST, BECAUSE IT IS THE ONE THAT FAILED ───────────────

def test_KNOWN_POSITIVE_the_founding_case_is_now_a_real_consumer():
    """`nflverse_durability.json` used to have NO consumer — now it does.

    RETIRED AS AN UNREAD-ARTIFACT ASSERTION 2026-08-18, per this test's own
    original instruction ("if this ever finds a reader ... good — retire this
    assertion in that commit"): B wired it into the admin war room's durability
    section (`src/routes/admin.js:1012`, `readFileSync(... 'nflverse_durability.json'
    ...)`, live-tested by `durability_section.test.js`). Verified as a genuine
    read — not a producer/self reference — before flipping this: the file is a
    `.js` route handler, not `nflverse_run.py` or `unread_artifacts.py` itself,
    the two exclusions this file exists to enforce.

    Kept, not deleted, because it is still the detector's founding case and this
    is now the mirror-image regression: the tool must correctly credit a REAL
    consumer once one exists, the same way it must correctly deny the producer
    and itself. Losing this coverage would mean nothing here proves the detector
    still recognises a genuine reader for this specific artifact.
    """
    art = ROOT / "draft" / "backtest" / "nflverse_durability.json"
    if not art.exists():
        import pytest
        pytest.skip("artifact not in this checkout")
    # RETIRED AS THE DOCSTRING PROMISED (A, 08-18): the founding case got a
    # REAL consumer — B's durability-table surface reads it in
    # src/routes/admin.js:1012 (verified by hand, a genuine fs read, not a
    # stem false-positive). The assertion flips: the detector must now see
    # that consumer, or the reader-detection itself has regressed.
    rd = U.readers("nflverse_durability.json", U.sources())
    assert any("admin.js" in str(x) for x in rd), (
        "the founding case's real consumer (admin.js durability table, "
        "merged 08-18) is no longer detected — reader detection regressed, "
        "or the surface was unwired without retiring this test")


def test_CONTROL_the_detector_is_not_reporting_everything():
    """The other half: most artifacts DO have consumers, or the tool is useless."""
    unread, read, n_src = U.scan(ROOT, min_bytes=20000)
    assert n_src > 100, f"only {n_src} source files scanned — the globs broke"
    assert len(read) > len(unread), \
        f"{len(unread)} unread vs {len(read)} read — that ratio means the tool is broken"
    assert unread, "nothing at all is unread, which has never been true here"


# ── FALSE POSITIVE #1: the family stem ────────────────────────────────────────

def test_a_season_suffixed_artifact_read_by_f_string_counts_as_READ(tmp_path):
    """The bug that made twenty rows of the first run meaningless."""
    _src(tmp_path, "consumer.py",
         'doc = json.loads((HERE / f"advanced_stats_{season}.json").read_text())')
    assert U.readers("advanced_stats_2023.json", [tmp_path / "consumer.py"], tmp_path)


def test_the_family_stem_does_not_swallow_an_unrelated_artifact(tmp_path):
    """CONTROL for the fix — it must not credit any reader to any artifact."""
    _src(tmp_path, "consumer.py",
         'doc = json.loads((HERE / f"advanced_stats_{season}.json").read_text())')
    assert U.readers("snap_counts_2023.json", [tmp_path / "consumer.py"], tmp_path) == []


# ── FALSE NEGATIVE: producer-side files are not consumers ─────────────────────

def test_the_producers_own_RUNNER_is_not_a_reader(tmp_path):
    """`nflverse_run.py` imports the module and reads the artifact back to report.

    That is the producer reading its own output. Counting it is what made the tool
    blind to its founding case.
    """
    _src(tmp_path, "runner.py",
         'import nflverse_durability as ND\n'
         'art = json.loads((here / "nflverse_durability.json").read_text())')
    assert U.readers("nflverse_durability.json", [tmp_path / "runner.py"], tmp_path) == []


def test_a_file_that_WRITES_the_artifact_is_not_a_reader(tmp_path):
    _src(tmp_path, "producer.py",
         '(HERE / "thing.json").write_text(json.dumps(doc))')
    assert U.readers("thing.json", [tmp_path / "producer.py"], tmp_path) == []


def test_a_genuine_consumer_IS_a_reader(tmp_path):
    """CONTROL for both exclusions above — they must not exclude everything."""
    _src(tmp_path, "consumer.py",
         'doc = json.loads((HERE / "thing.json").read_text())\nuse(doc)')
    assert U.readers("thing.json", [tmp_path / "consumer.py"], tmp_path)


def test_the_tool_does_not_credit_ITSELF_as_a_consumer():
    """It names every artifact it reports on, including in its docstring."""
    me = ROOT / "draft" / "tools" / "unread_artifacts.py"
    assert "nflverse_durability" in me.read_text(encoding="utf8"), \
        "precondition: the tool names the artifact in its own prose"
    assert me not in [ROOT / p for p in U.readers("nflverse_durability.json", U.sources())]


# ── TESTS ARE NOT READERS, AND THAT IS THE WHOLE POINT ────────────────────────

def test_a_test_file_does_not_count_as_a_consumer():
    """`nflverse_durability.json` has SEVEN test references and zero consumers.

    A well-tested artifact nobody uses looks healthy from every angle except the
    one that matters, so `sources()` excludes the test tree by construction.
    """
    srcs = U.sources()
    assert not any("/tests/" in str(s) or s.name.startswith("test_") for s in srcs), \
        "the test tree leaked into the consumer scan"
    assert len(srcs) > 100


# ── THE LIMIT, STATED ─────────────────────────────────────────────────────────

def test_THE_PRODUCER_HEURISTIC_IS_A_HEURISTIC_AND_HERE_IS_ITS_EDGE(tmp_path):
    """A file that both writes AND genuinely consumes reads as producer-only.

    The window is ~120 characters around the name, so one file doing both is
    classified by whichever it does first. That is a real miss and it is pinned
    here rather than left for someone to rediscover as a surprise.
    """
    _src(tmp_path, "both.py",
         '(HERE / "thing.json").write_text(json.dumps(doc))\n'
         'later = json.loads((HERE / "thing.json").read_text())\nuse(later)')
    assert U.readers("thing.json", [tmp_path / "both.py"], tmp_path) == [], \
        "documented limitation: write-then-read in one file reads as producer-only"
