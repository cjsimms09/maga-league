#!/usr/bin/env python3
# TERRITORY: A
"""IS THERE ANYTHING HERE YET — the standing pass over everything we accumulate.

WHY THIS EXISTS. We have built several accumulating archives and scheduled
nothing to examine any of them. The market snapshots pile up. The projection
archive will pile up. The prediction ledger fills. The only thing that has ever
looked at any of them is Cory asking a question, which means the answer arrives
when he happens to wonder rather than when the data becomes interesting.

THAT IS AN INTENTION WITH NO TRIGGER — the same failure already found in the
January reconstruction, the enforcement table's empty cells, and the grading cron
that existed and never ran. This is the trigger.

WHAT IT IS NOT. Not an analysis, not a dashboard, not a report anyone reads. It
runs on its own and stays silent unless something crosses a stated threshold.

THE OUTPUT IS ONE LINE MOST OF THE TIME. That is the correct output.

── THREE STATES, AND THE THIRD IS THE ONE THAT MATTERS ──────────────────────

    quiet     looked, nothing crossed
    ESCALATE  something crossed, or an archive stopped updating
    BLIND     COULD NOT LOOK

BLIND IS NOT QUIET. An archive this process cannot read reports BLIND and
escalates, because "I could not look" rendered as "nothing yet" is precisely the
failure this check exists to end — and it is the shape that would let this very
file become another silent no-op. Rule 13f, applied to the instrument: a check
that can only ever say "nothing yet" has not looked at anything.

── EVERY THRESHOLD IS STATED HERE, BEFORE THE DATA ARRIVES ──────────────────

Same discipline as `resolution_rule` on the forecast rail. A threshold chosen
after seeing the series is a threshold chosen to fire, or chosen not to.

CADENCE: WEEKLY, and the reasoning is asymmetric rather than balanced. Nothing
we hold will be ANALYSABLE before roughly week 6 of the season — the power work
put the useful unit at the week and the useful count in the dozens of clusters.
But the fastest failure mode is not "the data got interesting", it is "the daily
capture died", and that needs catching in days. A monthly pass would let three
weeks of a dead daily job go by. So: weekly, because of the failure mode, not
because of the analysis.

Run: python draft/backtest/standing_check.py [--verbose]
Exit 0 always — this is a reporter, not a gate. GitHub escalates on the marker.
"""
from __future__ import annotations

import json
import pathlib
import sys
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent

# ── THE THRESHOLDS, DECLARED ────────────────────────────────────────────────
# Each is the point at which the row becomes WORTH LOOKING AT, never the point
# at which it becomes interesting. "Measurable" and "a finding" are different
# events and only the first one is knowable in advance.
T = {
    # The capture runs daily. Two missed runs is a pattern, not a blip.
    "market_stale_days": 3,
    # Signal C needs pairs. 30 events with two observations is the first point
    # at which "does the model-market gap have structure" is askable at all —
    # and it is askable, not answerable: 30 is a look, not a test.
    "market_movement_events": 30,
    # The projection archive: the week is the independent unit, so this counts
    # WEEKS WITH REALIZED SCORES, not snapshots. Six clusters is where a
    # per-position bias stops being anecdote. Still thin; still worth a look.
    "proj_weeks_realized": 6,
    # Any series that has not grown in this many days has probably stopped.
    "series_stale_days": 10,
    # A ledger kind becomes gradeable at this many RESOLVED entries. Below it,
    # a Brier score is a number with no interval worth printing.
    "ledger_resolved": 20,
    # A component row escalates when its own measured effect exceeds its own
    # detectable-effect floor — i.e. when the design could have seen it AND did.
    # No fixed n: the floor already carries the sample size.
    "component_needs_mde": True,
}


# ── KNOWN BLINDNESS, PARKED WITH A DEADLINE ─────────────────────────────────
#
# Two archives are unreadable today for reasons already understood, and left
# escalating they would make this job red on its first Monday — which is the
# red-by-design failure that gets a check muted and then ignored. But an
# exception list with no expiry is just a mute with extra steps.
#
# So each parked row carries a DATE. Before it, the row reports `quiet (parked)`
# and says what would fix it. On that date it starts escalating again, whether
# or not anybody remembers. The deadline is the trigger the parking would
# otherwise lack — the same defect this whole file exists to correct.
PARKED = {
    "pred_ledger": ("2026-09-01",
                    "the September 1 instrumentation deadline — if the ledger is "
                    "still unobservable then, that is exactly when it matters"),
    "sleeper_trending": ("2026-08-20",
                         "the capture workflow lands today; one week for the first "
                         "snapshot to appear is generous"),
}


def _apply_parking(row):
    """A parked BLIND row goes quiet UNTIL ITS DATE, then escalates on its own."""
    if row["state"] != "BLIND":
        return row
    park = PARKED.get(row["archive"])
    if not park:
        return row
    until, why = park
    if _date_today() < until:
        row["state"] = "quiet"
        row["detail"] = f"PARKED until {until} ({why}). Blind because: {row['detail']}"
    else:
        row["detail"] = (f"PARKED until {until} AND THAT DATE HAS PASSED — {why}. "
                         f"Still blind because: {row['detail']}")
    return row


def _date_today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _age_days(stamp: str | None) -> float | None:
    if not stamp:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d"):
        try:
            t = datetime.strptime(stamp, fmt).replace(tzinfo=timezone.utc)
            return (datetime.now(timezone.utc) - t).total_seconds() / 86400.0
        except ValueError:
            continue
    return None


def _row(name, state, detail, n=None):
    return {"archive": name, "state": state, "detail": detail, "n": n}


# ── THE ARCHIVES ────────────────────────────────────────────────────────────

def check_market_snapshots():
    """Daily odds capture. Two questions: is it alive, and is Signal C askable."""
    health = ROOT / "draft" / "market_snapshots" / "capture_health.json"
    if not health.exists():
        return _row("market_snapshots", "BLIND",
                    "no capture_health.json — cannot tell a dead job from an absent one")
    try:
        h = json.loads(health.read_text())
    except (ValueError, OSError) as e:
        return _row("market_snapshots", "BLIND", f"health unreadable: {type(e).__name__}")

    age = _age_days(h.get("last_success_at"))
    if age is None:
        return _row("market_snapshots", "ESCALATE", "no successful capture has ever completed")
    if age > T["market_stale_days"]:
        return _row("market_snapshots", "ESCALATE",
                    f"last successful capture {age:.1f}d ago (bar {T['market_stale_days']}d) — "
                    "the daily job has stopped and the window is unrecoverable")

    # Signal C's readiness. Read from the snapshots themselves rather than from
    # a counter somebody has to remember to update.
    snaps = sorted((ROOT / "draft" / "market_snapshots").glob("*T*Z.json"))
    seen: dict[str, int] = {}
    for p in snaps:
        try:
            d = json.loads(p.read_text())
        except (ValueError, OSError):
            continue
        for ev in (d.get("events") or []):
            eid = str(ev.get("event_id") or ev.get("id") or "")
            if eid:
                seen[eid] = seen.get(eid, 0) + 1
    paired = sum(1 for v in seen.values() if v >= 2)
    if paired >= T["market_movement_events"]:
        return _row("market_snapshots", "ESCALATE",
                    f"{paired} events now carry two or more observations "
                    f"(bar {T['market_movement_events']}) — Signal C is askable for the "
                    "first time: does the model-market gap have structure or is it noise",
                    n=paired)
    return _row("market_snapshots", "quiet",
                f"{len(snaps)} snapshots, {paired}/{len(seen)} events paired, "
                f"last capture {age:.1f}d ago", n=paired)


def check_signal_b():
    """Signal B is BUILT AND UNREAD, and its model half has no source.

    Stated as a standing row rather than as a task, because the thing that makes
    it computable is not work anybody has scheduled — it is an in-season model of
    NFL team points, which does not exist. The check reports the blocker every
    week so it cannot quietly become a thing we meant to do.
    """
    mod = ROOT / "draft" / "backtest" / "market_environment.py"
    if not mod.exists():
        return _row("signal_b", "BLIND", "market_environment.py is gone")
    # The market half is captured. The model half needs MODEL TEAM POINTS — our
    # projection of an NFL team's REAL points, which the board does not produce
    # (it produces fantasy points per player, which is a different quantity).
    return _row("signal_b", "quiet",
                "market half captured; model half has no source (needs projected NFL "
                "TEAM points, not fantasy points). Not computable — reported weekly "
                "so it cannot become an intention with no trigger")


# Every dated series in this project spells its date differently. The first
# version of check_series hardcoded "date", found nothing in
# external_adp_series (which uses `observed_at`), computed a newest date of ""
# and reported the row QUIET — a staleness check that could never fire, inside
# the file whose entire purpose is catching checks that can never fire. Caught
# on the first run. The fix is not a longer list of keys; it is that a series
# whose date this process cannot find reports BLIND.
DATE_KEYS = ("date", "observed_at", "captured_at", "as_of")


def check_series(name, path):
    """Any append-only dated series: has it stopped growing."""
    p = ROOT / path
    if not p.exists():
        return _row(name, "BLIND", f"{path} absent — cannot tell 'not started' from 'lost'")
    try:
        d = json.loads(p.read_text())
    except (ValueError, OSError) as e:
        return _row(name, "BLIND", f"unreadable: {type(e).__name__}")
    series = d.get("series") if isinstance(d, dict) else d
    if not series:
        return _row(name, "quiet", "empty — nothing captured yet", n=0)
    key = next((k for k in DATE_KEYS if any(s.get(k) for s in series)), None)
    if key is None:
        return _row(name, "BLIND",
                    f"{len(series)} entries but no recognised date field "
                    f"(tried {', '.join(DATE_KEYS)}) — staleness is UNCHECKABLE here, "
                    "and a series I cannot date is one I cannot tell is dead",
                    n=len(series))
    last = max((s.get(key) or "") for s in series)
    age = _age_days(last)
    if age is not None and age > T["series_stale_days"]:
        return _row(name, "ESCALATE",
                    f"{len(series)} entries, newest {last} ({age:.0f}d old, bar "
                    f"{T['series_stale_days']}d) — this series has stopped updating",
                    n=len(series))
    return _row(name, "quiet", f"{len(series)} entries, newest {last}", n=len(series))


def check_proj_archive():
    """The weekly projection snapshot. The unit is the WEEK, not the snapshot."""
    p = ROOT / "draft" / "data" / "proj_series.json"
    if not p.exists():
        return _row("proj_archive", "BLIND", "proj_series.json absent")
    try:
        d = json.loads(p.read_text())
    except (ValueError, OSError) as e:
        return _row("proj_archive", "BLIND", f"unreadable: {type(e).__name__}")
    series = d.get("series") or []
    weeks = sorted({s.get("week") for s in series if s.get("week") is not None})
    if not weeks:
        return _row("proj_archive", "quiet",
                    f"{len(series)} preseason snapshots, 0 in-season weeks — "
                    "the weekly cron skips cleanly until the season opens", n=0)
    if len(weeks) >= T["proj_weeks_realized"]:
        return _row("proj_archive", "ESCALATE",
                    f"{len(weeks)} weeks archived (bar {T['proj_weeks_realized']}) — "
                    "per-position projection bias is now checkable at the week-cluster "
                    "level", n=len(weeks))
    return _row("proj_archive", "quiet",
                f"{len(weeks)} in-season weeks archived (need "
                f"{T['proj_weeks_realized']})", n=len(weeks))


def check_pred_ledger():
    """The prediction ledger lives in a Netlify blob store, not on disk.

    SO THIS PROCESS CANNOT READ IT, and says so rather than reporting the silence
    of a store it never opened as 'nothing accumulating'. That distinction is the
    entire reason BLIND exists as a state.
    """
    return _row("pred_ledger", "BLIND",
                "stored in Netlify blobs; a repo-side pass cannot read it. To make this "
                "row real, grade-cron must write a small public counts file "
                "(kind -> {emitted, resolved}) that this check can open. Until then the "
                f"ledger's accumulation is UNOBSERVED — bar would be "
                f"{T['ledger_resolved']} resolved entries in a kind.")


def check_calibration_drift():
    """The survival model's known 15-57% over-prediction, watched rather than remembered.

    IT HAS BEEN KNOWN FOR WEEKS AND NOTHING WATCHED IT. The figure lives in a test
    assertion, so it fires only when somebody runs the suite and only says it is
    still true — nothing notices if it gets WORSE, and nothing proposes a
    correction when enough graded observations exist to support one.

    The detector (`src/calibration_drift.js`) PROPOSES and never applies, for a
    sharper reason than the graduation gate's: a survival model corrected against
    its own residuals is fitting itself and can no longer be wrong.
    """
    p = ROOT / "draft" / "data" / "calibration_readings.json"
    if not p.exists():
        return _row("calibration_drift", "quiet",
                    "no graded survival readings yet — the detector exists "
                    "(src/calibration_drift.js) and has nothing to read. The known "
                    "bias is 15-57% over-prediction of departures, recorded in "
                    "draft/tests/survival_honesty.test.js", n=0)
    try:
        d = json.loads(p.read_text())
    except (ValueError, OSError) as e:
        return _row("calibration_drift", "BLIND", f"unreadable: {type(e).__name__}")
    rows = d.get("readings") or []
    drifted = [r for r in rows if r.get("status", "").startswith("drifted")]
    if drifted:
        names = ", ".join(str(r.get("component")) for r in drifted[:3])
        return _row("calibration_drift", "ESCALATE",
                    f"{len(drifted)} calibration(s) drifted beyond their own floor: "
                    f"{names} — a RE-CALIBRATION PROPOSAL is waiting for review, and "
                    "nothing has applied it", n=len(drifted))
    return _row("calibration_drift", "quiet",
                f"{len(rows)} reading(s), none beyond its floor", n=len(rows))


def check_components():
    """The component-grading surface. Escalates on MEASURABILITY, not interest."""
    p = ROOT / "draft" / "data" / "component_grades.json"
    if not p.exists():
        return _row("components", "quiet",
                    "no grades written yet — the rail exists (src/component_grade.js), "
                    "nothing calls it until weekly realized data lands", n=0)
    try:
        rows = json.loads(p.read_text())
    except (ValueError, OSError) as e:
        return _row("components", "BLIND", f"unreadable: {type(e).__name__}")
    rows = rows.get("components") if isinstance(rows, dict) else rows
    crossed = [r for r in (rows or [])
               if r.get("verdict") in ("earning", "hurting")]
    if crossed:
        names = ", ".join(str(r.get("name")) for r in crossed[:4])
        return _row("components", "ESCALATE",
                    f"{len(crossed)} component(s) now measurable above their own "
                    f"detectable-effect floor: {names}", n=len(crossed))
    thin = sum(1 for r in (rows or []) if r.get("verdict") == "too_thin")
    return _row("components", "quiet",
                f"{len(rows or [])} graded, {thin} still too thin, none above its floor",
                n=len(rows or []))


CHECKS = [
    check_market_snapshots,
    check_signal_b,
    lambda: check_series("adp_series", "draft/data/adp_series.json"),
    lambda: check_series("external_adp_series", "draft/data/external_adp_series.json"),
    lambda: check_series("sleeper_trending", "draft/data/sleeper_trending.json"),
    check_proj_archive,
    check_pred_ledger,
    check_calibration_drift,
    check_components,
]


def run():
    rows = []
    for c in CHECKS:
        try:
            rows.append(_apply_parking(c()))
        except Exception as e:                       # noqa: BLE001
            # A CHECK THAT THREW IS BLIND, NEVER QUIET. An exception swallowed
            # into silence is how this whole file becomes decoration. Parking
            # is deliberately NOT applied here: a parked archive is one we
            # understand, and a check that crashed is not.
            rows.append(_row(getattr(c, "__name__", "check"), "BLIND",
                             f"the check itself failed: {type(e).__name__}: {e}"))
    return rows


def render(rows, verbose=False):
    hot = [r for r in rows if r["state"] != "quiet"]
    out = []
    if not hot:
        out.append(f"STANDING CHECK: nothing has crossed a threshold. "
                   f"({len(rows)} archives looked at.)")
    else:
        out.append(f"STANDING CHECK: {len(hot)} of {len(rows)} archives want attention.")
        for r in hot:
            out.append(f"  {r['state']:<9} {r['archive']:<22} {r['detail']}")
    if verbose:
        out.append("")
        for r in rows:
            out.append(f"  {r['state']:<9} {r['archive']:<22} {r['detail']}")
    return "\n".join(out)


if __name__ == "__main__":
    verbose = "--verbose" in sys.argv
    rows = run()
    print(render(rows, verbose))
    hot = [r for r in rows if r["state"] != "quiet"]
    if hot:
        # The marker CI greps for. Silence otherwise, deliberately.
        print("::standing-check-escalate::" + json.dumps(hot))
    sys.exit(0)
