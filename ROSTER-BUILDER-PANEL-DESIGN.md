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

**① K and DEF are excluded, and the reason is worth one line of UI.**
Measured: a kicker is worth **+16.9** and a defence **+22.7** in marginal
lineup value — *permanently*, whatever the roster state, because they fill a
dedicated slot with no competition. Every skill player worth taking beats that.
**So the model never wants one**, and capping them at 1 versus excluding them
entirely produce byte-identical results (+45.8 / +29.3 either way).

Cory: *"I won't draft 2 kickers and 2 def."* One line under the list —
*"K and DEF excluded — worth +17 and +23 all draft; take them at the end"* — is
enough.

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
