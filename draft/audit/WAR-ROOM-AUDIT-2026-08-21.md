# War-room audit — draft eve

**E (red team), 2026-08-21. Driven in a real browser (Chromium via Playwright)
against `draft/tests/rehearsal-serve.js`, logged in as Cory, `/admin/warroom`
at his real state: pick 33, next 48, seat 8.**
**Cory's ask, verbatim: *"is everything worded in a way that isn't misleading!!
I really need to know where the position cliffs are and where the VONA
advantages lie… also everything needs to be correct… Think of better way to
present relevant info… it should be clean looking, professional."***

**Registers 202, 203, 204. For B.**

---

## THE HEADLINE

The war room is **information-rich and mostly correct**. The four VONA cards are
the best thing on the page and they are doing real work. **Three defects reach
Saturday**, and all three land on exactly the two questions Cory asked:

| # | what | why it reaches Saturday |
|---|---|---|
| **202** | the **`gone?` column is blank for all ten top RBs and nine of ten top WRs** | those are the two positions he drafts at 33 and 48 |
| **203** | the roster-builder plan takes **DEF 52 picks and K 27 picks before ADP** | the same screen's own strip says DEF and K are the *cheapest* positions to wait on |
| **204** | **three panels show three different QB waiting-costs — 1.3, 33, 40 — all in points, with nothing on screen distinguishing them** | this is "where do the VONA advantages lie", and the page gives three answers |

---

## 202 · The `gone?` column is empty on RB and WR — and it is not missing data

Left rail, four position lists, each with a `gone?` column. Extracted from the
live DOM, not read off a screenshot:

```
QB   Allen 100% · Jackson 89% · Maye 29% · Burrow 31% · Hurts 11% · Daniels 10% · ...
TE   Bowers 100% · McBride 100% · Loveland 74% · Warren 45% · LaPorta 8% · ...
RB   Gibbs — · Robinson — · McCaffrey — · Taylor — · Cook — · Achane — ·
     Jeanty — · Barkley — · C.Brown — · Hampton —          ← ten of ten blank
WR   Nacua — · Smith-Njigba — · St.Brown — · Lamb — · London — · Jefferson — ·
     Rice 100% · A.Brown — · Collins — · Pickens —          ← nine of ten blank
```

**Cause, proven rather than guessed.** I drove `recommend()` directly at the
same context and compared pool membership to the blank cells: **every blank is a
player `preDraftPool` filtered out, and every filled cell is a player still in
the pool. No exceptions in 24 players checked.**

```
Gibbs 1.0 FILTERED · Nacua 3.0 FILTERED · Lamb 10.1 FILTERED · Hampton 15.1 FILTERED
A.J. Brown 18.1 FILTERED · Collins 20.9 FILTERED · Pickens 21.8 FILTERED
Josh Allen 17.0 IN POOL · Bowers 18.8 IN POOL · McBride 19.9 IN POOL
Rashee Rice 28.1 IN POOL · Lamar Jackson 34.4 IN POOL
```

**Why it is misleading rather than merely empty.** The filter is doing the right
thing — those men will not reach pick 33. But **the UI already owns a way to say
that: `100%`.** Josh Allen says `100%`. Brock Bowers says `100%`. So a reader
learns that `100%` means "certainly gone" and then sees **ten dashes on the
position he is about to draft**. The available readings are "RB data is broken"
and "every one of these is certainly gone", and only the second is true and
actionable.

**And the pattern looks arbitrary from the outside**, which makes the broken
reading more likely: A.J. Brown at ADP 18.1 is blank while Josh Allen at 17.0 is
filled, because the filter is positional (how many at that position go before
33), not a flat ADP cut. That is correct modelling and invisible reasoning.

**Fix, smallest version:** render filtered-out players as `100%` — or as `gone`
— rather than `—`. Reserve `—` for genuinely absent data. One line, and it turns
the most alarming-looking column on the page into the most reassuring.

## 203 · The roster-builder plan takes DEF and K far earlier than the same screen says it should

The panel is titled **"What the roster builder would draft you"** and prints all
twelve picks. Its first six:

| pick | pos | player | ADP | picks before ADP |
|---|---|---|---|---|
| 33 | RB | Breece Hall | 29.8 | 3 |
| 48 | WR | Davante Adams | 54.6 | **7 late — good** |
| 53 | QB | Joe Burrow | 49.8 | 3 |
| **68** | **DEF** | **Houston Texans** | **120.3** | **52** |
| 73 | TE | Kyle Pitts | 72.1 | ~0 |
| **88** | **K** | **Brandon Aubrey** | **115.5** | **27** |

**The contradiction is on the same screen, in the page's own numbers.** The
strike strip directly above says where each position's waiting cost peaks:

```
RB pick 33 costs 35 · WR pick 33 costs 30 · QB pick 133 costs 33
TE pick 53 costs 38 · K  pick 133 costs 17 · DEF pick 133 costs 11
```

**DEF and K carry the two smallest peak costs of all six positions (11 and 17),
and both peak at pick 133.** The plan takes them at **68 and 88** — 65 and 45
picks before the moment the same panel says they start to matter. No modelling
of mine is involved in that sentence; it is two panels on one screen disagreeing.

This is register 129's *"with `ROSTER_SHAPE` on, K and DEF go ~30 picks too
early"* rendered on the surface Cory reads, and register 60's missing
opportunity-cost term is why: the plan scores `+lineup` (marginal lineup value)
with nothing charging it for taking a man 52 picks before the market would.

**What it costs him if he follows it:** picks 68 and 88 are his 4th and 6th
selections. Both positions are available at 108-133 at no measurable cost by the
page's own arithmetic.

**Fix:** either charge the plan an ADP-gap term, or — much cheaper before
Saturday — **label the K/DEF rows as known-early and print the strip's own
peak-cost number beside them**, so the panel says what it is doing instead of
quietly recommending it.

## 204 · Three panels, three QB numbers, one vocabulary

On one screen, at one moment, about waiting on quarterback:

| panel | says | actually means |
|---|---|---|
| QB VONA card | **`VONA 1.3`** — *"neutral — 1 to wait, +17 over the wire"* | VONA from pick 33 to pick 48 |
| strike strip | **`QB pick 133 costs 33`** | the peak waiting cost across all twelve picks, which occurs at 133 |
| RUNNING OUT | **`QB +8 BEHIND wait −40 pts`** | the drop to his next pick under the seat/tier model |

All three are in points. All three are about waiting on QB. **Nothing visible on
the page distinguishes them.** The strike strip's explanation — *"the pick where
waiting on this position costs the most across your 12 picks — not a
recommendation, a fact about the position"* — is real and correct, and it lives
in a **`title=` attribute**, which is a hover tooltip. At 8 seconds a pick,
nobody hovers.

**Two specific wording faults inside this:**

* **`pick 133` reads as a recommendation.** `QB · pick 133 · costs 33` visually
  parses as *"take a QB at 133."* It means *"133 is where QB scarcity peaks."*
* **`BEHIND` is the wrong word for what it computes.** Source: `BEHIND` is
  assigned when *"another position is losing more and fills a seat too"* — an
  **ordering** verdict. Beside `TAKE NOW` and `CAN WAIT`, which are **urgency**
  verdicts, a reader takes `BEHIND` to mean *"your roster is behind at this
  position."* Those are different statements. **`2ND IN LINE` or `OUTRANKED`
  says what the code means.**
* `wait −40 pts` is not plain English. `waiting costs 40` is the same fact in
  the words the cards already use.

## Where the cliffs are — his first question, answered and then buried

He asked for this specifically, and **the page does contain the answer, in the
VONA cards, as one line each:**

```
RB  ▽ cliff — next tier drops 10 pts ▽
WR  ▽ cliff — next tier drops 16 pts ▽
QB  ▽ cliff — next tier drops 3 pts ▽
TE  ▽ cliff — next tier drops 21 pts ▽
```

**That is the cleanest, most actionable thing on the whole page** — four numbers
that rank the positions by what falling off the tier costs, and they say TE (21)
and WR (16) are steeper than RB (10) right now. It sits mid-card, below the
player table, in small type, and uses a **fourth** vocabulary for cost ("next
tier drops N pts") alongside "VONA", "costs", and "wait −N pts".

The dedicated **TIER CLIFFS** panel is in the right sidebar, shows **one position
at a time**, and its caption — *"season pts by RB rank · tier cliff · shaded =
likely gone before your next pick"* — never states where the cliff **is**. It is
a picture of a cliff without a pick number on it.

## The presentation ask — one concrete proposal, not a redesign

He asked for a better way to present the relevant information. **The material is
all already computed.** The proposal is one strip, at the top, replacing nothing:

```
AT PICK 33 — what waiting to 48 costs you, and what falls off

  TE   cliff −21   VONA 31.6   ████████████████████   +79 wire
  WR   cliff −16   VONA 29.8   ██████████████████     +99 wire
  RB   cliff −10   VONA 35.1   ████████████████████   +156 wire
  QB   cliff −3    VONA  1.3   █                      +17 wire
  K / DEF — nothing happens until pick ~133
```

Four rows, one vocabulary, sorted by what he loses. It answers both of his
questions in one glance and it uses numbers the page already has. **Everything
else can stay where it is.**

**Two cheap presentation wins alongside it:**
* **OPPONENTS** is four identical rows reading `Seat 7 / QB RB WR TE K DEF FLEX / —`,
  a full sidebar block carrying nothing until Sleeper names the seats. Collapse
  it to one line until it has content.
* **RECENT PICKS** is a full panel for the words *"No picks yet."* Same.

That is roughly a third of the right sidebar returned to TIER CLIFFS and
SURVIVAL, which are the two panels he actually asked about.

## What I checked and found CORRECT — said explicitly, because a clean bill matters too

* **The keeper-slate banner is right and prominent.** *"Keeper slate not
  confirmed"* in red across the top, with a confirm button. 6 of 10 teams
  designated, 13 keepers withheld. Correct, and it clears at tonight's lock
  (graded as P314).
* **The ranking-source explanation is honest and unusually good.** *"The % on
  each button is how much of your top 200 by ADP that source actually
  projects... Nobody drafts the 681th player"* — that is the right denominator,
  stated plainly, and it pre-empts the obvious misreading.
* **`A plan, not a prediction — it assumes the board drains in ADP order and
  nobody reacts to you.`** Exactly the right disclaimer, in the right place.
* **The MLV stop line is honest to a fault** — *"all 451 remaining players are
  worth exactly 0 to it — it cannot tell them apart"* — and it explains the
  bench rule beneath it. Alarming to read, and true.
* **The wire line is the best sentence on the page:** *"What the wire gives you
  free: QB 322.9 · RB 78.4 · WR 124.8 · TE 130.4 · K 128.6 · DEF 100. A drafted
  man is only worth what he adds ABOVE that. This league drafts ~14 TEs and ~47
  RBs, which is why a late tight end is worth nothing and a late back is not."*
* **The survival column is fixed and player-specific** — verified separately
  today, register 201. The pre-draft collapse Cory reported (sixteen players all
  at 69.25%) is gone.
* **Sourcing footer is present and specific** (FantasyPros half-PPR, FFC
  gap-fill, nflfastR, Sleeper).
* **No JavaScript errors that affect rendering.** The only console noise is
  `[predledger] 7 record(s) UNSENT and parked for replay`, which is the
  prediction-ledger transport, not the board.
* **The page is stable run to run.** I loaded and extracted it three times; the
  RUNNING OUT figures are byte-identical each time. (I had misread `−40` as
  `−48` off the low-resolution screenshot and nearly filed a nondeterminism
  defect — caught by re-running instead of trusting the picture.)

## Method, and its limits

Real Chromium at 1600×1100 against the rehearsal server (throwaway `mkdtemp`
DATA_DIR, seeded owner), never a production auth path. Numbers cross-checked
against `engine.js` and `public/draft_data.json` by driving `recommend()`
directly at the same context.

**Limits, stated:** this is the **pre-draft** state with zero picks recorded, so
every panel that changes once picks land (OPPONENTS, RECENT PICKS, and the
`preDraftPrep` branch behind 202) was audited in one state only. **The `gone?`
defect in 202 exists only in that pre-draft state** — it should resolve the
moment the first pick is recorded, which makes it a *draft-morning* problem
rather than an all-day one, and does not make it less worth fixing: pre-draft is
when he plans.

---

## Addendum, same night — one of my own instruments was wrong, and the audit survives it

Hours after this audit I had to correct **register 201** (yesterday's survival
verification): every survival percentage I published there was **understated**,
because my probe hand-built the engine context and omitted `pickBoard`, `drift`
and `runMultipliers`, which the conservation tilt reads. Live page vs my harness:
Lamar Jackson **11%** vs 5.69, Maye **71%** vs 54.55, Loveland **26%** vs 16.41.
**And the thin context does not merely shrink the column — it reorders it:** mine
put Maye below Burrow; the live page puts Maye above.

**So I re-checked this audit's three findings against the rendered page rather
than the harness, and all three hold:**

* **203** and **204** were read **entirely off the rendered page** — pick, pos,
  player, ADP, the strike strip, the RUNNING OUT row, the three QB figures. No
  harness was involved in either. Unaffected.
* **202**'s *observation* was always from the live DOM (ten dashes on RB, nine on
  WR). Only its *explanation* used the harness, so I re-confirmed the mechanism
  on the rendered page: **the live RB VONA card starts at Josh Jacobs** — Gibbs,
  Robinson, McCaffrey, Taylor, Cook, Achane, Jeanty, Barkley, Chase Brown and
  Hampton are absent from it, exactly the ten players whose `gone?` cells are
  blank. `preDraftPool` filtered them on the live page, not just in my harness.

**The rule I am taking into Saturday: any number that reaches Cory gets read off
the rendered page, never off a probe.** This audit was built that way by
accident of method; register 201 was not, and that is the difference between the
two.

