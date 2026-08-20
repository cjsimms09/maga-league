# E's board sweep — `team` has zero cross-validation, and two flagged players are worth a spot-check before the draft

**Session E (red team), 2026-08-18.** Continuing the standing top-50-first board
sweep past rank 100. Two names in the QB pool read as surprising against
memory: **Kyler Murray, listed `team: MIN`** (board #135, ADP 130.33,
`depth_chart_order: 1`) and **Tua Tagovailoa, listed `team: ATL`** (board
#560, ADP 232.0, `depth_chart_order: 1`).

**What this row is and is not.** This is NOT a claim that either assignment is
wrong — my own knowledge has a cutoff and cannot referee an NFL transaction
that may have happened in the seven months since. It IS a claim, verified
against this repo alone, that `team` is structurally unlike every other field
near it: nothing here would catch it if Sleeper's team field were stale or
wrong, and the blast radius is bigger than the field that already got this
exact treatment two sweeps ago (`depth_chart_order`, register row on
08-18, closed as a non-issue after checking it against market ADP).

## `team` is single-sourced, with no cross-check anywhere in the pipeline

`draft/build.py:576`: `"team": p.get("team") or "FA"` — read straight from
Sleeper's player object, same shape as `depth_chart_order` two lines below it
(`p.get("depth_chart_order")`, also uncross-checked, per the earlier sweep).

The board ALSO ingests an independent source, FantasyPros, for ADP and
projections. It does not help here: `draft/adp.py:506-520`
(`build_fantasypros_table`) matches each parsed FP row to a Sleeper player id
**by name** (`match_player(entry, index)`), then writes only `adp`, `adp_sd`,
`adp_source`, `match_method`, `fp_rank` onto that id — never a team field. So
FP's own row-level team (if its export even carries one) never reaches the
board, and never gets compared against Sleeper's. A players is matched by
name once and its team is trusted from Sleeper alone, forever, with no
second opinion in this codebase.

`raw_adp`/`consensus_rank`/`sleeper_rank` (build.py:594-598) all come from
the same Sleeper player object as `team`, so they cannot cross-check it
either — a wrong team traveling through Sleeper's own database would be
self-consistent across every field this pipeline reads.

## The blast radius is bigger than `depth_chart_order`'s: `bye` is DERIVED from `team`

`draft/build.py:589`:
```python
"bye": team_byes.get(p.get("team")) or (p.get("metadata") or {}).get("bye_week"),
```
The surrounding comment (build.py:577-588) explains this is deliberate — Sleeper's
per-player `bye_week` is sparse, so the pipeline derives a team→bye map from
whichever players DO carry it and applies it to the whole roster, "self-healing"
by design. That healing is only correct if `team` itself is correct. A player
whose `team` is wrong doesn't get a missing bye (which `test_freeze_not_stale.py`
and friends might catch) — he gets **someone else's real bye week**, silently,
and nothing downstream can tell the difference between a right answer and a
wrong one produced the same way.

No freshness signal exists for `team` at all — contrast with `adp_stale`
(`{direction, slots, days}`, present and populated for 19 of the top 150,
confirmed working two sweeps ago) or `bye_source` (present, `'ffc'` observed
on live rows). `team` has neither an `_source` nor a `_stale` sibling
anywhere in `PLAYER_FIELDS` or the live board.

## What IS checkable from here, and does not raise the alarm further

- **Cache freshness**: `sleeper_import.py:77-79`, `fetch_players()` — TTL 24h,
  "changes slowly." Board `built_at` is 2026-08-18T11:20:33Z, so the
  underlying player DB is at most a day stale relative to build time — this
  is not a stale-cache problem, it is a no-second-source problem. If Sleeper's
  own database is wrong, the board is wrong within a day of Sleeper being
  wrong, which is about as tight as this pipeline can get without a second
  source.
- **Population check**: every one of the 32 real NFL teams has at least one QB
  on the board (checked earlier this sweep, `depth_chart_order` investigation)
  — no team is missing a starter-shaped hole that would independently suggest
  a misplaced player.
- **Internal consistency**: both flagged players carry `depth_chart_order: 1`
  on their listed team (i.e., Sleeper itself treats them as that team's
  current starter, not a stale leftover row) — whatever Sleeper's database
  says, it says it consistently across fields, which is exactly what a
  single-source pipeline would also produce under a genuine error.

## ASK

Before Cory drafts, spot-check these two names (and any other QB/skill
player that reads as surprising) against a live source outside this repo —
this is a five-minute check for someone with real-time access, and I do not
have one. If both are confirmed correct, this closes as a documentation
note: `team` still has no second source and no freshness stamp, worth fixing
post-draft the same way `depth_chart_order`'s asymmetry-with-`bye` was
worth naming, but nothing is wrong today. If either is wrong, it is
draft-critical: it silently corrupts that player's bye week via the derivation
at build.py:589, on a field with no freshness or cross-validation signal to
have ever caught it.
