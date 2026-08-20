# THE WAR ROOM, AS CORY ACTUALLY WANTS IT

<!-- TERRITORY: A wrote this from Cory's 2026-08-20 statement of intent; the
     SURFACE is B's. This is a brief, not a layout: it says what each thing must
     answer and what would make it a lie. B owns how it looks. -->

**Cory, 2026-08-20, verbatim:**

> "we need to make sure the war room is doing what I intend which is to be able
> to switch between different sources to see their rankings, VONA, who they
> recommend based on our models.. I will be making final decision, what I need
> model to do is give me all the options and tell me what all the sources
> think… conceptually this is what I want... While also giving me other things
> to look for floor vs ceiling, stacks, predicted availability, needs of other
> rosters still, VONA or value cliffs and at what round, where players are at
> depth chart, player ages, identify rookies or potential high upside players
> relevant at that pick.. think about what I'm conceptually looking for"

## THE ONE SENTENCE

**He is the decider. The war room's job is to lay out the full option set and
report what every source thinks about it — not to hand him one answer.**

Every design question below resolves against that sentence. A panel that
collapses the option set to a single name is working against him. A panel that
dumps everything undifferentiated is also working against him, because at eight
seconds a pick an unranked wall is the same as no information.

## WHAT MUST BE TRUE BEFORE ANY OF IT IS WORTH BUILDING

Three surfaces showed Cory players who were already drafted on 2026-08-20, and
they had **three different causes**:

| surface | cause |
|---|---|
| Roster Builder | `mlv.js` had no concept of a drafted player at all |
| ~20 app.js reads | each read `state.board` directly; one stale write reached all |
| Position boards (left rail) | renders a **pre-simulated** per-pick snapshot, never a live filter |

All three are fixed. The lesson is the design constraint:

> **AVAILABILITY IS ONE FACT AND MUST HAVE ONE OWNER.** Any panel that shows a
> player must derive availability from the same place, or it will eventually
> disagree with the panel next to it. Pre-computed artifacts are allowed — they
> are how we afford the analysis — but a pre-computed list must be INTERSECTED
> with live truth at render, and any number derived from the simulated pool must
> say so on its face.

Cory's own words: *"War room needs to know who's been taken, who's available,
and needs to work seamlessly."* That is a correctness precondition, not a
feature. **Nothing below ships on a pool that has not passed it.**

## THE SOURCE SWITCH — WHAT IT MUST ACTUALLY DO

Today the toggle re-ranks the board (rankings, VONA, tiers, recommended player)
by recomputing replacement level from one source's numbers through the same
`vorp.apply_vorp` the real board uses. That half is right and should not be
rebuilt.

What is missing is the half Cory is asking for: **not "show me Draft Sharks'
board" but "show me what each source thinks about THIS player, side by side."**

Those are different questions and both are wanted:

- **Switch mode** — the whole board becomes one source's opinion. Already built.
- **Compare mode** — one player, every source's view of him at once.

⚠️ **THE TRAP, MEASURED.** The four sources are **not on one points scale**:
median ratio to the blend is Draft Sharks 1.04, FantasyPros 1.01, Sleeper 0.96,
our model **0.79** (p10 0.38). Register 107 established this and it was
re-measured 2026-08-20. **Any side-by-side that shows raw projected points will
report a level offset as disagreement.** Compare on **rank** (overall or
positional) — scale-free, and "is he WR13 or WR55" is the question anyway.

**And weight disagreement by how often each source dissents.** Measured on the
live board: our model is the lone dissenter on **63 of 83** cases (29.6% of
judged players); Draft Sharks on **3** (1.4%). "Our model disagrees" is
therefore nearly uninformative and "Draft Sharks disagrees" is worth reading. A
flag that fires on a third of the board is decoration.

*(A standalone panel for this was built and removed the same day at Cory's
instruction — "takes up way too much room". The lesson is placement, not
subject: this belongs INSIDE the player click-in, where he has already asked a
question about one man, not as a permanent column competing for the board.)*

## THE DECISION SURFACE — WHAT HE NEEDS AT A PICK

Ordered by how often it changes a pick, which is the only ordering that earns
screen space:

1. **The option set, ranked, with the price of each.** Not one name. Several
   directions with what taking each costs in what survives to his next pick.
2. **What every source thinks of those options** — rank per source, and whether
   they agree.
3. **VONA / value cliffs, and WHICH ROUND the cliff falls in.** He asked for the
   round explicitly. "RB drops 27 points between round 6 and 7" is actionable in
   a way "VONA 27" is not.
4. **Predicted availability at his next pick.** Already computed; must be
   labelled as ADP-drain simulation, not truth.
5. **Floor vs ceiling** — as a shape, not two more numbers. Note the measured
   fact that the fat right tail in his range is almost entirely handcuff RBs
   (Singleton 3.54x, Bigsby 3.47x): a fat ceiling on a workhorse means something
   different than on a backup, and the surface should not flatten that.
6. **What the other nine rosters still need.** Drives who actually survives.
7. **Roster context for the player** — depth-chart position, age, rookie status,
   stack relationships with players he already holds.

Items 1–4 are decision inputs at THIS pick and belong on the main surface.
Items 5–7 are qualifiers on a specific player and belong in the click-in, one
tap deep — they matter after he has narrowed to two or three names, not while
he is scanning.

## THE RULES THAT KEEP IT HONEST

These are not style preferences. Each is a defect this repo has already paid
for, and every one of them was live in the last week.

1. **Absence is never agreement.** A player two sources cover is not a consensus
   pick. Thin coverage gets its own mark, never silence.
2. **A number without its scope misleads.** "Draft Sharks 247" was a true count
   over all 700 board players and read as a broken source; over the top 200 it
   is 94%. Every count states what it is over.
3. **A flag that fires on everything is decoration.** Weight by base rate or do
   not show it.
4. **Say which source a number came from, on the number.** A panel asserting a
   source it is not using is the worst failure available here, because Cory
   cannot see it.
5. **Pre-computed is fine; pre-computed-and-unlabelled is not.** If a value came
   from a simulation, the surface says so the moment the real draft diverges.
6. **Silence is a legitimate signal.** The default state of most marks is
   nothing at all.

## SCOPE

`league_config.draftable_scope` — Cory: *"We really just need to focus on top 200
players maybe 250."* `drafted` = 150 (teams × rounds, derived), `focus` = 200,
`outer` = 250. Every count, coverage figure and list obeys it. Reporting over all
700 is what made a 94% source look like a 35% one.

## WHO OWNS WHAT

- **B** — the surface: layout, hierarchy, what is on the main view vs one tap
  deep, and the compare-mode design. Cory's "clear, professional, clean, with as
  much data as possible" is a surface judgement and it is B's call.
- **A** — the data contracts behind it: availability having one owner, the
  source-comparison numbers being rank-based and base-rate weighted, scope,
  and the Sleeper sync being correct.
- **Cory** — every draft decision. The tool never picks for him.
