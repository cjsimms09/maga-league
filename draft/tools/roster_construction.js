// TERRITORY: A
/* DO TWELVE INDIVIDUALLY GOOD PICKS BUILD A STARTABLE LINEUP?
 *
 * THE GAP THIS CLOSES. Everything tested so far asks whether a pick follows the
 * model's rules. Nothing establishes whether the SEQUENCE produces a usable
 * starting roster. Those are different claims and only the first has ever been
 * checked — which matters most right now, because the bench-branch anchor was
 * fixed today and "the late picks are sane again" is not "the twelve picks
 * together fill the lineup".
 *
 * ── THE ROSTER REQUIREMENTS, TAKEN FROM SLEEPER AND NOT FROM ANYBODY'S LIST ──
 *
 * `draft/data/sleeper_league_settings.json` -> roster_positions:
 *     QB, RB, RB, WR, WR, TE, FLEX, K, DEF + 6 x BN   (15)
 *
 * SO THE LEAGUE STARTS TWO RECEIVERS, NOT THREE. Cory's brief corrected an
 * earlier note to say three and asked explicitly that the validation confirm
 * against Sleeper rather than inherit his error — this is that confirmation, and
 * the correction was the thing that was wrong. With Chase, Henry and Walker
 * kept, the OPEN starting slots are:
 *
 *     QB, WR2, TE, FLEX, K, DEF      — six, not seven
 *
 * RB3 IS FULLY STARTABLE IN FLEX (FLEX = RB/WR/TE), so a third back is never
 * counted as redundant depth here.
 *
 * ── WHAT COUNTS AS A FAILURE, DECIDED BEFORE THE RUN ────────────────────────
 *
 * An empty QB or DEF part-way through is NOT a failure — deferring them is the
 * measured rule. The failure is a sequence of locally reasonable picks that
 * leaves NO CREDIBLE COMPLETION PATH. So three things are separated:
 *
 *   HOLE            a starting slot unfilled after all 12 picks.
 *   NEAR MISS       filled, but only at my last pick, with <= 3 viable
 *                   alternatives left on the board at that moment. Technically
 *                   fine; one opponent's pick from being a hole.
 *   THIN FILL       filled by a player below the position's replacement level —
 *                   a slot-count check passes this and the lineup is still bad.
 *
 * "Viable" is defined ONCE, before any result: a player at that position with
 * proj_mean >= the position's replacement level.
 *
 * ── AND THE BOARD GEOMETRY IS RUN BOTH WAYS ─────────────────────────────────
 *
 * The artifact carries 3 kept_players, ALL MINE — the other nine teams' keepers
 * are not knowable until the slate confirms. So the default board is 150 picks
 * with only my three gone, which is optimistic: the real board loses ~30 elite
 * players. `--thin` removes a plausible keeper slate from the other nine seats
 * as a robustness arm, because a construction failure that only appears on the
 * thinner board is exactly the one draft night would find.
 *
 * Run: node draft/tools/roster_construction.js [rooms] [--thin]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('../../public/js/draft/engine.js');
/* THE ROOM MODELS, from the one place they are defined and graded. */
const CO = require('./construction_order.js');
const ROOM_NAME = (() => {
  const i = process.argv.indexOf('--room');
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : 'adp';
})();
const ROOM_FN = CO.ROOMS[ROOM_NAME];
if (!ROOM_FN) {
  // FAIL LOUD. A typo silently falling back to adp would run the mis-calibrated
  // room while the header claimed otherwise, which is the whole defect this flag
  // exists to fix.
  throw new Error(`roster_construction: no such room "${ROOM_NAME}". `
    + `Known: ${Object.keys(CO.ROOMS).join(', ')}`);
}

const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const SLEEPER = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'data', 'sleeper_league_settings.json'), 'utf8'));

const LEAGUE = DATA.league;
const TEAMS = LEAGUE.teams, ROUNDS = LEAGUE.rounds, MY = LEAGUE.my_draft_slot;
const KEEPERS = (DATA.kept_players || []).filter(k => Number(k.team_slot) === MY);
const KR = (LEAGUE.keeper_rules || {}).count || 0;

/* STARTERS DERIVED FROM SLEEPER'S OWN roster_positions, never from the artifact
 * and never from a list in a brief. The artifact agrees today; deriving from the
 * source means it cannot quietly stop agreeing. */
const RP = SLEEPER.roster_positions || [];
const STARTERS = {};
RP.forEach(slot => { if (slot !== 'BN') STARTERS[slot] = (STARTERS[slot] || 0) + 1; });
const FLEX_OK = { RB: 1, WR: 1, TE: 1 };

const adpOf = p => (p.adjusted_adp != null ? p.adjusted_adp : (p.raw_adp != null ? p.raw_adp : 9999));
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

/* Replacement level per position, from the board's own `replacement` field —
 * the same number VORP is computed against, so "viable" and "startable" mean
 * the same thing here as they do everywhere else in the system. */
const REPL = {};
DATA.players.forEach(p => {
  if (p.position && p.replacement != null && REPL[p.position] == null) {
    REPL[p.position] = Number(p.replacement);
  }
});

/* Fill the starting lineup from a roster, scarcest slots first so FLEX cannot
 * steal a player a strict slot needs. Returns {filled, holes, byslot}. */
function lineupOf(roster) {
  const slots = [];
  Object.keys(STARTERS).forEach(pos => {
    for (let i = 0; i < STARTERS[pos]; i++) slots.push(pos);
  });
  slots.sort((a, b) => (a === 'FLEX' ? 1 : 0) - (b === 'FLEX' ? 1 : 0));
  const used = new Set(), byslot = {}, holes = [];
  slots.forEach(s => {
    const cands = roster.filter(p => !used.has(String(p.player_id))
      && (s === 'FLEX' ? FLEX_OK[p.position] : p.position === s))
      .sort((a, b) => (b.proj_mean || 0) - (a.proj_mean || 0));
    if (cands.length) { used.add(String(cands[0].player_id)); byslot[s] = (byslot[s] || []).concat([cands[0]]); }
    else { holes.push(s); byslot[s] = (byslot[s] || []).concat([null]); }
  });
  return { holes, byslot };
}

const viableAt = (board, pos) => board.filter(p => p.position === pos
  && REPL[pos] != null && Number(p.proj_mean) >= REPL[pos]).length;

function simulate(seed, thin) {
  const rand = rng(seed);
  const pool = DATA.players.filter(p => p.position && p.proj_mean != null);
  const gone = new Set(KEEPERS.map(k => String(k.player_id)));

  /* THE ROBUSTNESS ARM. Nine opponents each keep three, drawn from the plausible
   * keeper region (top 60 by ADP) rather than strictly the top 27 — real keepers
   * are last year's values, not this year's consensus best. */
  if (thin) {
    const region = pool.slice().sort((a, b) => adpOf(a) - adpOf(b)).slice(0, 60)
      .filter(p => !gone.has(String(p.player_id)));
    for (let i = 0; i < 27 && i < region.length; i++) {
      let j; let guard = 0;
      do { j = Math.floor(rand() * region.length); guard++; }
      while (gone.has(String(region[j].player_id)) && guard < 200);
      gone.add(String(region[j].player_id));
    }
  }

  const roster = KEEPERS.map(k => Object.assign({}, k, { is_keeper: true }));
  const mine = new Set(myPicks());
  const opp = {}; for (let s = 1; s <= TEAMS; s++) opp[s] = [];
  const picks = [];

  for (let o = 1; o <= TEAMS * ROUNDS; o++) {
    const board = pool.filter(p => !gone.has(String(p.player_id)));
    if (!board.length) break;
    if (!mine.has(o)) {
      /* ⚠️ THE OPPONENT MODEL IS NOW SELECTABLE, AND THE DEFAULT IS MIS-CALIBRATED
       * ON EXACTLY THE TWO POSITIONS THE ONESIE CAP GOVERNS.
       *
       * This validator hardcoded adp-with-jitter. Measured against the three real
       * drafts on disk (`room_tail_calibration.js`): that room drafts a median of
       * **23 quarterbacks where real drafts took 15-17**, and **20 tight ends
       * where they took 13-15** — 40% and 33% too many. It makes QB and TE look
       * SCARCER than they are, which is the direction that flatters a cap.
       *
       * So the cap was validated clean in a room that overstates the pressure it
       * exists to manage. `--room profiled` runs the same validation in the room
       * whose QB and TE counts match reality (17 and 17).
       *
       * The room functions are REQUIRED from construction_order.js rather than
       * copied — a second opponent model here could drift from the one the
       * calibration graded, and then this flag would be validating a room nobody
       * scored. */
      const pick = ROOM_FN(board, rand, slotOf(o));
      if (!pick) break;
      gone.add(String(pick.player_id)); opp[slotOf(o)].push(pick); continue;
    }
    const nx = [...mine].filter(x => x > o).sort((a, b) => a - b)[0] || null;
    const win = [];
    if (nx) for (let q = o; q < nx; q++) { const s = slotOf(q); if (s !== MY) win.push({ team_slot: s, pick_no: q, roster: opp[s], profile: null, room: null }); }
    let res;
    try {
      res = E.recommend({ board, roster, league: LEAGUE, weights: E.MEASURED_WEIGHTS,
        currentPick: o, nextPick: nx, totalPicks: TEAMS * ROUNDS,
        myPicksLeft: [...mine].filter(x => x >= o).length,
        roundsLeft: ROUNDS - Math.ceil(o / TEAMS) + 1, runMultipliers: {}, intervening: win });
    } catch (e) { break; }
    if (!res || !res.length) break;
    const p = res[0].player;
    // The completion picture AT THE MOMENT, so an intermediate hole can be told
    // apart from a dead end afterwards rather than argued about.
    const openNow = lineupOf(roster).holes;
    const viable = {};
    openNow.forEach(s => {
      viable[s] = s === 'FLEX'
        ? ['RB', 'WR', 'TE'].reduce((n, q) => n + viableAt(board, q), 0)
        : viableAt(board, s);
    });
    picks.push({ overall: o, round: Math.ceil(o / TEAMS), player: p,
      open_before: openNow.slice(), viable_before: viable,
      picks_left: [...mine].filter(x => x > o).length });
    gone.add(String(p.player_id)); roster.push(p); opp[MY].push(p);
  }
  return { roster, picks };
}

// ─────────────────────────────────────────────────────────────── report
const rooms = Number(process.argv[2] || 200);
const thin = process.argv.includes('--thin');

console.log('='.repeat(76));
console.log('ROSTER CONSTRUCTION — do twelve picks build a startable lineup?');
console.log('='.repeat(76));
console.log(`starters, FROM SLEEPER roster_positions: `
  + Object.keys(STARTERS).map(k => k + ':' + STARTERS[k]).join(' '));
console.log(`keepers: ${KEEPERS.map(k => k.position + ' ' + k.name).join(', ')}`);
{
  const open = lineupOf(KEEPERS.map(k => Object.assign({}, k))).holes;
  console.log(`OPEN STARTING SLOTS AFTER KEEPERS: ${open.join(', ')}  (${open.length})`);
}
console.log(`${rooms} rooms, seat ${MY}, ${ROUNDS - KR} picks each, MEASURED_WEIGHTS`
  + (thin ? ', THIN BOARD (9 opponents keep 3 each)' : ', board carries only my keepers'));
console.log('');

const holeCount = {}, shapes = {}, nearMiss = {}, thinFill = {};
const worst = [];
let n = 0;
for (let r = 0; r < rooms; r++) {
  const sim = simulate(7000 + r * 104729, thin);
  if (!sim.picks.length) continue;
  n++;
  const lu = lineupOf(sim.roster);
  lu.holes.forEach(s => { holeCount[s] = (holeCount[s] || 0) + 1; });

  // Shape = the position mix of my 12 picks.
  const mix = {};
  sim.picks.forEach(p => { mix[p.player.position] = (mix[p.player.position] || 0) + 1; });
  const key = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map(q => q + (mix[q] || 0)).join(' ');
  shapes[key] = (shapes[key] || 0) + 1;

  // NEAR MISS: a slot filled only at my last pick with <= 3 viable left.
  const last = sim.picks[sim.picks.length - 1];
  if (last && last.open_before.length) {
    last.open_before.forEach(s => {
      if ((last.viable_before[s] || 0) <= 3) nearMiss[s] = (nearMiss[s] || 0) + 1;
    });
  }
  // THIN FILL: a starter below his position's replacement level.
  Object.keys(lu.byslot).forEach(s => {
    (lu.byslot[s] || []).forEach(p => {
      if (!p) return;
      const rl = REPL[p.position];
      if (rl != null && Number(p.proj_mean) < rl) thinFill[s] = (thinFill[s] || 0) + 1;
    });
  });
  if (lu.holes.length) {
    worst.push({ holes: lu.holes.slice(), mix: key,
      picks: sim.picks.map(p => `r${p.round} ${p.player.position}`).join(' ') });
  }
}

const pc = (a) => ((100 * a / n).toFixed(1) + '%').padStart(6);
console.log('── 1 · UNFILLED STARTING SLOTS AFTER ALL 12 PICKS ' + '─'.repeat(26));
const slotNames = Object.keys(STARTERS);
let anyHole = false;
slotNames.forEach(s => {
  const c = holeCount[s] || 0;
  if (c) anyHole = true;
  console.log(`   ${s.padEnd(5)} unfilled in ${String(c).padStart(4)}/${n}  ${pc(c)}`);
});
if (!anyHole) console.log('   NONE. Every starting slot filled in every room.');
console.log('');

console.log('── 2 · ROSTER SHAPES (position mix of the 12 picks) ' + '─'.repeat(24));
Object.entries(shapes).sort((a, b) => b[1] - a[1]).slice(0, 8)
  .forEach(([k, c], i) => console.log(`   ${i === 0 ? 'MODAL' : '     '} ${k}   ${String(c).padStart(4)}/${n}  ${pc(c)}`));
console.log(`   ${Object.keys(shapes).length} distinct shapes across ${n} rooms`);
console.log('');

console.log('── 3 · WORST OUTCOMES ' + '─'.repeat(54));
if (!worst.length) console.log('   No room ended with an unfilled starting slot.');
worst.slice(0, 5).forEach(w => console.log(`   holes [${w.holes.join(',')}]  ${w.mix}\n     ${w.picks}`));
console.log('');

console.log('── 4 · SYSTEMATIC NEGLECT vs OCCASIONAL MISS ' + '─'.repeat(31));
slotNames.forEach(s => {
  const c = holeCount[s] || 0;
  if (c === 0) return;
  console.log(`   ${s}: ${pc(c)} — ${c > n * 0.1 ? 'SYSTEMATIC' : 'occasional'}`);
});
if (!anyHole) console.log('   No position is ever left unfilled, so neither applies.');
console.log('');

console.log('── 5 · FILLED BUT FRAGILE ' + '─'.repeat(50));
const nm = Object.keys(nearMiss);
if (nm.length) {
  nm.forEach(s => console.log(`   NEAR MISS ${s}: still open at my LAST pick with <=3 viable left, `
    + `in ${nearMiss[s]}/${n}  ${pc(nearMiss[s])}`));
} else {
  console.log('   No slot was still open at my last pick with a thin board behind it.');
}
const tf = Object.keys(thinFill);
if (tf.length) {
  tf.forEach(s => console.log(`   THIN FILL ${s}: starter below his position's replacement level `
    + `in ${thinFill[s]}/${n}  ${pc(thinFill[s])}`));
} else {
  console.log('   No starting slot was filled below replacement level.');
}
