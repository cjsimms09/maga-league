#!/usr/bin/env python3
"""THE FORECAST SLATE — exactly what the model commits to, before it happens.

The infrastructure for forward prediction existed (ledger, grader, calibration);
what was missing was the HABIT of forecasting rather than explaining. This module
is that habit made concrete: a pre-registered list of gradeable claims — the
resolution rule of each fixed HERE, in code, before any outcome — plus a
`materialize()` that turns a committed value into a ledger-ready `forecast` entry
(validated against the same skeleton src/predledger.js enforces).

It is deliberately DECOUPLED from the live board schema: the war room supplies the
value at decision time (the survival %, the dollar estimate, the predicted name);
the slate owns the resolution rule and the type. So committing a forecast is one
call with a number, and the rule it will be graded by was written down first.

Graded by forecast_grade.py as reality arrives; feeds the calibration curve.
Pure + unit-tested (test_forecast_slate.py)."""
from __future__ import annotations

# Each template pre-registers a CATEGORY of forecast. `key_hint` shows the join
# key shape a caller fills in per instance (e.g. per seat, per player, per week).
PRE_DRAFT = [
    {
        "id": "survival",
        "ftype": "probability",
        "key_hint": "survival:<player_id>@pick<my_next_pick>",
        "claim": "P(this target survives to my next pick)",
        "resolution_rule": ("1 if the player was still undrafted when my next pick came on "
                            "the clock, else 0 — read from the actual draft board"),
        "resolves_when": "draft night (the moment my next pick arrives)",
        "method": "survival-forecast-v1",
    },
    {
        "id": "adp_fall",
        "ftype": "probability",
        "key_hint": "adp_fall:<player_id>",
        "claim": "P(this player falls more than a full round past his ADP)",
        "resolution_rule": ("1 if the player's actual overall draft slot exceeds his preseason "
                            "ADP by more than one round (10 picks), else 0"),
        "resolves_when": "draft end",
        "method": "adp-fall-forecast-v1",
    },
    {
        "id": "room_seat",
        "ftype": "categorical",
        "key_hint": "room_seat:r1p<seat>",
        "claim": "which player the room takes at this round-1 seat",
        "resolution_rule": "the player_id actually drafted at that overall pick",
        "resolves_when": "the moment that seat picks",
        "method": "room-seat-forecast-v1",
    },
    {
        "id": "roster_dollars",
        "ftype": "point",
        "key_hint": "roster_dollars",
        "claim": "my roster's expected end-of-season dollars, committed at draft end",
        "resolution_rule": ("realized dollars for my roster under the era-correct payout table "
                            "(money_grade grade_actual) once the season completes"),
        "resolves_when": "season end (the Annual)",
        "method": "roster-dollars-forecast-v1",
        "unit": "$",
    },
]

WEEKLY = [
    {
        "id": "weekly_high_winner",
        "ftype": "categorical",
        "key_hint": "weekly_high:<season>w<week>",
        "claim": "which roster posts the week's high score (the 37.5% pool)",
        "resolution_rule": "the roster_id with the top score that week (money_grade weekly_high_winners)",
        "resolves_when": "the week's final scores",
        "method": "weekly-high-forecast-v1",
    },
    {
        "id": "champ_prob",
        "ftype": "probability",
        "key_hint": "champ_prob:<roster_id>@w<week>",
        "claim": "P(this team wins the league championship), committed weekly",
        "resolution_rule": "1 if this roster is the season's champion, else 0",
        "resolves_when": "season end",
        "method": "champ-prob-forecast-v1",
    },
    {
        "id": "bust",
        "ftype": "probability",
        "key_hint": "bust:<player_id>@w<week>",
        "claim": "P(this player busts relative to ADP over the rest of season)",
        "resolution_rule": ("1 if the player finishes outside the top-N at his position where N is "
                            "his ADP-implied tier, else 0 — read from realized end-of-season ranks"),
        "resolves_when": "season end",
        "method": "bust-forecast-v1",
    },
]

_BY_ID = {t["id"]: t for t in PRE_DRAFT + WEEKLY}

# Mirrors src/predledger.js FORECAST_TYPES / assertForecast, kept in sync by
# test_forecast_slate.py so a value that would 400 at the ledger fails here first.
FORECAST_TYPES = ("probability", "point", "categorical")


def template(template_id: str) -> dict:
    t = _BY_ID.get(template_id)
    if t is None:
        raise KeyError(f"no forecast template {template_id!r}; known: {sorted(_BY_ID)}")
    return t


def materialize(template_id: str, key: str, value, *, claim: str | None = None, **extra) -> dict:
    """A committed forecast, ready to append to the ledger. `key` is the concrete
    join key (fill the template's key_hint); `value` is the committed prediction.
    Validates the same skeleton the ledger enforces, so a bad forecast is caught at
    the point of commitment, not at the server boundary."""
    t = template(template_id)
    ftype = t["ftype"]
    if ftype not in FORECAST_TYPES:
        raise ValueError(f"template {template_id} has unknown ftype {ftype!r}")
    if value is None:
        raise ValueError("a forecast needs a committed value")
    if ftype == "probability":
        v = float(value)
        if not (0.0 <= v <= 1.0):
            raise ValueError("a probability forecast needs value in [0,1]")
    payload = {
        "key": key,
        "ftype": ftype,
        "value": value,
        "claim": claim or t["claim"],
        "resolution_rule": t["resolution_rule"],
        "resolves_when": t["resolves_when"],
        "template_id": template_id,
    }
    if "unit" in t:
        payload["unit"] = t["unit"]
    payload.update(extra)
    return {"kind": "forecast", "method": t["method"], "payload": payload}


def resolution(forecast_key: str, outcome, *, source: str | None = None) -> dict:
    """The matching resolution entry, written only when reality is known."""
    if outcome is None:
        raise ValueError("a resolution needs an outcome")
    p = {"forecast_key": forecast_key, "outcome": outcome}
    if source:
        p["source"] = source
    return {"kind": "forecast_resolution", "method": "forecast-resolution-v1", "payload": p}
