/* THE IN-SEASON SANITY SWEEP — does the LINEUP optimizer give advice a competent
 * manager could act on, every week, without a human catching a nonsense call?
 *
 * WHY THIS LAYER EXISTS. sanity-sweep.test.js does this for the DRAFT recommender
 * (E.recommend): it sweeps hundreds of roster states and asserts construction
 * sense. Nothing did the same for the IN-SEASON recommender — the thing that says
 * "start X over Y this week", the surface Cory reads every Sunday for four months.
 * L0 measured that surface as worth more than the draft edge ($520-637.50/team/season
 * left on the bench, corrected 2026-08-15 — see EFFICIENCY-LEAK.md), so it deserves
 * at least the same rigor. This is that layer.
 *
 * It runs the real solver (src/routes/lineup.js: bestLineup + optimize) over EVERY
 * real team-week in the 2023-25 harvest, using each week's actual player scores as
 * the projections — the same replay path the proof page is validated on. For every
 * one it asserts the invariants that must hold before the first live Sunday:
 *
 *   LEGAL        the recommended lineup fills exactly the roster template — each
 *                dedicated slot to its count with a position-eligible player, one
 *                FLEX from a flex-eligible position, nothing over-filled, and no
 *                slot left empty while an eligible player sits on the bench
 *                (a "legal" lineup that benches a startable player is not optimal
 *                and not what a manager would accept).
 *   ROSTERABLE   every player named — in the lineup AND in every start/sit call —
 *                is actually on the roster. The tool may never invent a player.
 *   NO-DUP       no player is seated in two slots at once.
 *   CALLS-LEGAL  every "start X over Y" swaps within a slot X is eligible for.
 *
 * THE BYE / INJURY BLINDNESS — reported loudly, and now guarded. The solver is
 * projection-driven and has no calendar: it correctly benches a ZERO-projection
 * player, but it will happily start a player on bye or ruled OUT if something
 * upstream hands him a positive projection — which the live path's season-average
 * and last-week fallbacks do. That is a real, current hole. lineup.activeProjection
 * closes it by zeroing a not-playing player before the solver sees him; the cases
 * below both DEMONSTRATE the hole (unguarded) and PROVE the guard shuts it.
 *
 * Run: node draft/tests/lineup_sanity.test.js
 */
'use strict';
const LO = require('../../src/routes/lineup.js');

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d ? '\n        ' + d : '')); } };

const SLOTS = LO.DEFAULT_SLOTS;                 // { QB:1, RB:2, WR:2, TE:1, FLEX:1, K:1, DEF:1 }
const FLEX = LO.FLEX_ELIGIBLE;                  // Set(['RB','WR','TE'])
const DEDICATED = Object.keys(SLOTS).filter(s => s !== 'FLEX');

// --- the invariant checker (shared by bestLineup + optimize outputs) ---------
// Given the seated starters, the position map, and the roster's id set, return
// the list of violations (empty === legal). `posById` decides eligibility exactly
// as the solver does, so the check speaks the solver's own language.
function violationsOf(starters, posById, rosterSet) {
  const v = [];
  const seen = new Set();
  const bySlot = {};
  for (const s of starters) {
    bySlot[s.slot] = (bySlot[s.slot] || 0) + 1;
    // ROSTERABLE
    if (!rosterSet.has(String(s.pid))) v.push('UNROSTERABLE:' + s.pid);
    // NO-DUP
    if (seen.has(String(s.pid))) v.push('DUP:' + s.pid); else seen.add(String(s.pid));
    // slot eligibility
    const pos = posById[String(s.pid)];
    if (s.slot === 'FLEX') { if (!FLEX.has(pos)) v.push('FLEX_INELIGIBLE:' + pos); }
    else if (pos !== s.slot) v.push('WRONG_SLOT:' + pos + '->' + s.slot);
  }
  // over-fill
  for (const [slot, n] of Object.entries(bySlot)) {
    if (n > (SLOTS[slot] || 0)) v.push('OVERFILL:' + slot + '=' + n);
  }
  // MAXIMALITY — a dedicated slot left short while an unused eligible player exists
  // on the roster is an illegal (incomplete) lineup. Same for the FLEX.
  const usedIds = new Set(starters.map(s => String(s.pid)));
  const availByPos = {};
  for (const id of rosterSet) {
    if (usedIds.has(id)) continue;
    const p = posById[id];
    if (p) availByPos[p] = (availByPos[p] || 0) + 1;
  }
  for (const slot of DEDICATED) {
    const have = bySlot[slot] || 0;
    if (have < SLOTS[slot] && (availByPos[slot] || 0) > 0) v.push('SLOT_SHORT:' + slot);
  }
  const flexHave = bySlot.FLEX || 0;
  if (flexHave < (SLOTS.FLEX || 0)) {
    const spareFlex = [...FLEX].some(p => (availByPos[p] || 0) > 0);
    if (spareFlex) v.push('FLEX_SHORT');
  }
  return v;
}

// ---------------------------------------------------------------- the sweep
const history = LO.harvest();
const seasons = LO.defaultSeasons(history);
const band = LO.weeklyHighBand(history, seasons);
const sigmaByPos = LO.positionSigmas(history, seasons);

let states = 0, callStates = 0;
const bestViol = [], optViol = [], callViol = [];

for (const season of seasons) {
  const s = LO.seasonOf(history, season);
  if (!s) continue;
  const posById = LO.inferPositions(s);
  for (const [wk, entries] of Object.entries(s.weeks || {})) {
    for (const e of (entries || [])) {
      const pts = {};
      for (const [pid, val] of Object.entries(e.players_points || {})) pts[String(pid)] = Number(val || 0);
      const rosterIds = Object.keys(pts);
      if (rosterIds.length < 9) continue;                 // not a full roster-week
      const rosterSet = new Set(rosterIds);
      states++;

      // (1) bestLineup — the E[points] optimum used by the proof/replay path.
      const bl = LO.bestLineup(pts, posById, rosterIds, SLOTS);
      const bv = violationsOf(bl.starters, posById, rosterSet);
      if (bv.length) bestViol.push({ season, wk, rid: e.roster_id, v: bv });

      // (2) optimize — the full dual-objective recommender the manager actually
      // reads, with a real band + opponent. Uses actual points as projections.
      const roster = rosterIds.map(id => ({ id, name: id, pos: posById[id], proj: pts[id] }))
        .filter(r => r.pos);   // players with no inferred position aren't startable
      let opt;
      try { opt = LO.optimize(roster, { band, sigmaByPos, oppMean: band.median, matchupValue: 25 }); }
      catch (err) { optViol.push({ season, wk, rid: e.roster_id, v: ['THREW:' + err.message] }); continue; }
      const ov = violationsOf(opt.lineup.map(s2 => ({ pid: s2.pid, slot: s2.slot })), posById, rosterSet);
      if (ov.length) optViol.push({ season, wk, rid: e.roster_id, v: ov });

      // (3) the priced calls — every named player must be rosterable and each
      // swap must be into a slot the started player is eligible for.
      for (const c of (opt.calls || [])) {
        callStates++;
        const cv = [];
        if (!rosterSet.has(String(c.startId))) cv.push('CALL_START_UNROSTERABLE:' + c.startId);
        if (!rosterSet.has(String(c.sitId))) cv.push('CALL_SIT_UNROSTERABLE:' + c.sitId);
        const sp = posById[String(c.startId)];
        const eligible = c.slot === 'FLEX' ? FLEX.has(sp) : sp === c.slot;
        if (!eligible) cv.push('CALL_INELIGIBLE:' + sp + '->' + c.slot);
        if (cv.length) callViol.push({ season, wk, rid: e.roster_id, v: cv });
      }
    }
  }
}

console.log('swept ' + states + ' real team-weeks across seasons ' + seasons.join('/')
  + ', ' + callStates + ' priced calls');

// NON-VACUITY: a sweep that exercises nothing proves nothing.
check('the sweep actually ran the recommender over real weeks (non-vacuity)',
  states >= 100, 'only ' + states + ' team-weeks swept');
// Calls are RARE in replay by construction: the "projections" here are each
// week's actual points, so the naive highest-projection lineup already equals the
// dual-objective optimum on almost every week. The handful that remain are the
// variance-driven high-chase swaps — enough to exercise the call-legality path.
check('the recommender produced priced start/sit calls to check (non-vacuity)',
  callStates >= 5, 'only ' + callStates + ' calls seen');

const fmt = arr => arr.slice(0, 6).map(x => x.season + ' wk' + x.wk + ' r' + x.rid + ': ' + x.v.join(',')).join('\n        ');
check('bestLineup emits a LEGAL, complete, rosterable lineup on every week',
  bestViol.length === 0, fmt(bestViol));
check('optimize emits a LEGAL, complete, rosterable lineup on every week',
  optViol.length === 0, fmt(optViol));
check('every priced start/sit call names only rosterable, slot-eligible players',
  callViol.length === 0, fmt(callViol));

// ---------------------------------------------------- the guard: bye / injury
// A constructed roster where the position leader BY PROJECTION is not playing.
// Two QBs: the "leader" is on bye/out (season-avg would still project him high),
// the backup is healthy and lower. A WR corps fills the rest so the lineup is legal.
function fixtureRoster() {
  return [
    { id: 'qb_bye', name: 'Bye QB', pos: 'QB', proj: 22, inj: null, bye: 7 },
    { id: 'qb_ok', name: 'Healthy QB', pos: 'QB', proj: 15, inj: null, bye: 9 },
    { id: 'rb1', name: 'RB1', pos: 'RB', proj: 18, bye: 5 },
    { id: 'rb2', name: 'RB2', pos: 'RB', proj: 14, bye: 5 },
    { id: 'rb3', name: 'RB3', pos: 'RB', proj: 10, bye: 6 },
    { id: 'wr1', name: 'WR1', pos: 'WR', proj: 17, bye: 5 },
    { id: 'wr2', name: 'WR2', pos: 'WR', proj: 13, bye: 6 },
    { id: 'wr3', name: 'WR3', pos: 'WR', proj: 11, bye: 7 },
    { id: 'te1', name: 'TE1', pos: 'TE', proj: 9, bye: 8 },
    { id: 'k1', name: 'K1', pos: 'K', proj: 8, bye: 9 },
    { id: 'def1', name: 'DEF1', pos: 'DEF', proj: 7, bye: 10 },
  ];
}
const seated = res => new Set(res.lineup.map(s => String(s.pid)));

// THE HOLE, DEMONSTRATED: unguarded, the on-bye QB carries the higher projection
// and the solver seats him. This is the bug the guard exists to prevent — assert
// it reproduces so the guard test below is not vacuous.
{
  const r = fixtureRoster();
  const res = LO.optimize(r, { band, sigmaByPos, oppMean: band.median });
  check('DEMONSTRATION: unguarded, the solver WOULD seat the on-bye leader (the hole is real)',
    seated(res).has('qb_bye'),
    'expected the higher-projection bye QB to be (wrongly) started without the guard');
}

// THE GUARD, PROVEN: apply activeProjection for week 7 — the bye QB (bye===7) is
// zeroed, the healthy backup is seated instead, and the lineup stays legal.
{
  const r = fixtureRoster().map(p => ({ ...p, proj: LO.activeProjection(p.proj, p, 7) }));
  const res = LO.optimize(r, { band, sigmaByPos, oppMean: band.median });
  const st = seated(res);
  check('GUARD: an on-bye player (bye === week) is never seated',
    !st.has('qb_bye') && st.has('qb_ok'));
  const gv = violationsOf(res.lineup.map(s2 => ({ pid: s2.pid, slot: s2.slot })),
    Object.fromEntries(r.map(p => [String(p.id), p.pos])), new Set(r.map(p => String(p.id))));
  check('GUARD: the guarded lineup is still legal and complete', gv.length === 0, gv.join(','));
}

// THE GUARD, INJURY ARM: a player ruled OUT is zeroed regardless of week.
{
  const r = fixtureRoster();
  r[0] = { ...r[0], bye: 99, inj: 'Out' };                 // not on bye this week, but OUT
  const guarded = r.map(p => ({ ...p, proj: LO.activeProjection(p.proj, p, 7) }));
  const res = LO.optimize(guarded, { band, sigmaByPos, oppMean: band.median });
  check('GUARD: a player ruled OUT is never seated', !seated(res).has('qb_bye') && seated(res).has('qb_ok'));
}

// PREDICATE CHECKS — the guard's own logic, so a green sweep means something.
check('predicate: OUT is inactive', LO.isInactive({ inj: 'Out' }, 3) === true);
check('predicate: IR is inactive', LO.isInactive({ inj: 'IR' }, 3) === true);
check('predicate: Questionable is NOT inactive (uncertainty is priced, not benched)',
  LO.isInactive({ inj: 'Questionable' }, 3) === false);
check('predicate: Doubtful is NOT inactive', LO.isInactive({ inj: 'Doubtful' }, 3) === false);
check('predicate: bye === week is inactive', LO.isInactive({ bye: 5 }, 5) === true);
check('predicate: bye !== week is active', LO.isInactive({ bye: 5 }, 6) === false);
check('predicate: no inj + no bye is active', LO.isInactive({ pos: 'RB' }, 6) === false);
check('activeProjection zeroes an inactive player', LO.activeProjection(20, { inj: 'Out' }, 3) === 0);
check('activeProjection passes an active player through', LO.activeProjection(20, { inj: null }, 3) === 20);

console.log(`\n${pass}/${pass + fail} lineup-sanity checks passed`);
process.exit(fail ? 1 : 0);
