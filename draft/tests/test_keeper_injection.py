# TERRITORY: A
"""STEP 1 — THE KEEPER INJECTION TEST. THE DISCRIMINATOR, RUN NOT READ.

Cory: "Do not resolve this by reading code or comments. You have been wrong twice
about what a comment means. kept_player_ids under injection is evidence. Prose is
not."

So this injects the predicted slate as if it were live Sleeper designations and
reads `kept_player_ids` out the other end, through the real
`gen_keepers_json.build` and the real `build._keeper_map_for_board`.

── WHAT IT MEASURED ──────────────────────────────────────────────────────────

    injected                6 designating teams / 17 keepers
    keepers.json holds      6 teams / 17 keepers
    slate 'predicted'       kept_player_ids = 3      (mine only)
    slate 'confirmed'       kept_player_ids = 17

LIVE KEEPER INGESTION WORKS. The 3 on the shipped board is not broken ingestion
and not a missing feature — it is `_keeper_map_for_board` deliberately
WITHHOLDING every designation that is not mine until `keeper_slate.status ==
'confirmed'`. That is Cory's ruling of 2026-08-11 and the withheld count is
stamped, so the board can say "I am ignoring 14 keepers on purpose" rather than
just being 14 players light.

── WHAT IT DISPROVED ─────────────────────────────────────────────────────────

`keeper_slate.reason` said "the board is built on PREDICTED opponent keepers".
The board is built on NO opponent keepers — predicted or designated — until the
slate confirms. The string was false in the opposite direction from the one I
guessed when I first flagged it, which is exactly why the order says to run it.

── THE ARTIFACT THAT NEARLY BECAME A FINDING ─────────────────────────────────

The first run returned 0, not 3. Cause: the predicted slate is keyed by DISPLAY
NAME (`coryjsimms`) while `MY_OWNER` is a Sleeper user id, so my own row was
given a provisional slot instead of slot 8. An injection defect, not a board
defect — and had I reported the 0 it would have read as "the board drops even my
keepers". Pinned below so the harness cannot reintroduce it silently.

Run: python -m pytest draft/tests/test_keeper_injection.py -q
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

import build as B  # noqa: E402
import gen_keepers_json as gk  # noqa: E402

CFG = json.loads((ROOT / "draft" / "config" / "league_config.json").read_text())
ART = json.loads((ROOT / "public" / "draft_data.json").read_text())
HIST = json.loads((ROOT / "draft" / "data" / "league_history.json").read_text())


def _injected_rosters():
    """The predicted slate, in Sleeper's roster shape.

    MY row carries the real `MY_OWNER` id. Everyone else keeps their display
    name, which is fine — only my row is matched by id.
    """
    pred = (ART.get("predicted_keepers") or {}).get("predictions") or {}
    out = []
    for owner, v in pred.items():
        ks = [str(k["player_id"]) for k in (v.get("predicted_keepers") or [])]
        oid = gk.MY_OWNER if owner == "coryjsimms" else owner
        out.append({"owner_id": oid, "roster_id": v.get("roster_id"), "keepers": ks})
    return out


def _kept_ids(full_map, status):
    m, diag = B._keeper_map_for_board(full_map, {"status": status}, CFG)
    kept = {str(k["player_id"]) for ks in m.values() for k in ks if k.get("player_id")}
    return kept, diag


@pytest.fixture(scope="module")
def injected():
    rosters = _injected_rosters()
    out = gk.build(CFG, ART, HIST, rosters=rosters)
    full = {str(t["draft_slot"]): t["keepers"] for t in out["teams"]}
    return rosters, out, full


def test_CONTROL_the_predicted_slate_actually_carries_keepers(injected):
    """A discriminator injecting nothing proves nothing."""
    rosters, out, _ = injected
    designating = [r for r in rosters if r["keepers"]]
    total = sum(len(r["keepers"]) for r in rosters)
    assert len(designating) >= 4, f"only {len(designating)} teams predicted keepers"
    assert total >= 10, f"only {total} keepers injected — too few to discriminate"


def test_LIVE_INGESTION_WORKS_every_injected_keeper_reaches_keepers_json(injected):
    """The first half: designations -> keepers.json. If this is short, ingestion
    is broken and nothing downstream can be judged."""
    rosters, out, full = injected
    injected_total = sum(len(r["keepers"]) for r in rosters)
    held = sum(len(v) for v in full.values())
    assert held == injected_total, (
        f"keepers.json holds {held} of {injected_total} injected keepers — "
        "ingestion is lossy and Step 1's verdict cannot be read through it")
    assert str(CFG["my_draft_slot"]) in full, (
        "my own slot is absent from the map — the injection is keyed wrong and "
        "any kept_player_ids count read from it is an artifact (this happened: "
        "keying by display name instead of MY_OWNER returned 0 instead of 3)")


def test_THE_BOARD_WITHHOLDS_OPPONENT_KEEPERS_UNTIL_THE_SLATE_CONFIRMS(injected):
    """The second half, and the answer to Step 1. `3` on the shipped board is
    this gate, not a broken pipe."""
    _, _, full = injected
    kept_pred, diag_pred = _kept_ids(full, "predicted")
    mine = {str(k["player_id"]) for k in (ART.get("kept_players") or [])}
    assert kept_pred == mine, (
        f"under an unconfirmed slate the board should carry exactly my keepers "
        f"({sorted(mine)}), got {sorted(kept_pred)}")
    assert diag_pred["withheld"] is True
    assert diag_pred["keepers"] > 0, (
        "the withheld COUNT must be non-zero and stamped — a board that is "
        "silently short is the failure this gate exists to avoid")


def test_AND_APPLIES_ALL_OF_THEM_THE_MOMENT_IT_DOES(injected):
    """The switch is one comparison, not a judgement anyone has to remember."""
    rosters, _, full = injected
    kept_conf, diag_conf = _kept_ids(full, "confirmed")
    injected_total = sum(len(r["keepers"]) for r in rosters)
    assert len(kept_conf) == injected_total, (
        f"a confirmed slate applied {len(kept_conf)} of {injected_total} keepers")
    assert diag_conf["withheld"] is False and diag_conf["keepers"] == 0


def test_THE_TWO_STATES_GENUINELY_DIFFER(injected):
    """FAIL ARM. If confirmed and predicted returned the same set, the gate
    would be decoration and both assertions above would be vacuous."""
    _, _, full = injected
    kept_pred, _ = _kept_ids(full, "predicted")
    kept_conf, _ = _kept_ids(full, "confirmed")
    assert kept_conf > kept_pred, (
        "confirming the slate changed nothing — the withholding gate is not "
        "actually gating")


def test_keeper_slate_reason_IS_DERIVED_not_a_static_claim():
    """Step 1's prescribed fix. The old string asserted a mechanism that does
    not exist, in the field a reader consults to find out what the board did."""
    import keeper_slate as ks
    r4 = ks.assess_slate(10, {str(i): ["p"] for i in range(4)}, placements=None)
    r7 = ks.assess_slate(10, {str(i): ["p"] for i in range(7)}, placements=None)
    assert "4/10" in r4["reason"] and "7/10" in r7["reason"], (
        "the reason does not move with the counts — it is still static")
    assert r4["reason"] != r7["reason"]
    assert "built on PREDICTED opponent keepers" not in r4["reason"], (
        "the retracted claim is back: the board is built on NO opponent "
        "keepers until the slate confirms, which injection measured directly")
    assert "6 team(s) have not designated" in r4["reason"], (
        "undesignated teams must be reported as UNKNOWN, not folded away")
