# FORWARD PREDICTION — the model commits before reality answers

_Filed 2026-08-09 (Session A, at Cory's raise). The gap this closes: every
experiment in the Lab is **retrospective** — it replays 2023-25 and grades against
outcomes that already exist, and whoever builds the analysis has seen the answers.
That is precisely how three self-agreeing backtests slipped through this month (the
fixture that could not fail, the wide board that measured narrow, the Sleeper
source leaking in-season data). Backtests can always be quietly re-run until they
agree. **A forward prediction cannot** — the model commits in writing, timestamped;
reality answers once; there is no second run and no researcher degree of freedom._

## Why this is qualitatively different, not incrementally better

1. **No researcher degrees of freedom.** A retrospective metric can be recomputed,
   re-bucketed, re-scoped until it agrees with a prior. A committed forecast is
   frozen at `decision_at` (the server clock) with its resolution rule already
   written; the only remaining variable is what happens.
2. **History cannot grade THIS model's decisions.** The past does not contain the
   recommendations this model actually made, so a backtest can never tell us
   whether a rec we *acted on* was right. Forward prediction is the only record of
   that.
3. **Calibration is only measurable forward.** "91% survival" means nothing until
   many live 91% claims have been graded and the observed frequency is read back.
   The reliability curve is a forward object by construction.

## The mechanics (all built; infra already existed)

- **`forecast` ledger kind** (`src/predledger.js`) — a committed claim. Refuses to
  build without `{key, ftype, value, resolution_rule}` — a forecast with no
  resolution rule is a mood, not a prediction, so the gradeable skeleton is
  enforced the same way the in-season counterfactual is.
- **`forecast_resolution` ledger kind** — what reality returned, a SEPARATE append
  joined by `key`, written only when the outcome is known. The original forecast is
  never mutated (contamination rule).
- **The forward guarantee** (`draft/backtest/forecast_grade.py`) — a forecast is
  graded ONLY if its `decision_at` is strictly before its resolution's. A
  backdated "forecast" is DISQUALIFIED and listed, so no retrospective claim can
  ever inflate the score. Missing timestamp → fails closed.
- **The grader** — Brier + a reliability table for probability claims (same 10-bin
  scale as `replay.js calibration()`), signed-error/MAE for point claims, accuracy
  for categorical. Pure; reads a ledger export, never writes back.
- **The slate** (`draft/backtest/forecast_slate.py`) — the pre-registered
  categories below, each with its resolution rule fixed in code, plus
  `materialize()` so the war room commits a forecast with one call and a value.

## The pre-draft slate (committed at/before the draft, Aug 22)

| id | type | claim | resolved when / how |
|---|---|---|---|
| `survival` | probability | P(a target survives to my next pick) | draft night — was he undrafted when my pick came? |
| `adp_fall` | probability | P(a player falls > a full round past ADP) | draft end — actual slot vs preseason ADP |
| `room_seat` | categorical | who the room takes at each round-1 seat | the moment that seat picks |
| `roster_dollars` | point ($) | my roster's expected end-of-season dollars | season end — `money_grade grade_actual` |

These are the claims that carry draft-day dollars: the survival % is the number the
war room already shows (now it gets graded, so the survival model earns or loses
credibility for real); `adp_fall` is the value-fall the board is built to exploit;
`room_seat` tests whether the opponent model actually predicts the room;
`roster_dollars` is the single honest bottom line — what the model thinks the draft
was worth, committed before a game is played.

## The weekly in-season slate

| id | type | claim | resolved when |
|---|---|---|---|
| `weekly_high_winner` | categorical | who wins the week's high (the 37.5% pool) | week's final scores |
| `champ_prob` | probability | each team's championship probability, weekly | season end |
| `bust` | probability | P(a player busts relative to ADP, rest-of-season) | season end |

`weekly_high_winner` is the forward test of the ceiling thesis this whole lane is
built on; `champ_prob` is what the pool advisor's placeholder odds become once the
championship-probability model lands (it grades itself forward from week 1);
`bust` is the projection model finally exposed to reality with no do-over.

## Grading cadence

- **Draft night → the moment each seat/pick resolves**: `survival`, `room_seat`,
  `adp_fall` grade within hours. The first live calibration read on the survival
  model arrives the same night.
- **Weekly**: `weekly_high_winner` grades every week; `champ_prob` accrues a fresh
  committed claim each week and grades at season end (the reliability curve needs
  many).
- **The Annual**: `roster_dollars`, `bust`, and the season's calibration curve —
  the first forward scorecard of the model's own judgment.

## Discipline (unchanged, and this is the point)

Nothing here lowers a gate. A forecast is committed, never retuned; its resolution
rule is written before the outcome; a backdated claim is disqualified, not
smoothed. Attribution wording stays honest — a graded forecast reports "the model
said P and reality returned X," never a causal claim about dollars earned. This is
the model, for the first time, putting its judgment on the record where it can be
wrong in public and learn from it.

## Status / next

- Built + tested this session: ledger kinds, grader (forward guarantee), slate,
  materializer. `test_forecast_grade.py` + `test_forecast_slate.py` +
  `predledger.test.js` forecast block all green.
- **Wire-up owed at draft time**: the war room calls `forecast_slate.materialize(...)`
  → `POST /admin/api/ledger/predict` for each committed claim as the board fills
  (survival at each of my picks; `room_seat` per seat; `adp_fall` on the top board;
  `roster_dollars` at draft end). The resolution pass reads the finished Sleeper
  draft and appends `forecast_resolution` per key. Both are small, and the write
  path + validation already exist — this is emission, not new infrastructure.
- **In-season**: the weekly kinds emit from the Sunday rail (B's lane owns the
  surface; the ledger kinds + grader are ready for them).
