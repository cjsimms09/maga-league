# You're right about the flex, and it's a bigger finding than the thing I was measuring

**A, 2026-08-19.** Cory: *"this could be a scarcity issue, each team uses 1 RB on
average but 2-3 WRs that get real points"* · *"why you normally dont have RB in
flex. almost always a WR"*

**Three claims in there. Two land, one is backwards, and chasing the one that
landed turned up a defect in the curve the whole model prices against.**

---

## 1. THE FLEX — you're right, and "almost always" is 56%

Counted from 535 real team-weeks, 2023-2025:

| who fills your flex | |
|---|---|
| **WR** | **56.1%** |
| RB | 42.2% |
| TE | 1.7% |

**Receivers are the plurality, so the instinct is right.** But 42% is not
"almost never" — **and that gap is exactly where the interesting thing was
hiding.**

## 2. ⭐ THE POOLED NUMBER IS A LIE ABOUT EVERY TEAM IN THE LEAGUE

**Per team-season, the WR-flex share has sd 0.272 and covers the entire range —
minimum 0.000, maximum 1.000.** At least one team-season never once flexed a
receiver. At least one never flexed anything else.

**So 56% is not what a team does. It is the average of two different kinds of
team.** Eighteen team-seasons are WR-flex, twelve are RB-flex. **You were
describing a roster archetype, and I had been treating it as a league constant.**

### And the need curve inherits it

The curve every arm has priced against is pooled across both:

| 3rd body starts... | **pooled** | in a **WR-flex** team | in an **RB-flex** team |
|---|---|---|---|
| **WR3** | **.530** | **.602** | .418 |
| **RB3** | **.490** | .417 | **.592** |

**The pooled number sits in the middle of a 0.18 spread and describes neither
roster.** Every pick the model has priced used it.

**Control that makes this trustworthy:** recombining the two groups reproduces
`measured_need_curve.json` — a file this probe did not compute — to within 0.03
at every cell. If my split had broken the join, that check fails first.

### The part I did not predict, and it may be the QB answer

| | QB1 starts | QB2 starts |
|---|---|---|
| **WR-flex teams** | .783 | .342 |
| **RB-flex teams** | **.554** | **.530** |

**RB-flex teams stream quarterbacks — near a coin flip between their two.
WR-flex teams do not.** The second-quarterback problem has now survived nine
arms, and **an archetype effect nobody has conditioned on is the first candidate
cause that hasn't already been ruled out.**

## 3. ⚠️ THE SCARCITY HALF IS BACKWARDS, AND THE BOARD IS EMPHATIC

You reasoned: more receivers get real points → receivers are scarcer → the model
should take more of them. **The board says the opposite, and it isn't close.**

Between each position's starter-demand rank and its wire:

| | demand rank | proj there | wire rank | proj there | **drop** | per rank |
|---|---|---|---|---|---|---|
| **RB** | 24 | 170.5 | 48 | 78.4 | **92.1** | **3.84** |
| **WR** | 26 | 171.8 | 53 | 124.8 | **47.0** | 1.74 |

**The RB curve falls twice as fast. That is what scarcity is** — not how many
bodies you start, but how much worse the next one is.

**And the level offset I expected to have to cancel out doesn't exist. It runs
the other way:** median of the top 36 is **RB 200.4, WR 185.2.** Backs project
*higher* here, then fall off a cliff. Receivers start lower and stay flat.
**P169 FALSE, in the opposite direction from my own prediction.**

**Both things are true at once and they are not in conflict:** you start
slightly more receivers (2.56/wk vs 2.42), and backs are still the scarcer buy.
Demand and scarcity are different questions, and RB 3.94 / WR 3.55 is the model
answering the second one.

## 4. THE GRADES I OWED YOU ON THE WIRE CORRECTION

| | bar | got | |
|---|---|---|---|
| **P166** — average draft moves | QB ≤ 1.4, RB ≥ 3.0 | **QB 1.20, RB 3.94** | ✅ **TRUE** |
| **P165** — 4th RB beats 2nd QB 2× | ≥ 2.0× | **1.59×** | ❌ **FALSE** |

**Full average draft over 300 rooms, against what you said it should look like:**

| | mean | sd | range | you said |
|---|---|---|---|---|
| QB | **1.20** | 0.41 | 1–3 | 1 |
| RB | **3.94** | 0.24 | 3–4 | 4–5 |
| WR | **3.55** | 0.52 | 3–5 | 4–5 |
| TE | 1.08 | 0.27 | 1–2 | — |
| K | **1.14** | 0.35 | 1–2 | 1 |
| DEF | **1.10** | 0.30 | 1–2 | 1 |

**Closest any arm has come. Reported as an outcome, not a target** — you ruled
that this is *"a limit of the euqation not a constraint"*, so I'm not tuning
toward the cells that missed.

## 5. ⛔ AND THE CORRECTION INSIDE THE CORRECTION

**I told you the QB wire was "24 points too low." That was an off-by-one on the
rank.** The right number is **+3.9**, and essentially the entire fix is RB:
**112.0 → 78.4, −33.6.** Corrected before you acted on it, and it's why §3
above is an RB story rather than a QB one.

## 6. WHAT I AM NOT DOING WITH ANY OF THIS

**Nothing ships.** `no_fit_guard` holds and the draft is Saturday. The
archetype-conditioned curve is the obvious next arm and it is **post-draft** —
splitting a curve three days out, after seeing which split I liked, is the exact
search this rule exists to stop.

**Registers 113 and 114.** The one that matters is 114: **the archetype is not
something that happens to you — the model picks it.** It tracks its own roster,
so it can know at pick time which team it is building, and `streamability` and
the room-consumption wire are pooled the same wrong way.
