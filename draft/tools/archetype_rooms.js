#!/usr/bin/env node
// TERRITORY: A
/* THE ARCHETYPE COMPARISON — full 10-team rooms from Cory's ACTUAL seat and
 * keeper situation, each arm a roster-construction archetype overlaid on the
 * SHIPPED engine, each final league scored through to season outcomes.
 *
 * Cory, 2026-08-16, verbatim: "If edge for this year isn't going to come from
 * using own projections this year. It's going to come from our roster
 * building. Have we ran enough test on roster building in draft to make sure
 * we have best methods possible?"
 *
 * WHAT IS REUSED, UNMODIFIED:
 *   - the engine itself: real E.recommend() through the real live_context.js
 *     under production MEASURED_WEIGHTS and shipped CFG flags (VONA_WIRE_BENCH
 *     true per Cory's 2026-08-16 ruling; the bench wire artifact is supplied
 *     the same way bench_wire_room_sim.js supplies it, since the board does
 *     not yet embed wire_level);
 *   - the room mechanics proven in bench_wire_room_sim.js /
 *     roster_room_audit.js: seeded mulberry32, paired seeds across arms,
 *     opponent counts from the pick board (keeper-consumed slots draft
 *     nobody — roster_room_audit's declared fix, kept);
 *   - the archetype overlay: draft/tools/archetype_policy.js — a constraint
 *     on the engine's OWN candidate list, never a second draft brain;
 *   - season scoring: draft/tools/archetype_season.js (weekly bye-aware
 *     optimal lineups + standings MC) and src/routes/champodds.js `simulate`
 *     (the championship bracket pinned to the league's real playoff format)
 *     with its own measured league weekly sd.
 *
 * THE OPPONENT MODEL (--opponents):
 *   measured (default) — each un-mapped opponent seat picks a POSITION from
 *     survival.js positionProbabilities (the shipped measured model: need /
 *     value softmax + the ROOM_MIX league prior, ON per Cory's 2026-08-16
 *     ruling) and a PLAYER within that position from survival.js
 *     positionSoftmax's room-mixture distribution over the league's 10
 *     profiled managers (D6). This is the same machinery the engine's own
 *     survival wire prices opponents with — the room the engine believes in
 *     is the room the archetypes are tested against.
 *     Two rails on top, both declared: (a) hard caps K<=1 DEF<=1 QB<=3 TE<=3
 *     RB<=7 WR<=7 (three seasons of real drafts contain exactly one backup K
 *     and zero backup DEF); (b) a legality rail mirroring the engine's own
 *     applyRosterLegality — when a seat's remaining picks equal its unfilled
 *     starter slots, the sampled position is restricted to those slots.
 *   adp — the noisy-ADP opponent of the shipped sims (Gaussian perturbation
 *     scaled to each player's own adp_sd), as a robustness arm: an archetype
 *     ranking that flips between opponent models is inside the noise.
 *
 * KEEPERS (--keepers):
 *   designated (default) — the REAL designations in draft/config/keepers.json
 *     (source: sleeper): my three (Chase/Henry/Walker, rounds 1-3 forfeit,
 *     first live pick 33) plus the three opponent teams that have designated
 *     (8 players, removed from the pool, placed on their provisional slots,
 *     forfeiting rounds 1..N). The six undesignated teams are simulated
 *     keeping zero — UNKNOWN, not assumed empty: the artifact records this
 *     and the audit names it a limitation.
 *   mine-only — only my three keepers applied (the exact geometry of the
 *     shipped room sims), as a robustness arm for the unconfirmed slate.
 *
 * SEASON OUTCOMES per room, per arm: my expected weekly starting-lineup
 * points, playoff probability (top 4), bust probability (bottom 3),
 * championship probability (champodds bracket). ALL MODEL OUTCOMES, not
 * measurements — conditioned on proj_mean being right, on the opponent
 * model, and on a constant measured weekly sd (21.3) for every team.
 *
 * Run:    node draft/tools/archetype_rooms.js [--rooms 40] [--seed 1]
 *           [--arms shipped,zero_rb,...] [--opponents measured|adp]
 *           [--keepers designated|mine-only] [--sims 2000] [--batch 40]
 * Writes: draft/data/archetype_rooms.json (ARCHETYPE_ROOMS_OUT overrides —
 *         the test writes to a scratch path, never the committed artifact).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
const S = require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
require(path.join(ROOT, 'public', 'js', 'draft', 'composite.js'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
require(path.join(ROOT, 'public', 'js', 'draft', 'needrule.js'));
const LC = require(path.join(ROOT, 'draft', 'tools', 'live_context.js'));
const AP = require(path.join(ROOT, 'draft', 'tools', 'archetype_policy.js'));
const AS = require(path.join(ROOT, 'draft', 'tools', 'archetype_season.js'));
const CH = require(path.join(ROOT, 'src', 'routes', 'champodds.js'));

const args = process.argv.slice(2);
const flagIdx = f => args.indexOf(f);
const argOf = (f, dflt) => (flagIdx(f) >= 0 ? args[flagIdx(f) + 1] : dflt);
const ROOMS = Number(argOf('--rooms', 40));
const SEED0 = Number(argOf('--seed', 1));
const ARMS = String(argOf('--arms', Object.keys(AP.ARCHETYPES).join(','))).split(',');
const OPP_MODEL = String(argOf('--opponents', 'measured'));
const KEEPER_MODE = String(argOf('--keepers', 'designated'));
const SIMS = Number(argOf('--sims', 2000));
const BATCH = Number(argOf('--batch', 40));
ARMS.forEach(a => { if (!AP.ARCHETYPES[a]) throw new Error('unknown arm: ' + a); });
if (['measured', 'adp'].indexOf(OPP_MODEL) < 0) throw new Error('bad --opponents');
if (['designated', 'mine-only'].indexOf(KEEPER_MODE) < 0) throw new Error('bad --keepers');

const board = LC.loadBoard();
const ALL = board.players;
const MY_KEEPERS = board.kept_players;
const LEAGUE = board.league;
const PICKS = (board.pick_order || {}).picks || [];
const MY_SLOT = LEAGUE.my_draft_slot;
const MY_PICKS = ((board.pick_order || {}).my_picks || [])
  .map(p => (p.overall != null ? p.overall : p));
const TEAMS = LEAGUE.teams || 10;
const TOTAL_ROUNDS = LEAGUE.rounds || 15;
const WIRE = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'data', 'wire_level.json'), 'utf8')).per_week;

// Starter map asserted against the league config (no silent divergence).
Object.keys(AS.STARTERS).forEach(pos => {
  if ((LEAGUE.starters || {})[pos] !== AS.STARTERS[pos]) {
    throw new Error('starter map drift at ' + pos);
  }
});
if ((LEAGUE.starters || {}).FLEX !== 1) throw new Error('starter map drift: FLEX');

/* ── the real keeper slate ─────────────────────────────────────────────────
 * draft/config/keepers.json (source: sleeper). My team's entry must agree
 * with the board's kept_players — two sources of the same fact, checked. */
const KEEPER_FILE = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'config', 'keepers.json'), 'utf8'));
const myEntry = (KEEPER_FILE.teams || []).find(t => t.draft_slot === MY_SLOT);
{
  const a = new Set((myEntry ? myEntry.keepers : []).map(k => String(k.player_id)));
  const b = new Set(MY_KEEPERS.map(k => String(k.player_id)));
  if (a.size !== b.size || [...a].some(id => !b.has(id))) {
    throw new Error('keeper sources disagree: config/keepers.json vs board kept_players');
  }
}
const byId = new Map(ALL.map(p => [String(p.player_id), p]));
// slot -> { keeperRows: [player rows], forfeitRounds: Set }
const OPP_KEEPERS = new Map();
if (KEEPER_MODE === 'designated') {
  (KEEPER_FILE.teams || []).forEach(t => {
    if (t.draft_slot === MY_SLOT) return;
    const rows = [];
    (t.keepers || []).forEach(k => {
      const row = byId.get(String(k.player_id));
      if (!row) throw new Error('designated keeper not on board: ' + k.name);
      rows.push(row);
    });
    const forfeit = new Set();
    for (let r = 1; r <= rows.length; r++) forfeit.add(r); // top_picks_flat
    OPP_KEEPERS.set(t.draft_slot, { keeperRows: rows, forfeitRounds: forfeit });
  });
}

/* Room profiles for un-mapped seats — app.js's roomProfiles(), reproduced
 * from the same artifact fields: every profiled manager minus me. */
const ROOM_PROFILES = (() => {
  const mgrs = (board.manager_profiles || {}).managers || {};
  const me = String(LEAGUE.my_manager_id || '');
  return Object.keys(mgrs).map(k => mgrs[k])
    .filter(m => m && String(m.manager_id) !== me);
})();
if (OPP_MODEL === 'measured' && ROOM_PROFILES.length < 5) {
  throw new Error('measured opponent model needs the profiled room; got '
    + ROOM_PROFILES.length);
}

const mulberry32 = AS.mulberry32;
function gaussian(rng) {
  const u1 = Math.max(rng(), 1e-9), u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/* ── opponent pick models ────────────────────────────────────────────────── */
const CAPS = { QB: 3, TE: 3, K: 1, DEF: 1, RB: 7, WR: 7 };

function missingStarters(roster) {
  const have = {};
  roster.forEach(p => { have[p.position] = (have[p.position] || 0) + 1; });
  const out = [];
  Object.keys(AS.STARTERS).forEach(pos => {
    for (let i = (have[pos] || 0); i < AS.STARTERS[pos]; i++) out.push(pos);
  });
  return out;
}

function opponentPickAdp(pool, rng) {
  let best = null, bestScore = Infinity;
  for (const p of pool) {
    const adp = p.adp == null ? 9999 : Number(p.adp);
    const sd = p.adp_sd == null ? 6 : Number(p.adp_sd);
    const score = adp + gaussian(rng) * sd;
    if (score < bestScore) { bestScore = score; best = p; }
  }
  return best;
}

function opponentPickMeasured(pool, teamState, overall, round, picksLeftForTeam, rng) {
  const team = { roster: teamState.roster, profile: null, room: ROOM_PROFILES,
    pick_no: overall };
  const ctx2 = {
    league: LEAGUE,
    progress: Math.min(1, Math.max(0, (overall - 1) / (TEAMS * TOTAL_ROUNDS))),
    roundsLeft: Math.max(0, TOTAL_ROUNDS - round),
  };
  let probs = S.positionProbabilities(team, pool, ctx2) || {};
  const counts = {};
  teamState.roster.forEach(p => { counts[p.position] = (counts[p.position] || 0) + 1; });

  // Rails: caps, then the legality restriction (mirrors applyRosterLegality).
  const capped = {};
  Object.keys(probs).forEach(pos => {
    capped[pos] = (CAPS[pos] != null && (counts[pos] || 0) >= CAPS[pos]) ? 0 : probs[pos];
  });
  const gaps = missingStarters(teamState.roster);
  if (gaps.length >= picksLeftForTeam) {
    const need = new Set(gaps);
    Object.keys(capped).forEach(pos => { if (!need.has(pos)) capped[pos] = 0; });
  }
  let total = Object.values(capped).reduce((s, x) => s + x, 0);
  let dist = capped;
  if (!(total > 0)) { dist = probs; total = Object.values(probs).reduce((s, x) => s + x, 0); }
  if (!(total > 0)) return opponentPickAdp(pool, rng);

  // Sample the position.
  let u = rng() * total, pos = null;
  for (const k of Object.keys(dist)) { u -= dist[k]; if (u <= 0) { pos = k; break; } }
  if (!pos) pos = Object.keys(dist).sort((a, b) => dist[b] - dist[a])[0];

  // Sample the player within the position from the room-mixture softmax.
  const sm = S.positionSoftmax(pool, pos, team);
  if (!sm || !sm.pool || !sm.pool.length || !sm.exps || !(sm.sum > 0)) {
    const posPool = pool.filter(p => p.position === pos);
    return posPool.length ? opponentPickAdp(posPool, rng) : opponentPickAdp(pool, rng);
  }
  let v = rng() * sm.sum;
  for (let i = 0; i < sm.pool.length; i++) {
    v -= sm.exps[i];
    if (v <= 0) return sm.pool[i];
  }
  return sm.pool[sm.pool.length - 1];
}

/* ── one full 10-team room ───────────────────────────────────────────────── */
function runRoom(seed, armName) {
  const rng = mulberry32(seed);
  const drafted = new Set();
  const teams = {};                    // slot -> { roster, picksLeft }
  for (let s = 1; s <= TEAMS; s++) teams[s] = { roster: [], picksLeft: 0 };

  // My keepers.
  MY_KEEPERS.forEach(k => {
    drafted.add(String(k.player_id));
    teams[MY_SLOT].roster.push(Object.assign({}, k, { is_keeper: true }));
  });
  // Opponents' designated keepers (if the arm applies them).
  OPP_KEEPERS.forEach((v, slot) => {
    v.keeperRows.forEach(row => {
      drafted.add(String(row.player_id));
      teams[slot].roster.push(Object.assign({}, row, { is_keeper: true }));
    });
  });

  const slotForfeits = slot => {
    if (slot === MY_SLOT) return new Set([1, 2, 3]);
    const v = OPP_KEEPERS.get(slot);
    return v ? v.forfeitRounds : new Set();
  };
  // Remaining live pick count per slot (for the opponent legality rail).
  PICKS.forEach(p => { if (!slotForfeits(p.slot).has(p.round)) teams[p.slot].picksLeft++; });

  const picksLog = [];
  let overlayDiverged = 0;             // picks where the overlay overrode recs[0]
  let myPickIndex = 0;
  let pool = ALL.filter(p => !drafted.has(String(p.player_id)));

  for (const pk of PICKS) {
    const { overall, round, slot } = pk;
    if (slotForfeits(slot).has(round)) continue;          // keeper-consumed slot
    const t = teams[slot];

    if (slot === MY_SLOT) {
      const next = MY_PICKS[myPickIndex + 1] || null;
      const ctx = LC.liveContext({
        currentPick: overall, nextPick: next == null ? overall : next,
        board: pool, roster: t.roster,
        myPicksLeft: MY_PICKS.length - myPickIndex, myPickIndex,
      });
      ctx.wireWeekly = WIRE;
      let recs;
      try { recs = E.recommend(ctx); } catch (e) {
        return { seed, arm: armName, crashed: String((e && e.message) || e) };
      }
      if (!recs || !recs.length) return { seed, arm: armName, crashed: 'empty recs' };
      const posCounts = {};
      t.roster.forEach(p => { posCounts[p.position] = (posCounts[p.position] || 0) + 1; });
      const chosen = AP.choosePick(armName, recs,
        { round, picksLeft: MY_PICKS.length - myPickIndex, posCounts });
      if (chosen !== recs[0]) overlayDiverged++;
      const p = chosen.player;
      picksLog.push({ pick: overall, round, name: p.name, pos: p.position,
        engine_top: recs[0].player.name, overlay: chosen !== recs[0] });
      drafted.add(String(p.player_id));
      t.roster.push(p);
      myPickIndex++;
    } else {
      const p = OPP_MODEL === 'measured'
        ? opponentPickMeasured(pool, t, overall, round, t.picksLeft, rng)
        : opponentPickAdp(pool, rng);
      if (!p) return { seed, arm: armName, crashed: 'pool exhausted at ' + overall };
      drafted.add(String(p.player_id));
      t.roster.push(p);
    }
    t.picksLeft--;
    pool = pool.filter(x => !drafted.has(String(x.player_id)));
  }

  // ── season outcomes ──────────────────────────────────────────────────────
  const series = {}, flat = {};
  let unknownBye = 0, oppMissingStarters = 0;
  for (let s = 1; s <= TEAMS; s++) {
    const wm = AS.weeklyTeamMeans(teams[s].roster);
    series[s] = wm.series;
    flat[s] = { mean: wm.mean_weekly, sd: CH.CFG.WEEKLY_SD };
    if (s === MY_SLOT) unknownBye = wm.unknown_bye;
    else oppMissingStarters += missingStarters(teams[s].roster).length;
  }
  const mc = AS.standingsMC(series, { sd: CH.CFG.WEEKLY_SD, sims: SIMS,
    seed: (seed * 7919 + 17) >>> 0 });
  const ch = CH.simulate({ strengths: flat, baseRec: null, futureWeeks: AS.REGULAR_SEASON_WEEKS,
    schedule: null, cut: 4, sims: SIMS, seed: (seed * 104729 + 31) >>> 0 });

  const mine = teams[MY_SLOT];
  const posCounts = {};
  mine.roster.forEach(p => { posCounts[p.position] = (posCounts[p.position] || 0) + 1; });
  const rd = x => Math.round(x * 10000) / 10000;
  return {
    seed, arm: armName, crashed: null,
    rosterSize: mine.roster.length,
    myMissingStarters: missingStarters(mine.roster).length,
    posCounts, picksLog, overlayDiverged,
    unknownBye, oppMissingStarters,
    mean_weekly: Math.round(series[MY_SLOT].reduce((s, x) => s + x, 0)
      / series[MY_SLOT].length * 100) / 100,
    playoff_prob: rd(mc[MY_SLOT].playoff_prob),
    bottom3_prob: rd(mc[MY_SLOT].bottom3_prob),
    exp_wins: rd(mc[MY_SLOT].exp_wins),
    champ_prob: rd(ch[MY_SLOT].champ_prob),
    // Cross-path drift stat (rule 11): champodds' playoff read of the same
    // room, computed on flat means where the MC used the weekly series.
    champodds_playoff_prob: rd(ch[MY_SLOT].playoff_prob),
  };
}

/* ── run all arms, paired seeds ──────────────────────────────────────────── */
const savedFlags = { VONA_SLOT_AWARE: E.CFG.VONA_SLOT_AWARE,
  VONA_WIRE_BENCH: E.CFG.VONA_WIRE_BENCH };
const detail = {};
ARMS.forEach(a => { detail[a] = []; });
for (let s = SEED0; s < SEED0 + ROOMS; s++) {
  ARMS.forEach(a => { detail[a].push(runRoom(s, a)); });
}
// Flag hygiene: the run must leave the shipped defaults untouched.
if (E.CFG.VONA_SLOT_AWARE !== savedFlags.VONA_SLOT_AWARE
  || E.CFG.VONA_WIRE_BENCH !== savedFlags.VONA_WIRE_BENCH) {
  throw new Error('engine CFG flags mutated by the run — refusing to write');
}

function meanSe(xs) {
  const n = xs.length;
  if (!n) return { n: 0, mean: null, se: null };
  const m = xs.reduce((s, x) => s + x, 0) / n;
  const v = n > 1 ? xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (n - 1) : 0;
  return { n, mean: m, se: Math.sqrt(v / Math.max(1, n)) };
}
const METRICS = ['mean_weekly', 'playoff_prob', 'champ_prob', 'bottom3_prob', 'exp_wins'];
function summarizeArm(rooms) {
  const ok = rooms.filter(r => !r.crashed);
  const out = { n: rooms.length, crashed: rooms.length - ok.length,
    overlay_diverged_picks_per_room: ok.length
      ? Math.round(10 * ok.reduce((s, r) => s + r.overlayDiverged, 0) / ok.length) / 10 : null,
    my_missing_starters_rooms: ok.filter(r => r.myMissingStarters > 0).length,
  };
  METRICS.forEach(m => {
    const st = meanSe(ok.map(r => r[m]));
    out[m] = st.mean == null ? null : Math.round(st.mean * 10000) / 10000;
    out[m + '_se'] = st.se == null ? null : Math.round(st.se * 10000) / 10000;
  });
  const shapes = {};
  ok.forEach(r => {
    const key = ['QB', 'RB', 'WR', 'TE'].map(p => p + (r.posCounts[p] || 0)).join('/');
    shapes[key] = (shapes[key] || 0) + 1;
  });
  out.shape_distribution = shapes;
  return out;
}
// Paired deltas vs the shipped control, same seed.
function pairedVsShipped(arm) {
  if (!detail.shipped) return null;
  const base = new Map(detail.shipped.filter(r => !r.crashed).map(r => [r.seed, r]));
  const out = {};
  METRICS.forEach(m => {
    const ds = detail[arm].filter(r => !r.crashed && base.has(r.seed))
      .map(r => r[m] - base.get(r.seed)[m]);
    const st = meanSe(ds);
    out[m] = st.mean == null ? null : {
      n: st.n, mean: Math.round(st.mean * 10000) / 10000,
      se: Math.round(st.se * 10000) / 10000,
      ci95: st.se == null ? null : [
        Math.round((st.mean - 1.96 * st.se) * 10000) / 10000,
        Math.round((st.mean + 1.96 * st.se) * 10000) / 10000],
    };
  });
  return out;
}
// Seed-batch means for the stability-of-ranking readout.
function batches(arm) {
  const out = [];
  for (let b0 = SEED0; b0 < SEED0 + ROOMS; b0 += BATCH) {
    const rows = detail[arm].filter(r => !r.crashed && r.seed >= b0 && r.seed < b0 + BATCH);
    const entry = { seeds: b0 + '-' + Math.min(SEED0 + ROOMS, b0 + BATCH) };
    METRICS.forEach(m => {
      const st = meanSe(rows.map(r => r[m]));
      entry[m] = st.mean == null ? null : Math.round(st.mean * 10000) / 10000;
    });
    out.push(entry);
  }
  return out;
}

const summary = {}, paired = {}, byBatch = {};
ARMS.forEach(a => {
  summary[a] = summarizeArm(detail[a]);
  byBatch[a] = batches(a);
  if (a !== 'shipped') paired[a] = pairedVsShipped(a);
});

const out = {
  _territory: 'TERRITORY: A — research artifact, no production reader',
  tool: 'draft/tools/archetype_rooms.js',
  mandate: 'Cory 2026-08-16: roster building — have we run enough tests on roster construction?',
  rooms: ROOMS, seed_start: SEED0, batch: BATCH, sims_per_room: SIMS,
  arms: ARMS, opponents: OPP_MODEL, keepers: KEEPER_MODE,
  engine_flags: { VONA_SLOT_AWARE: E.CFG.VONA_SLOT_AWARE,
    VONA_WIRE_BENCH: E.CFG.VONA_WIRE_BENCH },
  weekly_sd: CH.CFG.WEEKLY_SD,
  opp_keeper_teams: OPP_KEEPERS.size,
  generated_at: new Date().toISOString(),
  note: 'SIMULATION throughout: season outcomes are model outcomes conditioned on '
    + 'proj_mean, the opponent model, and a constant measured weekly sd — not measurements.',
  summary, paired_vs_shipped: paired, batches: byBatch, detail,
};
const OUT_PATH = process.env.ARCHETYPE_ROOMS_OUT
  || path.join(ROOT, 'draft', 'data', 'archetype_rooms.json');
fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 1));

console.log('ARCHETYPE ROOMS — ' + ROOMS + ' paired rooms/arm, seeds ' + SEED0 + '-'
  + (SEED0 + ROOMS - 1) + ', opponents=' + OPP_MODEL + ', keepers=' + KEEPER_MODE);
ARMS.forEach(a => {
  const s = summary[a];
  console.log('  ' + a.padEnd(11) + ' wk ' + (s.mean_weekly == null ? '—' : s.mean_weekly.toFixed(1))
    + '  playoff ' + (100 * s.playoff_prob).toFixed(1) + '%'
    + '  champ ' + (100 * s.champ_prob).toFixed(1) + '%'
    + '  bottom3 ' + (100 * s.bottom3_prob).toFixed(1) + '%'
    + '  overlay-picks/room ' + s.overlay_diverged_picks_per_room
    + (s.crashed ? ('  CRASHED ' + s.crashed) : ''));
});
console.log('  wrote ' + OUT_PATH);
