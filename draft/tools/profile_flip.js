/* DOES THE OPPONENT DOSSIER MOVE MY PICKS? — the flip diagnostic.
 *
 * THE QUESTION, asked because the panel looked inert. The war room shows
 * per-manager tendencies built from 468 real picks across three drafts, and the
 * survival panel three inches below shows the SAME position mix at every seat.
 * Before building anything, establish which of two different problems this is:
 * profiles that never reach the model, or profiles that reach it and change
 * nothing.
 *
 * WHAT THE CODE ACTUALLY DOES (established before this tool ran, by reading the
 * seam rather than the screen):
 *
 *   · `positionProbabilities` — the layer that produces the RB 45 / WR 36 / TE 11
 *     mix — reads `team.profile` and NOTHING ELSE. Its two dials are the seat's
 *     softmax alpha_need / beta_value.
 *   · `app.js profileForSlot()` returns null for every seat until
 *     `state.profilesMappedFromDraft` is true, which `importDraftOrder` sets only
 *     once the LIVE draft object maps uids to seats. That is deliberate: the
 *     artifact's profiles carry no draft_slot (0 of 10), so the only alternative
 *     is an order-fallback that would put a real manager's tendencies on an
 *     arbitrary seat.
 *   · so today every seat's alpha/beta are CFG defaults, and the mix is
 *     identical at every seat BY CONSTRUCTION, not by coincidence.
 *   · `team.room` — the measured room mixture — IS consumed, but only by
 *     `withinFromPool`, the WHICH-PLAYER-within-a-position layer. It is the same
 *     mixture at every seat, so it cannot differentiate seats either.
 *
 * So: wired, gated, and inert at the position layer. Not unwired.
 *
 * WHAT THIS TOOL MEASURES. Three arms at the SAME decision points:
 *   generic  intervening seats carry no profile and no room  (true league-average)
 *   room     no profile, room mixture supplied               (WHAT SHIPS TODAY)
 *   mapped   each seat carries a real manager's profile      (draft-day state)
 *
 * FIXED STATE, NOT FREE RUN. Both arms are evaluated at identical board states.
 * If each arm drafted its own team the boards would diverge after the first
 * disagreement and every later difference would measure the divergence rather
 * than the profiles. The trajectory is driven by the `room` arm because that is
 * the status quo; the choice is stated because it is a choice.
 *
 * THE MAPPING IS UNKNOWN AND THAT IS PART OF THE ANSWER. Which manager sits in
 * which seat is not decided until the draft order is assigned — it moved twice
 * on 2026-08-11 alone. So `mapped` is run over many random permutations and the
 * result is a DISTRIBUTION, not a number. A headline that quoted one permutation
 * would be quoting a coin flip.
 *
 * Run: node draft/tools/profile_flip.js [drafts] [permutations]
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
const MY_SLOT = LEAGUE.my_draft_slot;
const KEEPERS = (DATA.kept_players || []).filter(k => Number(k.team_slot) === MY_SLOT);
const KEEPER_ROUNDS = (LEAGUE.keeper_rules || {}).count || 0;

const MGRS = ((DATA.manager_profiles || {}).managers) || {};
const ME = LEAGUE.my_manager_id || null;
// My own profile is in the set and never picks against me. Leaving it in would
// model the room as 10% Cory and dilute the opponents — same exclusion app.js
// makes in roomProfiles().
const ROOM = Object.keys(MGRS).map(k => MGRS[k])
  .filter(m => m && (!ME || String(m.manager_id) !== String(ME)));

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const adpOf = p => (p.adjusted_adp != null ? p.adjusted_adp
  : (p.raw_adp != null ? p.raw_adp : 9999));

function myPicks() {
  const out = [];
  for (let r = 1; r <= ROUNDS; r++) {
    const idx = (r % 2 === 1) ? MY_SLOT : (TEAMS - MY_SLOT + 1);
    out.push((r - 1) * TEAMS + idx);
  }
  return out.slice(KEEPER_ROUNDS);
}

/** slot -> profile, for one shuffled seating of the nine opponents. */
function seating(rand) {
  const slots = [];
  for (let s = 1; s <= TEAMS; s++) if (s !== MY_SLOT) slots.push(s);
  const pool = ROOM.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  const map = {};
  slots.forEach((s, i) => { map[s] = pool[i % pool.length] || null; });
  return map;
}

/** One simulated draft. Returns per-my-pick comparisons across the three arms. */
function simulate(seed, seat) {
  const rand = rng(seed);
  const pool = DATA.players.filter(p => p.position && p.proj_mean != null);
  const gone = new Set(KEEPERS.map(k => String(k.player_id)));
  const roster = KEEPERS.map(k => Object.assign({}, k, { is_keeper: true }));
  const mine = new Set(myPicks());
  // Opponent rosters, per slot — positionProbabilities needs them for the need
  // term, and an empty roster makes every seat look maximally needy at once.
  const oppRosters = {};
  for (let s = 1; s <= TEAMS; s++) oppRosters[s] = [];
  const slotOf = overall => {
    const r = Math.ceil(overall / TEAMS);
    const i = overall - (r - 1) * TEAMS;
    return (r % 2 === 1) ? i : (TEAMS - i + 1);
  };
  const out = [];

  for (let overall = 1; overall <= TEAMS * ROUNDS; overall++) {
    const board = pool.filter(p => !gone.has(String(p.player_id)));
    if (!board.length) break;

    if (!mine.has(overall)) {
      const top = board.slice().sort((a, b) => adpOf(a) - adpOf(b)).slice(0, 8);
      const pick = top[Math.min(top.length - 1, Math.floor(rand() * rand() * top.length))];
      if (!pick) break;
      gone.add(String(pick.player_id));
      oppRosters[slotOf(overall)].push(pick);
      continue;
    }

    const nextMine = [...mine].filter(x => x > overall).sort((a, b) => a - b)[0] || null;

    // The window app.js builds: [currentPick, myNextTurn) minus my own seat.
    const window = [];
    if (nextMine) {
      for (let o = overall; o < nextMine; o++) {
        const s = slotOf(o);
        if (s === MY_SLOT) continue;
        window.push({ team_slot: s, pick_no: o, roster: oppRosters[s] });
      }
    }
    const arms = {
      generic: window.map(w => Object.assign({}, w, { profile: null, room: null })),
      room: window.map(w => Object.assign({}, w, { profile: null, room: ROOM })),
      mapped: window.map(w => Object.assign({}, w, { profile: seat[w.team_slot] || null, room: null })),
    };

    const base = {
      board: board,
      roster: roster,
      league: LEAGUE,
      weights: E.MEASURED_WEIGHTS,
      currentPick: overall,
      nextPick: nextMine,
      totalPicks: TEAMS * ROUNDS,
      myPicksLeft: [...mine].filter(x => x >= overall).length,
      roundsLeft: ROUNDS - Math.ceil(overall / TEAMS) + 1,
      runMultipliers: {},
    };

    const top = {};
    let died = false;
    Object.keys(arms).forEach(arm => {
      let scored;
      // A fresh ctx per arm: the engine memoises survival onto the object it is
      // given, and a shared ctx would serve arm two the answers computed for
      // arm one — the flip would then measure nothing and report zero, which is
      // the failure mode that looks exactly like a true null.
      try { scored = E.recommend(Object.assign({}, base, { intervening: arms[arm] })); }
      catch (e) { died = true; return; }
      if (!scored || !scored.length) { died = true; return; }
      top[arm] = scored[0];
    });
    if (died) break;

    out.push({
      overall: overall,
      round: Math.ceil(overall / TEAMS),
      generic: top.generic.player,
      room: top.room.player,
      mapped: top.mapped.player,
      // Score gap to the runner-up under the shipping arm: a flip on a
      // hair-thin gap is not the same event as a flip on a clear one.
      gap: top.room.gap_to_second == null ? null : Number(top.room.gap_to_second),
    });

    // The trajectory follows the SHIPPING arm.
    gone.add(String(top.room.player.player_id));
    roster.push(top.room.player);
    oppRosters[MY_SLOT].push(top.room.player);
  }
  return out;
}

// ---------------------------------------------------------------- report
const nDrafts = Number(process.argv[2] || 12);
const nPerms = Number(process.argv[3] || 8);

const rows = [];
for (let d = 0; d < nDrafts; d++) {
  for (let q = 0; q < nPerms; q++) {
    const seat = seating(rng(90001 + q * 7919));
    simulate(2000 + d * 104729, seat).forEach(r => rows.push(
      Object.assign({ draft: d, perm: q }, r)));
  }
}

const same = (a, b) => String(a.player_id) === String(b.player_id);
const nMovedMapped = rows.filter(r => !same(r.room, r.mapped)).length;
const nMovedRoom = rows.filter(r => !same(r.generic, r.room)).length;
const nMovedBoth = rows.filter(r => !same(r.generic, r.mapped)).length;

const byRun = {};
rows.forEach(r => {
  const k = r.draft + ':' + r.perm;
  byRun[k] = byRun[k] || { n: 0, moved: 0 };
  byRun[k].n++;
  if (!same(r.room, r.mapped)) byRun[k].moved++;
});
const perRun = Object.keys(byRun).map(k => byRun[k].moved);
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const pct = (n, d) => d ? (100 * n / d).toFixed(1) + '%' : 'n/a';

console.log('='.repeat(74));
console.log('DOES THE OPPONENT DOSSIER MOVE MY PICKS?');
console.log('='.repeat(74));
console.log(`${nDrafts} drafts x ${nPerms} seatings · seat ${MY_SLOT} · ${TEAMS}x${ROUNDS}`);
console.log(`${KEEPERS.length} keepers, rounds 1-${KEEPER_ROUNDS} forfeited · `
  + `${rows.length} decisions · ${ROOM.length} opponents profiled`);
console.log('');
console.log('── TOP RECOMMENDATION CHANGED ' + '─'.repeat(44));
console.log(`  shipping (room)  vs mapped profiles : ${nMovedMapped}/${rows.length}  ${pct(nMovedMapped, rows.length)}`);
console.log(`  league-average   vs shipping (room) : ${nMovedRoom}/${rows.length}  ${pct(nMovedRoom, rows.length)}`);
console.log(`  league-average   vs mapped profiles : ${nMovedBoth}/${rows.length}  ${pct(nMovedBoth, rows.length)}`);
console.log('');
console.log(`  picks moved per draft (room -> mapped): mean ${mean(perRun).toFixed(2)}`
  + `, range ${Math.min.apply(null, perRun)}-${Math.max.apply(null, perRun)}`
  + `  over ${perRun.length} runs`);
console.log('');

const moved = rows.filter(r => !same(r.room, r.mapped));
if (moved.length) {
  const byRound = {};
  moved.forEach(r => { byRound[r.round] = (byRound[r.round] || 0) + 1; });
  const tot = {};
  rows.forEach(r => { tot[r.round] = (tot[r.round] || 0) + 1; });
  console.log('── WHERE IT MOVES ' + '─'.repeat(56));
  Object.keys(byRound).map(Number).sort((a, b) => a - b).forEach(rd => {
    console.log(`  round ${String(rd).padStart(2)} : ${byRound[rd]}/${tot[rd]}  ${pct(byRound[rd], tot[rd])}`);
  });
  const gaps = moved.map(r => r.gap).filter(g => g != null);
  if (gaps.length) {
    const s = gaps.slice().sort((a, b) => a - b);
    console.log('');
    console.log(`  score gap to runner-up when it moves: median ${s[Math.floor(s.length / 2)].toFixed(2)}`
      + `, max ${s[s.length - 1].toFixed(2)}`);
    const allGaps = rows.map(r => r.gap).filter(g => g != null).sort((a, b) => a - b);
    console.log(`  ...against ALL decisions             : median `
      + `${allGaps.length ? allGaps[Math.floor(allGaps.length / 2)].toFixed(2) : 'n/a'}`);
  }
  console.log('');
  console.log('── A SAMPLE OF THE DISAGREEMENTS ' + '─'.repeat(41));
  moved.slice(0, 12).forEach(r => {
    console.log(`  r${String(r.round).padStart(2)} p${String(r.overall).padStart(3)}  `
      + `${r.room.name} (${r.room.position})  ->  ${r.mapped.name} (${r.mapped.position})`);
  });
} else {
  console.log('── NOTHING MOVED ' + '─'.repeat(57));
  console.log('  Not one decision changed. Reported as a null, not buried.');
}
