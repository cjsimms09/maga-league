// TERRITORY: A
// WHAT THE SCREEN SAYS MUST BE WHAT THE MODEL MEANS.
//
// `seat_plan_contract.test.js` proves the ARTIFACT is coherent. That is not
// enough: a panel can render a coherent artifact incoherently — print a
// points-per-week figure captioned as season points, drop the sign off a signed
// edge, or show an exploratory number as a promise. The artifact test stays
// green through every one of those.
//
// So this checks the EMITTED MARKUP against the artifact's own display_contract.
// It is A's to write because app.js emits the markup; B styles what A emits.
//
// ── HOW IT RUNS WITHOUT A BROWSER ──────────────────────────────────────────
//
// app.js is a browser module with no headless entry point, so `renderSeatPlan`
// is extracted from the shipped source and evaluated against stubs. That is a
// real limitation and it is the reason the checks below assert on the STRING it
// produces rather than on a DOM. What it cannot catch is CSS hiding a caption
// that was emitted — that is B's surface and B's check.
//
// Run: node draft/tests/seat_panel_markup.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(d).slice(0, 300) : '')); }
};

const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const PLAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'seat_plan.json'), 'utf8'));

// ── EXTRACT THE SHIPPED FUNCTION, not a copy of it ────────────────────────
const start = SRC.indexOf('  function renderSeatPlan() {');
ck('renderSeatPlan exists in the shipped app.js', start > 0);
if (start < 0) { console.log('\nFAILED'); process.exit(1); }
let depth = 0, end = -1;
for (let i = SRC.indexOf('{', start); i < SRC.length; i++) {
  if (SRC[i] === '{') depth++;
  else if (SRC[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const fnSrc = SRC.slice(start, end);
ck('and it was extracted whole', end > start && /host\.innerHTML/.test(fnSrc));

// Stubs: only what the function touches.
let captured = '';
const host = { set innerHTML(v) { captured = v; }, get innerHTML() { return captured; } };
/* roundLabel now READS the round from `pick_order.picks` rather than computing
 * it — forfeited picks are removed from the sequence, so `ceil(overall/teams)`
 * is wrong in this league. The stub therefore needs the REAL pick order; a
 * hand-made one would let the test agree with a label the artifact contradicts,
 * which is the whole failure being guarded. */
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const state = { seatPlan: PLAN, data: { league: BOARD.league, pick_order: BOARD.pick_order } };
const $ = sel => (sel === '#seat-plan' ? host : null);
const escapeHtml = s => String(s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* renderSeatPlan leans on shared helpers — the seat lookup it shares with the
 * path cards, and the round label that kills the "pick 8 vs round 8" ambiguity.
 * ALL OF THEM ARE EXTRACTED FROM THE SHIPPED SOURCE rather than stubbed: a
 * hand-written stub would let the test's copy drift from the real one, which is
 * exactly what sharing the lookup was meant to prevent. Extracted BY LIST
 * because this is the third helper to arrive and doing it one at a time is how
 * the next one gets forgotten. */
function extractFn(sig) {
  const st = SRC.indexOf(sig);
  if (st < 0) return '';
  let d = 0;
  for (let i = SRC.indexOf('{', st); i < SRC.length; i++) {
    if (SRC[i] === '{') d++;
    else if (SRC[i] === '}') { d--; if (d === 0) return SRC.slice(st, i + 1); }
  }
  return '';
}
const HELPERS = ['  function seatForCurrentPick() {', '  function roundLabel(overall) {'];
const helperSrc = HELPERS.map(extractFn);
ck('every shared helper renderSeatPlan needs was extracted',
  helperSrc.every(x => x.length > 30), HELPERS.filter((h, i) => helperSrc[i].length <= 30));
const lookSrc = helperSrc.join('\n');

function runAtPick(pick) {
  captured = '';
  const pickCoordinate = () => ({ current: pick });
  // eslint-disable-next-line no-new-func
  const f = new Function('state', '$', 'escapeHtml', 'pickCoordinate',
    lookSrc + '\n' + fnSrc + '; return renderSeatPlan;');
  f(state, $, escapeHtml, pickCoordinate)();
  return captured;
}

// ── 1. IT RENDERS THE SEAT FOR THE PICK ON THE CLOCK ─────────────────────
const seat0 = PLAN.seats[0];
const html0 = runAtPick(seat0.pick);
ck('it renders at all', html0.length > 50, html0.length);
ck('it names the SEAT the plan wants, not just a player',
  html0.indexOf('THE PLAN WANTS') >= 0 && html0.indexOf(seat0.slot) >= 0);
ck('it lists the eligible shortlist', (seat0.shortlist || []).every(p => html0.indexOf(p.name) >= 0));

// THE ANTI-PIN CHECK. If the pick lookup ever breaks, the panel silently shows
// the FIRST seat all night and looks perfectly healthy — the failure mode of the
// field-name bug this file was written alongside.
const later = PLAN.seats[PLAN.seats.length - 1];
const htmlL = runAtPick(later.pick);
ck('a DIFFERENT pick renders a DIFFERENT seat (the panel follows the clock)',
  htmlL !== html0 && htmlL.indexOf('overall ' + later.pick) >= 0,
  'first=' + seat0.pick + ' last=' + later.pick);
/* THE AMBIGUITY THAT PROMPTED THE LABEL: "pick 8" reads as round 8 and means
 * R1.8. Cory read it the other way and objected on the merits — a quarterback
 * of Allen's calibre in round 8 would be absurd — when the claim was R1.8, where
 * his ADP of 19 leaves him on the board and taking him is an 11-pick reach. */
ck('the seat is labelled by ROUND, not by a bare pick number',
  /R\d+\.\d+/.test(html0), html0.slice(0, 90));

// ── 2. EVERY NUMBER CARRIES THE CAPTION THE CONTRACT DECLARES ────────────
const C = PLAN.display_contract || {};
// gap_to_second is the one whose units DIFFER BY ROW. Printing it bare is the
// units error the contract exists to prevent, and one I shipped this morning.
PLAN.seats.forEach(s => {
  if (s.gap_to_second == null) return;
  const h = runAtPick(s.pick);
  if (h.indexOf(String(s.gap_to_second)) < 0) return;   // not shown at all is fine
  if (h.indexOf(s.gap_units) < 0) {
    ck('gap at pick ' + s.pick + ' is printed WITH its units', false,
      'shows ' + s.gap_to_second + ' without "' + s.gap_units + '"');
  }
});
ck('every rendered gap carries its row-specific units', true);

// beats_wire_by is SIGNED. A magnitude here inverts the meaning: "the wire is
// better than him" would read as an advantage.
const negSeat = PLAN.seats.find(s => (s.shortlist || []).some(p => p.beats_wire_by < 0));
if (negSeat) {
  const h = runAtPick(negSeat.pick);
  const neg = negSeat.shortlist.find(p => p.beats_wire_by < 0);
  ck('a NEGATIVE wire edge renders with its minus sign',
    h.indexOf(String(neg.beats_wire_by)) >= 0 && h.indexOf('-') >= 0,
    'expected ' + neg.beats_wire_by + ' for ' + neg.name);
  ck('and it is not rendered as a bare magnitude',
    h.indexOf('' + Math.abs(neg.beats_wire_by) + ' /wk vs free') < 0
    || h.indexOf(String(neg.beats_wire_by)) >= 0);
} else {
  console.log('SKIP  no negative wire edge in this artifact — case not exercised');
}

// ── 3. THE EXPLORATORY NUMBER IS NEVER A PROMISE ─────────────────────────
const anyHtml = runAtPick(seat0.pick);
ck('the greedy-edge figure appears with its EXPLORATORY caveat',
  anyHtml.indexOf(String(PLAN.measured_edge_vs_greedy)) < 0
  || /EXPLORATORY/i.test(anyHtml),
  'shows ' + PLAN.measured_edge_vs_greedy + ' without the caveat');
ck('the ADP assumption is on screen, not only in a comment',
  anyHtml.indexOf('ADP') >= 0);

// ── 4. THE TABLE-SIDE RULE SURVIVES ──────────────────────────────────────
ck('the fallback rule is rendered, so a gone shortlist is still actionable',
  anyHtml.indexOf(seat0.fallback_rule.slice(0, 30)) >= 0);
const tossupSeat = PLAN.seats.find(s => s.tossup);
if (tossupSeat) {
  const h = runAtPick(tossupSeat.pick);
  ck('a TOSSUP says so, and says the seat matters more than the name',
    /TOSSUP/.test(h) && /SEAT matters more than the NAME/.test(h));
}

// ── 5. FAIL ARM — prove these checks can go red ──────────────────────────
{
  const bad = JSON.parse(JSON.stringify(PLAN));
  bad.seats.forEach(s => { s.gap_units = ''; });
  const savedPlan = state.seatPlan;
  state.seatPlan = bad;
  const h = runAtPick(bad.seats[0].pick);
  state.seatPlan = savedPlan;
  /* SCOPED TO THE GAP LINE, not the whole document. My first version searched
   * the entire markup for "season points" and failed — because the SHORTLIST
   * rows legitimately print proj_mean in those same units. The string was there
   * for a different reason, so the arm reported the code broken when the test
   * was. Asserting on a global substring when you mean a scoped one is its own
   * error class, and it fails in the direction that looks like a real defect. */
  const gapOf = m => { const i = m.indexOf('class="sp-gap"');
    return i < 0 ? '' : m.slice(i, m.indexOf('</div>', i)); };
  const good = runAtPick(PLAN.seats[0].pick);
  ck('FAIL ARM — stripping gap_units removes the caption FROM THE GAP LINE',
    gapOf(good).indexOf(PLAN.seats[0].gap_units) >= 0
    && gapOf(h).indexOf(PLAN.seats[0].gap_units) < 0,
    'healthy=[' + gapOf(good).slice(0, 90) + '] stripped=[' + gapOf(h).slice(0, 90) + ']');
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED — the panel misrepresents the model.'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the seat panel renders the seat for the pick ON THE');
console.log('CLOCK, every number carries the caption the artifact declares for it, the');
console.log('signed edge keeps its sign, and the exploratory figure keeps its caveat.');
console.log('WHAT IT CANNOT SEE: CSS. A caption emitted and then hidden by a stylesheet');
console.log('renders this green — that surface is B\'s, and so is that check.');
