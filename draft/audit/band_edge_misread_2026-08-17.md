# E's first sweep — the dispersion cell nine players read is not the cell they sit in

**Session E (red team), 2026-08-17. Draft is 08-22.**
Swept: `public/draft_data.json` on `origin/main` — built `2026-08-16T14:10:12Z`,
682 players. That is the board Cory drafts from today. Every number below is off
that file; the same nine rows reproduce identically on
`origin/claude/fantasy-football-research-926y6z`.

**What E does and does not do.** Everything here is a question with a number
attached. E raises; A rules. No measurement is overridden anywhere in this file,
and where a number is a legitimate measurement that merely *looks* wrong, it is
labelled as such rather than argued with.

---

## FINDING 1 — 🔴 THE ONE THAT MOVES MONEY TODAY

### Nine players read another band's floor/ceiling, because the rank that picks the cell counts three players who are not on the board

`draft/projections.py:270-289` (`blend`) picks each player's calibration cell
from his within-position rank, and the module states the invariant itself:

> *"The rank MUST be the same ordering `vorp.assign_tiers` later writes as
> `pos_rank` (proj_mean desc within position) — the calibration was fitted on
> that band definition and a different rank here would read the wrong cell."*

**The published board violates that invariant for nine players.** Comparing the
band each row's own `variance_why` records against the band implied by that row's
own published `pos_rank`:

| | pos_rank | should read | actually reads | proj_floor | proj_ceiling |
|---|---|---|---|---|---|
| Chase Brown | RB8 | 4-8 | **9-16** | 134.10 | 427.50 |
| Javonte Williams | RB15 | 9-16 | **17-32** | 50.09 | 404.52 |
| D'Andre Swift | RB16 | 9-16 | **17-32** | 49.80 | 402.50 |
| Jordan Mason | RB31 | 17-32 | **33+** | 3.20 | 225.40 |
| Kyle Monangai | RB32 | 17-32 | **33+** | 3.10 | 214.30 |
| Amon-Ra St. Brown | WR3 | 1-3 | **4-8** | 171.16 | 455.29 |
| Justin Jefferson | WR8 | 4-8 | **9-16** | 115.37 | 311.21 |
| Tetairoa McMillan | WR16 | 9-16 | **17-32** | 82.80 | 310.60 |
| Alec Pierce | WR32 | 17-32 | **33+** | 8.20 | 222.50 |

All nine sit exactly on a band boundary. Nobody in the interior of a band is
affected.

### The cause, verified rather than guessed

`blend()` receives `players + kept_players`. The board publishes `players` only —
Cory's three keepers are withheld (`keeper_slate.withheld_from_board`). Those
three are **Ja'Marr Chase (WR, 295.09), Derrick Henry (RB, 274.16) and Kenneth
Walker (RB, 256.70)**, and they are ranked ahead of the field they no longer
appear in, pushing everyone below them one or two slots deeper.

Re-deriving every band from a rank computed over `players + kept_players`:

```
530 of 530 banded rows match.  0 do not.
```

The same re-derivation against the published `pos_rank` misses exactly the nine
above. **The cause is settled, not hypothesised.** It is also the defect class
already found and fixed once in this repo — `build.py` attached own_v6 *before*
the activity prune, and the fix was to move the attach after it (ROUTES, 08-16,
round 3). `blend()` was never given the same treatment.

### What it does to the football

Adjacent players separated by a rounding error in projection are separated by a
band's worth of dispersion:

| pair | Δ projection | Δ floor | Δ ceiling |
|---|---|---|---|
| Josh Jacobs (RB14) → **Javonte Williams (RB15)** | **0.0 pts** | **−60.0** | +53.6 |
| Ashton Jeanty (RB7) → **Chase Brown (RB8)** | −1.5 pts | **−67.8** | −1.1 |
| George Pickens (WR7) → **Justin Jefferson (WR8)** | −0.3 pts | **−39.4** | **−100.5** |
| J.K. Dobbins (RB30) → **Jordan Mason (RB31)** | −1.0 pts | −33.8 | −73.6 |
| Marvin Harrison (WR31) → **Alec Pierce (WR32)** | −1.6 pts | −60.2 | −34.3 |

**Josh Jacobs and Javonte Williams carry the identical projection — 214.0 — and
floors of 110.1 and 50.1.** No football fact separates them; a keeper does.

And the top of the WR board reads backwards. **Amon-Ra St. Brown carries the
highest WR ceiling on the board, 455.29** — 105 points above Jaxon Smith-Njigba,
who projects 8.7 points *more* than him, and 69 above Puka Nacua, who projects
36 more.

### Blast radius, in dollars

The composite `ceiling` weight is 0, so this does **not** move composite rank.
It moves two things that are on screen anyway:

- `engine.js:3010` — `playerDollars`' `boom = proj_ceiling − proj_mean`, priced
  at `DG_HIGH_K = 0.22`. Dollar figures and every `dollarGap` comparison.
- `engine.js:1217`, `:1293` — the bench branch ranks on `proj_ceiling −
  proj_mean` in raw season points.

Repricing the nine at the band their own `pos_rank` implies, holding the
measured multiplier table fixed:

| | $ now | $ at correct band | Δ |
|---|---|---|---|
| Amon-Ra St. Brown | 76.6 | 51.0 | **+25.6 overpriced** |
| Justin Jefferson | 47.2 | 69.2 | **−22.0 underpriced** |
| Javonte Williams | 69.7 | 57.9 | +11.8 |
| D'Andre Swift | 69.4 | 57.6 | +11.7 |
| Jordan Mason | 35.4 | 51.2 | −15.8 |
| Kyle Monangai | 33.7 | 48.7 | −15.0 |
| Tetairoa McMillan | 49.8 | 41.2 | +8.6 |
| Alec Pierce | 33.8 | 40.8 | −7.0 |
| Chase Brown | 70.6 | 70.3 | +0.3 |

**$47.6 of spread between St. Brown and Jefferson alone**, two players Cory
chooses between in the first two rounds. Note where that lands: Jefferson is the
exact player Cory said the board had wrong. The VORP arithmetic behind that
complaint was correct (register 21) — but Jefferson is *separately* being
suppressed on both tails here, and this one is not arithmetic working as
intended.

### It gets worse on 08-20, not better

The shift is a function of how many players are withheld. `keeper_slate` today:
`teams_designated: 4/10`, and **`withheld_from_board: {teams: 3, keepers: 8}`** —
eight further keepers whose designations exist but are not yet applied. When the
slate confirms at keeper lock (08-20), those leave the board too, the rank shift
grows, and a different set of players crosses the boundaries. **The board changes
under Cory two days before he drafts, for a reason that is not football.**

### ASK / EVIDENCE / REC / DEFAULT → **A**

```
ASK:      Should blend() rank over the published board population
          (players only) rather than players + kept_players?
EVIDENCE: 9 named rows above; cause reproduced 530/530 with 0 exceptions;
          $47.6 of dollar spread between St. Brown and Jefferson; the
          invariant is declared in projections.py's own comment.
REC:      A rules on which population is correct. I am NOT asserting that
          "players only" is right — the calibration was fitted on some
          population and only A knows which. What I am asserting is that
          the board violates an invariant its own module declares, and
          that the answer must be the same on both sides of the fix.
DEFAULT:  NO DEFAULT — BLOCKED. Cory can act on these dollar figures
          today, and the population changes again at keeper lock on 08-20.
```

Rule 3d, answered on this finding rather than asserted:
1. **Did the input vary?** Yes — 20 populated (position, band) cells, multipliers
   0.008–1.890.
2. **Did it arrive?** Yes — 530 of 682 rows carry a measured band; the nine are
   inside that 530, not among the 152 that fall back.
3. **Could the check have fired?** The re-derivation over `players + kept_players`
   matches 530/530 while the re-derivation over `pos_rank` misses exactly 9 — two
   populations, different answers, so the test discriminates.

---

## FINDING 2 — the ceiling multiplier is not monotonic, and this one survives fixing Finding 1

Read off the board itself, `proj_ceiling / proj_mean` per cell:

| pos | 1-3 | 4-8 | 9-16 | 17-32 | 33+ |
|---|---|---|---|---|---|
| QB | 1.230 | 1.316 | 1.426 | 1.484 | 1.094 |
| RB | 1.721 | 1.635 | 1.640 | **1.890** | 1.434 |
| WR | 1.296 | **1.740** | 1.318 | 1.506 | 1.317 |
| TE | 1.462 | 1.309 | **1.647** | **1.704** | 1.092 |

`proj_floor / proj_mean` is a single value per cell, exactly; so is
`proj_ceiling / proj_mean`, `proj_sd / proj_mean` and `weekly_sd / proj_mean`.

**Correcting all nine bands from Finding 1 does not remove the inversions.**
Counting pairs in the top 32 at each position where a lower-projected player ends
up with a *higher* ceiling, after correction: **QB 78, WR 81, TE 53, RB 31.**

- **CeeDee Lamb (WR4, 252.3) → corrected ceiling 439.1**, against **Puka Nacua
  (WR1, 297.9) → 386.0.** The WR4 outranks the WR1 on upside by 53 points.
- **George Kittle (TE9, 152.8) → 251.7** against **Travis Kelce (TE8, 156.9) →
  205.3.** One rank apart, 46 points of ceiling.
- **Trevor Lawrence (QB9, 343.4) → 489.6** against **Drake Maye (QB3, 367.8) →
  452.3.**

**This is a question, not a verdict, and the distinction matters.** A genuinely
measured p90 *can* be non-monotonic — elite players are more certain, so a WR1's
p90/mean being tighter than a WR5's is a real football claim and I am not
overruling it. What I am flagging is the *step*: the constant is applied as an
unsmoothed 5-step function of rank, so the model asserts that WR3 and WR4 differ
in upside by 34% of their projection while WR4 and WR8 differ by 0%. The cliff at
the boundary is an artifact of banding whatever the underlying curve is, and the
board shows it to Cory as a per-player ceiling.

**To A, with a default.** This is the same family as register 8b (two ceiling
constructions read as one field), and it is a ruling about construction, not a
defect I can name a fix for.

---

## FINDING 3 — a starting QB projected 322.5 points is shown a floor of 2.45

**Jordan Love**, `pos_rank` QB17, band QB|17-32:

```
proj_mean 322.52   proj_floor 2.45   proj_ceiling 478.70
proj_floor_source "measured-2023-25-p10"   depth_chart_order 1   injury_status null
```

The QB|17-32 floor multiplier is **0.008**, and QB|33+ is **0.000** — Deshaun
Watson, Shedeur Sanders, Carson Beck and Kirk Cousins all carry `proj_floor 0.0`.
RB|33+ is 0.021, TE|33+ 0.030, WR|33+ 0.049.

This is displayed. `app.js:10059` renders `Projection 323 (floor 2, ceiling 479)`
in the Why? panel — the number Cory reads at the moment of a pick.

**The measurement is probably right and the label is probably wrong, which is why
this is a truth finding and not a maths one.** A p10 of 0.008 over "QBs ranked
17-32 in preseason projection" is believable *for that population*, because the
population mixes starters who busted with players who never took a snap. It is
not believable for the specific named QB1 on his depth chart with no injury
status. The board is showing a population statistic in a per-player field, and
the field name says otherwise.

Register 8c already says every `proj_floor` consumer was calibrated against the
pre-08-17 distribution and has not been re-checked. This adds the display
surface to that row's scope: even if no consumer moves, the number is on screen
next to a player's name.

---

## TWO SMALL ONES, LABELLED AS SMALL

- **A stale citation, `app.js:682`:** *"floor and ceiling are `mean × (1 +
  z·variance)`, so they scale with the mean exactly."* That is the pre-08-17
  Gaussian construction; since 08-17 they are measured p90/p10 per cell. The
  *conclusion* still holds by accident — they are still `mean × a cell constant`
  — but the stated reason is a construction that no longer exists. Brief §5 names
  this class as one that resisted gating and is caught only by reading. It was.

- **`DRAFT-WEEK-BRIEF.md` §3c is out of date on its own headline.** It says the
  board on `main` is *"built 2026-08-15T17:52:22Z, 677 players."* `origin/main`
  today carries **2026-08-16T14:10:12Z, 682 players** — presumably moved by the
  `be528c64` merge. The freeze may well still be real; the figure quoted for it
  is not current, and that file is the entry point every session is told to trust.

---

## ONE THING I CHECKED AND CLEARED — recorded so nobody re-runs it

**The dispersion family still reads as a within-cell constant multiple of
`proj_mean`, and that is KNOWN, not new.** Running the project's own detector on
the published board (`constant_multiple_sweep.py`, self-test passes — known
positive caught in 10 cells) reports `proj_ceiling`, `proj_floor`, `proj_sd` and
`weekly_sd` all constant against `proj_mean` inside cells. That reads alarming
against brief §2's "WHAT IS FIXED", but `test_constant_multiple_sweep.py`'s
`KNOWN_PARTICIPANTS` names all four explicitly and its docstring says the quiet
part out loud: *"Not 'the board is clean' — it demonstrably is not."* The 08-17
fix corrected **which** constant each cell uses (measured p90/p10 rather than a
symmetric Gaussian); it did not, and did not claim to, restore per-player
information. That is brief §7 item 1, `weekly_volatility.py`, still open and
correctly gated to after 08-22.

**Flagging it anyway for one reason:** brief §1 defines the defect as
`proj_mean × a per-band constant`, and brief §2 lists the fix under "WHAT IS
FIXED". A reader who takes those two paragraphs at face value will believe the
board now carries per-player dispersion. It does not. The code is honest and the
brief is the thing that reads as more fixed than it is.

`MIN_CELL = 12` also means the sweep cannot see cells `1-3`, `4-8` or `9-16` at
any position — 2 to 8 rows each. **The detector is structurally blind to the top
16 players at every position**, which is the top 50 overall and the picks that
decide the season. Stated as a limit, not a bug: the threshold is defensible on
its own terms (three players who happen to line up is not evidence). It just
means "the sweep is green at the top of the board" is not a claim anyone can
make, and Finding 1 above was found by reading, not by the tool.

---

## ROUTING

| finding | to | why |
|---|---|---|
| 1 — band-edge misread | **A**, `NO DEFAULT — BLOCKED`, and the relay in the same breath | Live dollar figures, changes again at keeper lock 08-20. Rule 3e escape hatch. |
| 2 — non-monotonic ceiling multiplier | **A** | A construction ruling, adjacent to register 8b. |
| 3 — deep-band floors | **A** | Extends register 8c to the display surface. |
| brief §3c figure, `app.js:682` citation | relay | Record-keeping, not draft-critical. |

**Not routed to B.** Finding 3 touches the Why? panel, but B is mid-redesign and
blocked on Cory's screenshots; per `ROUTES.md → TO: E`, truth defects only until
the redesign ships, and this one's fix lives in the number, not the surface. It
goes to B when the redesign lands if the number is still what it is.

---

## WHAT THIS SWEEP DID NOT COVER

- The **fresh** 693-player board, which is what register rows 2 and 3 are about.
  I swept the *published* 682-row board, because that is what Cory drafts from.
  Building a fresh one needs egress this session does not have (Sleeper/FFC).
  **Rows 2 and 3 are therefore untouched by this file and still open.**
- The war room as a surface. Held per sequencing.
- K and DEF beyond noting they are `gaussian_z` throughout (73 rows) with a
  single `proj_sd / proj_mean` value of 0.38 across all 32 DEF — consistent with
  register 8b, which already owns it.
