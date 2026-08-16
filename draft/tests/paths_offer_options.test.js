// TERRITORY: A
// THE STRATEGY PANEL OFFERED ONE DIRECTION, AND IT WAS THE PLAYER ALREADY AT #1.
//
// Cory, after a mock: *"Need more recommended players than just the 1 ... Gibbs
// listed twice? No other options."*
//
// Both halves are `computePaths`. The recommendations panel already renders five
// players — that part was fine. The paths panel rendered ONE card, and a path's
// leader is by construction its best-scoring member, so the single card names
// the same man the rec panel prints at #1. ONE OPTION, PRINTED TWICE, which is
// exactly what he described.
//
// ── MEASURED BEFORE IT WAS TOUCHED, ON A BOARD THAT ACTUALLY OCCURS ─────────
//
// Across all twelve of his picks, on a market-follow board (at pick N the N−1
// best ADPs are gone — an approximation, stated as one; the full pre-draft board
// is not a state that exists at pick 48, so measuring on it would answer a
// question nobody asks):
//
//     band = 4.0  (shipped)   ONE direction at 10 of 12 picks
//     band = 12.0 (previous)  ONE direction at  7 of 12 picks
//     top-10 composite spread across his picks: 13.4 .. 148.3 points
//
// SO IT IS NOT PRE-DRAFT WEIRDNESS. It is what the panel does on the 22nd. And
// the 08-13 tightening from 12 to 4 made it worse — that change was right about
// its own defect (a hardcoded 12 silently overriding its stated derivation) and
// wrong about the consequence, which nobody measured.
//
// ── ONE CONSTANT, TWO QUESTIONS ─────────────────────────────────────────────
//
// "Are these two directions indistinguishable?" is a claim about the composite's
// resolution and is correctly ABSOLUTE — that is COIN_FLIP_GAP, and PATHS_BAND
// derives from it. "Is this a real alternative worth showing?" is a different
// question, and answering it with an absolute number makes the size of the menu
// a function of where you are in the draft rather than of what the board holds.
//
// ── WHAT THIS FILE GUARDS, AND THE HALF THAT MATTERS MORE ───────────────────
//
// The obvious half is that options now appear. The half worth more, eight days
// from a draft, is that NOTHING THAT ALREADY RENDERED MOVED: the in-band set is
// a prefix of the widened set, at the same positions, at identical prices.
// Asserted directly against the old implementation rather than argued.
//
// Run: node draft/tests/paths_offer_options.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const MY = D.pick_order.my_picks;

/* THE BOARD AS IT WILL ACTUALLY BE. Every number in this file is measured on
 * this, not on the pre-draft board, because a panel that behaves well at pick 33
 * with all 1,841 players still available has told us nothing about draft day. */
function boardAt(pick) {
  const priced = D.players.filter(p => p.adp != null).slice().sort((a, b) => a.adp - b.adp);
  const gone = new Set(priced.slice(0, pick - 1).map(p => String(p.player_id)));
  return D.players.filter(p => !gone.has(String(p.player_id)));
}
function ctxAt(pick, board) {
  const next = MY.find(p => p > pick) || null;
  return {
    board: board || boardAt(pick), nextPick: next,
    totalPicks: (D.pick_order.picks || []).length || null,
    myPicksLeft: MY.filter(p => p >= pick).length, roster: [], doctrine: null,
    myPickIndex: Math.max(0, MY.indexOf(pick)), totalMyPicks: MY.length,
    currentKeepers: [], league: D.league,
    /* PRODUCTION WEIGHTS, AND THEY REFUSE RATHER THAN FALL BACK.
     *
     * This line read `(D.defaults && D.defaults.weights) || undefined`. `D.defaults`
     * has never been a key on the board, so it always resolved to `undefined` and
     * `engine.js:1448` scored with DEFAULT_WEIGHTS — all eight terms live — while
     * the app runs MEASURED_WEIGHTS with five of the eight at zero. Measured on the
     * same boards with weights as the only variable, the top recommendation differs
     * at 7 of Cory's 12 picks. The paths panel is clustered FROM that scored list,
     * so this file was pricing directions off a board no surface renders.
     *
     * The dedup fix this file guards is keyed on POSITION and so is unaffected by
     * scores — re-verified under these weights rather than assumed. See the header
     * of rec_rows.test.js for the full measurement. */
    weights: (function () {
      const w = E.MEASURED_WEIGHTS;
      if (!w || typeof w.value !== 'number') {
        throw new Error('REFUSING to score: engine.js no longer exports MEASURED_WEIGHTS, '
          + 'which is what app.js initialises state.weights from.');
      }
      return w;
    })(),
    runMultipliers: {}, ceilingAllStages: false, drift: null, currentPick: pick,
    intervening: next ? next - pick : 0,
    roundsLeft: Math.max(0, Math.ceil((150 - pick) / (D.league.teams || 10))),
  };
}
const cache = {};
function pathsAt(pick) {
  if (cache[pick]) return cache[pick];
  const ctx = ctxAt(pick);
  const scored = (E.onTheClock(ctx, { avoid: [], target: [] }) || {}).scored || [];
  return (cache[pick] = { ctx: ctx, scored: scored, paths: E.computePaths(ctx, scored) || [] });
}

/* THE OLD BEHAVIOUR, REBUILT FROM THE SHIPPED CLUSTERING. Not a remembered
 * number — the fail arm has to be produced by the same board this run reads, or
 * it is a claim about a board that no longer exists. */
/* KEYS, NOT JUST A COUNT. The count alone cannot see the defect the dedup
 * actually fixes — two cards at the SAME position — so the fail arm below could
 * never have tested it. Same derivation as before; `oldPathCount` is now a
 * length of this rather than a second walk over the pool. */
function oldPathKeys(pick) {
  const r = pathsAt(pick);
  const pool = r.scored.slice(0, E.CFG.PATHS_POOL);
  if (!pool.length) return [];
  const top = pool[0].score, seen = {}, order = [];
  pool.forEach(e => {
    const key = e.player.position
      + (((e.components || {}).tier_urgency || 0) >= E.CFG.PATHS_CLIFF_URGENCY ? ':cliff' : ':value');
    if (!seen[key]) { seen[key] = e.score; order.push(key); }
  });
  return order.filter(k => seen[k] >= top - E.CFG.PATHS_BAND)
    .slice(0, E.CFG.PATHS_MAX);
}
function oldPathCount(pick) { return oldPathKeys(pick).length; }

// ── 0. THE PREMISE ──────────────────────────────────────────────────────────
ck('the artifact holds Cory\'s twelve picks', MY.length === 12, MY.length);
ck('PATHS_MIN exists and is a floor below the cap',
  E.CFG.PATHS_MIN >= 2 && E.CFG.PATHS_MIN <= E.CFG.PATHS_MAX,
  { min: E.CFG.PATHS_MIN, max: E.CFG.PATHS_MAX });

// ── 1. THE FAIL ARM FIRST — the defect must be reproducible on today's board ─
// If the old rule no longer produces one-option picks, the board moved and the
// rest of this file is guarding something that is not happening any more.
let SYNTH;   // §1's synthetic dedup repro; §3's control reads it too
{
  const oldOnes = MY.filter(p => oldPathCount(p) <= 1);
  console.log('      OLD rule collapses to <=1 direction at: '
    + (oldOnes.join(', ') || 'no pick') + '  (' + oldOnes.length + ' of ' + MY.length + ')');
  /* ⚠ BOTH ARMS HERE WERE FITTED TO A BOARD THE APP DOES NOT RENDER.
   *
   * They read `oldOnes.length >= 8` and `oldPathCount(MY[0]) <= 1`, and both
   * passed — under DEFAULT_WEIGHTS, where the old rule collapses at 11 of 12
   * picks including pick 33. Under the MEASURED_WEIGHTS the app actually runs it
   * collapses at 6 of 12, and pick 33 yields THREE directions. So the "8" was a
   * threshold fitted to 11, and the first-pick claim is simply FALSE of the
   * board Cory sees. RETRACTED rather than re-tuned: replacing 8 with 6 would be
   * fitting the bar to today's number a second time, which is the habit that
   * produced the wrong bar in the first place.
   *
   * WHAT THE ARM IS ACTUALLY FOR is proving the defect is live, not measuring
   * it. So the assertion is the weakest claim that does that job — more than one
   * pick — and the MAGNITUDE is printed above, where a drift is readable without
   * a threshold anybody had to guess. Six of twelve is half his draft; that is
   * an argument for the fix, and it is made in prose rather than smuggled into a
   * constant. */
  ck('FAIL ARM — the band-as-gate rule still collapses to a single direction at '
    + 'more than one of his picks, so this file is about a live defect and not a '
    + 'historical one', oldOnes.length > 1, { one_option_at: oldOnes, of: MY.length });

  /* THE SECOND DEFECT, which is the one the dedup actually fixes and which the
   * old fail arm never tested: a repeated POSITION in the old in-band set.
   *
   * ⚠ THE LIVE-BOARD REPRO IS GONE, AND CHASING IT WOULD REPEAT THE RETRACTED
   * MISTAKE ABOVE. The original arm pinned pick 33's TE Loveland / RB Swift /
   * RB Etienne trio; Cory's 2026-08-16 rulings (VONA_WIRE_BENCH and
   * KOV_MEASURED_RAMP flipped on) legitimately moved the scores and no pick
   * on the ruled board produces a natural duplicate any more (printed above —
   * a future board may bring one back, and the print will say so). Hunting a
   * new pick-specific repro would be fitting the arm to today's board a
   * second time. Instead the defect is demonstrated SYNTHETICALLY against the
   * SHIPPED clustering: a hand-built scored list where two same-position
   * clusters (cliff + value) both land in band. The old rule provably renders
   * the position twice; computePaths provably doesn't. Deterministic, board-
   * drift-proof, and it exercises the exact shipped code path. */
  const dupes = MY.filter(p => {
    const ps = oldPathKeys(p).map(k => k.split(':')[0]);
    return ps.length !== new Set(ps).size;
  });
  console.log('      OLD rule repeats a position at: ' + (dupes.join(', ') || 'no pick (ruled board)'));
  SYNTH = (() => {
    const mk = (id, pos, score, urg) => ({
      player: { player_id: id, name: id, position: pos, tier: 1, adjusted_adp: 40, raw_adp: 40 },
      score: score, components: { tier_urgency: urg },
    });
    // RB twice in band — once as a cliff, once as value — plus a WR in band.
    const scored = [
      mk('rbCliff', 'RB', 100, E.CFG.PATHS_CLIFF_URGENCY + 1),
      mk('rbValue', 'RB', 100 - E.CFG.PATHS_BAND / 2, 0),
      mk('wrValue', 'WR', 100 - E.CFG.PATHS_BAND / 2, 0),
      mk('teFar', 'TE', 100 - E.CFG.PATHS_BAND * 3, 0),
    ];
    // The old band-as-gate derivation, verbatim shape from oldPathKeys above.
    const seen = {}, order = [];
    scored.slice(0, E.CFG.PATHS_POOL).forEach(e => {
      const key = e.player.position
        + (((e.components || {}).tier_urgency || 0) >= E.CFG.PATHS_CLIFF_URGENCY ? ':cliff' : ':value');
      if (!seen[key]) { seen[key] = e.score; order.push(key); }
    });
    const oldKeys = order.filter(k => seen[k] >= scored[0].score - E.CFG.PATHS_BAND)
      .slice(0, E.CFG.PATHS_MAX);
    const newPaths = E.computePaths(ctxAt(MY[0]), scored) || [];
    return { oldKeys, newPositions: newPaths.map(x => x.position) };
  })();
  ck('FAIL ARM (synthetic, shipped code path) — the old band-as-gate rule renders '
    + 'the same DIRECTION twice when cliff and value clusters share a position',
  SYNTH.oldKeys.map(k => k.split(':')[0]).filter(x => x === 'RB').length === 2,
  SYNTH.oldKeys);
  ck('...and computePaths on the SAME scored list offers distinct positions — '
    + 'the dedup removes exactly that row',
  new Set(SYNTH.newPositions).size === SYNTH.newPositions.length
    && SYNTH.newPositions.length >= 2, SYNTH.newPositions);
}

// ── 2. THE FIX, AT EVERY PICK HE OWNS ───────────────────────────────────────
{
  const counts = MY.map(p => ({ pick: p, n: pathsAt(p).paths.length }));
  /* THE TERMINAL PICK IS EXCLUDED, AND NOT AS A CONVENIENCE. A path is "what
   * this direction costs you by the time you pick again" — at Cory's LAST pick
   * there is no next pick, `ctx.nextPick` is null, and the quantity the panel
   * is built on does not exist. Offering one direction there is correct;
   * PATHS_MIN cannot manufacture a look-ahead out of nothing. Everything before
   * it must clear the floor. */
  const thin = counts.filter(c => c.n <= 1 && c.pick !== MY[MY.length - 1]);
  ck('NO pick offers a single direction any more — except the last, where there '
    + 'is no next pick to look ahead to', thin.length === 0, thin);
  ck('CONTROL — the excluded pick really is the terminal one, and it really has '
    + 'no next pick', pathsAt(MY[MY.length - 1]).ctx.nextPick == null,
  { pick: MY[MY.length - 1], next: pathsAt(MY[MY.length - 1]).ctx.nextPick });

  /* ⚠ A DIRECTION IS A POSITION, AND FOR A WHILE IT WAS NOT.
   *
   * Cluster keys are `pos:cliff` / `pos:value`, so one position could produce
   * two clusters and both could render. Raising the floor to PATHS_MIN pulled
   * the second flavour into view, and on the live board at pick 33 — his FIRST
   * pick — the panel offered WR Zay Flowers · RB Travis Etienne · RB D'Andre
   * Swift. Three "directions", two of them RB: one option shown twice, on a
   * panel whose entire job is to offer distinct options with pros and cons. */
  const dupes = MY.map(p => ({ pick: p, pos: pathsAt(p).paths.map(x => x.position) }))
    .filter(r => new Set(r.pos).size !== r.pos.length);
  ck('every pick offers DISTINCT positions — one row per direction, never the '
    + 'same direction twice with different men', dupes.length === 0, dupes);
  const short = counts.filter(c => c.n < E.CFG.PATHS_MIN);
  /* The floor is a floor, not a promise to fabricate: a board holding two
   * clusters renders two. So a shortfall is only a failure if the board HAD
   * more to offer. */
  const realShort = short.filter(c => {
    const pool = pathsAt(c.pick).scored.slice(0, E.CFG.PATHS_POOL);
    const keys = new Set(pool.map(e => e.player.position
      + (((e.components || {}).tier_urgency || 0) >= E.CFG.PATHS_CLIFF_URGENCY ? ':cliff' : ':value')));
    return keys.size > c.n;
  });
  ck('and every pick offers PATHS_MIN directions wherever the board holds that '
    + 'many — the floor never has to invent one', realShort.length === 0, realShort);
  ck('the cap still binds — this widened the floor, not the ceiling',
    counts.every(c => c.n <= E.CFG.PATHS_MAX), counts.filter(c => c.n > E.CFG.PATHS_MAX));
}

// ── 3. NOBODY IS LISTED TWICE, which is the sentence he wrote ───────────────
{
  const dupes = MY.map(p => {
    const names = pathsAt(p).paths.map(x => x.pick.player.name);
    return { pick: p, dup: names.filter((v, i) => names.indexOf(v) !== i) };
  }).filter(r => r.dup.length);
  ck('no two paths lead with the same player', dupes.length === 0, dupes);
  const echo = MY.filter(p => {
    const r = pathsAt(p);
    return r.paths.length > 1 && r.paths.every(x => x.pick.player.name === r.scored[0].player.name);
  });
  ck('and the panel is never just the #1 recommendation restated', echo.length === 0, echo);
}

// ── 4. THE SAFETY PROPERTY — nothing that already rendered moved ────────────
// This is the assertion that makes the change shippable eight days out. The
// widened set must contain the old set, as a PREFIX, at identical prices.
{
  /* ⚠ THE PREFIX PROPERTY WAS STATED OVER CLUSTERS AND HAD TO BE STATED OVER
   * DIRECTIONS (corrected 2026-08-14).
   *
   * This compared `r.paths.slice(0, oldPathCount(p))` — the first N NEW paths
   * against the count of OLD in-band CLUSTERS — and demanded all N be in band.
   * That cannot hold, and should not: the dedup deliberately REMOVES a cluster
   * when two share a position, so N old clusters become fewer than N new rows
   * and the shortfall is backfilled by the PATHS_MIN floor with a direction that
   * was never in band. At pick 33 the old set is `TE:value, RB:cliff, RB:value`
   * — three clusters, TWO directions — so index 2 of the new panel is WR at 8.3,
   * correctly out of band, and the assertion called that a regression.
   *
   * It passed only under DEFAULT_WEIGHTS, where no pick repeats a position and
   * so the removal never happens. A "nothing was lost" check that is satisfied
   * only when nothing is ever removed is not testing the change.
   *
   * THE PROPERTY THAT IS ACTUALLY PROMISED, and the one Cory cares about: no
   * DIRECTION he previously had was taken away, none was reordered, and none
   * that qualified on its own score is now flagged as a concession. The
   * duplicate is the only thing that disappears. */
  const broken = [];
  MY.forEach(p => {
    const r = pathsAt(p);
    const oldPositions = [];
    oldPathKeys(p).forEach(k => {
      const pos = k.split(':')[0];
      if (oldPositions.indexOf(pos) < 0) oldPositions.push(pos);
    });
    if (!oldPositions.length) return;
    const now = r.paths.map(x => x.position);
    oldPositions.forEach((pos, i) => {
      if (now[i] !== pos) {
        broken.push({ pick: p, i: i, why: 'direction lost or reordered',
          was: oldPositions, now: now });
      } else if (!r.paths[i].within_band) {
        broken.push({ pick: p, i: i, pos: pos,
          why: 'a direction that qualified on its own score is now out of band' });
      }
    });
    if (r.paths[0] && r.paths[0].price !== 0) broken.push({ pick: p, why: 'top path is not priced at 0' });
  });
  ck('every DIRECTION that qualified under the old rule still renders, in the '
    + 'same position in the list, still in band — the collapsed duplicate is the '
    + 'only thing that disappears', broken.length === 0, broken.slice(0, 4));
  /* CONTROL, restated 2026-08-16: on the RULED board no pick naturally loses a
   * row to the dedup any more (the flips moved the scores — see the fail-arm
   * note in §1), so "some live pick loses a row" would pin today's board the
   * way the retracted thresholds did. The non-vacuity proof is the synthetic
   * demonstration in §1 (old keys carry a duplicate, computePaths doesn't);
   * HERE the control degrades to honesty about which world we're in: either a
   * live pick still loses a row (print it), or none does and the preservation
   * clause above is currently exercised only by order/band — stated, not
   * hidden. */
  const liveLosses = MY.map(p => ({ pick: p, keys: oldPathKeys(p).length,
    positions: new Set(oldPathKeys(p).map(k => k.split(':')[0])).size }))
    .filter(x => x.keys !== x.positions);
  console.log('      live picks losing a row to the dedup: '
    + (liveLosses.map(x => x.pick).join(', ') || 'none on the ruled board'));
  // Note the synthetic arm asserts the duplicate COLLAPSES, not that the row
  // count drops — PATHS_MIN legitimately backfills the freed slot with the
  // next distinct direction (TE, in the fixture), which is the panel working.
  const synthDupCollapsed =
    new Set(SYNTH.oldKeys.map(k => k.split(':')[0])).size < SYNTH.oldKeys.length
    && new Set(SYNTH.newPositions).size === SYNTH.newPositions.length;
  ck('CONTROL — the dedup provably collapses a duplicate somewhere: a live pick '
    + 'when the board offers one, otherwise the synthetic shipped-path repro',
  liveLosses.length >= 1 || synthDupCollapsed,
  { live: liveLosses, synthetic: SYNTH });

  /* PRICES ARE MEASURED AGAINST THE TOP PATH. Widening the set must not
   * re-baseline them — computing bestScore off the widened set would shift every
   * badge on the panel while looking like a pure addition. */
  const misPriced = [];
  MY.forEach(p => {
    const r = pathsAt(p);
    if (!r.paths.length) return;
    const base = r.paths[0].pick.score;
    r.paths.forEach(x => {
      const want = Math.round((base - x.pick.score) * 10) / 10;
      if (Math.abs(want - x.price) > 0.051) misPriced.push({ pick: p, key: x.key, want: want, got: x.price });
    });
  });
  ck('and every price is still the deficit against the TOP path, not against the '
    + 'widened set', misPriced.length === 0, misPriced.slice(0, 4));
  ck('prices never go negative — a "cost" below zero is a badge that reads '
    + 'backwards, which this panel has shipped once already',
    MY.every(p => pathsAt(p).paths.every(x => x.price >= 0)));
  ck('paths stay ordered best-first', MY.every(p => {
    const pr = pathsAt(p).paths.map(x => x.price);
    return pr.every((v, i) => i === 0 || v >= pr[i - 1] - 1e-9);
  }));

  /* ⚠️ THE ASSERTION ABOVE CANNOT SEE THE SORT, AND A MUTATION PROVED IT.
   *
   * Deleting `.sort(...)` from the ranking line failed NOTHING: `pool` is a
   * prefix of an already-score-ordered list, so clusters are discovered in
   * score order and the sort is a no-op on every input this file feeds it. An
   * assertion that holds whether or not the code under test runs is not
   * guarding the code under test.
   *
   * It matters because the sort is not the only line assuming sortedness —
   * `topScore = pool[0].score` does too, and if that assumption breaks, EVERY
   * price on the panel is measured against the wrong baseline while the cards
   * still render normally. So the ordering is asserted against an input that
   * actually violates it. */
  {
    const r = pathsAt(MY[0]);
    const shuffled = r.scored.slice(0, E.CFG.PATHS_POOL * 3).reverse()
      .concat(r.scored.slice(E.CFG.PATHS_POOL * 3));
    ck('CONTROL — the shuffled input really is out of score order',
      shuffled.length > 1 && shuffled[0].score < shuffled[shuffled.length - 1].score);
    const out = E.computePaths(r.ctx, shuffled) || [];
    ck('given an UNSORTED board the panel still ranks best-first rather than '
      + 'pricing everything against whatever arrived first',
    out.length > 0 && out.map(x => x.price).every((v, i) => i === 0 || v >= out[i - 1].price - 1e-9),
    out.map(x => x.price));
    ck('and the top path is genuinely the best-scoring direction on that board',
      out.length > 0 && out.every(x => x.pick.score <= out[0].pick.score + 1e-9),
      out.map(x => x.pick.score));
  }
}

// ── 5. AN EXPENSIVE OPTION CAN NEVER READ AS AN EQUAL ──────────────────────
// The whole risk of widening. `price` was always on the card; `within_band` and
// the prose clause are what stop a 61-point concession looking like a coin flip.
{
  const wrongFlag = [];
  MY.forEach(p => pathsAt(p).paths.forEach(x => {
    if (x.within_band !== (x.price <= E.CFG.PATHS_BAND)) wrongFlag.push({ pick: p, key: x.key, price: x.price, flag: x.within_band });
  }));
  ck('within_band agrees with the price on every card — one derivation, not two',
    wrongFlag.length === 0, wrongFlag.slice(0, 4));

  const all = [].concat(...MY.map(p => pathsAt(p).paths));
  const out = all.filter(x => !x.within_band);
  const inb = all.filter(x => x.within_band);
  ck('CONTROL — the widened set really does contain out-of-band cards, or the '
    + 'next two assertions are vacuous', out.length > 0, out.length);
  ck('every out-of-band card states the concession IN THE PROSE, not only in the '
    + 'badge', out.every(x => /concedes \d+ pts/.test(x.when_right)),
    out.filter(x => !/concedes \d+ pts/.test(x.when_right)).map(x => x.when_right).slice(0, 2));
  ck('and it stays SILENT in band — a close call must not be talked out of',
    inb.every(x => !/concedes/.test(x.when_right)),
    inb.filter(x => /concedes/.test(x.when_right)).map(x => x.when_right).slice(0, 2));
  ck('the stated concession matches the badge rather than being a second '
    + 'rounding of it', out.every(x =>
    Number((x.when_right.match(/concedes (\d+) pts/) || [])[1]) === Math.round(x.price)),
  out.map(x => [x.price, x.when_right.match(/concedes (\d+) pts/)]).slice(0, 3));
}

// ── 6. THE COIN FLIP IS UNTOUCHED, which is the claim easiest to break ─────
// A far-off direction promoted into slot 2 must not inherit "these are a coin
// flip" — that badge is a statement about indistinguishability.
{
  const bad = [];
  MY.forEach(p => pathsAt(p).paths.forEach(x => {
    if (x.coin_flip_with && x.price >= E.CFG.COIN_FLIP_GAP && x.price > 0) {
      bad.push({ pick: p, key: x.key, price: x.price });
    }
  }));
  ck('no card is flagged a coin flip unless it really prices within COIN_FLIP_GAP',
    bad.length === 0, bad.slice(0, 4));
}

// ── 7. SAME POSITION, TWO CARDS — the older complaint, still handled ────────
{
  const bad = [];
  MY.forEach(p => {
    const by = {};
    pathsAt(p).paths.forEach(x => { (by[x.position] = by[x.position] || []).push(x); });
    Object.keys(by).forEach(pos => {
      if (by[pos].length < 2) return;
      by[pos].forEach(x => { if (!x.distinction) bad.push({ pick: p, pos: pos, key: x.key }); });
      const mech = new Set(by[pos].map(x => x.mechanism));
      if (mech.size < 2) bad.push({ pick: p, pos: pos, why: 'two cards at one position with the same mechanism', mech: [...mech] });
    });
  });
  ck('two directions at one position always say WHY they differ, and really do '
    + 'differ', bad.length === 0, bad.slice(0, 4));
}

// ── 8. DEGENERATE BOARDS DEGRADE, THEY DO NOT THROW ────────────────────────
{
  ck('an empty board returns no paths rather than throwing',
    E.computePaths(ctxAt(33, []), []).length === 0);
  const one = D.players.filter(p => p.position === 'TE' && p.adp != null)
    .sort((a, b) => a.adp - b.adp).slice(0, 3);
  const ctx = ctxAt(113, one);
  const scored = (E.onTheClock(ctx, { avoid: [], target: [] }) || {}).scored || [];
  const paths = E.computePaths(ctx, scored);
  ck('a board holding ONE position returns the directions that exist and no '
    + 'more — the floor cannot manufacture a menu', paths.length <= 2 && paths.length >= 1,
  paths.map(x => x.key));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: at every pick Cory owns, the strategy panel offers more');
console.log('than one direction wherever the board holds one, never leads two cards with the');
console.log('same player, and every direction that qualified under the old rule still renders');
console.log('in the same position at the same price. An option costing 61 points says so in');
console.log('its own sentence and cannot be badged a coin flip.');
console.log('WHAT IT DOES NOT: decide whether an expensive direction is worth taking, or lay');
console.log('any of it out. The cost is stated; the judgement is Cory\'s and the layout is B\'s.');
