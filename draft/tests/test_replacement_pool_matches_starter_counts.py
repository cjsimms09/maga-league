# TERRITORY: A
"""REPLACEMENT MUST BE RANKED OVER EVERYONE WHO STARTS — register 283's guard.

WHAT WENT WRONG, in one sentence: at the 2026 keeper lock `build.py` stopped
putting the 23 kept players in `players` while `starter_counts` stayed at its
league-wide values, and replacement is *the Nth-best projection*, so dropping
12 RBs and 9 WRs from the ranked list walked the marker 12 and 9 places deeper.
`vorp = proj_mean - replacement`, so an understated replacement OVERSTATES every
VORP at that position **in proportion to keepers lost there** — a CROSS-position
error on a board `overall_rank` sorts by, not a constant that cancels.

WHY THIS FILE EXISTS RATHER THAN THE FIX ALONE. The fix is one keyword argument
at two call sites. Nothing about `apply_vorp(players, cfg)` looks wrong, the
defect only appears once a keeper lock lands, and the lock lands once a year —
in August, hours before the draft, which is exactly when nobody is reading
diffs. `build.py:1963` had already MEASURED this mechanism on 08-20 and ruled it
immaterial at *"about 1.8 points, ~2-3%, so it flips no pick on its own"*: correct
with THREE keepers out of the pool, and nobody attached an expiry to the
condition that made it small. Three days later it was 23.

THE INVARIANT, stated so it survives a rewrite: **removing players from the
DRAFTABLE pool must not move replacement**, because who can be drafted has no
bearing on who starts. Everything below is that one sentence in a different key.

RULE 3e/3f — every arm here carries a case where the answer is known before the
code runs, and the DEFECT arm is the known positive: `test_the_defect_arm_*`
reconstructs the pre-fix call and asserts it reproduces the shipped board's
wrong numbers. A guard whose failing case has never been seen to fail has not
been tested, only run.
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "draft"))  # vorp.py imports config_schema flat

import vorp as vorp_mod  # noqa: E402

BOARD = ROOT / "public" / "draft_data.json"


def _board():
    if not BOARD.exists():
        pytest.skip("public/draft_data.json not built")
    return json.loads(BOARD.read_text())


# ── the synthetic arm: the answer is known by hand ──────────────────────────

def _cfg(teams=10, rb=2, wr=3, flex=1):
    # The key is `starters`, NOT `roster_slots`. Writing this fixture with the
    # wrong one is rule 3f's canonical failure — `ctx.starters` where the code
    # reads `ctx.league.starters` — and it cost a run here before the KeyError
    # caught it. `config_schema.starters_at` reads `cfg["starters"]`.
    return {
        "teams": teams,
        "starters": {"QB": 1, "RB": rb, "WR": wr, "TE": 1, "FLEX": flex,
                     "K": 1, "DEF": 1},
    }


def _pool():
    """40 players a position, projections descending 200, 199, 198, ... so the
    Nth-best is EXACTLY `201 - N` and every assertion below can be read off by
    hand rather than compared to whatever the code happens to return."""
    out = []
    for pos in ("QB", "RB", "WR", "TE", "K", "DEF"):
        for i in range(40):
            out.append({"player_id": f"{pos}{i}", "position": pos,
                        "proj_mean": 200.0 - i})
    return out


def test_removing_draftable_players_does_not_move_replacement():
    """THE INVARIANT ITSELF. Take the whole pool, price it. Now take out the top
    twelve RBs and top nine WRs — the real 2026 keeper split — and price what is
    left while still ranking over everyone. Replacement must not have moved by a
    single point, because none of those players stopped starting."""
    full = _pool()
    cfg = _cfg()
    before, _ = vorp_mod.replacement_levels(full, cfg)

    kept = [p for p in full if p["position"] == "RB" and int(p["player_id"][2:]) < 12]
    kept += [p for p in full if p["position"] == "WR" and int(p["player_id"][2:]) < 9]
    draftable = [p for p in full if p not in kept]
    assert len(kept) == 21 and len(draftable) == len(full) - 21

    after, _ = vorp_mod.replacement_levels(draftable, cfg, full_pool=draftable + kept)

    assert after == before, (
        "replacement moved when players were removed from the DRAFTABLE pool. "
        f"before={before} after={after}. Who can be drafted has no bearing on "
        "who starts — register 283."
    )


def test_the_defect_arm_reproduces_the_bug_KNOWN_POSITIVE():
    """RULE 3e. The arm above is a `no`, and a `no` from a check that has never
    said `yes` is not evidence. So here is the pre-fix call — same pool, same
    counts, `full_pool` omitted — and it must be WRONG, in the direction and by
    the amount arithmetic says.

    RB has 2 dedicated slots x 10 teams = 20. Drop the top 12 RBs and rank 20 of
    what is left is rank 32 of the whole pool. Projections are 200 - i, so the
    marker falls from 181 to 169 — TWELVE points, one for each keeper lost. If
    this arm ever stops failing, the guard above is guarding nothing."""
    full = _pool()
    cfg = _cfg()
    kept_rb = [p for p in full if p["position"] == "RB" and int(p["player_id"][2:]) < 12]
    draftable = [p for p in full if p not in kept_rb]

    correct, _ = vorp_mod.replacement_levels(draftable, cfg, full_pool=full)
    buggy, _ = vorp_mod.replacement_levels(draftable, cfg)  # the pre-fix call

    assert buggy["RB"] < correct["RB"], (
        "the pre-fix call did NOT understate RB replacement — either the defect "
        "is gone by some other route, in which case delete this file and say why, "
        "or this fixture no longer exercises it."
    )
    assert correct["RB"] - buggy["RB"] == pytest.approx(12.0), (
        f"expected the marker to walk exactly 12 places (one per keeper lost at "
        f"RB) on a 200-i ladder, saw {correct['RB'] - buggy['RB']}"
    )


def test_it_is_a_cross_position_error_not_a_constant():
    """WHY IT REACHES THE BOARD. If every position were understated by the same
    amount, `overall_rank` — a sort on vorp — would be unchanged and this would
    be cosmetic. It is not: the error is proportional to keepers lost AT THAT
    POSITION, so a position with no keepers is priced correctly next to one that
    lost twelve, and the two are then compared."""
    full = _pool()
    cfg = _cfg()
    kept = [p for p in full if p["position"] == "RB" and int(p["player_id"][2:]) < 12]
    draftable = [p for p in full if p not in kept]

    correct, _ = vorp_mod.replacement_levels(draftable, cfg, full_pool=full)
    buggy, _ = vorp_mod.replacement_levels(draftable, cfg)

    rb_err = correct["RB"] - buggy["RB"]
    te_err = correct["TE"] - buggy["TE"]
    assert te_err == 0.0, f"TE lost no keepers and must be unmoved, saw {te_err}"
    assert rb_err > 0.0
    assert rb_err != te_err, (
        "RB and TE moved by the same amount, which would make this a constant "
        "that cancels in a sort. The whole reason register 283 changed picks is "
        "that it does not cancel."
    )


def test_default_call_is_byte_for_byte_unchanged():
    """`full_pool` defaults to `players`, so a caller that has no keepers to pass
    — every historical replay, every backtest arm — must be untouched. This is
    the blast-radius bound on the fix, pinned rather than asserted in prose."""
    full = _pool()
    cfg = _cfg()
    a, da = vorp_mod.replacement_levels(full, cfg)
    b, db = vorp_mod.replacement_levels(full, cfg, full_pool=None)
    c, dc = vorp_mod.replacement_levels(full, cfg, full_pool=full)
    assert a == b == c
    assert da == db == dc


# ── the repo-parity arm: the call sites, not the function ───────────────────

CALL_SITES = [
    ("draft/build.py", "the board build"),
    ("draft/tools/attach_draftsharks.py",
     "runs AFTER build.py in draft-data.yml and re-derives replacement from "
     "board['players'] — patching only build.py produces an identical board"),
]


@pytest.mark.parametrize("rel,why", CALL_SITES)
def test_every_keeper_aware_call_site_passes_full_pool(rel, why):
    """The function is now correct BY DEFAULT-ARGUMENT, which means the defect
    can come back by deletion rather than by edit: drop `full_pool=` at a call
    site and every other test in this file still passes. So the call sites are
    pinned by name, with the reason each one matters attached to the failure."""
    src = (ROOT / rel).read_text()
    assert "apply_vorp(" in src, f"{rel} no longer calls apply_vorp — re-derive this guard"
    calls = src.count("apply_vorp(")
    passes = src.count("full_pool=")
    assert passes >= 1, (
        f"{rel} calls apply_vorp without full_pool=. This is register 283 coming "
        f"back: {why}."
    )
    assert passes >= calls - 1, (
        f"{rel} has {calls} apply_vorp call(s) but only {passes} full_pool= "
        "argument(s) — one of them ranks the draftable pool."
    )


def test_the_parity_arm_can_fail_KNOWN_POSITIVE():
    """RULE 3f. The check above is a substring count, which is exactly the shape
    that passes for the wrong reason. Run it against text where the answer is
    known: the pre-fix call must trip it."""
    pre_fix = "players, vorp_diag = vorp_mod.apply_vorp(board['players'], cfg)\n"
    assert pre_fix.count("apply_vorp(") == 1
    assert pre_fix.count("full_pool=") == 0, (
        "the parity assertion cannot distinguish the pre-fix call from the fixed "
        "one, so it proves nothing about either"
    )


# ── the shipped board: what it is carrying right now ────────────────────────

def test_shipped_board_replacement_is_ranked_over_starters_not_draftables():
    """THE REAL DATA, which is the only arm that can catch a fix that works on a
    fixture and not on the board.

    Recompute replacement from the committed board two ways — over `players`
    alone, and over `players + kept_players` — and require the published
    `replacement_points` to match the SECOND.

    ⚠️ SCOPED TO BOARDS BUILT AFTER THE FIX LANDED, and that is not a softening.
    The board committed today was built 2026-08-22T03:43Z, before the fix, and it
    IS wrong — RB 147.8 where ranking over everyone who starts gives 181.1. That
    is a fact about a stale artifact, not a defect in the code, and pinning it as
    a permanent red would add one more always-failing row to a suite whose reds
    are supposed to mean something. What this arm must catch is the case that can
    still hurt: a board built by code that HAS the fix and published wrong
    anyway — the attach_draftsharks half silently undoing the build.py half,
    which is precisely how this defect would have survived being fixed.

    So it skips with the numbers printed while the board is older than the fix,
    and goes live the moment draft-data.yml publishes again. Register 319 is the
    reason that has not happened yet."""
    board = _board()
    cfg = board.get("league") or {}
    if "teams" not in cfg:
        pytest.skip("board carries no league.teams")
    kept = board.get("kept_players") or []
    if not kept:
        pytest.skip("no keepers on this board — nothing to distinguish")

    published = (board.get("replacement") or {}).get("replacement_points") or {}
    if not published:
        pytest.skip("board carries no replacement block")

    _, diag = vorp_mod.replacement_levels(
        board["players"], cfg, full_pool=board["players"] + kept)
    recomputed = diag["replacement_points"]

    bad = {p: (published[p], recomputed[p]) for p in published
           if p in recomputed and abs(published[p] - recomputed[p]) > 0.05}

    # The commit that added `full_pool=` to both call sites.
    FIX_LANDED = "2026-08-25T00:00:00Z"
    built = str(board.get("built_at") or "")

    if built and built < FIX_LANDED:
        # KNOWN POSITIVE ON REAL DATA. Not a skip: the stale board is the one
        # case where the answer is known in advance, so assert the comparison
        # FINDS it. If this ever passes silently, the arm below is inert and the
        # next board could publish wrong with nothing going red.
        assert bad, (
            f"board built {built} predates the register-283 fix, so ranking over "
            "everyone who starts MUST disagree with what it published — and it "
            "does not. Either the board was rebuilt without its built_at moving, "
            "or this comparison no longer computes anything."
        )
        assert "RB" in bad and bad["RB"][0] < bad["RB"][1], (
            f"the disagreement is not the register-283 shape (RB understated): {bad}"
        )
        return

    assert not bad, (
        "the published board's replacement levels are NOT what ranking over "
        f"everyone who starts gives: {bad} (published, correct). "
        f"{len(kept)} keepers are out of `players`, and this board was built "
        f"{built} — AFTER the fix — so one of the two call sites is ranking the "
        "draftable pool again. attach_draftsharks.py runs after build.py and is "
        "the one that can silently undo it. Register 283."
    )
