// TERRITORY: A
/* THE INTERACTION NEITHER SIDE OWNED — B's source toggles crossed with A's
 * register 195 fix, on the pre-draft board.
 *
 * Cory, 2026-08-21: the Big Board tab was wrong — no way to see all the
 * sources' overall rankings, only Draft Sharks and the blend. B built the
 * four-source toggle. Separately, register 195 fixed a pre-draft survival
 * collapse whose visible symptom was FOUR KICKERS AND THREE DEFENSES sitting
 * at ranks 12-18 of the pre-draft board.
 *
 * THOSE TWO CHANGES MEET HERE, AND NOTHING TESTED THE MEETING. `forSource()`
 * hands `scorePlayer` a DIFFERENT BOARD — a different pool (Draft Sharks
 * covers 247 of 700, FantasyPros 427, our model 507) and different
 * `overall_rank`/`proj_mean`/`tier` values. Survival, VONA and the
 * conservation fallback all read that board. So the register 195 defect could
 * be fixed on the blend and alive on any of the four source views, and both
 * B's suites and A's would stay green: B's check the toggle's plumbing, A's
 * check the blend.
 *
 * This pins the SHAPE property across every view Cory can actually select.
 * It is deliberately an observable he can check himself in one glance rather
 * than an internal quantity, because the internal quantity is what was wrong.
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
require(path.join(ROOT, 'public/js/draft/survival.js'));
require(path.join(ROOT, 'public/js/draft/composite.js'));
require(path.join(ROOT, 'public/js/draft/source_board.js'));
const SB = global.window.SourceBoard;
const E = require(path.join(ROOT, 'public/js/draft/engine.js'));
const data = require(path.join(ROOT, 'public/draft_data.json'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 260) : '')); }
};

const my = ((data.pick_order || {}).my_picks) || [];
const keptIds = ((data.kept_player_ids) || []).map(String);
const kept = (data.kept_players) || [];
const base = data.players.filter(p => !keptIds.includes(String(p.player_id)));

function view(srcKey, pre) {
  const pool = SB.forSource(base, srcKey);
  const ctx = {
    board: pool, currentPick: my[0], nextPick: my[1],
    totalPicks: ((data.pick_order || {}).picks || []).length || null,
    roster: kept.slice(), currentKeepers: kept.slice(), league: data.league,
    pickBoard: (data.pick_order || {}).picks || null, intervening: [],
    myPickIndex: 0, totalMyPicks: my.length, myPicksLeft: my.length,
    roundsLeft: my.length, runMultipliers: {}, drift: null, preDraftPrep: pre,
  };
  const scored = pool
    .filter(p => p.adjusted_adp != null && p.adjusted_adp <= 200)
    .map(p => { const s = E.scorePlayer(p, ctx) || {};
      return { name: p.name, pos: p.position, score: s.score, sv: s.survival_to_next }; })
    .filter(r => r.score != null)
    .sort((a, b) => b.score - a.score);
  return { pool: pool, top20: scored.slice(0, 20), top25: scored.slice(0, 25) };
}

const VIEWS = [{ key: null, label: 'Blend' }].concat(SB.SOURCES);
const onesie = r => r.pos === 'K' || r.pos === 'DEF';

ck('CONTROL: every source Cory can select is actually present in the toggle — '
  + 'the complaint that started this was that only two were',
SB.SOURCES.length >= 4 && ['ds', 'sleeper', 'ownmodel', 'fantasypros']
  .every(k => SB.SOURCES.some(s => s.key === k)),
SB.SOURCES.map(s => s.key));

/* CONTROL: the views must be genuinely different boards. If forSource ever
 * silently returned the blend for every key, every check below would pass
 * while testing one view five times. */
const pools = VIEWS.map(v => view(v.key, true).pool.length);
ck('CONTROL: the source views are genuinely different pools, so the checks '
  + 'below are five measurements rather than one repeated five times',
new Set(pools).size >= 3, { pools: pools, labels: VIEWS.map(v => v.label) });

VIEWS.forEach(v => {
  const r = view(v.key, true);
  const bad = r.top20.filter(onesie);
  ck('[' + v.label + '] no kicker or defense in the pre-draft top 20',
    bad.length === 0,
    { intruders: bad.map(x => x.pos + ' ' + x.name), pool: r.pool.length });
});

/* THE VALUE, NOT THE COUNT — the lesson register 195 cost twice. The elites'
 * survivals SHOULD repeat: 0.0000 is the correct answer for a player who will
 * not last fifteen more picks, and a distinct-count arm reads that as a wall
 * and fails on correct behaviour. What must never come back is a repeated
 * value that is NOT near zero — 67.4% was the original, 5.2005% was the one
 * the alternative fix produced. So this checks the number, not its variety. */
VIEWS.forEach(v => {
  const vals = view(v.key, true).top25.map(r => r.sv).filter(x => x != null);
  const counts = {};
  vals.forEach(x => { const k = x.toFixed(4); counts[k] = (counts[k] || 0) + 1; });
  const commonest = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  ck('[' + v.label + '] the survival value the elites share is ~0, not a wall '
    + 'at some other number',
    Number(commonest) < 0.01,
    { commonestValue: commonest, timesRepeated: counts[commonest], of: vals.length });
});

/* FAIL ARM, once, on the view most likely to hide the defect: Draft Sharks has
 * the smallest pool (247), so if the anchored question were still in play
 * anywhere it would show here. It must still produce the intrusion. */
const anchoredDs = view('ds', false).top20.filter(onesie);
ck('FAIL ARM — with preDraftPrep false the anchored question still floats '
  + 'K/DEF into the Draft Sharks top 20, so these checks guard live behaviour',
anchoredDs.length >= 1,
{ intruders: anchoredDs.map(x => x.pos + ' ' + x.name) });

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
