// TERRITORY: A
/* CAN LEAGUE-SPECIFIC INFORMATION CHANGE WHAT THE TOOL TELLS ME TO DO?
 *
 * THE QUESTION THIS ANSWERS, and it is not the one a source scan answers.
 * "Is the input consumed" is cheap and we have proved it repeatedly. The
 * expensive question is whether an input that IS consumed can move the final
 * recommendation, because a signal can be wired into the arithmetic and have
 * effectively zero influence on the decision. Known examples in this codebase:
 * the keeper weight flipping 0 of 4 late #1s, the need ramp at ~5% of picks,
 * the whole opponent dossier at 0.7%.
 *
 * SO EVERY ROW HERE IS A CONTROLLED PERTURBATION, not a trace. Each arm removes
 * or changes ONE league-specific input and counts how many of my picks move.
 *
 * FIXED STATE, NOT FREE RUN — inherited from profile_flip.js. Both arms are
 * evaluated at identical board states, trajectory driven by the CONTROL, so a
 * difference measures the input rather than the divergence it caused.
 *
 * THE FOUR LAYERS ARE KEPT SEPARATE, because they fail differently:
 *   L1 league mechanics   scoring, roster, keepers, teams
 *   L2 market mismatch    our ADP adjustment against the raw public number
 *   L3 room behaviour     manager profiles, the measured room mixture
 *   L4 draft state        what has already happened in this specific draft
 *
 * WHAT THIS CANNOT SEE, stated so a null here is not read as "scoring does not
 * matter": THE ENGINE NEVER READS THE SCORING TABLE. Scoring enters at BUILD
 * time, baked into proj_mean by score_stat_line, and reaches the decision only
 * through the board's numbers. That is the right place for it — but it means a
 * scoring perturbation cannot be run at this layer at all, and the honest
 * classification of scoring is "consumed upstream", not "influential" or
 * "inert". Measured, not assumed: `grep scoring engine.js` returns five hits,
 * every one a comment or an unrelated word.
 *
 * Run: node draft/tools/league_sensitivity.js [drafts]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('../../public/js/draft/engine.js');

const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const LEAGUE = DATA.league;
const TEAMS = LEAGUE.teams || 10;
const ROUNDS = LEAGUE.rounds || 15;
const MY = LEAGUE.my_draft_slot;
const KEEPERS = (DATA.kept_players || []).filter(k => Number(k.team_slot) === MY);
const KR = (LEAGUE.keeper_rules || {}).count || 0;
const MGRS = ((DATA.manager_profiles || {}).managers) || {};
const ME = LEAGUE.my_manager_id || null;
const ROOM = Object.keys(MGRS).map(k => MGRS[k])
  .filter(m => m && (!ME || String(m.manager_id) !== String(ME)));

const adpOf = p => (p.adjusted_adp != null ? p.adjusted_adp
  : (p.raw_adp != null ? p.raw_adp : 9999));
const rawOf = p => (p.raw_adp != null ? p.raw_adp : (p.adjusted_adp != null ? p.adjusted_adp : 9999));

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

/* ── THE ARMS ───────────────────────────────────────────────────────────────
 * Each takes the control context and returns a MODIFIED one. Anything not
 * named is identical, which is what makes the difference attributable.
 */
const ARMS = {
  // ── L1 · LEAGUE MECHANICS ────────────────────────────────────────────────
  'L1 starters: 1QB -> superflex': (c) => Object.assign({}, c, {
    league: Object.assign({}, c.league, {
      starters: Object.assign({}, c.league.starters, { QB: 2 }),
    }),
  }),
  'L1 starters: 2WR -> 3WR': (c) => Object.assign({}, c, {
    league: Object.assign({}, c.league, {
      starters: Object.assign({}, c.league.starters, { WR: 3 }),
    }),
  }),
  'L1 keepers: 3 -> none': (c) => Object.assign({}, c, {
    league: Object.assign({}, c.league, { keeper_rules: {} }),
  }),
  'L1 teams: 10 -> 12': (c) => Object.assign({}, c, {
    league: Object.assign({}, c.league, { teams: 12 }),
  }),

  // ── L2 · MARKET MISMATCH ─────────────────────────────────────────────────
  // Our board adjusts the public ADP. Does the adjustment ever change a pick,
  // or are we paying for a correction nobody sees?
  'L2 ADP: our adjustment -> raw public': (c) => Object.assign({}, c, {
    board: c.board.map(p => Object.assign({}, p, { adjusted_adp: rawOf(p) })),
  }),

  // ── L3 · ROOM BEHAVIOUR ──────────────────────────────────────────────────
  'L3 room mixture: measured -> off': (c) => Object.assign({}, c, {
    intervening: (c.intervening || []).map(w => Object.assign({}, w, { room: null })),
  }),
  'L3 manager profiles: mapped -> none': (c) => Object.assign({}, c, {
    intervening: (c.intervening || []).map(w => Object.assign({}, w, { profile: null })),
  }),

  // ── L4 · CURRENT DRAFT STATE ─────────────────────────────────────────────
  // What the nine seats have ALREADY taken. If emptying every opponent roster
  // does not move a pick, the tool is not reading the room it is sitting in.
  'L4 opponent rosters: real -> empty': (c) => Object.assign({}, c, {
    intervening: (c.intervening || []).map(w => Object.assign({}, w, { roster: [] })),
  }),
  // The window between my picks IS the draft-position mechanic. A fixed
  // 9-pick window ignores the snake.
  'L4 my next pick: real -> +9 always': (c) => Object.assign({}, c, {
    nextPick: c.currentPick + 9,
  }),
};

function simulate(seed, armName) {
  const rand = rng(seed);
  const pool = DATA.players.filter(p => p.position && p.proj_mean != null);
  const gone = new Set(KEEPERS.map(k => String(k.player_id)));
  const roster = KEEPERS.map(k => Object.assign({}, k, { is_keeper: true }));
  const mine = new Set(myPicks());
  const opp = {}; for (let s = 1; s <= TEAMS; s++) opp[s] = [];
  // A stable seating so the profile arm is comparable across drafts.
  const seatOf = {};
  { let i = 0; for (let s = 1; s <= TEAMS; s++) if (s !== MY) seatOf[s] = ROOM[i++ % (ROOM.length || 1)] || null; }
  const out = [];

  for (let o = 1; o <= TEAMS * ROUNDS; o++) {
    const board = pool.filter(p => !gone.has(String(p.player_id)));
    if (!board.length) break;
    if (!mine.has(o)) {
      const top = board.slice().sort((a, b) => adpOf(a) - adpOf(b)).slice(0, 8);
      const pick = top[Math.min(top.length - 1, Math.floor(rand() * rand() * top.length))];
      if (!pick) break;
      gone.add(String(pick.player_id)); opp[slotOf(o)].push(pick); continue;
    }
    const nx = [...mine].filter(x => x > o).sort((a, b) => a - b)[0] || null;
    const win = [];
    if (nx) for (let q = o; q < nx; q++) {
      const s = slotOf(q);
      if (s !== MY) win.push({ team_slot: s, pick_no: q, roster: opp[s], profile: seatOf[s], room: ROOM });
    }
    const control = {
      board: board, roster: roster, league: LEAGUE, weights: E.MEASURED_WEIGHTS,
      currentPick: o, nextPick: nx, totalPicks: TEAMS * ROUNDS,
      myPicksLeft: [...mine].filter(x => x >= o).length,
      roundsLeft: ROUNDS - Math.ceil(o / TEAMS) + 1, runMultipliers: {}, intervening: win,
    };
    // FRESH CONTEXTS PER ARM. The engine memoises survival onto the object it
    // is handed; a shared ctx serves the arm the control's answers and the
    // whole tool reports zero — the failure that looks exactly like a true null.
    const fresh = c => Object.assign({}, c, {
      intervening: (c.intervening || []).map(w => Object.assign({}, w)),
      board: c.board.slice(),
    });
    let a, b;
    try {
      a = E.recommend(fresh(control));
      b = E.recommend(fresh(ARMS[armName](control)));
    } catch (e) { break; }
    if (!a || !a.length || !b || !b.length) break;
    out.push({ round: Math.ceil(o / TEAMS), control: a[0].player, arm: b[0].player });
    gone.add(String(a[0].player.player_id));
    roster.push(a[0].player); opp[MY].push(a[0].player);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────── report
const nDrafts = Number(process.argv[2] || 6);
const same = (x, y) => String(x.player_id) === String(y.player_id);

console.log('='.repeat(76));
console.log('DECISION SENSITIVITY — can each league-specific input change the pick?');
console.log('='.repeat(76));
console.log(`${nDrafts} drafts x ${ROUNDS - KR} of my picks, seat ${MY}, MEASURED_WEIGHTS.`);
console.log('Category 2 = consumed but functionally irrelevant. Category 3 = can move the');
console.log('recommendation. The bar between them is stated here, before the run: an input');
console.log('that moves under 5% of picks is CATEGORY 2 — it is wired and it is not deciding.');
console.log('');

const results = [];
Object.keys(ARMS).forEach(name => {
  let n = 0, moved = 0;
  const byRound = {};
  for (let d = 0; d < nDrafts; d++) {
    simulate(4100 + d * 104729, name).forEach(r => {
      n++;
      if (!same(r.control, r.arm)) { moved++; byRound[r.round] = (byRound[r.round] || 0) + 1; }
    });
  }
  const pc = n ? 100 * moved / n : 0;
  results.push({ name, moved, n, pc, byRound });
  const cat = pc === 0 ? 'CAT 2 — INERT' : pc < 5 ? 'CAT 2 — near-inert' : 'CAT 3 — can decide';
  console.log(`${name.padEnd(38)} ${String(moved).padStart(3)}/${String(n).padEnd(4)} `
    + `${pc.toFixed(1).padStart(5)}%   ${cat}`);
});

console.log('');
console.log('── WHERE THE LIVE ONES BITE ' + '─'.repeat(48));
results.filter(r => r.pc >= 5).forEach(r => {
  const rounds = Object.keys(r.byRound).map(Number).sort((a, b) => a - b);
  console.log(`  ${r.name}: rounds ${rounds.join(',')}`);
});
const inert = results.filter(r => r.pc < 5).map(r => r.name);
if (inert.length) {
  console.log('');
  console.log('── CONSUMED AND NOT DECIDING ' + '─'.repeat(47));
  inert.forEach(n => console.log('  ' + n));
}
