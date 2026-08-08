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
const RC = require('../../public/js/draft/reconcile.js');

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
// Draft LENGTH = one round per roster spot (ground truth from roster_slots).
// Keepers forfeit specific rounds; they do not shorten the draft. See
// config_schema.draft_rounds. ROSTER_SIZE is the stable source; the artifact's
// stamped `rounds` MUST equal it (asserted in R-rounds below — red on a stale
// board built under the old roster_size−count bug, green once rebuilt).
const ROSTER_SIZE = Object.values(LEAGUE.roster_slots || {}).reduce((a, b) => a + b, 0) || 15;
const ROUNDS = ROSTER_SIZE;
const MY_KEEPERS = 3;
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

// R-rounds (2026-08-08 rounds fix): the draft is 15 rounds; a 3-keeper seat
// plays 12 (rounds 4-15). The artifact's stamped `rounds` MUST equal roster size
// — this is RED on a board built under the old roster_size−count bug and GREEN
// once rebuilt, exactly as intended.
{
  check('R-rounds: artifact draft length equals roster size (keepers do not shorten it)',
    LEAGUE.rounds === ROSTER_SIZE, 'rounds=' + LEAGUE.rounds + ' roster_size=' + ROSTER_SIZE);
  const forfeited = new Set([1, 2, 3]);   // my top_picks_flat forfeits
  const played = [];
  for (let r = 1; r <= ROUNDS; r++) if (!forfeited.has(r)) played.push(r);
  check('R-rounds: a 3-keeper seat plays ' + (ROUNDS - MY_KEEPERS) + ' rounds, first is round 4, last is round ' + ROUNDS,
    played.length === ROUNDS - MY_KEEPERS && played[0] === 4 && played[played.length - 1] === ROUNDS,
    played.join(','));
}

// R8 (Final Pass A1 — the need term reads the post-keeper roster). Written to the
// engine's TRUE behavior (per the flex nuance): the participation test is the
// reason CHANGE (an ignored roster would still say "fills an empty RB slot"),
// and the value only drops once dedicated AND flex are all consumed.
{
  const keeperRoster = [
    { position: 'WR', name: 'Chase', proj_mean: 200, vorp: 100 },
    { position: 'RB', name: 'Henry', proj_mean: 200, vorp: 90 },
    { position: 'RB', name: 'Walker', proj_mean: 180, vorp: 70 },
  ];
  const rb = ALL.find(p => p.position === 'RB');
  const wr = ALL.find(p => p.position === 'WR');
  check('R8 A1: with 2 RB keepers, the RB dedicated slots read FILLED (starts in flex, not "empty RB slot")',
    /flex/.test(E.starterSlotMarginal(rb, keeperRoster, LEAGUE).why));
  check('R8 A1 participation: the SAME RB on an EMPTY roster reads "empty RB slot" — proving need is roster-driven',
    /empty RB/.test(E.starterSlotMarginal(rb, [], LEAGUE).why));
  check('R8 A1: WR still has one open dedicated slot (1 of 2 filled by Chase)',
    /empty WR/.test(E.starterSlotMarginal(wr, keeperRoster, LEAGUE).why));
  // Consume dedicated AND flex: 2RB + 3WR + 1TE fills RB×2, WR×2, TE×1, FLEX×1
  // (the 3rd WR takes the flex), so an additional RB can only make the bench.
  const flexFull = keeperRoster.concat([
    { position: 'WR', name: 'x', proj_mean: 190, vorp: 85 },
    { position: 'WR', name: 'y', proj_mean: 185, vorp: 80 },
    { position: 'TE', name: 't', proj_mean: 150, vorp: 60 }]);
  const open = E.starterSlotMarginal(rb, keeperRoster, LEAGUE).value;
  const full = E.starterSlotMarginal(rb, flexFull, LEAGUE).value;
  check('R8 A1: once dedicated+flex are consumed, RB need drops to bench value (< flex-open value)',
    full < open, 'open=' + open.toFixed(1) + ' full=' + full.toFixed(1));
}

// R-LRM (§C): the countdown must MOVE, or it is a decorative alarm. computeLRM's
// core is "last of my picks where survival(bestQB, pick) >= 0.85". Simulate
// opponents taking QBs (an elevated run multiplier) and assert the deadline
// tightens (moves earlier) for QBs whose deadline sits in my window — never later.
if (!IS_FIXTURE) {
  const picks = [34, 41, 54, 61, 74, 81, 94, 101, 114, 121, 134, 141];
  const qbs = ALL.filter(p => p.position === 'QB').sort((a, b) => (b.vorp || 0) - (a.vorp || 0));
  const lastSafe = (qb, m) => {
    let l = null;
    for (let i = 0; i < picks.length; i++) if (E.survival(qb, picks[i], m) >= 0.85) l = picks[i];
    return l;
  };
  let moved = 0, wentLater = 0;
  qbs.forEach(qb => {
    const calm = lastSafe(qb, {});
    const run = lastSafe(qb, { QB: 1.6 });
    if (calm != null && run != null && run !== calm) { moved++; if (run > calm) wentLater++; }
  });
  check('R-LRM: a QB run MOVES the deadline for QBs in my window (not a static alarm)', moved > 0, 'moved=' + moved);
  check('R-LRM: the run only ever TIGHTENS the deadline, never loosens it', wentLater === 0, 'wentLater=' + wentLater);
}

// R-DST (2026-08-08 must-fix): the board MUST carry defenses, or the DEF starter
// slot can never be filled — legality and the forced-pick endgame were untestable
// against a pool with zero DEF. Red until the rebuild ingests DST; green after.
{
  const defs = ALL.filter(p => p.position === 'DEF');
  check('R-DST: the board carries at least one defense (DEF starter slot is fillable)',
    defs.length > 0, defs.length + ' DEF on the board');
  if (defs.length) {
    // Fill every starter slot EXCEPT DEF (incl. a flex filler), 1 pick left:
    // the endgame must force a DEF and nothing else.
    const pick = (pos, n) => ALL.filter(p => p.position === pos)[n || 0];
    const roster = [pick('QB'), pick('RB', 0), pick('RB', 1), pick('WR', 0), pick('WR', 1),
                    pick('TE'), pick('RB', 2) /* flex */, pick('K')].filter(Boolean);
    const board = ALL.filter(p => roster.indexOf(p) < 0);
    const scored = E.recommend({ board, currentPick: 150, nextPick: null, totalPicks: 150,
      myPicksLeft: 1, roster: roster, league: LEAGUE, weights: E.DEFAULT_WEIGHTS,
      runMultipliers: {}, intervening: [], roundsLeft: 1 });
    check('R-DST: with only DEF unfilled and 1 pick left, the endgame forces a DEF',
      scored.length > 0 && scored.every(s => s.player.position === 'DEF'),
      scored.slice(0, 3).map(s => s.player.position).join(','));
  }
}

// R-flex (D3, approved 2026-08-08): a candidate who can ONLY start in the flex
// is priced at his marginal value over the best flex-eligible alternative on the
// board — never full VORP — while a candidate who fills a DEDICATED open starter
// slot keeps his full value. This is the "don't pay full price for redundant RB
// depth when a real WR2 hole is open" invariant, run through the real scorePlayer.
{
  // A seat with 2 RB starters already filled (keepers). RB slots are FULL, so any
  // further RB can only reach the lineup via the flex; the WR slot is still open.
  const mkp = (id, pos, vorp) => ({ player_id: id, position: pos, proj_mean: 100 + vorp, vorp: vorp });
  const board = [mkp('R1', 'RB', 100), mkp('R2', 'RB', 90), mkp('W1', 'WR', 70)];
  const roster = [{ position: 'RB', proj_mean: 288, vorp: 88 }, { position: 'RB', proj_mean: 280, vorp: 80 }];
  const ctx = { board: board, currentPick: 34, nextPick: 41, totalPicks: 150, myPicksLeft: 12,
    roster: roster, league: LEAGUE, weights: E.DEFAULT_WEIGHTS, runMultipliers: {}, roundsLeft: 12 };
  const rbNeed = E.scorePlayer(board[0], ctx).components.need;
  const wrNeed = E.scorePlayer(board[2], Object.assign({}, ctx, { _flexAltSorted: null })).components.need;
  check('R-flex: a flex-only RB fill is discounted BELOW his raw VORP (100 → ' + rbNeed + ')',
    rbNeed < 100 && rbNeed >= 0, 'need=' + rbNeed);
  check('R-flex: the flex-fill marginal is vorp − best-other-flex-alt (100 − 90 = 10)',
    rbNeed === 10, 'need=' + rbNeed);
  check('R-flex: a WR filling the OPEN dedicated WR slot keeps full value (70), not discounted',
    wrNeed === 70, 'need=' + wrNeed);
  check('R-flex: the discount makes the dedicated-slot WR out-need the redundant RB depth',
    wrNeed > rbNeed, 'wr=' + wrNeed + ' rb=' + rbNeed);
}

// R-slot (A2): the slot-verification truth table, mirroring app.js setSlot /
// importDraftOrder exactly (app.js is a browser IIFE with no node harness, so —
// like opponentPick above — the rule is re-encoded here as the guarded spec). A
// slot is VERIFIED only when it comes from a REAL (non-mock) Sleeper draft object
// whose draft_order is populated. A manual entry, a mock draft, or a real object
// with a still-null draft_order (order not yet assigned) all stay UNVERIFIED, and
// everything slot-derived is provisional (watermark up) until it flips.
{
  // slotVerified(source, mock, draftOrderCount): the decision app.js encodes.
  function slotVerified(source, mock, draftOrderCount) {
    if (mock) return false;                         // a mock is a different draft
    if (source === 'sleeper' && draftOrderCount > 0) return true;
    return false;                                   // manual/site-claimed, or order not assigned
  }
  // Provenance mirrors app.js setSlot: sleeper > site-claimed > manual. Only
  // 'sleeper' verifies; 'site-claimed' is a real backend claim (Sleeper pending).
  function slotSource(source, mock) {
    if (source === 'sleeper' && !mock) return 'sleeper';
    if (source === 'site-claimed' && !mock) return 'site-claimed';
    return 'manual';
  }
  check('R-slot: a manually-entered slot is UNVERIFIED (placeholder)',
    slotVerified('manual', false, 0) === false && slotSource('manual', false) === 'manual');
  check('R-slot: a real Sleeper draft object with an assigned order VERIFIES the seat',
    slotVerified('sleeper', false, 10) === true && slotSource('sleeper', false) === 'sleeper');
  check('R-slot: a Sleeper object whose draft_order is still null stays UNVERIFIED (D4)',
    slotVerified('sleeper', false, 0) === false);
  check('R-slot: a slot resolved inside a MOCK never counts as verified',
    slotVerified('sleeper', true, 10) === false);
  check('R-slot: a site-claimed slot is NOT Sleeper-verified but is its own provenance (not manual)',
    slotVerified('site-claimed', false, 0) === false && slotSource('site-claimed', false) === 'site-claimed');
  check('R-slot: a site-claim inside a mock degrades to manual',
    slotSource('site-claimed', true) === 'manual');
}

// R-paths (Part 2 §1): the paths panel must render 0–4 PRICED, single-position
// directions on the REAL board, never a direction beyond the qualifying band,
// and its top path always at price 0. Run at a mid-draft board so real clustering
// happens (the flat top-5 becomes coherent directions).
{
  const roster = [ALL.find(p => p.position === 'WR'), ALL.filter(p => p.position === 'RB')[0],
                  ALL.filter(p => p.position === 'RB')[1]].filter(Boolean);
  const board = ALL.filter(p => roster.indexOf(p) < 0).slice(0, 120);
  const ctx = { board, currentPick: 34, nextPick: 47, totalPicks: 150, myPicksLeft: 12,
    roster, league: LEAGUE, weights: E.DEFAULT_WEIGHTS, runMultipliers: {}, intervening: [], roundsLeft: 12 };
  const paths = E.computePaths(ctx);
  check('R-paths: renders no more than PATHS_MAX directions', paths.length <= E.CFG.PATHS_MAX, 'n=' + paths.length);
  check('R-paths: at least one direction on a live board', paths.length >= 1, 'n=' + paths.length);
  check('R-paths: the top path is priced at 0', paths.length > 0 && paths[0].price === 0,
    JSON.stringify(paths.map(p => p.price)));
  check('R-paths: no direction is priced beyond the qualifying band',
    paths.every(p => p.price >= 0 && p.price <= E.CFG.PATHS_BAND), JSON.stringify(paths.map(p => p.price)));
  check('R-paths: each direction is a single real position (not a mix)',
    paths.every(p => p.candidates.every(c => c.player.position === p.position)));
  check('R-paths: every direction carries a name, a pick, and a when-it\'s-right',
    paths.every(p => p.name && p.pick && p.pick.player && p.when_right));
}

// R-placement (keeper-placement-verification §5): the heterogeneous keeper
// board — teams keeping 3/2/1/0 — reconciles clean when Cory places every
// keeper on the right team in the right round, and the placement alarm FIRES
// the moment he fat-fingers one onto the wrong team or the wrong round. This is
// the commissioner cross-check running through the real reconcile module.
{
  // Designations (the confirmed slate): keep-3 on team 1 (r1/2/3), keep-2 on
  // team 4 = me (r1/2), keep-1 on team 7 (r1), keep-0 on team 9 (nothing).
  const assumed = [
    { player_id: 'k31', team_slot: 1, cost_round: 1, name: 'T1 Keeper A' },
    { player_id: 'k32', team_slot: 1, cost_round: 2, name: 'T1 Keeper B' },
    { player_id: 'k33', team_slot: 1, cost_round: 3, name: 'T1 Keeper C' },
    { player_id: 'k41', team_slot: 4, cost_round: 1, name: 'My Keeper A' },
    { player_id: 'k42', team_slot: 4, cost_round: 2, name: 'My Keeper B' },
    { player_id: 'k71', team_slot: 7, cost_round: 1, name: 'T7 Keeper A' },
  ];
  // round r, team t -> a plausible snake pick_no in a 10-team draft.
  const pickNo = (t, r) => (r % 2 === 1) ? (r - 1) * TEAMS + t : (r - 1) * TEAMS + (TEAMS - t + 1);
  const correct = assumed.map(k => ({ player_id: k.player_id, is_keeper: true,
    draft_slot: k.team_slot, pick_no: pickNo(k.team_slot, k.cost_round) }));
  const opts = { teams: TEAMS, currentRound: 4, playersById: {} };

  const clean = RC.reconcile(correct, assumed, opts);
  check('R-placement: heterogeneous 3/2/1/0 keeper board reconciles clean when placed right',
    clean.ok && !clean.halt, JSON.stringify(clean.misplaced || clean.message));

  // Fat-finger #1: my keeper A dropped on team 5 instead of team 4.
  const wrongTeam = correct.map(p => p.player_id === 'k41'
    ? { ...p, draft_slot: 5, pick_no: pickNo(5, 1) } : p);
  const rt = RC.reconcile(wrongTeam, assumed, opts);
  check('R-placement: a keeper placed on the WRONG TEAM fires the alarm and halts',
    rt.halt && rt.misplaced.some(m => m.player_id === 'k41' && m.wrong_team), JSON.stringify(rt.misplaced));

  // Fat-finger #2: team-1 keeper C placed in round 2 instead of his cost round 3.
  const wrongRound = correct.map(p => p.player_id === 'k33'
    ? { ...p, pick_no: pickNo(1, 2) } : p);
  const rr = RC.reconcile(wrongRound, assumed, opts);
  check('R-placement: a keeper placed in the WRONG ROUND fires the alarm and halts',
    rr.halt && rr.misplaced.some(m => m.player_id === 'k33' && m.wrong_round), JSON.stringify(rr.misplaced));

  // A keep-0 team is legal: no designation, no keeper picks, nothing to reconcile.
  const keepZeroOnly = RC.reconcile(correct, assumed, opts);
  check('R-placement: keep-0 teams contribute no keeper picks and never trip the alarm',
    !(keepZeroOnly.misplaced || []).some(m => m.observed_team === 9), 'team 9 should not appear');
}

// R-shadow (Phase H): a FULL simulated draft with shadow rosters riding along.
// At each of my picks the shadows draft from the board AS IT STOOD (including
// the player I take); the scenario asserts the board-hash sequencing over the
// whole draft, one shadow player per real pick, no duplicates, and that the
// frozen rosters pass gradeGuard.
{
  const SH = require('../../public/js/draft/shadows.js');
  const mySlot = Number(LEAGUE.my_draft_slot) || 4;
  const sched = snake();
  const taken = new Set();
  const rand = rng(777);
  const shadows = SH.create({ rehearsal: false, rounds: ROUNDS, built_at: ART.built_at });
  const expectedHashes = [];
  let myPicks = 0;

  for (const step of sched) {
    const board = ALL.filter(p => !taken.has(String(p.player_id)));
    if (!board.length) break;
    let chosen;
    if (step.team_slot === mySlot) {
      const ctx = { board, currentPick: step.pick_no, nextPick: step.pick_no + TEAMS,
        totalPicks: sched.length, myPicksLeft: sched.filter(t => t.team_slot === mySlot && t.pick_no >= step.pick_no).length,
        roster: [], league: LEAGUE, weights: E.DEFAULT_WEIGHTS,
        runMultipliers: {}, intervening: [], roundsLeft: ROUNDS - step.round + 1 };
      expectedHashes.push(SH.boardHash(board));
      SH.onMyPick(shadows, board, ctx, step.round);
      myPicks++;
      const scored = E.recommend(ctx);
      chosen = scored.length ? scored[0].player : board[0];
    } else {
      chosen = opponentPick(board, rand);
    }
    taken.add(String(chosen.player_id));
  }
  SH.freeze(shadows, { built_at: ART.built_at });

  const strat = Object.values(shadows.strategies);
  check('R-shadow: every strategy drafted one player per real pick (' + myPicks + ')',
    strat.every(s => s.roster.length === myPicks),
    strat.map(s => s.key + ':' + s.roster.length).join(','));
  check('R-shadow: every shadow pick logged the CORRECT board snapshot hash (sequencing)',
    strat.every(s => s.log.every((l, i) => l.board_hash === expectedHashes[i])));
  check('R-shadow: no shadow rosters a duplicate over a full draft',
    strat.every(s => new Set(s.roster.map(p => String(p.player_id))).size === s.roster.length));
  check('R-shadow: frozen rosters pass gradeGuard (hash + frozen)',
    strat.every(s => SH.gradeGuard(s, ROUNDS).ok === true));
  check('R-shadow: real-draft shadows carry rehearsal:false throughout',
    strat.every(s => s.log.every(l => l.rehearsal === false)));
}

// R-rehearsal (mock #2 fidelity): the predicted-keeper board filter.
//
// In a real draft ~27 opponent keepers are gone before pick one; in a Sleeper
// mock the whole pool is live, so the value landscape at my picks is nothing
// like draft night. The artifact carries the PREDICTED slate under its own key
// so it can never be confused with my confirmed one.
{
  const pk = ART.predicted_keepers;
  check('R-rehearsal: the artifact carries a predicted opponent slate',
    !!(pk && pk.predictions && Object.keys(pk.predictions).length), 'absent');

  if (pk && pk.predictions) {
    const mine = new Set((ART.kept_players || []).map(k => String(k.player_id)));
    const opp = [];
    Object.keys(pk.predictions).forEach(o => {
      if (o === 'coryjsimms') return;
      ((pk.predictions[o] || {}).predicted_keepers || []).forEach(k => opp.push(String(k.player_id)));
    });
    check('R-rehearsal: predicted opponent keepers are DISJOINT from my confirmed slate',
      opp.every(id => !mine.has(id)), 'overlap: ' + opp.filter(id => mine.has(id)).join(','));
    check('R-rehearsal: removing them actually thins the board (non-vacuous)',
      opp.length > 0 && ALL.some(p => opp.includes(String(p.player_id))),
      opp.length + ' predicted');

    // The prediction must never be merged into kept_players — a prediction that
    // reads as the confirmed slate is the failure the separate key prevents.
    check('R-rehearsal: the confirmed slate is unchanged by the prediction',
      (ART.kept_players || []).length === 3
      && (ART.kept_players || []).every(k => Number(k.team_slot) === Number(LEAGUE.my_draft_slot)),
      JSON.stringify((ART.kept_players || []).map(k => [k.name, k.team_slot])));

    // Every predicted keeper carries a confidence, so the label can be honest
    // about how much of the slate is intel vs model.
    const all = [];
    Object.keys(pk.predictions).forEach(o =>
      ((pk.predictions[o] || {}).predicted_keepers || []).forEach(k => all.push(k)));
    check('R-rehearsal: every predicted keeper carries a confidence tier',
      all.every(k => typeof k.confidence === 'string' && k.confidence),
      all.filter(k => !k.confidence).length + ' missing');
  }
}

// R-seatdata (the sweep Cory asked for): the room-seat-vs-league-seat pattern.
//
// It bit twice in one day — `league.my_draft_slot` surviving a mock rebuild, and
// `kept_players.team_slot` carrying the LEAGUE seat while the lookup used the
// ROOM seat. The sweep found a third and fourth: `state.profiles` is indexed by
// manager_profiles' league `draft_slot` and every read matched it against a room
// seat. In a mock that is fiction, not a near-miss — a bot in room seat 3 would
// render as a named league manager, and the dossier model would attribute its
// pick to that manager's tendencies.
{
  const profiles = ((ART.manager_profiles || {}).managers) || {};
  const withSlot = Object.values(profiles).filter(p => p.draft_slot);
  // THE SWEEP'S REAL FINDING: profiles carry NO draft_slot, so any slot->name
  // mapping before the live draft object is imported comes from
  // indexProfilesBySlot's ORDER FALLBACK — my ten managers assigned to seats
  // 1..10 in object order. Arbitrary in the real league, not only in mocks.
  // Asserted as the documented state so a future build that starts emitting
  // draft_slot fails here and forces the consumer rule to be revisited.
  check('R-seatdata: profiles carry NO league draft_slot — slot names need the draft object',
    withSlot.length === 0,
    withSlot.length + ' of ' + Object.keys(profiles).length + ' now slotted — revisit profileForSlot');

  // Every artifact field that carries a seat must be a LEAGUE seat, so any
  // consumer comparing one to a room seat is a bug by construction. Enumerate
  // them, so a NEW seat-bearing field cannot be added without this failing.
  const SEAT_BEARING = [
    ['kept_players[].team_slot', (ART.kept_players || []).map(k => k.team_slot)],
    ['pick_order.forfeited[].team_slot', ((ART.pick_order || {}).forfeited || []).map(f => f.team_slot)],
    ['manager_profiles[].draft_slot', withSlot.map(p => p.draft_slot)],   // empty today
  ];
  const teams = LEAGUE.teams || 10;
  SEAT_BEARING.forEach(([name, vals]) => {
    check('R-seatdata: ' + name + ' holds league seats in range',
      vals.every(v => v == null || (Number(v) >= 1 && Number(v) <= teams)),
      JSON.stringify(vals.slice(0, 6)));
  });

  // My keepers are stamped with MY league seat — the exact fact that made the
  // room-seat lookup return nothing and start every rehearsal empty.
  const mySeat = Number(LEAGUE.my_draft_slot);
  check('R-seatdata: my kept players are stamped with my LEAGUE seat, not a room seat',
    (ART.kept_players || []).every(k => Number(k.team_slot) === mySeat),
    JSON.stringify((ART.kept_players || []).map(k => [k.name, k.team_slot])));
}

// R-manualclock: THE CONSUMER SWEEP. Every consumer of pick position must
// advance in MANUAL mode specifically — the sync path was masking a frozen
// clock everywhere, and manual mode is the draft-night fallback.
//
// Mutation-checked below: freeze the clock and this scenario must fail.
{
  const LG = require('../../public/js/draft/legality.js');
  const STARTERS = LEAGUE.starters || { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 };
  const myPicks = [34, 41, 54, 61, 74, 81];
  // The manual clock, as app.js derives it: picks OBSERVED + 1.
  const clockFrom = observed => observed + 1;

  const seen = [];
  let survivalSeries = [], lrmSeries = [], legalitySeries = [];
  const board = ALL.slice(0, 200);

  for (let observed = 0; observed <= 90; observed += 10) {
    const cur = clockFrom(observed);
    seen.push(cur);
    const left = myPicks.filter(n => n >= cur);
    const nextPick = left.length > 1 ? left[1] : cur + TEAMS;
    const ctx = { board, currentPick: cur, nextPick: nextPick, totalPicks: 150,
      myPicksLeft: left.length, roster: [], league: LEAGUE,
      weights: E.DEFAULT_WEIGHTS, runMultipliers: {}, intervening: [],
      roundsLeft: ROUNDS - Math.ceil(cur / TEAMS) + 1 };
    const scored = E.recommend(ctx);
    // A MID-BOARD player, not the top one: the best available never survives to
    // my next pick, so scored[0] is saturated at 0.000 and would read exactly
    // like a frozen clock. A metric that cannot move proves nothing.
    const mid = scored.find(x => x.survival_to_next != null
      && x.survival_to_next > 0.01 && x.survival_to_next < 0.99);
    if (mid) survivalSeries.push(mid.survival_to_next);
    legalitySeries.push(LG.assess([], STARTERS, left.length).picksLeft);
    lrmSeries.push(left.length);
  }

  check('R-manualclock: the clock ADVANCES on observed picks (never frozen)',
    seen.every((v, i) => i === 0 || v > seen[i - 1]), seen.join(','));
  check('R-manualclock: legality picks-remaining TIGHTENS as the clock moves',
    legalitySeries[0] > legalitySeries[legalitySeries.length - 1],
    legalitySeries.join(','));
  check('R-manualclock: LRM horizon shrinks — my remaining picks decrease',
    lrmSeries[0] > lrmSeries[lrmSeries.length - 1], lrmSeries.join(','));
  // Survival must MOVE. A frozen clock produces an identical series.
  check('R-manualclock: survival estimates actually change as the clock advances',
    new Set(survivalSeries.map(v => Math.round(v * 1000))).size > 1,
    survivalSeries.slice(0, 6).map(v => v.toFixed(3)).join(','));

  // THE STRUCTURAL LAW: drafted == observed + keepers pre-seeded.
  const law = (drafted, observed, keepers) => drafted === observed + keepers;
  check('R-manualclock: the structural law holds for a normal board',
    law(43, 40, 3) && law(3, 0, 3) && law(0, 0, 0));
  check('R-manualclock: the law CATCHES the frozen-clock shape',
    !law(43, 0, 3), 'a frozen clock reports 0 observed against 43 drafted');
}

// R-missedmark: the three fixtures the spec demands — sync auto-reconciles and
// tags it, manual nags and never invents, exit catches a deliberate mismatch.
//
// The load-bearing rule is item 3: NEVER auto-assign the recommendation as the
// pick, in any mode. A ledger entry Cory did not make is worse than a missing
// one, because it corrupts the grading data everything downstream depends on.
{
  const LG = require('../../public/js/draft/legality.js');
  const mySeat = 4;

  // FIXTURE 1 — SYNC LIVE. A pick lands on my seat that I never marked.
  {
    const st = A.emptyState();
    for (let i = 1; i <= TEAMS; i++) st.rosters[i] = [];
    const markedLocally = new Set();          // I tapped nothing
    const player = ALL[10];
    A.applyRemote(st, player, mySeat, mySeat);
    const missed = !markedLocally.has(String(player.player_id));
    check('R-missedmark: Sleeper is truth — an unmarked pick still lands on my roster',
      st.myRoster.some(p => String(p.player_id) === String(player.player_id)));
    check('R-missedmark: the tool can TELL it was never tapped locally', missed === true);

    // ...and a pick I DID tap is not flagged as reconciled.
    const mine = ALL[11];
    markedLocally.add(String(mine.player_id));
    A.applyRemote(st, mine, mySeat, mySeat);
    check('R-missedmark: a pick I tapped myself is NOT treated as reconciled',
      markedLocally.has(String(mine.player_id)));
  }

  // FIXTURE 2 — MANUAL / SYNC DEAD. The board passes my pick, nothing recorded.
  {
    const myPicks = [34, 41, 54, 61];
    const currentPick = 55;                    // 34, 41 and 54 have all passed
    const recorded = 2;                        // I only marked two of them
    const passed = myPicks.filter(n => n < currentPick);
    const missing = passed.length - recorded;
    check('R-missedmark: the gap is COUNTED, not guessed at', missing === 1, String(missing));
    check('R-missedmark: the unrecorded pick numbers are nameable',
      passed.slice(-missing).join(',') === '54', passed.slice(-missing).join(','));
    // ITEM 3: nothing anywhere fills that gap with the recommendation.
    const roster = [];
    check('R-missedmark: NOTHING auto-assigns a pick — the roster stays short',
      roster.length === 0);
  }

  // FIXTURE 3 — EXIT. A deliberate mismatch must be caught before archiving.
  {
    const marked = [ALL[0], ALL[1]];
    const sleeper = [ALL[0], ALL[2]];          // I missed ALL[2], mis-marked ALL[1]
    const r = LG.reconcileExit(marked, sleeper);
    check('R-missedmark: exit reconciliation catches a deliberate mismatch',
      r.ok === false && r.missing.length === 1 && r.extra.length === 1,
      JSON.stringify({ missing: r.missing.length, extra: r.extra.length }));
    check('R-missedmark: a clean exit reconciles clean (non-vacuous)',
      LG.reconcileExit(marked, marked).ok === true);
  }
}

// R-seatauto: the seat resolves from the draft object, with no manual entry.
//
// A REAL BUG the sweep surfaced: the resolver read `window.MY_ROSTER_ID`, which
// is never defined anywhere in the codebase — so `mine` was always null and seat
// resolution had never worked, in mocks or the real league. The identity that
// IS available is my Sleeper user id, and draft_order maps user_id -> slot in
// every draft object including mocks.
{
  const profiles = ((ART.manager_profiles || {}).managers) || {};
  const myUid = Object.keys(profiles).find(u => (profiles[u] || {}).name === 'coryjsimms');
  check('R-seatauto: my Sleeper uid is present on the board (the identity exists)',
    !!myUid, 'no profile named coryjsimms');

  // The resolution itself is arithmetic over the draft object: uid -> slot.
  const resolve = (draft, uid) => {
    const byUser = draft.draft_order || {};
    return (uid && byUser[uid] != null) ? Number(byUser[uid]) || null : null;
  };
  const mockDraft = { draft_order: { [myUid]: 7, '999': 1, '888': 2 }, slot_to_roster_id: {} };
  check('R-seatauto: a MOCK draft object names my seat with no roster ids at all',
    resolve(mockDraft, myUid) === 7, String(resolve(mockDraft, myUid)));
  check('R-seatauto: a draft_order that does not list me resolves to null, not a guess',
    resolve({ draft_order: { '999': 1 } }, myUid) === null);
  check('R-seatauto: an unpopulated draft_order (order not yet assigned) resolves null',
    resolve({ draft_order: {} }, myUid) === null && resolve({}, myUid) === null);
  check('R-seatauto: the OLD path could never resolve — MY_ROSTER_ID is undefined',
    typeof global.MY_ROSTER_ID === 'undefined' && typeof globalThis.MY_ROSTER_ID === 'undefined');
}

// R-noname: no seat-specific opponent claim before the draft object names them.
//
// `threatBoard` drives the adjacency lines, the sniper warnings and the
// before-your-next-pick strip. Feed it profiles and it names opponents; feed it
// nulls and it must degrade to seat numbers rather than inventing anyone. A
// confident wrong name would put a real manager's tendencies on a stranger's
// seat and invite a decision against them.
{
  const teams = TEAMS;
  const board = ALL.slice(0, 120);
  const mkCtx = (withProfiles) => ({
    board, currentPick: 34, nextPick: 41, totalPicks: 150, myPicksLeft: 8,
    roster: [], league: LEAGUE, weights: E.DEFAULT_WEIGHTS, runMultipliers: {},
    roundsLeft: 10,
    intervening: [35, 36, 37, 38, 39, 40].map((n, i) => ({
      team_slot: ((i + 4) % teams) + 1, pick_no: n, roster: [],
      profile: withProfiles ? { display_name: 'Richard2121', draft_slot: 5 } : null,
    })),
  });

  const named = E.threatBoard(mkCtx(true));
  check('R-noname: WITH a mapped profile the board names the opponent (non-vacuous)',
    named.rows.some(r => r.manager), JSON.stringify(named.rows.map(r => r.manager)));

  const blank = E.threatBoard(mkCtx(false));
  check('R-noname: with NO mapping, not one row claims a manager',
    blank.rows.every(r => !r.manager), JSON.stringify(blank.rows.map(r => r.manager)));
  check('R-noname: the pick numbers and counts still render — generic, not silent',
    blank.rows.length === named.rows.length
    && blank.picksUntilNext === named.picksUntilNext,
    blank.rows.length + ' vs ' + named.rows.length);
  check('R-noname: no tell is attributed to anyone when seats are unassigned',
    blank.rows.every(r => !(r.tells || []).some(t => /Richard/i.test(t.text || ''))),
    JSON.stringify(blank.rows.map(r => (r.tells || []).map(t => t.text))));
}

// R-legality (SEVERITY-1, mock #1): the guarantee that failed.
//
// Cory left a mock with no defense and the tool never said a word. Per his
// REVISION, the fix is not force-filling: K/DST are streamable and punting them
// is legitimate. So the assertions are (1) a full draft from EVERY slot never
// ends with a MANDATORY slot unfilled, (2) the strip is never silent about an
// open slot, and (3) an attempt to end with a mandatory hole is caught while
// an intentional K/DST punt is NOT.
{
  const LG = require('../../public/js/draft/legality.js');
  const STARTERS = (LEAGUE.starters) || { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 };
  const MANDATORY = Object.keys(STARTERS).filter(k => !LG.STREAMABLE[k]);

  // THE DRAFTER IS DELIBERATELY BLIND. A first version of this scenario used
  // E.recommend and passed even with the guarantee deleted — the engine fills
  // every mandatory slot naturally in 15 picks, so the test proved nothing.
  // Mock #1's actual failure was a BLIND engine (need read another team's
  // roster), so the drafter here ignores need entirely and takes the highest
  // projection on the board. That is the state the guarantee has to survive.
  const blindPick = pool => pool.slice().sort((a, b) =>
    (b.proj_mean || 0) - (a.proj_mean || 0))[0];

  let allLegal = true, everSilent = false, slotsRun = 0, guaranteeFired = 0;
  const failures = [];

  for (let mySlot = 1; mySlot <= TEAMS; mySlot++) {
    const sched = snake();
    const taken = new Set();
    const rand = rng(9000 + mySlot);
    const myRoster = [];
    const mySched = sched.filter(t => t.team_slot === mySlot);
    slotsRun++;

    for (const step of sched) {
      const board = ALL.filter(p => !taken.has(String(p.player_id)));
      if (!board.length) break;
      let chosen;
      if (step.team_slot === mySlot) {
        const left = mySched.filter(t => t.pick_no >= step.pick_no).length;
        const a = LG.assess(myRoster, STARTERS, left);
        // The strip must never be silent while a slot is open.
        if (a.status !== 'legal' && !/unfilled|empty|Starters: /.test(a.line)) everSilent = true;
        // Draft to the guarantee: when every remaining pick is spoken for by a
        // mandatory slot, take one of those. Otherwise take the best available.
        const needPos = a.hardMissing.length ? a.hardMissing[0].slot : null;
        let pool = board;
        if (a.mustDraftNow && needPos) {
          const want = needPos === 'FLEX' ? LG.FLEX_POS : [needPos];
          const filtered = board.filter(p => want.indexOf(p.position) >= 0);
          if (filtered.length) { pool = filtered; guaranteeFired++; }
        }
        chosen = blindPick(pool);
        myRoster.push(chosen);
      } else {
        chosen = opponentPick(board, rand);
      }
      taken.add(String(chosen.player_id));
    }

    const end = LG.assess(myRoster, STARTERS, 0);
    if (end.hardMissing.length) {
      allLegal = false;
      failures.push('slot ' + mySlot + ': ' + end.line);
    }
  }

  check('R-legality: a full draft from EVERY slot (' + slotsRun + ') ends with every '
    + 'MANDATORY starting slot filled', allLegal, failures.slice(0, 3).join(' | '));
  check('R-legality: the strip is never silent while a slot is open', !everSilent);
  // NON-VACUITY. If the guarantee never fires, the assertion above is testing
  // the engine's good taste, not the guarantee. It must have bound at least
  // once across the sweep, or this scenario is decoration.
  check('R-legality: the guarantee actually FIRED (non-vacuous, ' + guaranteeFired + ' times)',
    guaranteeFired > 0, 'never fired — the scenario proves nothing');
  check('R-legality: mandatory slots are exactly the non-streamable ones',
    MANDATORY.sort().join(',') === ['FLEX', 'QB', 'RB', 'TE', 'WR'].sort().join(','),
    MANDATORY.join(','));

  // Ending illegally is BLOCKED; ending on a deliberate onesie punt is NOT.
  const punt = LG.exitSummary(
    ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'RB'].map(pos => ({ position: pos })), STARTERS, 0);
  check('R-legality: a deliberate K/DST punt exits cleanly with a streaming plan',
    punt.deliberate === true && punt.todo.length === 2 && punt.todo.every(t => /stream/.test(t.plan)));
  const hole = LG.exitSummary(
    ['QB', 'RB', 'WR', 'TE'].map(pos => ({ position: pos })), STARTERS, 0);
  check('R-legality: exiting with a MANDATORY hole is refused as non-deliberate',
    hole.deliberate === false && hole.todo.some(t => /it is a hole/.test(t.plan)));

  // DST availability — the fix for the missing-DST board bug must be live here.
  const defs = ALL.filter(p => p.position === 'DEF').length;
  const ks = ALL.filter(p => p.position === 'K').length;
  check('R-legality: defenses and kickers are actually in the rehearsal pool',
    defs > 0 && ks > 0, 'DEF=' + defs + ' K=' + ks);
}

// R-seat (SEVERITY-1, mock #1): ONE seat identity across every consumer.
//
// The bug: `applyDraftShape` rebuilt the pick order for the MOCK seat while
// `league.my_draft_slot` kept the LEAGUE seat, because the only line that syncs
// them is guarded by `!state.mockMode` and applyDraftShape sets mockMode first.
// Every roster attribution compared a pick's seat against the wrong number, so
// my picks landed nowhere and one opponent's landed on my roster — which is why
// the engine offered TEs after Loveland and never saw an empty DEF.
{
  const SEAT = require('../../public/js/draft/seat.js');

  // The exact mock #1 shape: a 10-team mock room, my real league seat is 7.
  const mock = { teams: 10, rounds: 15, type: 'snake' };
  const roomPicks = [];
  for (let r = 1; r <= 15; r++) {
    roomPicks.push(r % 2 ? (r - 1) * 10 + 4 : r * 10 - 4 + 1);   // seat 4, snake
  }

  const good = SEAT.resolve({ realSlot: 7, roomSlot: 4, source: 'sleeper',
                              mock: mock, myPicks: roomPicks });
  check('R-seat: the room seat and the league seat are BOTH kept, and differ',
    good.roomSlot === 4 && good.realSlot === 7 && good.mapped === true);
  check('R-seat: the mapping is stated, not silently reconciled',
    /mock seat 4 = my real seat 7/.test(SEAT.describe(good)), SEAT.describe(good));

  // The regression itself: pick order built for seat 4, identity claiming 7.
  const broken = SEAT.resolve({ realSlot: 7, roomSlot: 7, source: 'assumed',
                                mock: mock, myPicks: roomPicks });
  const auditBad = SEAT.audit(broken, { headerSlot: 7, pickOrderMyPicks: roomPicks });
  check('R-seat: an identity that disagrees with its own pick order FAILS the audit',
    auditBad.ok === false && auditBad.problems.length > 0, JSON.stringify(auditBad.problems));

  const auditGood = SEAT.audit(good, {
    headerSlot: 4, pickOrderMyPicks: roomPicks, noticePicks: roomPicks,
    rosterSlotsSeen: [1, 4, 7, 10],
  });
  check('R-seat: a consistent identity passes with every consumer agreeing',
    auditGood.ok === true, JSON.stringify(auditGood.problems));

  // The other half of the wrong-roster symptom: a seat outside the room.
  const outside = SEAT.audit(good, { headerSlot: 4, pickOrderMyPicks: roomPicks,
                                     rosterSlotsSeen: [1, 4, 12] });
  check('R-seat: a roster on a seat the room does not have is caught',
    outside.ok === false && /outside a 10-team room/.test(outside.problems.join(' ')),
    JSON.stringify(outside.problems));

  // A league seat that does not exist in a smaller mock must never be assumed.
  const small = SEAT.resolve({ realSlot: 7, roomSlot: null, source: 'assumed',
                               mock: { teams: 6, rounds: 15 }, myPicks: [] });
  check('R-seat: an unresolvable mock seat reports UNRESOLVED, never a fallback number',
    small.resolved === false && small.roomSlot === null
    && /UNRESOLVED/.test(SEAT.describe(small)), SEAT.describe(small));
  check('R-seat: an unresolved seat fails the audit before any surface can be right',
    SEAT.audit(small, {}).ok === false);

  // Outside a mock, the league seat IS the room seat — no mapping, no warning.
  const real = SEAT.resolve({ realSlot: 7, roomSlot: null, source: 'sleeper',
                              verified: true, myPicks: [7, 14] });
  check('R-seat: in a league draft the two identities collapse to one',
    real.roomSlot === 7 && real.mapped === false && real.verified === true);
}

// R-seat-attribution: with ONE identity, my marked picks land on my roster and
// opponent picks never do — the symptom that cuts both ways.
{
  const A = require('../../public/js/draft/attribution.js');
  const roomSeat = 4;                       // mock seat, NOT the league's 7
  const st = { drafted: new Set(), rosters: {}, myRoster: [], board: [] };
  const mk = (id, pos) => ({ player_id: String(id), name: 'P' + id, position: pos });

  A.markLocal(st, mk(1, 'TE'), roomSeat, roomSeat);        // I take a TE
  A.markLocal(st, mk(2, 'TE'), 7, roomSeat);               // seat 7 takes a TE
  A.markLocal(st, mk(3, 'RB'), 9, roomSeat);               // seat 9 takes an RB

  check('R-seat-attribution: my pick lands on MY roster',
    st.myRoster.length === 1 && st.myRoster[0].player_id === '1',
    st.myRoster.map(p => p.player_id).join(','));
  check('R-seat-attribution: the league-seat opponent does NOT land on my roster',
    !st.myRoster.some(p => p.player_id === '2'));
  check('R-seat-attribution: every opponent pick lands on its own seat',
    (st.rosters[7] || []).length === 1 && (st.rosters[9] || []).length === 1);

  // And the need model therefore sees ONE rostered TE, not zero and not two.
  const tes = st.myRoster.filter(p => p.position === 'TE').length;
  check('R-seat-attribution: the need model reads exactly my own TE count',
    tes === 1, 'TEs on my roster: ' + tes);
}

// R-doctrine (war-room-v2-doctrine-banner.md §5): the banner's state machine
// driven by the REAL board through a full draft, not by fixture numbers. The
// unit suite proves the hysteresis algebra; this proves the algebra is being
// fed real dollars, that the enrolled plan comes from the Lab's stamp, and —
// the load-bearing property — that switches are RARE on a real board.
{
  const DD = require('../../public/js/draft/doctrine.js');
  const mySlot = Number(LEAGUE.my_draft_slot) || 4;
  const sched = snake();
  const dollarsOf = p => E.playerDollars(p).total;

  const enr = DD.enrollment(ART.doctrine || null);
  check('R-doctrine: the enrolled plan comes from the artifact stamp, not the client',
    ART.doctrine ? (enr.enrolled === true && !!DD.DOCTRINES[enr.key])
                 : (enr.enrolled === false && enr.key === 'balanced'),
    JSON.stringify({ stamped: !!ART.doctrine, key: enr.key }));

  // --- the ordinary draft: how often does the plan actually change? ---------
  {
    const st = new DD.DoctrineState(enr.key, { noiseBand: E.CFG.DG_NOISE_BAND, minPicks: 2 });
    const taken = new Set();
    const rand = rng(4242);
    const myRoster = [];
    let myPicks = 0, switches = 0, everyPickPriced = true;

    for (const step of sched) {
      const board = ALL.filter(p => !taken.has(String(p.player_id)));
      if (!board.length) break;
      let chosen;
      if (step.team_slot === mySlot) {
        myPicks++;
        const ctx = { board, currentPick: step.pick_no, nextPick: step.pick_no + TEAMS,
          totalPicks: sched.length, myPicksLeft: sched.filter(t => t.team_slot === mySlot && t.pick_no >= step.pick_no).length,
          roster: myRoster, league: LEAGUE, weights: E.DEFAULT_WEIGHTS,
          runMultipliers: {}, intervening: [], roundsLeft: ROUNDS - step.round + 1 };
        const scored = E.recommend(ctx);
        const scores = DD.scoreBoard(scored, { liveIndex: myPicks, roster: myRoster, dollarsOf });
        // Every doctrine must price out to a real, positive dollar figure off a
        // real board — a $0 or NaN here means the banner would render a number
        // it did not compute.
        if (!Object.keys(scores).every(k => Number.isFinite(scores[k]) && scores[k] > 0)) everyPickPriced = false;
        const out = st.update(scores, step.pick_no);
        if (out.switched) switches++;
        chosen = scored.length ? scored[0].player : board[0];
        myRoster.push(chosen);
      } else {
        chosen = opponentPick(board, rand);
      }
      taken.add(String(chosen.player_id));
    }

    check('R-doctrine: every doctrine priced from the real board at every one of my picks',
      everyPickPriced);
    check('R-doctrine: the banner logged doctrine state once per pick (' + myPicks + ')',
      st.log.length === myPicks, st.log.length + ' vs ' + myPicks);
    check('R-doctrine: every logged row names a doctrine and its live alternative',
      st.log.every(l => !!l.doctrine && (l.alternative === null || !!DD.DOCTRINES[l.alternative])));
    // HYSTERESIS IS THE POINT. A banner that reconsiders the plan every pick is
    // a mood ring; over a whole draft the doctrine should change a handful of
    // times at most.
    check('R-doctrine: switches are RARE across a full draft (' + switches + ' in ' + myPicks + ')',
      switches <= Math.ceil(myPicks / 3), switches + '/' + myPicks);
  }

  // --- the QB run: exactly ONE switch announcement, framed in dollars -------
  // Scripted rather than sampled: run the QB position between two of my picks
  // so Early-QB Strike can still be executed, just at a far worse price. That
  // is the board event the banner exists to announce.
  //
  // A REAL PROPERTY THIS SCENARIO PINNED DOWN, worth stating: draining QBs
  // *entirely* does NOT price the doctrine down — an unsatisfiable constraint
  // falls back to unconstrained, so a total wipeout makes Early-QB Strike cost
  // nothing because there is no longer an early QB to strike for. The doctrine
  // dies rather than bleeds. Only a PARTIAL run — the top of the tier gone, the
  // tail still there — moves the dollars, and that is what a run actually is.
  {
    const st = new DD.DoctrineState('early_qb', { noiseBand: E.CFG.DG_NOISE_BAND, minPicks: 2 });
    const full = ALL.slice(0, 120).map(p => ({ player: p }));
    const topQBs = new Set(full.filter(e => e.player.position === 'QB')
      .sort((a, b) => dollarsOf(b.player) - dollarsOf(a.player))
      .slice(0, 6).map(e => String(e.player.player_id)));
    const afterRun = full.filter(e => !topQBs.has(String(e.player.player_id)));
    const scoresFull = DD.scoreBoard(full, { liveIndex: 3, roster: [], dollarsOf });
    const scoresRun = DD.scoreBoard(afterRun, { liveIndex: 3, roster: [], dollarsOf });
    check('R-doctrine: a partial QB run prices Early-QB Strike down',
      scoresRun.early_qb < scoresFull.early_qb, scoresFull.early_qb + ' -> ' + scoresRun.early_qb);
    const wipeout = DD.scoreBoard(full.filter(e => e.player.position !== 'QB'),
      { liveIndex: 3, roster: [], dollarsOf });
    check('R-doctrine: a TOTAL QB wipeout releases the constraint instead of penalising it',
      Math.abs(wipeout.early_qb - wipeout.balanced) < 1e-6, JSON.stringify(wipeout.early_qb));

    const a = st.update(scoresFull, 31);
    const b = st.update(scoresRun, 41, { cause: 'the QB run emptied the tier', projected: 14 });
    const c = st.update(scoresRun, 51, { cause: 'the QB run emptied the tier', projected: 14 });
    const d = st.update(scoresRun, 61, { cause: 'the QB run emptied the tier', projected: 14 });
    const announcements = [a, b, c, d].filter(x => x.switched);
    check('R-doctrine: a QB run triggers EXACTLY ONE switch announcement',
      announcements.length === 1, announcements.length + ' announcements');
    check('R-doctrine: the announcement is framed in dollars and names the cause',
      announcements.length === 1 && /\+\$\d/.test(announcements[0].sentence)
      && /QB run/.test(announcements[0].sentence), (announcements[0] || {}).sentence);
    check('R-doctrine: the switch waited out the hysteresis window (not the first pick)',
      a.switched === false && b.switched === false);

    // Decline: the owner's call wins, the prior doctrine survives, it is logged.
    const prior = 'early_qb';
    const rec = st.decline(prior, 61);
    check('R-doctrine: declining a switch restores the prior doctrine and logs it',
      st.current === prior && rec.kind === 'doctrine_decline' && rec.kept === prior
      && st.log.some(l => l.kind === 'doctrine_decline'));
  }
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
