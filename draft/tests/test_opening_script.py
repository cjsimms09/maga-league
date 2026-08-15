"""OPENING-SCRIPT MACHINERY — lock the generator + the regeneration contract."""
from __future__ import annotations
import json
import sys
from pathlib import Path

DRAFT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(DRAFT))
import opening_script as OS  # noqa: E402


def _inputs():
    board = json.loads((DRAFT.parent / "public" / "draft_data.json").read_text())
    predicted = json.loads((DRAFT / "data" / "predicted_keepers.json").read_text())
    return board, predicted


def test_script_targets_my_real_live_picks():
    board, predicted = _inputs()
    s = OS.generate(board, predicted)
    my = (board.get("pick_order") or {}).get("my_picks") or []
    assert s["my_picks"] == my
    scripted = [e["pick"] for e in s["branches"]["primary_effective_board"]]
    assert scripted == my[:OS.PICKS_TO_SCRIPT]          # 33, 48, 53 on today's board


def test_primary_excludes_every_EFFECTIVE_keeper_and_mine():
    """The audit's §1 contract: the primary removes real designations where
    they exist and predictions only where they don't — never a contradicted
    prediction."""
    board, predicted = _inputs()
    real = OS.load_real()
    s = OS.generate(board, predicted)
    slates = OS.effective_slates(predicted, real)
    gone = {i for sl in slates.values() for i in sl["ids"]} | {
        str(k.get("player_id")) for k in board.get("kept_players", [])}
    for entry in s["branches"]["primary_effective_board"]:
        for c in entry["candidates"]:
            assert c["player_id"] not in gone, f"{c['name']} is kept (effective) but scripted"


def test_designation_supersedes_prediction_wholesale():
    """THE BOWERS TRIPWIRE, generalized — the exact failure the 2026-08-15 data
    audit caught. Synthetic fixture so the contract outlives this year's facts:
    a designated team's real slate replaces its prediction ENTIRELY — a player
    the prediction kept but the owner did not (Bowers) must NOT be removed from
    the primary pool, and a player the owner kept but the prediction missed
    (Jeanty) MUST be removed from BOTH branches."""
    predicted = {"predictions": {
        "OwnerX": {"roster_id": "6", "predicted_keepers": [
            {"player_id": "100", "name": "Predicted And Kept"},
            {"player_id": "101", "name": "Predicted Not Kept"},   # the Bowers shape
        ]},
        "OwnerY": {"roster_id": "8", "predicted_keepers": [
            {"player_id": "300", "name": "Pure Prediction"},      # undesignated team
        ]},
    }}
    real = {"6": ["100", "102"]}   # kept the unpredicted 102 (the Jeanty shape)
    slates = OS.effective_slates(predicted, real)
    assert slates["6"] == {"ids": ["100", "102"], "source": "designated", "handle": "OwnerX"}
    assert slates["8"] == {"ids": ["300"], "source": "predicted", "handle": "OwnerY"}
    designated = {i for sl in slates.values() if sl["source"] == "designated" for i in sl["ids"]}
    predicted_only = {i for sl in slates.values() if sl["source"] == "predicted" for i in sl["ids"]}
    assert "101" not in designated | predicted_only, "a contradicted prediction stayed removed"
    assert "102" in designated, "an unpredicted real keeper was left draftable-looking"
    assert "300" in predicted_only


def test_live_supersessions_are_reported_and_bowers_is_free():
    """Against the LIVE files: every designation-vs-prediction difference must
    surface in keeper_basis.supersessions (the branch notes derive from it),
    and any player a designated team was predicted to keep but did not must be
    scriptable in the PRIMARY branch's pool. Skips honestly if no designations
    are on file (early August of a future year)."""
    board, predicted = _inputs()
    real = OS.load_real()
    if not real:
        import pytest
        pytest.skip("no real designations on file — predictions-only mode")
    s = OS.generate(board, predicted)
    sup = s["meta"]["keeper_basis"]["supersessions"]
    slates = OS.effective_slates(predicted, real)
    freed_names = {n for x in sup for n in x["freed"]}
    # Recompute freed ids independently and require agreement.
    pred_by_roster = {str(v.get("roster_id")): {str(k["player_id"]) for k in v.get("predicted_keepers", [])}
                     for v in predicted["predictions"].values()}
    freed_ids = {i for rid, sl in slates.items() if sl["source"] == "designated"
                 for i in pred_by_roster.get(rid, set()) - set(sl["ids"])}
    name_of = {str(p.get("player_id")): p.get("name") for p in board.get("players", [])}
    assert {name_of.get(i) for i in freed_ids} - {None} == freed_names
    # And none of the freed players is removed from the primary pool: if one is
    # reachable at my first scripted pick it may appear as a candidate, and it
    # must never be excluded as "kept".
    gone = {i for sl in slates.values() for i in sl["ids"]}
    for i in freed_ids:
        assert i not in gone, f"freed player {name_of.get(i)} still treated as kept"


def test_contingency_returns_predicted_only_keepers():
    """The facts-only branch: real designations + mine stay gone, every
    predicted-only keeper returns to the pool; the strongest returners are
    pinned so the branch surfaces its own subjects (reachability permitting)."""
    board, predicted = _inputs()
    real = OS.load_real()
    s = OS.generate(board, predicted)
    slates = OS.effective_slates(predicted, real)
    predicted_only = {i for sl in slates.values() if sl["source"] == "predicted" for i in sl["ids"]}
    designated = {i for sl in slates.values() if sl["source"] == "designated" for i in sl["ids"]}
    mine = {str(k.get("player_id")) for k in board.get("kept_players", [])}
    for entry in s["branches"]["contingency_predictions_bust"]:
        for c in entry["candidates"]:
            assert c["player_id"] not in designated | mine, (
                f"{c['name']} is a FACT-kept player but scripted in the facts-only branch")
    # The pins: any top-VORP predicted-only player who is reachable at my first
    # pick must be surfaced in the contingency.
    my_picks = (board.get("pick_order") or {}).get("my_picks") or []
    pins = OS.top_by_vorp(board, predicted_only, n=2)
    names = {c["player_id"] for e in s["branches"]["contingency_predictions_bust"]
             for c in e["candidates"]}
    for pid in pins:
        p = next(x for x in board["players"] if str(x["player_id"]) == pid)
        adp = p.get("adjusted_adp") or p.get("raw_adp")
        if adp is not None and my_picks and \
                OS.survival_probability(float(adp), my_picks[0], p.get("adp_sd")) >= OS.SURVIVAL_FLOOR:
            assert pid in names, f"pinned returner {p.get('name')} not surfaced"


def test_candidates_carry_survival_and_respect_the_floor():
    board, predicted = _inputs()
    s = OS.generate(board, predicted)
    for branch in s["branches"].values():
        for e in branch:
            assert 1 <= len(e["candidates"]) <= OS.CANDIDATES_PER_PICK
            for c in e["candidates"]:
                assert c["survival"] >= OS.SURVIVAL_FLOOR or c is e["candidates"][0]


def test_fingerprint_and_staleness_contract():
    board, predicted = _inputs()
    s = OS.generate(board, predicted)
    fp = OS.fingerprint(board, predicted)
    assert OS.is_stale(s["meta"], fp) == []             # fresh against its own inputs
    # A board rebuild moves the fingerprint -> the script announces itself stale.
    moved = dict(fp, board_built_at="2026-08-21T00:00:00Z")
    assert "board_built_at" in OS.is_stale(s["meta"], moved)
    # A keeper designation landing (slate change) does too. Picked up by the
    # nightly draft-data rebuild reading live Sleeper — there is no keeper-watch.
    moved2 = dict(fp, predicted_slates_hash="deadbeefcafe")
    assert "predicted_slates_hash" in OS.is_stale(s["meta"], moved2)
    # A REAL designation landing/changing is its own staleness axis — the
    # audit's gap was precisely that a contradicted prediction changed no
    # fingerprint field; now it changes this one.
    moved2b = dict(fp, designated_slates_hash="deadbeefcafe")
    assert "designated_slates_hash" in OS.is_stale(s["meta"], moved2b)
    # And a slot assignment (Sleeper draft order) is a regeneration event.
    moved3 = dict(fp, my_slot=9)
    assert "my_slot" in OS.is_stale(s["meta"], moved3)


def test_an_in_place_board_edit_marks_the_script_stale_even_with_built_at_unchanged():
    """THE FAIL-ARM THE OLD FINGERPRINT MISSED — C's routed finding
    (ROUTES.md TO:A, 2026-08-14), fixed 2026-08-15. built_at is stamped by
    the REBUILD and survives in-place edits: C reproduced three different
    boards from git (31KB apart, 136 player rows differing) all sharing one
    built_at, and a fingerprint carrying only board_built_at called a script
    generated against any of them fresh against all of them. The content
    hash is what catches it. This test edits a player row IN PLACE, leaves
    built_at untouched, and requires the script to announce itself stale —
    exactly the case that used to pass silently."""
    board, predicted = _inputs()
    s = OS.generate(board, predicted)

    import copy
    edited = copy.deepcopy(board)
    assert edited["players"], "no players to edit — the fail-arm would be vacuous"
    edited["players"][0]["adp_unordered"] = (
        (edited["players"][0].get("adp_unordered") or 0) + 1)   # the real drifting field
    assert edited.get("built_at") == board.get("built_at")      # the stamp did NOT move

    fp_edited = OS.fingerprint(edited, predicted)
    stale = OS.is_stale(s["meta"], fp_edited)
    assert "board_content_hash" in stale, (
        "an in-place board edit with an unchanged built_at was not flagged — "
        "the fingerprint has regressed to timestamp identity")
    assert "board_built_at" not in stale  # the stamp really was held constant (control)

    # CONTROL — the hash is not simply always-different: the unedited board
    # still reads fresh, so the flag above is the edit's doing.
    assert OS.is_stale(s["meta"], OS.fingerprint(board, predicted)) == []


def test_doctrine_enrollment_follows_the_19b_verdict():
    board, predicted = _inputs()
    s = OS.generate(board, predicted)
    d = s["meta"]["doctrine"]
    cc = DRAFT / "backtest" / "cory-conditional.json"
    if cc.exists():
        result = json.loads(cc.read_text())
        winner = next((r for r in result["leaderboard"]
                       if r["verdict"].startswith("WINNER")), None)
        if winner:
            # The winner IS the plan, with its evidence cited — never a bare name.
            assert d["enrolled"] != "Balanced Value (the control)"
            assert "19b" in d["why"] and "CI" in d["why"]
        else:
            assert d["enrolled"].startswith("Balanced Value")
    else:
        # No verdict on file -> the control, honestly.
        assert d["enrolled"].startswith("Balanced Value")


def test_no_file_claims_a_keeper_watch_process_exists():
    """RULE 6, in the shape that is hardest to catch: text without a mechanism.

    `keeper-watch` was specced and never built, and the name outlived the plan in
    five files — including a note embedded in the SHIPPED artifact and a doc that
    called it "existing" two lines above saying the piece was NOT YET BUILT.
    Documentation describing a plausible mechanism reads exactly like
    documentation describing a real one, so nothing ever contradicted it.

    A grep is the right instrument here precisely because the defect IS the
    string. This is not the source-inspection weakness (11e) — there is no
    implementation to distinguish from a comment; the comment WAS the claim.

    What actually runs: the nightly draft-data workflow re-reads live Sleeper
    designations through gen_keepers_json.py; site-check.yml escalates.
    """
    import os
    import subprocess
    root = str(DRAFT.parent)
    out = subprocess.run(
        ["grep", "-rn", "-e", "keeper-watch", "-e", "keeper_watch",
         "--include=*.py", "--include=*.js", "--include=*.ejs", "--include=*.yml", "."],
        cwd=root, capture_output=True, text=True).stdout
    # This file is excluded: it must name the string in order to forbid it.
    # And a line that DENIES the process is not a line that claims it — the
    # offence is asserting existence, so explicit negations are allowed through.
    me = os.path.basename(__file__)
    NEGATIONS = ("no keeper-watch", "no such process", "does not exist",
                 "never built", "there is no")
    offending = [ln for ln in out.splitlines()
                 if ln.strip() and "node_modules" not in ln and me not in ln
                 and not any(n in ln.lower() for n in NEGATIONS)]
    assert not offending, (
        "a file claims keeper-watch exists; it does not. Name the nightly "
        "draft-data rebuild instead:\n  " + "\n  ".join(offending))
