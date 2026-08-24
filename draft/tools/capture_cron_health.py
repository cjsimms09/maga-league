# TERRITORY: C
"""CAPTURE CRON HEALTH — pull-list refill #3 (page-turn dispatch), item 6.
*"The in-season captures you stood up get a named weekly check (which
jobs ran, which paths committed) — register 155's class must never need a
human to notice again."*

Register 155's actual shape, stated precisely so this checks the right
thing: a scheduled job ran green every night for days, computed a real
snapshot, and never committed it — the workflow's own commit step never
named the output path. A green Actions run and a fresh commit are TWO
DIFFERENT FACTS, and only the second one is checked here (this repo has no
simple way to query Actions run history from a script; the timestamp
INSIDE each committed store is the fact that actually matters — a store
that has not moved in longer than its own cadence allows is exactly what
register 155 looked like from outside, whether the job ran and threw the
result away or never ran at all).

SCOPE: every C-owned SCHEDULED (not dispatch-only) data capture, read from
the manifest below. Deliberately excludes `mutation-manifest.yml` (test
integrity, not a data capture), `bdl-schedule-capture.yml` (TERRITORY: C
but genuinely dispatch-only -- a schedule capture, not a weekly-changing
one), and `kalshi-capture.yml` (TERRITORY: A, not this lane's to watch --
⚠️ CORRECTED 2026-08-24, this line used to also call it "dispatch-only,
no schedule: trigger," which is WRONG: it runs daily, `cron: '0 11 * * *'`,
checked directly against the workflow file while auditing the weekly-arm
data-readiness table. The real exclusion reason was always ownership, not
cadence -- verified directly against every workflow file before writing
this list, not assumed).

STALENESS RULE: a store is STALE if its own `captured_at`/`scraped_at`
field (never a filesystem mtime, which reflects the last git checkout, not
the real capture) is older than its cadence plus a grace window (2x the
cadence, so a single missed run does not false-positive the day after).

Run: python3 draft/tools/capture_cron_health.py
"""
from __future__ import annotations

import glob
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent          # draft/tools
DRAFT = HERE.parent
ROOT = DRAFT.parent

def _flat_field(field: str):
    """Extractor factory: doc[field] is a plain ISO timestamp string."""
    return lambda doc: doc.get(field)


def _latest_series_entry(list_field: str, date_field: str):
    """Extractor factory for the external_adp_series.json shape -- verified
    against the real committed file before writing this (rule 3f): no
    top-level timestamp exists; freshness lives in the LAST entry of a
    list of dated series snapshots (`series: [{..., observed_at: "..."}]`
    real dates, not a full ISO datetime)."""
    def extract(doc):
        rows = doc.get(list_field) or []
        return rows[-1].get(date_field) if rows else None
    return extract


def _no_timestamp_control_only(doc):
    """For a store with no timestamp field at all -- freshness is
    approximated by whether its own Rule 3e control is present and
    passing, the closest signal such a store carries about itself."""
    return None  # handled specially in check_store via CONTROL_ONLY marker


#: {name: {workflow, glob, extract_timestamp, cadence_days}} -- verified
#: against every scheduled TERRITORY: C workflow AND the real committed
#: shape of every store in .github/workflows/ before writing this manifest
#: (rule 3f), not assumed complete or assumed uniform in shape.
MANIFEST = {
    "external_adp_series": {
        "workflow": "external-adp-capture.yml",
        "glob": "draft/data/external_adp_series.json",
        "extract_timestamp": _latest_series_entry("series", "observed_at"),
        "cadence_days": 1,
    },
    "fp_expert_ranks_weekly": {
        "workflow": "fp-expert-ranks-weekly-capture.yml",
        "glob": "draft/backtest/fp_expert_ranks_weekly_*.json",
        "extract_timestamp": _flat_field("scraped_at"),
        "cadence_days": 7,
        # correctly absent until week 1 (the workflow's own nfl_state()
        # gate exits clean during preseason, by design) -- MISSING must
        # not fail the check for a store that has never been able to exist
        # yet, or this would false-positive every single day until 09-10.
        "preseason_gated": True,
    },
    "player_bio_capital": {
        "workflow": "player-bio-capital-refresh.yml",
        "glob": "draft/backtest/player_bio_capital.json",
        "extract_timestamp": _no_timestamp_control_only,
        "cadence_days": 7,
    },
    "injury_designations": {
        "workflow": "injury-designations-refresh.yml",
        "glob": "draft/backtest/injury_designations.json",
        "extract_timestamp": _no_timestamp_control_only,
        "cadence_days": 7,
    },
    "practice_participation": {
        "workflow": "practice-participation-refresh.yml",
        "glob": "draft/backtest/practice_participation.json",
        "extract_timestamp": _no_timestamp_control_only,
        "cadence_days": 7,
    },
    "weekly_projection_archive": {
        "workflow": "weekly-projection-archive.yml",
        "glob": "draft/data/weekly_projection_archive/weekly_projection_archive_*.json",
        "extract_timestamp": _flat_field("captured_at"),
        "cadence_days": 7,
    },
    "keeper_futures": {
        "workflow": "keeper-futures-refresh.yml",
        "glob": "draft/data/keeper_futures_2026.json",
        "extract_timestamp": _no_timestamp_control_only,
        "cadence_days": 7,
    },
    # ── THE IN-SEASON LEARNING CHAIN (added by A, 2026-08-24) ───────────────
    # This manifest's own header says it was verified against every scheduled
    # TERRITORY: C workflow, which it was — but the stores that feed the
    # GRADERS are not C's, so register 155's class ("must never need a human to
    # notice again") was guarded for the captures and not for the learning
    # loop. Found the expensive way: league_history.json's export step was
    # gated on a workflow_dispatch input and therefore never fired on any
    # schedule, and its `built_at` sat 16 days stale with nothing watching.
    "league_history": {
        "workflow": "draft-data.yml",
        "glob": "draft/data/league_history.json",
        "extract_timestamp": _flat_field("built_at"),
        # Refreshed by the Tuesday 11:00 UTC cron only — deliberately weekly,
        # matching the cadence the five decision graders consume it at.
        "cadence_days": 7,
    },
    "weekly_own_grades": {
        "workflow": "own-weekly-grade.yml",
        "glob": "draft/data/weekly_own/grades_*.json",
        "extract_timestamp": _flat_field("graded_at"),
        "cadence_days": 7,
        # Correctly absent until week 1 is played and graded (first grade
        # ~09-15). Same reasoning as fp_expert_ranks_weekly: MISSING must not
        # fail the check for a store that has never been able to exist yet, or
        # this false-positives every day of the preseason.
        "preseason_gated": True,
    },
}

GRACE_MULTIPLIER = 2  # a single missed run must not false-positive


def is_healthy(status: str) -> bool:
    """A status counts as healthy if it starts with OK or PENDING (the
    latter = correctly not-yet-existing, e.g. a preseason-gated store) --
    anything else (STALE, MISSING, UNREADABLE, NO_TIMESTAMP,
    CONTROL_FAILED) is a real problem."""
    return status.startswith("OK") or status.startswith("PENDING")


def newest_matching_file(pattern: str) -> Path | None:
    matches = sorted(ROOT.glob(pattern), key=lambda p: p.stat().st_mtime)
    return matches[-1] if matches else None


def parse_timestamp(s: str) -> datetime | None:
    """Handles both a full ISO datetime and a date-only string
    (external_adp_series.json's `observed_at` is date-only, "2026-08-11" --
    verified against the real committed file, not assumed). A naive result
    is stamped UTC so it can be compared against an aware `now`."""
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def check_store(name: str, spec: dict, now: datetime) -> dict:
    path = newest_matching_file(spec["glob"])
    if path is None:
        if spec.get("preseason_gated"):
            return {"name": name, "workflow": spec["workflow"],
                   "status": "PENDING (preseason-gated)",
                   "detail": "correctly absent until week 1 — the workflow's "
                             "own season-state gate has not opened yet"}
        return {"name": name, "workflow": spec["workflow"], "status": "MISSING",
               "detail": f"no file matches {spec['glob']!r} — the capture "
                         "has never landed, or its output path changed and "
                         "this manifest was not updated with it"}

    try:
        doc = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError) as e:
        return {"name": name, "workflow": spec["workflow"], "status": "UNREADABLE",
               "path": str(path.relative_to(ROOT)),
               "detail": f"{type(e).__name__}: {e}"}

    raw_ts = spec["extract_timestamp"](doc)
    if raw_ts is None and spec["extract_timestamp"] is _no_timestamp_control_only:
        # no timestamp field on this store -- freshness is approximated by
        # whether the store's own Rule 3e control is present and passing,
        # which is the closest signal this store carries about itself.
        control = doc.get("rule_3e_control") or {}
        ok = bool(control.get("ok"))
        return {"name": name, "workflow": spec["workflow"],
                "status": "OK (no timestamp field)" if ok else "CONTROL_FAILED",
                "path": str(path.relative_to(ROOT))}

    ts = parse_timestamp(raw_ts)
    if ts is None:
        return {"name": name, "workflow": spec["workflow"], "status": "NO_TIMESTAMP",
               "path": str(path.relative_to(ROOT)),
               "detail": f"extract_timestamp returned {raw_ts!r}, unparseable"}

    age_days = (now - ts).total_seconds() / 86400
    floor_days = spec["cadence_days"] * GRACE_MULTIPLIER
    status = "OK" if age_days <= floor_days else "STALE"
    return {"name": name, "workflow": spec["workflow"], "status": status,
           "path": str(path.relative_to(ROOT)), "age_days": round(age_days, 1),
           "cadence_days": spec["cadence_days"], "stale_after_days": floor_days}


#: Cory's in-season queue item 5: "the Bovada Sunday snapshot is the
#: [closing-line] benchmark's spine... add its expected-cadence check ...
#: so a missed Sunday pages the register rather than being noticed in
#: November." This does NOT fit the single-timestamp MANIFEST pattern
#: above -- bovada_lines_capture.py is a TWICE-weekly append-only JSONL
#: (Thu opening + Sun closing), and "the file moved recently" cannot
#: distinguish "both ran" from "Thursday ran, Sunday silently didn't" --
#: exactly the completeness gap named. Checked separately, in the shape
#: this store actually has.
BOVADA_PATH = "draft/data/bovada_lines_2026.jsonl"
BOVADA_WORKFLOW = "bovada-lines-capture.yml"
#: A rolling window a little over a week, so a check run any day still
#: sees the most recent Thu+Sun pair even a few days after Sunday.
BOVADA_WINDOW_DAYS = 10


def check_bovada_cadence(path_str: str, now: datetime) -> dict:
    """Real completeness, not just recency: within the trailing window,
    did BOTH a Thursday-ish and a Sunday-ish snapshot land? Pure given a
    pre-read set of timestamps -- see check_bovada_cadence_file for the
    real-file wrapper."""
    path = ROOT / path_str
    if not path.exists():
        return {"name": "bovada_closing_line_cadence", "workflow": BOVADA_WORKFLOW,
               "status": "MISSING", "detail": f"{path_str} does not exist"}

    timestamps = set()
    try:
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            ts = parse_timestamp(row.get("ts"))
            if ts is not None:
                timestamps.add(ts)
    except OSError as e:
        return {"name": "bovada_closing_line_cadence", "workflow": BOVADA_WORKFLOW,
               "status": "UNREADABLE", "detail": f"{type(e).__name__}: {e}"}

    cutoff = now.timestamp() - BOVADA_WINDOW_DAYS * 86400
    recent = [t for t in timestamps if t.timestamp() >= cutoff]
    weekdays_seen = {t.weekday() for t in recent}  # Mon=0 ... Sun=6
    has_thursday = 3 in weekdays_seen
    has_sunday = 6 in weekdays_seen

    if not recent:
        return {"name": "bovada_closing_line_cadence", "workflow": BOVADA_WORKFLOW,
               "status": "STALE",
               "detail": f"no snapshot at all in the last {BOVADA_WINDOW_DAYS} days"}

    # BOOTSTRAP GRACE, real incident this exists to prevent (checked, not
    # theoretical): the capture's OWN earliest timestamp can be younger
    # than BOVADA_WINDOW_DAYS -- a store that has not existed long enough
    # to have seen one real Thursday+Sunday cycle is not "missing" one,
    # the same "correctly not-yet-due" shape fp_expert_ranks_weekly's own
    # preseason_gated entry already carries in this file.
    earliest = min(timestamps)
    age_of_capture_days = (now - earliest).total_seconds() / 86400
    if age_of_capture_days < BOVADA_WINDOW_DAYS and not (has_thursday and has_sunday):
        return {"name": "bovada_closing_line_cadence", "workflow": BOVADA_WORKFLOW,
               "status": "PENDING (bootstrap grace)",
               "detail": f"capture is only {age_of_capture_days:.1f}d old, "
                         f"younger than the {BOVADA_WINDOW_DAYS}d window -- "
                         "has not had a full Thu+Sun cycle yet, correctly "
                         "not flagged as a gap"}

    if has_thursday and has_sunday:
        return {"name": "bovada_closing_line_cadence", "workflow": BOVADA_WORKFLOW,
               "status": "OK",
               "detail": f"both Thursday and Sunday snapshots present in the "
                         f"last {BOVADA_WINDOW_DAYS} days"}
    missing = ("Sunday" if has_thursday else "Thursday" if has_sunday
              else "Thursday and Sunday")
    return {"name": "bovada_closing_line_cadence", "workflow": BOVADA_WORKFLOW,
           "status": "STALE",
           "detail": f"missing {missing} in the last {BOVADA_WINDOW_DAYS} days "
                     f"— the closing-line benchmark has a real gap"}


def run(now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    results = [check_store(name, spec, now) for name, spec in MANIFEST.items()]
    results.append(check_bovada_cadence(BOVADA_PATH, now))
    stale = [r for r in results if not is_healthy(r["status"])]
    return {"_territory": "TERRITORY: C — draft/tools/capture_cron_health.py",
           "_why": ("Register 155's class: a scheduled capture can run green "
                    "and never commit its output. This checks the fact that "
                    "actually matters -- whether the committed store's own "
                    "timestamp has moved within its cadence -- not whether "
                    "the Actions run was green."),
           "checked_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
           "results": results, "n_stale": len(stale),
           "stale": stale, "ok": len(stale) == 0}


def main() -> int:
    doc = run()
    print("=" * 70)
    print("CAPTURE CRON HEALTH")
    print("=" * 70)
    for r in doc["results"]:
        extra = f" ({r['age_days']}d old, stale after {r['stale_after_days']}d)" \
            if "age_days" in r else ""
        print(f"  [{r['status']:^20}] {r['name']} ({r['workflow']}){extra}")
    if not doc["ok"]:
        print(f"\n{doc['n_stale']} capture(s) need attention:")
        for r in doc["stale"]:
            print(f"  - {r['name']}: {r.get('detail', r['status'])}")
        return 1
    print("\nall captures within their cadence.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
