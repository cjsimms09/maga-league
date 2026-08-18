# E's eighteenth sweep — which suites grade a board no surface renders

**Session E (red team), 2026-08-17.** Cory's standing instruction after the
Nix/Purdy fix: *"make sure other issues like this dont exist."*

Three of my last four findings were one shape — **an absent or wrong input
reading as a successful one.** The repo has now removed four instances: the
`|| echo "gen_keepers skipped"` in the keeper workflow, `|| undefined` weights in
two suites, and `(player.vorp || 0)` (E17/E18). So this sweep enumerates the
class mechanically instead of by eye.

---

## PART 1 — PRODUCTION FALLBACKS. One live, and it dies on inspection.

Parsed `engine.js`, `composite.js`, `survival.js`, `keepers.js` for
`<board field> || <fallback>` and cross-checked each field against how often it
is actually absent on the live board:

| field | fallback | absent on board | verdict |
|---|---|---|---|
| **`age`** | `peak` | **61** | see below |
| `bye` | `null` | 57 | benign — `null → null` is not a substitution |
| `vorp`, `proj_mean`, `tier`, `tier_drop`, `games_expected`, `replacement`, `adjusted_adp`, `team`, `name` | various | **0** | never fires |

**`age || peak` is the only live substitution, and it reaches nothing that
matters.** The 61 ageless rows are 32 team defences and 2 kickers — where age is
meaningless by nature — plus **27 skill players, of whom 25 carry
`proj_mean == 0.0` and ADPs past 690.** The two with a projection are Lance Mason
(TE, proj 25.1, ADP 420) and Jam Miller (RB, proj 18.9, ADP 465). **Nothing
inside pick 150. Flag dies.**

Worth noting the four *other* readers of `age` all guard correctly —
`engine.js:1130` and `app.js:5806` use `player.age &&`, `verdict.js:122` uses
`!= null`. Only `composite.js:68` and `:104` substitute, and both are keeper-term.

## PART 2 — THE REAL FINDING IS IN THE SUITES

28 suites drive the engine. **Eight never reference `MEASURED_WEIGHTS`**, which
is what `app.js:52` initialises `state.weights` from and what
`surface_contract.test.js` pins. Four of those explicitly score
`E.DEFAULT_WEIGHTS` — a vector where **five of the eight terms differ**, `need`,
`tier`, `risk`, `bye` and `ceiling` all being 0.0 in production and live under
DEFAULT.

### 2a. `ui_fidelity_verdict.test.js` — the one that matters

Its §2 is titled **"REAL ENGINE OUTPUT ON THE SHIPPED BOARD"** and scored
`DEFAULT_WEIGHTS`. Measured across Cory's twelve picks:

- **the verdict WORD differs at 4 of 12**
- **the backed PICK differs at 8 of 12**

| pick | what the suite validated | what the app shows |
|---|---|---|
| **33 — his first** | **LOCK Zay Flowers, gap 14.3** | **TOSS-UP Colston Loveland, gap 0.5** |
| 53 | LOCK Jameson Williams 6.1 | LEAN Sam LaPorta 2.8 |
| 88 | TOSS-UP Brock Purdy 1.6 | LOCK Jordan Mason 6.7 |
| 108 | LOCK Mark Andrews 5.6 | TOSS-UP Jayden Reed 0.8 |

**That pick-33 pair — Zay Flowers against Colston Loveland — is the SAME pair
`rec_rows.test.js` records for the same defect.** The fix landed there and not in
its siblings.

**⚠️ CORRECTION, same day, to a number I published above.** I first reported pick
33's production verdict as *"LEAN Colston Loveland, gap 2.9"*. That was computed
**without `ctx.pickBoard`**, which `app.js:2066` threads into every context it
builds and which `survival.js` uses to convert board-slot to live-selection.
With it threaded the app reads **TOSS-UP Colston Loveland, gap 0.5**. The
headline is unchanged — still 4 of 12 verdict words — and the gap is in fact
wider than I claimed, but the figure was wrong and is corrected here and in the
suite. **The pick board was a second fixture dimension in the same suite, and I
missed it while fixing the first**; it is now threaded too.

**Its assertions were never WRONG**, and I want that stated plainly rather than
inflated: they are self-referential (chip vs engine, both from the same `out`),
so they hold under any weights. What was wrong is the *aim*. It matters here
specifically because **the verdict word is a function of the GAP**, and the
production vector compresses gaps — this arm produced LOCK at 10 of 12 picks and
**never once produced a LEAN**, so the thresholds that decide LEAN vs LOCK on the
board Cory reads were exercised only synthetically.

### 2b. `sanity-sweep.test.js` — the third fixture defect in a file that documents the other two

This file exists to catch *"QB2 in round 9 with a starter rostered"* — **verbatim
the complaint Cory raised live about Bo Nix in the 9th.** It has already
self-corrected twice for this exact class, and says so:

> *"The first sweep drew the BEST available player at every position … That made
> the sweep green while the very bug it was built for (QB2 in round 9) sat in the
> live tool."*
> *"The first version removed only MY roster … That is not a fixture, it is a
> fantasy — and it hid the very bug this file exists for."*

**The third instance was still there: `weights: E.DEFAULT_WEIGHTS`.** A file
written to catch Cory's complaint had never scored the vector that produced it.

**AND CORRECTING IT IS A NEGATIVE RESULT, recorded as one.** On this board **all
four enforced checks pass under both vectors.** The only movement is the reported
open finding: **47 bye-stack recommendations under DEFAULT, 50 under MEASURED** —
coherent, since `bye` is weighted 0.0 in production and so penalises nothing.
**The fixture was wrong; it was not hiding a violation.**

### 2c. `taken_ids_replay.test.js` — latent, fixed anyway

`weights: E.MEASURED_WEIGHTS || E.DEFAULT_WEIGHTS`. Inert today because the
export exists. The **shape** is the defect: rename the export and this silently
scores DEFAULT and stays green. That is what `rec_rows` measured when it happened
for real — the top recommendation differed at 7 of Cory's 12 picks.

### 2d. Checked and CORRECT — not everything with DEFAULT_WEIGHTS is wrong

- `engine.test.js` — `w || E.DEFAULT_WEIGHTS` where `w` is a helper parameter.
  It pins MECHANISMS on synthetic rows, and a mechanism test wants every term
  live. Correct as written.
- `composite_roster_blindness.test.js` — falls back **to** `MEASURED_WEIGHTS`.
- `live_context.test.js` — actively **asserts** the context defaults to the
  measured core and never `DEFAULT_WEIGHTS`. A guard, not a victim.
- `doctrine-governance.test.js`, `update.test.js` — mechanism suites on synthetic
  rows; left alone.

## WHAT SHIPPED

All three fixes **refuse rather than fall back**, following `rec_rows.test.js`:
*"a suite that cannot find the production weights must stop, not guess."*

## WHAT THIS SWEEP DOES **NOT** COVER

1. **It reads `weights` and board-field fallbacks, not every fixture dimension.**
   `sanity-sweep`'s own history shows two other dimensions (roster quality, board
   depletion) that no mechanical scan for `||` would have found.
2. **`roster: []` / `currentKeepers: []` are still widespread** — nine suites pass
   them at every pick. `rec_rows` names this in its own header as a real gap with
   no obvious right value. Not addressed here.
3. **One board.** Every number is the published 682-row board.

### ASK / EVIDENCE / REC / DEFAULT → **A**

```
ASK:      None -- three fixture fixes landed, no production code touched.
          Flagging one judgement for you.
EVIDENCE: ui_fidelity_verdict's "real board" arm disagreed with production at
          4 of 12 verdicts and 8 of 12 backed picks, including LOCK Zay
          Flowers vs LEAN Colston Loveland at pick 33 -- the same pair
          rec_rows records. sanity-sweep, the file built for Cory's Nix
          complaint, had never scored the production vector.
REC:      The judgement is whether `roster: []` / `currentKeepers: []` should
          also be corrected across the nine suites that pass them. I did NOT
          touch it: rec_rows names it as having no obvious right value, and
          inventing a roster for pick 133 is fiction. But it is now the last
          fixture dimension standing between these suites and production.
DEFAULT:  Leave it. Nothing before 08-22, and the three landed fixes change
          no production code.
```
