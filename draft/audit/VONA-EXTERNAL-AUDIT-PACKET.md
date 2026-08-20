# VONA — EXTERNAL AUDIT PACKET

**For a reviewer with no access to this repository.** Everything needed is in
this file. Written 2026-08-20; the draft it affects is 2026-08-22.

Cory (the owner) asked for an outside audit. This is scoped deliberately: the
VONA equations and the specific empirical claims made about them, NOT the whole
system. A reviewer who has to understand 4,600 tests to answer anything will
answer nothing useful in the time available.

---

## 0. WHAT I AM ASKING FOR, AND WHAT I AM NOT

**I want errors.** Places where the code does not compute what the comments say,
where a claimed measurement does not follow from the method, where an inference
is stronger than its evidence, where an edge case is wrong.

**I do not want a redesign.** The draft is in two days. A proposed rewrite
cannot be validated in time and will not be shipped, so proposing one spends
your effort and mine for nothing. If you believe the whole approach is wrong,
say so in three sentences and then audit what is here anyway.

**Assume nothing is sacred and nothing is verified.** Several claims below were
made by me today and reviewed by nobody. Two of them I got wrong twice before
arriving at the third answer, which is recorded so you can see the pattern.

---

## 1. THE LEAGUE, IN FULL

- 10 teams, half-PPR, snake, 15 rounds (150 slots).
- Starters: QB 1, RB 2, WR 2, TE 1, FLEX 1 (RB/WR/TE), K 1, DEF 1. Bench 6.
- Keepers: up to 3 per team, cost is a top round each (`top_picks_flat`), so a
  keeper forfeits rounds 1..n. 16 keepers across the league => 134 real picks.
- Owner drafts from **seat 8**, keeping Ja'Marr Chase (WR), Derrick Henry (RB),
  Kenneth Walker (RB) => forfeits rounds 1-3.
- His 12 remaining picks, by overall slot number:
  **33, 48, 53, 68, 73, 88, 93, 108, 113, 128, 133, 148**
- Replacement levels on the current board (points): QB 350.8, RB 168.6,
  WR 170.1, TE 141.7, K 125.9, DEF 100.5. `vorp = proj_mean - replacement[pos]`.

---

## 2. WHAT VONA IS SUPPOSED TO BE

Opportunity cost of waiting: a player's projection minus what this position is
expected to offer at the owner's NEXT pick.

    VONA(p) = p.proj_mean - E[best available at p.position at nextPick]

The expectation is over survival probabilities — the chance each player is still
on the board at the next pick, given the picks in between.

There is a second, optional branch (`VONA_SLOT_AWARE`, currently **off**) that
prices a player against the SLOT he would fill rather than against his own
position. Section 5 covers it.

---

## 3. THE CODE, VERBATIM

```javascript
=== vona() ===
  function vona(player, board, nextPick, survivalCtx) {
    if (nextPick == null) return player.proj_mean; // no future pick: everything is at stake
    const ctx = survivalCtx || {};
    /* REGISTER 56. `VONA_INCLUDE_SELF` decides whether the man you are pricing
     * is in the pool of what is available at your own next pick. He is, with
     * probability survival(him, nextPick) -- excluding him asserts that is zero.
     * expectedBestAvailable already handles him correctly once he is in the
     * list, because it is an expectation over "best SURVIVOR", so no second
     * formula is written here and none can drift from the first. */
    const samePos = board.filter(p => p.position === player.position
      && (CFG.VONA_INCLUDE_SELF || p.player_id !== player.player_id));
    const sameEba = expectedBestAvailable(samePos, nextPick, ctx);
    let straight = player.proj_mean - sameEba;
    /* A2, the diagnostic arm. Mutually exclusive with A1 in the sense that
     * running both double-counts survival -- the include-self pool already
     * carries the (1 - s) factor for the top man. Guarded so a future caller
     * cannot switch both on and read the product as an arm. */
    if (CFG.VONA_SURVIVAL_RESCALE) {
      if (CFG.VONA_INCLUDE_SELF) throw new Error(
        'VONA_SURVIVAL_RESCALE and VONA_INCLUDE_SELF are alternative arms of ' +
        'register 56 (P107) — running both applies the survival discount twice.');
      straight *= (1 - survival(player, nextPick, ctx));
    }
    if (!CFG.VONA_SLOT_AWARE) return straight;

    const slot = starterSlotMarginal(player, ctx.roster || [], ctx.league || {});
    if (slot.fills === 'starter') return straight;

    /* FLEX — PRICED ACROSS POSITIONS, AND DELIBERATELY NOT FLOORED.
     *
     * A second tight end cannot be valued against the third tight end: with the
     * TE slot full he is competing with the best RB or WR for one flex seat, and
     * that is the comparison that decides the pick. THE FLOOR AT 0 IS WHAT
     * COLLAPSED THE BOARD in the first attempt -- 1331 of 1686 players landed on
     * exactly 0 and ordering below the starters stopped existing. A negative
     * marginal is INFORMATION (he is worse than the field for that seat) and
     * keeping the sign keeps the ranking. */
    /* ONE BASELINE FOR BOTH ARMS. The first cut priced flex as a DIFFERENCE
     * (proj minus the field) and bench as an ABSOLUTE (insurance value), which
     * put them on incompatible scales: insurance is >= 0 and the flex marginal
     * runs deeply negative, so a bench quarterback at 0 outranked a flex
     * receiver at -20 -- a man who cannot start beating one who can. Measured:
     * tight ends fell 4 -> 1 and the sim then spent rounds 9 and 10 on Josh
     * Johnson and Joe Flacco. Both arms are now quoted against the SAME thing:
     * what this pick would otherwise buy. */
    const alts = flexEligibleBoard(board, ctx)
      .filter(p => String(p.player_id) !== String(player.player_id));
    const forgone = alts.length ? expectedBestAvailable(alts, nextPick, ctx) : 0;

    if (slot.fills === 'flex') {
      if (!alts.length) return straight;
      return player.proj_mean - forgone;
    }

    /* BENCH — INSURANCE VALUE, WHICH IS WHAT A BENCH PLAYER ACTUALLY IS.
     *
     * He cannot start, so his starting value is zero and his real worth is the
     * chance the man ahead of him stops playing. INJURY_RATE[pos] x his
     * standalone value is small, STRICTLY ORDERED (it is a positive multiple of
     * a quantity that already ranks him), and means something -- which is what
     * both earlier attempts lacked:
     *   · a flat 0 ties ~1300 players and destroys ordering below the starters;
     *   · a multiplicative crush on the SIGNED straight value moves negatives UP
     *     (0.10 x -30 = -3), floating bench players above startable ones at -5.
     * Measured consequence of that second bug: the roster went from TE 1 / RB 3
     * to TE 4 / QB 3 / RB 0 -- the change made the symptom it targeted worse.
     *
     * vorp is used rather than `straight` because it is non-negative for anyone
     * worth insuring and does not carry the wait-cost sign, so the ordering here
     * is "who is the best body at this position", which is the right question
     * for a backup. */
    /* SIGNED vorp, NOT max(0, vorp). The clamp zeroed every below-replacement
     * player, so all of them tied at exactly -forgone and the tie was won by
     * whatever the sort happened to favour -- quarterbacks. THIRD COLLAPSE OF
     * THE SAME SHAPE in this function: a floor at 0, a crush that inverted
     * negatives, and now a clamp that flattened the tail. Every one of them
     * destroyed ordering among players who cannot start, and every one of them
     * showed up as the board filling with one-start positions. */
    const rate = INJURY_RATE[player.position] || 0.15;
    if (CFG.VONA_WIRE_BENCH) {
      const wb = wireBenchValue(player, ctx, forgone, rate);
      if (wb != null) return wb;
      // No wire sample for this position (K/DEF -- nflverse is offense-only,
      // see wire_level.js's own accounting) -- fall back to the vorp rule
      // rather than inventing a floor with no evidence behind it.
    }
    return rate * (player.vorp || 0) - forgone;
  }

=== expectedBestAvailable() ===
  function expectedBestAvailable(playersAtPos, nextPick, survivalCtx) {
    const sorted = playersAtPos.slice().sort((a, b) => b.proj_mean - a.proj_mean);
    let expected = 0, allBetterGone = 1, massUsed = 0;
    for (const p of sorted) {
      const surv = survival(p, nextPick, survivalCtx);
      const pBest = surv * allBetterGone;
      expected += p.proj_mean * pBest;
      massUsed += pBest;
      allBetterGone *= (1 - surv);
      if (allBetterGone < CFG.SURVIVOR_CUTOFF) break;
    }
    // Whatever probability mass is left means everyone listed is gone; fall back
    // to the worst known player rather than silently crediting zero points.
    if (massUsed < 1 && sorted.length) {
      expected += sorted[sorted.length - 1].proj_mean * (1 - massUsed);
    }
    return expected;
  }

=== starterSlotMarginal() ===
  function starterSlotMarginal(player, roster, league) {
    const starters = league.starters || {};
    const flexEligible = { FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'], REC_FLEX: ['WR', 'TE'] };
    const mine = roster.filter(p => p.position === player.position)
      .sort((a, b) => b.proj_mean - a.proj_mean);
    const dedicated = starters[player.position] || 0;

    if (mine.length < dedicated) {
      return { value: player.vorp, fills: 'starter',
               why: `fills an empty ${player.position} slot` };
    }
    // Dedicated slots full — can they still start in a flex?
    let flexOpen = 0;
    Object.keys(flexEligible).forEach(slot => {
      if (!starters[slot]) return;
      if (!flexEligible[slot].includes(player.position)) return;
      const used = roster.filter(p => flexEligible[slot].includes(p.position)).length
        - flexEligible[slot].reduce((s, pos) => s + Math.min(starters[pos] || 0,
          roster.filter(r => r.position === pos).length), 0);
      flexOpen += Math.max(0, (starters[slot] || 0) - Math.max(0, used));
    });
    if (flexOpen > 0) {
      return { value: player.vorp, fills: 'flex', why: 'starts in your flex' };
    }
    // Bench: worth the upgrade over the man he replaces, discounted, plus a
    // small insurance premium scaled by how often this position misses games.
    const incumbent = mine[dedicated - 1] || mine[mine.length - 1];
    const upgrade = incumbent ? player.proj_mean - incumbent.proj_mean : player.vorp;
    const insurance = (INJURY_RATE[player.position] || 0.15) * Math.max(0, player.vorp) * 0.5;
    return {
      value: upgrade * CFG.BENCH_DISCOUNT + insurance,
      // WHICH SLOT, not just how much. Path naming used to threshold the
      // MAGNITUDE (`need > 0.5`), so a bench upgrade with any positive marginal
      // value was labelled "Fill TE now" while the TE slot was already full —
      // the mock-#1 complaint, and independent of the seat bug that caused the
      // roster to be wrong in the first place.
      fills: 'bench',
      why: upgrade > 0 ? `bench upgrade over your ${player.position}${dedicated}` : 'bye/injury cover',
    };
  }
```


---

## 4. EMPIRICAL CLAIMS MADE TODAY — please check the reasoning, not just the arithmetic

Each of these was measured by me on the live board. I am not asking you to
reproduce the numbers (you cannot — you do not have the data). I am asking
whether the METHOD supports the CONCLUSION.

**(a) "VONA goes flat."** The spread between the best VONA on the board and the
tenth-best, at each of the owner's 12 picks:

    pick   33     48     53     68     73     88     93    108    113    128    133    148
    spread 18.0   15.0    8.6    1.9    6.2    3.0    4.9    6.6   14.3    2.9    3.8    5.7

Conclusion drawn: from pick 68 on, VONA stops discriminating between players,
and a kicker leading the board by 0.3 points is noise, not signal. **Is that
conclusion sound? Is best-minus-tenth the right statistic for it?**

**(b) "Kickers are not favoured by the equation."** At pick 93 the best VONA per
position was K 2.81, RB 2.56, QB 2.50, WR 1.89, DEF 1.84, TE 1.52. Conclusion:
the kicker wins a near-tie rather than being over-valued. **Is that right, or is
a kicker topping the board at all evidence of a scale problem?**

**(c) "Pure VBD drafts kickers."** Asked for the highest-VORP player available
with no roster gating, the answer is a defense at 8 of the owner's 12 picks —
because replacement level is RB24/WR26, so every remaining skill player is below
replacement while a top defense stays above its own shallower one. Conclusion:
some slot-awareness is REQUIRED for a value model to be usable, and the gating
is the denominator of the value question rather than roster-construction
decoration. **Is that the right reading?**

**(d) The "why" behind a strike recommendation — I got this wrong twice.**
  - V1: tagged rows by "how many startable players are left" — fired on every
    row, so it carried no information.
  - V2: split VONA into a CLIFF part (drop to the next man) and a RUN part
    (field gets picked over). Arithmetically exact. But it produced VONA 7.6
    against a cliff of 18.6 at one pick, and I read that as urgent. It is not:
    a drop bigger than the whole cost of waiting means **the player probably
    lasts**.
  - V3 (current): report `P(gone by next pick)` and `expected drop if he is
    gone`, since VONA is approximately their product.

  **Is V3 actually right? Is `VONA / P(gone)` a sound way to back out the
  conditional drop, and is the 0.05 guard on small P(gone) the right treatment?**

---

## 5. THE SLOT-AWARE BRANCH — three failures of the same shape

`VONA_SLOT_AWARE` prices a non-starter against the slot he would actually fill.
It is **off in production**. Its history, from the code's own comments:

1. Flooring the flex marginal at 0 tied **1331 of 1686 players at exactly 0**;
   ordering below the starters ceased to exist and quarterbacks won the tie.
2. A multiplicative crush on the signed value moved negatives UP
   (`0.10 x -30 = -3`), floating bench players above startable ones. The roster
   went from TE 1 / RB 3 to TE 4 / QB 3 / RB 0 — the change made the symptom it
   targeted worse.
3. A clamp `max(0, vorp)` zeroed every below-replacement player, so they all
   tied at `-forgone` and the tie was won by whatever the sort favoured —
   quarterbacks again.

Every one destroyed ordering among players who cannot start, and every one
showed up as the board filling with one-start positions.

**Question: is there a structural reason this keeps happening — something about
pricing bench players on the same scale as starters that makes ties inevitable —
or were these three independent implementation errors?**

---

## 6. THE WEIGHT VECTOR, FOR CONTEXT

The final score is a weighted sum; VONA is the `value` term.

    value 1.0 · tier 0.0 · need 1.0 · risk 0.0 · ceiling 0.45 · keeper 1.0 · bye 0.0 · stack 1.0

`need` was moved from 0.0 to 1.0 today. It carries the player's VORP, gated on
whether a starter slot is open — so it is the only path by which a player's own
VORP reaches the score at all. Measured share of what separates the top five
candidates: **need 53.5%, value (VONA) 32.5%, ceiling 10.7%, stack 3.4%.**

**Question: with `need` carrying gated VORP at 53.5% and VONA at 32.5%, is it
still meaningful to call this a VONA-driven model? Is adding gated VORP to VONA
double-counting scarcity, given that VONA already prices against a draining
board?**

---

## 7. HOW TO ANSWER

Numbered findings, most severe first. For each: what is wrong, why it is wrong,
and what it would change. "This is fine" is a useful answer where it is true.

If a claim in section 4 does not follow from its method, say so plainly — those
are mine from today and nobody else has looked at them.


---

## 8. WHAT IS IN FLIGHT WHILE YOU READ THIS

So you are not auditing a moving target without knowing it:

- A **bench-option objective** (`--opt`) is being iterated in a replay harness by
  another lane. It is on its fourth version, has not yet passed its own
  known-positive control, and is **not shipped**. It would be an ADDITION for
  late-round/bench picks; it does not touch `vona()`, `survival()`,
  `starterSlotMarginal()` or the weight vector above. Nothing in this packet
  changes if it ships or dies.
- `VONA_SLOT_AWARE` (section 5) is **off** and a preregistered re-take is
  running. Its decision rule says a null leaves the flag off.

Everything in sections 2-6 is the model as it will be used on 2026-08-22 unless
something below fails.

---

## 9. THE THING THAT WOULD ACTUALLY RUIN THE DRAFT IS PROBABLY NOT THE EQUATION

Stated honestly, ranked by what I think the real risk is. **If you have time for
only one thing, section 4's claims are mine and unreviewed; but if you have a
view on anything here, it is worth more than a correction to a formula.**

**1 — THE BOARD IS THREE DAYS STALE AND THE REBUILD PIPELINE IS REFUSING.**
The war room downloads a board stamped `2026-08-19T08:52:22Z`. The draft is the
22nd. The nightly rebuild has refused to publish since, correctly — the publish
gate holds a candidate board back when any acceptance test fails, and leaves the
previous board live. Four separate blockers were found and three fixed; one
remains (a set of 48 per-source fields that are derived from the board and that
nothing in the pipeline regenerates, so a fresh board carries them stale and the
guard refuses it). **Consequence if unfixed: he drafts on 3-day-old projections
and ADP.** Not wrong, just old — and ADP moves most in the final week.

**2 — FOUR OF TEN TEAMS HAVE NOT DECLARED KEEPERS.** Keepers lock the night
before. Six teams have declared; 13 opponent keepers, all inside the top 21 by
ADP. Measured: the board withholds unconfirmed opponent keepers by design, and
that costs **zero** at all twelve of his picks today, because every declared
keeper is already inside the window the model removes. The exposure is exact and
bounded: **one freed player per keeper ranked deeper than the pick in
question**, and the four silent teams could add at most twelve more keepers.
**Is that the right way to bound it?**

**3 — THE LIVE SLEEPER SYNC HAS NEVER RUN AGAINST A REAL DRAFT.** It is hardened
against five specific failure modes found in a chaos drill: a 200-OK that is not
an array, an empty array mid-draft (which would rewind the board to pick 1), a
shrinking pick list (a commissioner undoing a pick), a mid-draft 403 after the
draft id has already proved itself, and picks arriving with no resolvable id
(counted, not dropped silently). A separate defect — `is_keeper` being dropped
by the pick normaliser — was found only because someone placed real keepers.
**Question: what failure mode does that list not contain? The board is
recomputed from the pick feed on every tick, so anything the feed can do wrong,
the board can do wrong.**

**4 — THE MODEL.** Sections 2-6. Real, and fourth.

**NOT ON THIS LIST, checked rather than assumed:** 16 test suites are red, and
none of them is on a draft surface — they are stamp-specific alarms pointed at a
superseded implementation. Every draft-critical suite is green as of writing:
engine, app-wiring, context-interface, sync/reconcile, keepers, survival
honesty, the recommendation rows, and the four separate guards that stop a
drafted player reaching any panel.


---

## 10. THE THREE TERMS THAT ACTUALLY DECIDE A PICK — MEASURED, NOT ASSUMED

The score has eight weighted terms and two post-assembly deltas. **Three of them
move anything.** Measured through the real `recommend()` path, top ten at each of
the owner's twelve real picks, roster growing as the model drafts:

| term | weight | fires on | mean \|value\| | max | verdict |
|---|---|---|---|---|---|
| `value` (VONA) | 1.0 | **120/120** | 3.56 | 16.71 | decides picks |
| `need` (VORP, slot-gated) | 1.0 | **102/120** | 11.22 | 35.08 | fires often |
| `ceiling` | 0.45 | **88/120** | 3.84 | 9.00 | fires often |
| `stack` | 1.0 | 1/120 | 4.00 | 4.00 | rare |
| `keeper` | 1.0 | **0/120** | 0.00 | 0.00 | inert |
| `tier`, `risk`, `bye` | 0.0 | 0/120 | — | — | weighted away by design |
| `onesie`, `doctrine` | post | **0/120** | 0.00 | 0.00 | inert |

**So the model is VONA + slot-gated VORP + ceiling.** Sections 2-3 gave you the
first two. The third is below.

**`keeper` at weight 1.0 contributing zero is not a bug**, and it is worth
stating because it looks like one. It prices whether a player drafted THIS year
would be worth keeping NEXT year: `ramp x P(keep) x (nextYearVorp - what that
forfeited pick returns next year) x 0.75`. Two independent reasons it is zero
here: the measured ramp table is `{4-6: 1.0, 7-9: 0.2, 10-12: 0.0, 13-15: 0.0}`,
so it is switched off from round 10; and in rounds 4-6 where it is live, keeping
a mid-round player costs a FIRST-round pick next season under this league's
`top_picks_flat` rule, so the surplus is negative for everyone available.
**Question: is that reasoning right, or is a zero here hiding an error?**

**⚠️ NOTE THE NAMING TRAP, which confused the owner and would confuse you.**
`keeper` (above) has nothing to do with the three players he is actually keeping.
Those enter through **`need`**, which reads `ctx.roster` — so holding 2 RB and
1 WR is what makes the RB slots full and WR2 open, and that is the second-largest
term on his board.

### The ceiling term, verbatim

```javascript
  function upsideBonus(player, pickNumber, totalPicks, myPicksLeft, allStages, gateOpen) {
    // UNIT MISMATCH — the bug this fixes.
    //
    // `raw` is proj_ceiling minus proj_mean, which is a SPREAD: it tracks
    // proj_sd, not value over replacement. On the real board that is 136 points
    // for Jahmyr Gibbs and 110 for McCaffrey. Every other term in the composite
    // is denominated in points-over-replacement, where an elite player scores
    // ~150 and a round-6 pick scores ~10. So the raw spread was entering the
    // sum at elite-VORP magnitude for anyone with a wide projection, and the
    // wider the uncertainty the bigger the bonus — variance was being paid for
    // as though it were value.
    //
    // The plausibility rail caught it and was ignored: on the 2026-08-07 board
    // it fired `ceiling is Nx this player's VORP` on 15 of the top 15, reaching
    // 15.0x at pick 54. RAIL_COMPONENT_RATIO = 1.0 states the contract plainly
    // — no single component may exceed the player's own VORP — so a term
    // running 15x over it is not a tuning question.
    //
    // Two changes, both in named config:
    //   CEILING_SPREAD_SHARE puts the spread on the composite's scale. Only a
    //   fraction of theoretical upside is actually collectable, and paying the
    //   whole spread assumes every boom outcome lands.
    //   CEILING_MAX_BONUS is a hard ceiling on the ceiling. Whatever the
    //   projection's variance, this term cannot outweigh the value terms.
    //
    // Deliberately NOT capped at the player's own VORP: a round-12 flier has a
    // VORP near zero and upside is the entire reason to take him. Capping there
    // would delete the lottery-ticket behaviour the next line exists to create.
    /* ── POSITION-NORMALISED, 2026-08-13. THE UNITS DEFECT, FIXED AT SOURCE ──
     *
     * `proj_ceiling - proj_mean` is a SPREAD IN RAW SEASON POINTS. A quarterback
     * scores 350-400 a season and a tight end 150, so the QB's spread is the
     * biggest number on the board BY CONSTRUCTION — p90 of 66.5 at QB against
     * 30.8 at TE. Ranking bench picks on it MEASURES SCALE AND CALLS IT UPSIDE,
     * and it is why the board kept handing Cory a second quarterback and a
     * second tight end he could not start.
     *
     * WHY THE ONESIE CAP DID NOT FIX IT, and this is the part that matters: the
     * cap treats the OUTPUT while this drives the INPUT. And the term was
     * supposed to be OFF — MEASURED_WEIGHTS.ceiling was 0 at the time (ruled
     * to 0.45 on 2026-08-17; see the record at the constant), because the
     * ceiling effect measured -4.8 with a [-26,+17] interval and could not be
     * signed.
     * But the bench branch floors it: `Math.max(BENCH_CEILING_FLOOR, w.ceiling)`
     * with BENCH_CEILING_FLOOR = 0.25 SILENTLY RE-ENABLES A WEIGHT THE
     * MEASUREMENT SET TO ZERO, for every bench pick. So the deliberately-
     * disabled, unsignable, unnormalised term is the primary ranker of the whole
     * back half of the draft.
     *
     * THE FIX IS A RATIO, NOT A CAP. Divide each spread by the TYPICAL SPREAD AT
     * ITS OWN POSITION, then re-scale by the board-wide typical spread so the
     * term keeps its magnitude on the composite's scale. What survives is "how
     * much more upside than a normal player at this position" — dimensionless,
     * and therefore comparable across positions, which is the one thing the raw
     * spread never was. Median rather than mean: a handful of extreme boom
     * projections at one position would otherwise set that position's scale. */
    const rawSpread = (player.proj_ceiling || player.proj_mean) - player.proj_mean;
    const cs = _ceilingScales;
    const posScale = cs && cs.scales[player.position];
    const raw = (posScale > 0 && cs.ref > 0) ? rawSpread * (cs.ref / posScale) : rawSpread;
    // Ceiling is LATE-ONLY for the LIVE recommendation: zero until CEILING_LATE_FROM
    // of the draft, then ramps to full (Cory's model — mean+VONA+tiers decide early/mid;
    // throwaway rounds get the lottery). `allStages` restores the old full-draft ramp
    // ONLY for the strategy-exploration shadows, whose whole purpose is to explore
    // ceiling-forward drafts (ctx.ceilingAllStages); it never touches the live board.
    const lateness = totalPicks ? Math.min(1, pickNumber / totalPicks) : 0.5;
    const from = CFG.CEILING_LATE_FROM != null ? CFG.CEILING_LATE_FROM : 0.6;
    /* `gateOpen` REPLACES THE PROXY WITH THE REAL CONDITION.
     *
     * CEILING_LATE_FROM = 0.6 is a PROXY for "the throwaway rounds" — pick 90 of
     * 150. The bench branch fires on the actual condition it is proxying for:
     * every starting slot is full, so from here on every pick IS a lottery
     * ticket. Measured, that happens near pick 70, so through rounds 8 and 9 the
     * proxy said "not late yet" while the real condition had already arrived and
     * the branch's only anchor read 0.00 for every player on the board.
     *
     * So the bench branch passes gateOpen and uses the condition instead of the
     * proxy. THE STARTER BRANCH IS UNTOUCHED — it still ramps from 0.6, because
     * that is the arithmetic the 2026-08-10 ceiling decision was made on. */
    const gate = gateOpen ? 1
      : allStages ? (0.3 + 0.7 * lateness)
      : Math.max(0, (lateness - from)) / Math.max(1e-6, 1 - from);
    const endgame = myPicksLeft != null && myPicksLeft <= 5 ? 1.6 : 1.0;
    const scaled = raw * CFG.CEILING_SPREAD_SHARE * gate * endgame;
    return Math.max(-CFG.CEILING_MAX_BONUS, Math.min(CFG.CEILING_MAX_BONUS, scaled));
  }
```

`MEASURED_WEIGHTS.ceiling = 0.45`, set by the owner's ruling after three
preregistered runs across two seed sets beat zero at every value from 0.15 to
0.65. **Questions:** (a) the reference implementation this project studied
(`ffanalytics`) emits `rank`, `floor_rank` and `ceiling_rank` as THREE SEPARATE
rankings and never adds ceiling into value — we add `0.45 x ceiling` to every
player at every pick. Is adding upside into a single score defensible, or is the
reference right that upside is a bench instrument? (b) does the code above
compute what its comments claim?
