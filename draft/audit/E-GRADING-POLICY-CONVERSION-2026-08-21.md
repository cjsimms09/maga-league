# E's grading-policy conversion

**E (red team), 2026-08-21, against `GRADING-POLICY.md` (Cory ruled 08-21).**
**Trigger: Cory's verbatim escalation — *"see As new grading policy and make sure
everyone implements including for things we've already started!!"* — so anything
with an ACTIVE grading design converts now.**

My NOW list, from `ROUTES.md` TO:E: **(1)** restate the TE-tilt and
league-scoring-mispricing measurements against a constructed null or mark them
descriptive; **(2)** every future red-team finding files with the four
requirements; **(3)** extend the laundering watch to grading — a "null" sampled
from the thing it judges is the cannot-fail control class.

---

## 1 · THE TE TILT (08-21) — **DESCRIPTIVE. It is not a grade and I am not going to dress it as one.**

What I measured: our board ranks TEs **+28.0 mean / +20.0 median** earlier than
market ADP, against QB +7.5, WR −10.4, RB −18.8; about a third of that is our
replacement level (TE10 vs the reference TE13; re-ranking on the reference set
drops the tilt 28.0 → 19.1 and nearly erases the RB fade, −18.8 → −4.1); and the
other two thirds is not ours, because every source does it (Draft Sharks +19.5,
Sleeper +26.5, FantasyPros +19.5, own_v6 +29.0, blend +20.0).

Against the four requirements:

| requirement | TE tilt |
|---|---|
| 1 · the decision, and its moment | **absent.** "Our board ranks TEs earlier than the market" is not a choice anyone made at a moment. |
| 2 · a constructible null | **absent.** The comparison is board-order against ADP-order — a comparison of two *price lists*, not a draw from the legal alternatives available at a decision point. |
| 3 · two controls | **partial, and the wrong kind.** The re-ranker reproduces `overall_rank` at 95.6% exact, mean \|diff\| 0.07. That is a *fidelity* control on the instrument. It is not a known-negative or a known-positive on the claim. |
| 4 · margin in the unit that pays | **absent.** Everything is in rank places. Nobody scores rank places. |

**Verdict: descriptive.** §2 is explicit — *"If you cannot construct the
alternative set, you do not have a grade; you have a weather report."* This is a
weather report, and a useful one: it told Cory the tilt is mostly not ours,
which is what he asked. It should never be quoted as evidence that the tilt is
right or wrong.

**What would convert it** is the draft-pick null, which §2's table lists as
**proposed, not built**: *a random legal pick from the board at that moment*.
That is the same missing piece §3 of this document turns on, so I am not
proposing it twice.

## 2 · P248 — **ACTIVE design, so it converts NOW, and it converts cleanly**

P248 (mine, filed 08-20, grade-by 09-15, still 🔵 OPEN): *"our 2025 TE ordering
will NOT beat the 2025 market ADP ordering at ranking realized TE points, on
this league's scoring."*

**Its null is legal.** §2's table admits *"a projection | the same players/weeks
scored by a published source"*, and market ADP is a published source. P248 is
not the forbidden owner-comparison and does not need to be rewritten.

**But it states one of the four requirements, not four.** The conversion, which
I am filing as the row's new form:

* **1 · DECISION + MOMENT.** Restated as a decision rather than a correlation:
  *at a pick where our board's best-available is a tight end, take that TE or
  take our best available non-TE.* Moment = that pick, in each of the three
  historical drafts.
* **2 · NULL.** Two, and they answer different questions. For the ranking claim:
  the market ADP ordering of the same TEs over the same season (published
  source, legal today). For the decision claim: a random legal pick from the
  board at that moment — **not built**, and P248's decision half is blocked on
  it. The ranking half is not blocked and grades on schedule.
* **3 · TWO CONTROLS, drawn independently.** **known-negative:** a *shuffled* TE
  ordering must land at the null's centre — Spearman ≈ 0 against realized
  points. **known-positive:** the perfect-hindsight TE ordering must land at the
  extreme, Spearman = 1.0 by construction. Neither exists today; both are
  cheap. The controls gate the exit code, per §3.
* **4 · MARGIN IN THE UNIT THAT PAYS.** Currently P248 grades a rank
  correlation, which says *whether*. It must also report **the points-per-season
  difference between following our TE order and following ADP's**, and the gap
  from both to perfect hindsight. Beating ADP by 0.03 Spearman and by 4 points a
  season are different findings and only one of them is worth a pick.

**Nothing about the direction changes.** P248 was deliberately filed against the
flattering direction and it stays that way.

## 3 · THE LAUNDERING WATCH, EXTENDED TO GRADING — and it found something, measured

The class I was told to hunt is *a null sampled from the thing it judges*. The
external auditor already caught that one in `start_sit_vs_random.py` and it is
fixed. **I checked the two shipped graders for it and they are clean:** both draw
the known-negative independently (`waiver_vs_random.py:135`, the comment even
says so), and I confirmed the control *can* fail — a best-of-2 agent trips it,
0.640 against the 0.42–0.58 band, **⛔ FAILED**. That is the policy's own
instruction ("break the thing it watches and confirm it goes red") carried out
rather than assumed.

**The defect is one step over, and it is quantitative: the control band is far
wider than the statistic it is guarding.**

```
n=755   study null 95% half-width = 0.0206   control band half-width = 0.0800   ratio 3.9x

  bias p   control reads   control says   study would say
   0.00      0.499          ok             chance
   0.15      0.517          ok             chance
   0.25      0.512          ok             chance
   0.35      0.546          ok             SKILL      <-- disagreement
   0.50      0.569          ok             SKILL      <-- disagreement
   1.00      0.640          FAILED         SKILL
```

Read the two flagged rows. **A control agent biased just enough to score 0.546 or
0.569 is certified "random" by the known-negative, while the study's own null
band would publish that exact number as SKILL.** The band is `0.42 < cr < 0.58`
regardless of n; the study's band is ±1.96·√(1/12)/√n and shrinks. At n=755 the
control is 3.9× looser than the thing it validates. `start_sit_vs_random.py`
carries the identical band at line 284 and its null half-width is 0.0246 —
**3.3×**, same defect, milder.

**This is not the cannot-fail class. It is the adjacent one, and it runs in the
direction that protects the headline** — a control loose enough to bless a
biased agent will never embarrass a result. Both graders are now wired into
`weekly-grade.yml` with the controls gating the exit code, so the band is
load-bearing every week from here.

**The fix is one line each and it is not mine to write:** tie the control band to
the same n-dependent width the study uses, e.g. accept the known-negative only
inside `0.5 ± k·1.96·√(1/12)/√n`. Choosing `k` is choosing how strict the
program is, which is an owner's call.

## 4 · AND THE BIG ONE — **the number this whole project leads with is graded by the comparison the policy just outlawed**

`GRADING-POLICY.md`, one line: *"Grade the DECISION against a constructed null of
the legal alternatives — **never the OUTCOME against the other owners**."*

`draft/data/engine_seat_replay.json`, its `estimand` field, verbatim:

> *"mean **engine-minus-owner** season total of actual weekly points under the
> hindsight-optimal legal lineup, skill slots only, both rosters frozen as
> drafted, opponents fixed — the preregistered primary"*

That is outcome-versus-owners, stated in the artifact's own words. It is where
**−188.35 against Cory** and **"beats 0 of 10 owners pooled"** come from.
`replay_league_table.json` is the same shape and is where **−9.4** comes from.
Neither artifact contains the string `random` or `control`.

Against the four requirements it states **one**: the margin, in points.

* 1 · decision — *"how would the tool have drafted a whole season"* is precisely
  what §1 rejects (*"Did we have a good season" is not a decision*).
* 2 · null — none. The comparison set is nine other humans.
* 3 · controls — none, either kind.
* 4 · margin — yes, and in points. Credit where it is due.

**This is not a claim that −188 is arithmetically wrong.** I re-read the artifact
rather than the prose and the pooled figures reproduce. It is a claim that the
*instrument* is the one the policy retired, and the policy's own numbers say why:
**12% power today, 20% after nine more seasons.** `CLAUDE.md` already concedes it
in passing — *"−31.1 on average with an sd of 117.7 — nearly 4× the effect"* —
and then leads with the point estimate anyway.

**Blast radius, counted rather than asserted: 13 markdown files cite
`engine_seat_replay` or `replay_league_table`**, including `CLAUDE.md`,
`DRAFT-WEEK-BRIEF.md`, `OWNERS.md`, `OPEN-QUESTIONS.md` and two preregs
(`SHIP-GATE-PREREG-2026-08-19.md`, `SEAT-RANK-PREREG-2026-08-19.md`).

**The conversion needs the one null in §2's table that nobody has built** — *a
random legal pick from the board at that moment*. The machinery is mostly
already here: the three historical drafts, the board state at each pick, and the
seat-replay harness that walks them. What is missing is drawing a legal
alternative at each pick instead of comparing season totals to nine humans at
the end. **That single null converts the project's headline claim from a 12%-power
comparison to one drawing on ~1,800 pick decisions**, and it is the same null
that unblocks the TE-tilt finding in §1 and P248's decision half in §2.

**I am not building it before the draft.** It is a new measurement on the file
three lanes are editing tonight, and `no_fit_guard` covers exactly this.

## 5 · Rule 3g — what else does this mean

**Implies another failure we have not looked for?** Yes: every artifact whose
estimand is a difference against other owners is in the same position, and the
estimand string is the cheap way to find them — `grep` for `minus-owner`,
`vs owner`, `against the field`. I checked the two graders and the two replays;
I did not sweep the whole `draft/backtest` tree, and someone should.

**Invalidates something we already trust?** It downgrades — does not delete —
the headline drafting-edge numbers in 13 documents, and it downgrades my own
TE-tilt answer to Cory from a finding to a description. I would rather say that
about my own work first, which is why §1 leads.

**Routed to the lane that can act?** §3's band fix → **A** (owns the graders and
the CI step). §4's draft-pick null → **A** to schedule post-draft; it is the
policy's own table that lists it as proposed. §1 and §2 are mine and are done
here.
