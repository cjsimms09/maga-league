"""The crosswalk chain, and the defect that made it necessary.

WHY THIS FILE EXISTS (E, 2026-08-21, registers 232/233). `nfl_data_py` dropped
`import_ids` upstream between the 00:22Z build (which succeeded) and the 08:49Z
build (which refused). The first fix fell back to `import_players` on the
premise that both calls return `gsis_id` AND `sleeper_id`. That premise is
false — `import_players()` carries `gsis_id` and no `sleeper_id` — and it was
never caught locally because the local package still HAS `import_ids`, so the
fallback branch never ran here.

So every test below drives the branch by CONSTRUCTION rather than by whatever
the installed package happens to expose. Nothing here touches the network.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))

import id_crosswalk as X  # noqa: E402


class _Frame:
    """The two attributes the chain actually reads: .columns and item access."""

    def __init__(self, cols: dict):
        self._cols = cols
        self.columns = list(cols)

    def __getitem__(self, k):
        return self._cols[k]


class _FakeNfl:
    def __init__(self, **fns):
        for name, fn in fns.items():
            setattr(self, name, fn)


def _install(monkeypatch, fake):
    monkeypatch.setitem(sys.modules, "nfl_data_py", fake)


GOOD = {"gsis_id": ["00-1", "00-2"], "sleeper_id": ["4046.0", "12"]}
#: MEASURED on nfl_data_py 0.3.3, 2026-08-21: 25,049 rows, no sleeper_id.
PLAYERS_SHAPE = {"gsis_id": ["00-1"], "display_name": ["A Player"]}


# ── to_mapping: the float tail and the blanks ───────────────────────────────

def test_to_mapping_strips_the_float_tail_csv_ids_arrive_with():
    out = X.to_mapping(_Frame(GOOD))
    assert out == {"00-1": "4046", "00-2": "12"}


def test_to_mapping_drops_nan_on_either_side():
    out = X.to_mapping(_Frame({"gsis_id": ["00-1", "nan", "00-3"],
                               "sleeper_id": ["7.0", "9", "nan"]}))
    assert out == {"00-1": "7"}


# ── source selection ────────────────────────────────────────────────────────

def test_import_ids_is_preferred_when_it_exists(monkeypatch):
    _install(monkeypatch, _FakeNfl(import_ids=lambda: _Frame(GOOD),
                                   import_players=lambda: _Frame(PLAYERS_SHAPE)))
    df, source = X.frame([])
    assert source == "import_ids"


def test_THE_DEFECT_import_players_lacking_sleeper_id_falls_THROUGH(monkeypatch):
    """The whole reason this module exists.

    The first fix RETURNED this frame and then raised on the missing column.
    The chain must treat it as a rejected source and keep going.
    """
    called = {}

    def _csv(url, **kw):
        called["url"] = url
        return _Frame(GOOD)

    _install(monkeypatch, _FakeNfl(import_players=lambda: _Frame(PLAYERS_SHAPE)))
    monkeypatch.setitem(sys.modules, "pandas", type("P", (), {"read_csv": staticmethod(_csv)}))

    tried = []
    df, source = X.frame(tried)
    assert source == "dynastyprocess_csv"
    assert called["url"] == X.DYNASTYPROCESS_IDS_URL
    assert "import_ids (absent)" in tried
    assert "import_players (no sleeper_id)" in tried


def test_the_package_being_gone_entirely_still_reaches_the_csv(monkeypatch):
    monkeypatch.setitem(sys.modules, "nfl_data_py", None)
    monkeypatch.setitem(sys.modules, "pandas",
                        type("P", (), {"read_csv": staticmethod(lambda u, **k: _Frame(GOOD))}))
    tried = []
    df, source = X.frame(tried)
    assert source == "dynastyprocess_csv"
    assert any("nfl_data_py" in t for t in tried)


def test_a_raising_api_is_recorded_and_stepped_over(monkeypatch):
    def _boom():
        raise ValueError("upstream 404")

    _install(monkeypatch, _FakeNfl(import_ids=_boom))
    monkeypatch.setitem(sys.modules, "pandas",
                        type("P", (), {"read_csv": staticmethod(lambda u, **k: _Frame(GOOD))}))
    tried = []
    X.frame(tried)
    assert any("import_ids (ValueError: upstream 404)" == t for t in tried)


# ── FAIL ARM: when everything is broken it must RAISE, not return {} ────────

def test_every_source_failing_raises_and_names_each_one(monkeypatch):
    import pytest

    def _boom_csv(u, **k):
        raise OSError("no egress")

    _install(monkeypatch, _FakeNfl(import_players=lambda: _Frame(PLAYERS_SHAPE)))
    monkeypatch.setitem(sys.modules, "pandas",
                        type("P", (), {"read_csv": staticmethod(_boom_csv)}))
    with pytest.raises(X.CrosswalkUnavailable) as e:
        X.frame([])
    assert "import_ids (absent)" in e.value.tried
    assert "import_players (no sleeper_id)" in e.value.tried
    assert any("dynastyprocess csv" in t for t in e.value.tried)


def test_a_csv_missing_the_columns_is_a_failure_not_a_silent_empty(monkeypatch):
    import pytest

    _install(monkeypatch, _FakeNfl())
    monkeypatch.setitem(sys.modules, "pandas",
                        type("P", (), {"read_csv": staticmethod(
                            lambda u, **k: _Frame({"gsis_id": ["00-1"]}))}))
    with pytest.raises(X.CrosswalkUnavailable):
        X.frame([])


# ── CONTROL: the constant must still be the file import_ids reads ───────────

def test_the_last_resort_url_is_the_one_import_ids_itself_reads():
    """If nfl_data_py ever repoints its own read_csv, this constant is stale
    and the last resort quietly becomes a DIFFERENT source than the first two.
    Skips rather than fails when the package is absent — this asserts agreement
    with upstream, and there is nothing to agree with when it is not installed.
    """
    import pytest
    nfl = pytest.importorskip("nfl_data_py")
    fn = getattr(nfl, "import_ids", None)
    if fn is None:
        pytest.skip("upstream dropped import_ids — nothing to compare against")
    import inspect
    assert X.DYNASTYPROCESS_IDS_URL in inspect.getsource(fn)
