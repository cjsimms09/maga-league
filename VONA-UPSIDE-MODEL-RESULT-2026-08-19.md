# Your model is built and run. The upside term WORKS. The draft policy around it does not — yet.

**A, 2026-08-19.** Cory: *"PLEASE MAKE ME A MODEL THAT USES VONA, AND DRAFTS A
NORMAL ROSTER AND DRAFTS UPSIDE LATE (FIND A WAY TO CALC UPSIDE CORRECTLY!!!!!"*

Prereg `draft/VONA-UPSIDE-LATE-PREREG-2026-08-19.md` and module
`draft/tools/vona_upside_plan.js`, both committed before it ran.
**All five controls pass. Two of three predictions FAILED, and the failures are
the useful part.**

---

## 1. ⭐ UPSIDE, CALCULATED CORRECTLY — this part worked, and it is the first time

```
spread(p) = proj_ceiling(p) − proj_mean(p)          [cross-source players only]
upside(p) = spread(p) − median{ spread(q) : q same position,
                                within ±7 positional ranks of p }
```

**Spearman(upside, proj_mean) = 0.008 on 302 players.** Measured on this board
by the module itself, which refuses to run above 0.25.

| | correlation with value |
|---|---|
| raw `proj_ceiling` | +0.9951 |
| **the spread we ship at weight 0.45** | **+0.70** |
| **residual upside (this)** | **+0.008** |

**That is a genuine upside signal — the first thing in this project that measures
upside instead of measuring value twice.**

## 2. THE PLAN IT PRODUCES, on your real twelve picks

| pick | seat | take | proj | upside | why |
|---|---|---|---|---|---|
| 33 | FLEX | RB Travis Etienne | 206 | −5.1 | VONA, tie → safer |
| 48 | QB | QB Joe Burrow | 367 | −8.7 | VONA, tie → safer |
| 53 | WR | WR Jameson Williams | 184 | −3.2 | VONA, tie → safer |
| 68 | TE | TE Kyle Pitts | 151 | +4.7 | VONA |
| 73 | bench | RB Jonathon Brooks | 143 | **+6.3** | upside |
| 88 | bench | WR Alec Pierce | 164 | **+6.2** | upside |
| 93 | bench | TE Dallas Goedert | 138 | **+15.0** | upside |
| 108 | DEF | DEF LA Rams | 132 | −0.3 | VONA |
| 113 | K | K Brandon Aubrey | 146 | +1.9 | VONA |
| 128 | bench | QB Daniel Jones | 300 | **+24.2** | upside |
| 133 | bench | QB Malik Willis | 301 | **+11.4** | upside |
| 148 | bench | RB Chris Rodriguez | 101 | **+13.6** | upside |

**The structure you asked for is there: starters chosen on VONA and broken
toward the SAFER player, bench chosen on upside. Five of six bench picks
changed** — value would have taken Pollard, Gainwell, Strange, Shough, Shakir.

## 3. ⛔ AND IT DRAFTS THREE QUARTERBACKS IN A ONE-QB LEAGUE

**Full roster: `QB3 · RB5 · WR3 · TE2 · K1 · DEF1`.**

**P137 FALSE.** I predicted ≥2 QB ✅, ≥2 TE ✅, ≤6 RB ✅, 1 K ✅, 1 DEF ✅ — and
**≥4 WR, which it misses at 3.** Worse than the letter of the prediction:
**picks 128 and 133 are both backup quarterbacks.** That is register 60's
degeneracy — *"nothing penalises a pileup, so whatever prices best gets taken
repeatedly"* — **reappearing in the model I built to avoid it.**

**Why it happens:** upside is orthogonal to *value*, which is what I measured
and what I claimed. **It is not orthogonal to positional sanity.** The bench
shortlist is by value, and a backup QB prices positively on value, so nothing in
the chain ever asks "do I already have a quarterback."

**P138 FALSE on the letter, and the letter is what counts.** Five of six bench
picks changed ✅ — but a **starter moved**: QB Joe Burrow where `draft_plan.js`
takes Drake Maye. My FALSE condition said a moving starter means "the shortlist
rule leaked into the seats." **It did not** — the mover was the low-uncertainty
tie-break, which I also declared. **So the prediction is FALSE as written and my
stated diagnosis for that failure is wrong. Both, recorded, rather than
reinterpreting my own prereg after seeing the output.**

**P139 FALSE on ADP, TRUE on projections.** I predicted upside buys *cheaper*
players. Median ADP is **156.3 for both** sets — identical. Median projection
differs by **1.1%**. **Upside is not buying cheaper players; it is buying
different ones at the same price.**

## 4. ⚠️ THE SHARPEST CAVEAT, AND IT IS NOT IN ANY PREDICTION

**Our own projection model is bearish on four of the five upside picks:**

| | `proj_ownmodel` − `proj_mean` |
|---|---|
| Dallas Goedert | −13.0 |
| Chris Rodriguez | −36.9 |
| **Daniel Jones** | **−77.7** |
| **Malik Willis** | **−206.0** — the most bearish disagreement on the entire board |

**This is structural, not bad luck.** Cross-source disagreement is highest
exactly where a player is unproven or his role is contested — and `own_v6`,
built on prior-season production, marks those same players down hardest. **So
"high residual upside" and "our own model hates him" are close to the same
statement.** An upside term selecting Malik Willis is not obviously finding a
sleeper; it may be finding a player nobody can price.

## 5. WHAT I AM NOT DOING

**Not adding a positional cap and re-running until the roster looks right.**
That is fitting on the output, `no_fit_guard` forbids it, and it is exactly how
`need`, `ceiling` and `opportunity_adj` each went wrong. **`SHORTLIST_N = 10`
and the ±7 window stay where the prereg put them.**

**The fix is structural and it is preregistered, not tuned:** a positional
maximum derived from the league's own roster rules — one starting QB means at
most two rostered, one TE means at most three — is a *policy* stated in advance,
not a constant chosen because it improved a number. `draft_plan.js` already has
the mechanism (`PLAN_MAX_POS`). **That is the next preregistered arm, and it is
post-draft.** Register 106.

**Nothing here ships before Saturday.** The model is report-only, writes no board
field and changes no weight. `draft/data/vona_upside_plan.json` is the artifact.

---

# 6. ⭐ ARM 2 — WITH THE CAP, IT IS THE MODEL YOU ASKED FOR. P140 TRUE on both halves.

The cap was **derived from the league's own `roster_slots` and written into the
prereg addendum before arm 2 ran**, with the condition that no number could
change afterwards. It is a policy, not a fitted constant.

```
one-starter skill (QB, TE)   starters + 1          QB 2 · TE 2
streamed onesies  (K, DEF)   1                     K 1 · DEF 1
multi-starter     (RB, WR)   starters + FLEX + 3   RB 6 · WR 6
```

**All six controls pass** — including C6, the cap enforcement, and C2's
orthogonality re-measured at **rho = 0.008**.

| pick | seat | take | proj | upside | why |
|---|---|---|---|---|---|
| 33 | FLEX | RB Travis Etienne | 206 | −5.1 | VONA, tie → safer |
| 48 | QB | QB Joe Burrow | 367 | −8.7 | VONA, tie → safer |
| 53 | WR | WR Jameson Williams | 184 | −3.2 | VONA, tie → safer |
| 68 | TE | TE Kyle Pitts | 151 | +4.7 | VONA |
| 73 | bench | RB Jonathon Brooks | 143 | **+6.3** | upside |
| 88 | bench | WR Alec Pierce | 164 | **+6.2** | upside |
| 93 | bench | TE Dallas Goedert | 138 | **+15.0** | upside |
| 108 | DEF | DEF LA Rams | 132 | −0.3 | VONA |
| 113 | K | K Brandon Aubrey | 146 | +1.9 | VONA |
| 128 | bench | QB Daniel Jones | 300 | **+24.2** | upside |
| 133 | bench | **WR Jalen Coker** | 124 | **+6.7** | upside |
| 148 | bench | RB Chris Rodriguez | 101 | **+13.6** | upside |

## **`QB2 · RB5 · WR4 · TE2 · K1 · DEF1`**

**Every bound P137 named is met** — ≥2 QB ✅ · ≥2 TE ✅ · ≤6 RB ✅ · **≥4 WR ✅**
(the one arm 1 missed) · 1 K ✅ · 1 DEF ✅.

**And the starter picks are byte-identical to arm 1.** The cap bound only on the
bench, which is the second half of P140 and the thing that would have condemned
the cap if it had failed: a cap that changes a *starting* pick is a cap that is
wrong.

**One pick moved:** at 133 the second backup quarterback (Malik Willis) is
blocked by `QB ≤ 2`, and the model takes **WR Jalen Coker, +6.7 upside** instead.
That is the whole fix — and it is worth noting **Daniel Jones survives at 128**,
so the roster still carries the upside quarterback, just not two of them.

## SO, AGAINST YOUR FOUR REQUIREMENTS

| you asked for | |
|---|---|
| **uses VONA** | ✅ starters are pure VONA; nothing is summed with it |
| **drafts a normal roster** | ✅ `QB2 RB5 WR4 TE2 K1 DEF1` |
| **drafts upside late** | ✅ all six bench picks chosen on upside; **5 of 6 differ from the value pick** |
| **upside calculated correctly** | ✅ **rho = +0.008 against value**, vs +0.70 for the term we ship and +0.9951 for raw ceiling |

⚠️ **THE CAVEAT FROM §4 SURVIVES AND I AM NOT BURYING IT UNDER A GOOD RESULT.**
`own_v6` is still bearish on the upside picks — **Daniel Jones −77.7**, Goedert
−13.0, Rodriguez −36.9. High residual upside and "our own projector hates him"
remain close to the same statement, because cross-source disagreement is highest
exactly where a player is unproven. **The cap fixed the roster shape. It did not
answer whether these are sleepers or players nobody can price.** That is the next
question, and it is a grade, not an argument.

**Still report-only. Writes no board field, changes no weight, ships nothing
before Saturday.** `draft/data/vona_upside_plan_capped.json`.
Run it yourself: `ARM=capped node draft/tools/vona_upside_plan.js`.

---

# 7. ⚖️ YOUR RULING APPLIED — `QB1 · RB6 · WR5 · TE1 · K1 · DEF1`. P141 TRUE.

**Cory: *"NOT 2 qbS AND 2 TE THATS NOT NORMAL"*. Accepted, `CAP.QB = 1`,
`CAP.TE = 1`.**

**My derivation was the weak link, not the mechanism.** I wrote *"one-starter
skill: `starters + 1`, one backup against injury"* — **that "+1" is my inference,
not something the league's roster rules say.** With six bench slots, spending two
of them on positions you start one of was a choice, and it was mine.

**This is not `no_fit_guard` being bent.** The guard stops *me* changing a
constant because I saw a number I liked. **You own what "normal roster" means and
it was one of the four requirements you set** — arm 2 failed a requirement whose
definition is yours. Written into the prereg addendum so nobody later reads it as
a fitted parameter.

| pick | seat | take | proj | upside |
|---|---|---|---|---|
| 33 | FLEX | RB Travis Etienne | 206 | −5.1 |
| 48 | QB | QB Joe Burrow | 367 | −8.7 |
| 53 | WR | WR Jameson Williams | 184 | −3.2 |
| 68 | TE | TE Kyle Pitts | 151 | +4.7 |
| **73** | bench | **RB Jonathon Brooks** | 143 | **+6.3** |
| **88** | bench | **WR Alec Pierce** | 164 | **+6.2** |
| **93** | bench | **RB Zach Charbonnet** | 100 | **+14.0** |
| 108 | DEF | DEF LA Rams | 132 | −0.3 |
| 113 | K | K Brandon Aubrey | 146 | +1.9 |
| **128** | bench | **WR Matthew Golden** | 136 | **+7.6** |
| **133** | bench | **WR Jalen Coker** | 124 | **+6.7** |
| **148** | bench | **RB Chris Rodriguez** | 101 | **+13.6** |

## **`QB1 · RB6 · WR5 · TE1 · K1 · DEF1`**

**All six controls pass.** Starter picks **unchanged again** — the cap has never
once bound on a starting seat across three arms, which is the check that would
condemn it. The two freed slots went where they should: **Charbonnet (RB, +14.0)
and Matthew Golden (WR, +7.6)** — both skill, both upside.

## ⚠️ THE PRICE OF THE RULING, RECORDED NOW RATHER THAN DISCOVERED IN WEEK 8

**QB1/TE1 means a bye week leaves that slot empty.** The fieldability probe
already measures it on the shipped engine, which is also QB1/TE1: **un-fieldable
skill weeks at 8 (QB) and 10 (TE).**

**Streaming covers it and this league's own numbers say so** — 802 completed
waiver adds 2023-25, with DEF 100% and K 83% of the pool cycling. **It is not
free. It is two weeks where you must remember to add a body.**

## ⚠️ AND THE CAVEAT GOT WORSE, WHICH IS THE HONEST HEADLINE

`own_v6` against the six upside picks:

| | `proj_ownmodel` − `proj_mean` |
|---|---|
| Zach Charbonnet | **+33.9** ✅ |
| Chris Rodriguez | −36.9 |
| Alec Pierce | −52.2 |
| Jalen Coker | −60.3 |
| **Matthew Golden** | **−119.0** |
| Jonathon Brooks | **ABSENT** — no prior-season production to model |

**Five of six, and Golden by 119 points.** This is now the clearest result of the
day and it is not a good one for the upside term: **cross-source disagreement is
highest exactly where a player is unproven, and our own projector — built on
prior-season production — marks those same players down hardest. Brooks does not
even have a projection from it.**

**Two readings, and I cannot separate them today:** either the upside term is
finding genuine sleepers that a production-based model structurally cannot see,
**or it is finding players nobody can price and calling the confusion upside.**
`own_v6` and the residual-upside term disagree by construction, so their
disagreement is not evidence either way.

**That is one preregistered grade, in January, on realised points — and it is the
single most important thing this model still owes.** Everything else about it now
works.

---

# 8. ⛔ CORRECTING §7'S HEADLINE — I quoted a systematic level offset as a per-player opinion

**I told you twice that `own_v6` "hates" the upside picks, with −119 on Matthew
Golden as the headline. That number is mostly not about Golden.**

Measured across every board player carrying both numbers:

| `own_v6 − board mean`, 499 players | |
|---|---|
| median | **−15.3** |
| mean | −19.8 |
| **share negative** | **80%** |

| position | median | p25 | p75 |
|---|---|---|---|
| QB | −17.9 | −51.0 | −10.1 |
| RB | −17.2 | −35.8 | −0.7 |
| WR | **−23.1** | −39.0 | −3.1 |
| TE | −3.0 | −16.8 | +4.0 |

**`own_v6` runs below the board mean on four players in five. "Our own model is
bearish on him" is the DEFAULT STATE, not a signal** — and I read five default
states as a finding.

## THE CAVEAT SURVIVES, WEAKENED, AND HERE IS THE HONEST VERSION

Corrected for the offset — each pick's percentile **within his own position**:

| pick | raw diff | position median | **percentile** |
|---|---|---|---|
| **Matthew Golden** | −119.0 | −23.1 | **0th** — the most bearish WR on the board |
| Jalen Coker | −60.3 | −23.1 | 9th |
| Alec Pierce | −52.2 | −23.1 | 16th |
| Chris Rodriguez | −36.9 | −17.2 | 23rd |
| **Zach Charbonnet** | +33.9 | −17.2 | **96th** — own_v6 likes him a lot |
| Jonathon Brooks | — | — | no own-model number at all |

**Four of five sit in the bottom quartile of their own position. That is still a
real skew and the direction of the caveat holds.** But **"five of six, and Golden
by 119 points" overstated it badly** — the −119 is a −23 league-wide receiver
offset plus a −96 player-specific one, and I presented the whole thing as
Golden's.

**Golden at the 0th percentile is the one that is genuinely alarming and it did
not need inflating.**

## AND THE BIGGER FINDING, WHICH IS NOT ABOUT UPSIDE AT ALL

**`own_v6` sits ~15–20 points below the board mean on 80% of players, and nothing
in the repo flags it.** It is harmless today *because* it is a labelled third
opinion that never enters `proj_mean` — **but it is exactly the kind of
systematic offset that would drag every projection down the moment someone
blended it in, and the January 2027 promotion decision (REC-2) is that moment.**
Register 107.

**Fourth self-correction today, same shape as the other three: I had a number
that fit a story and did not run the distribution behind it.** The check took
nine seconds, again.
