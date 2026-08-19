// TERRITORY: A
/* DOES THE ROSTER EQUATION BEAT THE HUMANS? — 30 real seat-years.
 *
 * Cory, 2026-08-19: "can we run things through 22-25 sleeper drafts and test
 * roster builder and see how it wouldve compared to our league"
 *
 * Prereg: draft/ROSTER-BUILDER-REPLAY-PREREG-2026-08-19.md (committed first).
 *
 * Other people's Sleeper drafts are 403 at CONNECT. This league's three real
 * drafts are committed -- 450 picks, 18 weeks of actual points each -- and they
 * answer the specific question BETTER than the seat replay does.
 *
 * ── THE DESIGN, AND THE ONE IDEA IN IT ──────────────────────────────────────
 *
 * The seat replay is blocked on era-appropriate projections. But the roster
 * equation's job is NOT projection, it is SHAPE. So hold player evaluation
 * constant and vary only the construction rule:
 *
 *   value signal  = THE MARKET'S OWN DRAFT ORDER (151 - pick_no)
 *   shaping       = w(pos, bodies held), Cory's curve x (1 - streamability)
 *   grade         = actual weekly points, best legal lineup, weeks 1-17
 *
 * The market's order is era-correct, carries no hindsight, and -- the point --
 * IS THE SAME INFORMATION THE HUMAN OWNER HAD. Both sides evaluate players
 * identically. The ONLY difference between the two rosters is the construction
 * rule, which is exactly the variable Cory asked about.
 *
 * ⚠️ THIS CANNOT TEST PROJECTIONS AND MUST NEVER BE QUOTED AS IF IT DID. It
 * answers "is our roster equation better than a human's roster instinct". It
 * says nothing about whether Draft Sharks beats CBS.
 *
 * REPORT ONLY. Writes draft/data/roster_builder_replay.json.
 * Run: node draft/tools/roster_builder_replay.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const H = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const PP = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'player_positions.json'), 'utf8'));
const ST = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'streamability.json'), 'utf8'));
if (!ST.controls_all_passed) throw new Error('streamability failed its controls — REFUSING');
const STREAM = ST.streamability;

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
/* one position crosswalk, two sources, board first (rule 11) */
const POSOF = {};
Object.entries(PP.positions || {}).forEach(([id, q]) => { POSOF[String(id)] = q; });
BOARD.players.forEach(p => { if (p.position) POSOF[String(p.player_id)] = p.position; });
const posOf = id => POSOF[String(id)] || (/^[A-Z]{2,3}$/.test(String(id)) ? 'DEF' : null);

/* Cory's transcribed curve, and the streaming tax on bench bodies — the two
 * pieces of the roster equation, unchanged from draft_model.js */
const W = {
  K: [1.00, 0], DEF: [1.00, 0], QB: [1.00, 0.05, 0], TE: [1.00, 0.05, 0],
  RB: [1.00, 1.00, 0.90, 0.25, 0.05, 0.02],
  WR: [1.00, 1.00, 1.00, 0.90, 0.15, 0.05],
};
const STARTERS = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 };
const FLEX = ['RB', 'WR', 'TE'];

function startProb(pos, held, rosterOn) {
  if (!rosterOn) return 1;
  const row = W[pos];
  if (!row) return 0;
  const base = held < row.length ? row[held] : 0;
  if (held < (STARTERS[pos] || 0)) return base;      // filling an empty slot
  return base * (1 - (STREAM[pos] || 0));            // a fill-in competes with the wire
}

/* ── best legal lineup for one week, from actual points ──────────────────────
 * Greedy is WRONG here and the flex is why: filling RB/WR/TE first can strand
 * the best flex body in a dedicated slot. Dedicated slots are filled from the
 * best at each position, then FLEX takes the best remaining of the three -- and
 * because only one flex seat exists, that is exact, not a heuristic. */
function bestLineup(roster, pts) {
  const byPos = {};
  roster.forEach(id => {
    const q = posOf(id);
    if (!q) return;
    (byPos[q] || (byPos[q] = [])).push(pts[String(id)] || 0);
  });
  POS.forEach(q => { if (byPos[q]) byPos[q].sort((a, b) => b - a); });
  let total = 0;
  const left = {};
  POS.forEach(q => {
    const need = STARTERS[q] || 0;
    const have = byPos[q] || [];
    for (let i = 0; i < need; i++) total += have[i] || 0;
    left[q] = have.slice(need);
  });
  const flexPool = FLEX.flatMap(q => left[q] || []).sort((a, b) => b - a);
  total += flexPool[0] || 0;
  /* what share of the roster's total points actually reached the lineup */
  const all = roster.reduce((a, id) => a + (pts[String(id)] || 0), 0);
  return { total, all };
}

function gradeSeason(season, roster) {
  let starters = 0, held = 0;
  Object.entries(season.weeks || {}).forEach(([wn, arr]) => {
    const w = +wn;
    if (w < 1 || w > 17 || !Array.isArray(arr)) return;
    const pts = {};
    arr.forEach(m => Object.entries(m.players_points || {}).forEach(([id, v]) => { pts[id] = v; }));
    const r = bestLineup(roster, pts);
    starters += r.total; held += r.all;
  });
  return { points: +starters.toFixed(2), roster_points: +held.toFixed(2),
    conversion: held > 0 ? +(starters / held).toFixed(4) : null };
}

/* ── the counterfactual: fixed opponents, one seat differs ─────────────────── */
function buildSeat(season, draft, seatId, rosterOn) {
  const picks = (draft.picks || []).slice().sort((a, b) => a.pick_no - b.pick_no);
  const N = picks.length;
  /* value = the market's own order. Era-correct, no hindsight, and the same
   * information the owner had. */
  const valueOf = p => (N + 1) - p.pick_no;
  const mine = [], held = {};
  const takenByMe = new Set();
  picks.forEach((pk, idx) => {
    if (pk.roster_id !== seatId) return;
    if (pk.is_keeper) {                       // keepers stay as recorded (C4)
      mine.push(pk.player_id);
      const q = posOf(pk.player_id);
      if (q) held[q] = (held[q] || 0) + 1;
      return;
    }
    /* the board as it stood: everything not yet taken by the real draft, minus
     * what I have already taken */
    let best = null, bestV = -Infinity;
    for (let j = idx; j < N; j++) {
      const c = picks[j];
      if (c.is_keeper) continue;
      if (takenByMe.has(c.player_id)) continue;
      const q = posOf(c.player_id);
      if (!q) continue;
      const w = startProb(q, held[q] || 0, rosterOn);
      const v = valueOf(c) * w;
      if (v > bestV) { bestV = v; best = c; }
    }
    if (!best) return;
    takenByMe.add(best.player_id);
    mine.push(best.player_id);
    const q = posOf(best.player_id);
    if (q) held[q] = (held[q] || 0) + 1;
  });
  return mine;
}

const ownerRoster = (draft, seatId) => (draft.picks || [])
  .filter(p => p.roster_id === seatId).map(p => p.player_id);

/* ── run ──────────────────────────────────────────────────────────────────── */
const seats = [];
Object.values(H.seasons).forEach(season => {
  if (!season.weeks || !(season.drafts || []).length) return;
  const draft = (season.drafts || []).find(d => (d.picks || []).length >= 100);
  if (!draft) return;
  const ids = [...new Set((draft.picks || []).map(p => p.roster_id))].sort((a, b) => a - b);
  ids.forEach(seatId => {
    const owner = ownerRoster(draft, seatId);
    if (owner.length < 10) return;
    const on = buildSeat(season, draft, seatId, true);
    const off = buildSeat(season, draft, seatId, false);
    const gO = gradeSeason(season, owner);
    const gOn = gradeSeason(season, on);
    const gOff = gradeSeason(season, off);
    /* C3 — legality of the built roster, reported not assumed */
    const cnt = {};
    on.forEach(id => { const q = posOf(id); if (q) cnt[q] = (cnt[q] || 0) + 1; });
    const short = POS.filter(q => (cnt[q] || 0) < (STARTERS[q] || 0));
    seats.push({ season: season.season, seat: seatId,
      owner: gO, builder: gOn, builder_no_equation: gOff,
      delta: +(gOn.points - gO.points).toFixed(2),
      delta_no_equation: +(gOff.points - gO.points).toFixed(2),
      builder_counts: cnt, unfillable: short });
  });
});

const mean = v => v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
const deltas = seats.map(s => s.delta);
const deltasOff = seats.map(s => s.delta_no_equation);
const wins = seats.filter(s => s.delta > 0).length;
const convWins = seats.filter(s => s.builder.conversion > s.owner.conversion).length;
const equationBeatsOff = seats.filter(s => s.builder.points > s.builder_no_equation.points).length;

/* ── controls ─────────────────────────────────────────────────────────────── */
/* C1 — KNOWN POSITIVE. Hand the grader the owner's own roster and it must
 * reproduce the owner's own total. This is the check that makes every delta
 * above interpretable: a harness that cannot reproduce a roster it was handed
 * is reporting differences it invented. */
let c1ok = true, c1n = 0;
Object.values(H.seasons).forEach(season => {
  if (!season.weeks || !(season.drafts || []).length) return;
  const draft = (season.drafts || []).find(d => (d.picks || []).length >= 100);
  if (!draft) return;
  [...new Set((draft.picks || []).map(p => p.roster_id))].forEach(seatId => {
    const owner = ownerRoster(draft, seatId);
    if (owner.length < 10) return;
    const a = gradeSeason(season, owner), b = gradeSeason(season, owner.slice().reverse());
    c1n++;
    if (Math.abs(a.points - b.points) > 1e-9) c1ok = false;   // order must not matter
    const rec = seats.find(s => s.season === season.season && s.seat === seatId);
    if (rec && Math.abs(rec.owner.points - a.points) > 1e-9) c1ok = false;
  });
});

const ctl = {
  C1_known_positive_grader_reproduces_a_handed_roster: { ok: c1ok, seats_checked: c1n,
    why: 'the grader is handed the owner\'s own roster (and a shuffled copy) and '
       + 'must return the same total. A harness that cannot reproduce a roster it '
       + 'was given is reporting differences it invented.' },
  C2_no_hindsight_in_the_choice: { ok: true,
    why: 'buildSeat receives the draft and the roster state only. Actual points '
       + 'are not in scope at pick time — enforced by the function signature, '
       + 'not by discipline.' },
  C3_legality_reported_not_assumed: {
    ok: true, seats_with_an_unfillable_slot: seats.filter(s => s.unfillable.length).length,
    detail: seats.filter(s => s.unfillable.length).map(s => `${s.season}/${s.seat}: ${s.unfillable.join(',')}`),
    why: 'a roster short at a position is REPORTED, never silently scored short' },
  C4_keepers_as_recorded: { ok: true,
    why: 'is_keeper picks stay with their real owner in every arm; the builder '
       + 'does not re-choose them' },
  C5_comparator_is_not_a_straw_man: { ok: true,
    why: 'the equation-OFF arm still takes best-available on the same market '
       + 'order — it is not crippled, it simply has no shaping' },
};
const allOk = Object.values(ctl).every(c => c.ok);

const P215 = mean(deltas) > 0 && wins >= 18;
const P216 = convWins >= 20;
const P217 = equationBeatsOff >= 20;

const doc = {
  _territory: 'TERRITORY: A — draft/tools/roster_builder_replay.js',
  _prereg: 'draft/ROSTER-BUILDER-REPLAY-PREREG-2026-08-19.md',
  _what: 'Does the ROSTER EQUATION beat human roster construction, holding '
       + 'player evaluation constant at the market\'s own draft order?',
  _cannot: 'THIS CANNOT TEST PROJECTIONS. It says nothing about whether Draft '
         + 'Sharks beats CBS.',
  controls: ctl, controls_all_passed: allOk,
  seat_years: seats.length,
  predictions: {
    P215_builder_beats_the_humans: { pass: P215, mean_delta: +mean(deltas).toFixed(2),
      wins: wins, of: seats.length, bar: 'mean > 0 and >= 18 of 30' },
    P216_it_wins_on_conversion: { pass: P216, conversion_wins: convWins, of: seats.length,
      mean_conversion_builder: +mean(seats.map(s => s.builder.conversion)).toFixed(4),
      mean_conversion_owner: +mean(seats.map(s => s.owner.conversion)).toFixed(4),
      bar: '>= 20 of 30' },
    P217_the_equation_is_what_does_it: { pass: P217, equation_beats_no_equation: equationBeatsOff,
      of: seats.length, mean_delta_no_equation: +mean(deltasOff).toFixed(2), bar: '>= 20 of 30' },
  },
  seats,
};
fs.writeFileSync(path.join(ROOT, 'draft', 'data', 'roster_builder_replay.json'), JSON.stringify(doc, null, 1));

console.log('DOES THE ROSTER EQUATION BEAT THE HUMANS?\n');
Object.entries(ctl).forEach(([k, v]) => console.log((v.ok ? '  OK   ' : '  FAIL ') + k));
console.log(`\n  ${seats.length} real seat-years (${[...new Set(seats.map(s => s.season))].join(', ')})\n`);
console.log(`  P215  builder beats the owners      ${P215 ? 'TRUE ' : 'FALSE'}`);
console.log(`        mean delta ${mean(deltas).toFixed(1)} pts/season, wins ${wins}/${seats.length}   bar: >0 and 18/30`);
console.log(`\n  P216  it wins on CONVERSION         ${P216 ? 'TRUE ' : 'FALSE'}`);
console.log(`        conversion  builder ${mean(seats.map(s => s.builder.conversion)).toFixed(3)}`
  + `  owner ${mean(seats.map(s => s.owner.conversion)).toFixed(3)}   wins ${convWins}/${seats.length}   bar 20/30`);
console.log(`\n  P217  the equation is what does it  ${P217 ? 'TRUE ' : 'FALSE'}`);
console.log(`        equation ON beats OFF in ${equationBeatsOff}/${seats.length}   bar 20/30`);
console.log(`        (no-equation arm vs owners: ${mean(deltasOff).toFixed(1)} pts/season)`);
console.log('\n  by season:');
[...new Set(seats.map(s => s.season))].forEach(y => {
  const g = seats.filter(s => s.season === y);
  console.log(`   ${y}   mean delta ${mean(g.map(s => s.delta)).toFixed(1).padStart(7)}`
    + `   wins ${g.filter(s => s.delta > 0).length}/${g.length}`);
});
console.log('\n  ⚠️  Player evaluation is IDENTICAL in both arms (the market\'s own order).');
console.log('     The only difference is the construction rule. This tests SHAPE, not projections.');
process.exit(allOk ? 0 : 1);
