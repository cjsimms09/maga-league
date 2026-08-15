#!/usr/bin/env node
'use strict';
/* THE MISSING EVIDENCE — a real, committed, reproducible multi-room
 * simulation for the wire-compared bench branch (VONA_WIRE_BENCH, engine.js).
 *
 * The independent OpenAI review (draft/audit/bench_wire_comparison_claim_
 * 2026-08-15.md, BLOCK verdict) named this exactly: "the primary evidence (a
 * 60-room sim and example VONA outputs) is not reproducible from this
 * repository... Commit a minimal, runnable multi-room simulation harness."
 * This is that, built from scratch this session rather than reconstructed
 * from a prose description — the old 60-room numbers are NOT assumed to
 * reproduce and this file reports whatever it actually measures, even if
 * that differs from the earlier, uncommitted run.
 *
 * MECHANICS: extends draft/tools/mock_walk.js's proven pattern (opponents
 * pick from the real board, I call the real E.recommend() through the real
 * live_context.js) with SEEDED room-to-room variation. Pure ADP-order
 * opponents produce the same draft every time; real rooms don't. Variation
 * comes from perturbing each undrafted player's effective rank by a Gaussian
 * draw scaled to the board's OWN adp_sd (real market uncertainty already on
 * every player, not an invented noise parameter) — a seeded mulberry32 PRNG
 * makes every room reproducible from its seed number alone.
 *
 * PAIRED, not independent: for each seed, the SAME opponent-noise draws run
 * once with VONA_WIRE_BENCH off (today's shipped default) and once on, so a
 * difference in outcome is attributable to the flag, not to different rooms.
 * The two runs diverge from wherever my own picks first differ (expected —
 * a different pick changes what's left on the board for opponents too).
 *
 * Run: node draft/tools/bench_wire_room_sim.js [--rooms 30] [--seed 1]
 * Writes: draft/data/bench_wire_room_sim.json
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
require(path.join(ROOT, 'public', 'js', 'draft', 'composite.js'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
require(path.join(ROOT, 'public', 'js', 'draft', 'needrule.js'));
const LC = require(path.join(__dirname, 'live_context.js'));

const args = process.argv.slice(2);
const flagIdx = f => args.indexOf(f);
const ROOMS = flagIdx('--rooms') >= 0 ? Number(args[flagIdx('--rooms') + 1]) : 30;
const SEED0 = flagIdx('--seed') >= 0 ? Number(args[flagIdx('--seed') + 1]) : 1;

const WIRE = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'data', 'wire_level.json'), 'utf8')).per_week;

// mulberry32: tiny, fast, seeded, deterministic — the same seed always
// produces the same room, so any reported result can be re-run exactly.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rng) {
  // Box-Muller. Two uniforms in, one Gaussian out.
  const u1 = Math.max(rng(), 1e-9), u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

const board = LC.loadBoard();
const ALL = board.players;
const KEEPERS = board.kept_players;
const LEAGUE = board.league;
const ORDER = board.pick_order;
const MY_SLOT = LEAGUE.my_draft_slot;
const MY_PICKS = (ORDER.my_picks || []).slice();
const TOTAL = (ORDER.picks || []).length;

// Noisy-ADP opponent: real ADP, perturbed by a seeded Gaussian draw scaled to
// the player's own adp_sd (market uncertainty already on the board) — a
// player with a tight consensus barely moves; a contested one can move a lot,
// which is the real shape of draft-room variance.
function opponentPick(pool, rng) {
  let best = null, bestScore = Infinity;
  for (const p of pool) {
    const adp = p.adp == null ? 9999 : Number(p.adp);
    const sd = p.adp_sd == null ? 6 : Number(p.adp_sd);
    const score = adp + gaussian(rng) * sd;
    if (score < bestScore) { bestScore = score; best = p; }
  }
  return best;
}

function runRoom(seed, wireBenchOn) {
  const rng = mulberry32(seed);
  const drafted = new Set();
  KEEPERS.forEach(k => drafted.add(String(k.player_id)));
  let myRoster = KEEPERS.map(k => Object.assign({}, k, { is_keeper: true }));
  const picksLog = [];

  // VONA_SLOT_AWARE must be ON for either arm — the bench branch (where
  // VONA_WIRE_BENCH applies at all) is only reached when it's true; with it
  // off, vona() always returns the flat `straight` value and the two arms
  // are identical by construction. This matches Finding 9's own original
  // test setup ("VONA_SLOT_AWARE=true, flex branch untouched, only bench
  // branch wire-compared") — found by this simulator's OWN first run
  // reporting identical off/on results, not assumed from the prose.
  const savedSlot = E.CFG.VONA_SLOT_AWARE;
  const savedFlag = E.CFG.VONA_WIRE_BENCH;
  E.CFG.VONA_SLOT_AWARE = true;
  E.CFG.VONA_WIRE_BENCH = wireBenchOn;
  try {
    for (let i = 0; i < MY_PICKS.length; i++) {
      const pick = MY_PICKS[i];
      const next = MY_PICKS[i + 1] || null;
      let pool = ALL.filter(p => !drafted.has(String(p.player_id)));
      const before = i === 0 ? pick - 1 : pick - MY_PICKS[i - 1] - 1;
      for (let k = 0; k < before; k++) {
        const p = opponentPick(pool, rng);
        if (!p) break;
        drafted.add(String(p.player_id));
        pool = pool.filter(x => String(x.player_id) !== String(p.player_id));
      }
      const ctx = LC.liveContext({
        currentPick: pick, nextPick: next == null ? pick : next,
        board: pool, roster: myRoster, myPicksLeft: MY_PICKS.length - i, myPickIndex: i,
      });
      ctx.wireWeekly = WIRE;
      let recs;
      try { recs = E.recommend(ctx); } catch (e) { break; }
      if (!recs || !recs.length) break;
      const p = recs[0].player;
      picksLog.push({ pick, name: p.name, pos: p.position, round: Math.ceil(pick / (LEAGUE.teams || 10)) });
      drafted.add(String(p.player_id));
      myRoster.push(p);
    }
  } finally {
    E.CFG.VONA_SLOT_AWARE = savedSlot;
    E.CFG.VONA_WIRE_BENCH = savedFlag;
  }

  const posCounts = {};
  myRoster.forEach(p => { posCounts[p.position] = (posCounts[p.position] || 0) + 1; });
  const totalRounds = Math.ceil(TOTAL / (LEAGUE.teams || 10));
  const qbPicks = picksLog.filter(x => x.pos === 'QB');
  const qb2 = qbPicks.length >= 2 ? qbPicks[1] : null;
  return { seed, posCounts, picksLog, qb2Round: qb2 ? qb2.round : null,
    picksLeftAtQB2: qb2 ? (MY_PICKS.length - picksLog.findIndex(x => x === qb2)) : null,
    totalRounds };
}

const results = { off: [], on: [] };
for (let s = SEED0; s < SEED0 + ROOMS; s++) {
  results.off.push(runRoom(s, false));
  results.on.push(runRoom(s, true));
}

function summarize(rooms) {
  const n = rooms.length;
  const rbZero = rooms.filter(r => !(r.posCounts.RB > 0)).length;
  const shapeCounts = {};
  rooms.forEach(r => {
    const key = ['QB', 'RB', 'WR', 'TE'].map(p => p + (r.posCounts[p] || 0)).join('/');
    shapeCounts[key] = (shapeCounts[key] || 0) + 1;
  });
  const modal = Object.entries(shapeCounts).sort((a, b) => b[1] - a[1])[0];
  const qb2Rooms = rooms.filter(r => r.qb2Round != null);
  const qb2Late = qb2Rooms.filter(r => r.picksLeftAtQB2 != null && r.picksLeftAtQB2 <= 5);
  return {
    n, rb_zero_rooms: rbZero, rb_zero_pct: Math.round(1000 * rbZero / n) / 10,
    modal_shape: modal ? modal[0] : null, modal_pct: modal ? Math.round(1000 * modal[1] / n) / 10 : null,
    shape_distribution: shapeCounts,
    qb2_rate_pct: Math.round(1000 * qb2Rooms.length / n) / 10,
    qb2_late_of_qb2_pct: qb2Rooms.length ? Math.round(1000 * qb2Late.length / qb2Rooms.length) / 10 : null,
    qb2_rounds: qb2Rooms.map(r => r.qb2Round),
  };
}

const summary = { off: summarize(results.off), on: summarize(results.on) };
const out = { rooms: ROOMS, seed_start: SEED0, generated_at: new Date().toISOString(),
  summary, detail: results };
fs.writeFileSync(path.join(ROOT, 'draft', 'data', 'bench_wire_room_sim.json'),
  JSON.stringify(out, null, 2));

console.log(`BENCH WIRE-COMPARISON — ${ROOMS} paired rooms, seeds ${SEED0}-${SEED0 + ROOMS - 1}`);
console.log('  Both arms run with VONA_SLOT_AWARE=true (also off by default; needed to reach');
console.log('  the bench branch at all) — only VONA_WIRE_BENCH differs between them.\n');
console.log('  VONA_SLOT_AWARE=true, VONA_WIRE_BENCH=false (the vorp-based bench branch,');
console.log('  i.e. the ORIGINAL slot-aware baseline PARKED.md measured wiping RB to 0):');
console.log('    RB=0 rooms: ' + summary.off.rb_zero_rooms + '/' + ROOMS + ' (' + summary.off.rb_zero_pct + '%)');
console.log('    modal shape: ' + summary.off.modal_shape + ' (' + summary.off.modal_pct + '%)');
console.log('    QB2 rate: ' + summary.off.qb2_rate_pct + '%, late (<=5 picks left) when it happens: '
  + summary.off.qb2_late_of_qb2_pct + '%');
console.log('\n  VONA_SLOT_AWARE=true, VONA_WIRE_BENCH=true (the wire-compared prototype):');
console.log('    RB=0 rooms: ' + summary.on.rb_zero_rooms + '/' + ROOMS + ' (' + summary.on.rb_zero_pct + '%)');
console.log('    modal shape: ' + summary.on.modal_shape + ' (' + summary.on.modal_pct + '%)');
console.log('    QB2 rate: ' + summary.on.qb2_rate_pct + '%, late (<=5 picks left) when it happens: '
  + summary.on.qb2_late_of_qb2_pct + '%');
console.log('\n  wrote draft/data/bench_wire_room_sim.json');
