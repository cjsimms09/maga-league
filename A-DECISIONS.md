# A-DECISIONS — the only page A has to read

**Cory, 2026-08-31, verbatim:** *"shouldnt you own the messaging for A? ie A
makes decisions, approves or rejects, then you route to where it needs to go
from there?"* Yes. This sheet is that protocol, standing, in-season — the
draft-day triage (`A-DRAFT-DAY-DECISIONS.md`) made permanent.

**HOW IT WORKS**
- The relay curates this sheet. Lanes no longer file decision-asks to
  `ROUTES.md → TO: A`; they file to the relay (or anywhere), and the relay
  distills each into ONE row here: the question, the evidence link, a REC,
  and what each answer triggers. **A reads this page, writes one word per
  row (`APPROVE` / `SEND BACK: <reason>` / the ruling itself), and the relay
  routes every consequence.** A never has to open ROUTES to be caught up.
- **THE RED-TEAM CARVE-OUT:** E writes rows here DIRECTLY, unfiltered — a
  chief of staff who curates the red team's access to the executive is how
  an executive stops hearing bad news. E's rows are marked 🔺.
- **THE INSPECTION RULE:** nothing is hidden — every source stays on main,
  every row links its evidence, and the Wednesday audit publishes what the
  relay bounced or summarized, so the curation itself is auditable. A can
  always grep past the sheet; the sheet exists so A never has to.
- A row leaves this page within a day of A's word, its routing recorded in
  the answer column. Decision-latency (filed → A's word) is the Wednesday
  audit's headline metric for this page.

| # | decision | evidence | REC | A's word |
|---|---|---|---|---|
| D1 | **Grade P20** — the weekly→season ceiling rescale. Build done (relay); calibrates and keeps player info, blows the best-ever sanity bound at every position; one knob can't price breakouts and plausibility together. | `draft/backtest/p20_rescale_fit.json` + the ledger row | **FALSE** (register 4w reopens with a two-parameter successor, per the row's own route) | ☐ due 09-02 |
| D2 | **The seats-demoted line** — `assert len(sup) <= 6` in `test_roster_robustness` is the ONLY thing refusing every board publish (54 of 55 blocker tests green). Its own comment says whoever rules owns the line and forbids raising the number. | test comment at `draft/tests/test_roster_robustness.py:240`, register 378, the 343 ratchet (each refusal destroys a day's capture) | Convert the count to an artifact and assert every demotion NAMES its resolution — a board refusal should mean the board is bad (register 55's own lesson) | ✅ **EXECUTED 08-31 on CORY'S DIRECT ORDER ("I sent go, want board fixed now") under the hierarchy ruling — count → `draft/data/seat_disagreement.json`, naming-property kept load-bearing, 10/10 green, board build dispatched. A MAY REVERSE; register 378's shortlist question stays open (E, 09-03) with the artifact as its feed.** |
| D3 | **Merge `claude/fantasy-football-research-926y6z`** — two commits: the roster_robustness vintage-drift guard (hardening; the crash healed itself when the board rebuilt) and the Thursday TNF lineup check (clock: TNF week 1 is 09-10). 31/31 + 9/9 + 11/11 suites; `sunday_why` runs on main post-merge. | branch tip `9222d6ad`; ROUTES merge-ask | **APPROVE** (or send back the guard alone — the Thursday check is the half with a deadline) | ✅ **EXECUTED 08-31 under the same Cory order as D2** ("I sent go, want board fixed now" — the guard was one of the board run's two blockers): both commits cherry-picked to main as `cae5e95b` + `c23f06cc`, suites green there. A MAY REVERSE (revert the two shas). The branch itself carries nothing further. |
| D4 | **The kill switch (QUICK-KILL, register 199/307)** — the adaptation policy calls benching automatic; no `decide_bench()` exists. First Tuesday grade is 09-15; a champion nothing can dethrone gets crowned then. Every default is bad by the row's own words (ship a winner-bencher, or start week 1 with no kill switch). | register 199 (measured: zero bench/demote code), 307 | Rule the SHAPE now (3 consecutive graded losses to any challenger = benched, pending your sign-off), D builds it before 09-15 | ☐ due 09-04 |

| D5 | 🔺 **Register 437 (E's find) — the weekly emitter's keeper blind spot**: `boardIndex()` read `players` only, so arm `'ours'` emitted nothing for all 23 keepers while arm `'sleeper'` covered them — the 09-15 our-model-vs-Sleeper grade would run on a population biased against our own model, and weeks 1-2 cannot be re-emitted honestly once missed. | register 437; E's REC verbatim ("do it before the first Thursday emission"); known-bad control run and refused; 77/77 | Execute E's REC | ✅ **EXECUTED 08-31 by the relay under Cory's same-day "make model better" order, ahead of the 09-04 silence-default** — `kept_players` concat in `boardIndex()`, 3 new tests incl. all-23-resolve on the real board, committed WITHOUT `[skip deploy]` so it deploys before week 1's first emission. A MAY REVERSE (single commit). |

| D6 | **Register 444 — the keeper-projection archive hole** (D's find and fix): `_update_proj_series` read `players` alone, so since the 08-22 keeper lock every nightly permanently lost the day's projections/situation/distribution for all 23 keepers — register 80's bug in the one file where retroactive fetches leak. D fixed it on-branch with a fail-armed test; the ask was "A merges", and each night unmerged lost another day. | register 444; D's `44af68c3`+`6371f178`; fail arm re-proven on main; drift-monitor controls ALL PASS | Merge D's fix | ✅ **EXECUTED 08-31 evening by the relay (cherry-picked, A MAY REVERSE — two shas), before tonight's 04:00 nightly so day 11 is not lost.** Still yours: 435's gate-policy ruling (skip-with-disclosure as standing policy) and wiring `source_universe_drift.py` into the nightly. |
| D7 | 💵 **Cory, 09-01: "Make our model better... win more matchups and make me more money."** The relay's ranked answer is `IN-SEASON-EDGE-PLAN-2026.md`; it rests on YOUR register 463 (the live champion is the worst full-coverage arm on every 2025 grade; the props arm beats it at all four positions). Three preregs filed (P354 props live · P355 distributions into the E[$] solver · P356 Tuesday waiver rail). | register 463, `weekly_arms_2025_backtest.json`, EFFICIENCY-LEAK ($1,500 weekly-high pot = 70-75% of the leak), dossier (Cory .862 conversion, .439 claim fail) | **Build ① (props arm live as challenger for week 2) first; rule ⑥ (promote on start/sit, not MAE) by 09-15** | ☐ due 09-04 — one word: APPROVE the order, or re-rank |


*Filed 2026-08-31 by the relay. The protocol amendment lives in
`OPERATING-MODEL.md` Rule 3b; the routing of each answer is the relay's job
within a day.*
