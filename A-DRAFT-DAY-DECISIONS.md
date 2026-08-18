# WHAT ACTUALLY HAS TO BE DECIDED BEFORE 22 AUGUST

**Relay, 2026-08-18. One screen. This is a TRIAGE, not a ruling — A can overrule
any line of it, and the register remains the record.**

Cory, twice this week: *"too much finding and not enough fixing and following
up."* The register has **73 open rows**. Twenty of them carry a recheck date on or
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
| ~~**C1**~~ | ✅ **RULED 08-18 — "Keepers will be set by 08/21 at 6pm".** The banner's date was right; the fifteen files were wrong. **Root cause fixed, not just the date:** `league_config.json` now carries `keepers.deadline` as the single source, guarded against the nightly rebuild. B is unblocked to ship. | *nothing further* | **42** ruled, P71 graded FALSE |
| **C2** | **The `ceiling` composite weight.** | Three preregistered runs, two independent seed sets: every value 0.15–0.65 beats the shipped zero, 3/3 separable. **It is held at zero through the draft on purpose** — the no-change rule was fixed in all four preregs before any produced a number. **So this is a decision for AFTER 08-22**, and it is here only so it is not forgotten. Blast radius is late-round bench ordering, not the board. | **5**, brief §7b |

*(The ADP-sd ratchet, row **6**, also sits with Cory. Blast radius one player;
recommendation unchanged: leave it, revisit post-season. No action needed.)*

---

## 2 · A'S FOUR, EACH WITH A DEFAULT SO SILENCE IS AN ANSWER

| | decision | recommendation | **default if you say nothing** |
|---|---|---|---|
| **A1** | **E1 — nine top-50 players read the wrong dispersion cell.** Band assignment uses a rank that disagrees with the band the calibration was fitted on. Worth **$47.6** of spread between St. Brown and Jefferson. Re-measured today on the live board: it reproduces, **9 misreads, 4 in the top 50**, and the direction is named. | **The fix is already written and deliberately not applied** — `E1_proposed_fix_for_approval_2026-08-17.md`, two edits, the first inert until passed. Approve or reject; it is the only prepared fix on this page. | **Not applied.** Cory drafts on the misread cells. |
| **A2** | **5e — the compare tray's dollar figure is not comparable across positions.** It would tell him *"Jaxson Dart +$23"* over Saquon Barkley. **22 of the top 25 by E[$] are QBs; by the board's own rank, one is.** | **Refuse the comparison, do not re-price it.** Extend your own D10a K/DEF refusal to QB — ~4 lines, no model change. **Re-pricing was built and measured and is WORSE on the pairs he actually weighs** (`draft/audit/dollar_replacement_baseline_2026-08-18.md`). | **Nothing ships.** The briefing already carries the sentence he needs: *use the dollar figure within a position.* This default is genuinely acceptable. |
| **A3** | **4x — the strategy banner will stay silent all night.** The leader gap is **0.000 at all fifteen of his picks**, so no rescale of the `$4` band can help. The row's implied fix does not follow. | **Do not rescale.** Tell Cory in one sentence which doctrines can produce a banner at all. It is also a symptom of A2 — the top of the price list is a QB at every pick, so only QB-forbidding constraints can ever bite. | **Nothing ships**, and the banner is quiet. Acceptable **only if he is told**, or he will read silence as agreement. |
| **A4** | **4d — Cory drafts on DESKTOP; your live order to B says phone-first.** `7ee6f993`, 16:06 08-17, specifies *phone-first* and *the 390px column*; the assumption dates to 08-13 and was reasonable until he said otherwise. | Invert the device priority, keep the rest of the order. Already relayed to B. | Desktop is the surface that must be right on 08-22, and the order still points elsewhere. **This default is the one I would not accept.** |

---

## 3 · WHAT IS **NOT** ON THIS PAGE, AND WHY

Everything else open. Named so nobody has to re-derive that it was considered:

- **Real, measured, and cannot change a pick before Saturday** — 4p (the ceiling
  ratio is backwards by band; its own row says *do not patch by hand before
  08-22*, it feeds ceiling, floor, the bench branch and `champodds`), 4m
  (measured; my own recommendation there was **withdrawn** — lowering
  `CEILING_LATE_FROM` changes nothing), E3, E4, E5, 2b, 2c, 28.
- **CLOSED 08-18 against live state, not against the date on the line** — rows
  E10 (its check run on the fresh board; its parent row 2 resolved on the same
  run), 1 (board publishes: `built_at 2026-08-18T05:33:24Z`, 696 players), 3 (its own
  named test passes on the fresh board), 4 (`matchup_placed_bet` 6/6,
  `trashtalk` 27/27) and 4c (board-truth 11/11, including the control that
  keepers really do consume picks) — plus row 2 **RESOLVED**: the
  constant-multiple sweep was run on the fresh board and no field has joined,
  while finding 13 real pairs, so it is not vacuously green.
- **⚠️ ONE I GOT WRONG AND WITHDREW** — 4i. I had told A its premise was false
  and offered to close it. It is not: `engine_policy` is absent from the freeze,
  so `app.js:782` renders the restore panel not at all. Re-scoped, still B's,
  still open.
- **Blocked on evidence that does not exist yet** — 21 / 24 / A2 source ruling.
  We have **never measured our model against Sleeper on any season**; the
  promotion bar reads *"beat both NAIVE baselines"* and `api.sleeper.app` returns
  *no route*. The first comparison that can settle it is the January 2027 grade.
  **Hold through 08-22 on judgement, because there is nothing else to hold it on.**
- **Display work owned by B** — 4i, 4v (mark the fifteen cohort-constant
  ceilings), 4e, 4f.
- **Post-draft by construction** — everything with a recheck after 08-22.

---

## 4 · THE THREE THINGS CORY SHOULD KNOW ON THE NIGHT

Already written into `DRAFT-WEEK-BRIEF.md` §4, so they cost nothing if A rules
none of the above:

1. **The dollar figure is not comparable across positions.** Use it within one.
2. **Fifteen ceilings in his range are cohort averages** — Nabers (ADP 28),
   Garrett Wilson (41), Jayden Daniels (57), Jayden Reed (110) among them. For
   five of those the model is **deliberately refusing to guess**, which is a
   strength; the mark should read *"no 2025 weeks — cohort average"*.
3. **The strategy banner will stay quiet.** That is structural, not a fault to
   wait out.

---

*Kept honest by `draft/tests/test_a_draft_day_decisions.py`: every register id
named here must exist and still be open, and every row in §2 must carry a
default. When a decision lands, strike it here in the same commit.*
