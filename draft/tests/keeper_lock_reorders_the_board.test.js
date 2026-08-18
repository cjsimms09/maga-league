// TERRITORY: relay measures · A rules
// THE KEEPER LOCK RE-ORDERS THE BOARD, AND THE MOVERS ARE RUNNING BACKS.
//
// Register 5f. The board's replacement levels are computed on the BOARD-ONLY
// population — verified below, every published level equals the Nth board-only
// projection exactly. So when the other teams' keepers come off at the 08-21
// 6:00 PM lock (Cory's ruling), the pool shrinks and every level FALLS.
//
// It falls by very different amounts per position, and that is the whole thing:
//
//     RB  179.3 -> 146.1   (-33.2)
//     WR  162.6 -> 147.5   (-15.1)
//     TE  136.4 -> 130.6   ( -5.8)
//     QB  341.72 -> 337.48 ( -4.2)
//     K / DEF               unchanged
//
// `vorp` is `proj_mean - replacement[position]` and the board ranks ACROSS
// positions on it. A UNIFORM drop would move nobody. A DIFFERENTIAL drop moves
// every running back 29 points past every quarterback — so the lock is a
// re-ordering, not a refresh.
//
// ── WHAT THIS FILE IS CAREFUL ABOUT ──────────────────────────────────────────
//
//  1. IT ISOLATES THE LEVELS. Every comparison is over the SAME post-lock
//     population, changing only the replacement levels. Without that, "players
//     moved" would be mostly the pool getting fifteen shorter, which is trivial
//     and uninteresting.
//  2. IT IS A REHEARSAL, NOT A FORECAST. The keeper set comes from
//     `predicted_keepers`, stamped MOCK/REHEARSAL ONLY and never applied to the
//     live board — Cory's 08-11 ruling, and it is right. The magnitudes are an
//     estimate. The DIRECTION is structural: keepers are elite, elite is RB/WR
//     heavy, removing them lowers the Nth-best threshold.
//  3. IT PINS THE MECHANISM, NOT TODAY'S NAMES. The named movers are printed as
//     detail; the assertions are about the shape, so a new board does not make
//     this file red for the wrong reason.
//
// Run: node draft/tests/keeper_lock_reorders_the_board.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 400) : '')); }
};

const SC = B.replacement.starter_counts;
const PUB = B.replacement.replacement_points;
const SKILL = ['QB', 'RB', 'WR', 'TE'];
const PRICED = B.players.filter(p => Number(p.proj_mean) > 0);
const adp = p => Number(p.adjusted_adp != null ? p.adjusted_adp
  : (p.raw_adp != null ? p.raw_adp : p.adp));

const mine = new Set((B.kept_players || []).map(k => String(k.player_id)));
const opp = new Set();
Object.values((B.predicted_keepers || {}).predictions || {}).forEach(r =>
  (r.predicted_keepers || []).forEach(k => {
    const id = String(k.player_id);
    if (!mine.has(id)) opp.add(id);
  }));

const levels = pool => {
  const out = {};
  Object.keys(SC).forEach(pos => {
    const v = pool.filter(p => p.position === pos).map(p => p.proj_mean)
      .sort((a, b) => b - a);
    out[pos] = v.length >= SC[pos] ? v[SC[pos] - 1] : null;
  });
  return out;
};
const rank = (pool, R) => {
  const o = {};
  pool.slice().sort((x, y) =>
    (y.proj_mean - (R[y.position] || 0)) - (x.proj_mean - (R[x.position] || 0)))
    .forEach((p, i) => { o[String(p.player_id)] = i + 1; });
  return o;
};

// ── 1. THE PREMISE: LEVELS ARE BOARD-ONLY, SO THE LOCK MOVES THEM ────────────
{
  const now = levels(PRICED);
  ck('the published replacement levels ARE the board-only Nth projection — the '
    + 'premise of everything below, checked rather than assumed',
  SKILL.every(p => Math.abs(now[p] - PUB[p]) < 0.01),
  { published: PUB, recomputed: now });

  ck('the rehearsal slate names a real set of opponent keepers to remove',
    opp.size >= 10, opp.size);

  const after = PRICED.filter(p => !opp.has(String(p.player_id)));
  ck('CONTROL: removing them shrinks the pool but leaves it large enough that '
    + 'every level is still the Nth of a real population',
  after.length > 500 && SKILL.every(p => levels(after)[p] != null),
  { before: PRICED.length, after: after.length });
}

// ── 2. THE DROP IS DIFFERENTIAL, WHICH IS WHY IT RE-ORDERS ──────────────────
{
  const after = PRICED.filter(p => !opp.has(String(p.player_id)));
  const R1 = levels(PRICED), R2 = levels(after);
  const drop = {};
  SKILL.forEach(p => { drop[p] = R1[p] - R2[p]; });

  ck('every skill replacement level FALLS at the lock — none rises',
    SKILL.every(p => drop[p] >= 0), drop);

  /* THE ASSERTION THAT MATTERS. A uniform drop would move nobody at all, since
   * every vorp would shift by the same constant. The re-ordering exists only
   * because RB falls furthest. */
  ck('DEFECT-SHAPED: the drop is DIFFERENTIAL, RB by far the largest — a '
    + 'uniform drop would re-order nobody',
  drop.RB > drop.QB * 3 && drop.RB > drop.TE * 2,
  { drop, note: 'RB - QB = ' + (drop.RB - drop.QB).toFixed(1) + ' points of relative gain' });

  ck('CONTROL: K and DEF do not move, because no keeper is a kicker or a '
    + 'defence — so this is not a global rescale of everything',
  Math.abs(levels(PRICED).K - levels(after).K) < 0.01
    && Math.abs(levels(PRICED).DEF - levels(after).DEF) < 0.01);
}

// ── 3. THE RE-ORDERING, ISOLATED ────────────────────────────────────────────
{
  const after = PRICED.filter(p => !opp.has(String(p.player_id)));
  const R1 = levels(PRICED), R2 = levels(after);
  //: SAME population both times. Only the levels differ, so nothing here is the
  //: pool getting shorter.
  const before = rank(after, R1), now = rank(after, R2);
  const moved = Object.keys(now).map(id => ({ id, d: before[id] - now[id] }));
  const big = moved.filter(m => Math.abs(m.d) >= 10);
  const byId = {};
  PRICED.forEach(p => { byId[String(p.player_id)] = p; });
  const pos = {};
  big.forEach(m => { const q = byId[m.id].position; pos[q] = (pos[q] || 0) + 1; });

  ck('DEFECT: hundreds of players move ten or more board slots on the levels '
    + 'alone', big.length >= 200, { moved_10_plus: big.length, of: moved.length, by_position: pos });

  const win = big.filter(m => {
    const a = adp(byId[m.id]);
    return Number.isFinite(a) && a >= 27 && a <= 160;
  });
  ck('...and a large share of them sit inside Cory\'s own pick window',
    win.length >= 40, win.length);

  /* THE HEADLINE, AS A SHAPE RATHER THAN A LIST OF NAMES. */
  const top = win.slice().sort((a, b) => b.d - a.d).slice(0, 10);
  ck('DEFECT: the biggest RISERS in his window are overwhelmingly running '
    + 'backs — the position whose replacement level fell furthest',
  top.filter(m => byId[m.id].position === 'RB').length >= 7,
  top.map(m => `${byId[m.id].name} (${byId[m.id].position}) ${before[m.id]}->${now[m.id]}`));

  /* CONTROL — the instrument can report NO movement. If ranking twice under the
   * SAME levels produced movement, the sort would be unstable and every number
   * above would be noise. */
  const same = rank(after, R1);
  ck('CONTROL: ranking twice under the SAME levels moves nobody, so the '
    + 'movement above is the levels and not an unstable sort',
  Object.keys(same).every(id => same[id] === before[id]));
}

// ── 4. THE LOCK DATE COMES FROM THE CONFIG, NOT FROM THIS FILE ──────────────
{
  const cfg = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'draft', 'config', 'league_config.json'), 'utf8'));
  const d = (cfg.keepers || {}).deadline;
  ck('the keeper deadline is a config key, so this file does not carry a '
    + 'fifteenth copy of the date (register 42)',
  d && d.date === '2026-08-21', d);
  ck('...and it records the ruling it came from, so nobody re-litigates it',
    d && /08\/21/.test(d.cory_ruling_verbatim || ''), d && d.cory_ruling_verbatim);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
