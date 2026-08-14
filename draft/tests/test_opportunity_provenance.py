"""TERRITORY: A

THE BOARD RECORDED HOW MANY PLAY-BY-PLAY ROWS IT GOT, NEVER WHICH SEASONS.

Six fields on every row are historical priors built from that pull —
``target_share``, ``wopr``, ``opportunity_share``, ``opportunity_z``,
``opportunity_adj``, ``games_expected`` — and they print beside ``injury_status``,
which really is current. A reader takes them as this season's numbers, and until
now nothing in the artifact could say which seasons they came from.

``build.py`` ASKS for ``[year-1, year-2]``. What it RECEIVES is a different
question, and not an academic one: ``import_weekly_data`` 404s for 2025 in this
environment, so a neighbouring nfl_data_py call has demonstrably returned less
than it was asked for. Asked-for and received are two quantities, and only the
asked-for one was written down.

── WHY THE ROW COUNT IS NOT GOOD ENOUGH, THOUGH IT DID WORK ─────────────────

C established the seasons by arithmetic against the nflverse parquet footers:
2024 (49492) + 2025 (48771) = 98263, and the board records 98263 exactly. That
is a real proof and it is why nothing is wrong with today's board. But the
nearest competing pair, 2022+2025 = 98205, is **58 rows away** — an upstream
revision that size would make the count identify the WRONG PAIR rather than fail
to match, and it would do so silently and confidently.

So the seasons are now READ FROM THE FRAME, with the reading's source declared,
because a field that is silently absent reads exactly like one that agrees.

── THIS FILE HOLDS BOTH HALVES ──────────────────────────────────────────────

1. The recording logic, driven against a stub frame — including the case where a
   season goes missing, which is the case the whole change exists for.
2. The shipped artifact. Until the next nightly rebuild runs, the board predates
   this change and carries no ``pbp_seasons_observed``. That is NOT a skip: the
   arithmetic proof is asserted instead, so the guarantee holds continuously and
   hands over rather than lapsing. The moment the recorded field appears it takes
   over and the arithmetic becomes a cross-check of it.

Run: python -m pytest draft/tests/test_opportunity_provenance.py -q
"""
from __future__ import annotations

import json
import sys
import types
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

BOARD = ROOT / "public" / "draft_data.json"
CENSUS = ROOT / "draft" / "backtest" / "nflverse_pbp_census.json"


# ── A FRAME THAT IS ONLY AS REAL AS IT NEEDS TO BE ──────────────────────────
# pandas is not installed in this environment, and installing it to test four
# lines of bookkeeping would be the tail wagging the dog. The stub supports
# exactly what the block under test touches; anything else raises loudly rather
# than returning a default that would let a wrong assertion pass.
class _Col:
    def __init__(self, values):
        self._v = list(values)

    def value_counts(self):
        out: dict = {}
        for v in self._v:
            out[v] = out.get(v, 0) + 1
        return types.SimpleNamespace(to_dict=lambda: out)

    def astype(self, _):
        return _Col([str(v) for v in self._v])

    @property
    def str(self):
        outer = self

        class _S:
            @staticmethod
            def slice(a, b):
                return _Col([str(v)[a:b] for v in outer._v])
        return _S()


class _Frame:
    def __init__(self, cols: dict):
        self._cols = cols
        self.columns = list(cols)

    def __len__(self):
        return len(next(iter(self._cols.values())))

    def __getitem__(self, k):
        return _Col(self._cols[k])


def _run(frame, seasons_cfg_year=2026):
    """Drive the real `load_opportunity` with a stubbed nfl_data_py.

    The function is imported fresh each time so OPPORTUNITY_PROVENANCE — a
    module-level dict — cannot carry state between cases and make a later
    assertion pass on an earlier case's writes.
    """
    for mod in ("build", "projections"):
        sys.modules.pop(mod, None)
    fake = types.ModuleType("nfl_data_py")
    fake.import_pbp_data = lambda seasons, **kw: frame  # noqa: ARG005
    sys.modules["nfl_data_py"] = fake
    import build  # noqa: PLC0415

    build.proj_mod.opportunity_metrics = lambda *a, **k: {"1": {}, "2": {}}
    build.OPPORTUNITY_PROVENANCE.clear()
    build.load_opportunity({"season": seasons_cfg_year}, offline=False)
    return dict(build.OPPORTUNITY_PROVENANCE)


def _seasons_frame(pairs):
    """pairs: [(season, n_rows), ...] -> a frame with that many rows each."""
    col = []
    for season, n in pairs:
        col.extend([season] * n)
    return _Frame({"season": col, "play_id": list(range(len(col)))})


# ── 1. THE HAPPY PATH RECORDS BOTH QUANTITIES, NOT ONE ──────────────────────
def test_records_requested_and_observed_separately():
    prov = _run(_seasons_frame([(2025, 7), (2024, 5)]))
    assert prov["status"] == "ok"
    assert prov["pbp_seasons_requested"] == [2025, 2024], "what we ASKED for"
    assert prov["pbp_seasons_observed"] == [2024, 2025], "what CAME BACK"
    assert prov["pbp_rows_by_season"] == {2024: 5, 2025: 7}
    assert prov["pbp_rows"] == 12


def test_the_per_season_counts_reconcile_with_the_total():
    """The field that made the arithmetic proof possible must stay consistent
    with the field that replaces it, or the two disagree and neither is trusted."""
    prov = _run(_seasons_frame([(2025, 9), (2024, 4)]))
    assert sum(prov["pbp_rows_by_season"].values()) == prov["pbp_rows"]


def test_agreement_is_stated_rather_than_implied():
    """`mismatch: False` is written on the happy path. An ABSENT flag would read
    identically to a False one, which is the defect class this repo keeps
    hitting — `bye_source`, `adp_sd_source`, `arithmetic_check.condition`."""
    prov = _run(_seasons_frame([(2025, 3), (2024, 3)]))
    assert prov["pbp_seasons_mismatch"] is False
    assert "pbp_seasons_source" in prov


# ── 2. THE CASE THE CHANGE EXISTS FOR ───────────────────────────────────────
def test_a_missing_season_is_flagged_not_swallowed(capsys):
    """Asked for [2025, 2024]; only 2024 comes back. The build still succeeds —
    one season of priors beats none — but it must not be silent, because the six
    prior fields keep printing with exactly the same confidence either way."""
    prov = _run(_seasons_frame([(2024, 11)]))
    assert prov["status"] == "ok", "a short pull degrades, it does not fail the build"
    assert prov["pbp_seasons_observed"] == [2024]
    assert prov["pbp_seasons_requested"] == [2025, 2024]
    assert prov["pbp_seasons_mismatch"] is True
    assert "RECEIVED" in capsys.readouterr().out, "and it says so in the build log"


def test_an_extra_or_wrong_season_is_also_a_mismatch():
    """Not only fewer. A cache returning a neighbouring season is the shape that
    makes a row count identify the wrong pair."""
    prov = _run(_seasons_frame([(2025, 5), (2022, 5)]))
    assert prov["pbp_seasons_observed"] == [2022, 2025]
    assert prov["pbp_seasons_mismatch"] is True


# ── 3. IT DEGRADES ONTO THE RECORD, NOT INTO SILENCE ────────────────────────
def test_falls_back_to_game_id_when_there_is_no_season_column():
    frame = _Frame({"game_id": ["2025_01_KC_BUF"] * 6 + ["2024_17_SF_LAR"] * 2})
    prov = _run(frame)
    assert prov["pbp_seasons_observed"] == [2024, 2025]
    assert prov["pbp_seasons_source"] == "frame.game_id-prefix"


def test_an_unreadable_frame_records_a_REASON_rather_than_nothing():
    """If this wrote nothing, the artifact would look exactly like one where the
    seasons agreed — which is how 'no data' became indistinguishable from 'fine'
    in the bye fields for weeks."""
    prov = _run(_Frame({"nonsense": [1, 2, 3]}))
    assert "pbp_seasons_observed" not in prov
    src = prov.get("pbp_seasons_source", "")
    assert src.startswith("unreadable"), src
    assert prov["status"] == "ok", "diagnostics must never break the build"


def test_diagnostics_failing_does_not_lose_the_metrics():
    """The whole point of wrapping it: a bookkeeping error must not cost the
    board its opportunity data."""
    prov = _run(_Frame({"nonsense": [1, 2, 3]}))
    assert prov["players_with_metrics"] == 2


# ── 4. THE SHIPPED ARTIFACT — the half that is about the real board ─────────
def _detail():
    if not BOARD.exists():
        pytest.skip("no built board in this checkout")
    d = json.loads(BOARD.read_text())
    return d.get("provenance", {}).get("opportunity_detail", {}), d.get(
        "provenance", {}).get("opportunity_adjustment")


def test_the_board_says_which_seasons_its_priors_rest_on():
    """CONTINUOUS GUARANTEE, TWO WAYS OF MEETING IT.

    After the next nightly rebuild the board carries the read-from-the-frame
    seasons and this asserts them directly. Before it, the board predates the
    change, and rather than skipping — a skip here would quietly stop guarding
    the thing during the exact window the draft happens in — the arithmetic
    proof C established is asserted instead.
    """
    detail, status = _detail()
    if status != "ok":
        pytest.skip(f"opportunity adjustment not active on this board: {status}")

    if "pbp_seasons_observed" in detail:
        obs = detail["pbp_seasons_observed"]
        assert obs, "recorded but empty is worse than absent"
        assert detail["pbp_seasons_source"].startswith("frame."), detail["pbp_seasons_source"]
        assert sum(detail["pbp_rows_by_season"].values()) == detail["pbp_rows"]
        # CROSS-CHECK, not a substitute: the recorded seasons must agree with the
        # independent parquet census. If they ever disagree, the census is stale
        # or the read is wrong, and either is worth knowing before trusting six
        # prior fields on the draft board.
        if CENSUS.exists():
            census = json.loads(CENSUS.read_text())["seasons"]
            expect = sum(census[str(s)]["rows"] for s in obs if str(s) in census)
            if expect:
                assert abs(expect - detail["pbp_rows"]) < 1000, {
                    "observed": obs, "census_sum": expect, "board": detail["pbp_rows"]}
        return

    # ── the pre-rebuild branch: the arithmetic, asserted rather than assumed ──
    assert "pbp_rows" in detail, (
        "the board carries neither the recorded seasons nor a row count, so "
        "nothing at all identifies where the opportunity priors came from")
    if not CENSUS.exists():
        pytest.skip("no census to check the row count against")
    census = json.loads(CENSUS.read_text())["seasons"]
    rows = detail["pbp_rows"]
    pairs = sorted(census)
    matches = [(a, b) for i, a in enumerate(pairs) for b in pairs[i + 1:]
               if census[a]["rows"] + census[b]["rows"] == rows]
    assert matches == [("2024", "2025")], {
        "board_rows": rows, "pairs_matching": matches,
        "why": "the priors must still identify as the two most recent seasons"}


def test_the_arithmetic_proof_is_fragile_and_that_is_recorded():
    """C's caveat, pinned. The nearest competing pair is 58 rows from the real
    one — close enough that an upstream revision could make the count name the
    WRONG pair confidently. This asserts the margin so it MOVES when nflverse
    moves, which is the whole reason the seasons are now read instead."""
    if not CENSUS.exists():
        pytest.skip("no census")
    census = json.loads(CENSUS.read_text())["seasons"]
    truth = census["2024"]["rows"] + census["2025"]["rows"]
    others = [census[a]["rows"] + census[b]["rows"]
              for i, a in enumerate(sorted(census)) for b in sorted(census)[i + 1:]
              if (a, b) != ("2024", "2025")]
    nearest = min(abs(truth - o) for o in others)
    assert nearest < 500, (
        f"nearest competing pair is now {nearest} rows away — if this ever "
        "becomes comfortably large, the arithmetic fallback above stopped being "
        "fragile and this test's premise changed")
