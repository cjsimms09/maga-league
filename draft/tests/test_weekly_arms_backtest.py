# TERRITORY: A
"""Guards on the weekly-arms backtest (registers 463, 467, 471).

The backtest is REPORT-ONLY and takes ~5s per fold, so this does not re-run
it. It guards three things that decay silently: (1) the in-process own_v6
builder used for non-2025 folds is the REFERENCE builder (K7's identity, run
here in ~1s so a helper change that forks the two is caught on the next CI
run, not on the next fold); (2) both committed artifacts carry every control
green and the three replication claims, under the same keys the module
declares; (3) the 2025 artifact is still the cited one — its `season` and
`outcome_cory_2025` keys exist, so a re-run under another season can never
overwrite it by accident (OUT is season-keyed)."""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BT = ROOT / "draft" / "backtest"
for p in (BT, ROOT / "draft", ROOT / "draft" / "tools"):
    sys.path.insert(0, str(p))


def _module():
    saved = sys.argv
    sys.argv = ["x"]                       # default season, no --season parsing
    try:
        spec = importlib.util.spec_from_file_location(
            "weekly_arms_bt", BT / "weekly_arms_2025_backtest.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod
    finally:
        sys.argv = saved


def test_rebuild_own_v6_is_the_reference_builder():
    import proj_mean_blend as PMB
    mod = _module()
    ref = {str(k): v for k, v in PMB._probe_models()[0]["own_v6"].items()}
    mine = mod.rebuild_own_v6(2025)
    assert set(mine) == set(ref)
    assert all(abs(mine[k] - float(ref[k])) < 0.011 for k in ref)
    # KNOWN POSITIVE (rule 3e): a named player is priced, and 2024 differs
    # from 2025 (the builder is not returning one season under two names)
    m24 = mod.rebuild_own_v6(2024)
    assert len(m24) > 400 and m24 != mine


def test_both_artifacts_carry_green_controls_and_the_fixed_claims():
    mod = _module()
    keys = [k for k, _ in mod.REPLICATION_CLAIMS]
    for season in (2024, 2025):
        doc = json.loads((BT / f"weekly_arms_{season}_backtest.json").read_text())
        assert doc["season"] == season
        assert f"outcome_cory_{season}" in doc
        failed = [c["id"] for c in doc["controls"] if not c["ok"]]
        assert failed == [], f"{season}: controls red {failed}"
        rc = doc["replication_claims"]
        assert all(k in rc and "true" in rc[k] for k in keys), (season, list(rc))
        assert isinstance(doc["prior_sources"], str) and doc["prior_sources"]
    d24 = json.loads((BT / "weekly_arms_2024_backtest.json").read_text())
    assert any(c["id"] == "K7" for c in d24["controls"])       # the builder control ran
    d25 = json.loads((BT / "weekly_arms_2025_backtest.json").read_text())
    assert not any(c["id"] == "K7" for c in d25["controls"])   # 2025 prices the committed store


def test_out_path_is_season_keyed_so_a_fold_cannot_overwrite_the_cited_artifact():
    mod = _module()
    assert mod.OUT.name == "weekly_arms_2025_backtest.json"
    assert mod.SEASON == 2025
