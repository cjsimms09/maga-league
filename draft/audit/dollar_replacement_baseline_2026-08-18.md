# The war room's money number has no replacement level in it

**Relay, 2026-08-18. Register row 5e. Owner A, recheck 08-20 — four days before
the draft.**

This file exists so A's ruling is a read rather than a derivation, and because
the obvious fix turned out to be worse than the defect. **The second half is the
part worth reading.**

---

## 1. The defect, in one formula

```
playerDollars(p) = DG_HIGH_K x (ceiling - mean) + (DG_ENTRY_K + DG_RS_K) x mean
                   0.22                            0.08          0.05
```

**`p.position` never appears.** It prices RAW PROJECTED POINTS.

Every other value surface in this tool is denominated in points **over
replacement** — the board's own `overall_rank` is VORP — and `draft_data.json`
carries the levels it used in the same file:

| | RB | WR | TE | QB |
|---|---|---|---|---|
| replacement points | 179.3 | 162.6 | 136.4 | **341.72** |

A 10-team **1-QB** league makes QB replacement roughly double every other
position's, because the tenth-best quarterback is a very good football player
and the tenth-best tight end is not. Pricing raw points therefore hands every
quarterback a ~342-point head start nobody else gets.

## 2. What that does on the live 08-18 board

**22 of the top 25 by E[$] are quarterbacks. By the board's own `overall_rank`,
one is.**

The compare tray — the panel headed *"which of these two makes me more money?"*,
which lets Cory search **any two players** — would say:

| the tray says | board rank | the truth |
|---|---|---|
| **"Jaxson Dart +$23"** over Saquon Barkley | 86 vs 15 | Dart projects **13.2 below** the QB replacement line |
| **"Jordan Love +$36"** over Brock Bowers | 93 vs 7 | **19.2 below** |
| **"Bo Nix +$10"** over Bijan Robinson | 75 vs 2 | **6.0 below** |
| **Malik Willis $77.8** vs Bijan Robinson $70.2 | 137 vs 2 | **46.6 below** |

28 players price above the board's own #2 overall. 24 of them are QBs. 14 are
below their own position's replacement level.

## 3. Where it reaches, and where it does not

**THE RECOMMENDATIONS ARE UNTOUCHED.** `recommend()` never calls this; the value
term is VORP. No Python study, replay or benchmark reads it either — the league
benchmark and the 2025 replay headlines are clean.

`playerDollars` reaches exactly three surfaces, all comparison/display:

1. **The compare tray** (`dollarGap`, `app.js:4829`) — §2 above.
2. **The doctrine banner** (`app.js:7872`) — and this is the mechanism behind
   register row 4x. `scoreBoard` scores a doctrine as max-E[$] over its allowed
   pool; the top of the price list is a QB at every pick; so the only
   constraints that can ever bite are the ones forbidding QB. Measured at Cory's
   real keeper base: `late_qb` binds at picks 1-7, `wr_anchor` at 3-4, **nothing
   else ever**, and from pick 8 all nine doctrines return the identical number.
   That predicts which doctrines can speak and when — the earlier sweep only
   observed that they don't.
3. **`doctrinePathKey`** (`app.js:8186`) — the worst of the three, because it
   drives the **"◆ the &lt;plan&gt; branch"** badge on the paths panel, the thing
   Cory reads at 8s/pick to choose a direction. Against the real
   `recommend` + `computePaths` at his actual picks off his actual keepers:

   | his pick | paths offered (best candidate, $) | badge lands on |
   |---|---|---|
   | 33 | QB Jackson **$93** · RB Montgomery $63 · TE Loveland $51 | QB |
   | 48 | QB Maye **$74** · WR Evans $42 · TE LaPorta $37 | QB |
   | 53 | RB Tuten $57 · WR Evans $42 · TE LaPorta $37 | RB |
   | 68 | QB Purdy **$89** · RB Stevenson $55 · WR Washington $42 | QB |
   | 73 | QB Purdy **$89** · RB Monangai $49 · WR Reed $37 | QB |
   | 88 | QB Purdy **$89** · RB Mason $49 · WR Reed $37 | QB |
   | 93 | QB Purdy **$89** · RB Mason $49 · WR Reed $37 | QB |
   | 108 | QB Love **$85** · WR Reed $37 · RB Rodriguez $28 | QB |

   **Seven of eight, and Purdy and Love are both below QB replacement.** One
   real mitigation: under `late_qb` the constraint forbids QB before live pick 8
   and the badge moves. Under `balanced` — the control, and the likeliest
   enrolment — nothing blocks it.

## 4. ⛔ The obvious fix is worse than the defect, and this is the section that changed my recommendation

The natural repair is to re-price the same formula on
`max(0, mean - replacement)`. I built it as a fail arm and it looked decisive:

- top 20 turns from twenty quarterbacks into Jeanty / Cook / Taylor / A.J. Brown
  / Lamar / Pickens / Burrow / St. Brown / Bijan / Lamb …
- median rank delta against the board's own ordering, top 25: **55 slots → 21**

**That comparison was rigged, and not on purpose.** It measured the two
candidate currencies *against each other*, which cannot say which is closer to
the ordering the tool already trusts. The neutral test is each one against
`vorp` — and it reverses on every decision-relevant subset:

| subset (window ADP≤160, K/DEF excluded) | pairs | raw-$ | over-replacement | |
|---|---|---|---|---|
| all cross-position pairs | 7,802 | 33.5% | 32.0% | ~ |
| **a QB on one side** | 2,898 | 51.6% | **42.0%** | better |
| **within 20 ADP of each other** | 1,802 | 40.1% | **41.8%** | ⛔ worse |
| a QB on one side AND within 20 ADP | 667 | 31.9% | **33.1%** | ⛔ worse |
| **NO QB either side** (the control) | 4,904 | 22.8% | **26.1%** | ⛔ worse |

*(% = cross-position pairs where the currency disagrees with the board's own
VORP ordering on who is better.)*

Re-pricing wins **only** on the aggregate QB set, which is dominated by pairs
nobody weighs against each other — an elite quarterback against a fringe
receiver. **Restricted to players Cory could actually be choosing between, it
loses.** And it damages the RB-vs-WR comparison, which is the one he will
mostly use, to repair the QB one.

**The mechanism is visible in the formula.** `boom = ceiling - mean` is
replacement-INVARIANT by construction — `(ceil-R) - (mean-R)` is `ceil-mean` —
so subtracting a level fixes only the mean half. Near replacement,
`max(0, mean - R)` collapses toward zero and hands the whole ranking to a boom
term that is still denominated in raw points, where a quarterback's absolute
spread is roughly twice a receiver's. **A real fix has to re-denominate boom
too. That is a value-model change, not a four-line patch, and it is not
something to attempt four days out.**

## 5. The recommendation, and the default

**RECOMMENDATION — a refusal, never a re-pricing.** Extend the cross-position
guard `dollarGap` already carries for K/DEF (A's own D10a ruling,
`engine.js:3239`, *"would compare two constructions"*) to any comparison
involving a QB, with the reason on screen. Same pattern, same function, ~4
lines, no model change, and it leaves within-position and RB/WR/TE comparisons
untouched — which §4 says is exactly what must be left alone.

**DEFAULT IF NO RULING BY 08-20: nothing ships**, and Cory gets the paragraph
already written into `DRAFT-WEEK-BRIEF.md` §4 — *the compare tray's dollar
figure is not comparable across positions; use it within a position*, plus the
two other surfaces it leaks into. A sentence he can act on beats a change nobody
ratified.

## 6. What is pinned, and what to delete when it is fixed

`draft/tests/dollar_replacement_baseline.test.js` — **27 checks, 8 controls,
0.5s.**

- **§1** is structural and permanent: two players identical but for position
  price identically, while their VORP differs by the gap between the levels.
  Keep it forever.
- **§2, §3, §5** are CHARACTERIZATION of the defect. They go red when the fix
  lands. **Delete them in that commit rather than relaxing them.**
- **§4** is the QB-vs-non-QB scoping measurement — keep, it justifies the shape
  of the fix.
- **§6** is the block that stops the good-faith re-pricing. **Keep it even
  after the refusal ships**, because the re-pricing idea will occur to the next
  person exactly as it occurred to me.

## 7. Two things I got wrong on the way here, recorded rather than tidied away

**(a) My own row 4x numbers.** The probe behind `120.600 / 96.400 / 63.780`
passed `dollarsOf = p => p.vorp` and `roster: []`; the app passes
`E.playerDollars(p).total` and `state.myRoster`. Four of the nine
`LIVE_CONSTRAINTS` read the roster, so an empty one binds a different set — I
reported `hero_rb` and `robust_rb` binding when, with Henry and Walker kept,
**neither ever does**. Correct scores: **$93.18 / $75.47 / $70.85**. The
conclusion survives and hardens: the leader gap is 0.000 at all fifteen of
Cory's picks, so no rescale of the `$4` band can fix it.

**(b) A control that failed and was right to.** Raising `proj_mean` by 1 with
`proj_ceiling` held fixed *lowers* the price — slope exactly
`-DG_HIGH_K + DG_ENTRY_K + DG_RS_K = -0.09`, because boom shrinks faster than
the mean terms grow. Checked before calling it a second defect: **no board
player has a ceiling below their mean** (ratio min 1.038, median 1.445), and
along the ray a real player moves on, the price rises. The control was asking a
question the board never asks; it now scales both.
