"""Lock the opponent keeper-slate predictor."""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
OUT = HERE / "data" / "predicted_keepers.json"


def _predictions():
    subprocess.run([sys.executable, str(HERE / "predict_keepers.py")],
                   check=True, capture_output=True)
    return json.loads(OUT.read_text())["predictions"]


def test_recovers_my_real_keepers():
    # The predictor must recover MY actual keepers (Chase/Henry/Walker) from my
    # 2025 roster under flat-cost surplus — the trust anchor for opponent preds.
    p = _predictions()["coryjsimms"]["predicted_keepers"]
    names = {k["name"] for k in p}
    assert any("Chase" in n for n in names)
    assert any("Henry" in n for n in names)
    assert any("Walker" in n for n in names)
    assert len(p) == 3


def test_marian_keeps_bowers_high_conf_intel():
    p = _predictions()["MarianSaar"]["predicted_keepers"]
    bowers = next((k for k in p if "Bowers" in k["name"]), None)
    assert bowers is not None, "Marian's slate should include Bowers"
    assert bowers["confidence"] == "high"
    assert "intel" in (bowers.get("override") or "")


def test_keep_none_is_a_legal_prediction():
    # Weak rosters keep nobody (Jreis kept 0 in 2024 — league precedent).
    preds = _predictions()
    counts = {o: len(v["predicted_keepers"]) for o, v in preds.items()}
    assert min(counts.values()) == 0        # at least one owner predicted keep-none
    assert max(counts.values()) <= 3        # never more than the max


def test_every_owner_predicted():
    assert len(_predictions()) == 10
