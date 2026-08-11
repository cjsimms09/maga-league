'use strict';
// THE MATCHUP STARTERS PAIRING — the fix for "my QB lined up across from their WR."
//
// The Starters card on /matchup shows two lineups side by side. Sleeper's
// `starters` array for a matchup row is ORDERED BY THE LEAGUE'S STARTING SLOTS
// (QB, RB, RB, WR, WR, TE, FLEX, K, DEF) — the same `roster_positions` order for
// every team in the league. So slot index `i` is the SAME lineup position on both
// sides: pairing my `starters[i]` with the opponent's `starters[i]` is pairing
// QB-against-QB, FLEX-against-FLEX. The old card paired two independently-built
// row lists by array index, which only holds if both lists happen to be sorted
// identically — and they were not, so every number read as untrustworthy on the
// most-watched page in the league during a game.
//
// This assembles the paired rows here, from the raw Sleeper matchup rows, so the
// alignment is guaranteed by construction (a slot label rides on every row so the
// pairing is visible, not just asserted). B owns this: the matchup page is a
// site/in-season surface, imported only by src/routes/member.

// Bench slots never start; everything else in roster_positions is a starting slot,
// in display order.
const BENCH = new Set(['BN', 'IR', 'TAXI']);

// A short, readable label for each starting slot. Unknown slots pass through as-is
// (a new league setting shows its raw Sleeper code rather than being dropped).
const SLOT_LABEL = {
  QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K', DEF: 'DEF',
  FLEX: 'FLEX', WRRB_FLEX: 'FLEX', REC_FLEX: 'W/T', SUPER_FLEX: 'SFLX',
  DL: 'DL', LB: 'LB', DB: 'DB', IDP_FLEX: 'IDP',
};

// The eligible positions a slot can hold — used only to sanity-check that a
// player Sleeper reports in a slot is actually eligible for it (a mismatch means
// the two teams' `starters` arrays are NOT slot-aligned, which would resurrect the
// very bug this module exists to kill, so we surface it rather than trust it).
const SLOT_ELIGIBLE = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], K: ['K'], DEF: ['DEF'],
  FLEX: ['RB', 'WR', 'TE'], WRRB_FLEX: ['RB', 'WR'], REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
};

function startingSlots(rosterPositions) {
  return (rosterPositions || []).filter(s => !BENCH.has(s));
}

const r1 = n => (n == null ? null : Math.round(Number(n) * 10) / 10);

// Team bye weeks, derived in-repo (no dependency on A's projection/roster feed).
// Keyed by season → NFL team → bye week.
const NFL_BYES = require('./nfl_byes.json');

// One side of one slot. An empty pid (Sleeper uses '0' for an unfilled slot)
// renders as a labelled blank rather than a phantom player. `opts` may carry
// { byeMap, weekNo } so the cell can flag a player whose team is off this week —
// the mid-game "why is he at zero" question, answered on the row.
function cell(pid, ptsArr, ptsMap, idx, playersDb, projMap, opts) {
  const id = pid == null ? '' : String(pid);
  if (!id || id === '0') return { name: '', points: null, proj: null, pos: null, empty: true };
  const info = (playersDb && playersDb.players && playersDb.players[id]) || {};
  // Prefer the index-aligned starters_points; fall back to the players_points map.
  let pts = null;
  if (Array.isArray(ptsArr) && ptsArr[idx] != null) pts = Number(ptsArr[idx]);
  else if (ptsMap && ptsMap[id] != null) pts = Number(ptsMap[id]);
  const proj = projMap && projMap[id] != null ? Number(projMap[id]) : null;
  const byeMap = opts && opts.byeMap;
  const byeWeek = byeMap && info.team && byeMap[info.team] != null ? Number(byeMap[info.team]) : null;
  const onBye = byeWeek != null && opts && opts.weekNo != null && byeWeek === Number(opts.weekNo);
  return {
    id,
    name: info.name || id,
    pos: info.pos || null,
    team: info.team || null,
    inj: info.inj || null,
    bye: byeWeek,
    onBye: !!onBye,
    points: r1(pts),
    proj: r1(proj),
    empty: false,
  };
}

// The bye map for a season ({} when the season isn't in the table → bye flags
// simply don't fire, never a wrong flag).
function byeMapFor(season) {
  return (season != null && NFL_BYES[String(season)]) || {};
}

/**
 * Bench players for each side, with points — "who's on my bench and what did
 * they score" (the points-left-on-the-bench question). Bench = roster players
 * not in the starters set; unpaired (the two benches are independent), each
 * sorted by points descending. Carries the same inj/bye flags as the starters.
 *
 * @returns {{me: Array, opp: Array, meTotal: number, oppTotal: number}}
 */
function benchRows(myRow, oppRow, playersDb, opts) {
  const side = row => {
    if (!row) return [];
    const starters = new Set((row.starters || []).map(String));
    const pts = row.players_points || {};
    return (row.players || [])
      .filter(pid => !starters.has(String(pid)))
      .map(pid => cell(pid, null, pts, -1, playersDb, null, opts))
      .filter(c => !c.empty)
      .sort((a, b) => (b.points || 0) - (a.points || 0));
  };
  const me = side(myRow), opp = side(oppRow);
  const tot = arr => Math.round(arr.reduce((s, c) => s + (c.points || 0), 0) * 10) / 10;
  return { me, opp, meTotal: tot(me), oppTotal: tot(opp) };
}

/**
 * Build slot-aligned starter rows for the matchup card.
 *
 * @param {object}   myRow    the viewer's Sleeper matchup row ({starters, starters_points, players_points})
 * @param {object}   oppRow   the opponent's matchup row (may be null pre-lock / bye)
 * @param {string[]} rosterPositions  league roster_positions (BN/IR/TAXI ignored)
 * @param {object}   playersDb  sleeper.players() result ({players: {pid: {name,pos,...}}})
 * @param {object}   [proj]   optional {me:{pid:proj}, opp:{pid:proj}} — A's projections, defensive
 * @returns {{rows: Array, hasProj: boolean, misaligned: boolean}|null}
 */
function pairStarters(myRow, oppRow, rosterPositions, playersDb, proj, opts) {
  if (!myRow) return null;
  const meStart = myRow.starters || [];
  const oppStart = (oppRow && oppRow.starters) || [];
  // Slot order comes from the league template; if it's missing, fall back to the
  // longer starters array so the card still renders (labels blank, pairing by the
  // slot index Sleeper itself uses — still correct, just unlabelled).
  const slots = startingSlots(rosterPositions);
  const n = slots.length || Math.max(meStart.length, oppStart.length);
  const projMe = (proj && proj.me) || null;
  const projOpp = (proj && proj.opp) || null;
  const rows = [];
  let misaligned = false;
  for (let i = 0; i < n; i++) {
    const slotCode = slots[i] || null;
    const me = cell(meStart[i], myRow.starters_points, myRow.players_points, i, playersDb, projMe, opts);
    const opp = cell(oppStart[i], oppRow && oppRow.starters_points, oppRow && oppRow.players_points, i, playersDb, projOpp, opts);
    if (slotCode && SLOT_ELIGIBLE[slotCode]) {
      const ok = c => c.empty || !c.pos || SLOT_ELIGIBLE[slotCode].includes(c.pos);
      if (!ok(me) || !ok(opp)) misaligned = true;   // a real position/slot conflict — do not hide it
    }
    rows.push({ slot: slotCode ? (SLOT_LABEL[slotCode] || slotCode) : '', slotCode, me, opp });
  }
  const hasProj = rows.some(r => r.me.proj != null || r.opp.proj != null);
  return { rows, hasProj, misaligned };
}

// ── THE INJURY FLAG, DERIVED FROM THE SAME SET THE OPTIMIZER USES ───────────
//
// A SCOPE DISAGREEMENT, which is not the dual-maintenance shape. The starters
// card had its own ladder — OUT/IR/SUS red, DOUBTFUL/QUESTIONABLE amber, and
// ANYTHING ELSE falling through to amber — while `lineup.js INACTIVE_INJURY`
// treats nine statuses as "not playing" and zeroes the projection. The two sets
// agreed EXACTLY on the members they shared (OUT, IR, SUS); the card simply did
// not know the other six existed.
//
// So a player on PUP, NA, DNR, COV, RES or DNP rendered as an amber "might
// play" on the starters card while the optimizer had already written him off.
// Two surfaces, same player, contradictory verdicts, mid-game — and a comparator
// asking "do these match?" would have answered yes.
//
// The card now asks the optimizer's set. Statuses that mean "might play" stay
// their own short list here, because that is a genuinely different question
// (degraded, not absent) and no other file owns it.
const LO = require('./routes/lineup');
const MAYBE_INJURY = { DOUBTFUL: 'DBT', D: 'DBT', QUESTIONABLE: 'Q', Q: 'Q' };

/**
 * How to badge one player's availability.
 * @returns { level: 'bye'|'out'|'maybe'|'', text } — level drives the colour,
 *          text is what to show. Empty level means nothing to flag.
 */
function injuryFlag(cell, weekNo) {
  if (!cell || cell.empty) return { level: '', text: '' };
  // Bye first: a player on bye scores zero, and that is the answer to "why is he
  // at zero" before any injury tag matters.
  if (cell.onBye) return { level: 'bye', text: 'BYE' };
  const raw = String(cell.inj || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (!raw) return { level: '', text: '' };
  // ONE SET, not a second list: whatever the optimizer benches, the card calls out.
  if (LO.INACTIVE_INJURY.has(raw)) return { level: 'out', text: raw };
  if (MAYBE_INJURY[raw]) return { level: 'maybe', text: MAYBE_INJURY[raw] };
  // An unrecognised tag is shown verbatim rather than dropped or upgraded — we
  // do not know what it means, and saying so beats guessing "questionable".
  return { level: 'unknown', text: raw };
}

module.exports = { pairStarters, benchRows, byeMapFor, startingSlots, SLOT_LABEL,
                   injuryFlag, MAYBE_INJURY };
