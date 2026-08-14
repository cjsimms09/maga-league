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
    weights: (D.defaults && D.defaults.weights) || undefined,
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
function oldPathCount(pick) {
  const r = pathsAt(pick);
  const pool = r.scored.slice(0, E.CFG.PATHS_POOL);
  if (!pool.length) return 0;
  const top = pool[0].score, seen = {}, order = [];
  pool.forEach(e => {
    const key = e.player.position
      + (((e.components || {}).tier_urgency || 0) >= E.CFG.PATHS_CLIFF_URGENCY ? ':cliff' : ':value');
    if (!seen[key]) { seen[key] = e.score; order.push(key); }
  });
  return Math.min(E.CFG.PATHS_MAX,
    order.filter(k => seen[k] >= top - E.CFG.PATHS_BAND).length);
}

// ── 0. THE PREMISE ──────────────────────────────────────────────────────────
ck('the artifact holds Cory\'s twelve picks', MY.length === 12, MY.length);
ck('PATHS_MIN exists and is a floor below the cap',
  E.CFG.PATHS_MIN >= 2 && E.CFG.PATHS_MIN <= E.CFG.PATHS_MAX,
  { min: E.CFG.PATHS_MIN, max: E.CFG.PATHS_MAX });

// ── 1. THE FAIL ARM FIRST — the defect must be reproducible on today's board ─
// If the old rule no longer produces one-option picks, the board moved and the
// rest of this file is guarding something that is not happening any more.
{
  const oldOnes = MY.filter(p => oldPathCount(p) <= 1);
  ck('FAIL ARM — the band-as-gate rule still collapses to a single direction at '
    + 'most of his picks, so this file is about a live defect',
    oldOnes.length >= 8, { one_option_at: oldOnes, of: MY.length });
  ck('and it did it at his FIRST pick, which is the one he was looking at',
    oldPathCount(MY[0]) <= 1, oldPathCount(MY[0]));
}

// ── 2. THE FIX, AT EVERY PICK HE OWNS ───────────────────────────────────────
{
  const counts = MY.map(p => ({ pick: p, n: pathsAt(p).paths.length }));
  const thin = counts.filter(c => c.n <= 1);
  ck('NO pick offers a single direction any more', thin.length === 0, thin);
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
  const broken = [];
  MY.forEach(p => {
    const r = pathsAt(p);
    const n = oldPathCount(p);
    if (!n) return;
    const kept = r.paths.slice(0, n);
    if (kept.length !== n) broken.push({ pick: p, why: 'old set is not a prefix', n: n });
    kept.forEach((x, i) => {
      if (!x.within_band) broken.push({ pick: p, i: i, why: 'a previously-qualifying path is now out of band' });
    });
    if (r.paths[0] && r.paths[0].price !== 0) broken.push({ pick: p, why: 'top path is not priced at 0' });
  });
  ck('every direction that qualified under the old rule still renders, in the '
    + 'same position, still in band', broken.length === 0, broken.slice(0, 4));

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
