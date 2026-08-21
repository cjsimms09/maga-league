# War-room audit #2 — after B's changes, with the source toggle exercised

**E (red team), 2026-08-21, draft eve. Real Chromium against
`draft/tests/rehearsal-serve.js`, logged in as Cory, `/admin/warroom`, pick 33 /
next 48 / seat 8. All nine ranking sources clicked and captured.**
**Cory: *"Everything should be correct, everything should change accordingly when
a different source is selected. Also make sure all the wording and tools are as
clear as possible in terms of how to use and apply them to draft."***

**Register 210. For B.**

---

## THE HEADLINE

**B shipped real improvements and one of them is the best thing on the page.**
The source toggle genuinely works — 300–465 lines of the page change per source.

**But four panels do not move, and one of them is VONA — which the new banner
explicitly promises does.** The result is that on two of the nine sources, the
war room gives Cory **two opposite recommendations at once**.

## 1 · The contradiction, measured across all nine sources

| source | RUNNING OUT says | VONA card says (RB WR QB TE) |
|---|---|---|
| Blend 100% | **RB TAKE NOW** −49 | 35.1 29.8 1.3 31.6 |
| Sleeper 100% | **RB TAKE NOW** −42 | 35.1 29.8 1.3 31.6 |
| **ESPN 99%** | **WR TAKE NOW** −48 | 35.1 29.8 1.3 31.6 |
| CBS 97% | **RB TAKE NOW** −61 | 35.1 29.8 1.3 31.6 |
| **Draft Sharks 95%** | **WR TAKE NOW** −43 | 35.1 29.8 1.3 31.6 |
| FFToday 95% | **RB TAKE NOW** −58 | 35.1 29.8 1.3 31.6 |
| FantasyPros 90% | **RB TAKE NOW** −58 | 35.1 29.8 1.3 31.6 |
| **Mike Clay 89%** | **WR TAKE NOW** −49 | 35.1 29.8 1.3 31.6 |
| **Our model 89%** | **TE TAKE NOW** −65 | 35.1 29.8 1.3 31.6 |

**RUNNING OUT responds to the source correctly and completely** — the verdicts
move, the point figures move, and three different positions win under different
sources. That is the panel working.

**VONA is byte-identical under all nine.** So with **Draft Sharks** selected —
the source Cory ruled on for floor/ceiling — one panel says *take a WR* and the
panel beside it says RB carries the biggest waiting cost, **at a Blend number he
did not select**. On **Our model**, RUNNING OUT says TE at −65, the largest
single figure anywhere in the table, while VONA still shows RB 35.1.

## 2 · And the new banner promises exactly the thing that does not happen

B's new banner, verbatim off the page:

> ⚠️ **Ranking on ESPN — VONA, tiers and the recommended player on THIS ENTIRE
> PAGE now reflect only this source, not the blend.** 281 players ESPN does not
> cover are OFF the board right now — they are not gone, just hidden until you
> switch back to Blend.

**It names VONA. It names tiers. It says THIS ENTIRE PAGE.** Measured:

| what the banner names | moves with source? |
|---|---|
| **VONA** | **NO** — 35.1 / 29.8 / 1.3 / 31.6 under all nine |
| **tiers** (the cliff lines) | **NO** — `next tier drops` 10 / 16 / 3 / 21 / 12 / 6 under all nine |
| the recommended player | **partly** — RUNNING OUT moves; the strike strip does not |

**This is worse than silence.** Before the banner, a frozen VONA was an
unmarked defect. Now the page gives Cory an emphatic written assurance that it
moved.

## 3 · The full frozen list

Identical under all nine ranking sources **and** under both settings of the
separate position-boards toggle:

* **VONA numbers** — 35.1 / 29.8 / 1.3 / 31.6
* **the `+N wire` figures** — 155.6 / 99.2 / 17.1 / 78.6 …
* **the cliff lines** — `next tier drops` 10 / 16 / 3 / 21 / 12 / 6
* **the strike strip** — `RB pick 33 costs 35 · WR pick 33 costs 30 · QB pick 133 costs 33 · TE pick 53 costs 38 · K pick 133 costs 17 · DEF pick 133 costs 11`
* **the roster-builder plan** — all twelve picks, same players, same `+lineup`
* **the four left-rail position lists and the `gone?` column**

## 4 · My first probe was broken and the control caught it — recorded per Rule 3e

My first pass reported *"nothing changes under any source"* for every panel.
**That is the exact shape a dead probe produces**, so I ran a known-positive
control before writing a word of it:

```
active before:                  [Blend 100%]     bodyLen 19187
after clicking Sleeper 100%     [Sleeper 100%]   bodyLen 19395
after clicking Our model 89%    [Our model 89%]  bodyLen 19517
after clicking FantasyPros 90%  [FantasyPros]    bodyLen 19613
```

The clicks registered and the page **did** change — my selectors were wrong and
several were returning empty arrays that compared equal trivially. Redone on
full page text, the toggle moves **307–465 lines** per source. **Every "does not
move" claim above is therefore a real negative, not a dead probe** — and it is
measured three independent ways: full-text diff, per-panel regex extraction, and
a direct A/B on the second toggle.

## 5 · What B built, and it is good

**The `Best available, by source` table is the best new thing on the page.** One
row per position, one column per source, disagreement marked — at a glance it
shows Draft Sharks and CBS breaking from the field at RB (Bijan Robinson over
Gibbs) and Draft Sharks/CBS at TE (Trey McBride over Bowers). **That is
decision-useful in the eight seconds he actually has**, and it is exactly the
"where do the sources disagree" question that matters at a pick.

**`TOP AVAILABLE` — per-source top 8 at each position — genuinely re-ranks**, and
its caption says how to use it: *"Showing ESPN's own top 8 available at each
position — switch the Ranking Source toggle above to see a different source's
list. A player ESPN does not cover is left off, not shown at its blend price."*

**The Big Board explanation is the clearest sentence anyone has written here:**

> *"Big Board order: our replacement math on ESPN's projections. They publish a
> ranking we do not hold — we ingested their numbers, not their board — and
> sorting by their raw points instead puts twelve quarterbacks in the top twelve,
> because cross-position points are not comparable."*

That is precisely the "how to use and apply it" register Cory asked for.

**Nine sources instead of five**, with the duplicate named on the button —
`Mike Clay (= ESPN)`. **Two toggles named distinctly.** No page errors. Panels
re-render within 250 ms of a source switch (measured by polling; a screenshot of
mine that appeared to show them missing was a capture artifact, checked and
discarded).

## 6 · Wording that is still unclear

* **`Mike Clay (= ESPN) 89%` claims an equality the board does not honour.**
  Selecting it changes **110 lines** against ESPN, and **every kicker disappears**
  (Aubrey, Dicker, Mevis, Myers, Fairbairn all drop out). The projections are
  the same where both cover; the coverage is not. **`Mike Clay (ESPN's numbers,
  fewer players)`** says the true thing.
* **`slot unverified +2`** sits in the header, is never explained anywhere on the
  page, and **changes with the ranking source** (+2 on Blend, +1 on ESPN). A
  number that moves with an unrelated control and has no legend is noise.
* **The three yesterday's-audit items are unfixed** and all three are wording or
  display, not model: **202** the `gone?` column still blank for all ten top RBs
  and nine of ten top WRs; **203** the roster builder still takes DEF at 68
  (ADP 120.3) and K at 88 (ADP 115.5); **204** still three QB waiting-costs on
  one screen — `VONA 1.3`, `QB pick 133 costs 33`, `QB +8 BEHIND wait −40 pts`.

## 7 · The one change that would settle it

Either **make VONA, the cliff lines and the strike strip follow the selected
source** — which is what the banner already promises — **or narrow the banner to
what is true**:

> *Ranking on ESPN — the board, the top-available lists and RUNNING OUT reflect
> this source. VONA, the tier drops and the twelve-pick plan stay on the Blend.*

**The second is ten minutes and it is honest. The first is the right answer and
is not a draft-eve change.** Given tomorrow, I would ship the narrowed banner
tonight and do the real fix after.

## 8 · Method and limits

Chromium via Playwright against the rehearsal server (throwaway `mkdtemp`
DATA_DIR, seeded owner — never a live auth path). Each source clicked, the
active-button class verified after every click, full page text captured, and
panels compared by exact string. Pre-draft state only (zero picks recorded), so
panels that only populate mid-draft — OPPONENTS, RECENT PICKS — were seen in one
state. **I changed nothing.**

---

## 9 · Addendum, same night — the cause, and a correction to my own framing

Main shipped `draft/tests/source_toggle_moves_vona.test.js` — filed against
Cory's own question, *"Does changing source change VONA as well?"* — and it
**passes 20/20**, asserting *"switching to this source actually MOVES VONA."*

**That guard is sound and my browser measurement is also right. They do not
conflict, and the reason matters more than either of them.**

The guard `require`s `engine.js` and `source_board.js` and computes per-player
VONA directly. **It never loads `app.js` or renders the page.** So it measures
the engine — and **the engine genuinely does recompute VONA per source.**

**The page does not display that, because the VONA cards, the strike strip and
the cliff lines are not computed live at all.** They are read whole from
`public/draft/../position_boards.json`, and that artifact states its own
limitation:

> *"proj/floor/ceiling are Draft Sharks, which **SELECTS and RANKS every list
> here** — that is unchanged. proj_blend/floor_blend/ceiling_blend carry the SAME
> already-selected player's blend numbers … **They never change who is in the
> list or its order**."*

Built `2026-08-21T00:29:00Z`. One source. Twelve picks. The `DRAFT SHARKS /
BLEND` toggle swaps which number is shown for an already-fixed list; the
nine-source Ranking Source toggle does not feed it at all. `RUNNING OUT` moves
because it is computed in the browser from `state.board`.

**So the artifact and the banner contradict each other in writing, and the
artifact is the one telling the truth.** This is not a defect in B's engine
work — the engine is right, and the guard proving it is sound. It is a prebuilt
artifact plus a banner that promises more than the page can deliver.

**Two consequences worth carrying:**

1. **The new guard has a permanent false green.** Being engine-level, it would
   stay 20/20 through every version of this bug. *"Does the source toggle work"*
   cannot be answered without reading the rendered page. **That is the exact
   mirror of the mistake that bit me this morning in register 213 — where my
   hand-built context understated and reordered the survival column — and it is
   worth one line in the guard's own header.**
2. **`position_boards.json` is stamped 00:29Z and the war-room header reads
   `board 4h`.** It must be rebuilt on draft morning, or Cory drafts off a stale
   twelve-pick plan regardless of any of the above.

