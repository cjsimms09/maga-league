# WHAT ACTUALLY HAS TO BE DECIDED BEFORE 22 AUGUST

**Relay, 2026-08-18. One screen. This is a TRIAGE, not a ruling — A can overrule
any line of it, and the register remains the record.**

Cory, twice this week: *"too much finding and not enough fixing and following
up."* The register has **97 open rows** (08-19, moved from 70 same day). **The number it replaces,
51, is the point:** nineteen rows were filed after that sentence was written and
it went on asserting 51, until `test_the_backlog_claim_is_still_roughly_true`
refused the build. **Do not quote this without re-running
`register_recheck_check.js`** — a stated count decays daily. **The "Thirty carry
a recheck date on or before 08-22" figure below is from 08-18 and has not been
re-derived against the current row set** — flagged rather than left implying a
precision the number no longer has. Most are owned by A. That is not a decision list, it is a
backlog wearing one, and reading it four days out costs more than it returns.

So every open row was put to a single question — **can this change a number on
Cory's screen on 22 August?** — and the answer is *no* for most of them. What
follows is what survived.

---

## 0 · THE TWO THINGS THAT MUST HAPPEN, AND NEITHER IS A DECISION

**1. Rebuild the board after the keeper slate confirms.** The live board stands
on a **predicted** slate: 4 of 10 teams designated, **8 keepers across 3 teams
withheld** (Cory's own 08-11 ruling). Until the rebuild, every replacement level,
VORP and ADP adjustment is computed over a pool containing players nobody can
draft. Tracked by commitment `slate-exposure-rechecked`, **OVERDUE 08-21**.

**2. 🔴 Freeze the board SATURDAY, after 03:00 CDT — not Friday night.**
Register **5i**, new today. `draft-data.yml` rebuilds and commits
`public/draft_data.json` on `cron: '0 8 * * *'` **every night, including draft
morning**, and `freeze_pre_draft.py` reads that exact file. A Friday freeze is
stale by breakfast — step 1's own rule (*"freeze THAT board, nothing older"*)
broken by a scheduled job rather than by anyone's mistake. **Runbook corrected.**
What remains is a judgement: leave the 08-22 nightly rebuild on (recommended —
a fresh board beats a convenient freeze, same reasoning as 35) or disable it for
the day. **START TIME ANSWERED 08-18 — Cory: *"Yes it's 6pm"***, now in
`league_config.json` (2026-08-22 18:00 CDT, verbatim, rebuild-proof, 2 tests).
**Last of the six jobs fires 08:17 CDT — ten hours of clearance, so "leave them
on" is measured, not assumed.** One of this item's two questions is gone; the
other is unchanged and yours: leave the 08-22 nightly rebuild on, or disable it.

✅ **Register 35 closed 08-18** — it asked to *"fail a parity check that names the
stale artifact"*. The check existed and was tested; **nothing ran it against the
live board.** A CI step now does, and `ci.yml` fires on push to `main`, where the
rebuild lands. Exit 0 today. It does not auto-rebuild — that is item 1 above.

## 1 · CORY'S RULINGS — ONE DOWN, ONE POST-DRAFT

| | what he decides | why it cannot wait / can | register |
|---|---|---|---|
| ~~**C1**~~ | ✅ **RULED 08-18 — "Keepers will be set by 08/21 at 6pm".** The banner's date was right; the fifteen files were wrong. **Root cause fixed, not just the date:** `league_config.json` now carries `keepers.deadline` as the single source, guarded against the nightly rebuild. B is unblocked to ship. | *nothing further* | 42 ruled and closed, Q17 answered, ledger P71 graded FALSE — the good outcome |
| ~~**C2**~~ | ✅ **RULED 08-17 — Cory, verbatim: "IS THIS STUDIES? IF SO, YES." `ceiling` ships at 0.45**, the measured inverted-U peak (FRONTIER exp 21: λ=0.5 +$56/season, CI [33,78]; higher arms provably negative). ~~Held at zero through the draft.~~ This row was stale a day — the ruling landed before the sheet did. **And the trap it left behind is closed (5g, ruled 08-18):** the restore button's pin moved v1→v27 so one tap no longer reverts this ruling or D10's stack. | *nothing further pre-draft* | 5 ruled, 5g closed, engine.js:630 carries the paperwork |
| **C3** | **The projection SOURCE, post-draft — his own 08-16 question, now with its first measurement.** The three-way grade ran 08-18 (2025, 360 shared players, leak-gated): QB — pure Sleeper wins and the blend loses; WR/TE — the blend beats the best single source (+0.016/+0.012, mechanism-consistent: own_v6 is the decorrelated arm); RB — a wash. | **Held through 08-22 by the prereg's own "Nothing ships" rule.** After Saturday: position-scoped — QB Sleeper, WR/TE blend, RB no change. N=1 season; caveats in `draft/audit/sleeper_vs_fp_grade_run_2026-08-18.md`. | 21 (annotated), CORY-ASKS A2 (ruled) |

*(**CORY HAS NO OPEN DECISIONS.** The ADP-sd ratchet — row 6, once listed here as his only one — he ruled on 08-17: *"leave it"*, `CORY-ASKS.md` ③ ✅ CLOSED. Blast radius was one player inside pick 160.)*

---

## 2 · A'S FOUR LIVE DECISIONS, EACH WITH A DEFAULT SO SILENCE IS AN ANSWER

| | decision | recommendation | **default if you say nothing** |
|---|---|---|---|
| **A1** | ✅ **DECIDED 08-18 (A): the E1 fix is REJECTED**, on a ruling already baked in `projections.py:306` — the calibration was fitted on FULL-universe historical ranks, so the full-universe cell read is correct and keeper-lock-invariant; the proposed published-rank key would re-band 46 players at Wednesday's lock for a non-football reason. The nine "misreads" are the ruling working; the on-screen caveat now says so instead of calling them a defect. ~~E1 — nine top-50 players read the wrong dispersion cell.~~ | Ruled, not defaulted — the register row (E1, closed) carries the full reasoning and the caveat rewording. | **Superseded by the ruling** — the fix stays unapplied, now by decision rather than by default, and the sheet's ask is closed. |
| **A2** | ✅ **DECIDED 08-18 (A): SHIPPED** — `dollarGap` now refuses QB-vs-other with the reason on screen, the exact D10a K/DEF shape extended as this row recommended. Register row (5e) closed; suite green. ~~5e — the compare tray's dollar figure is not comparable across positions.~~ | The recommendation was taken as written: refuse the comparison, do not re-price it — re-pricing measured worse on the pairs he actually weighs. | **Superseded by the ship** — the tray refuses cross-position dollar reads, and the briefing sentence (*use the dollar figure within a position*) still stands for everything else. |
| **A3** | ✅ **DECIDED 08-18 (A): NO RESCALE** — a constant tuned to a test is the forbidden move, and the leader gap is structurally 0.000 while a QB tops the price list at every pick. Cory is told in the brief (§4.3): the quiet banner is structural, not a fault to wait out. Register row (4x) closed. ~~4x — the strategy banner will stay silent all night.~~ | The recommendation was taken as written, including the one-sentence tell-Cory, which is in `DRAFT-WEEK-BRIEF.md` §4. | **Superseded by the ruling** — nothing ships, the banner stays quiet, and he has been told rather than left to read silence as agreement. |
| **A4** | ✅ **DECIDED 08-18 (A): CLOSED** — the phone-first order was superseded twice on the record (A's in-flight build spec and relay's desktop-first war-room ruling); the device priority is inverted and B's live order points at the desktop surface. Register row (4d) closed. ~~4d — Cory drafts on DESKTOP; your live order to B says phone-first.~~ | The inversion this row asked for is done and relayed; nothing further hangs on it. | **Superseded by the closure** — desktop is the surface being built for 08-22, which is the outcome the unacceptable default was flagged to force. |

---

## 3 · WHAT IS **NOT** ON THIS PAGE, AND WHY

Everything else open. Named so nobody has to re-derive that it was considered:

- **Real, measured, cannot change a pick before Saturday** — 4p (its own row
  says *do not patch by hand before 08-22*; it feeds ceiling, floor, the bench
  branch and `champodds`) and 2b. **4m and 28 CLOSED 08-18.**
- **✅ E3 / E4 / E5 CLOSED 08-18 AS DORMANT, NOT FIXED.** All three describe
  `opportunity_adj`, and Cory's own `opportunity_cap = 0.0` ruling makes all
  three unobservable: one distinct value across all 696 players, every position
  shifting +0.00000, `proj_mean == proj_sleeper` for 696 of 696. **The formula
  was never repaired — only its amplitude is zero, and `opportunity_z` is still
  computed**, so one config edit restores all three at full strength. They
  therefore became a guard: `opportunity_adj_stays_off.test.js` reds the build
  if the cap is ever non-zero and names the three rows to reopen.
- **✅ TWENTY-ONE ROWS CLOSED 08-18**, against live state rather than the date on
  the line: 1, 2, 3, 4, 4c, E10, 2c, 4k, 4f, 4v, 4x, 4u, 4i, 27, 28, 4m, 5a, 35,
  E3, E4, E5. Reasoning is on each row. Two things worth carrying off this page:
  **4i I got wrong three times** (I kept reading the freeze, which is not what
  feeds the restore button — `draft/baseline/v1.json` is, and it does carry the
  weights); and **E3/E4/E5 are DORMANT, not fixed** — `opportunity_cap = 0.0`
  makes them unobservable but the formula is untouched, so
  `opportunity_adj_stays_off.test.js` reds the build if the cap ever moves and
  names the rows to reopen.
- **Blocked on evidence that does not exist yet** — 21 / 24 / A2 source ruling.
  We have **never measured our model against Sleeper on any season**; the
  promotion bar reads *"beat both NAIVE baselines"* and `api.sleeper.app` returns
  *no route*. The first comparison that can settle it is the January 2027 grade.
  **Hold through 08-22 on judgement, because there is nothing else to hold it on.**
- **Display work owned by B** — **E6** (a caveat that marks the wrong
  players, fixed by E, unreviewed by B — a label change, no number moved).
  ~~4e~~, ~~4i~~, ~~4v~~ and ~~4f~~ **all CLOSED 08-18**: the shortlist caption
  shipped exactly as routed (`.rec-order-note`, 7/7 tests, live-verified on a
  rendered board), the restore button works, the cohort ceilings are marked on
  the board, and BIG BOARD now says *"undrafted"* where it collided with the
  scarcity rail's *"left"*.
- **🆕 SURFACED TODAY, NOT INVENTED TODAY** — 31, E6 and E15 had all been marked
  finished with a ✅ that meant *"fixed, verify"*, and the register's own check
  read any tick as closed, so none of the three was ever chased. E15 is now
  **A5** above; E6 is B's; **31** is yours but genuinely post-draft — D corrected
  the headline edge number in four TERRITORY: A files and offered you a SEND
  BACK, and the ±41.8-point detection floor means a decision is owed on what
  instrument can grade a change that size at all — now ruled: Q15's
  paired-within-room estimand (A, 08-18), D builds the harness. `register_check_was_hiding_rows_2026-08-18.md`.
- **Post-draft by construction** — everything with a recheck after 08-22.

---

## 4 · WHAT CORY SHOULD KNOW ON THE NIGHT

All in `DRAFT-WEEK-BRIEF.md` §4, so they cost nothing if A rules none of the above:

1. **The dollar figure is not comparable across positions.** Use it within one.
2. ~~Cohort ceilings~~ ✅ **shipped 08-18 — the board marks them with `~`.** 34 of
   173 in ADP 25-220. A provenance mark, not a warning. Register 4v.
3. **The strategy banner will stay quiet** — measured, not expected: leader gap
   exactly 0.000 at all twelve picks, unfixable by tuning. Register 4x, closed.
4. 🆕 **The board rates RBs ~50 slots below the market** (p = 0.0024), **and the
   keeper lock closes part of that by itself** — RB replacement falls 33.2 vs
   WR 15.1 / TE 5.8 / QB 4.2. **Do not hand-correct it before Saturday.**
   Registers 2d and 5f.
5. 🆕 **Freeze the board SATURDAY, after 03:00 CDT** — it rebuilds itself
   overnight. Register 5i; runbook corrected.

---

*Kept honest by `draft/tests/test_a_draft_day_decisions.py`: every register id
named here must exist and still be open, and every row in §2 must carry a
default. When a decision lands, strike it here in the same commit.*
