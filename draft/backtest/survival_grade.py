"""SURVIVAL, EMITTED AND GRADED FROM THE DRAFT ITSELF.

The first external forecast that can be graded end to end with no outcome data,
no nflverse and no egress: **will this player still be available when this seat
picks again?** It resolves from the draft's own later picks, which the record
already carries — so the harness can produce a real graded observation today
rather than waiting on the weekly-outcome ingest.

It is also the same forecast TYPE the home league emits (`ftype: probability`,
survival), which is the entire point of the harness: one grader, one meaning.

TWO THINGS THIS FILE REFUSES TO DO, and both are rule-1 labelling rather than
mechanics:

  1. **A BASELINE IS NOT THE SHIPPED POLICY.** `emit_forecast` stamps every
     observation with the fingerprint of the weights `engine.js` loads. If a
     baseline heuristic produced the number, that stamp is a lie — the record
     would claim to be a measurement of what we ship, and `assert_policy_current`
     would happily aggregate it with real ones. So a policy must DECLARE itself
     and the declaration travels on the observation; `grade()` refuses a mixed
     bag rather than averaging across policies.
  2. **AN UNRESOLVABLE FORECAST IS NOT A WRONG ONE.** A seat's last pick of the
     draft has no next turn, so a survival forecast made there can never resolve.
     Scoring it as a miss would drag every Brier score toward the same corner;
     it is dropped and COUNTED, exactly as F3 drops a player-season with no
     weekly series.
"""
from __future__ import annotations

# A baseline is allowed to exist. It is not allowed to be mistaken for the tool.
SHIPPED = "shipped"
BASELINE_PREFIX = "baseline:"


def next_turn(picks: list, overall: int, team) -> int | None:
    """The seat's next pick AFTER `overall`, or None if it has none.

    None is the honest answer at the end of a draft and it is what makes a
    forecast unresolvable — not a zero, and not the end of the draft standing in
    for a turn that never came.
    """
    later = [p["overall"] for p in picks
             if p.get("team") == team and (p.get("overall") or 0) > overall]
    return min(later) if later else None


def resolve(picks: list, overall: int, team, player_id) -> bool | None:
    """Did `player_id` survive from `overall` to this seat's next turn?

    THE WINDOW IS STRICTLY BETWEEN THE TWO PICKS. If the seat takes the player at
    its next turn, he SURVIVED — he was there to be taken. Including that pick in
    the window would score every player a seat actually got as "did not survive",
    which inverts the quantity on exactly the players the forecast is about.
    """
    nxt = next_turn(picks, overall, team)
    if nxt is None:
        return None
    gone = {str(p.get("player_id")) for p in picks
            if overall < (p.get("overall") or 0) < nxt}
    return str(player_id) not in gone


def adp_baseline(ctx: dict, top_k: int = 5) -> list:
    """A DECLARED BASELINE, not the shipped policy — see the module note.

    P(survive) falls as more picks stand between now and the seat's next turn and
    as the player is priced earlier. Deliberately crude: its job is to exercise
    the emit-and-grade path end to end and to be a floor a real policy must beat,
    not to be good. The `resolution_rule` is written HERE, before any outcome is
    known, because a forecast whose rule is chosen later can be reinterpreted.
    """
    avail = sorted((ctx.get("available") or []), key=lambda r: r.get("adp") or 1e9)[:top_k]
    gap = max(1, int(ctx.get("picks_until_next_turn") or 1))
    out = []
    for r in avail:
        adp = float(r.get("adp") or 999)
        # Crude and stated: a player already priced past the seat's next turn is
        # likely to last; one priced before it is not.
        p = 1.0 / (1.0 + pow(2.718281828, -(adp - ctx["overall"] - gap) / max(1.0, gap)))
        out.append({"key": "survival:%s@%s" % (r.get("player_id"), ctx["overall"]),
                    "ftype": "probability", "value": round(min(max(p, 0.01), 0.99), 4),
                    "resolution_rule": ("1 if this player is still undrafted when this seat "
                                        "picks again, 0 if taken in between; UNRESOLVABLE and "
                                        "dropped if the seat has no later pick"),
                    "extra": {"player_id": str(r.get("player_id")), "team": ctx["team"],
                              "policy_id": BASELINE_PREFIX + "adp_logistic_v1"}})
    return out


def grade(observations: list, picks: list) -> dict:
    """Brier score over resolvable survival forecasts. REFUSES a mixed bag.

    Two policies averaged into one number is not a measurement of either, and the
    resulting figure looks exactly like a measurement — so a mixed set raises
    rather than returning something plausible.
    """
    ids = {str((o.get("payload") or {}).get("policy_id")
               or (o.get("payload") or {}).get("extra", {}).get("policy_id"))
           for o in (observations or [])}
    ids = {i for i in ids if i and i != "None"}
    if len(ids) > 1:
        raise ValueError(
            "observations mix %d policies (%s) — a Brier score averaged across "
            "policies measures neither of them" % (len(ids), ", ".join(sorted(ids))))

    # AND THE OTHER AXIS, which this function guarded in its docstring and not in
    # its code. `policy_id` says WHICH policy produced an observation; the
    # FINGERPRINT says which weights `engine.js` held when it was minted. Two
    # observations can both say `shipped` and be measurements of two different
    # tools — change a weight, replay again, and the old ones still grade, still
    # aggregate, and still read like evidence about what we ship.
    #
    # That is the failure this file's own header attributes to
    # `assert_policy_current`, and `assert_policy_current` HAS NO CALLERS: the
    # guard was written, documented as protecting this path, and never invoked.
    # Rule 6, on a contamination guard.
    #
    # Refused HERE rather than by calling that function, because the mixed-bag
    # question is answerable from the observations alone. `assert_policy_current`
    # additionally parses engine.js to compare against the CURRENT policy, which is
    # a different check and a dependency this one does not need.
    fps = {str(o.get("policy_fingerprint")) for o in (observations or [])
           if o.get("policy_fingerprint")}
    if len(fps) > 1:
        raise PolicyMixError(
            "observations were minted under %d different policy fingerprints (%s) — "
            "same policy NAME, different weights, so a Brier score over them measures "
            "neither version of the tool. Re-replay under one policy; do not average"
            % (len(fps), ", ".join(sorted(fps))))

    scored, unresolvable = [], 0
    for o in (observations or []):
        pay = o.get("payload") or {}
        pid = pay.get("player_id") or (pay.get("extra") or {}).get("player_id")
        team, overall = pay.get("team"), o.get("overall")
        if pid is None or team is None or overall is None:
            unresolvable += 1
            continue
        got = resolve(picks, overall, team, pid)
        if got is None:
            unresolvable += 1
            continue
        scored.append((float(pay.get("value")), 1.0 if got else 0.0))

    n = len(scored)
    brier = sum((p - y) ** 2 for p, y in scored) / n if n else None
    base = sum(y for _, y in scored) / n if n else None
    return {
        "policy_id": sorted(ids)[0] if ids else None,
        "n_scored": n,
        # ABSENT IS NOT WRONG. A forecast at a seat's last pick can never resolve;
        # scoring it as a miss would drag every Brier toward the same corner.
        "n_unresolvable": unresolvable,
        "brier": round(brier, 4) if brier is not None else None,
        "base_rate": round(base, 4) if base is not None else None,
        # The only honest reference for a crude baseline: predicting the base rate
        # every time. A model that cannot beat this has measured nothing.
        "brier_of_always_base_rate": round(base * (1 - base), 4) if base is not None else None,
        "beats_base_rate": (brier < base * (1 - base)) if (brier is not None and base) else None,
    }


class PolicyMixError(ValueError):
    """Observations minted under different weight-sets, graded as one number."""


def is_shipped_policy(policy_id) -> bool:
    """Whether an observation may be read as a measurement of the tool we ship."""
    return bool(policy_id) and not str(policy_id).startswith(BASELINE_PREFIX)
