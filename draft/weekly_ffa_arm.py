#!/usr/bin/env python3
# TERRITORY: A
"""ffa4_weekly — four outside WEEKLY projection sources, scored under OUR
table, averaged, graded as a STUDY arm beside props_weekly_v1.

Register 478 (A, 2026-09-02). CBS and ESPN stopped serving season totals on
08-20 and serve WEEKLY numbers; FleaFlicker and NumberFire — which never
returned a season total — serve weekly numbers too. A `week=N` run of
`ffanalytics-probe.yml` writes `draft/data/ffanalytics_raw_projections_wN.csv`
(raw stat lines, every column the sources publish) beside
`ffanalytics_probe_wN.json` (season, week, scraped_at, per-source counts).
This reader turns that into {board pid: points} for one week.

THE SAME SHAPE AS weekly_props_arm.py, FOR THE SAME REASON. The sources
cover only the players they choose to project, never the whole board, so
this arm cannot promise the champion's full population and enters the grader
through the provider-study pathway: graded on its OWN population and on the
population shared with the champion, honestly labelled, never
auto-promoted. A player the sources do not cover is ABSENT, never zero.

PREREGISTERED CHOICES (P365), stated so nobody rediscovers them as bugs:
  * a player needs at least MIN_SOURCES of the four to carry a value — one
    site's number is that site's arm, not a blend;
  * the value is the plain mean of the sources' points under THIS league's
    44-key table (never a site's own points — they encode that site's rules);
  * the join is by normalised name + position, team as the disambiguator,
    against the SNAPSHOT's own names/positions — so the arm's population is
    a subset of the champion's and the shared-population grade is exact;
  * FantasyPros' weekly rows (a top-10 leaderboard) and FFToday (season
    totals only) are excluded by name, the same way multisource_projections
    excludes them for the seasonal blend;
  * a capture scraped AT OR AFTER the week's first kickoff is refused as a
    backdated forecast — the reader returns None and says why.
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
if str(HERE / "tools") not in sys.path:
    sys.path.insert(0, str(HERE / "tools"))

import multisource_projections as MS            # noqa: E402  STAT_MAP, norm_name, league_scoring
from scoring import score_stat_line             # noqa: E402
from weekly_own_projection import first_kickoff_utc  # noqa: E402

ARM_NAME = "ffa4_weekly"
#: the four sources that returned weekly rows on the 09-02 control
#: (register 478); FantasyPros (top-10 leaderboard) and FFToday (season
#: totals only) are excluded by name, as in the seasonal blend. ⚠️ CBS is
#: asked but answers a week=N request with SEASON totals (measured 09-02:
#: games=17, QB max 415) — the scale guard below drops it for the week, so
#: in practice this is a THREE-source weekly arm until CBS serves weekly.
WEEKLY_SOURCES = ("CBS", "ESPN", "FleaFlicker", "NumberFire")
MIN_SOURCES = 2
POSITIONS = ("QB", "RB", "WR", "TE")
#: a weekly QB projection median cannot sit above this; a source whose
#: joined QB rows do is serving season totals, whatever it was asked.
WEEKLY_QB_MEDIAN_MAX = 60.0
SCALE_GUARD_MIN_ROWS = 5


def scale_guard(scored: list) -> set:
    """Sources whose joined QB rows have a median above WEEKLY_QB_MEDIAN_MAX
    — season-scale answers to a weekly question. `scored` is
    [(src, pid, pos, pts)]. A source with fewer than SCALE_GUARD_MIN_ROWS
    QB rows is judged on all its positions instead (a weekly RB/WR/TE
    median above the bar is just as impossible)."""
    by_src: dict = {}
    for src, _pid, pos, pts in scored:
        by_src.setdefault(src, {}).setdefault(pos, []).append(pts)
    out = set()
    for src, per_pos in by_src.items():
        qb = per_pos.get("QB") or []
        vals = qb if len(qb) >= SCALE_GUARD_MIN_ROWS else [p for v in per_pos.values() for p in v]
        if not vals:
            continue
        vals = sorted(vals)
        med = vals[len(vals) // 2]
        if med > WEEKLY_QB_MEDIAN_MAX:
            out.add(src)
    return out


def weekly_paths(data_dir: Path, week: int) -> tuple[Path, Path]:
    """(probe json, raw csv) for one week — the `_wN` files the probe writes."""
    return (data_dir / f"ffanalytics_probe_w{week}.json",
            data_dir / f"ffanalytics_raw_projections_w{week}.csv")


def _num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if f != f else f          # NaN guard


def score_row(row: dict, scoring: dict) -> float | None:
    """One source row -> points under our table via the seasonal blend's
    STAT_MAP (the same map, so a stat priced there is priced identically
    here). A row with no mapped stat at all is None, never 0."""
    stats = {}
    for col, key in MS.STAT_MAP.items():
        v = _num(row.get(col))
        if v is not None:
            stats[key] = stats.get(key, 0.0) + v
    if not stats:
        return None
    return float(score_stat_line(stats, scoring))


def snapshot_index(snapshot: dict) -> dict:
    """{(norm name, pos): [(team, pid), ...]} from the snapshot's own names
    and projections — the champion's population, nothing outside it."""
    names = snapshot.get("names") or {}
    proj = snapshot.get("projections") or {}
    idx: dict = {}
    for pid, row in proj.items():
        nm = names.get(pid)
        pos = (row or {}).get("pos")
        if not nm or pos not in POSITIONS:
            continue
        idx.setdefault((MS.norm_name(nm), pos), []).append(((row or {}).get("team"), str(pid)))
    return idx


def _resolve(idx: dict, name: str, pos: str, team: str | None) -> str | None:
    cands = idx.get((MS.norm_name(name), pos)) or []
    if len(cands) == 1:
        return cands[0][1]
    if team:
        hit = [pid for t, pid in cands if t == team]
        if len(hit) == 1:
            return hit[0]
    return None


def load_ffa_arm(data_dir: Path, season: int, week: int, snapshot: dict,
                 scoring: dict | None = None) -> tuple[dict | None, dict]:
    """({pid: points} or None, diagnostics). None means "no arm this week"
    — files absent, wrong season, scraped after kickoff, or nothing joined —
    and the diagnostics say which."""
    probe_path, csv_path = weekly_paths(data_dir, week)
    diag: dict = {"arm": ARM_NAME, "week": week, "season": season,
                  "sources": list(WEEKLY_SOURCES), "min_sources": MIN_SOURCES,
                  "status": None, "note": None}
    if not probe_path.exists() or not csv_path.exists():
        diag.update(status="absent", note=f"no weekly capture for week {week} ({probe_path.name}, {csv_path.name})")
        return None, diag
    try:
        probe = json.loads(probe_path.read_text())
    except ValueError:
        diag.update(status="absent", note=f"{probe_path.name} is not JSON")
        return None, diag
    if str(probe.get("season")) != str(season) or int(probe.get("week") or 0) != int(week):
        diag.update(status="absent", note=(f"{probe_path.name} is season {probe.get('season')} week "
                                           f"{probe.get('week')}, not {season} w{week}"))
        return None, diag
    scraped = str(probe.get("scraped_at") or "")
    diag["scraped_at"] = scraped
    kick = first_kickoff_utc(week, season)
    diag["first_kickoff_utc"] = kick.isoformat()
    try:
        import datetime as _dt
        s_dt = _dt.datetime.fromisoformat(scraped.replace("Z", "+00:00"))
        if s_dt.tzinfo is None:
            s_dt = s_dt.replace(tzinfo=_dt.timezone.utc)
        if s_dt >= kick:
            diag.update(status="refused",
                        note=f"scraped {scraped} is at/after week {week}'s first kickoff {kick.isoformat()} — a backdated forecast")
            return None, diag
    except ValueError:
        diag.update(status="refused", note=f"scraped_at {scraped!r} unreadable — cannot prove pre-kickoff")
        return None, diag

    scoring = scoring or MS.league_scoring()
    idx = snapshot_index(snapshot)
    rows = list(csv.DictReader(csv_path.open()))
    per_src_rows: dict = {s: 0 for s in WEEKLY_SOURCES}
    per_src_joined: dict = {s: 0 for s in WEEKLY_SOURCES}
    scored: list = []                      # (src, pid, pos, pts)
    unmatched = 0
    sample: list = []
    for r in rows:
        src = r.get("source")
        if src not in WEEKLY_SOURCES:
            continue
        pos = (r.get("pos") or r.get("position_asked") or "").upper()
        if pos not in POSITIONS:
            continue
        per_src_rows[src] += 1
        pid = _resolve(idx, r.get("player") or "", pos, r.get("team"))
        if not pid:
            unmatched += 1
            if len(sample) < 12:
                sample.append(f"{r.get('player')} ({pos}, {r.get('team')}, {src})")
            continue
        pts = score_row(r, scoring)
        if pts is None:
            continue
        per_src_joined[src] += 1
        scored.append((src, pid, pos, pts))
    # ── THE SCALE GUARD (rule 3i, learned the hard way the same evening) ──
    # Asked for week 1, CBS returned its SEASON totals (games = 17, QB max
    # 415 points) while ESPN, FleaFlicker and NumberFire returned weekly
    # numbers (QB max ~28). Averaging the two is garbage, and the first cut
    # of this reader did exactly that — its known-positive asserted only
    # "> 5 points" and passed on a 200-point "week". A source whose median
    # QB row scores above WEEKLY_QB_MEDIAN_MAX is season-scale and is
    # dropped for the week, by name, in the diagnostics.
    season_scale = scale_guard(scored)
    by_pid: dict = {}
    for src, pid, pos, pts in scored:
        if src in season_scale:
            continue
        by_pid.setdefault(pid, {})[src] = round(pts, 2)
    out = {pid: round(sum(v.values()) / len(v), 2)
           for pid, v in by_pid.items() if len(v) >= MIN_SOURCES}
    diag.update({
        "rows": len(rows),
        "per_source_rows": per_src_rows,
        "per_source_joined": per_src_joined,
        "season_scale_sources_dropped": sorted(season_scale),
        "unmatched_rows": unmatched,
        "unmatched_sample": sample,
        "players_joined": len(by_pid),
        "players_priced": len(out),
        "players_below_min_sources": len(by_pid) - len(out),
    })
    if not out:
        diag.update(status="absent", note="capture present but no player carried ≥%d sources" % MIN_SOURCES)
        return None, diag
    # ⚠ THE NOTE COUNTS THE SOURCES THAT ACTUALLY CONTRIBUTED, NOT THE ONES WE
    # ASKED (A, 09-02, found in the week-1 rehearsal). It read "≥2 of 4
    # sources" on a run where the scale guard had dropped CBS — a diagnostic
    # that overstates the blend's breadth is how "four sources" got into
    # register 478 in the first place.
    contributing = [s for s in WEEKLY_SOURCES
                    if s not in season_scale and per_src_joined.get(s)]
    diag["contributing_sources"] = contributing
    diag.update(status="priced",
                note=("%d players from ≥%d of %d contributing source(s): %s%s"
                      % (len(out), MIN_SOURCES, len(contributing),
                         ", ".join(contributing) or "none",
                         (" (season-scale, dropped: %s)" % ", ".join(sorted(season_scale)))
                         if season_scale else "")))
    return out, diag
