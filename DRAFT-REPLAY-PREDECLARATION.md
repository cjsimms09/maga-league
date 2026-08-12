# TERRITORY: C
# REPLAYING OUR OWN THREE DRAFTS — PRE-DECLARATION, WRITTEN BEFORE THE RUN

**Cory asked for this to be pre-declared, as F7's verdict and the crosswalk rate were.
Everything below is written before a single number is computed.** If a prediction here
turns out wrong it stays, with the result beside it.

---

## THE HEADLINE, STATED FIRST BECAUSE IT CHANGES THE EXERCISE

**The tool arm is not constructible for 2023, 2024 or 2025. The tool's inputs for those
seasons do not exist, anywhere.**

`DraftEngine.recommend()` consumes a board: projections, ADP, ADP standard deviation,
tiers, consensus ranks. Measured:

| what a 2023–25 replay needs | what exists |
|---|---|
| season ADP | `adp_series.json` — **2026-08-09 → 2026-08-11 only** |
| season projections | `proj_series.json` — 5 snapshots, **all 2026**, source FantasyPros |
| a season board | `public/draft_data.json` — **built 2026-08-11**, 8 revisions, oldest **2026-08-10** |
| an older board in git history | **the repository's first commit is 2026-08-08** |
| archived boards elsewhere | `master_sheet_archive.json` holds money and standings, not boards |

And Route 1 — the search for a dated historical board — closed today with zero captures
serving a board across 18 registered targets.

**The only substitute available for a missing projection is realized points, and using it
would turn the tool into the oracle.** That is not a weakened version of the test; it is
the test inverted into the most flattering possible shape, which is precisely the failure
mode Cory named in handing this to C rather than A.

**So I am not running the tool arm, and I am not approximating it.** Building a
strawman 2023 board out of prior-season points and calling `recommend()` on it would
measure `recommend()`'s behaviour on a board we would never ship — a number that reads
like an answer and is about nothing.

**Is the remaining exercise weaker than it sounds? Yes, and materially.** The comparison
Cory says he most wants — *of the value sitting on the board at each of my picks, what
fraction did the tool take* — cannot be computed. What can be computed is the same
question with **Cory** in the tool's place, which measures the size of the prize rather
than the tool's share of it.

---

## WHAT I WILL RUN, AND WHAT EACH ARM IS

Three rosters, not four, over 2023–2025, in Cory's seat (roster_id **1**, `coryjsimms`).

1. **ACTUAL** — what Cory drafted. From `league_history.json` picks.
2. **NAIVE, SHAPE-BLIND** — Cory asked for "best available by public ADP". **Public
   historical ADP does not exist** (above), so the substitute is **NEXT-OFF-THE-BOARD**:
   at each of Cory's picks, take the still-available player with the lowest actual
   `pick_no` — the room's own revealed ordering at that moment. It ignores roster shape
   entirely, which is the property Cory wanted. **It is NOT public ADP and will never be
   labelled as such**; it is contaminated by the room's reaction to Cory's real picks and
   is a weaker instrument than public ADP would have been.
3. **ORACLE** — at each of Cory's picks, the still-available player with the highest
   REALIZED points for that season.

**Keeper picks are excluded from all arms.** A keeper is not a decision, and scoring one
as a choice would credit or blame every arm for the same fixed rows.

**The counterfactual construction, stated exactly.** Only Cory's picks change; every
other owner's picks are held at what they actually were. So a player Cory really took is
**still available** to a counterfactual arm at his later picks, and a player another
owner took is gone at the pick they really took him. That is the stated fiction, and its
boundary is below.

---

## THE CAVEATS, BEFORE THE RESULT

**1. Training-data contamination — now mostly MOOT, and I will not pretend otherwise.**
Cory asked how much it matters. With no tool arm, there is no margin to be inflated. Had
the tool run, the contamination would have been worse than the framing suggests: not only
were Cory's drafts in the weight tuning, but *any* board constructible for 2023–25 would
have to be built from data postdating those seasons. The contamination would not have
been a bias of unknown size; it would have been total.

**2. Three seasons is three observations on points, and far more on shape.** These are
different questions with different power and I will report them apart. A points margin
across three drafts is nearly uninformative — three numbers, high variance, no
significance available and none will be claimed. **Roster shape resolves sharply**: if
an arm ends without a TE in all three years, that is visible.

**3. The room reacted, so this is valid for the board and not for the season.** Route 2
closed on exactly this. **This replay is valid for measuring what was takeable from the
board as it stood at each of Cory's picks. It is not valid as a claim about the season
that would have followed** — every pick after the first divergence would have moved the
room. The per-pick gap is the honest unit; the roster totals are a sum over a fiction and
are reported as such.

**4. A limitation of my own points source, named up front.** League `players_points`
covers only players **on a roster that week**, so a drafted player who was cut mid-season
has his later weeks missing, and an undrafted breakout has no points at all. That biases
the ORACLE **downward** — it cannot see value it should. If the nflverse path is
reachable I will use realized stat lines scored through our own table instead, and I will
say which source produced the numbers.

---

## PREDICTIONS, MADE BLIND

- **P1. The oracle beats actual by a very large margin — 40%+ on total realized points.**
  Perfect hindsight over ~150 players is an enormous edge and this is close to a
  certainty; it is stated so the number has something to be checked against, not because
  it is interesting.
- **P2. The oracle's advantage SHRINKS substantially on starting-lineup points versus
  total points.** A points-maximising, shape-blind arm should load RB/WR and leave K, DEF
  and possibly QB/TE unfilled. **I predict the oracle fails to fill at least one starting
  slot in at least 2 of 3 seasons.**
- **P3. The gap is NOT uniform across rounds. I predict the ABSOLUTE gap is largest in
  the earliest non-keeper rounds and declines monotonically**, because that is where the
  oracle can take the season's top scorers outright.
- **P4. The gap is concentrated in a few picks: the top 3 picks by gap account for MORE
  THAN 50% of the total gap**, in at least 2 of 3 seasons.
- **P5. Next-off-the-board finishes BELOW actual on starting-lineup points in at least 2
  of 3 seasons** — Cory's shape-awareness should beat a shape-blind arm, but by a modest
  margin, not a large one.
- **P6. Next-off-the-board leaves a starting-slot hole in at least 1 of 3 seasons**,
  since nothing in it fills positions.

**What would falsify the exercise's usefulness rather than a single prediction:** if the
oracle's per-round gap is flat AND unconcentrated (P3 and P4 both wrong), then there is no
specific round or decision to attack, and the honest conclusion is that draft-day value
capture has no addressable structure in our room — which is a real finding and a negative
one.
