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
| D2 | **The seats-demoted line** — `assert len(sup) <= 6` in `test_roster_robustness` is the ONLY thing refusing every board publish (54 of 55 blocker tests green). Its own comment says whoever rules owns the line and forbids raising the number. | test comment at `draft/tests/test_roster_robustness.py:240`, register 378, the 343 ratchet (each refusal destroys a day's capture) | Convert the count to an artifact and assert every demotion NAMES its resolution — a board refusal should mean the board is bad (register 55's own lesson) | ☐ due 09-02 |
| D3 | **Merge `claude/fantasy-football-research-926y6z`** — two commits: the roster_robustness vintage-drift guard (hardening; the crash healed itself when the board rebuilt) and the Thursday TNF lineup check (clock: TNF week 1 is 09-10). 31/31 + 9/9 + 11/11 suites; `sunday_why` runs on main post-merge. | branch tip `9222d6ad`; ROUTES merge-ask | **APPROVE** (or send back the guard alone — the Thursday check is the half with a deadline) | ☐ due 09-02 |
| D4 | **The kill switch (QUICK-KILL, register 199/307)** — the adaptation policy calls benching automatic; no `decide_bench()` exists. First Tuesday grade is 09-15; a champion nothing can dethrone gets crowned then. Every default is bad by the row's own words (ship a winner-bencher, or start week 1 with no kill switch). | register 199 (measured: zero bench/demote code), 307 | Rule the SHAPE now (3 consecutive graded losses to any challenger = benched, pending your sign-off), D builds it before 09-15 | ☐ due 09-04 |

*Filed 2026-08-31 by the relay. The protocol amendment lives in
`OPERATING-MODEL.md` Rule 3b; the routing of each answer is the relay's job
within a day.*
