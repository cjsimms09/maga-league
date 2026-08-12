// TERRITORY: A
/* DOES THE ORDER POSITIONS ARE TAKEN CHANGE THE STARTING LINEUP?
 *
 * THE ONE ARM THAT DECIDES WHETHER THE REST IS WORTH RUNNING, and it goes first:
 * GREEDY END-STATE. At each pick, take the player who most increases the
 * projected STARTING lineup. It directly maximises the metric everything else is
 * scored on.
 *
 *   · if the shipping rule sits close to it, the metric is near-circular and the
 *     comparison says little;
 *   · if there is a gap, THE GAP IS THE FINDING, denominated in projected points
 *     the current rule leaves on the table.
 *
 * WHY THE POWER ANALYSIS DOES NOT APPLY HERE. "Which strategy makes money" needs
 * a realized season and we get one a year. "Which sequence produces the strongest
 * projected starting lineup" is a property of the board, the room and the pick
 * order — it resolves the moment the simulation ends. And it is NOT circular:
 * the tool is GREEDY PER PICK on a composite while the metric is the END STATE of
 * twelve picks under a snake, and greedy does not reach the best end state
 * because taking the best player now changes what is available at the next four
 * turns.
 *
 * PAIRED ON THE SAME SEED. Every arm sees identical opponent behaviour and an
 * identical board evolution; only my own rule differs. That removes the
 * between-room variance which would otherwise force a large n — 200 paired rooms
 * resolves a couple of projected points per lineup, where unpaired would need
 * thousands.
 *
 * THE PRIOR, from published work on a comparable setup (12-team, 4th slot):
 * bad-autodraft floor 1656, autodraft-for-everyone at the 4th slot ~1875,
 * optimal 1961 — SO ROUGHLY 86 POINTS BETWEEN NAIVE SLOT-FILLING AND OPTIMAL,
 * about 4.6% of the total. Real and not enormous. If ours comes out very
 * differently that says something about our FORMAT rather than about the method,
 * and it is reported either way.
 *
 * ⚠️ THIS MEASURES BEHAVIOUR, NOT VALUE. A stronger projected lineup is better
 * only if the projections are right, and they are public consensus. Any result is
 * a CANDIDATE under the three-filter model — discovery, earning a preregistration
 * rather than a promotion.
 *
 * Run: node draft/tools/construction_order.js [rooms] [--rooms-vary]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('../../public/js/draft/engine.js');

const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const SLEEPER = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'data', 'sleeper_league_settings.json'), 'utf8'));
const L = DATA.league, TEAMS = L.teams, ROUNDS = L.rounds, MY = L.my_draft_slot;
const KEEPERS = (DATA.kept_players || []).filter(k => Number(k.team_slot) === MY);
const KR = (L.keeper_rules || {}).count || 0;

const STARTERS = {};
(SLEEPER.roster_positions || []).forEach(s => { if (s !== 'BN') STARTERS[s] = (STARTERS[s] || 0) + 1; });
const FLEX_OK = { RB: 1, WR: 1, TE: 1 };

const adpOf = p => (p.adjusted_adp != null ? p.adjusted_adp : (p.raw_adp != null ? p.raw_adp : 9999));
const projOf = p => Number(p.proj_mean || 0);
function rng(s) {
  let a = s >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const slotOf = o => { const r = Math.ceil(o / TEAMS), i = o - (r - 1) * TEAMS; return (r % 2 === 1) ? i : (TEAMS - i + 1); };
function myPicks() {
  const out = [];
  for (let r = 1; r <= ROUNDS; r++) out.push((r - 1) * TEAMS + ((r % 2 === 1) ? MY : (TEAMS - MY + 1)));
  return out.slice(KR);
}
const REPL = {};
DATA.players.forEach(p => {
  if (p.position && p.replacement != null && REPL[p.position] == null) REPL[p.position] = Number(p.replacement);
});

/** THE OBJECTIVE: projected points of the STARTING lineup only. Bench is zero. */
function startingStrength(roster) {
  const slots = [];
  Object.keys(STARTERS).forEach(pos => { for (let i = 0; i < STARTERS[pos]; i++) slots.push(pos); });
  slots.sort((a, b) => (a === 'FLEX' ? 1 : 0) - (b === 'FLEX' ? 1 : 0));
  const used = new Set();
  let total = 0, holes = 0;
  slots.forEach(s => {
    const c = roster.filter(p => !used.has(String(p.player_id))
      && (s === 'FLEX' ? FLEX_OK[p.position] : p.position === s))
      .sort((a, b) => projOf(b) - projOf(a));
    if (c.length) { used.add(String(c[0].player_id)); total += projOf(c[0]); }
    else holes++;
  });
  return { points: total, holes: holes };
}

/* ── THE ARMS. Valuation is FIXED across all of them; only ORDER varies. ───── */
const ARMS = {
  /* The shipping rule, unchanged. */
  shipped: (ctx) => {
    const r = E.recommend(ctx);
    return r && r.length ? r[0].player : null;
  },

  /* THE BENCHMARK. Directly maximises the metric: which available player most
   * increases the projected starting lineup right now. Greedy on the OBJECTIVE
   * rather than on a composite. */
  greedy_end_state: (ctx) => {
    const base = startingStrength(ctx.roster).points;
    let best = null, bestGain = -Infinity;
    // Only the plausible top of the board — scanning 1700 players per pick is
    // 12x the cost for a gain that is provably zero below replacement.
    const cand = ctx.board.slice().sort((a, b) => projOf(b) - projOf(a)).slice(0, 60);
    cand.forEach(p => {
      const g = startingStrength(ctx.roster.concat([p])).points - base;
      // Tie-break toward the better player, so an equal-gain bench body does not
      // beat a starter on list order.
      if (g > bestGain || (g === bestGain && best && projOf(p) > projOf(best))) {
        bestGain = g; best = p;
      }
    });
    return best;
  },

  /* SCARCITY PER TURN — the only arm that routes through TIMING rather than
   * value: take the position where (viable players above replacement) divided by
   * (picks until my next turn) is smallest, then the best player there. */
  scarcity_per_turn: (ctx) => {
    const gap = Math.max(1, (ctx.nextPick || ctx.currentPick + 10) - ctx.currentPick);
    const open = {};
    const have = {};
    ctx.roster.forEach(p => { have[p.position] = (have[p.position] || 0) + 1; });
    Object.keys(STARTERS).forEach(pos => {
      if (pos === 'FLEX') return;
      if ((have[pos] || 0) < STARTERS[pos]) open[pos] = 1;
    });
    if (!Object.keys(open).length) { ['RB', 'WR', 'TE'].forEach(p => { open[p] = 1; }); }
    let bestPos = null, bestRatio = Infinity;
    Object.keys(open).forEach(pos => {
      const viable = ctx.board.filter(p => p.position === pos
        && REPL[pos] != null && projOf(p) >= REPL[pos]).length;
      const ratio = viable / gap;
      if (ratio < bestRatio) { bestRatio = ratio; bestPos = pos; }
    });
    const at = ctx.board.filter(p => p.position === bestPos)
      .sort((a, b) => projOf(b) - projOf(a));
    return at[0] || ctx.board.slice().sort((a, b) => projOf(b) - projOf(a))[0];
  },

  /* THE CALIBRATION ARM — strict fill-first, which the Lab already measured
   * losing to the startable-cap mask. If it wins here the HARNESS is wrong, and
   * that is the point of including it. */
  need_filter: (ctx) => {
    const have = {};
    ctx.roster.forEach(p => { have[p.position] = (have[p.position] || 0) + 1; });
    const needed = ctx.board.filter(p => (have[p.position] || 0) < (STARTERS[p.position] || 0));
    const pool = needed.length ? needed
      : ctx.board.filter(p => FLEX_OK[p.position]);
    const use = pool.length ? pool : ctx.board;
    return use.slice().sort((a, b) => projOf(b) - projOf(a))[0];
  },
};

/* Room shapes, so "is the answer robust to the room" is answerable rather than
 * assumed. Each returns the opponent's pick from the board. */
const ROOMS = {
  adp: (board, rand) => {
    const top = board.slice().sort((a, b) => adpOf(a) - adpOf(b)).slice(0, 8);
    return top[Math.min(top.length - 1, Math.floor(rand() * rand() * top.length))];
  },
  // A room that REACHES — takes from deeper in the ADP list, more variance.
  reachy: (board, rand) => {
    const top = board.slice().sort((a, b) => adpOf(a) - adpOf(b)).slice(0, 20);
    return top[Math.floor(rand() * top.length)];
  },
  // A room that takes QUARTERBACKS EARLY, which starves the position I defer.
  qb_early: (board, rand) => {
    if (rand() < 0.30) {
      const qb = board.filter(p => p.position === 'QB')
        .sort((a, b) => adpOf(a) - adpOf(b))[0];
      if (qb) return qb;
    }
    return ROOMS.adp(board, rand);
  },
  // A RUN: once someone takes an RB, the next few opponents pile in.
  rb_run: (board, rand) => {
    if (rand() < 0.45) {
      const rb = board.filter(p => p.position === 'RB')
        .sort((a, b) => adpOf(a) - adpOf(b))[0];
      if (rb) return rb;
    }
    return ROOMS.adp(board, rand);
  },
};

function simulate(seed, armName, roomName, seat) {
  const rand = rng(seed);
  const mySeat = seat || MY;
  const pool = DATA.players.filter(p => p.position && p.proj_mean != null);
  const gone = new Set(KEEPERS.map(k => String(k.player_id)));
  const roster = KEEPERS.map(k => Object.assign({}, k, { is_keeper: true }));
  const picks = [];
  for (let r = 1; r <= ROUNDS; r++) {
    const idx = (r % 2 === 1) ? mySeat : (TEAMS - mySeat + 1);
    picks.push((r - 1) * TEAMS + idx);
  }
  const mine = new Set(picks.slice(KR));
  const opp = {}; for (let s = 1; s <= TEAMS; s++) opp[s] = [];
  const order = [];

  for (let o = 1; o <= TEAMS * ROUNDS; o++) {
    const board = pool.filter(p => !gone.has(String(p.player_id)));
    if (!board.length) break;
    if (!mine.has(o)) {
      const pick = (ROOMS[roomName] || ROOMS.adp)(board, rand);
      if (!pick) break;
      gone.add(String(pick.player_id)); opp[slotOf(o)].push(pick); continue;
    }
    const nx = [...mine].filter(x => x > o).sort((a, b) => a - b)[0] || null;
    const win = [];
    if (nx) for (let q = o; q < nx; q++) { const s = slotOf(q); if (s !== mySeat) win.push({ team_slot: s, pick_no: q, roster: opp[s], profile: null, room: null }); }
    const ctx = { board: board, roster: roster, league: L, weights: E.MEASURED_WEIGHTS,
      currentPick: o, nextPick: nx, totalPicks: TEAMS * ROUNDS,
      myPicksLeft: [...mine].filter(x => x >= o).length,
      roundsLeft: ROUNDS - Math.ceil(o / TEAMS) + 1, runMultipliers: {}, intervening: win };
    let p;
    try { p = ARMS[armName](ctx); } catch (e) { break; }
    if (!p) break;
    order.push(p.position);
    gone.add(String(p.player_id)); roster.push(p); opp[mySeat].push(p);
  }
  const s = startingStrength(roster);
  return { points: s.points, holes: s.holes, order: order.join('') };
}

// ─────────────────────────────────────────────────────────────── report
const rooms = Number(process.argv[2] || 200);
const varyRooms = process.argv.includes('--rooms-vary');
const armNames = Object.keys(ARMS);

console.log('='.repeat(78));
console.log('CONSTRUCTION ORDER — does the sequence change the starting lineup?');
console.log('='.repeat(78));
console.log(`${rooms} PAIRED rooms (same seed across arms), seat ${MY}, valuation FIXED.`);
console.log('Objective: projected points of the STARTING lineup. Bench is worth zero.');
console.log('PRIOR from published work (12-team, 4th slot): ~86 pts between naive');
console.log('slot-filling and optimal, about 4.6% of the total.');
console.log('');

function runSet(roomName, seat, label) {
  const res = {}; armNames.forEach(a => { res[a] = []; });
  const holes = {}; armNames.forEach(a => { holes[a] = 0; });
  const shapes = {}; armNames.forEach(a => { shapes[a] = {}; });
  for (let i = 0; i < rooms; i++) {
    const seed = 60000 + i * 104729;                 // SAME SEED across arms
    armNames.forEach(a => {
      const r = simulate(seed, a, roomName, seat);
      res[a].push(r.points);
      if (r.holes) holes[a]++;
      shapes[a][r.order] = (shapes[a][r.order] || 0) + 1;
    });
  }
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const pct = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length * q)]; };
  const base = mean(res.shipped);
  console.log('── ' + label + ' ' + '─'.repeat(Math.max(0, 60 - label.length)));
  console.log('   arm                 mean     vs shipped      p10      p50      p90   holes');
  armNames.forEach(a => {
    const m = mean(res[a]);
    // PAIRED difference, which is the number the design buys.
    const diffs = res[a].map((v, i) => v - res.shipped[i]);
    const dm = mean(diffs);
    const sd = Math.sqrt(diffs.reduce((s, d) => s + (d - dm) * (d - dm), 0) / Math.max(1, diffs.length - 1));
    const se = sd / Math.sqrt(diffs.length);
    console.log(`   ${a.padEnd(18)} ${m.toFixed(1).padStart(7)} `
      + `${(a === 'shipped' ? '     —' : (dm >= 0 ? '+' : '') + dm.toFixed(1) + ' ±' + (1.96 * se).toFixed(1)).padStart(14)} `
      + `${pct(res[a], 0.1).toFixed(0).padStart(8)} ${pct(res[a], 0.5).toFixed(0).padStart(8)} `
      + `${pct(res[a], 0.9).toFixed(0).padStart(8)} ${String(holes[a]).padStart(6)}`);
  });
  console.log(`   shipped mean ${base.toFixed(1)} — the 86-pt published gap would be `
    + `${(86 / base * 100).toFixed(1)}% of it`);
  console.log('');
  return res;
}

runSet('adp', MY, `ROOM: adp-with-jitter · SEAT ${MY}`);

if (varyRooms) {
  ['reachy', 'qb_early', 'rb_run'].forEach(r => runSet(r, MY, `ROOM: ${r} · SEAT ${MY}`));
  [2, 5].forEach(s => runSet('adp', s, `ROOM: adp · SEAT ${s}`));
}
