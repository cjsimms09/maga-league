# WHAT ACTUALLY HAS TO BE DECIDED BEFORE 22 AUGUST

**Relay, 2026-08-18. One screen. This is a TRIAGE, not a ruling — A can overrule
any line of it, and the register remains the record.**

Cory, twice this week: *"too much finding and not enough fixing and following
up."* The register has **64 open rows** — a number that was itself wrong until today: the check reported 72, and three of the missing rows were being hidden by a ✅ that meant *"fixed, verify"* (`register_check_was_hiding_rows_2026-08-18.md`). **Thirty** of them carry a recheck date on or
before 08-22 and most are owned by A. That is not a decision list, it is a
backlog wearing one, and reading it four days out costs more than it returns.

So every open row was put to a single question — **can this change a number on
Cory's screen on 22 August?** — and the answer is *no* for most of them. What
follows is what survived.

---

## 0 · THE ONE THING THAT MUST HAPPEN, AND IT IS NOT A DECISION

**Rebuild the board after the keeper slate confirms.** Register **35**: the
board publishes without its upstream inputs and *nothing triggers the rebuild* —
it happened twice on 08-18 alone. Separately, the live board is standing on a
**"predicted"** slate today: 4 of 10 teams designated, **8 keepers across 3 teams
deliberately withheld** (`_keeper_map_for_board`, Cory's own 08-11 ruling).

Until that rebuild happens, **every replacement level, VORP and ADP adjustment on
the war-room board is computed over a pool containing players nobody can draft.**

Tracked mechanically, so it is not left to memory: commitment
`slate-exposure-rechecked` (due 08-20) reads the live board and reports NOT MET
while the slate is partial. It will show **OVERDUE on 08-21** if the board is
still on a partial slate.

> ⚠️ It may shout one day early — the lock date is itself open (below). If Cory
> rules 08-21, **move the date with that reason; do not silence the check.**

---

## 1 · CORY'S RULINGS — ONE DOWN, ONE POST-DRAFT

| | what he decides | why it cannot wait / can | register |
|---|---|---|---|
| ~~**C1**~~ | ✅ **RULED 08-18 — "Keepers will be set by 08/21 at 6pm".** Root cause fixed, not just the date: `league_config.json` carries `keepers.deadline` as the single source, guarded against the nightly rebuild. B unblocked. | *nothing further* | **42** ruled, P71 graded FALSE |
| **C2** | **The `ceiling` composite weight.** | Three preregistered runs, two independent seed sets: every value 0.15–0.65 beats the shipped zero, 3/3 separable. **It is held at zero through the draft on purpose** — the no-change rule was fixed in all four preregs before any produced a number. **So this is a decision for AFTER 08-22**, and it is here only so it is not forgotten. Blast radius is late-round bench ordering, not the board. | **5**, brief §7b |

*(The ADP-sd ratchet, row **6**, also sits with Cory. Blast radius one player;
recommendation unchanged: leave it, revisit post-season. No action needed.)*

---

## 2 · A'S FOUR LIVE DECISIONS, EACH WITH A DEFAULT SO SILENCE IS AN ANSWER

| | decision | recommendation | **default if you say nothing** |
|---|---|---|---|
| **A1** | **E1 — nine top-50 players read the wrong dispersion cell.** Band assignment uses a rank that disagrees with the band the calibration was fitted on. Worth **$47.6** of spread between St. Brown and Jefferson. Re-measured today on the live board: it reproduces, **9 misreads, 4 in the top 50**, and the direction is named. | **The fix is already written and deliberately not applied** — `E1_proposed_fix_for_approval_2026-08-17.md`, two edits, the first inert until passed. Approve or reject; it is the only prepared fix on this page. | **Not applied.** Cory drafts on the misread cells. |
| **A2** | **5e — the compare tray's dollar figure is not comparable across positions.** It would tell him *"Jaxson Dart +$23"* over Saquon Barkley. **22 of the top 25 by E[$] are QBs; by the board's own rank, one is.** | **Refuse the comparison, do not re-price it.** Extend your own D10a K/DEF refusal to QB — ~4 lines, no model change. **Re-pricing was built and measured and is WORSE on the pairs he actually weighs** (`draft/audit/dollar_replacement_baseline_2026-08-18.md`). | **Nothing ships.** The briefing already carries the sentence he needs: *use the dollar figure within a position.* This default is genuinely acceptable. |
| ~~**A3**~~ | ✅ **RESOLVED 08-18 — NO DECISION NEEDED.** 4x asked you to re-derive `DG_NOISE_BAND` so the banner could fire. **Measured through the banner's own scoring function at Cory's twelve real picks: the leader gap is EXACTLY 0.000 at all twelve**, and from pick 88 all nine doctrines return one score. **No value of the band changes that** — the switch test is strictly greater-than, so it fails even at zero. | **Nothing to rule.** Row closed. The band is deliberately untouched: it also sets `recommend()`'s even-money confidence class, so moving it for a banner that stays silent anyway would change what Cory reads at every pick, for nothing. | *n/a — the sentence you were asked to tell him is now in `DRAFT-WEEK-BRIEF.md` §4, with the measurement, so the "acceptable only if he is told" condition is already met.* |
| **A4** | **4d — Cory drafts on DESKTOP; your live order to B says phone-first.** `7ee6f993`, 16:06 08-17, specifies *phone-first* and *the 390px column*; the assumption dates to 08-13 and was reasonable until he said otherwise. | Invert the device priority, keep the rest of the order. Already relayed to B. | Desktop is the surface that must be right on 08-22, and the order still points elsewhere. **This default is the one I would not accept.** |
| **A5** | 🆕 **E15 — the QB over-recommendation Cory hit LIVE is fixed, unreviewed, and was marked closed.** At pick 88 the engine promoted Bo Nix over Brock Purdy — **14.5 projected points worse** — and called it *"on upside"*, when the only thing making Nix's ceiling bigger was `QB` band 9-16 carrying a **1.426** multiplier against band 4-8's **1.316**. A calibration constant, not a player. **It was invisible to `register_recheck_check.js` until today** — its status wore a ✅ that meant *"fixed, verify"*, and the check read any tick as closed (`register_check_was_hiding_rows_2026-08-18.md`). | **Review and accept, or say what else you want measured.** E's fix is verified as far as E can verify it: score inversions **16 → 0**, JS **315/315**, war-room rehearsal 19/19, board-truth 6/6, and two existing controls that legitimately inverted were **re-aimed rather than deleted**. Both guards **self-release** — the tiebreak resumes the day `proj_ceiling` carries per-player information — so neither is a permanent suppression. | **The fix stays in, unreviewed.** That is probably fine and it is not nothing: it changes which player the engine recommends at a real pick, it was written by the lane that found it, and no owner has read it. **Cory drafts on this engine on Saturday.** |

---

## 3 · WHAT IS **NOT** ON THIS PAGE, AND WHY

Everything else open. Named so nobody has to re-derive that it was considered:

- **Real, measured, and cannot change a pick before Saturday** — 4p (the ceiling
  ratio is backwards by band; its own row says *do not patch by hand before
  08-22*, it feeds ceiling, floor, the bench branch and `champodds`), 4m
  (measured; my own recommendation there was **withdrawn** — lowering
  `CEILING_LATE_FROM` changes nothing), 2b, 28.
- **✅ E3 / E4 / E5 CLOSED 08-18 AS DORMANT, NOT FIXED.** All three describe
  `opportunity_adj`, and Cory's own `opportunity_cap = 0.0` ruling makes all
  three unobservable: one distinct value across all 696 players, every position
  shifting +0.00000, `proj_mean == proj_sleeper` for 696 of 696. **The formula
  was never repaired — only its amplitude is zero, and `opportunity_z` is still
  computed**, so one config edit restores all three at full strength. They
  therefore became a guard: `opportunity_adj_stays_off.test.js` reds the build
  if the cap is ever non-zero and names the three rows to reopen.
- **✅ SEVENTEEN ROWS CLOSED 08-18**, against live state rather than the date on
  the line: 1, 2, 3, 4, 4c, E10, then — after Cory's *"we work through, we don't
  park things for tomorrow"* — 2c, 4k, 4f, 4v, 4x, 4u, 4i, 27, and E3/E4/E5.
  Reasoning lives on each row; three things are worth carrying off this page:
  - **4i I got wrong three times** before getting it right. I kept reading
    `pre_draft_freeze_2026.json`, **which is not what feeds the restore button** —
    `state.frozenBaseline` comes from `/admin/api/baseline?version=v1`, served
    from `draft/baseline/v1.json`, which **does** carry
    `engine_policy.MEASURED_WEIGHTS`. It works. `restore_measured_core_works.test.js`
    now names BOTH files so the substitution cannot recur.
  - **E3 / E4 / E5 are DORMANT, not fixed.** All three describe
    `opportunity_adj`; Cory's `opportunity_cap = 0.0` makes them unobservable
    (one distinct value across 696 players, every position +0.00000,
    `proj_mean == proj_sleeper` 696/696). **The formula is untouched and
    `opportunity_z` is still computed**, so one config edit restores all three at
    full strength — hence `opportunity_adj_stays_off.test.js`, which reds the
    build if the cap moves and names the rows to reopen.
  - **4x cannot be fixed by tuning.** The doctrine leader gap is exactly 0.000 at
    all twelve of Cory's picks, so no `DG_NOISE_BAND` makes the banner speak.
- **Blocked on evidence that does not exist yet** — 21 / 24 / A2 source ruling.
  We have **never measured our model against Sleeper on any season**; the
  promotion bar reads *"beat both NAIVE baselines"* and `api.sleeper.app` returns
  *no route*. The first comparison that can settle it is the January 2027 grade.
  **Hold through 08-22 on judgement, because there is nothing else to hold it on.**
- **Display work owned by B** — **4e** (the shortlist is ordered by the engine's
  composite, not by the number printed beside it; the only safe fix left is a
  caption, and it is B's card) and **E6** (a caveat that marks the wrong
  players, fixed by E, unreviewed by B — a label change, no number moved).
  ~~4i~~, ~~4v~~ and ~~4f~~ **all CLOSED 08-18**: the restore button works, the
  cohort ceilings are marked on the board, and BIG BOARD now says *"undrafted"*
  where it collided with the scarcity rail's *"left"*.
- **🆕 SURFACED TODAY, NOT INVENTED TODAY** — 31, E6 and E15 had all been marked
  finished with a ✅ that meant *"fixed, verify"*, and the register's own check
  read any tick as closed, so none of the three was ever chased. E15 is now
  **A5** above; E6 is B's; **31** is yours but genuinely post-draft — D corrected
  the headline edge number in four TERRITORY: A files and offered you a SEND
  BACK, and the ±41.8-point detection floor means a decision is owed on what
  instrument can grade E1 at all. `register_check_was_hiding_rows_2026-08-18.md`.
- **Post-draft by construction** — everything with a recheck after 08-22.

---

## 4 · THE THREE THINGS CORY SHOULD KNOW ON THE NIGHT

Already written into `DRAFT-WEEK-BRIEF.md` §4, so they cost nothing if A rules
none of the above:

1. **The dollar figure is not comparable across positions.** Use it within one.
2. ~~**Fifteen ceilings in his range are cohort averages**~~ ✅ **SHIPPED 08-18 —
   the board marks them now, so he does not have to be told.** 34 of 173 in ADP
   25-220; the range bar carries `~` and *"cohort average, not this player"*.
   A provenance mark, not a warning. Register 4v.
3. **The strategy banner will stay quiet** — measured, not expected: the leader
   gap is exactly 0.000 at all twelve of his picks. Structural, and unfixable by
   tuning. Register 4x, closed.

---

*Kept honest by `draft/tests/test_a_draft_day_decisions.py`: every register id
named here must exist and still be open, and every row in §2 must carry a
default. When a decision lands, strike it here in the same commit.*
