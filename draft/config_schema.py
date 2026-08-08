"""Module 1 — league config schema and validator.

Everything downstream derives from league_config.json. Nothing proceeds until it
validates, because a silently-wrong roster slot or scoring value corrupts every
number the tool produces without ever looking broken.
"""
from __future__ import annotations
import json
from pathlib import Path

# Roster slots we understand. Anything else in the league is carried through as a
# bench-equivalent so an exotic slot never silently vanishes from roster math.
STARTER_SLOTS = {"QB", "RB", "WR", "TE", "FLEX", "SUPER_FLEX", "REC_FLEX", "K", "DEF", "IDP_FLEX"}
BENCH_SLOTS = {"BN", "IR", "TAXI"}

# Which positions each flex slot can absorb. Drives the iterative FLEX
# allocation in Module 4 — get this wrong and replacement level is wrong.
FLEX_ELIGIBILITY = {
    "FLEX": ["RB", "WR", "TE"],
    "REC_FLEX": ["WR", "TE"],
    "SUPER_FLEX": ["QB", "RB", "WR", "TE"],
}

KEEPER_COST_MODELS = {"original_round", "fixed_round", "escalator", "no_cost", "top_picks_flat"}
DRAFT_TYPES = {"snake", "linear", "third_round_reversal"}

REQUIRED_TOP_LEVEL = ["league_id", "season", "teams", "draft_type", "roster_slots", "scoring", "keepers"]


class ConfigError(ValueError):
    """Raised with every problem found, not just the first."""


def _err(problems: list[str], cond: bool, message: str) -> None:
    if cond:
        problems.append(message)


def validate(cfg: dict) -> dict:
    """Validate and normalize. Raises ConfigError listing every problem."""
    p: list[str] = []

    for key in REQUIRED_TOP_LEVEL:
        _err(p, key not in cfg, f"missing required field: {key}")
    if p:
        raise ConfigError("league_config is unusable:\n  - " + "\n  - ".join(p))

    _err(p, not isinstance(cfg["teams"], int) or not (2 <= cfg["teams"] <= 32),
         f"teams must be an int 2-32, got {cfg['teams']!r}")
    _err(p, cfg["draft_type"] not in DRAFT_TYPES,
         f"draft_type must be one of {sorted(DRAFT_TYPES)}, got {cfg['draft_type']!r}")

    slots = cfg["roster_slots"]
    _err(p, not isinstance(slots, dict) or not slots, "roster_slots must be a non-empty object")
    if isinstance(slots, dict):
        starters = {k: v for k, v in slots.items() if k in STARTER_SLOTS}
        _err(p, not starters, "roster_slots defines no starting slots")
        for k, v in slots.items():
            _err(p, not isinstance(v, int) or v < 0, f"roster_slots.{k} must be a non-negative int")
            _err(p, k not in STARTER_SLOTS and k not in BENCH_SLOTS,
                 f"roster_slots.{k} is not a slot type I understand "
                 f"(known: {sorted(STARTER_SLOTS | BENCH_SLOTS)})")

    scoring = cfg["scoring"]
    _err(p, not isinstance(scoring, dict) or not scoring, "scoring must be a non-empty object")
    if isinstance(scoring, dict):
        for k, v in scoring.items():
            _err(p, not isinstance(v, (int, float)), f"scoring.{k} must be numeric, got {v!r}")
        # A league that scores receptions at 0 is legal, but one that scores no
        # receiving yards at all is almost certainly a botched import.
        _err(p, "rec_yd" not in scoring and "rec" not in scoring,
             "scoring has neither rec_yd nor rec — the import probably failed")

    k = cfg["keepers"]
    _err(p, not isinstance(k, dict), "keepers must be an object")
    if isinstance(k, dict):
        _err(p, "count" not in k or not isinstance(k.get("count"), int) or k["count"] < 0,
             "keepers.count must be a non-negative int")
        _err(p, k.get("cost_model") not in KEEPER_COST_MODELS,
             f"keepers.cost_model must be one of {sorted(KEEPER_COST_MODELS)}, got {k.get('cost_model')!r}")
        if k.get("cost_model") == "fixed_round":
            _err(p, not isinstance(k.get("fixed_round"), int),
                 "keepers.cost_model 'fixed_round' requires keepers.fixed_round")
        if k.get("cost_model") == "escalator":
            _err(p, not isinstance(k.get("escalator_rounds"), int),
                 "keepers.cost_model 'escalator' requires keepers.escalator_rounds (rounds gained per year kept)")
        _err(p, k.get("undrafted_rule") not in {"assigned_round", "ineligible", None},
             "keepers.undrafted_rule must be 'assigned_round' or 'ineligible'")
        if k.get("undrafted_rule") == "assigned_round":
            _err(p, not isinstance(k.get("undrafted_round"), int),
                 "keepers.undrafted_rule 'assigned_round' requires keepers.undrafted_round")

    slot = cfg.get("my_draft_slot")
    _err(p, slot is not None and (not isinstance(slot, int) or not (1 <= slot <= cfg.get("teams", 32))),
         f"my_draft_slot must be between 1 and {cfg.get('teams')}")

    if p:
        raise ConfigError("league_config is unusable:\n  - " + "\n  - ".join(p))

    return normalize(cfg)


def draft_rounds(cfg: dict) -> int:
    """THE single source of truth for draft LENGTH (rounds).

    DRAFT ROUNDS vs MY PICKS — do not conflate them.

    `rounds` is the LENGTH of the draft: one round per roster spot. Under
    top_picks_flat a keeper does NOT shorten the draft — it forfeits a SPECIFIC
    round (the k-th keeper forfeits round k), so every team still drafts across
    all `roster_size` rounds; a keeper simply skips their pick in the forfeited
    ones. My *picks remaining* is therefore rounds − my_keeper_count (15 − 3 = 12
    live picks in rounds 4–15), and that subtraction belongs in the pick order
    (per-team), NOT in the draft length.

    The old `roster_size - keepers.count` was the bug (it shortened the draft to
    12 rounds for EVERYONE — only correct for a 'keepers shrink the draft' model,
    not ours). Confirmed by Cory 2026-08-08: 15 rounds, 12 live picks, rounds
    1–3 keeper-forfeited. Every consumer (config_schema.normalize,
    keepers.build_true_pick_order, build.py's ADP fallback, the JS mock shape)
    calls THIS — the constant carries its reasoning in one place, so the
    conflation cannot creep back in through a stray fallback. Rounds NEVER
    derives from keeper count.
    """
    explicit = cfg.get("rounds")
    if explicit:
        return int(explicit)
    slots = cfg.get("roster_slots") or {}
    return cfg.get("roster_size") or sum(slots.values())


def normalize(cfg: dict) -> dict:
    """Fill derived fields the rest of the pipeline expects."""
    out = dict(cfg)
    slots = out["roster_slots"]
    out["starters"] = {k: v for k, v in slots.items() if k in STARTER_SLOTS and v > 0}
    out["bench_size"] = sum(v for k, v in slots.items() if k in BENCH_SLOTS)
    out["roster_size"] = sum(slots.values())
    out["rounds"] = draft_rounds(out)   # single source; see draft_rounds()
    out.setdefault("adp_blend_weight", 0.7)   # Module 3: adjusted vs raw ADP anchor
    out.setdefault("opportunity_cap", 0.15)   # Module 2: max ± adjustment to consensus
    out.setdefault("recency_weights", [0.7, 0.3])  # Module 2: last season, season before
    return out


def starters_at(cfg: dict, position: str) -> int:
    """Dedicated (non-flex) starting slots for a position, per team."""
    return int(cfg["starters"].get(position, 0))


def flex_slots(cfg: dict) -> dict[str, int]:
    return {k: v for k, v in cfg["starters"].items() if k in FLEX_ELIGIBILITY}


def load(path: str | Path) -> dict:
    with open(path) as fh:
        return validate(json.load(fh))


def save(cfg: dict, path: str | Path) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as fh:
        json.dump(cfg, fh, indent=2, sort_keys=True)
