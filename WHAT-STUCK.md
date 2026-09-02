# WHAT STUCK — the loops that closed, in plain English

**Cory, 2026-09-02:** *"if we find edge we're presenting it in a way that I can
understand.. every loop closed, the ones that stick, I need to know."*

This is that page. One entry per loop that CLOSED with a measured answer.
Each says what we tested, what we found, what changed for you, and what to do
with it. Anything still running lives at the bottom with its grade date. Every
entry cites the register or ledger row that holds the numbers, so nothing here
is a story — `draft/tests/test_what_stuck.py` fails if a cited row does not
exist. The relay and A keep it current; if a loop closes and it is not here
within a day, that is a defect.

**How to read the numbers.** *Start/sit accuracy* is the share of same-position
pairs where the higher projection actually scored more (a coin is .500). *MAE*
is the average miss in points per player per week (lower is better). Two
seasons means it held in 2025 AND 2024 with the claim written down before the
second season was read.

---

## ✅ STUCK — use these

### 1. Player prop lines are the sharpest weekly signal we have
**Tested:** price every player's weekly points from the betting lines (yards,
receptions, touchdowns) and compare with our own weekly number on the same
players. **Found:** the props number wins at ALL FOUR positions on start/sit
in both seasons — 2024: QB .643 vs .611, RB .805 vs .753, WR .765 vs .709,
TE .766 vs .737. **Changed for you:** a free props file is written every
Wednesday and Thursday (312 players in week 1), and `props_second_opinion`
puts the props number beside ours on YOUR roster with the swaps named.
**Do:** when the two disagree on a start, the props side has been right more
often. Week 1: props would start Judkins over Adams. *(registers 463, 471, 467)*

### 2. Pull the season number toward what the player has actually done
**Tested:** the site's rule — start from the season projection per game, then
pull it toward the player's own in-season points as weeks accumulate.
**Found:** better than the plain per-game number in both seasons (MAE 4.55 vs
4.60; 4.79 vs 4.83) and better at every position on start/sit. **Changed for
you:** it is the live weekly champion (`v1_pull3`) from week 1. *(register 463,
P353)*

### 3. The blended season projection beats our own model as the starting point
**Tested:** same weekly formula, different season prior — the board's
multi-source blend instead of our own model. **Found:** the prior mattered
more than the formula; our own model was the WORST prior on every grade in
both seasons; the blend won at 4 of 4 positions both years. **Changed for
you:** the site's lineup number already used the blend; the graded loop now
carries it as a challenger and will promote it if it keeps winning live
(P359, first read 10-13). *(register 474)*

### 4. Roster shape needed a weight, and it worked
**Tested:** the draft engine took quarterbacks repeatedly (one replay seat
drafted seven). **Found:** the `need` weight at 1.0 closes the conversion gap
— value that reaches a starting slot — and passes the owners' rate in two of
three seasons. **Changed for you:** shipped 08-20 on your ruling. *(register
317, CORY-ASKS A13)*

### 5. The weekly loop was blind to your keepers — fixed the week before kickoff
**Tested:** a control on the second-opinion tool named three of your starters
as unmatched. **Found:** the weekly champion priced zero of the league's 23
keepers (Chase, Henry, Walker among them) and the member matchup odds refused
your lineup every week. **Changed for you:** both fixed; a guard now catches
any new reader that forgets keepers. *(register 476)*

## ❌ DID NOT STICK — stop expecting these

### 6. The Vegas game-total tilt adds almost nothing on top of the prior
**Tested:** scale each player's weekly number by his team's implied total
(from the game over/under and spread) at 0×, 0.5×, 1×, 1.5×. **Found:** the
four settings span 0.02–0.05 MAE in both seasons — inert. The books' player
props already carry the game environment. **Changed for you:** the tilt stays
at 1× (harmless) and a no-tilt arm is graded beside it; the shadow rule will
say if it ever matters. *(registers 463, 471, P353)*

### 7. Adding "ceiling" to every player's draft value
**Tested:** three preregistered runs said a ceiling weight helps. **Found:**
the evidence was taken before the ceiling source changed, and the published
reference model never adds ceiling into value. **Changed for you:** you
switched it off 08-20 (*"it's so arbitrary"*); the board agrees with the
reference model. *(register 99)*

### 8. Pace of play — as a draft signal AND as a weekly tilt
**Tested:** a tempo tilt on the season model (draft), then a prior-season
pace tilt on the weekly number in both backtest seasons. **Found:** null both
times — weekly pooled miss 4.018 vs 4.010 and 4.365 vs 4.360, start/sit
unchanged to the third decimal. **Changed for you:** nothing shipped; pace is
a dead axis. *(pace study; `game_env_lab.json`)*

### 9. Weather and the game total on top of the player lines — your question
**Tested (09-02, claims written before the run):** wind ≥15 mph and freezing
temperatures on outdoor games, as a discount on the affected players, on top
of our own number AND on top of the props number, in both seasons; the game
total is already the champion's tilt (entry 6). **Found:** on our own number
it is noise. On the props number the affected players miss by 0.07 less in
2025 and by 0.001 less in 2024, both beating a shuffled weather map — a
small, one-directional hint that the books do not fully price wind, not an
edge. **Changed for you:** nothing yet; it goes to D as a live weekly arm
graded from week 1, and it moves here only if real weeks confirm it.
*(`game_env_lab.json`)*

### 10. Turning a player's weekly swings into a season ceiling with one knob
**Tested (graded 09-02):** scale each player's week-to-week spread up to a
season ceiling with a single fitted exponent, walk-forward on 2021-25.
**Found:** it calibrates (about 10% of players beat their ceiling, as
designed) and it keeps player-specific information — but the same setting
prints ceilings no one has ever scored: a 557-point receiver season against
a best-ever of 367, at every position. One knob cannot buy both breakout
coverage and plausibility. **Changed for you:** nothing ships; the ceiling
family stays as it was, and the next candidate is a two-parameter form with
the ceiling capped at the best season ever recorded. *(P20; register 4w)*

## ⏳ STILL RUNNING — grade dates

| loop | what it will tell you | first grade |
|---|---|---|
| props arm live (P354) | does the backtested props edge hold on real 2026 weeks | 09-15, then weekly |
| blend prior live (P359) | does the blend beat our model as the weekly champion | 10-13 |
| MAE vs start/sit as the promotion judge (P358) | which metric should pick the champion — your call, on evidence | 10-13 |
| props + pull blend (P357) | the best combined arm from the backtests, entering 10-08 | 11-03 |
| weather as a live WEEKLY arm (pace is dead, entry 8) | whether the small props-side wind/cold hint from two backtest seasons survives real weeks | D, weekly from 09-15 |
| usage (snap share / target share) as a weekly arm | the most-cited weekly predictor we have never measured | D, by 09-15 |
| tool vs what you actually did (lineup, waiver, stream) | the dollars-shaped grade: did following the tool beat your gut | every Sunday from week 2 |
| roster shape WITHOUT a cap (P363) | whether the model learned the format (one TE, K with the last pick) from a roster-aware value function, or has to be told — 2026 half says learned: 1.0 violations/seat, every roster complete | replay half 10-06 |
| four outside WEEKLY projection sources as a challenger (register 478) | CBS and ESPN stopped publishing season totals on 08-20 but publish weekly numbers, and FleaFlicker and NumberFire do too — 1,900 weekly rows a week we never had; whether a blend of them beats our champion on real weeks | D preregisters the arm; first graded week 09-15 |
| an automatic bench rule for the champion (A-DECISIONS D4) | the champion can be benched only when a challenger beats it on the season, the last three weeks AND start/sit — built report-only first, so the first weeks show what it WOULD do before it is allowed to act | D, by 09-15 |
