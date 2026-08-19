# PANEL DESIGN — "Roster builder model says"

**From A, 2026-08-19. For B.** Draft Saturday 08-22. Mailbox file → `main`.

> Cory: *"it needs to be clear what player model is recommending and why and I
> still want to retain my current view. So maybe a spot that's says roster
> builder model says and then the player"*

---

## 1. THE ONE RULE THIS PANEL MUST OBEY

**It is a SECOND VOICE. It never replaces, reorders, or annotates his board.**

His existing per-position view stays exactly as it is. This is a labelled box
that says what a different model thinks and why, so he can disagree with it in
one glance. If a reader could mistake this for the board's own recommendation,
the design has failed.

---

## 2. WHAT IT LOOKS LIKE

```
┌─ ROSTER BUILDER MODEL SAYS ──────────────────────────────┐
│                                                          │
│  1  Jahmyr Gibbs          RB   ADP 1     +245.9          │
│     takes your open FLEX seat                            │
│                                                          │
│  2  Bijan Robinson        RB   ADP 2     +238.3          │
│     takes your open FLEX seat                            │
│                                                          │
│  3  Puka Nacua            WR   ADP 4     +158.9          │
│     fills your open WR slot                              │
│                                                          │
│  ─────────────────────────────────────────────────────   │
│  points added to your STARTING LINEUP, not to your roster │
│  K and DEF excluded — see §5                             │
└──────────────────────────────────────────────────────────┘
```

**Three rows is enough.** He has his own board for depth; this is a second
opinion, and a long list stops reading like one.

**The four fields, in priority order if space is short:**

| field | why it earns the space |
|---|---|
| **name + position** | the answer |
| **the WHY string** | the *point* of the panel — Cory asked for "and why" explicitly |
| **marginal** | the size of the claim, so he can see 245 vs 16 |
| ADP | only so he can tell a reach from a value; drop this first |

---

## 3. WHERE THE DATA COMES FROM

`public/js/draft/mlv.js` — pure function, no state, safe to call on every pick:

```js
RosterBuilderMLV.recommend(board, roster, { league, topN: 3 })
// → [{ player, position, marginal, why }, ...]
```

- `board` — available players (must carry `position` and `proj_mean`)
- `roster` — what Cory currently holds, same shape
- `public/mlv_recommend.json` — a **pre-draft snapshot**, so you can render the
  panel before wiring live roster state. **If Friday is tight, render this
  static and skip the live recompute; it still answers his ask.**

---

## 4. THE "WHY" STRINGS — do not rewrite them

The module derives them from what actually changed in the lineup, never from a
template. The full set:

- `fills your open <POS> slot`
- `takes your open FLEX seat`
- `starts at FLEX over your current flex`
- `starts over your <POS><n>`
- `bench only — he does not crack your lineup`

**The last one is the most valuable string on the panel** and must not be
filtered out — it is the model saying "this man does not help you", which is
exactly the disagreement Cory wants to be able to see.

---

## 5. TWO THINGS TO SHOW, NOT HIDE

**① ⚠️ CORRECTED 2026-08-19 — K AND DEF ARE ***NOT*** EXCLUDED, AND THIS
SECTION PREVIOUSLY TOLD YOU TO RENDER THE OPPOSITE OF WHAT THE MODULE DOES.**
Register 134. **Do not ship the old footer line.**

What the module actually does: **`K ≤ 1` and `DEF ≤ 1`, a cap, never an
exclusion.** It will recommend a kicker and a defence — and once Cory's starting
lineup is full it recommends them **at the top of the panel**. Verified against
the live board at a round-9-ish board state:

```
  1  Houston Texans     DEF   +22.7   fills your open DEF slot
  2  Denver Broncos     DEF   +18.3   fills your open DEF slot
  3  Brandon Aubrey     K     +16.9   fills your open K slot
```

**That is the model's honest position, not a bug.** Under Cory's skill-not-luck
grading a bench body's marginal lineup value is **exactly zero**, so once nine
starting slots are filled a kicker who fills the tenth beats the best skill
player left. On the harness the arm that does exactly this takes K at its
**round-9 pick in 30 of 30 seat-years** and still beats the humans in all three
seasons (+45.8 / +29.3).

**And the two options Cory asked about are NOT the same.** The earlier claim that
they were came from an arm that crashed on every invocation; the real numbers:

| | actual | skill | K | DEF | legal |
|---|---|---|---|---|---|
| **hard cap at 1** (what ships) | **+45.8** | **+29.3** | 1.00 | 1.00 | 30/30 |
| exclude entirely | −83.7 | −211.3 | 0.00 | 0.00 | **0/30** |

Excluding them costs two starting slots every week for seventeen weeks.

**The footer line to render instead:**
*"K and DEF capped at one. Once your lineup is full they top this list — a bench
player is worth zero to this model, a kicker in an empty slot is worth +17."*

**And one honest limitation, worth a second line if there is room:** this model
**cannot value a bench at all**. Six of fifteen roster spots score zero marginal
value and fall through to best-available. It is a starting-lineup optimiser, and
Cory should read it as one.

**② The evidence, honestly, in a tooltip or a footer.**
`RosterBuilderMLV.EVIDENCE` carries it. The short version:

> Only arm to beat the humans in **all three seasons on both gradings**
> (+45.8 actual / +29.3 skill, 30/30 legal, register 132). **Against our own
> shipped board the gain is weak** (t 1.02, an upper bound). Beats the humans
> convincingly; beats our own board only weakly.

**Do not put a confidence badge on this panel.** The honest statement is a
sentence, not a colour.

---

## 6. WHAT NOT TO DO

- **No cross-position sorting anywhere else on the page** because of this panel.
  Marginal lineup value *is* cross-position comparable; VONA is not (P196), and
  the two must not be mixed in one column.
- **Do not feed it raw projections.** The module scores **surplus over the
  wire** internally. Fed raw points it recommends quarterbacks at +415 and a
  kicker above Puka Nacua — that error was caught in testing and is now inside
  the module. Pass players; let it do the valuing.
- **Do not let it write to the board, the roster, or any pick.** Report only.

---

## 7. DEFAULT AND DATES

**If you build nothing else, build §2 from the static JSON.** Three rows, four
fields, two footer lines.

**Recheck 08-20. Nothing ships after Friday 08-21 6pm.** If it is not done by
then it waits until after the draft — a half-built second opinion on draft night
is worse than none.

**Questions to A.** Every number above is measured and I can point at the
artifact for any of it.
