/* WHEN TO STRIKE AT EACH POSITION — the study Cory actually asked for.
 *
 * Cory, 2026-08-20, after a long detour through roster construction he did not
 * ask for: "really all I was wanting out of the roster builder is for it to be
 * running a deep study of when the best time to strike at certain positions is
 * based on vona."
 *
 * That is a POSITION-TIMING question, not a player-picking one. He picks the
 * player. This says WHEN each position gets expensive to wait on.
 *
 * ── WHAT IT COMPUTES ───────────────────────────────────────────────────────
 *
 * At each of his twelve picks, for each position: the best VONA available at
 * that position, and the projected points of the man carrying it. VONA is
 * "what it costs to wait one more pick" — so a position's PEAK is the pick at
 * which waiting hurts most, which is the moment to strike.
 *
 * Both numbers, deliberately. VONA alone tells you when a position is about to
 * run dry; it does not tell you whether the man is worth having. A position can
 * be urgent and cheap at the same time and the two columns say so separately.
 *
 * ── AND THE CAVEAT THE STUDY WOULD BE DISHONEST WITHOUT ────────────────────
 *
 * VONA GOES FLAT. Measured on this board: the spread between the best VONA and
 * the tenth-best is 17.95 at pick 33 and collapses to 1.92-6.25 from pick 68
 * onward. After round six the whole board sits inside a few points, and a
 * kicker can top the list by 0.3 without meaning anything. Every reading below
 * pick 68 should be taken as ordering; every reading after it should be taken
 * as "no strong signal" unless the number is genuinely large.
 *
 * That is a property of a one-pick-ahead quantity on a thinning board, not a
 * defect, and it is why the peaks matter more than the levels.
 *
 * ONE POOL, ONE INSTANT. Every position is scored against the SAME board at the
 * SAME pick, with the gone-set counted in SELECTIONS rather than board slots
 * (`liveBefore`) — the keeper-slot over-removal that cost three players per
 * pick is the repo's own defect and is not re-introduced here.
 *
 * Run: node draft/tools/when_to_strike.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
const E = require(path.join(ROOT, 'public/js/draft/engine.js'));
const { realRoster } = require(path.join(ROOT, 'draft/tests/_empty_roster_fiction_precondition.js'));
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/draft_data.json'), 'utf8'));
const L = D.league, MY_SLOT = L.my_draft_slot;
const MY = ((D.pick_order || {}).my_picks) || [];
const rows = ((D.pick_order || {}).picks) || [];
const adp = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const pool = D.players.filter(p => p.position && p.proj_mean != null);
const byAdp = pool.slice().sort((a, b) => adp(a) - adp(b));
const liveBefore = pk => rows.filter(r => r.overall < pk && !r.keeper_slot).length;
const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

/* THE ROSTER IS HIS KEEPERS AND STAYS THERE. This is a study of the BOARD, and
 * threading a roster that grows by some model's choices would make it a study
 * of that model instead — which is the thing he said he does not want. */
const ROSTER = realRoster();

const grid = {};
POS.forEach(p => { grid[p] = []; });
const spreadAt = [];

MY.forEach((cur, i) => {
  const nxt = MY[i + 1] || cur + 15;
  const taken = new Set(byAdp.slice(0, liveBefore(cur)).map(p => String(p.player_id)));
  ROSTER.forEach(k => taken.add(String(k.player_id)));
  const board = byAdp.filter(p => !taken.has(String(p.player_id)));
  const ctx = { board: board, roster: ROSTER, league: L, currentPick: cur, nextPick: nxt,
    totalPicks: 150, myPicksLeft: MY.length - i, myPickIndex: i, totalMyPicks: MY.length,
    roundsLeft: MY.length - i, runMultipliers: {}, pickBoard: rows,
    intervening: rows.filter(r => r.overall >= cur && r.overall < nxt && r.slot !== MY_SLOT)
      .map(r => ({ team_slot: r.slot, pick_no: r.overall, roster: [], profile: null, room: [] })) };

  const all = [];
  POS.forEach(pos => {
    const cands = board.filter(p => p.position === pos)
      .map(p => ({ p: p, v: E.vona(p, board, nxt, ctx) }))
      .filter(x => isFinite(x.v))
      .sort((a, b) => b.v - a.v);
    grid[pos].push(cands.length ? cands[0] : null);
    all.push.apply(all, cands);
  });
  all.sort((a, b) => b.v - a.v);
  spreadAt.push(all.length > 10 ? all[0].v - all[9].v : NaN);
});

/* ── THE GRID ────────────────────────────────────────────────────────────── */
console.log('\n  WHEN TO STRIKE — best VONA available at each position, at each of your picks');
console.log('  (VONA = what it costs you to wait one more pick. Higher = strike now.)\n');
console.log('  pick  ' + POS.map(p => p.padStart(7)).join('') + '     board spread');
MY.forEach((cur, i) => {
  const row = POS.map(p => {
    const c = grid[p][i];
    return (c ? c.v.toFixed(1) : '—').padStart(7);
  }).join('');
  const sp = spreadAt[i];
  console.log('  ' + String(cur).padEnd(6) + row + '     '
    + (isFinite(sp) ? sp.toFixed(1) : '—') + (isFinite(sp) && sp < 7 ? '  (flat)' : ''));
});

/* ── THE ANSWER, PER POSITION ────────────────────────────────────────────── */
console.log('\n  STRIKE WINDOWS — where each position\'s cost-of-waiting peaks\n');
console.log('  pos   strike at   VONA there   who carries it              proj pts');
POS.forEach(pos => {
  let bi = -1, bv = -Infinity;
  grid[pos].forEach((c, i) => { if (c && c.v > bv) { bv = c.v; bi = i; } });
  if (bi < 0) { console.log('  ' + pos.padEnd(6) + 'no candidate'); return; }
  const c = grid[pos][bi];
  console.log('  ' + pos.padEnd(6) + String('pick ' + MY[bi]).padEnd(12)
    + bv.toFixed(1).padEnd(13) + c.p.name.padEnd(28)
    + (c.p.proj_mean || 0).toFixed(0));
});

console.log('\n  HOW TO READ IT. A position\'s peak is the pick at which waiting costs');
console.log('  most — that is the strike window. The board-spread column is the');
console.log('  honesty check: below about 7 points the whole board is inside a few');
console.log('  points and no position is genuinely urgent, whatever the ordering says.');
console.log('\n  This picks nobody. It says WHEN. You pick WHO.\n');
