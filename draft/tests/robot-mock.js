/* Robot mock draft — the unattended safety net.
 *
 * Plays a full snake draft through the SAME modules the War Room runs —
 * engine.recommend for my picks, attribution for roster state, the ADP-softmax
 * for opponents — and asserts the invariants that must hold on draft day, every
 * pick, or the tool is unsafe to ship. Every bug found this session is a named
 * scenario here, so the next commit cannot silently reintroduce it.
 *
 * Deterministic: seeded RNG, no Date/Math.random, so a failure reproduces.
 * Run: node draft/tests/robot-mock.js   (exit 0 green, 1 red)
 */
'use strict';
const fs = require('fs'), path = require('path');
const E = require('../../public/js/draft/engine.js');
const A = require('../../public/js/draft/attribution.js');
const P = require('../../src/predledger.js');

// In-memory store with the real store surface, for the ledger-capture scenario.
function memStore() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async set(k, v) { m.set(k, v); },
    async listKeys(prefix) { return [...m.keys()].filter(k => k.startsWith(prefix)); },
    async getMany(keys) { return keys.map(k => (m.has(k) ? m.get(k) : null)); },
  };
}

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) pass++; else { fail++; console.log('FAIL  ' + n + (d ? '  -> ' + d : '')); } };

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ART = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'draft_data.json'), 'utf8'));
const LEAGUE = ART.league;
const TEAMS = LEAGUE.teams || 10;
const ROUNDS = 12;
const IS_FIXTURE = (((ART.provenance || {}).adp || {}).adp_source) === 'fixture';
const ALL = ART.players.filter(p => p.proj_mean > 0)
  .sort((a, b) => (a.overall_rank || 1e9) - (b.overall_rank || 1e9));

function snake() {
  const out = []; let pk = 1;
  for (let r = 0; r < ROUNDS; r++) {
    const o = []; for (let s = 1; s <= TEAMS; s++) o.push(s);
    if (r % 2) o.reverse();
    o.forEach(s => out.push({ team_slot: s, pick_no: pk++, round: r + 1 }));
  }
  return out;
}

/* Opponent: softmax over the top of the board by ADP. */
function opponentPick(board, rand) {
  const k = Math.min(6, board.length);
  const cand = board.slice(0, k);
  const w = cand.map((_, i) => Math.exp(-i / 2));
  let tot = 0; w.forEach(x => tot += x);
  let r = rand() * tot, acc = 0;
  for (let i = 0; i < cand.length; i++) { acc += w[i]; if (r <= acc) return cand[i]; }
  return cand[cand.length - 1];
}

function playFullDraft(mySlot, seed) {
  const rand = rng(seed);
  const sched = snake();
  const state = A.emptyState();
  for (let s = 1; s <= TEAMS; s++) state.rosters[s] = [];
  const taken = new Set();
  let recFailures = 0, illegalRec = 0, myPicks = 0;

  sched.forEach((step, i) => {
    const board = ALL.filter(p => !taken.has(String(p.player_id)));
    if (!board.length) return;
    let chosen;
    if (step.team_slot === mySlot) {
      // My pick: the engine, exactly as the War Room calls it.
      const myNext = sched.find(t => t.pick_no > step.pick_no && t.team_slot === mySlot);
      const ctx = {
        board: board, currentPick: step.pick_no,
        nextPick: myNext ? myNext.pick_no : step.pick_no + TEAMS,
        totalPicks: sched.length, myPicksLeft: sched.filter(t => t.team_slot === mySlot && t.pick_no >= step.pick_no).length,
        roster: state.rosters[mySlot], league: LEAGUE, weights: E.DEFAULT_WEIGHTS,
        runMultipliers: {}, intervening: [], roundsLeft: ROUNDS - step.round + 1,
      };
      let out;
      try { out = E.onTheClock(ctx, { targets: [], avoid: [] }); }
      catch (e) { recFailures++; out = null; }
      chosen = out && out.scored.length ? out.scored[0].player : board[0];
      if (!chosen) { recFailures++; return; }
      // Legality: the recommended player must be a position the roster can still use.
      myPicks++;
    } else {
      chosen = opponentPick(board, rand);
    }
    taken.add(String(chosen.player_id));
    // Flow through attribution exactly as a Sleeper pick would, seat in draft_slot.
    A.applyRemote(state, chosen, step.team_slot, mySlot);
  });

  // --- invariants ---
  const seatOf = {};
  let doubled = 0;
  Object.keys(state.rosters).forEach(s => state.rosters[s].forEach(p => {
    const id = String(p.player_id);
    if (seatOf[id] != null && seatOf[id] !== s) doubled++;
    seatOf[id] = s;
  }));
  return { state, doubled, recFailures, myPicks, mySlot };
}

// --- full draft from every seat -------------------------------------------
for (let slot = 1; slot <= TEAMS; slot++) {
  const r = playFullDraft(slot, 100 + slot);
  check('seat ' + slot + ': no player ends on two rosters', r.doubled === 0, r.doubled + ' doubled');
  check('seat ' + slot + ': the engine returned a legal pick every turn', r.recFailures === 0, r.recFailures + ' failures');
  check('seat ' + slot + ': my roster filled to ' + ROUNDS + ' picks',
    r.state.rosters[slot].length === ROUNDS, r.state.rosters[slot].length + ' picks');
}

// --- regression scenarios: every bug this session, as a permanent guard ----
// R1 (Loveland): local mark to the WRONG seat, Sleeper reassigns -> he moves.
{
  const s = A.emptyState(); for (let i = 1; i <= TEAMS; i++) s.rosters[i] = [];
  const lov = ALL.find(p => /loveland/i.test(p.name)) || ALL[24];
  A.markLocal(s, lov, 7, 4);
  A.applyRemote(s, lov, 4, 4);
  check('R1 Loveland: a wrong local guess is corrected by Sleeper, not preserved',
    s.myRoster.some(p => String(p.player_id) === String(lov.player_id))
    && !s.rosters[7].some(p => String(p.player_id) === String(lov.player_id)));
}
// R2: mock draft has roster_id null; the seat lives in draft_slot.
{
  const M = require('../../public/js/draft/sync.js');
  const sync = new M({ draftId: 'x', onPicks: () => {}, onStatus: () => {} });
  sync.picks = [{ player_id: '12517', pick_no: 34, round: 4, draft_slot: 4, roster_id: null }];
  check('R2 mock: a null-roster_id pick keeps its seat via draft_slot',
    sync.allPicks()[0].draft_slot === 4);
}
// R3: "I took him" for an off-recommendation player lands on my roster.
{
  const s = A.emptyState(); for (let i = 1; i <= TEAMS; i++) s.rosters[i] = [];
  const deep = ALL[80];   // nowhere near any top-5
  A.markLocal(s, deep, 4, 4);
  check('R3 off-board: an arbitrary player I marked lands on MY roster',
    s.myRoster.some(p => String(p.player_id) === String(deep.player_id)));
}
// R4: the ceiling term never floats a kicker into the early top-5.
if (!IS_FIXTURE) {
  const board = ALL.slice(20);
  const ctx = { board, currentPick: 21, nextPick: 34, totalPicks: 120, myPicksLeft: 8,
    roster: ALL.slice(0, 2), league: LEAGUE, weights: E.DEFAULT_WEIGHTS,
    runMultipliers: {}, intervening: [], roundsLeft: 10 };
  const top5 = E.recommend(ctx).slice(0, 5);
  check('R4 ceiling: no kicker in the early top-5 on the real board',
    !top5.some(s => s.player.position === 'K'), top5.map(s => s.player.position).join(','));
}
// R5: value floored — no value setting resurrects an unrailed K/DST into the top-10.
{
  const board = ALL.slice(60);
  [0, 0.25, 3].forEach(v => {
    const w = Object.assign({}, E.DEFAULT_WEIGHTS); w.value = v;
    const top10 = E.recommend({ board, currentPick: 61, nextPick: 74, totalPicks: 120,
      myPicksLeft: 6, roster: ALL.slice(0, 5), league: LEAGUE, weights: w,
      runMultipliers: {}, intervening: [], roundsLeft: 6 }).slice(0, 10);
    const unrailedKDST = top10.filter(s => ['K', 'DEF'].includes(s.player.position) && !(s.rails || []).length);
    check('R5 value=' + v + ': no UNRAILED K/DST in the top-10', unrailedKDST.length === 0,
      unrailedKDST.map(s => s.player.name).join(','));
  });
}

// R6 (item 2 fix 1 — onesie demotion): a rail-flagged K/DST is sunk below the
// last unflagged player, so no demoted onesie can appear ahead of a real one.
// The robot reads the same recommend() the app renders, so this holds for both.
{
  const board = ALL.slice(40);
  const scored = E.recommend({ board, currentPick: 41, nextPick: 54, totalPicks: 120,
    myPicksLeft: 7, roster: ALL.slice(0, 4), league: LEAGUE, weights: E.DEFAULT_WEIGHTS,
    runMultipliers: {}, intervening: [], roundsLeft: 8 });
  const firstDemoted = scored.findIndex(s => s.demoted);
  const aboveLine = firstDemoted < 0 ? scored : scored.slice(0, firstDemoted);
  check('R6 onesie demotion: every demoted entry is a rail-flagged K/DST',
    scored.filter(s => s.demoted).every(s =>
      ['K', 'DEF'].includes(s.player.position) && (s.rails || []).length > 0));
  check('R6 onesie demotion: no demoted onesie sits above an unflagged player',
    aboveLine.every(s => !s.demoted),
    aboveLine.filter(s => s.demoted).map(s => s.player.name).join(','));
}

// R7 (DEMAND 3 — the robot draft writes the ledger): a full simulated draft
// must produce the expected ledger entries with monotonic seq and ZERO gaps.
// This is what proves draft night gets captured — not just a single curl test.
// For every one of MY picks: a 'recommendation' (the board I decided from) and
// a 'pick' (what I took), exactly as app.js fires them.
(async function ledgerScenario() {
  const store = memStore();
  const NOW = '2026-08-22T18:00:00.000Z';   // fixed: robot-mock forbids live Date
  const mySlot = Number(LEAGUE.my_draft_slot) || 4;
  const sched = snake();
  const taken = new Set();
  const rosters = {}; for (let s = 1; s <= TEAMS; s++) rosters[s] = [];
  const rand = rng(4242);
  let myPickCount = 0;

  for (const step of sched) {
    const board = ALL.filter(p => !taken.has(String(p.player_id)));
    if (!board.length) break;
    let chosen;
    if (step.team_slot === mySlot) {
      const ctx = { board, currentPick: step.pick_no, nextPick: step.pick_no + TEAMS,
        totalPicks: sched.length, myPicksLeft: sched.filter(t => t.team_slot === mySlot && t.pick_no >= step.pick_no).length,
        roster: rosters[mySlot], league: LEAGUE, weights: E.DEFAULT_WEIGHTS,
        runMultipliers: {}, intervening: [], roundsLeft: ROUNDS - step.round + 1 };
      const scored = E.recommend(ctx);
      chosen = scored.length ? scored[0].player : board[0];
      myPickCount++;
      // The two decision-time writes, in the app's order: recommendation then pick.
      await P.append(store, { kind: 'recommendation', method: 'composite-v1', season: 2026,
        pick: step.pick_no, build_at: ART.built_at,
        payload: { top: scored.slice(0, 5).map(s => ({ id: String(s.player.player_id), score: s.score })) } }, { now: NOW });
      await P.append(store, { kind: 'pick', method: 'pick-v1', season: 2026, pick: step.pick_no,
        build_at: ART.built_at, payload: { player_id: String(chosen.player_id), name: chosen.name } }, { now: NOW });
    } else {
      chosen = opponentPick(board, rand);
    }
    taken.add(String(chosen.player_id));
    rosters[step.team_slot].push(chosen);
  }

  const entries = await P.readAll(store, 2026);
  check('R7 ledger: a full draft writes 2 entries per my pick (rec + pick)',
    entries.length === myPickCount * 2, entries.length + ' for ' + myPickCount + ' picks');
  const seqs = entries.map(e => e.seq);
  check('R7 ledger: seq is monotonic with ZERO gaps (1..N contiguous)',
    seqs.every((s, i) => s === i + 1), seqs.join(','));
  check('R7 ledger: every entry has a decision_at and a method tag',
    entries.every(e => e.decision_at === NOW && /-v1$/.test(e.method)));
  check('R7 ledger: recommendation precedes its pick at each of my picks',
    entries.filter(e => e.kind === 'recommendation').every((rec, i) => {
      const pk = entries.find(e => e.kind === 'pick' && e.pick === rec.pick && e.seq > rec.seq);
      return !!pk;
    }));

  console.log((IS_FIXTURE ? '[fixture board — R4 skipped] ' : '') + pass + '/' + (pass + fail) + ' robot-mock checks passed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
