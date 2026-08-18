// TERRITORY: A
// THE BARBELL FAMILY — the "no upside" classifier and the overlay arms built
// on it. Two halves, and the first one matters more:
//
//   1. `upside_class.js` is a DEFINITION made of two committed measurements.
//      If it drifts from either — the calibration's band edges, the empirical
//      study's outcome-space replacement, the board's pos_rank ordering — the
//      class boundary silently moves and every barbell number moves with it.
//      Those three joins are tested against their producers, not against a
//      copy of the numbers.
//   2. The arms themselves are pure functions on the engine's list, tested
//      the same way archetype_policy.test.js tests the older arms.
//
// Run: node draft/tests/barbell_policy.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const UC = require(path.join(ROOT, 'draft', 'tools', 'upside_class.js'));
const AP = require(path.join(ROOT, 'draft', 'tools', 'archetype_policy.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 400) : ''))); };

const CAL = UC.calibration();
const REPL = UC.replacement();

// ── 1. the definition's joins to its producers ─────────────────────────────

{
  // The band edges are written twice — Python producer, JS consumer. A mirror
  // that is only a convention is the dual-maintenance defect this repo has
  // found a dozen times, so the literal is read out of the producer.
  const py = fs.readFileSync(path.join(ROOT, 'draft', 'backtest',
    'projection_error.py'), 'utf8');
  const m = py.match(/BAND_EDGES\s*=\s*\(([^)]*)\)/);
  const edges = m ? m[1].split(',').map(s => Number(s.trim())).filter(x => !isNaN(x)) : null;
  ck('BAND_EDGES match the Python producer exactly',
    edges && edges.join(',') === UC.BAND_EDGES.join(','), { edges, js: UC.BAND_EDGES });
}
{
  // band_of's contract, including the two boundaries a band definition gets
  // wrong: the last rank inside a band and the first rank outside it.
  ck('bandOf boundaries: 3 -> 1-3, 4 -> 4-8, 8 -> 4-8, 9 -> 9-16',
    UC.bandOf(3) === '1-3' && UC.bandOf(4) === '4-8'
    && UC.bandOf(8) === '4-8' && UC.bandOf(9) === '9-16');
  ck('bandOf 32 -> 17-32 and 33 -> 33+ (the open band starts one past the edge)',
    UC.bandOf(32) === '17-32' && UC.bandOf(33) === '33+');
  ck('bandOf(null) is `unranked`, never a band — an unranked row must not be '
    + 'priced by whichever cell happens to be first',
    UC.bandOf(null) === 'unranked' && UC.cellFor('RB', null) === null);
}
{
  // The threshold comes from the empirical study's artifact, not from a copy.
  const edv = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'backtest',
    'empirical_draft_value.json'), 'utf8'));
  const src = edv.q6_allocation.realized_replacement_used;
  ck('the replacement threshold IS the empirical study\'s outcome-space level, '
    + 'read live from its artifact',
    ['QB', 'RB', 'WR', 'TE'].every(p => REPL[p] === src[p]), { REPL, src });
  // The trap this module exists to avoid: the board's own replacement is in
  // PROJECTION space and differs materially. If they ever coincide, the check
  // below is vacuous, so it asserts they do NOT.
  const board = JSON.parse(fs.readFileSync(path.join(ROOT, 'public',
    'draft_data.json'), 'utf8'));
  const proj = board.replacement.replacement_points;
  ck('CONTROL — outcome-space and projection-space replacement genuinely '
    + 'differ, so using the wrong one would move the class boundary',
    ['QB', 'RB', 'WR', 'TE'].every(p => Math.abs(proj[p] - REPL[p]) > 5),
    { proj, REPL });
}
{
  // pos_rank must BE the ordering the calibration's bands were fitted on
  // (proj_mean desc within position). Re-derived from the shipped board.
  const board = JSON.parse(fs.readFileSync(path.join(ROOT, 'public',
    'draft_data.json'), 'utf8'));
  const byPos = {};
  board.players.forEach(p => (byPos[p.position] || (byPos[p.position] = [])).push(p));
  let bad = 0, seen = 0;
  Object.keys(byPos).forEach(pos => {
    byPos[pos].slice().sort((a, b) => (Number(b.proj_mean) || 0) - (Number(a.proj_mean) || 0))
      .forEach((p, i) => { seen++; if (Number(p.pos_rank) !== i + 1) bad++; });
  });
  ck('board pos_rank IS proj_mean-desc rank within position — the calibration '
    + 'band ordering, checked on all ' + seen + ' rows', bad === 0 && seen > 500,
    { bad, seen });
}

// ── 2. the classification itself ───────────────────────────────────────────

const row = (pos, rank, mean) => ({ position: pos, pos_rank: rank, proj_mean: mean });

{
  // Hand-computed against the committed cell, at the boundary in BOTH
  // directions (rule 10a: a break must land just past the threshold).
  const cell = CAL.cells['WR|33+'];
  const R = REPL.WR;                       // 155.0
  const meanAtP50 = R / cell.p50_ratio;    // exactly ANCHOR at the boundary
  ck('WR|33+ AT the ANCHOR boundary classifies ANCHOR',
    UC.classify(row('WR', 40, meanAtP50)) === 'ANCHOR');
  ck('WR|33+ one part in 10^6 BELOW the ANCHOR boundary classifies SWING',
    UC.classify(row('WR', 40, meanAtP50 * (1 - 1e-6))) === 'SWING');
  const meanAtP90 = R / cell.p90_ratio;
  ck('WR|33+ AT the SWING/DEAD boundary classifies SWING',
    UC.classify(row('WR', 40, meanAtP90)) === 'SWING');
  ck('WR|33+ one part in 10^6 BELOW it classifies DEAD',
    UC.classify(row('WR', 40, meanAtP90 * (1 - 1e-6))) === 'DEAD');
}
{
  // The asymmetry that makes this definition worth having: the SAME projection
  // classifies differently at different ranks, because the measured spread
  // differs by band. A rank-blind rule could not do this.
  /* 'RB|1-3' until 2026-08-17: the Cory-ruled calibration regeneration on
   * real 2023-25 outcomes REFUSES that band (n=6 < min_n 8, status
   * unmeasurable, every ratio null) — which is the honest answer, and
   * upside_class.classify() returns null for it by design (line ~164). The
   * control moves to the shallowest MEASURED band; the property (spread
   * differs by band) is unchanged.
   *
   * RB again 2026-08-17 (same regeneration, second consequence — a FINDING,
   * recorded here on purpose): RB p90_ratio is now nearly FLAT across every
   * measured band (4-8: 1.812, 9-16: 1.785, 17-32: 1.768, 33+: 1.794 — max
   * spread 0.044), so RB can no longer carry a "bands genuinely differ"
   * control at the 0.2 threshold. Verified before moving the pin: RB's cells
   * have distinct n (10/16/32/151) and the other ratios (p10, p50, sd) DO
   * differ by band, so this is a measurement result about RB top-decile
   * seasons, not a recurrence of the constant-multiple defect. The control
   * moves to QB, where bands differ monotonically (4-8: 1.586, 33+: 1.223);
   * the rank-aware property is re-asserted on QB rows for the same reason. */
  const cell1 = CAL.cells['QB|4-8'], cell2 = CAL.cells['QB|33+'];
  ck('CONTROL — the measured p90 ratio really does differ across QB bands '
    + '(4-8: ' + cell1.p90_ratio.toFixed(3) + ', 33+: ' + cell2.p90_ratio.toFixed(3) + ')',
    Math.abs(cell1.p90_ratio - cell2.p90_ratio) > 0.2);
  const m = REPL.QB / cell2.p90_ratio + 1;   // clears p90 at 33+
  ck('the same projection can be SWING deep and ANCHOR early — the class is '
    + 'rank-aware, not a projection threshold in disguise',
    UC.classify(row('QB', 40, m)) === 'SWING'
    && UC.classify(row('QB', 5, m * 3)) === 'ANCHOR');
}
{
  ck('a K or DEF row is NA — the calibration is offence-only and onesie timing '
    + 'is the engine\'s, not an overlay\'s',
    UC.classify(row('K', 1, 100)) === 'NA' && UC.classify(row('DEF', 1, 100)) === 'NA');
  ck('a row with no pos_rank is UNMEASURED, never DEAD — absent is not zero at '
    + 'the boundary where DEAD means "do not draft him"',
    UC.classify({ position: 'WR', proj_mean: 120 }) === 'UNMEASURED');
  ck('a row with no projection is UNMEASURED, not DEAD',
    UC.classify(row('WR', 40, 0)) === 'UNMEASURED'
    && UC.classify(row('WR', 40, null)) === 'UNMEASURED');
  ck('a null/garbage row is UNMEASURED and does not throw',
    UC.classify(null) === 'UNMEASURED' && UC.classify({}) === 'UNMEASURED');
}
{
  // Non-vacuity on the real board: every class must be populated, or the arms
  // built on it are relabelled controls.
  const board = JSON.parse(fs.readFileSync(path.join(ROOT, 'public',
    'draft_data.json'), 'utf8'));
  const c = UC.census(board.players);
  ck('CONTROL — the shipped board populates all three live classes '
    + JSON.stringify(c),
    c.ANCHOR > 20 && c.SWING > 20 && c.DEAD > 20, c);
  // 76 skill rows carry proj_mean == 0.0 (deep bench, ADP 919, and the same 76
  // rows projections.py could not give a measured sd for). They are UNMEASURED,
  // not DEAD — this assertion originally read `UNMEASURED === 0`, went red, and
  // the red was RIGHT: a zero projection is a missing projection, and calling
  // those players "no upside" would be the coverage gap wearing a finding's
  // clothes. Kept as the exact count so a change in board coverage is visible.
  const zeroProj = board.players.filter(p => ['QB', 'RB', 'WR', 'TE']
    .indexOf(p.position) >= 0 && !(Number(p.proj_mean) > 0)).length;
  /* 2026-08-17, calibration regenerated on Cory's ruling: there is now a
   * SECOND nameable reason. The regenerated artifact honestly refuses every
   * 1-3 band (QB/RB/WR/TE|1-3 all carry status "unmeasurable", n=6 or 5
   * against min_n 8, all ratios null), so the 12 top-3 skill rows are
   * UNMEASURED because their CELL is unmeasurable, not because their
   * projection is missing. The pin below names both reasons and requires the
   * union to be EXACT — a row unmeasured for any third, unnameable reason
   * still fails. Old pin: c.UNMEASURED === zeroProj (82 === 82); the 12-row
   * delta appeared when the regeneration nulled the 1-3 cells. */
  const cellUnmeasurable = board.players.filter(p => {
    if (['QB', 'RB', 'WR', 'TE'].indexOf(p.position) < 0) return false;
    if (!(Number(p.proj_mean) > 0)) return false;          // counted above
    const cell = CAL.cells[p.position + '|' + UC.bandOf(UC.rankOf(p))];
    return !!cell && cell.status === 'unmeasurable'
      && cell.n < CAL.min_n && cell.p90_ratio == null;
  }).length;
  ck('every UNMEASURED row is UNMEASURED for one of exactly two nameable reasons '
    + '— a zero/absent projection (' + zeroProj + ' rows) or an unmeasurable '
    + 'calibration cell, n < min_n ' + CAL.min_n + ' with null ratios ('
    + cellUnmeasurable + ' rows, the refused 1-3 bands) — never anything unnamed',
    c.UNMEASURED === zeroProj + cellUnmeasurable && zeroProj > 0 && cellUnmeasurable > 0,
    { unmeasured: c.UNMEASURED, zeroProj, cellUnmeasurable });
  ck('K/DEF are exactly the NA set — no skill row lands there',
    c.NA === board.players.filter(p => p.position === 'K' || p.position === 'DEF').length,
    { NA: c.NA });
}

{
  // THE FINDING THAT EXPLAINS EVERY OTHER RESULT IN THIS PASS, PINNED.
  //
  // Cory's sentence assumes a TRADE-OFF: give up median to buy ceiling. On the
  // measured error distribution that trade-off does not exist at the two deep
  // positions. A SWING's ratio upside is larger, but it multiplies a smaller
  // projection, and the product loses: at RB and WR NO swing's top-decile
  // season reaches even the WEAKEST anchor's. The classes are ordered, not a
  // menu — an anchor is the safer pick AND the higher-ceiling one.
  //
  // Pinned because if a future board ever breaks the ordering, the barbell
  // becomes a live strategy again and this document's verdict must be revisited.
  const board = JSON.parse(fs.readFileSync(path.join(ROOT, 'public',
    'draft_data.json'), 'utf8'));
  const p90 = {};
  board.players.forEach(p => {
    const ob = UC.outcomeBand(p);
    if (!ob) return;
    const c = UC.classify(p);
    ((p90[p.position] || (p90[p.position] = {}))[c]
      || (p90[p.position][c] = [])).push(ob.p90);
  });
  /* 2026-08-17, calibration regenerated on Cory's ruling — the overlap facts
   * MOVED and the pins move with them, same strictness, opposite roles:
   *   - RB still holds the no-trade-off ordering (anchor p90 min 251 > swing
   *     p90 max 246) — unchanged.
   *   - WR INVERTED. Old pin: no WR swing out-ceilinged the weakest anchor.
   *     Measured now: WR swing p90 max 225 > WR anchor p90 min 218, because
   *     the regenerated WR p90 ratios (4-8: 1.982 vs 17-32: 1.432) widened
   *     the shallow-band ceiling relative to the deep one. The safe-vs-upside
   *     trade-off now EXISTS at WR, and WR becomes the position-dependence
   *     control below.
   *   - QB inverted the other way. Old control: QB swings DID out-ceiling the
   *     weakest anchor. Measured now: QB swing p90 max 433 < QB anchor p90
   *     min 503 (deep-band QB p90 collapsed to 1.223), so QB joins RB on the
   *     no-overlap side and can no longer serve as the overlap control. */
  ['RB', 'QB'].forEach(pos => {
    const a = p90[pos].ANCHOR, s = p90[pos].SWING;
    ck('at ' + pos + ' NO swing out-ceilings even the weakest anchor '
      + '(anchor p90 min ' + Math.min.apply(null, a).toFixed(0)
      + ', swing p90 max ' + Math.max.apply(null, s).toFixed(0) + ') — the '
      + 'safe-vs-upside trade-off does not exist here',
      Math.max.apply(null, s) < Math.min.apply(null, a), { pos });
  });
  ['RB', 'WR'].forEach(pos => {
    ck('at ' + pos + ' no DEAD row reaches replacement at p90 — that IS the '
      + 'definition, checked non-vacuously on n=' + p90[pos].DEAD.length,
      p90[pos].DEAD.length > 20
      && Math.max.apply(null, p90[pos].DEAD) < UC.replacement()[pos]);
  });
  // …and it is genuinely position-dependent, not a universal artifact: at WR
  // (post-regeneration) swings DO out-ceiling the weakest anchor. Asserted so
  // the two no-overlap checks above cannot be passing for a trivial reason.
  ck('CONTROL — at WR the ordering DOES overlap (swing p90 max '
    + Math.max.apply(null, p90.WR.SWING).toFixed(0) + ' > anchor p90 min '
    + Math.min.apply(null, p90.WR.ANCHOR).toFixed(0) + '), so the RB/QB result '
    + 'is a fact about those positions rather than a property of the definition',
    Math.max.apply(null, p90.WR.SWING) > Math.min.apply(null, p90.WR.ANCHOR));
}

// ── 3. the overlay arms ────────────────────────────────────────────────────

let nextId = 1;
function rec(pos, cls, opts) {
  const o = opts || {};
  return {
    player: { player_id: String(nextId++), name: pos + '#' + nextId, position: pos,
      _cls: cls, vorp: 'vorp' in o ? o.vorp : 10, adjusted_adp: 50 },
    score: o.score != null ? o.score : 100,
    forced: o.forced || undefined,
    legality_warning: o.warning != null ? o.warning : undefined,
  };
}
const classOf = p => (p && p._cls) || 'UNMEASURED';
const st = (round, extra) => Object.assign({ round, posCounts: {}, picksLeft: 6,
  classOf }, extra || {});

const BARBELL_ARMS = ['barbell', 'no_deadweight', 'anchor_early', 'upside_late',
  'anti_barbell'];

{
  ck('all five barbell arms are registered',
    BARBELL_ARMS.every(a => AP.ARCHETYPES[a]), Object.keys(AP.ARCHETYPES));
  ck('the phase boundary is round 8 — Cory\'s "first 8 rounds", verbatim',
    AP.BARBELL_ANCHOR_LAST_ROUND === 8);
}
{
  // The refusal that keeps a broken run from reading as a tie.
  BARBELL_ARMS.forEach(a => {
    let threw = false;
    try { AP.choosePick(a, [rec('WR', 'DEAD')], { round: 5, posCounts: {} }); }
    catch (e) { threw = true; }
    ck(a + ' THROWS without state.classOf rather than running the control '
      + 'under its own name', threw);
  });
  // …but legality still owns the pick before the classifier is ever consulted,
  // so a forced rec does not need one.
  const forced = [Object.assign(rec('RB', 'DEAD'), { forced: true }), rec('WR', 'ANCHOR')];
  ck('a FORCED rec is taken by every barbell arm WITHOUT a classifier — rails '
    + 'outrank the overlay and are checked first',
    BARBELL_ARMS.every(a =>
      AP.choosePick(a, forced, { round: 5, posCounts: {} }) === forced[0]));
}
{
  const recs = [rec('WR', 'DEAD'), rec('RB', 'SWING'), rec('TE', 'ANCHOR')];
  ck('barbell in round 5 takes the ANCHOR even though it is engine-ranked 3rd',
    AP.choosePick('barbell', recs, st(5)) === recs[2]);
  ck('barbell in round 9 takes the SWING, not the ANCHOR',
    AP.choosePick('barbell', recs, st(9)) === recs[1]);
  ck('the phase flips BETWEEN round 8 and 9, not at 7 or 10 (boundary, both sides)',
    AP.choosePick('barbell', recs, st(8)) === recs[2]
    && AP.choosePick('barbell', recs, st(9)) === recs[1]);
}
{
  // The two-step fallback: no class of the wanted kind -> ban DEAD -> engine.
  const noAnchor = [rec('WR', 'DEAD'), rec('RB', 'SWING')];
  ck('barbell round 5 with no ANCHOR available falls back to the best '
    + 'non-DEAD candidate, not to the engine top',
    AP.choosePick('barbell', noAnchor, st(5)) === noAnchor[1]);
  const allDead = [rec('WR', 'DEAD'), rec('RB', 'DEAD')];
  ck('barbell with NOTHING but DEAD on offer DEFERS to the engine rather than '
    + 'reaching outside the candidate slice',
    AP.choosePick('barbell', allDead, st(5)) === allDead[0]);
}
{
  const recs = [rec('WR', 'DEAD'), rec('RB', 'UNMEASURED'), rec('TE', 'ANCHOR')];
  ck('no_deadweight skips DEAD and takes the UNMEASURED row — an unpriced '
    + 'candidate is NOT treated as dead weight',
    AP.choosePick('no_deadweight', recs, st(5)) === recs[1]);
  ck('anti_barbell (the control) takes the DEAD row at every round',
    AP.choosePick('anti_barbell', recs, st(5)) === recs[0]
    && AP.choosePick('anti_barbell', recs, st(12)) === recs[0]);
}
{
  const recs = [rec('WR', 'DEAD'), rec('RB', 'SWING'), rec('TE', 'ANCHOR')];
  ck('anchor_early constrains rounds <= 8 only',
    AP.choosePick('anchor_early', recs, st(5)) === recs[2]
    && AP.choosePick('anchor_early', recs, st(9)) === recs[0]);
  ck('upside_late constrains rounds >= 9 only',
    AP.choosePick('upside_late', recs, st(5)) === recs[0]
    && AP.choosePick('upside_late', recs, st(9)) === recs[1]);
}
{
  // K/DEF are never sought or banned by an overlay — the same rule the older
  // arms keep, restated for the class-based ones.
  const k = [rec('K', 'NA'), rec('WR', 'ANCHOR')];
  ck('an engine-top K is left alone by no_deadweight (onesie timing is the '
    + 'engine\'s)', AP.choosePick('no_deadweight', k, st(13)) === k[0]);
  const kThenDead = [rec('WR', 'DEAD'), rec('K', 'NA'), rec('WR', 'ANCHOR')];
  ck('a K is never SOUGHT by a class overlay either — barbell round 5 reaches '
    + 'past it to the ANCHOR',
    AP.choosePick('barbell', kThenDead, st(5)) === kThenDead[2]);
}
{
  // TOP_N: the overlay picks among engine-endorsed players only.
  const recs = [];
  for (let i = 0; i < AP.TOP_N; i++) recs.push(rec('WR', 'DEAD'));
  recs.push(rec('RB', 'ANCHOR'));           // index TOP_N — outside the slice
  ck('an ANCHOR at index TOP_N is NOT reachable — the overlay does not rescue '
    + 'the tail', AP.choosePick('barbell', recs, st(5)) === recs[0]);
  const recs2 = recs.slice(0, AP.TOP_N - 1);
  recs2.push(rec('RB', 'ANCHOR'));          // index TOP_N-1 — the last slot in
  ck('the same ANCHOR at index TOP_N-1 IS reachable (boundary, other side)',
    AP.choosePick('barbell', recs2, st(5)) === recs2[AP.TOP_N - 1]);
}
{
  const recs = [rec('WR', 'DEAD'), rec('TE', 'ANCHOR')];
  const a = AP.choosePick('barbell', recs, st(5));
  const b = AP.choosePick('barbell', recs, st(5));
  ck('deterministic: identical inputs give the identical choice', a === b);
  ck('CONTROL — the barbell arms genuinely diverge from the shipped control '
    + 'on this input (an arm that never diverges measures nothing)',
    AP.choosePick('shipped', recs, st(5)) === recs[0] && a === recs[1]);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
