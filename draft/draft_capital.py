# TERRITORY: A
"""NFL DRAFT CAPITAL AS A BOARD COLUMN — additive, never touching a projection.

Cory, 2026-08-17: "I'd want to give these players a boost due to upside
potential especially in dead rounds."

STEP 0 OF THAT, AND ONLY STEP 0. Nothing can key on "first-round rookie WR"
until a board row actually carries the NFL round, so this attaches it. It
changes NO ranking, NO projection and NO weight — `attach_capital` writes four
new keys and touches nothing else, which is a property a test checks rather than
a promise this docstring makes.

WHY THE COLUMN IS WORTH CARRYING (draft/audit/rookie_wr_capital_2026-08-17.md,
EXPLORATORY): rookie WRs 2023-25 against the WR waiver wire of 124.1/season —

    rd1    n=15  +7.4  [-19.7, +34.3]   8/15 reached 150 pts
    rd2    n=12 -33.1  [-62.3,  +0.0]   3/12
    rd3    n=17 -73.9  [-91.0, -53.8]   0/17
    rd4-7  n=55 -99.4  [-108.6,-88.6]   1/55   <- and that one is Puka Nacua

Read the top row precisely: its interval SPANS ZERO. rd1 is the only tier not
measurably WORSE than streaming the spot; it is not shown to be better. The rows
carrying decisive intervals are rd3 and rd4-7, and what they license is a
warning, not a boost.

PERIOD-CORRECT BY CONSTRUCTION. The capital stores drop the source's
career-outcome columns at build time, so what remains is what was knowable on
NFL draft night — months before any fantasy draft. `test_rookie_wr_capital.py`
asserts that, because the moment a career column reappears this column becomes
hindsight wearing a draft-night label.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKTEST = HERE / "backtest"

#: Only tiers with a measured outcome distribution get a name. A round the
#: study never graded must not acquire an implied verdict by being tiered.
TIERS = {1: "rd1", 2: "rd2", 3: "rd3"}
LATE_TIER = "rd4-7"


def tier_of(nfl_round: int) -> str:
    return TIERS.get(int(nfl_round), LATE_TIER)


def normalize_name(name: str) -> str:
    """Join key. Lowercased, punctuation stripped, generational suffix removed.

    THE JOIN IS BY NAME AND THAT IS A REAL WEAKNESS, not a convenience: every
    row in nflverse_draft_picks_2026.json carries `sleeper_id: None`, so there
    is no id to join on for the class that matters most. Callers get the
    unmatched list back and must surface it — a rookie silently missing from
    this column reads as "not a rookie", which is the opposite of the truth.
    """
    s = re.sub(r"[^a-z ]", "", str(name or "").lower())
    return re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s).strip()


def load_capital(paths: list[Path] | None = None) -> list[dict]:
    """Every committed capital row, both the historical store and this class."""
    paths = paths or [BACKTEST / "nflverse_draft_picks.json",
                      BACKTEST / "nflverse_draft_picks_2026.json"]
    out: list[dict] = []
    for p in paths:
        if not p.exists():
            continue
        picks = json.loads(p.read_text())["picks"]
        out.extend(picks if isinstance(picks, list) else list(picks.values()))
    return out


def attach_capital(board: list[dict], capital: list[dict], season: int) -> dict:
    """Additively write nfl_draft_round / _pick / capital_tier / is_nfl_rookie.

    Returns a diagnostic, including the unmatched rookies. Mirrors
    own_projections.attach_own_model's contract deliberately: a player with no
    capital record is left COMPLETELY untouched — no key, not None — so "absent"
    stays distinguishable from "undrafted", which are different facts. An
    undrafted free agent and a player our join simply missed must not look the
    same to any consumer.

    `season` is the board's season, and `is_nfl_rookie` means "drafted by an NFL
    team THIS season" — not "years_exp == 0", which also catches undrafted
    players and practice-squad holdovers.
    """
    by_id: dict[str, dict] = {}
    by_name: dict[str, dict] = {}
    for c in capital:
        sid = c.get("sleeper_id")
        if sid:
            by_id[str(sid)] = c
        # First writer wins, so a later class cannot silently reassign a name
        # that an earlier, id-joinable row already owns.
        by_name.setdefault(normalize_name(c.get("name")), c)

    matched_by_id = matched_by_name = 0
    for p in board:
        pid = str(p.get("player_id") or "")
        c = by_id.get(pid)
        if c is not None:
            matched_by_id += 1
        else:
            c = by_name.get(normalize_name(p.get("name")))
            if c is None:
                continue
            matched_by_name += 1
        p["nfl_draft_round"] = int(c["round"])
        p["nfl_draft_pick"] = int(c["pick"])
        p["capital_tier"] = tier_of(int(c["round"]))
        p["is_nfl_rookie"] = bool(int(c["season"]) == int(season))

    this_class = [c for c in capital if int(c["season"]) == int(season)]
    board_names = {normalize_name(p.get("name")) for p in board}
    unmatched = sorted(c["name"] for c in this_class
                       if normalize_name(c["name"]) not in board_names)
    return {
        "season": season,
        "capital_rows": len(capital),
        "matched_by_id": matched_by_id,
        "matched_by_name": matched_by_name,
        "attached": matched_by_id + matched_by_name,
        "this_class_rows": len(this_class),
        "unmatched_this_class": unmatched,
        "join_note": ("the current class joins BY NAME — its capital store "
                      "carries no sleeper_id — so unmatched rows are reported "
                      "here rather than dropped silently"),
        "column_is_informational": True,
        "changes_projection_or_ranking": False,
    }
