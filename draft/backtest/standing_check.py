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

import hashlib
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
    # RETAINED AS THE DEFAULT FOR A SERIES WITH NO DECLARED CADENCE. It is the
    # wrong bar for every series we actually hold — see SERIES_WATCH below.
    "series_stale_days": 10,
    # A ledger kind becomes gradeable at this many RESOLVED entries. Below it,
    # a Brier score is a number with no interval worth printing.
    "ledger_resolved": 20,
    # A component row escalates when its own measured effect exceeds its own
    # detectable-effect floor — i.e. when the design could have seen it AND did.
    # No fixed n: the floor already carries the sample size.
    "component_needs_mde": True,
}


# ── A BAR IS ONLY A MONITOR IF IT CAN FIRE INSIDE THE WINDOW IT PROTECTS ────
#
# C measured the defect and it is structural, not a tuning miss: the series
# staleness bar was 10 days and the examination was gated to Mondays. The only
# Monday between now and the 2026 draft is 08-17, on which the archive's age
# cannot exceed ~5 days. SO FOR EVERY DEATH DATE FROM TODAY ONWARD, THE MONITOR
# WATCHING THE DAILY ADP CAPTURE COULD NOT FIRE BEFORE THE DRAFT — during the
# one stretch where each lost day is permanently unrebuildable, because MFL
# serves no as-of-date board.
#
# That is the enforcement-table failure in live form: a check that exists, runs,
# reports clean, and is CONFIGURED SO THAT IT CANNOT DETECT THE FAILURE IT
# WATCHES FOR. Reporting "quiet" is the worst possible output for it, because
# "quiet" is indistinguishable from "healthy" and that is the whole point.
#
# THE INVARIANT, stated so a test can hold it rather than a reader:
#
#     bar_days + worst_case_examination_lag  <=  tolerable_loss_days
#
# Both levers are named because both were wrong. A short bar examined weekly is
# still a weekly monitor; a daily examination against a 10-day bar is still a
# 10-day monitor. `tolerable_loss_days` is a DECLARED editorial judgement about
# how much of an unrebuildable series we are willing to lose before somebody is
# told — not a derived quantity, and it belongs in the file with the other
# thresholds rather than in a workflow's cron.
#
# The bars below are NOT chosen from what the data currently shows. They are
# chosen from each series' capture cadence, on the same reasoning already used
# for `market_stale_days`: for a daily job, two missed runs is a pattern rather
# than a blip. test_standing_check.py asserts the invariant for every row.
LIVENESS_LAG_DAYS = 1        # the liveness pass runs daily (see standing-check.yml)
EXAMINATION_LAG_DAYS = 7     # the full examination is still Monday-gated

SERIES_WATCH = {
    # archive              path                                   bar  tolerable
    "adp_series":          ("draft/data/adp_series.json",          3,   5),
    "external_adp_series": ("draft/data/external_adp_series.json", 3,   5),
    "sleeper_trending":    ("draft/data/sleeper_trending.json",    3,   5),
}

# The rows whose failure mode is "the capture died". These are examined DAILY —
# they are the reason the cadence argument at the top of this file was written,
# and gating them behind the weekly analysis pass buried the fast failure inside
# the slow one. The rest stay weekly: nothing they watch changes in a day.
LIVENESS_ROWS = ("market_capture_alive", *SERIES_WATCH,
                 # ⚠️ DAILY, AND IT HAD TO BE — the invariant above applied to a
                 # window measured in HOURS rather than days.
                 #
                 # The full examination is Monday-gated. The Mondays around the
                 # draft are 08-17 and 08-24. The keeper lock is 08-20 and the
                 # draft is 08-22, SO A WEEKLY pre_draft_freeze ROW COULD NOT
                 # FIRE BETWEEN THE LOCK AND THE DRAFT — it would next speak two
                 # days after the thing it protects was already lost.
                 #
                 # That is bar_days + examination_lag > tolerable_loss_days with
                 # the numbers that actually matter, and it is the identical
                 # defect this file documents above for the ADP series. Adding
                 # the row weekly would have produced a check that runs, reports
                 # clean, and is configured so it cannot detect its own failure.
                 "pre_draft_freeze")


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
        return _row("market_snapshots", "quiet",
                    "no successful capture yet — reported by market_capture_alive")

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


def check_market_capture_alive():
    """IS THE DAILY ODDS CAPTURE ALIVE — and nothing else.

    Split out of check_market_snapshots, which answered two questions with one
    row: "has the job died" (hours to days, unrecoverable) and "is Signal C
    askable yet" (weeks, and still true tomorrow). A row that mixes a fast
    failure with a slow one can only be SCHEDULED for one of them, and the
    daily liveness pass inherited the analysis escalation — so it would have
    gone red every single day on a finding nobody needs to act on today, which
    is precisely how a monitor gets muted and then ignored.
    """
    health = ROOT / "draft" / "market_snapshots" / "capture_health.json"
    if not health.exists():
        return _row("market_capture_alive", "BLIND",
                    "no capture_health.json — cannot tell a dead job from an absent one")
    try:
        h = json.loads(health.read_text())
    except (ValueError, OSError) as e:
        return _row("market_capture_alive", "BLIND", f"health unreadable: {type(e).__name__}")
    age = _age_days(h.get("last_success_at"))
    if age is None:
        return _row("market_capture_alive", "ESCALATE",
                    "no successful capture has ever completed")
    if age > T["market_stale_days"]:
        return _row("market_capture_alive", "ESCALATE",
                    f"last successful capture {age:.1f}d ago (bar {T['market_stale_days']}d) — "
                    "the daily job has stopped and the window is unrecoverable")
    return _row("market_capture_alive", "quiet", f"last capture {age:.1f}d ago")


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


def check_series(name, path, bar_days=None):
    """Any append-only dated series: has it stopped growing."""
    bar = T["series_stale_days"] if bar_days is None else bar_days
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
    if age is not None and age > bar:
        return _row(name, "ESCALATE",
                    f"{len(series)} entries, newest {last} ({age:.0f}d old, bar "
                    f"{bar}d) — this series has stopped updating",
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


def check_pre_draft_freeze():
    """THE FREEZE IS THE ONE ARTIFACT WHERE THE CALENDAR, NOT A BUG, IS THE RISK.

    `freeze_pre_draft.verify()` existed and NOTHING CALLED IT — intention with no
    trigger, on the artifact whose entire value is that it was written once
    before the draft. Routed in by the steering layer on 2026-08-14 after they
    checked by hand: `grep -rn freeze_pre_draft .github/workflows scripts`
    returned nothing.

    THE EXPOSURE IS SPECIFIC AND IT IS NOT AN INTEGRITY FAILURE. The freeze is
    intact and self-consistent today. But draft-data.yml rebuilds the board every
    morning, so `source_artifact_sha256` stops matching tomorrow — and that is
    EXPECTED, not an error. A freeze is a snapshot of a past board; drift from
    the live board is what a snapshot IS. Alarming on drift would fire every day
    from tomorrow and be ignored by the 20th, which is the cry-wolf failure that
    gets banners ignored.

    WHAT IS ACTUALLY WRONG IS DRAFTING ON A PROVISIONAL FREEZE AFTER THE LOCK.
    The freeze says so in its own words: "the pre-lock run is a rehearsal.
    Re-take after the slate confirms." If nobody remembers, the season's grading
    baseline is taken against the wrong keeper state — and no later work
    reconstructs a decision-time record after the decision.

    THE TRIGGER IS DERIVED, NOT A DATE. `keeper_slate.keeper_lock_passed` is
    computed from Sleeper placements on the live board. No "20 August" literal
    appears here, so a lock that moves — or one that happens early — is still
    caught. A hardcoded date is a second definition of the lock and would
    disagree with the board on exactly the day it mattered.
    """
    freeze = ROOT / "draft" / "data" / "pre_draft_freeze_2026.json"
    board = ROOT / "public" / "draft_data.json"
    if not freeze.exists():
        return _row("pre_draft_freeze", "ESCALATE",
                    "NO FREEZE EXISTS. The pre-draft capture is irreversible — "
                    "after the draft there is nothing to take it from.")
    try:
        doc = json.loads(freeze.read_text())
    except (ValueError, OSError) as e:
        return _row("pre_draft_freeze", "BLIND", f"freeze unreadable: {type(e).__name__}")

    # 1. INTEGRITY. Recomputed, not trusted.
    want = doc.get("_sha256_of_payload")
    payload = {k: v for k, v in doc.items() if k != "_sha256_of_payload"}
    got = hashlib.sha256(json.dumps(payload, sort_keys=True,
                                    separators=(",", ":")).encode()).hexdigest()
    if want != got:
        return _row("pre_draft_freeze", "ESCALATE",
                    f"FREEZE ALTERED since it was written (stamped {str(want)[:12]}, "
                    f"actual {got[:12]}). Evidence preservation outranks everything "
                    "else here — do not overwrite it, work out what changed.")

    status = doc.get("status")
    # 2. HAS THE LOCK PASSED? Asked of the LIVE board, which is the only thing
    #    that knows. A missing board is BLIND, never "no".
    if not board.exists():
        return _row("pre_draft_freeze", "BLIND",
                    "freeze intact, but the live board is absent so the keeper "
                    "lock state cannot be read")
    try:
        slate = (json.loads(board.read_text()).get("keeper_slate") or {})
    except (ValueError, OSError) as e:
        return _row("pre_draft_freeze", "BLIND",
                    f"freeze intact, board unreadable: {type(e).__name__}")

    locked = bool(slate.get("keeper_lock_passed"))
    if locked and status != "CONFIRMED":
        return _row("pre_draft_freeze", "ESCALATE",
                    f"THE KEEPER LOCK HAS PASSED AND THE FREEZE IS STILL {status}. "
                    "It was built on PREDICTED opponent keepers. Re-take it now: "
                    "the diff between the two runs IS the keeper-scarcity evidence, "
                    "and it is unrecoverable once the draft starts.")

    # 3. DRIFT — REPORTED, NEVER ESCALATED. See the docstring.
    drift = ""
    try:
        live_sha = hashlib.sha256(board.read_bytes()).hexdigest()
        if live_sha != doc.get("source_artifact_sha256"):
            drift = ("; board has been rebuilt since (expected — daily job), so "
                     "the freeze no longer describes the live artifact")
    except OSError:
        pass
    return _row("pre_draft_freeze", "quiet",
                f"freeze intact and {status}; keeper lock not yet passed"
                f" ({slate.get('teams_designated')}/{slate.get('teams_expected')} "
                f"teams designated){drift}")


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


def check_coherence():
    """CROSS-TOOL COHERENCE — the analyzer's playoff odds vs the lineup tool's.

    THE FINDING THIS WATCHES. Measured 2026-08-12 across nine season-checkpoints:
    eight of nine diverge beyond the declared tolerance, worst 22pp of playoff
    probability and 1.82 expected wins. The exact identity (win probabilities
    across a week sum to the game count) holds in all 74 week-checks, so this is
    not arithmetic in either surface -- it is two different beliefs about the
    same games, and nothing compared them until now.

    WHY AN ENVELOPE RATHER THAN A HARD FAIL. The divergence is real and OPEN. A
    check that went red on day one and stayed red would be ignored inside a
    month, and the resolution is not a code change -- both surfaces now emit
    gradeable forecasts of the same quantity, so a season of Brier decides which
    is right. This escalates when the disagreement gets WORSE than what was
    measured, which is the thing that would mean something new is wrong.

    RECORDING AN ENVELOPE IS NOT BLESSING THE DIVERGENCE, and the artifact says
    so in its own `status` field.
    """
    p = ROOT / "draft" / "data" / "coherence.json"
    if not p.exists():
        return _row("coherence", "quiet",
                    "not measured yet — run `node draft/tools/coherence_run.js`", n=0)
    try:
        d = json.loads(p.read_text())
    except (ValueError, OSError) as e:
        return _row("coherence", "BLIND", f"unreadable: {type(e).__name__}")

    # The measured worst case on 2026-08-12, recorded so a WIDENING is visible.
    ENVELOPE_PROB, ENVELOPE_WINS = 0.25, 2.0
    wp = float(d.get("worst_d_playoff_prob") or 0.0)
    ww = float(d.get("worst_d_exp_wins") or 0.0)

    # THE IDENTITY IS NOT NEGOTIABLE. It is exact by construction, so a failure
    # there is a bug rather than a disagreement and escalates on its own.
    if not d.get("identity_holds_everywhere"):
        return _row("coherence", "ESCALATE",
                    "the win-probability identity FAILED — probabilities across a "
                    "week no longer sum to the number of games, which is exact by "
                    "construction and therefore a bug, not a model disagreement")
    if wp > ENVELOPE_PROB or ww > ENVELOPE_WINS:
        return _row("coherence", "ESCALATE",
                    f"the analyzer and the lineup tool now disagree by {wp*100:.0f}pp "
                    f"and {ww:.2f} wins, beyond the {ENVELOPE_PROB*100:.0f}pp / "
                    f"{ENVELOPE_WINS} recorded on 2026-08-12 — the divergence is "
                    "WIDENING")
    return _row("coherence", "quiet",
                f"worst divergence {wp*100:.0f}pp / {ww:.2f} wins, within the "
                f"recorded envelope. STILL AN OPEN DEFECT — the envelope watches "
                f"for widening, it does not accept the gap", n=int(d.get("checkpoints") or 0))


def _series_check(name):
    path, bar, _tolerable = SERIES_WATCH[name]
    return lambda: check_series(name, path, bar_days=bar)


CHECKS = [
    check_market_capture_alive,
    check_market_snapshots,
    check_signal_b,
    *[_series_check(n) for n in SERIES_WATCH],
    check_proj_archive,
    check_pred_ledger,
    check_calibration_drift,
    check_components,
    check_pre_draft_freeze,
    check_coherence,
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
    # --liveness: the DAILY pass. Only the rows whose failure mode is "the
    # capture died", which is the failure that has to be caught in days rather
    # than weeks. Everything else stays on the weekly examination, unchanged.
    # A row named in LIVENESS_ROWS that produced no result at all would make
    # this pass silently narrower than it claims, so that is an error, not a
    # smaller report — the same class of defect this flag exists to fix.
    if "--liveness" in sys.argv:
        by_name = {r["archive"]: r for r in rows}
        missing = [n for n in LIVENESS_ROWS if n not in by_name]
        if missing:
            print(f"::error::liveness rows produced no result: {missing} — the "
                  "daily pass is watching fewer archives than it claims to")
            sys.exit(1)
        rows = [by_name[n] for n in LIVENESS_ROWS]
    print(render(rows, verbose))
    hot = [r for r in rows if r["state"] != "quiet"]
    if hot:
        # The marker CI greps for. Silence otherwise, deliberately.
        print("::standing-check-escalate::" + json.dumps(hot))
    sys.exit(0)
