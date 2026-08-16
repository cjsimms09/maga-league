// TERRITORY: A
// THE ARCHETYPE OVERLAY IS A CONSTRAINT ON THE ENGINE'S LIST, NOT A SECOND
// BRAIN — pure tests, deterministic, no engine, no I/O.
//
// Run: node draft/tests/archetype_policy.test.js
'use strict';
const path = require('path');
const AP = require(path.join(__dirname, '..', 'tools', 'archetype_policy.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

let nextId = 1;
function rec(pos, opts) {
  const o = opts || {};
  return {
    // 'in' checks, not null-coalescing: a test passing an EXPLICIT null must
    // get null, or the null-vorp check silently tests the default instead
    // (this exact line failed that way on first run — kept honest).
    player: { player_id: String(nextId++), name: pos + nextId, position: pos,
      vorp: 'vorp' in o ? o.vorp : 10,
      adjusted_adp: 'adp' in o ? o.adp : 50 },
    score: o.score != null ? o.score : 100,
    forced: o.forced || undefined,
    legality_warning: o.warning != null ? o.warning : undefined,
  };
}
const st = (round, posCounts, picksLeft) =>
  ({ round, posCounts: posCounts || {}, picksLeft: picksLeft == null ? 6 : picksLeft });

// ── legality always owns the pick ──────────────────────────────────────────
{
  const recs = [Object.assign(rec('RB'), { forced: true }), rec('WR'), rec('QB')];
  const everyArm = Object.keys(AP.ARCHETYPES).every(a =>
    AP.choosePick(a, recs, st(5, { RB: 2 })) === recs[0]);
  ck('a FORCED top rec is taken by every archetype — rails are never overridden',
    everyArm);
}
{
  const recs = [Object.assign(rec('RB'), { legality_warning: 'next pick forced' }),
    rec('WR'), rec('QB')];
  const everyArm = Object.keys(AP.ARCHETYPES).every(a =>
    AP.choosePick(a, recs, st(5, { RB: 2 })) === recs[0]);
  ck('a legality WARNING defers every archetype to the engine top pick', everyArm);
}

// ── shipped is the identity policy ─────────────────────────────────────────
{
  const recs = [rec('RB'), rec('WR')];
  ck('shipped returns recs[0] untouched', AP.choosePick('shipped', recs, st(4)) === recs[0]);
}

// ── zero_rb: ban with a round domain ───────────────────────────────────────
{
  const recs = [rec('RB'), rec('RB'), rec('WR'), rec('QB')];
  ck('zero_rb round 4: skips both RBs, takes the first non-RB',
    AP.choosePick('zero_rb', recs, st(4, { RB: 2 })) === recs[2]);
  ck('zero_rb round 10 (boundary — first round the ban lifts): takes the top RB',
    AP.choosePick('zero_rb', recs, st(10, { RB: 2 })) === recs[0]);
  ck('zero_rb round 9 (boundary — last banned round): still skips RB',
    AP.choosePick('zero_rb', recs, st(9, { RB: 2 })) === recs[2]);
}
{
  const recs = [rec('RB'), rec('RB')];
  ck('zero_rb with ONLY RBs in the candidate slice defers to recs[0] rather '
    + 'than reaching outside the engine list',
    AP.choosePick('zero_rb', recs, st(5, { RB: 2 })) === recs[0]);
}
{
  const recs = [rec('K'), rec('WR')];
  ck('a K on top un-forced is the engine\'s call — bans never touch onesies',
    AP.choosePick('zero_rb', recs, st(5, {})) === recs[0]);
}

// ── robust_rb: seek with count + round domain ──────────────────────────────
{
  const recs = [rec('WR'), rec('QB'), rec('RB'), rec('WR')];
  ck('robust_rb round 5, RB<5: takes the highest-ranked RB (index 2)',
    AP.choosePick('robust_rb', recs, st(5, { RB: 2 })) === recs[2]);
  ck('robust_rb at 5 RBs already: defers to recs[0]',
    AP.choosePick('robust_rb', recs, st(5, { RB: 5 })) === recs[0]);
  ck('robust_rb round 11 (boundary — past the seek window): defers to recs[0]',
    AP.choosePick('robust_rb', recs, st(11, { RB: 2 })) === recs[0]);
  ck('robust_rb round 10 (boundary — last seek round): still seeks the RB',
    AP.choosePick('robust_rb', recs, st(10, { RB: 2 })) === recs[2]);
}
{
  const recs = [rec('WR'), rec('QB')];
  ck('robust_rb with no RB in the slice defers to recs[0]',
    AP.choosePick('robust_rb', recs, st(5, { RB: 2 })) === recs[0]);
}

// ── early_qb / late_qb ─────────────────────────────────────────────────────
{
  const recs = [rec('WR'), rec('QB'), rec('RB')];
  ck('early_qb round 4, no QB yet: takes the QB',
    AP.choosePick('early_qb', recs, st(4, {})) === recs[1]);
  ck('early_qb with QB1 rostered: defers to recs[0]',
    AP.choosePick('early_qb', recs, st(4, { QB: 1 })) === recs[0]);
  ck('early_qb round 7 (boundary — past the window): defers to recs[0]',
    AP.choosePick('early_qb', recs, st(7, {})) === recs[0]);
}
{
  const recs = [rec('QB'), rec('WR')];
  ck('late_qb round 10 (boundary — last banned round): skips the QB',
    AP.choosePick('late_qb', recs, st(10, {})) === recs[1]);
  ck('late_qb round 11 (boundary — ban lifts): takes the QB',
    AP.choosePick('late_qb', recs, st(11, {})) === recs[0]);
}

// ── te_early ───────────────────────────────────────────────────────────────
{
  const recs = [rec('WR'), rec('RB'), rec('TE')];
  ck('te_early round 6, no TE: takes the TE',
    AP.choosePick('te_early', recs, st(6, {})) === recs[2]);
  ck('te_early with TE1 rostered: defers to recs[0]',
    AP.choosePick('te_early', recs, st(6, { TE: 1 })) === recs[0]);
  ck('te_early round 8 (boundary — past the window): defers to recs[0]',
    AP.choosePick('te_early', recs, st(8, {})) === recs[0]);
}

// ── seat_plan: follow the shipped schedule where the engine has the goods ──
{
  const recs = [rec('WR'), rec('RB'), rec('TE')];
  ck('seat_plan with planSlot TE takes the TE',
    AP.choosePick('seat_plan', recs, Object.assign(st(4, {}), { planSlot: 'TE' })) === recs[2]);
  ck('seat_plan with planSlot BENCH defers to the engine',
    AP.choosePick('seat_plan', recs, Object.assign(st(7, {}), { planSlot: 'BENCH' })) === recs[0]);
  ck('seat_plan with no planSlot defers to the engine',
    AP.choosePick('seat_plan', recs, st(7, {})) === recs[0]);
  ck('seat_plan FLEX seat = best engine candidate among RB/WR/TE (recs[0] here)',
    AP.choosePick('seat_plan', recs, Object.assign(st(5, {}), { planSlot: 'FLEX' })) === recs[0]);
}
{
  const recs = [rec('WR'), rec('K'), rec('RB')];
  ck('seat_plan is the ONE archetype allowed to seek a scheduled onesie',
    AP.choosePick('seat_plan', recs, Object.assign(st(12, {}), { planSlot: 'K' })) === recs[1]);
  const noK = [rec('WR'), rec('RB')];
  ck('a scheduled onesie absent from the candidate slice defers to the engine',
    AP.choosePick('seat_plan', noK, Object.assign(st(12, {}), { planSlot: 'K' })) === noK[0]);
}

// ── bpa_vorp / market_adp reranks ──────────────────────────────────────────
{
  const recs = [rec('WR', { vorp: 20 }), rec('RB', { vorp: 45 }), rec('QB', { vorp: 30 })];
  ck('bpa_vorp takes the max-vorp candidate even at rank 2',
    AP.choosePick('bpa_vorp', recs, st(5, {})) === recs[1]);
}
{
  const recs = [rec('WR', { vorp: 20 }), rec('K', { vorp: 999 }), rec('RB', { vorp: 30 })];
  ck('bpa_vorp never selects a K/DEF by preference, whatever its vorp',
    AP.choosePick('bpa_vorp', recs, st(5, {})) === recs[2]);
}
{
  const recs = [rec('WR', { vorp: null }), rec('RB', { vorp: 5 })];
  ck('bpa_vorp skips a null vorp rather than coercing it to a value',
    AP.choosePick('bpa_vorp', recs, st(5, {})) === recs[1]);
}
{
  const recs = [rec('WR', { adp: 40 }), rec('RB', { adp: 33.2 }), rec('QB', { adp: 61 })];
  ck('market_adp takes the lowest-ADP candidate',
    AP.choosePick('market_adp', recs, st(5, {})) === recs[1]);
}
{
  const p = { adjusted_adp: null, raw_adp: 12 };
  ck('adpOf falls back adjusted_adp -> raw_adp -> 9999',
    AP.adpOf(p) === 12 && AP.adpOf({}) === 9999);
}

// ── TOP_N is a real boundary (break at the boundary, not the obvious zone) ─
{
  const recs = [];
  for (let i = 0; i < AP.TOP_N; i++) recs.push(rec('WR'));
  recs.push(rec('RB'));      // index TOP_N — one past the candidate slice
  ck('a sought position at index TOP_N (one past the slice) is NOT reachable '
    + '— robust_rb defers to recs[0]',
    AP.choosePick('robust_rb', recs, st(5, { RB: 2 })) === recs[0]);
  const recs2 = recs.slice(0, AP.TOP_N - 1);
  recs2.push(rec('RB'));     // index TOP_N-1 — the last slot inside the slice
  ck('the same position at index TOP_N-1 (last slot inside) IS reachable',
    AP.choosePick('robust_rb', recs2, st(5, { RB: 2 })) === recs2[AP.TOP_N - 1]);
}

// ── contract edges ─────────────────────────────────────────────────────────
{
  let threw = false;
  try { AP.choosePick('no_such_archetype', [rec('WR')], st(4)); } catch (e) { threw = true; }
  ck('an unknown archetype name THROWS — a silent default would rank the '
    + 'control under another arm\'s label', threw);
  ck('empty recs returns null rather than inventing a pick',
    AP.choosePick('shipped', [], st(4)) === null);
}
{
  const recs = [rec('WR'), rec('RB')];
  const a = AP.choosePick('zero_rb', recs, st(5, {}));
  const b = AP.choosePick('zero_rb', recs, st(5, {}));
  ck('deterministic: identical inputs give the identical choice', a === b && a === recs[0]);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
