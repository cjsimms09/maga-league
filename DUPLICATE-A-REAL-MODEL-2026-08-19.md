# The published model, copied out in full — and it does NOT add ceiling to everyone

**A, 2026-08-19.** Cory: *"we obviously can't do it ourselves, we need to look at
other models and duplicate"* · *"review all the resources and repos I gave you
and find a simpler strategy that uses vona and builds a normal roster"* ·
*"search everywhere you can for free projections for 2026"* · *"if I need to pay
for data I will, but want you to find me the most cost effective thing to buy"*.

**I stopped inventing and went and read the source of the model this whole
project has been circling. It is `ffanalytics::projections_table()`, it is ~60
lines of real logic, and on the one thing you have been angry about all day it
agrees with you and not with our engine.**

---

## 1. THE PUBLISHED MODEL, VERBATIM

Read from `FantasyFootballAnalytics/ffanalytics`, `R/calc_projections.R` (the
package the textbook you sent me — Petersen, *Fantasy Football Analytics* —
teaches out of, and the package our nightly probe already runs). Line numbers
are that file's.

| what | how ffanalytics does it | what OUR board does |
|---|---|---|
| **centre** | `wilcox.loc` — a **robust weighted location** across sources (L85, L399) | plain mean |
| **spread** | `weighted.sd` across sources (L7, L457) | unweighted cross-source sd ✅ same family |
| **floor** | **weighted 5th percentile**, Harrell–Davis estimator (L405, L467-8) | ~~`cross-source-p10` ✅ same family~~ ⛔ **`mean − 1.28×sd`, a Gaussian on n=3 — the FIELD says p10, the arithmetic is parametric. Register 103, §13.** |
| **ceiling** | **weighted 95th percentile**, same estimator (L405, L467-9) | ~~`cross-source-p90` ✅ same family~~ ⛔ **same — `mean + 1.28×sd`. Not the same family; I read the field name instead of the code.** |
| **source weights** | measured per source, and **five sources are weighted ZERO** (L106-110) | all sources equal |
| **replacement** | fixed positional rank: **QB13 · RB35 · WR36 · TE13 · K8 · DST3** (L173) | own derivation |
| **value** | `points_vor = points − points(baseline player)` (L500) | `vorp` ✅ same |
| **dropoff** | points minus the next-best player at that position (L509) | not on the board |
| **tiers** | Cohen's *d* thresholds (L279) | own tiering |

**And then the part that matters:**

```r
mutate(rank         = dense_rank(-points_vor),
       floor_rank   = dense_rank(-floor_vor),
       ceiling_rank = dense_rank(-ceiling_vor))
```

## 2. ⭐ THE HEADLINE: THE PUBLISHED MODEL NEVER ADDS CEILING TO VALUE

`points_vor`, `floor_vor` and `ceiling_vor` are **three separate rankings of the
same players.** There is no weight, no blend, no `+ 0.45 × ceiling`. You draft
off `rank`; you *switch* to `ceiling_rank` when you deliberately want the swing,
and to `floor_rank` when you want the safe one.

**Our engine ships `score = VONA + 0.45 × ceiling + keeper + stack` — one number,
with upside mixed into every player at every pick.** Your words this morning:
*"Why are we adding ceiling to everyone? That defeats the point."*

**The reference implementation does not do it, and the textbook says explicitly
why not:**

> *"when comparing two players with equivalent VORP, [prioritise] players with
> higher consistency and **lower uncertainty**, because they may be considered
> 'safer' with a higher floor. **However, when drafting players for your bench**,
> it may make more sense to prioritize high-risk, high reward players with
> **greater uncertainty**, because they may have a higher ceiling."*
> — Petersen, *Fantasy Football Analytics*, §Draft Strategy

**Upside is a BENCH instrument. Our engine applies it hardest in round 4, on the
starter picks, where the textbook says you want the opposite.** That is not a
tuning error; it is the term being in the wrong place. You had it right and I
argued the other way for two days.

## 3. THE SIMPLER VONA MODEL THAT BUILDS A NORMAL ROSTER — IT IS ALREADY IN OUR REPO

`draft/tools/draft_plan.js`. Two equations, no weights:

```
starter value(p)  =  his projection in that starting seat
bench value(p)    =  P(need at his position) × (his points − what is FREE in week 6)
```

Seats are assigned by an **exact optimisation** over which of your picks fills
which starting slot; the bench is then filled greedily. **It cannot draft ten
running backs, because there are only so many starting seats and a fourth back
gets priced against the waiver wire.**

**Run just now, on the LIVE board, on your REAL twelve picks, with your REAL
three keepers:**

| pick | slot | take |
|---|---|---|
| 33 | FLEX | RB Travis Etienne |
| 48 | QB | QB Drake Maye |
| 53 | WR | WR Jameson Williams |
| 68 | TE | TE Kyle Pitts |
| 73 | bench | RB Tony Pollard |
| 88 | bench | WR Alec Pierce |
| 93 | bench | RB Kenny Gainwell |
| 108 | DEF | DEF LA Rams |
| 113 | K | K Brandon Aubrey |
| 128 | bench | TE Brenton Strange |
| 133 | bench | QB Daniel Jones |
| 148 | bench | WR Khalil Shakir |

**Final 15-man roster, keepers included — side by side with the shipped engine on
the identical schedule and board:**

| | QB | RB | WR | TE | K | DEF | un-fieldable skill weeks |
|---|---|---|---|---|---|---|---|
| **`draft_plan.js`** | **2** | **5** | **4** | **2** | 1 | 1 | — |
| shipped engine | 1 | **7** | 4 | **1** | 1 | 1 | 2 |
| `need: 1.0` | 1 | 6 | 5 | **1** | 1 | 1 | 1 |
| slot-aware | 1 | **8** | 3 | **1** | 1 | 1 | 2 |
| auto | **3** | 5 | 4 | **1** | 1 | 1 | 1 |

**`draft_plan.js` is the only one of the five that draws a second tight end or a
backup quarterback. Every engine arm draws exactly one TE.** It also spends zero
picks on a bench kicker or defence — *and it was never told not to*; the bench
equation prices them negative on its own, which is the textbook's own advice
(*"Kickers and Defenses tend to have the lowest dropoff… draft them late"*)
falling out of the arithmetic instead of being hardcoded.

⚠️ **THE HONEST CAVEAT, BEFORE YOU LIKE THIS TOO MUCH.** `draft_plan.js` draws a
normal roster largely **because it is handed the roster shape** — it fills
starting slots by construction. That is the model being *told* what normal is,
not discovering it. Two more limits, both from its own header: it assumes the
room drafts in strict ADP order, and it models no upside at all. ~~**And it has
never once been graded on the seat replay, while the engine has (8th of 10).
I am not telling you it is better. I am telling you it exists, it is simple, it
is the shape you have been asking for, and nobody ever measured it.**~~

⛔ **THAT LAST SENTENCE IS RETRACTED — IT HAS BEEN GRADED TWICE AND THE NUMBERS
WERE ALREADY IN THE REPO. SEE §12,** which also carries the half that does not
flatter it. I asserted an absence without looking, which is the exact failure
this document was written about.

## 4. TWO CORRECTIONS TO THINGS I TOLD YOU TODAY

**(a) "The live board takes RB10."** ⛔ **Wrong, and it is the pick-8 error
again.** That number came from `fieldability_probe.json` built at 05:11 — an
**eighteen**-pick artifact, from before I repointed the probe at your real
schedule. Re-run just now on your twelve picks: the shipped engine takes
**RB7**, not RB10. The shape problem is real and TE1 is still the sharper
version of it, but the number I put in front of you was inflated by three picks
I already knew you do not own. It is in `CLAUDE.md`, the file every session
reads first; corrected there in this commit.

**(b) "The projection blend is thinnest at tight end — 28 TEs one source short."**
⛔ **True as arithmetic, worthless as evidence, and I used it to prop up the TE
story you had already told me was wrong.** Of the 86 players sitting on one
external source, **85 have ADP > 200.** The one inside 200 is the Jacksonville
defence. The 28 tight ends are Justin Joly, Joe Royer, Jack Endries, Daniel
Bellinger — the deep pool, not your board. **Inside ADP ≤ 200, blend coverage is
QB 100% · K 100% · WR 97% · TE 96% · RB 90% · DEF 0%.** The only real hole in
your draft range is team defences.

## 5. FREE 2026 PROJECTIONS — WHAT WE ACTUALLY HAVE

**We already blend five sources, which is more than any note in this repo says.**
The live board carries `proj_mean_source: multisource-mean-2026` and per-player
`proj_sleeper` / `proj_fantasypros`, with CBS + ESPN + FFToday behind the mean:

| ADP band | players | blended mean | |
|---|---|---|---|
| 1–60 | 58 | 58 | **100%** |
| 61–120 | 56 | 56 | **100%** |
| 121–180 | 65 | 54 | 83% |
| 181–240 | 82 | 44 | 54% |
| 241+ | 439 | 65 | 15% |

**Everything you draft in the first nine rounds is priced by five opinions. The
thinness is entirely in the last rounds and the waiver pool.**

Seven more sources are asked nightly and return zero rows while reporting
success — FantasySharks, FleaFlicker, NumberFire, FantasyFootballNerd, NFL,
RTSports, FantasyData (register 96).

**New lead, from the textbook repo you sent.** Its saved
`players_projections_seasonal_raw.RData` (downloaded, 186 KB) names **nine**
scrape sources including **NFL, NumberFire, FantasySharks and RTSports** — four
of our seven silent ones. ⚠️ **Dated it before believing it: no 2025 rookie
appears (no Cam Ward, no Ashton Jeanty, no Travis Hunter), so it is a 2024
scrape, and without R installed here I cannot prove those four carried rows
rather than just appearing as empty list names.** It is a lead, not a finding —
**but it makes the known-positive control cheap and obvious: run our probe at
`FFA_SEASON=2024` and diff per-source row counts against 2026. Rows in 2024 and
zero in 2026 means the site changed. Zero in both means we are asking wrong.**
That is rule 3e's control for a null we have been accepting for weeks.

**Blocked from this sandbox, viable from CI** (CI has open egress; a 403 at
CONNECT here is a policy answer about this container, not about the site — and
the control proves it: `raw.githubusercontent.com` returns 200 while Sleeper's
own API, which we depend on daily, returns the same 403):
Sharp Football Analysis (CSV, 500+ players) · FTN Fantasy (CSV) · Footballguys ·
ESPN's `lm-api-reads` endpoint · `api.fantasy.nfl.com`.

**Sources the textbook names that we have never touched, and the only genuinely
NEW kind of signal on the list — market-implied:**
`evsharps.com/ranks` and `/futures` (aggregates analysts **and sportsbooks**) ·
`rotowire.com/betting/nfl/player-futures.php` (season-long over/unders) ·
`the-odds-api.com` (free tier) · `vegasprojections.com` · `tools.32beatwriters.com`.
**Everything we currently blend is a projector copying other projectors — the
5-way agreement is 0.93–0.97 Spearman, which is five people saying one thing.
A betting line is the only input on the board that has money behind it.**

## 6. WHAT TO BUY — one recommendation

### ⭐ **FantasyPros Hall of Fame, from $8.99/month billed annually (~$108/yr).**

**Why it and not the others:**

- **The API key is included at no extra cost** for personal, non-commercial use —
  rankings, **projections**, ADP, players, news. We would stop scraping and start
  querying.
- **It fixes a defect we already have.** ffanalytics' FantasyPros scraper returns
  **exactly 10 rows per position** — a leaderboard page, not a projection set —
  which is why the blend excludes it (`sources_excluded`). The API returns the
  real set.
- **It is the one source that also carries ECR and ADP**, which our board already
  leans on from a different, scrapier path.
- It is roughly **one-tenth** of the next thing up.

**What I looked at and am NOT recommending:**

| | why not |
|---|---|
| **SportsDataIO** | the genuine gold standard, quote-based enterprise pricing. Real answer for a business; absurd for one league. |
| **FantasyData** | **$99/mo developer tier.** ~11× FantasyPros for data we largely already blend. |
| **Fantasy Nerds** | annual, per sport, price not published on the page — **and I could not reach the pricing page from here (egress-blocked), so I am not quoting a number I did not see.** Worth a look *after* FantasyPros, since it is one of our seven silent scrapers. |
| **FTN Data** ~$70/yr | cheap and it does publish 2026 projections, but it is a sixth projector correlated with the five we have. |
| API-Sports / Sportmonks / TheStatsAPI ($19–50/mo) | ⚠️ **these are SOCCER.** They surface on every "football API" search and none of them carry NFL fantasy projections. Naming them so nobody buys one. |

⚠️ **I could not load the FantasyPros or Fantasy Nerds pricing pages from this
container — both are egress-blocked. The $8.99/mo figure is from search results,
not from the page. Check it before you pay.**

**And the honest ranking of what your money buys:** the FantasyPros key is
cheap, safe and mostly *consolidating* — a sixth correlated projector plus a
clean ADP feed. **The betting-market feeds in §5 are the only purchase that adds
a signal we do not already have five copies of.** If you want one thing, buy the
FantasyPros key. If you want the thing most likely to move a number, it is a
market feed, and I have not yet priced one.

## 7. WHAT I AM NOT DOING

**Nothing ships from this before Saturday.** Not the ceiling term, not
`draft_plan.js`, not a new source. Every item here changes a number on a board
you have been studying for a week, and three days before a draft is when this
project's own rule says to stop. **This is a read of the reference
implementation, a correction of two of my own claims, and a purchase
recommendation.**

## 8. THE THREE FOLLOW-UP QUESTIONS (rule 3g)

1. **Does this imply another failure we have not looked for?** Yes — if
   `ceiling` is in the wrong place, so is `risk`, and `proj_floor` has never been
   tested for the collinearity that condemned `proj_ceiling`. And the source
   weights: ffanalytics weights five sources **zero**; we weight all five of ours
   equally, having never measured any of them.
2. **Does it invalidate something we already trust?** It invalidates the framing
   of your ceiling ruling. You ruled `0.45` on three preregistered runs that beat
   zero — those runs stand. **But "beats zero as a blended term" was never the
   same question as "is a blended term the right shape", and the reference
   implementation answers the second one no.**
3. **Is it routed to the lane that can act?** A owns the composite and the
   purchase recommendation; C owns the probe control in §5. Filed as registers
   98, 99, 100.

---

# ADDENDUM — nflverse/open-source-football, read 2026-08-19

Cory sent `github.com/nflverse/open-source-football` after the above was written.

## 9. WHAT IS ACTUALLY IN IT — the unflattering count first

**42 posts. Three touch fantasy football. One is useful to us.** The rest is
team-level play-by-play work — EPA stability, win probability, QB Elo, penalty
predictability, field-goal models. Good analytics; not a draft model and not a
projection source. **Saying so rather than mining it for a paragraph, because
this project's failure mode is finding a way to make every resource look
relevant.**

The three:

| post | worth |
|---|---|
| **2020-08-30 · Calculating Expected Fantasy Points for Receivers** (Anthony Reinhard) | ⭐ **the real find — see §10** |
| 2020-08-25 · Visualizing "trap backs" | volume-without-efficiency RBs; a diagnostic, not a projection |
| 2020-09-26 · Receiving by position | descriptive |

## 10. ⭐ THIS IS HOW YOU ACTUALLY PROJECT A CEILING

Your words: *"Lookup how to actually project ceiling."* Here is a published,
working answer, and it is not what we do.

**Per target, from play-by-play:**

```r
PPR_points     = 1 + gain/10 + (6 if gain reaches the end zone)
catch_run_prob = cp × yac_prob            # nflfastR completion-prob × xYAC model
exp_PPR_points = PPR_points × catch_run_prob
```

**Then — and this is the part that matters — simulate every one of his targets
10,000 times and take the distribution.**

**The ceiling is a high quantile of the player's OWN simulated outcome
distribution**, built from his own target profile: air yards, field position,
catch probability, yards-after-catch model. It is player-specific because it is
*made* of that player's opportunity, not because a constant was multiplied by
his mean.

**Our three generations of ceiling, in order:**

| | what it was | how much player-specific information |
|---|---|---|
| before 08-17 | `proj_mean × a per-band constant` | **zero** — the defect that broke three conclusions |
| today | cross-source p90 (five projectors' disagreement) | some, but **0.70 collinear with the mean** (register 97) |
| **this** | **quantile of a 10,000-run simulation of his own targets** | **player-specific by construction** |

**And the same machinery gives the thing that should probably replace the
ceiling term entirely: `actual − expected`.** A receiver who scored four more
touchdowns than his opportunity supports is not a high-ceiling player, he is a
player due to regress; one below is due positive regression. **That is a real
upside signal with a sign, and it is orthogonal to level by construction** —
which is exactly the property my "residual upside" sketch was groping at
yesterday (+0.04 correlation with the mean) and this one is a published method
instead of my invention.

⚠️ **Three limits, stated up front.** (1) The post covers **receivers only** —
no rushing, no fumbles, no two-point conversions, and the author says so. RB and
QB need the same treatment built separately. (2) It measures the **average**
receiver's expectation given the opportunity; a genuinely elite YAC player will
beat it every year, so "over-performed xFP" is not automatically regression.
(3) It is **backward-looking** — it prices last season's opportunity, and the
projection question is next season's.

**But the input cost is nearly zero, and that is the headline: we already
ingest it.** The board's provenance shows **98,263 play-by-play rows already
loaded (2024 + 2025), 761 players with metrics, 739 GSIS-translated.** The board
already carries `wopr`, `target_share`, `air_yards_share`, `adot`, `rz_share`,
`rz_targets`, `carries`, `gl_carries`. **This is not a data purchase. It is a
computation on data sitting on our disk.** That makes it a better use of the
next month than any of the sources in §5 or §6.

## 11. AND A NEAR-MISS I AM WRITING DOWN BECAUSE IT NEARLY BECAME A DRAFT-WEEK 🔴

Chasing §10 I found that **`opportunity_adj` is exactly `-0.0` on all 700 board
players** — one distinct value — while the provenance reports
`opportunity_adjustment: "ok"`, `opportunity_applied: true`,
`opportunity_adj_coverage: 1.0`, `opportunity_observed_in_data: true`. A dead
signal with four green lights on it, two days before the draft. I had the
register row half-written.

**It is not a defect. It is your ruling.** `league_config.json` carries
`opportunity_cap: 0.0` — *"LAYER OFF, Cory's ruling 2026-08-17 ('Remove 1')"* —
after the layer was graded for the first time and found **NEUTRAL on ordering in
17 of 18 cells, WORSE on level in 18 of 18, and identical to a SHUFFLED
control.** The zero is correct, deliberate, graded, and reversible in one line.

**What stopped it was reading the config before writing the finding down**, which
is the whole of rule 3f. **The residual is real but small and cosmetic:** three
provenance fields say a switched-off layer is on, and the war room already has a
`disabled` state it never reaches, so you see a green badge for a layer you
turned off. Filed as register 101, 🟡, post-draft.

---

# 12. ⛔ RETRACTION — "`draft_plan.js` has never been graded" IS FALSE, AND THE GRADE HAS BEEN ON THE BOARD ALL ALONG

**I wrote that in §3 this afternoon, committed it, and said it to Cory in as many
words. It is wrong.** I ran the tool, liked the roster, and asserted an absence
without looking — the exact shape of the five false premises that cost session D
a day on 08-17, made inside a document about false premises.

**What actually exists, and it is CURRENT:**

`emit_seat_plan.js:48` — `const PLAN = require('./draft_plan.js')`. It emits
`public/seat_plan.json`, which the war room reads. That file was built from the
**08:52:22Z board on Cory's real twelve picks** and carries this:

| line | score |
|---|---|
| engine's own greedy #1 at every pick | **1917.58** |
| engine **constrained to the plan's seats** | **1938.59** |
| **`draft_plan.js`'s global seat assignment** | **1957.55** |

**`draft_plan.js` is +39.97 ahead of what the engine does today, on his real
schedule, on the current board — and +21.0 of that comes back just by making the
engine fill the plan's SEAT instead of taking its own #1, because the engine
already names the plan's own player at 4 of the 6 seats.** The disagreement is
mostly about *which slot to fill when*, not about who is good.

**And it has a second, independent grade** — `roster_robustness.py`, 10,000
simulated 17-week seasons under measured availability, scoring **E[starting
lineup points]**, the metric the conversion work says is the one that matters:

| roster | lineup pts | wire pts needed | un-fieldable skill slot-weeks |
|---|---|---|---|
| **`seat_plan_planned` (= `draft_plan.js`)** | 2681.0 ± 2.9 | **63.8** | **3.78** |
| seat-plan shortlist, followed literally | 2666.3 ± 2.7 | 112.4 | 9.07 |
| fragile bye-stack (the deliberate bad roster) | 2622.0 ± 2.7 | 142.5 | 9.47 |
| Cory's actual 2025 roster | 2192.7 ± 2.5 | 135.2 | 8.26 |

**It needs BARELY HALF the waiver help of anything else on the list.** That is
"starts what it holds", measured, on the axis this whole week has been about.

## ⚠️ AND THE HALF THAT DOES NOT FLATTER IT, WHICH IS WHY THE RETRACTION MATTERS

⛔ **CORRECTED WITHIN THE HOUR — THIS SECTION SAID "TWO YARDSTICKS, OPPOSITE
ANSWERS" AND BOTH HALVES OF THAT WERE WRONG. I CHECKED IT BECAUSE I HAD JUST
PUBLISHED IT, WHICH IS THE ONLY REASON IT DID NOT STAND.** The corrected reading
is below the table; read that before the table.

**(a) The doctrine `seat_plan` arm is NOT `draft_plan.js`.** `archetype_policy.js:236-246`
defines it as *"the engine's greedy #1 PLUS this positional schedule… seek the
plan's scheduled position among the ENGINE's candidates; defer to the engine
wherever the plan is silent."* **It is the OVERLAY — engine ordering inside the
plan's slot schedule — which is precisely the `seat_constrained` line (1938.59),
not the `global_plan` line (1957.55).** The two artifacts agree with each other:
the overlay is worse than the full plan, by +19 in the emit and by −25 in the
tournament. **`draft_plan.js` itself was never in that tournament.**

**(b) The singles and the doctrines are different populations and the artifact
deliberately never crosses them.** `seat_plan_planned` is ONE roster over 10,000
seasons; a doctrine arm is 120 rooms × 250 seasons. The artifact carries two
separate dominance blocks for exactly this reason, and
`dominance_vs_planned_roster` compares the planned roster **only** to the other
three singles. **Putting 2681.0 next to 2743.6 was my error, not the artifact's.**

**So the corrected position: `draft_plan.js` does not lose to four doctrines —
that comparison has never been made. What loses is the hybrid, and both
independent measurements say the same thing about it.** The table below is the
doctrine tournament and it is about ARMS, not about the plan:

| doctrine arm (120 rooms x 250 seasons) | lineup pts |
|---|---|
| robust_rb | 2746.5 ± 3.8 |
| **market_adp — just follow ADP** | **2746.1 ± 5.6** |
| **shipped** | **2743.6 ± 5.1** |
| te_early | 2742.6 ± 4.8 |
| early_qb | 2734.4 ± 5.6 |
| late_qb | 2726.5 ± 4.7 |
| **seat_plan arm** | **2718.8 ± 4.7** |
| zero_rb | 2653.9 ± 5.9 |
| **bpa_vorp — naive best-available on VORP** | **2637.6 ± 7.4** |

> *"doctrine(s) shipped, robust_rb, early_qb, te_early dominate the seat-plan arm
> in the paired room test — the seat-plan overlay is giving up availability
> structure it did not have to give up."* — the artifact's own headline

**Three things in that table are worth more than my retraction:**

1. **`market_adp` — literally just drafting by ADP — ties the shipped engine**
   (2746.1 vs 2743.6, both ±5). **That is the "roughly a wash" verdict of the
   seat replay, reproduced by a completely independent harness.** Two different
   simulators, two different metrics, same answer.
2. **`bpa_vorp` — the simplest possible VONA rule — is the WORST of the nine.**
   **Simplicity is not the win.** What helps is the slot structure, not the
   absence of terms; Cory asked for simpler and the naive version of simpler is
   measurably last.
3. **`p_unfieldable_skill_week` is 0.96–1.00 for every arm in this simulator.**
   It is saturated and discriminates nothing. **Do not quote it as evidence** —
   the fieldability probe's version (which does separate the arms) is a
   different, bye-week-only measurement, and I should not have put them near
   each other without saying so.

~~**So the corrected position: `draft_plan.js` beats the shipped engine
head-to-head on Cory's actual schedule (+40) and needs half the waiver help, and
loses to the shipped doctrine on pooled 17-week lineup totals. Both are measured.
I do not yet know which yardstick is right, and the previous version of this
document did not know there were two.**~~

**⛔ CORRECTED. The second clause is not a measurement of `draft_plan.js` at all,
per (a) and (b) above. WHAT IS ACTUALLY MEASURED, all of it:**

- **`draft_plan.js` +39.97 over the engine's live greedy line**, on Cory's real
  schedule, on the current board.
- **The overlay recovers +21.0 of that 40** — so roughly half the gap is "fill
  the plan's seat" and half is "and take the plan's player."
- **The overlay is worse than the full plan on both independent harnesses** —
  −19 in the emit, −25 in the doctrine tournament, which is one finding seen
  twice rather than two findings.
- **`draft_plan.js`'s roster needs 63.8 wire points a season against 112–142 for
  every other single roster**, and dominates Cory's actual 2025 roster outright.
- **`draft_plan.js` has never been run through the doctrine tournament**, and
  that — not "which yardstick governs" — is the real open question.

**I made two corrections to this section in one afternoon. Both came from
checking a claim I had already published rather than from anyone catching me,
and both moved in the same direction: I was reaching for a tidy "here are two
verdicts" story that the artifacts do not support.** Register 102.

---

# 13. "ARE WE FOLLOWING THE MODELS IN THOSE REPOS?" — NO. Here is every line, and the real reason.

**Cory, 2026-08-19.** Straight answer: **of twelve things the published model
does, we do two.** Checked against the code today, not from memory.

| # | what ffanalytics / the textbook does | what we do | following? |
|---|---|---|---|
| 1 | aggregate many independent projection sources | 5 sources blended | ✅ **yes** |
| 2 | score each source's RAW STAT LINES under your league's own table, ignoring their site points | `multisource_projections.py` does exactly this, and says so | ✅ **yes** |
| 3 | centre = **weighted Wilcox robust location** | `st.mean(vals)` — a plain mean | ❌ no |
| 4 | source weights **measured**, five of fourteen set to 0.000 | all sources weighted equally, none ever measured | ❌ no |
| 5 | floor/ceiling = **weighted empirical quantile** (Harrell–Davis) of the source values | `mean ± 1.28 × sd` — a **Gaussian on n = 3** | ❌ no ⚠️ |
| 6 | VOR against a **fixed positional rank** (QB13 RB35 WR36 TE13 K8 DST3) | own derivation — our RB replacement is **170.5** where theirs is **139.3** | 🟠 partly |
| 7 | **dropoff** emitted per player | `position_dropoff.js` is built and **does not reach the board** | 🟠 partly |
| 8 | **three separate rankings**; ceiling never enters value | one score, `+ 0.45 × ceiling` on every player | ❌ **no — the big one** |
| 9 | tiers by **Cohen's *d*** | our own tiering, never compared to theirs | ❌ no |
| 10 | starters → **low** uncertainty; bench → **high** uncertainty | 0.45 uniformly, hardest on the round-4 starter picks | ❌ no |
| 11 | the objective is **STARTING-LINEUP points** | engine maximises roster value; conversion 0.74/0.77 vs owners' 0.83 | ❌ no (register 60) |
| 12 | expected fantasy points from play-by-play (OSF) | not built — **98,263 pbp rows already ingested and unused for this** | ❌ no |

## ⚠️ AND ONE OF THOSE IS WORSE THAN "NOT FOLLOWING" — ROW 5

`multisource_blend.py:231-235` sets:

```python
p["proj_ceiling"]        = round(mean + Z * sd, 2)     # Z = 1.28
p["proj_ceiling_source"] = "cross-source-p90"
```

**The field says `p90`. The computation is `mean + 1.28 × sd` — a normal
approximation over three numbers.** The code's own comment is honest
(*"~p90/p10 of a normal"*); the **board field that the war room and every
downstream study read is not.** A parametric band on n = 3 wearing an empirical
percentile's name. **That is the third label today that claims more than the
arithmetic delivers**, after `opportunity_adjustment: "ok"` on a switched-off
layer (register 101) and my own "never graded" (register 102). Filed as
register 103.

## THE REAL ANSWER TO "WHY NOT"

**Not because we evaluated their choices and preferred ours. Because nobody
opened them.** Every one of rows 3–12 is something this project built its own
version of from first principles, and **I read `calc_projections.R` for the first
time today, after you told me to.** The repo has 186 tools, 260 backtest scripts
and 193 audit documents, and not one of them cites the reference implementation
of the model it is reimplementing.

**Two honest qualifications, because "we ignored the textbook" is too neat:**

- **Rows 1 and 2 are not small.** Scoring raw stat lines under our own table
  instead of trusting a vendor's points is the single most important thing on
  the list, and we do it. Most public tools do not.
- **Some divergences may be right.** Their VOR baseline (row 6) is a
  10-team/12-team convention that may not fit a 10-team league with our slots;
  our replacement is derived rather than conventional. **But "may be right" is
  the point — nobody checked, so we do not know whether our number is better or
  just different.**

**What I am NOT going to do is convert this into twelve tickets before
Saturday.** Rows 3, 4, 5, 9 change `proj_mean` and every band on a board Cory has
been studying for a week. Rows 8, 10, 11 change what the engine picks. **The
whole list is post-draft, and row 8 — take ceiling out of the score and emit it
as its own ranking — is the one worth doing first, because it is the one Cory
identified unprompted and the reference implementation agrees with him.**

---

# 14. ⛔ §6 IS WITHDRAWN. "Why pay for FantasyPros when we already have that info" — you are right.

**Cory, 2026-08-19, one question, and it killed a recommendation I had already
committed and pushed.** I had not measured our existing FantasyPros coverage
before telling you to buy more of it. Measured now, on the live board:

| | |
|---|---|
| board players carrying `proj_fantasypros` | **429 of 700** |
| **inside your actual draft range (ADP ≤ 200)** | **181 of 199 = 91.0%** |
| players whose ADP already comes from FantasyPros | **324** |
| players carrying `consensus_rank` (their ECR) | **700 — all of them** |

**$108/yr buys the last 9% of your draft range — eighteen players between ADP 180
and 200 — plus a deep pool you will not draft from.**

## AND THE ARGUMENT WAS WORSE THAN SMALL. IT WAS CIRCULAR.

The defect I offered as the reason to buy was ffanalytics' FantasyPros scraper
returning **10 rows per position**. But that scraper only feeds the **ffanalytics
blend arm** — and **ffanalytics weights FantasyPros at `0.000` on purpose**
(`default_weights`, L106-110), because **FantasyPros is itself an aggregate of
the other sources and blending it double-counts them** (register 100).

**So I was proposing you pay to repair a source the reference implementation then
tells us not to use — in the same document where I wrote that reference
implementation down.**

## WHAT I SHOULD HAVE SAID

**Buy nothing on the projection side.** We are not short of projections; §5's own
numbers say your first nine rounds are priced by five opinions, and this section
says one of those five is already at 91% where it counts.

**The only input worth money is the one we have ZERO copies of: a betting-market
feed.** Every source on the board is a projector copying other projectors —
pairwise Spearman **0.93 to 0.97**, which is five people saying one thing. A line
has money behind it. **I still have not priced one, and I am not going to
recommend a number I have not seen** (`evsharps`, RotoWire player futures and
`the-odds-api`'s free tier are all egress-blocked from this container).

**The general lesson, and it is the fourth time today:** I recommended a purchase
from a *narrative* — "the FP scraper is broken, therefore we lack FantasyPros" —
without running the one query that checks it. **The query took nine seconds.**
`CORY-ASKS.md` A17 is updated to WITHDRAWN.

---

# 15. "SO WHAT SHOULD I PAY FOR THAT MAYBE GETS US LOTS OF DIFFERENT PROJECTIONS"

**The structure of the market is the answer, and it is not what I expected:
almost every paid product sells exactly ONE projection.** Sharp, Fantasy Points,
FTN, 4for4, Footballguys, PFF, SportsDataIO, FantasyData — each is one more
opinion. Buying five of them is five subscriptions for five numbers that already
agree with ours at Spearman 0.93–0.97. **The only products that sell MANY are
aggregators, and there are two: FantasyPros and Fantasy Football Analytics —
whose web app is free.**

## FIRST, THE COUNT YOU ALREADY HAVE, WHICH IS HIGHER THAN I KNEW

**`expert_spread_2026.json`, scraped 08:29 this morning, from
`api.fantasypros.com/v2/json/nfl/2026/consensus-rankings?...&experts=show` — a
public endpoint, no key, free:**

| | |
|---|---|
| players covered | **420** |
| individual expert opinions per player | **median 86, up to 97** |
| plus point projections from | CBS · ESPN · FFToday · Sleeper · FantasyPros |

**Ninety-seven experts and five projection sets. Nobody is going to sell you more
opinions than that.** The bottleneck is not the count.

## THE ONE REAL GAP IN THE "MORE PROJECTIONS" DIRECTION

**We have per-expert RANKS. We do not have per-expert POINT PROJECTIONS.** The
textbook is blunt about why that matters:

> *"you can calculate rankings from projections, but you cannot reverse engineer
> projections from rankings."* — Petersen, §Benefits of Using Projections Rather
> than Rankings

FantasyPros premium advertises customising your expert list and comparing any
expert against ECR. ⚠️ **I have NOT verified that it exposes per-expert POINTS
rather than only per-expert RANKS, and that distinction is the whole value of the
purchase. That is exactly the unchecked premise that cost me §6 and three other
claims today, so I am not recommending it until someone looks.** It is a
30-second check in a browser.

## WHAT I ACTUALLY RECOMMEND, WITH PRICES

**If you want to spend money this week — 4for4 Pro, $59/season** (Classic $29).

- It is **not** one of the five we blend and **not** in ffanalytics' source list,
  so it is a genuinely new opinion rather than a sixth copy.
- It publishes an accuracy record and integrates with MyFantasyLeague.
- **It is cheaper than the FantasyPros HOF I withdrew, and unlike FantasyPros we
  have none of it.**

**If you want to spend money that actually CHANGES the model, two things, and
neither is a projection:**

| | what | price |
|---|---|---|
| **market signal** | **The Odds API**, Professional tier | **$29/month** — the free tier is useless for us (h2h only, NBA/MLB) |
| **expected fantasy points** | **Sharp Football's 2026 xFP Leaderboard** — the open-source-football method, productised | package pricing; ⚠️ **egress-blocked from here, unverified** |

**And the xFP one has a $0 option: build it ourselves from the 98,263
play-by-play rows the board already ingests** (§10). That is the same signal,
free, and we own the code.

## THE ONE-LINE ANSWER

**Nothing you buy will give you "lots of different projections" — you already
have 97 experts and 5 sources, free. If you want one more real opinion, 4for4
Pro at $59 is the cheapest honest one. If you want the model to get better, the
money should go to a betting feed ($29/mo) or to nobody at all, because the
expected-points signal is buildable from data already on our disk.**

⚠️ **Every price above came from search results, not from a pricing page —
`4for4.com`, `theoddsapi.com`, `sharpfootballanalysis.com` and
`fantasypros.com` are all egress-blocked from this container. Check any of them
before paying.**

---

# 16. ⭐ WE HAVE NOW ACTUALLY TESTED IT. Both predictions TRUE, and one of them settles your ceiling question.

**Cory: *"what about the model from the repos??? have we tested them"*. We had
not — I had described it. Now it is built and run.** Prereg
`draft/FFANALYTICS-DUPLICATION-PREREG-2026-08-19.md` (P135, P136), module
`draft/backtest/ffanalytics_duplicate.py`, both committed before it executed.
R is not installed and was not needed: `wilcox.loc`, `whdquantile` and
`weighted.sd` are re-implemented from the source, with a hand-rolled regularised
incomplete beta because scipy is absent. **All five controls pass, including the
one that matters — the harness reproduces the committed artifact's own numbers.**

Both models eat **identical input**: the same 481 players, the same per-source
points already scored under our league's table. Any difference is the estimator.

## RESULT 1 — THE SOPHISTICATED PART CHANGES NOTHING. THE REPLACEMENT LEVEL CHANGES HALF THE BOARD.

**Top-50 players moving ≥3 ranks against our board:**

| swap | players moved |
|---|---|
| **estimators only** — Hodges–Lehmann centre + weighted Harrell–Davis bands, replacing our mean + `mean ± 1.28σ` | **0 of 50** |
| **VOR baseline only** — QB13 · RB35 · WR36 · TE13 · K8 · DST3, replacing ours | **25 of 50** |
| both (full ffanalytics) | 23 of 50 |

**P135 TRUE.** And the zero is real, not two identical arms: the estimator swap
genuinely moves **279 of 481** players' centres (max 6.6 points) and **394**
players' band widths (max 32.8) — **it just never moves anyone far enough to
change who you take.**

**What that means for two things I filed this afternoon:** register 100 (we
weight all sources equally) and register 103 (`proj_ceiling_source` says `p90`
and computes `mean + 1.28σ`) are both **real and both cosmetic for ranking.**
Downgraded in the register on this measurement rather than left at the severity
I assigned them from theory. **The estimator sophistication in the published
model is not where its value is.**

**Where the value IS:** our replacement levels against theirs —

| | RB | WR | QB | TE | K | DEF |
|---|---|---|---|---|---|---|
| **ours** | **170.5** | **171.9** | 350.3 | 141.5 | 129.3 | 103.0 |
| **ffanalytics** | **139.3** | **147.2** | 344.1 | 132.5 | 130.5 | 117.0 |

**We price every back against a replacement 31 points richer than theirs, and
every receiver 25 points richer.** That single choice reorders half the top 50,
and **nobody in this repo has ever compared the two.**

## RESULT 2 — ⭐ THE THREE RANKINGS REALLY DO DISAGREE. YOU WERE RIGHT.

Inside ffanalytics' **own** output, `ceiling_rank` against `rank`, top 100:

- **47 of 100 move by 5 or more places**
- median move **4**, maximum move **24**

**P136 TRUE.** This was the prediction that could have undercut what I told you
this morning — if their ceiling ranking had collapsed onto their value ranking,
then blending ceiling into value would be harmless and my §2 would have been
noise. **It does not collapse. Nearly half the top 100 are genuinely different
players.**

**So `VONA + 0.45 × ceiling` is not a harmless tweak. It is a blend of two
rankings that really do disagree, mixed in a fixed ratio, applied to every player
at every pick — where the reference implementation keeps them apart and makes you
choose.** That is your objection, measured.

## RESULT 3 — AND OUR CEILINGS ARE MORE EXTREME THAN THEIRS

Median band width (ceiling − floor): **ours 19.3, ffanalytics 15.9.**

`mean ± 1.28σ` **extrapolates outside** the three numbers the sources actually
gave; a Harrell–Davis quantile is a weighted average of them and **stays inside**.
So on top of pointing the wrong way (§2), our upside term is **~20% wider** than
the published construction would make it.

## WHAT THIS DOES NOT SETTLE

**It compares CONSTRUCTIONS on today's board. Neither is graded against
outcomes** — that needs the seat replay and a season. A board that differs is a
finding about the model, not a verdict on who is right. **The replacement-level
question (result 1) is now the single highest-value post-draft experiment in this
project, and it is one number per position.** `no_fit_guard` holds: nothing is
selected from this, and nothing ships before Saturday.

---

# 17. "DO THEY BUILD MORE NORMAL ROSTERS?" — no, and it is a category difference, not a defect

**Short answer: the published model is a VALUATION, not a draft policy.** It ranks
players. It never decides when to fill a slot. **That is why the textbook has a
separate Draft Strategy chapter, and it is why your two requests today — *"a
simpler strategy that builds a normal roster"* and *"duplicate the published
model"* — are answers to different questions. We now have both, and they do not
compete.**

**Already measured, in a committed artifact nobody had to build for this:**
`roster_robustness_2026.json` grades **`bpa_vorp` — pure best-available on VORP,
which is exactly "draft off ffanalytics' `rank`" — as the WORST of nine arms**,
2637.6 lineup points against shipped's 2743.6. Naive BPA on a valuation is the
bottom of the field.

⚠️ **AND I THREW AWAY MY OWN PROBE OF THIS RATHER THAN REPORT IT.** I drove BPA
on the ffanalytics ranking down your twelve picks; it drafted **six kickers**. I
checked why before writing it down: **three players in the multisource set have
no board match, so they get ADP 9999, never drain out of the pool, and stay
"available" all draft** — one of them at 126.7 VOR. The roster shapes it produced
are contaminated and are not in this document. **The committed artifact above
answers the question properly and I should have looked there first.**

## AND THE CLEAN PART OF THE MOVER ANALYSIS — it is QB and TE, not RB and WR

Restricted to skill positions (K/DEF excluded, because my reconstruction has no
onesie demotion and the live board correctly ranks the best kicker **625th**):

**Of your top 60 skill players, 31 move ≥3 ranks under the published baseline —
and 26 of the 52 inside ADP ≤ 60 do**, which is the range you actually draft in.

| position | net shift | avg |
|---|---|---|
| **QB** (8 players) | **+138** | **+17.2 — falls hardest** |
| **TE** (6) | +53 | +8.8 |
| WR (22) | −29 | −1.3 |
| RB (24) | −41 | −1.7 |

**Under the published replacement level, quarterbacks and tight ends are worth
much less than our board says.** Concretely: **Drake Maye #42 → #56. Kyle Pitts
#53 → #65.** `draft_plan.js` takes exactly those two, at picks 48 and 68 — **so
the published model says our own simpler plan is reaching on both of its
middle-round picks.** That is a genuine disagreement between the two things I
have recommended today, and it is unresolved.

# 18. THE OTHER REPO — `kt474/fantasy-football-wrapped`

You asked about its model. **It has one, it is `calculateDraftRank()` in
`src/api/helper.ts`, and it is a retrospective DRAFT GRADE, not a projection or a
draft model.** It scores a pick after the season against the player's realised
positional rank and points per game:

```ts
rankScore = ((pickNumber + firstRoundAdjust + earlyPicksAdjust - positionRank)
             / pickNumber) * baseMultiplier
ppgScore  = (ppg / 25) * baseMultiplier
final     = rankScore * 0.7 + ppgScore * 0.3          // clamped at -3
```

**Every constant is hand-set and none is fitted or graded**: `firstRoundAdjust =
2`, `earlyPicksAdjust = 1.5`, the `0.7 / 0.3` blend, `ppg / 25` (*"25 is
generally around the max ppg"*), and a tier table of 2.0 / 1.7 / 1.4 / 1.2 / 1.1
/ 1.0 / 0.8. **This is the thing you have been objecting to all day — complexity
without measurement — and it is in a production app used by thousands. It is
less principled than what we already have. I would not copy any of it.**

**One thing in it is worth noting anyway, as convention rather than evidence.**
Its position weights are `RB 1.0 · WR 0.9 · TE 0.9 · QB 0.7 · K 0.4 · DEF 0.4`,
and **its TE tier curve is the steepest of any position** — elite TE 2.0 falling
to 0.8 by rank 18, steeper than WR. **So a widely-used app encodes both "backs
first" and "the top few TEs are scarce" as stated beliefs.** That is two
independent conventions agreeing with things this project has argued about — and
**a convention is not a measurement. I am recording it as what people believe,
not as support for either claim.**

---

# 19. ⭐ RESOLVED — AND ON THE ONE THING THAT MATTERED, OUR NUMBER IS RIGHT AND THEIRS IS A 12-TEAM CONVENTION

§16 called the replacement level *"the largest unexamined input in the engine"*
and filed it 🔴 with the implication that ours might be wrong. **I then did the
one check that settles it: translate our replacement VALUES into positional
RANKS and compare them to the league's own slots.**

Our league (`draft_data.json`): **10 teams**, starters
`QB1 · RB2 · WR2 · TE1 · FLEX1 · K1 · DEF1`.

| | our replacement | **= our rank** | **teams × starters** | ffanalytics |
|---|---|---|---|---|
| **QB** | 350.3 | **#10** | **10** ✅ | #13 |
| **TE** | 141.4 | **#10** | **10** ✅ | #13 |
| **K** | 129.2 | **#10** | **10** ✅ | #8 |
| **DEF** | 103.0 | **#10** | **10** ✅ | **#3** |
| RB | 170.5 | #24 | 20 + flex | #35 |
| WR | 171.8 | #26 | 20 + flex | #36 |

**Our one-starter positions land on rank 10 exactly — the last starter in a
ten-team league. That is the definition of replacement, not an approximation of
it.** RB and WR sit at 24 and 26 against a floor of 20, the extra 4 and 6 being
the flex absorbed.

**ffanalytics' `default_baseline` is a TWELVE-team convention.** QB13 and TE13
are "12 starters plus one"; RB35 and WR36 are 24 starters plus flex on a
12-team board. **Scaled to our size (×10/12) they give QB 10.8 and TE 10.8 —
which is our number.** And **DST3 fits nothing at all**: it prices the third
defence as replacement in a league that starts ten of them.

## SO THE MAYE / PITTS DISAGREEMENT IN §17 IS RESOLVED, AND NOT AGAINST US

The published baseline called Drake Maye a reach (#42 → #56) and Kyle Pitts a
reach (#53 → #65) **only because it believes replacement is QB13 and TE13.** In
a 10-team, 1-QB, 1-TE league it is QB10 and TE10, and **our board has it right.**
`draft_plan.js` taking Maye at 48 and Pitts at 68 is not contradicted by the
reference implementation — it is contradicted by the reference implementation
being sized for a different league.

**That also explains the entire §16 result.** The QB/TE fall of +17.2 and +8.8
ranks was not a finding about our model; it was the 12-vs-10 team difference
propagating through VOR. **Register 104 is downgraded from 🔴 accordingly, on
this measurement.**

## ⚠️ WHAT IS *NOT* RESOLVED, AND I AM NOT LETTING IT RIDE ON A GOOD RESULT

**RB and WR.** Scaled to ten teams the convention gives **RB 29.2 and WR 30.0**;
we use **24 and 26**. Both sit above the bare starter floor of 20, so both are
defensible, and **ours prices every back and receiver against a richer
replacement — which makes them look WORSE, not better.** That is the one place
our number is tighter than the scaled convention and nobody has graded it. **It
stays open, at 🟠, as a one-number-per-position post-draft experiment.**

**And the general lesson is the one this whole document keeps arriving at:
"duplicate the published model" was the right instruction and the published
model is still not authoritative.** It encodes a league that is not ours. The
value of reading it was never that it is correct — it is that it made us state
our own assumptions in a form where they could be checked. **Four of six of ours
turned out exactly right; one of theirs (DST3) is indefensible anywhere.**
