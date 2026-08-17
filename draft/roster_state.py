# TERRITORY: A
"""WEEKLY ROSTER-STATE SNAPSHOT — the capture that closes today's worst refusal.

Cory, 2026-08-17, after the variance-modifier fit came back unmeasurable:
"What other massive hole like that do we have in our data?? That's ridiculous."

THE REFUSAL THIS EXISTS TO END. `VAR_BACKUP` and `VAR_INJURED` could not be
fitted at all — not "measured and found small", not measurable. Depth charts and
injury designations in this repo are LIVE SLEEPER STATE, 2026 only, so a
2021-2025 fit has nothing to fit on. `opportunity_inheritance` hit the identical
wall from the other direction and had to abandon an arm of Cory's own question.

Nothing recovers those seasons. What is recoverable is every season from now on,
and only if the snapshot starts before the state changes. Roster state is the
purest example of a fact that expires: `depth_chart_order` describes THIS
Tuesday, and next Tuesday's value overwrites it with no record that the first
one existed.

WHY WEEKLY, AND WHY THAT IS THE RIGHT CADENCE. The signal these fields carry is
CHANGE — a player moving from WR3 to WR1, a Questionable becoming Out. A season
snapshot would record the end state and lose every transition, which is the part
that predicts anything. Daily would cost 17x the rows to resolve a status that
mostly moves on the injury-report cycle. Weekly matches how the underlying
facts actually update.

WHAT IT IS NOT. This is not a projection and never gets scored. It is the
CONTEXT that makes a projection interpretable a year later — the difference
between "we projected 415 and he scored 380" and "we projected 415 while he was
QB2 carrying a Questionable tag." The second is a finding; the first is trivia.
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
STORE = HERE / "data" / "roster_state_series.json"

#: Deliberately the SAME tuple proj_series freezes, so the two captures cannot
#: drift into two vocabularies for one idea. If a field is worth freezing beside
#: a projection it is worth freezing weekly, and vice versa.
from proj_series import SITUATION_FIELDS  # noqa: E402

MAX_SNAPS = 400          # ~7 seasons of weekly capture


def snapshot(players, date, week=None, fields=SITUATION_FIELDS) -> dict:
    """One week's roster state. ABSENT-NOT-NULL, same rule as everywhere else:
    a field the provider did not serve is omitted, so "Sleeper reported no
    designation" (healthy) never becomes indistinguishable from "our fetch did
    not carry the field" (unknown)."""
    rows = {}
    for p in players or []:
        pid = str(p.get("player_id") or "")
        if not pid:
            continue
        row = {f: p.get(f) for f in fields if p.get(f) not in (None, "")}
        if row:
            rows[pid] = row
    snap = {"date": date, "n_players": len(rows), "state": rows}
    if week is not None:
        snap["week"] = int(week)
    return snap


def append(series, snap, max_snaps=MAX_SNAPS) -> list:
    """Append or REPLACE by (date, week). A same-day re-run overwrites rather
    than doubling — the rule every append-only store here follows."""
    kept = [s for s in (series or [])
            if not (s.get("date") == snap.get("date")
                    and s.get("week") == snap.get("week"))]
    kept.append(snap)
    kept.sort(key=lambda s: (s["date"], s.get("week") if s.get("week") is not None else -1))
    return kept[-max_snaps:]


def changes(series, field="depth_chart_order") -> dict:
    """{player_id: [(date, old, new), ...]} — the transitions, which are the
    whole reason this is weekly rather than seasonal.

    A player who never moves produces no entry. That is the point: the signal is
    in who CHANGED, and a store that only holds levels makes you diff it by hand
    every time you want to ask the obvious question.
    """
    out: dict[str, list] = {}
    prev: dict[str, object] = {}
    for snap in series or []:
        for pid, row in (snap.get("state") or {}).items():
            now = row.get(field)
            if pid in prev and prev[pid] != now:
                out.setdefault(pid, []).append((snap.get("date"), prev[pid], now))
            prev[pid] = now
    return out


def load(path: Path | None = None) -> list:
    p = path or STORE
    if not p.exists():
        return []
    try:
        return json.loads(p.read_text()).get("series") or []
    except (ValueError, OSError):
        return []


def save(series, path: Path | None = None) -> Path:
    p = path or STORE
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps({
        "_territory": "TERRITORY: A",
        "_note": ("Weekly roster state (depth chart, injury designation, team, "
                  "experience, ADP). NOT a projection and never scored — this is "
                  "the CONTEXT that makes a projection interpretable a year "
                  "later. Exists because VAR_BACKUP and VAR_INJURED were "
                  "unmeasurable on 2021-2025 for want of exactly this, and "
                  "nothing recovers a past season's roster state."),
        "fields": list(SITUATION_FIELDS),
        "series": series,
    }, indent=1))
    return p


def capture(players, date, week=None, path: Path | None = None) -> dict:
    """The one call a caller needs: snapshot, append, persist."""
    series = append(load(path), snapshot(players, date, week))
    save(series, path)
    return {"date": date, "week": week, "snapshots": len(series),
            "players": len(series[-1]["state"])}
