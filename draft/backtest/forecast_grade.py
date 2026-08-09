#!/usr/bin/env python3
"""FORWARD-PREDICTION GRADER — the one score no backtest can produce.

Every other experiment in the Lab is retrospective: it replays 2023-25 and grades
against outcomes that already exist, with the analyst having seen the answers. A
FORECAST is committed in writing, timestamped, BEFORE the outcome exists — so it
carries no researcher degree of freedom, and it is the only way calibration ("91%
survival") is ever measurable, because calibration is a property of many live
claims graded forward.

This module grades ledger `forecast` entries against their `forecast_resolution`
entries (see src/predledger.js). It is PURE — it takes plain dicts (a ledger
export) and returns a scorecard — so it is unit-tested offline and can never write
back into the ledger it reads (the contamination rule).

THE FORWARD GUARANTEE, enforced here, not assumed: a forecast is graded ONLY if
its `decision_at` is strictly before its resolution's `decision_at`. A "forecast"
written after reality is not forward and is DISQUALIFIED, listed by key — so the
score can never be quietly inflated by backdated claims (the failure mode that let
three self-agreeing backtests through). Both timestamps are the SERVER clock the
ledger stamps, not a client's.

Grading by type:
  * probability — Brier (p - outcome)^2, outcome in {0,1}; also binned into a
    reliability table (predicted vs observed frequency), the calibration curve.
  * point       — signed error (value - outcome) and |error|; bias = mean signed.
  * categorical — hit/miss (value == outcome); accuracy = hit rate.
"""
from __future__ import annotations
from collections import defaultdict


def _ts(entry: dict):
    """The server decision-time stamp — the authority for WHEN a claim was made."""
    return entry.get("decision_at")


def _is_forward(fc: dict, res: dict) -> bool:
    """The guarantee: the forecast must be committed strictly before it resolves.
    Missing either stamp -> not provably forward -> disqualified (fail closed)."""
    a, b = _ts(fc), _ts(res)
    return bool(a) and bool(b) and a < b


def _pair(forecasts: list[dict], resolutions: list[dict]):
    """Join forecasts to resolutions by payload key. A forecast with no resolution
    is PENDING (reality has not answered yet); a resolution with no forecast is
    orphaned and reported. Returns (pairs, pending, orphans)."""
    by_key = {}
    for f in forecasts:
        k = (f.get("payload") or {}).get("key")
        if not k:
            continue
        # Keep the EARLIEST commitment per key. The client dedups within a session,
        # but the same claim can be re-committed across page-loads/days; grading the
        # earliest one keeps the record maximally forward (furthest before the
        # outcome) and makes a later re-commit harmless — it can never move the
        # timestamp closer to reality.
        prev = by_key.get(k)
        if prev is None or (f.get("decision_at") or "") < (prev.get("decision_at") or ""):
            by_key[k] = f
    res_by_key = {}
    for r in resolutions:
        k = (r.get("payload") or {}).get("forecast_key")
        if k:
            res_by_key.setdefault(k, r)   # first resolution wins (append-only; a re-resolve is ignored)
    pairs, orphans = [], []
    for k, r in res_by_key.items():
        if k in by_key:
            pairs.append((by_key[k], r))
        else:
            orphans.append(k)
    pending = [k for k in by_key if k not in res_by_key]
    return pairs, pending, orphans


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _reliability_table(prob_points: list[tuple], bins: int = 10) -> list[dict]:
    """Predicted-probability bins vs observed frequency — the calibration curve.
    `prob_points`: [(p, outcome01)]. Mirrors replay.js calibration() so survival
    forecasts and every other probability claim read on one scale."""
    buckets = [{"lo": i / bins, "hi": (i + 1) / bins, "n": 0, "hits": 0} for i in range(bins)]
    for p, o in prob_points:
        idx = min(bins - 1, max(0, int(p * bins)))
        buckets[idx]["n"] += 1
        buckets[idx]["hits"] += 1 if o >= 0.5 else 0
    out = []
    for b in buckets:
        mid = round((b["lo"] + b["hi"]) / 2, 2)
        rate = round(b["hits"] / b["n"], 3) if b["n"] else None
        out.append({
            "bucket": f"{int(b['lo']*100)}-{int(b['hi']*100)}%",
            "predicted_mid": mid, "n": b["n"], "observed_rate": rate,
            # positive = too pessimistic; negative = overconfident
            "error": round(rate - mid, 3) if rate is not None else None,
        })
    return out


def grade(entries: list[dict]) -> dict:
    """Grade a ledger export. `entries` is any list of ledger dicts; only
    kind=='forecast' and kind=='forecast_resolution' are consulted. Returns a
    scorecard the Annual (and, mid-season, the weekly grade) can print."""
    forecasts = [e for e in entries if e.get("kind") == "forecast"]
    resolutions = [e for e in entries if e.get("kind") == "forecast_resolution"]
    pairs, pending, orphans = _pair(forecasts, resolutions)

    graded, disqualified = [], []
    prob_points, brier_terms = [], []
    point_signed, point_abs = [], []
    cat_hits = 0
    cat_n = 0
    by_bucket = defaultdict(lambda: {"n": 0})   # per forecast "bucket" tag if present

    for fc, res in pairs:
        if not _is_forward(fc, res):
            disqualified.append({
                "key": (fc.get("payload") or {}).get("key"),
                "reason": "not forward: forecast decision_at is not strictly before its resolution",
                "forecast_at": _ts(fc), "resolved_at": _ts(res),
            })
            continue
        p = fc.get("payload") or {}
        ftype = p.get("ftype")
        outcome = (res.get("payload") or {}).get("outcome")
        rec = {"key": p.get("key"), "ftype": ftype, "claim": p.get("claim"),
               "value": p.get("value"), "outcome": outcome,
               "method": fc.get("method"), "forecast_at": _ts(fc)}
        if ftype == "probability":
            pv = _num(p.get("value"))
            ov = _num(outcome)
            if pv is None or ov is None:
                disqualified.append({"key": p.get("key"), "reason": "non-numeric probability/outcome"})
                continue
            o01 = 1.0 if ov >= 0.5 else 0.0
            brier = (pv - o01) ** 2
            rec["brier"] = round(brier, 4)
            brier_terms.append(brier)
            prob_points.append((pv, o01))
        elif ftype == "point":
            pv, ov = _num(p.get("value")), _num(outcome)
            if pv is None or ov is None:
                disqualified.append({"key": p.get("key"), "reason": "non-numeric point/outcome"})
                continue
            err = pv - ov
            rec["error"] = round(err, 3)
            rec["abs_error"] = round(abs(err), 3)
            point_signed.append(err)
            point_abs.append(abs(err))
        elif ftype == "categorical":
            hit = 1 if str(p.get("value")) == str(outcome) else 0
            rec["hit"] = bool(hit)
            cat_hits += hit
            cat_n += 1
        else:
            disqualified.append({"key": p.get("key"), "reason": f"unknown ftype {ftype!r}"})
            continue
        graded.append(rec)

    def _mean(xs):
        return round(sum(xs) / len(xs), 4) if xs else None

    return {
        "n_forecasts": len(forecasts),
        "n_resolved": len(pairs),
        "n_graded": len(graded),
        "n_pending": len(pending),
        "n_disqualified": len(disqualified),
        "pending_keys": pending,
        "orphan_resolution_keys": orphans,
        "disqualified": disqualified,
        "probability": {
            "n": len(prob_points),
            "brier": _mean(brier_terms),         # lower is better; 0.25 = a coin
            "reliability": _reliability_table(prob_points) if prob_points else [],
        },
        "point": {
            "n": len(point_signed),
            "bias": _mean(point_signed),          # signed: + = forecasts ran high
            "mae": _mean(point_abs),
        },
        "categorical": {
            "n": cat_n,
            "accuracy": round(cat_hits / cat_n, 3) if cat_n else None,
        },
        "graded": graded,
    }


if __name__ == "__main__":   # pragma: no cover
    import json
    import sys
    entries = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else []
    print(json.dumps(grade(entries), indent=2))
