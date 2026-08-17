# Draft-night shadow ledger + per-surface calibration scorecard — 2026-08-16

TERRITORY: A. Cory's ruling, 2026-08-16, on the two forward-prediction gaps:
**"Do 2, 6."** (#2: record the tool's recommendation at every pick of the real
draft, all ten seats; #6: the per-surface Brier/calibration scorecard.) Both
are built, tested, and wired below. Draft is Saturday 2026-08-22.

---

## 1. The draft-night shadow ledger (#2)

### The gap it closes

Until today the pick log graded exactly one manager: `old_path_recommendation`
records what the frozen VORP ranking said, and only Cory's own picks carry a
deviation field. Draft night is ~150 picks by ten managers, and the LIVE
engine's opinion at each of them was never written down — so January could
grade 12 decisions when it could have graded ~130 (150 minus keeper slots).
A recommendation recomputed in January against a rebuilt board is a
reconstruction — the class of claim this repo has been wrong about four times
(the pick log's own header). A recommendation computed and timestamped as the
pick lands is a prediction.

### What was built

`draft/tools/draft_shadow.js` — for every row of the pick log, drive the REAL
shipped engine (`E.recommend()` via `draft/tools/live_context.js`, MEASURED
weights, the same wire_level supply `archetype_rooms.js` proved) **from the
seat that was on the clock**: that seat's accreted roster (keeper picks
included, exactly as they arrive in the stream), that seat's remaining live
schedule from the freeze's pick_order, the remaining pool = board minus the
log's gone-set. Appends one row per pick to
`draft/data/draft_shadow_2026.jsonl`:

```
{ pick_no, seat, seat_source, actual_player, tool_recommendation, top3,
  composite_gap, actual_rank_in_tool, is_keeper, is_selection,
  captured_at, freeze_sha256, board_sha256, board_matches_freeze_source,
  engine, seat_schedule }
```

- `composite_gap` = engine top score − engine score of the player actually
  taken, same list, same moment. 0 = the room did what the tool said.
- Keepers record `tool_recommendation: null` **with the reason** — a keeper
  removes a player from the pool but is not a decision anybody made
  (`log_draft_picks.py`'s own is_keeper/is_selection distinction, carried
  through rather than re-collapsed).
- Every row is stamped with the freeze's payload sha AND the live board's
  sha, plus whether the board still matches the freeze's
  `source_artifact_sha256` — a row joined to a drifted board looks exactly
  like a good one, so the drift is recorded, never silent.
- Seat identity: the log's own `team_slot` when Sleeper's mapping supplies
  it; otherwise the freeze pick_order's snake geometry (`seat_source` says
  which). Measured against the stored 2025 stream: `slot_to_roster_id` came
  back `{}` and every `draft_slot` was null on a REAL draft, so without the
  fallback every one of the 150 rows would have been reasonless.

### Zero new operator steps (the wiring)

`draft/log_draft_picks.py sync()` now ends by calling `shadow_sync()`
(subprocess → the node tool), and reports its result under `"shadow"` in the
same JSON the draft-night workflow already prints. The manual `--record`
fallback path gets the same call. Properties, each tested:

- **Idempotent** — a poll with nothing new adds nothing; an incremental poll
  shadows only the new picks with state identical to a from-scratch run.
- **Non-blocking** — a shadow failure is REPORTED in the sync result, never
  raised: the pick log is the primary record and outranks everything.
- **Isolation follows the log** — a redirected `DRAFT_PICK_LOG_PATH` (the
  workflow's dry_run) gets its shadow BESIDE it (`*_shadow.jsonl`);
  `DRAFT_SHADOW_LOG_PATH` overrides explicitly; `DRAFT_SHADOW_DISABLE=1` is
  an explicit, self-describing kill switch (set only by rehearsal tests that
  are not about the shadow).
- **Deterministic** given (board, freeze, pick log): re-running reproduces
  every row byte-for-byte except `captured_at`. The timestamp is the forward
  guarantee — it is what separates these rows from a January recompute.

### Evidence

- `draft/tests/draft_shadow.test.js` — 24 pure assertions, the row arithmetic
  (gap, rank, top3 slimming, seat clock, schedule, path derivation) summed by
  hand.
- `draft/tests/test_draft_shadow.py` — 8 rehearsal tests against the REAL
  2025 draft stream in `league_history.json` (the same corpus
  `test_pick_log_rehearsal.py` uses, for the same reason): zero-step wiring,
  idempotence across polls, determinism-minus-timestamp, keeper/selection
  split, gone-set honesty (no recommendation ever names a drafted player),
  identity stamps, failure containment.
- Timing, measured here: 40 picks shadowed in ~1.2s cold; a poll-loop
  increment is 1–3 picks. Well inside the workflow's poll interval.

### Limitation, stated

The engine is Cory-seat-tuned in one term: keeper-stack context comes from
`currentKeepers`, which the shadow feeds per-seat from the stream's own
keeper picks — but manager-profile-specific surfaces (doctrine, personal
lists) are not simulated per opponent. The row records the engine identity
(`engine-shadow-v1`, MEASURED_WEIGHTS) so January grades exactly what was
computed, not more.

**⚠ One line A must add (workflow YAML is out of this lane):**
`draft-night-sync.yml` commits only `draft/data/draft_pick_log_2026.jsonl`;
until `draft/data/draft_shadow_2026.jsonl` is added to that `git diff`/`git
add` pair, shadow rows survive only as long as the runner does. On ROUTES
TO:A.

---

## 2. The per-surface calibration scorecard (#6)

### The gap it closes

`src/forecast_grade.js` computes Brier + ONE reliability table over
everything it grades. A pooled curve lets a sharp surface hide a broken one:
the matchup model could be calibrated while champodds runs 20 points hot and
the pooled table reads "fine". "When the tool says 70%, does it happen 70% of
the time?" is a per-surface question.

### What was built

`draft/tools/calibration_report.js` — pure module + CLI. Reads the GRADED
output (grade-cron's `calibration:<season>:<ISO>` snapshot shape — one
grader, one derivation; the curve arithmetic is imported from
`forecast_grade.reliabilityTable`, not re-implemented). Emits per surface:
calibration curve, Brier, sample size, mean-predicted vs observed frequency,
and an over/under-confidence verdict whose rule is stated in the artifact
itself (no verdict under n=10; |gap| ≤ 5pp calibrated; hot/cold otherwise).

Surfaces are a DECLARED REGISTRY (the accuracy-page PENDING_KINDS
discipline), each with its key shape and emitter:
`matchup_winprob`, `weekly_high`, `champodds`, `exp_wins`, `survival`,
`room_seat`, `player_projection`, the three decision kinds (`lineup_call`,
`waiver_claim`, `stream_call` — edge-graded, and the verdict SAYS they are
not probability surfaces), and `sidebet_advisor` — declared with **no
emitter**, because nothing writes a side-bet forecast into the ledger today;
its row says "not wired", never "0-for-0 and fine". Rows matching no declared
surface are counted and listed (`unregistered_keys`), never dropped.

Artifact: `draft/data/calibration_report.json`, `_territory` first, committed
in its honest pre-season empty state — every surface present, n=0, verdict
"no resolved forecasts yet; first real rows ~Sep 15".

### Evidence

`draft/tests/calibration_report.test.js` — 36 assertions over synthetic
snapshots with every Brier, bin count, observed rate and verdict computed on
paper first (0.19 from four 0.8-claims with three hits; 0.37 at n=10;
bin-edge clamping of p=1.0; ±5pp verdict thresholds both directions; decision
edges; the empty state; `_territory`-first in the written artifact).

### Wiring point (A's, noted not taken)

grade-cron owns grading; per the ruling this lane did NOT touch it. The
regeneration hook A should land: in `weekly_grade_runner.js`'s loop-closure
block (steps 3–5 read-side pattern), mirror the latest `calibration:<season>`
snapshot to `draft/data/calibration_latest.json`, then run
`node draft/tools/calibration_report.js` — the CLI already prefers that file
when it exists and degrades to the empty state when it does not. Detail on
ROUTES TO:A.

---

## Files touched

| file | what |
|---|---|
| `draft/tools/draft_shadow.js` | NEW — shadow ledger driver + pure row core |
| `draft/log_draft_picks.py` | `shadow_sync()` wired into `sync()`/`--record`; `--status` shows shadow coverage |
| `draft/tests/draft_shadow.test.js` | NEW — hand-summed row arithmetic (24) |
| `draft/tests/test_draft_shadow.py` | NEW — 2025-stream rehearsal (8) |
| `draft/tests/test_pick_log_rehearsal.py` | fixture disables shadow for the pick-path rehearsal, reason stated in-fixture |
| `draft/tools/calibration_report.js` | NEW — per-surface scorecard, pure + CLI |
| `draft/tests/calibration_report.test.js` | NEW — hand-summed curve arithmetic (36) |
| `draft/data/calibration_report.json` | NEW — committed pre-season empty state |
| `draft/audit/shadow_calibration_2026-08-16.md` | this file |
| `ROUTES.md` | TO:A — workflow one-liner + weekly-grade wiring point |
