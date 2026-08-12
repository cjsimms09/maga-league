# Three answers: what B and C need, where the rules do not reach, and what would make us faster

**Asked by Cory 2026-08-12.** Answered from the system, not proposed. Two of the
three answers are smaller than the question expected, and one premise is wrong.

---

## 1 · THE SINGLE HIGHEST-VALUE THING — and your suspicion is right in shape, wrong in target

**THE SCHEMA REGISTRY ALREADY EXISTS. C BUILT IT. FOR ONE SOURCE.**

`draft/backtest/mfl_schema_probe.py` does precisely what you described: fetches a
real response, commits the **observed shape** — key paths, types, cardinality,
redacted example values — and the adapter is written against what the source
actually returns rather than what its author remembers. Its own header names the
failure it exists to prevent: *"the external replay harness's first cut declared
'survival' and 'room_seat' as ledger kinds because the contract was restated from
memory instead of read."*

So the answer is not "build a schema registry". It is **"generalise the one that
works"** — and per your own instruction, do not rebuild what already works.

**BUT THE TARGET IS WRONG, AND THIS IS THE USEFUL CORRECTION.** Take your five
instances and ask which a per-EXTERNAL-SOURCE schema would have caught:

| instance | producer | would a source schema have caught it? |
|---|---|---|
| `fetched_at` / `failed_at` mixup | **ours** | no |
| the archive wrapper | **ours** | no |
| the `run_screen` tuple | **ours** | no |
| `draftUnit` as a list | **ours** | no |
| epoch seconds into an ISO-expecting function | **ours** | no |

**Five for five are INTERNAL seams.** Every one is a consumer written against a
shape *we* emit. A registry of Sleeper's and FantasyPros' field shapes would have
caught none of them.

**THE THING THAT IS ACTUALLY MISSING is a committed shape sample per PRODUCER at
each cross-lane seam** — internal producers included — derived from a real
emitted value, with a test that fails when the producer drifts.

**And that pattern also already exists, once.** `draft/tests/context_interface.test.js`
asserts *engine reads ⊆ app supplies* — a real seam, guarded, and it is the
enforcement cell for rule 11f. It has never been generalised to the seams B and C
consume.

**COST, and I am costing the generalisation rather than a new system:**

| | |
|---|---|
| identify the real cross-lane seams | ~1h — there are about five: the artifact `draft_data.json` (B and C both read it), `src/sleeper.js`'s exports (B), the ledger payload shapes (B), `league_history.json` (B), the Lab's JSON outputs (C) |
| capture a real sample per seam + shape-describe it | ~2h, reusing C's `describe()`/`merge_shapes()` verbatim |
| one drift test per seam | ~2h |
| **total** | **~5h, post-draft** |

**IS IT WORTH DOING? YES, AND HERE IS THE HONEST QUALIFIER.** The guards do NOT
catch enough — five instances in a week, every one found by accident, is the
evidence. But the reason to do it is narrower than "prevent shape bugs": it is
that **a consumer in another lane cannot test against a producer it does not
own**, and a committed shape sample is the only artifact that crosses the
territory boundary without violating it. That is the class of friction you asked
about — B and C build workarounds because the canonical thing is not reachable,
and a shape file is reachable by anyone.

**What it would NOT fix:** semantic drift where the shape is stable and the
meaning moves (epoch-vs-ISO is a *type* catch, but `fetched_at` vs `failed_at`
have identical types and a schema would pass both). Roughly two of the five.

---

## 2 · THE RULES THAT DO NOT REACH — and the pattern is exactly the one you predicted

**Read straight off the enforcement table, which is the right instrument: a rule
with a TEST applies wherever the test runs; a rule with only a TRIGGER applies
wherever somebody remembers.**

**THE RULES WITH TESTS DO REACH ALL THREE LANES**, because the tests live in
`draft/tests/` and run in CI over the whole repository — rules 2, 4, 6, 6a, 11,
11f, 14 all bite on B's and C's code as much as mine.

**THE RULES WITH ONLY TRIGGERS ARE THE ENTIRE GAP, and they cluster:**

| rule | what it governs | which lanes need it | who applies it |
|---|---|---|---|
| **11e** own-query boundary | a negative about a source is checked against my query | **all three** | C, systematically. B and I, not |
| **13** provider construction | every part of a request you chose is part of your query | **all three** | C. B consumes Sleeper, I consume FantasyPros — neither applies it |
| **13f** manufactured null | a null matching the hypothesis you held | **all three** | mine six times this week; C's four; B's untested |
| **13g** misread null (new) | a correct instrument read wrongly | **all three** | C found the pattern; nobody else has looked |
| 12 output sanity | the number could not be true | all three | trigger exists, artifact does not |
| clause B negative-result memory | disproven ideas do not return | all three | nothing |

**THE SPECIFIC UNEVENNESS YOU PREDICTED IS REAL AND IT IS THIS: THE ENTIRE 11e /
13 / 13f / 13g FAMILY IS ABOUT CONSUMING SOMETHING YOU DID NOT WRITE, AND ALL
THREE LANES DO THAT, BUT ONLY C HAS BEEN APPLYING THEM.**

The reason is visible in where they were written: they came out of C's probes, so
they read as being *about providers*, and B and I both consume providers without
recognising ourselves in the text. **I proved that this week by hitting 13f six
times** — the survival power table with 0.0% false positives in every cell, the
sensitivity arm whose staleness check could never fire, the correlation
experiment with a per-decision random sign. Every one was mine, in my lane, from a
rule I had read.

**WHAT IT WOULD TAKE, and it is not more rules:**

1. **One line in each lane's own file.** The family exists in `SESSION-A.md`.
   B and C read `TERRITORY.md`. **A pointer in TERRITORY.md saying these four
   clauses govern every lane, not the Lab** — 15 minutes, and it is the whole fix
   for reach. A rule nobody in that lane has read cannot fire.
2. **13g's trigger written where negatives get reported** — *state what the
   instrument would have shown if the thing were present* — which is the report
   template, not a test.
3. **Nothing else.** Rule 9: the gap is distribution, not content.

---

## 3 · WHAT WOULD MAKE EACH OF US FASTER — and one premise is wrong

### C — a known-answer control, and it is cheap

C's four false results in a day were all the same shape: **the probe ran, returned
an absence, and the absence was about the probe.** That is now clause 13g, and the
clause's own trigger is the reusable thing — but it is a habit, not a harness.

**The mechanical version: every probe carries a POSITIVE CONTROL — one input
known to be present — and reports both.** A probe that cannot find the thing it is
known to contain has diagnosed itself before it reports on the world. ~1h to add
to C's probe scaffold, and it converts a twenty-minute wasted run into a
twenty-second one. **This is the single cheapest item in this document.**

Is it irreducible? No. Undocumented systems make the *first* probe expensive; they
do not make the *fourth misread* inevitable.

### B — do not automate the driving. Automate the getting-there.

B's manual, headless, one-state-at-a-time surface walks have found more severe
defects than every audit combined, and **what makes that work is that a human is
looking at a rendered thing without knowing what to expect.** Automating the
looking destroys exactly that: an assertion can only fail on a condition somebody
already imagined, which is the opposite of how those defects were found.

**What IS automatable is the setup** — getting the app into week 14 with a
specific roster and a specific ledger state takes B most of the time and finds
nothing. A state-seeding fixture (`?seed=playoff-week-tie`) would give B more
walks per hour without touching the part that works.

### Me — **the premise is wrong: deploys are already automatic**

`netlify.toml` publishes on push to `main`, and `.github/workflows/deploy-verify.yml`
polls `/api/version` until it reports the pushed commit and **fails loudly** if it
never does. Nobody presses anything.

**The serialisation is INTEGRATION, not deploy** — merging B's branch to main. And
it is already down to one lane, because C self-integrates.

**So the answer to "should deploys become automatic on green CI" is: they are, and
the thing to ask instead is whether B should self-integrate like C.** My read:
**yes, on the same terms** — C's path works because `integrate.sh` refuses a dirty
tree and the territory check is per-lane, and neither of those is specific to C.
What breaks if B self-integrates: nothing mechanical. What I would lose is the
incidental review that catches cross-lane shape mismatches — which is exactly what
answer 1 proposes to replace with something that does not depend on my attention.

**Those two are the same decision** and should be taken together: shape files
first, then B self-integrates.

---

## THE THREE, IN ONE LINE EACH

1. **A committed shape sample per producer at each cross-lane seam**, generalising
   C's `mfl_schema_probe` and my `context_interface` test. ~5h, post-draft. Worth
   it — but for reaching across the territory boundary, not for catching type
   bugs, and it would have caught roughly three of your five.
2. **The 11e/13/13f/13g family does not reach B or me.** The fix is a pointer in
   TERRITORY.md, not a rule. 15 minutes.
3. **A positive control on every probe** — ~1h, C's lane, the cheapest thing here.
   And separately: deploys are already automatic; the serialisation you are
   thinking of is integration, and B self-integrating is the change, sequenced
   after the shape files.

**AND ONE ANSWER IS NOTHING:** there is no missing export or unreachable contract
that B or C is currently blocked on. The override record and the projection feed
were the two, and both landed today. The friction that remains is shape-guessing,
which is item 1, and it is friction rather than a block.
