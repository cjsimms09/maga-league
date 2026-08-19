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
| **floor** | **weighted 5th percentile**, Harrell–Davis estimator (L405, L467-8) | `cross-source-p10` ✅ same family |
| **ceiling** | **weighted 95th percentile**, same estimator (L405, L467-9) | `cross-source-p90` ✅ same family |
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
room drafts in strict ADP order, and it models no upside at all. **And it has
never once been graded on the seat replay, while the engine has (8th of 10).
I am not telling you it is better. I am telling you it exists, it is simple, it
is the shape you have been asking for, and nobody ever measured it.**

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
