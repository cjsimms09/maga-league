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
    scripted = [e["pick"] for e in s["branches"]["primary_both_tes_gone"]]
    assert scripted == my[:OS.PICKS_TO_SCRIPT]          # 34, 41, 54 today


def test_primary_branch_excludes_every_predicted_keeper_and_mine():
    board, predicted = _inputs()
    s = OS.generate(board, predicted)
    gone = OS.predicted_kept_ids(predicted) | {
        str(k.get("player_id")) for k in board.get("kept_players", [])}
    for entry in s["branches"]["primary_both_tes_gone"]:
        for c in entry["candidates"]:
            assert c["player_id"] not in gone, f"{c['name']} is predicted kept but scripted"


def test_contingency_returns_bowers_to_the_board():
    # The contract: the primary removes Bowers (predicted kept by Marian); the
    # contingency returns him to the pool. Whether he then SHOWS as a candidate is
    # gated by survival — if his ADP puts him out of reach of my early picks, honestly
    # listing him would be a lie, so the assertion is conditional on reachability.
    board, predicted = _inputs()
    s = OS.generate(board, predicted)
    names = {c["name"] for e in s["branches"]["contingency_bowers_available"]
             for c in e["candidates"]}
    prim = {c["name"] for e in s["branches"]["primary_both_tes_gone"]
            for c in e["candidates"]}
    assert "Brock Bowers" not in prim     # removed as a predicted keeper in the primary

    bowers = next((p for p in board.get("players", []) if p.get("name") == "Brock Bowers"), None)
    my_picks = (board.get("pick_order") or {}).get("my_picks") or []
    assert bowers is not None and my_picks
    adp = bowers.get("adjusted_adp") or bowers.get("raw_adp")
    reachable = OS.survival_probability(float(adp), my_picks[0]) >= OS.SURVIVAL_FLOOR
    if reachable:
        assert "Brock Bowers" in names    # returned to the pool AND reachable -> surfaced
    else:
        assert "Brock Bowers" not in names   # his ADP now puts him out of reach even when available


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
