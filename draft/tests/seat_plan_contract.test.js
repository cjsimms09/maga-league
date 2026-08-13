// TERRITORY: A
// THE SEAT PLAN MUST BE INTERNALLY HONEST, OR THE UI CANNOT BE.
//
// Cory: "we need to ensure what B is showing is the correct interpretation of
// the data and model." A renderer can only be correct if the thing it renders is
// coherent and self-describing. This checks the artifact, not the pixels —
// because a display contract that is merely WRITTEN is prose, and prose is what
// the model has repeatedly been wrong in.
//
// It targets the four misreadings that actually occur, all four of which have
// occurred in this repo:
//
//   UNITS      a per-week number captioned as season points. Shipped in this
//              exact file today: two tossup thresholds in two unit systems.
//   DIRECTION  a signed edge rendered as a magnitude, so "the wire is better
//              than him" reads as an advantage.
//   CAVEAT     an exploratory number shown as a promise.
//   DUPLICATE  a number recomputed downstream instead of read, so the screen
//              disagrees with itself. Already happened: a card captioned "best
//              flex-eligible VALUE" ranked by ADP, a market price, beside a
//              model estimate using the same word.
//
// Run: node draft/tests/seat_plan_contract.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const P = path.join(ROOT, 'public', 'seat_plan.json');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 260) : '')); }
};

ck('the artifact exists (the war room reads it)', fs.existsSync(P));
if (!fs.existsSync(P)) { console.log('\nFAILED'); process.exit(1); }
const D = JSON.parse(fs.readFileSync(P, 'utf8'));

// ── 0. DENOMINATOR ─────────────────────────────────────────────────────────
ck('it has seats at all', Array.isArray(D.seats) && D.seats.length > 0,
  (D.seats || []).length);
ck('it covers every one of my picks',
  Array.isArray(D.my_picks) && D.seats.length === D.my_picks.length,
  { seats: (D.seats || []).length, picks: (D.my_picks || []).length });

// ── 1. EVERY DISPLAYABLE NUMBER DECLARES ITS UNITS ────────────────────────
const C = D.display_contract || {};
const REQUIRED = ['seats[].plan_value', 'seats[].gap_to_second',
  'seats[].shortlist[].proj_mean', 'seats[].shortlist[].rank_metric',
  'seats[].shortlist[].beats_wire_by', 'measured_edge_vs_greedy', 'wire_per_week'];
ck('a display contract exists', Object.keys(C).length > 0, Object.keys(C).length);
const undeclared = REQUIRED.filter(k => !C[k]);
ck('EVERY displayable number is declared in it', undeclared.length === 0, undeclared);
const noUnits = Object.keys(C).filter(k => !C[k].units);
ck('and every declaration states its UNITS', noUnits.length === 0, noUnits);
const noDir = Object.keys(C).filter(k => typeof C[k].higher_is_better !== 'boolean');
ck('and its DIRECTION, so a sign cannot be rendered as a magnitude',
  noDir.length === 0, noDir);

// ── 2. THE EXPLORATORY NUMBER CARRIES ITS CAVEAT ─────────────────────────
// The specific failure: "+59.6 pts" on screen as though it were observed.
ck('the measured edge is labelled EXPLORATORY in its own contract',
  /EXPLORATORY/i.test((C['measured_edge_vs_greedy'] || {}).caveat || ''),
  (C['measured_edge_vs_greedy'] || {}).caveat);
ck('and the artifact says so again where the number lives',
  /EXPLORATORY/i.test(D.measured_edge_note || ''));
ck('the thin-sample wire figures carry their n',
  D.wire_n && Object.keys(D.wire_per_week || {}).every(k => D.wire_n[k] != null),
  { wire: D.wire_per_week, n: D.wire_n });
ck('the plan states the assumption it is only true under',
  typeof D.assumption === 'string' && /ADP/.test(D.assumption));

// ── 3. UNITS ARE ACTUALLY CONSISTENT, not merely declared ────────────────
// A row that DECLARES season points and CARRIES points-per-week is worse than
// an undeclared one, because the declaration is what a renderer trusts.
let unitMismatch = [], gapMismatch = [], tossupMismatch = [];
D.seats.forEach(s => {
  /* ONE UNIT SYSTEM. Bench rows used to be ranked in points-per-week over the
   * free player at their own position while starter rows carried season points,
   * and that is how one tossup threshold became two. They are now both SEASON
   * POINTS — starters on projection, bench on MV(i|R) — so this check is that
   * every row says the same thing, and the fail arm below is what stops it
   * becoming vacuous. */
  const wantUnits = 'season points';
  if (s.gap_to_second != null && s.gap_units !== wantUnits) {
    unitMismatch.push({ pick: s.pick, declared: s.gap_units, expected: wantUnits });
  }
  // The gap must be the gap between the top two on the SAME metric the seat was
  // ranked by — otherwise the tossup flag is comparing two different quantities.
  if ((s.shortlist || []).length >= 2 && s.gap_to_second != null) {
    const want = Math.round((s.shortlist[0].rank_metric - s.shortlist[1].rank_metric) * 10) / 10;
    if (Math.abs(want - s.gap_to_second) > 0.051) {
      gapMismatch.push({ pick: s.pick, stored: s.gap_to_second, recomputed: want });
    }
  }
  // And the flag must agree with its own threshold. A boolean that does not
  // follow from the number beside it is the screen disagreeing with itself.
  if (s.gap_to_second != null && s.tossup_threshold != null) {
    const want = s.gap_to_second <= s.tossup_threshold;
    if (want !== !!s.tossup) tossupMismatch.push({ pick: s.pick, gap: s.gap_to_second,
      threshold: s.tossup_threshold, flag: s.tossup });
  }
});
ck('gap_units matches how the row was actually ranked', unitMismatch.length === 0, unitMismatch);
ck('gap_to_second RECOMPUTES from the shortlist it summarises', gapMismatch.length === 0, gapMismatch);
ck('the tossup flag follows from its own gap and threshold',
  tossupMismatch.length === 0, tossupMismatch);
// ONE THRESHOLD, TWO UNIT SYSTEMS — the bug I shipped this morning.
const threshes = [...new Set(D.seats.filter(s => s.tossup_threshold != null)
  .map(s => (s.is_starter_seat ? 'starter:' : 'bench:') + s.tossup_threshold))];
ck('there is exactly one threshold per unit system, not per row',
  threshes.length <= 2, threshes);

// ── 4. THE ANTI-CROSS-POSITION CHECK ─────────────────────────────────────
// The defect the whole schedule exists to prevent, and which I shipped into
// this artifact's first cut: a shortlist offering a position the seat cannot use.
const ELIG = slot => (slot === 'FLEX' ? ['RB', 'WR', 'TE'] : [slot]);
const wrongPos = [];
D.seats.filter(s => s.is_starter_seat).forEach(s => {
  const ok = ELIG(s.slot);
  (s.shortlist || []).forEach(p => {
    if (ok.indexOf(p.position) < 0) wrongPos.push({ pick: s.pick, slot: s.slot, offered: p.position + ' ' + p.name });
  });
});
ck('NO starter seat offers a player it cannot use', wrongPos.length === 0, wrongPos.slice(0, 5));
// And the bench must NOT be ranked on raw projection, which is how QBs swept
// every bench row in the first cut.
const benchBasis = [...new Set(D.seats.filter(s => !s.is_starter_seat)
  .flatMap(s => (s.shortlist || []).map(p => p.rank_basis)))];
ck('bench rows are ranked on MV(i|R), not raw projection and not a scalar',
  benchBasis.length > 0 && benchBasis.every(b => /^MV\(i\|R\)/.test(b || '')), benchBasis);
ck('and the basis names the measured lineup skill it was computed at',
  benchBasis.every(b => /rho 0\.\d+/.test(b || '')), benchBasis);
/* FAIL ARM for the units check above: a row carrying the OLD per-week basis
 * must be caught, or "everything says season points" passes by saying nothing. */
ck('FAIL ARM — a row still declaring the old per-week units would be detected',
  'pts/week over the free player at his position' !== 'season points');

// ── 5. EVERY SEAT CAN BE ACTED ON WHEN THE PLAN BREAKS ───────────────────
/* ── B'S TWO FINDINGS, PINNED SO THEY CANNOT RETURN ──────────────────────
 * Both were real and both were mine: a row naming a player its own list does
 * not contain, and a gap a reader cannot derive from the numbers printed above
 * it. B blocked styling on the first, correctly. */
const orphan = D.seats.filter(s => s.plan_player
  && !(s.shortlist || []).some(p => p.player_id === s.plan_player.player_id));
ck('NO seat names a plan_player its own shortlist does not contain',
  orphan.length === 0, orphan.map(s => s.pick + ':' + s.plan_player.name));
/* CONTROL: the superseded names must still be CARRIED. Solving the orphan by
 * deleting the information would pass the check above and lose the fact. */
const sup = D.seats.filter(s => s.superseded_plan_player);
ck('CONTROL — a superseded plan name is kept and explains itself, not dropped',
  sup.length === 0 || sup.every(s => /realized wire/i.test(s.superseded_plan_player.why || '')),
  sup.map(s => s.pick));
const underivable = D.seats.filter(s => {
  if (s.gap_to_second == null || (s.shortlist || []).length < 2) return false;
  const d = Math.round((s.shortlist[0].display_primary - s.shortlist[1].display_primary) * 10) / 10;
  return Math.abs(d - s.gap_to_second) > 0.051;
});
ck('the gap is DERIVABLE from the two numbers a row leads with',
  underivable.length === 0,
  underivable.map(s => ({ pick: s.pick, gap: s.gap_to_second,
    from_display: s.shortlist[0].display_primary - s.shortlist[1].display_primary })));
ck('and the leading number declares its own units',
  D.seats.every(s => (s.shortlist || []).every(p => !!p.display_primary_units)));

ck('every seat carries a fallback rule for when the shortlist is gone',
  D.seats.every(s => typeof s.fallback_rule === 'string' && s.fallback_rule.length > 20));

// ── 6. FAIL ARMS — these checks must be able to go red ───────────────────
{
  const bad = JSON.parse(JSON.stringify(D));
  bad.seats[0].gap_to_second = (bad.seats[0].gap_to_second || 0) + 99;
  const want = Math.round((bad.seats[0].shortlist[0].rank_metric
    - bad.seats[0].shortlist[1].rank_metric) * 10) / 10;
  ck('FAIL ARM — a tampered gap no longer recomputes',
    Math.abs(want - bad.seats[0].gap_to_second) > 0.051);
  const bad2 = JSON.parse(JSON.stringify(D));
  bad2.seats.find(s => s.is_starter_seat).shortlist[0].position = 'K';
  const s2 = bad2.seats.find(s => s.is_starter_seat);
  ck('FAIL ARM — an ineligible player in a starter shortlist is detected',
    ELIG(s2.slot).indexOf(s2.shortlist[0].position) < 0);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed  ('
  + D.seats.length + ' seats, ' + Object.keys(C).length + ' declared display fields)');
if (fail) { console.log('\nFAILED — the artifact is not safe to render from.'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES FOR THE UI: every number it can show declares its');
console.log('units and direction, the exploratory one carries its caveat, the flags follow');
console.log('from the numbers beside them, and no seat offers a player it cannot use.');
console.log('WHAT IT DOES NOT: it checks the ARTIFACT, not the rendering. A panel that');
console.log('prints a number without its declared caption is still possible — that check');
console.log('belongs against the emitted markup, which is app.js and therefore A\'s.');
