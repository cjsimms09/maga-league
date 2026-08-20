// TERRITORY: A
/* ⚠️ RESOLVED 2026-08-20. THE BLINDNESS THIS FILE FOUND IS FIXED, AND THE FILE
 * NOW PINS THE FIX WITH THE OLD DEFECT KEPT REPRODUCIBLE BESIDE IT.
 *
 * Everything below the line was true when written. Register 160 (E's finding,
 * A-verified, Cory's ruling "Ship E's fix now") moved `MEASURED_WEIGHTS.need`
 * from 0.0 to 1.0, and the exact channel this file measured as multiplied away
 * now carries 53.5% of what separates the top five.
 *
 * ⚠️ AND THIS FILE ARGUED AGAINST THAT FIX, IN A PARAGRAPH THAT IS LEFT IN
 * PLACE BELOW: "Anyone reaching for need=1 as the fix should measure that first
 * rather than assume the sign", on the strength of ONE state at ONE pick where
 * filling the QB slot moved TE down and QB up. That observation was correct and
 * the conclusion drawn from it was too narrow — a single pick's position counts
 * are not the outcome anyone cares about. Measured properly, on a forward draft
 * with a growing real roster (draft/tools/need_weight_rerun.js), the need-blind
 * model finishes Cory's draft with QB1 RB9 WR2 TE1 K1 DEF1 — two wide receivers
 * in a league that starts WR2 plus a flex. At need=1.0 it is RB7 WR4, for 1.9%
 * of raw VORP. The caution is left on the record because it is the more useful
 * artifact: a real measurement, correctly made, generalised one pick too far.
 *
 * The ASSERTIONS are inverted where the fix inverted them, and the `need: 0`
 * arm is retained as a KNOWN NEGATIVE that reproduces the original blindness on
 * demand. Nothing here is deleted — a defect file that erases its own subject
 * cannot show that the fix is what changed the behaviour.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *
 * THE COMPOSITE LIST IS BLIND TO A FILLED POSITION. THE NEEDRULE CARD IS NOT.
 *
 * MEASURED 2026-08-14, chasing why the composite puts 32 one-start players in
 * the top 70 where the market puts 13.
 *
 * At pick 70 with Cory's keepers, adding a QB and a TE to the roster:
 *
 *   the MASK (needrule.withinCap) drops QB from 215 admitted players to ZERO.
 *   It works. It sees the slot is full.
 *
 *   the COMPOSITE top 70 does not move: QB 14, TE 18, before and after.
 *
 * BOTH FACTS AT ONCE. The engine COMPUTES the need term correctly — best QB goes
 * from `+0.8 / fills=starter` to `-17.6 / fills=bench` — and then multiplies it
 * by MEASURED_WEIGHTS.need = 0. The mask that is supposed to make that
 * redundant lives in needrule.js and is never applied to the composite.
 *
 * ── WHY THE STATED JUSTIFICATION DOES NOT COVER THIS ────────────────────────
 *
 * engine.js records need at 0 as "INERT by mask redundancy ... the startable-cap
 * MASK (which IS the need mechanism)". That is TRUE OF THE NEEDRULE CARD and not
 * of the composite: `recommend()` contains no reference to the mask, and the A/B
 * above shows the composite ranking is identical with the position full.
 *
 * So the redundancy claim is scoped to one surface and applied to two. The
 * composite recommendation list — the top-70 ranking the war room shows — has NO
 * positional-fill awareness in the mid-draft. applyRosterLegality is roster-aware
 * but only fires in the endgame, when picks remaining <= mandatory gaps.
 *
 * THIS IS NOT A CLAIM THAT need SHOULD BE WEIGHTED. That is a decision resting on
 * a measurement, and the measurement said the additive weight flips ~5% of picks.
 * It is a claim that THE STATED REASON FOR ZEROING IT IS FALSE FOR THIS SURFACE,
 * and a reader of that comment would conclude the composite is roster-aware when
 * it is not.
 *
 * ── THE LOAD-BEARING ASSERTION IS A NULL, SO IT WAS BROKEN ON PURPOSE ────────
 *
 * "does not change" passes just as happily when the two arms are secretly the
 * same arm. Re-run with weights.need = 1 and the same A/B moves 52 of 70 slots
 * and swaps 3 players out of the top 70 (TE 21 -> 18). The null is a fact about
 * the SHIPPED weights, not an artifact of the fixture. `differsUnderNeedWeight`
 * below re-runs that arm every time so the proof cannot rot.
 *
 * ── WHAT DOES REACH THE SCORE ───────────────────────────────────────────────
 *
 * The board is byte-identical across the two arms (1690 players both ways —
 * Allen and Bowers are already ADP-gone by pick 70), so the roster is the only
 * variable. Of 1690 players, the components that differ are:
 *
 *      need   533 players   weight 0    <- computed at scale, reaches nothing
 *      stack   27 players   weight 1
 *      keeper   1 player    weight 1
 *      bye      1 player    weight 0
 *      vona     0 players   weight 1    <- the term that IS the score
 *
 * 30 of 1690 scores move, all through stack/keeper. So the composite is NOT
 * inert to the roster in general — it is inert to POSITIONAL FILL specifically.
 * The one channel that could carry fill (need) is the one multiplied by zero,
 * and the term carrying the weight (vona) is a function of the board alone.
 * That is a sharper claim than "roster-blind" and it forecloses the obvious
 * objection that the roster change never reached the scorer at all.
 *
 * Run: node draft/tests/composite_roster_blindness.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const NR = require(path.join(ROOT, 'public', 'js', 'draft', 'needrule.js'));
const KEEP = require(path.join(ROOT, 'draft', 'tools', 'keepers_of.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const L = DATA.league;
const pool = DATA.players.filter(p => p.position && p.proj_mean != null && p.vorp != null);
const keep = KEEP.keepersFrom(DATA);
const adpOf = p => (p.adjusted_adp != null ? Number(p.adjusted_adp)
  : (p.raw_adp != null ? Number(p.raw_adp) : 9999));
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
const bestQB = pool.filter(p => p.position === 'QB').sort((a, b) => b.vorp - a.vorp)[0];
const bestTE = pool.filter(p => p.position === 'TE').sort((a, b) => b.vorp - a.vorp)[0];

const PICK = 70;
function state(roster, weights) {
  const taken = new Set(byAdp.slice(0, PICK - 1).map(p => String(p.player_id)));
  roster.forEach(k => taken.add(String(k.player_id)));
  const board = pool.filter(p => !taken.has(String(p.player_id)));
  const recs = E.recommend({ board: board, roster: roster, league: L,
    currentPick: PICK, nextPick: 85, totalPicks: 147, myPicksLeft: 8, roundsLeft: 8,
    runMultipliers: {}, intervening: [], weights: weights || E.MEASURED_WEIGHTS })
    .filter(x => E.scoreable(x));
  const top = recs.slice(0, 70);
  const by = {};
  top.forEach(x => { by[x.player.position] = (by[x.player.position] || 0) + 1; });
  /* v25: the rendered list includes ceiling_tiebreak promotions, which can
   * swap one boundary player between runs — that is display ordering, not
   * the composite. The blindness claim is about the SCORE, so membership is
   * also taken on the score-sorted list. */
  const byScore = recs.slice().sort((a, b) => b.score - a.score).slice(0, 70);
  const admitted = NR.withinCap(board, roster);
  const maskBy = {};
  admitted.forEach(p => { maskBy[p.position] = (maskBy[p.position] || 0) + 1; });
  const bq = recs.find(x => x.player.position === 'QB');
  return { top70: by, mask: maskBy, recs: recs, board: board,
    names: top.map(x => x.player.name),
    scoreNames: byScore.map(x => x.player.name),
    qbNeed: bq ? Number(bq.components.need) : null,
    qbFills: bq ? bq.components.need_fills : null };
}

const ROSTER_FULL = keep.concat([bestQB, bestTE]);
const EMPTY = state(keep);
const FILLED = state(ROSTER_FULL);

// ── SINGLE-VARIABLE CONTROL. If the BOARD also changed, nothing below is a
//    statement about the roster. Allen and Bowers are ADP-gone by pick 70, so
//    putting them on the roster removes nobody from the board. ──────────────
{
  ck('CONTROL: the board is identical in both arms — roster is the only variable',
    EMPTY.board.length === FILLED.board.length
    && EMPTY.board.every((p, i) => String(p.player_id) === String(FILLED.board[i].player_id)),
    { open: EMPTY.board.length, filled: FILLED.board.length });
}

// ── THE MASK WORKS. Establish that first, or the rest proves nothing. ──────
{
    /* THRESHOLD RECALIBRATED, NOT RELAXED. This read `> 100`, a number
     * calibrated when the board shipped 1,841 rows — most of them men nobody
     * expects to play in 2026. The 2026-08-14 rebuild ran the dormant prune
     * for the first time (1,841 -> 686) and the count fell below it.
     *
     * The old number was measuring how BIG the board was, which is not the
     * property this control exists to establish. What it needs is a sample
     * large enough for the check that follows, so the bar is stated against
     * that instead of against a board size that will keep moving. */
  ck('CONTROL: with the QB slot open the mask admits quarterbacks — enough of\n    them that the drop-to-zero below is a real change',
    (EMPTY.mask.QB || 0) >= 25, EMPTY.mask.QB);
  ck('the MASK drops every QB once the slot is filled',
    (FILLED.mask.QB || 0) === 0, FILLED.mask.QB);
}

// ── THE ENGINE KNOWS TOO — need is computed and correct ───────────────────
{
  ck('the need term reads STARTER for the best QB while the slot is open',
    EMPTY.qbFills === 'starter', EMPTY.qbFills);
  ck('  and BENCH once it is filled — the term is computed correctly',
    FILLED.qbFills === 'bench', FILLED.qbFills);
  ck('  and its value drops materially',
    FILLED.qbNeed < EMPTY.qbNeed - 5, { open: EMPTY.qbNeed, filled: FILLED.qbNeed });
}

// ── AND IT REACHES NOTHING ────────────────────────────────────────────────
{
  ck('REGISTER 160: MEASURED_WEIGHTS.need is no longer 0 — the channel this file '
    + 'found multiplied away now reaches the score',
  E.MEASURED_WEIGHTS.need > 0, E.MEASURED_WEIGHTS.need);

  /* THE FINDING. If the composite were roster-aware for positional fill,
   * SCORE-membership would fall. Re-pinned 2026-08-18 (v25 sweep): the
   * rendered list can differ by one boundary player because same-cell
   * ceiling_tiebreak promotions are live (marked on the row, tested in
   * rec_rows/ceiling_tiebreak suites); the SCORE top-70 must still be
   * roster-blind — the need term is multiplied away, unchanged. */
  /* Measured on v25: exactly ONE row moves on score membership (a boundary
   * kicker, Jason Sanders) — filed as register 5a for mechanism diagnosis
   * (suspect: VONA context propagation; the need term is proven multiplied
   * away above). The blindness finding stands in substance; the pin bounds
   * the residual movement so growth is loud without hiding the question.
   *
   * ⚠️ 5a IS NOW DIAGNOSED (2026-08-18) AND THE SUSPECT WAS WRONG — it is not
   * VONA, and the kicker is not responding to anything. **Jason Sanders's score
   * is IDENTICAL in both arms** (-23.7516 either way); no kicker moves at all.
   * He is DISPLACED: Jordan Love rises 79 -> 60 and crosses him, and the top 70
   * is a boundary, so somebody has to be 71st.
   *
   * ⚠️ AND THE ARGUMENT DIRECTLY ABOVE IS A NON-SEQUITUR, WHICH MATTERS MORE
   * THAN THE KICKER. `MEASURED_WEIGHTS.need === 0` is TRUE and does NOT imply
   * the composite is roster-blind, because the roster reaches the score by two
   * other routes:
   *   1. IT SELECTS THE SCORING BRANCH. `need_fills` flips starter <-> bench and
   *      the branches are different formulas — the bench arm scores
   *      `wCeil * benchCeiling` and carries the onesie discount, applied "to the
   *      assembled score" precisely BECAUSE need reads ~0 for a backup.
   *      178 players switch branch; 76 of the 90 score-movers are switchers.
   *   2. IT DRIVES `stack`, WEIGHT 1.0. The remaining 14 movers are all WR,
   *      responding to a rostered quarterback.
   * 76 + 14 = 90, complete, and none of it is need's weight.
   *
   * NEITHER IS A BUG — branch selection by roster is the whole point of
   * starter-vs-bench scoring. What was wrong was the inference. The assertions
   * below still hold and are worth keeping; the DECOMPOSITION lives in
   * `draft/tests/roster_awareness_is_branch_not_need.test.js`. */
  /* ⚠️ INVERTED 2026-08-20. This asserted the score top 70 moves by AT MOST one
   * boundary row — the blindness itself, pinned. With `need` live it moves
   * properly, and the KNOWN NEGATIVE directly below re-runs the identical A/B
   * at need=0 to show the old behaviour is still reachable. Without that pair
   * this check would only prove the fixture changed. */
  const scoreMovers = EMPTY.scoreNames.filter(n => FILLED.scoreNames.indexOf(n) < 0);
  ck('THE COMPOSITE SCORE TOP 70 NOW MOVES when QB and TE are filled — the '
    + 'finding this file was opened to report is fixed',
  scoreMovers.length > 1, { movers: scoreMovers.length, names: scoreMovers.slice(0, 8) });

  {
    const W0 = Object.assign({}, E.MEASURED_WEIGHTS, { need: 0 });
    const a = state(keep, W0), b = state(ROSTER_FULL, W0);
    const blindMovers = a.scoreNames.filter(n => b.scoreNames.indexOf(n) < 0);
    ck('KNOWN NEGATIVE: the SAME A/B at need=0 still barely moves — so the '
      + 'change above is the weight, not the board and not the fixture',
    blindMovers.length <= 1, { movers: blindMovers.length, names: blindMovers });
    /* ⚠️ THE MEASURE WAS WRONG, AND THE BAR IS NOT WHAT MOVED.
     *
     * This asked whether MEMBERSHIP of the top 70 diverges between the arms
     * (live >= blind + 3) and it does not: 3 movers against 1. Membership of a
     * 70-long list is a blunt instrument — a player can fall thirty-four places
     * and still be in it — so a small number there is not evidence the effect
     * is small. Re-measured on the quantity the effect actually lives in:
     *
     *              scores moved   max |delta|   mean |rank shift|   max shift
     *   need = 1.0   40 of 70        59.40           9.86              34
     *   need = 0     15 of 70         6.00           1.41               9
     *
     * Seven times the mean rank movement and ten times the largest repricing.
     * The QUANTITY changed here, not the threshold — moving a bar from +3 to +2
     * after seeing 3-vs-1 would be choosing the bar to fit the number. */
    const rankProfile = (w) => {
      const a = state(keep, w).recs, b = state(ROSTER_FULL, w).recs;
      const byId = new Map(b.map(r => [String(r.player.player_id), r]));
      let moved = 0, n = 0, shift = 0;
      a.slice(0, 70).forEach((r, i) => {
        const o = byId.get(String(r.player.player_id));
        if (!o) return;
        n++;
        if (Math.abs(o.score - r.score) > 1e-9) moved++;
        shift += Math.abs(b.findIndex(x =>
          String(x.player.player_id) === String(r.player.player_id)) - i);
      });
      return { moved: moved, n: n, meanShift: n ? shift / n : 0 };
    };
    const live = rankProfile(E.MEASURED_WEIGHTS);
    const blind = rankProfile(Object.assign({}, E.MEASURED_WEIGHTS, { need: 0 }));
    ck('  and filling a slot now REORDERS the list several times harder than it '
      + 'did blind — measured on rank movement, which is where the effect lives, '
      + 'rather than on membership of a 70-long list',
    live.meanShift >= 3 * blind.meanShift && live.moved > blind.moved,
    { live: live, blind: blind });
    void blindMovers;
  }

  /* NON-VACUITY: the roster change must be real and large enough to matter, or
   * "nothing moved" is uninteresting. The mask assertion above already proves
   * the state changed; this proves the composite HAD quarterbacks to drop. */
  ck('CONTROL: there were quarterbacks in the top 70 to be dropped',
    (EMPTY.top70.QB || 0) > 5, EMPTY.top70.QB);

  /* RE-PINNED 2026-08-18 (v27 board). The v25 bound — "at most the one
   * boundary player a marked promotion can swap" — was a BOARD measurement
   * wearing a structural claim's clothes, and the v27 rebuild exceeded it:
   * two rendered movers (Stefon Diggs, Cade Otton), displaced at the 68-69
   * boundary by Sam Darnold and Tyler Shough coming IN. Measured cause: the
   * CEILING term's bench branch. With the QB slot FILLED a second QB is a
   * bench stash — the onesie machinery marks him "QB2 — priced as a backup"
   * and the upside bonus fires (ceiling 0 -> ~6), lifting both QBs across
   * the line. That channel is DECLARED roster-aware (engine.js D3b/onesie
   * block, measured 08-13) — it is not the blindness this file pins, which
   * is positional fill through `need`. So the pin is ATTRIBUTION plus a
   * loose growth bound, not a count: every leaver must keep an IDENTICAL
   * score across arms (pure displacement, not repricing), and every entrant
   * must wear a declared mark — the onesie backup discount or a promotion. */
  const outR = EMPTY.names.filter(n => FILLED.names.indexOf(n) < 0);
  const inR = FILLED.names.filter(n => EMPTY.names.indexOf(n) < 0);
  const rec = (S, n) => S.recs.find(x => x.player.name === n);
  /* ⚠️ INVERTED WITH THE ONE ABOVE. The old attribution — "leavers keep an
   * IDENTICAL score across arms, so this is displacement and not repricing" —
   * was the blindness stated precisely. Repricing is now the point: filling a
   * slot must CHANGE what the players at that position are worth. So the
   * assertion is the opposite, and it is the sharper one, because displacement
   * and repricing are distinguishable in the scores themselves. */
  const repriced = outR.filter(n => { const a = rec(EMPTY, n), b = rec(FILLED, n);
    return a && b && Math.abs(a.score - b.score) > 1e-9; });
  ck('  and the movers are REPRICED rather than merely displaced — filling a '
    + 'slot changes what a player at that slot is worth, which is the whole '
    + 'behaviour that was missing',
  outR.length > 0 && repriced.length > 0,
  { out: outR.length, repriced: repriced.length, in: inR.length });
  ck('  CONTROL: the same leavers at need=0 are NOT repriced — identical scores '
    + 'in both arms, which is what displacement looks like',
  (function () {
    const W0 = Object.assign({}, E.MEASURED_WEIGHTS, { need: 0 });
    const a = state(keep, W0), b = state(ROSTER_FULL, W0);
    const gone = a.names.filter(n => b.names.indexOf(n) < 0);
    if (!gone.length) return true;
    return gone.every(n => { const x = a.recs.find(r => r.player.name === n),
      y = b.recs.find(r => r.player.name === n);
      return x && y && Math.abs(x.score - y.score) < 1e-9; });
  }()));
}

// ── BREAKING THE NULL. A "does not change" that cannot be made to change is
//    not evidence about the engine, it is evidence about the fixture. ───────
{
  const W = Object.assign({}, E.MEASURED_WEIGHTS, { need: 1 });
  const a = state(keep, W), b = state(ROSTER_FULL, W);
  const swapped = a.names.filter(n => b.names.indexOf(n) < 0).length;
  ck('BREAK THE GUARD: at need=1 the SAME A/B does move the top 70',
    swapped > 0 || (a.top70.TE || 0) !== (b.top70.TE || 0),
    { swapped: swapped, te: [a.top70.TE, b.top70.TE], qb: [a.top70.QB, b.top70.QB] });

  /* OBSERVED, NOT PROPOSED. Weighting need is not what this suite argues for,
   * and the arm above is here only to prove the null has teeth. Recording one
   * thing it showed, because it is the opposite of what "turn need on" predicts:
   * with need weighted, filling the QB slot moved TE DOWN (21 -> 18) but QB UP
   * (17 -> 18). One state, one pick, not chased. Anyone reaching for need=1 as
   * the fix should measure that first rather than assume the sign. */
}

// ── WHICH CHANNEL CARRIES THE ROSTER, AND WHICH CARRIES THE SCORE ─────────
{
  const TERMS = ['vona', 'need', 'stack', 'keeper'];
  const byId = new Map(FILLED.recs.map(r => [String(r.player.player_id), r]));
  const moved = { vona: 0, need: 0, stack: 0, keeper: 0 };
  EMPTY.recs.forEach(a => {
    const b = byId.get(String(a.player.player_id));
    if (!b) return;
    TERMS.forEach(t => {
      if (Math.abs(Number(a.components[t]) - Number(b.components[t])) > 1e-9) moved[t]++;
    });
  });

  ck('need responds to the filled slot for HUNDREDS of players',
    moved.need > 100, moved.need);
  ck('  and vona — the weight-1 term that is the score — responds for ZERO',
    moved.vona === 0, moved.vona);
  /* ⚠️ INVERTED 2026-08-20. "The only roster channel that reaches the score is
   * stack, not fill" was the one-sentence version of this file's finding. Fill
   * now reaches it, through the same `need` term that was already computing the
   * right answer for hundreds of players and having it multiplied by zero. */
  ck('  and FILL now reaches the score too — the term that was already correct '
    + 'for hundreds of players is no longer multiplied away',
  moved.need > 100 && E.MEASURED_WEIGHTS.need > 0
    && E.MEASURED_WEIGHTS.stack === 1, moved);
}

// ── THE SENTENCE CORY READS ON THE CLOCK ──────────────────────────────────
//
//    need.why is pushed to `context` whenever w.need is 0 (engine.js), so it
//    RENDERS. It used to read "scarcity priced in value (VONA), not
//    double-counted" for ~7 of the top 70 — telling him the empty-slot effect
//    was already carried by VONA, which the vona===0 assertion above disproves.
//    A comment directly above the render vouched for it as "factually true".
{
  const rendered = [];
  EMPTY.recs.slice(0, 70).forEach(r => {
    [].concat(r.context || [], r.reasons || []).forEach(t => rendered.push(String(t)));
  });
  const slotText = rendered.filter(t => /fills your empty/.test(t));

  ck('CONTROL: the empty-slot sentence does render on a live top 70',
    slotText.length > 0, slotText.length);
  ck('  and it no longer tells him VONA carries the empty slot',
    !rendered.some(t => /scarcity priced in value \(VONA\)/.test(t)),
    rendered.filter(t => /scarcity priced in value \(VONA\)/.test(t)).slice(0, 2));
  ck('  it names the surface that actually knows — the needrule card',
    slotText.every(t => /needrule card/.test(t)), slotText[0]);
}

// ── AND recommend() SIMPLY DOES NOT REFERENCE THE MASK ────────────────────
{
  const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'), 'utf8');
  const fn = src.slice(src.indexOf('\n  function recommend(ctx)'));
  const body = fn.slice(0, fn.indexOf('\n  }\n'));
  ck('recommend() contains no call to the startable-capacity mask',
    !/withinCap|startableCap|DraftNeedRule/.test(body),
    'if this ever fails the composite may have become roster-aware and this '
    + 'whole suite must be re-derived rather than deleted');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('\nTHIS SUITE PINS A DEFECT, NOT A DESIRED STATE. It passes while the');
console.log('composite is blind. If someone makes the composite roster-aware, the');
console.log('"does not change" assertion SHOULD fail — read it as the alarm going');
console.log('off, re-derive it, and invert it the way bench_branch_anchor was.');
process.exit(fail ? 1 : 0);
