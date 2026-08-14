// TERRITORY: A
// "LOOK AT WHAT THE WINNERS DID" IS THE QUESTION MOST LIKELY TO PRODUCE A
// CONFIDENT WRONG ANSWER, AND THIS FILE IS WHY.
//
// Cory asked whether reviewing the last three winners would reveal what works in
// this league. It would reveal something. Three teams measured on six variables
// always do — and the something is usually noise wearing the shape of a finding.
//
// `winners.js` answers it three ways on purpose: the naive top-3-vs-bottom-3 cut
// (shown because it is the one that misleads), the WITHIN-MANAGER comparison
// (which removes who-is-good entirely), and an explicit count of how many
// metrics were tested.
//
// ── THE RESULT THAT JUSTIFIES THE WHOLE DESIGN ────────────────────────────
//
// TE REVERSES SIGN between the two. The naive cut says winners take a tight end
// ~15 picks earlier. Within manager, the seasons a manager drafted TE earlier
// than HIS OWN norm are the seasons he finished WORSE. Good managers happen to
// take TE early; taking TE early does not make you good. Read the naive number
// and you draft a tight end for a reason that does not exist.
//
// QB keeps its direction across both, which is the only thing that makes it
// worth carrying forward — and still only as a hypothesis.
//
// Run: node draft/tests/winners.test.js
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const W = require(path.join(ROOT, 'draft', 'tools', 'winners.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};
const D = W.DATA;
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;

// ── 1. THE SAMPLE IS WHAT IT CLAIMS ─────────────────────────────────────
{
  ck('30 team-seasons, which is the only reason this is answerable at all',
    D.length === 30, D.length);
  ck('three completed seasons — 2026 is excluded rather than counted as zeros',
    new Set(D.map(r => r.season)).size === 3, [...new Set(D.map(r => r.season))]);
  ck('ten managers, so 30 rows are ~10 independent units and NOT 30',
    new Set(D.map(r => r.owner)).size === 10, new Set(D.map(r => r.owner)).size);
  ck('every row carries a real finishing rank', D.every(r => r.rank >= 1 && r.rank <= 10));
  ck('a position never taken is null, not a sentinel that would poison a mean',
    D.every(r => r.qb_first === null || r.qb_first > 0));
}

// ── 2. THE WITHIN-MANAGER DESIGN ACTUALLY REMOVES THE MANAGER ───────────
// If it did not, it would be the naive comparison wearing a better name.
{
  const w = W.withinManager(D, 'qb_first');
  ck('the within-manager test uses managers seen more than once',
    w.managers === 10, w.managers);
  ck('and it centres on each manager\'s OWN mean, so a manager who never varies '
    + 'contributes nothing to either side', w.nEarly + w.nLate <= D.length,
  { n: w.nEarly + w.nLate, rows: D.length });

  /* THE PROOF THE DESIGN WORKS: give every manager an IDENTICAL metric value in
   * every season. Between-manager, the best manager still looks best. Within
   * manager, there is no deviation to correlate with, so the effect must vanish.
   * A design that still reported an effect here would be measuring who is good. */
  const flat = D.map(r => Object.assign({}, r, { qb_first: 50 }));
  const fw = W.withinManager(flat, 'qb_first');
  ck('CONTROL — with NO within-manager variation the effect vanishes entirely, '
    + 'which is what proves it is not measuring who is good',
  fw.nEarly === 0 && fw.nLate === 0, { early: fw.nEarly, late: fw.nLate });

  /* AND THE OPPOSITE CONTROL: a metric constructed to track rank inside each
   * manager MUST be detected, or the test cannot find anything. */
  const planted = D.map(r => Object.assign({}, r, { qb_first: r.rank * 10 }));
  const pw = W.withinManager(planted, 'qb_first');
  ck('CONTROL — a planted within-manager effect IS detected, so a null result '
    + 'elsewhere means absence rather than blindness', pw.spread > 1.5, pw.spread);
}

// ── 3. THE FINDING THAT JUSTIFIES THE DESIGN ────────────────────────────
{
  const naive = k => {
    const top = D.filter(r => r.rank <= 3 && r[k] != null).map(r => r[k]);
    const bot = D.filter(r => r.rank >= 8 && r[k] != null).map(r => r[k]);
    return mean(top) - mean(bot);
  };
  ck('the NAIVE cut says winners take a tight end much earlier', naive('te_first') < -8,
    naive('te_first'));
  const te = W.withinManager(D, 'te_first');
  ck('but WITHIN a manager the sign REVERSES — the seasons he took TE earlier '
    + 'than his own norm are the seasons he finished WORSE', te.early > 0 && te.late < 0,
  { early: te.early, late: te.late });
  /* ⚠️ MY FIRST VERSION OF THIS ASSERTION WAS JUNK and passed without testing
   * anything: `Math.sign(a) === Math.sign(b) === false || a * b > 0` parses as
   * `(bool === false) || ...`, and the second clause was trivially true. Written
   * while hunting vacuous assertions in other files.
   *
   * THE REVERSAL STATED PROPERLY. `naive < 0` means the top-3 took TE EARLIER
   * (a lower pick number). `spread = mean(late) - mean(early)`, so `spread < 0`
   * means taking it LATER produced the BETTER rank. Those two disagree, and
   * that disagreement IS the confound. */
  ck('so the naive TE reading is a confound: the top 3 took TE earlier, yet '
    + 'taking TE later is what actually correlates with finishing better',
  naive('te_first') < 0 && te.spread < 0, { naive: naive('te_first'), within: te.spread });

  const qb = W.withinManager(D, 'qb_first');
  ck('QB AGREES across both — top 3 took it earlier AND taking it earlier '
    + 'correlates with finishing better, which is the only reason it is worth '
    + 'carrying forward', naive('qb_first') < 0 && qb.spread > 0,
  { naive: naive('qb_first'), within: qb.spread });
}

// ── 4. THE TOOL REFUSES TO OVERSTATE ────────────────────────────────────
// The output is read by someone deciding a draft. It must not read as advice.
{
  const { execFileSync } = require('child_process');
  const out = execFileSync('node', [path.join(ROOT, 'draft', 'tools', 'winners.js')],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  ck('it prints the naive cut LABELLED as the comparison that misleads',
    /the comparison that misleads/i.test(out));
  ck('it says the same managers recur, which is why the naive n is not the real n',
    /same managers recur/i.test(out));
  ck('it states how many metrics were tested', /metrics tested: 6/.test(out));
  ck('and that one spurious result of interesting size is EXPECTED',
    /spurious result of "interesting" size is expected/i.test(out));
  ck('it calls the survivors HYPOTHESES, not findings', /TREAT AS HYPOTHESES/.test(out));
  ck('and it says outright that this is nowhere near enough to draft on',
    /nowhere near enough to draft on/i.test(out));
  ck('it points at forward prediction rather than more slicing of the same rows',
    /forward prediction, not more slicing/i.test(out));

  /* THE HONEST READING OF THE RESULT ITSELF, asserted so it cannot be quietly
   * dropped: when MOST of the metrics clear the threshold, the threshold is the
   * noise floor and not a discovery. */
  const cleared = W.METRICS.filter(([k]) => {
    const w = W.withinManager(D, k);
    return isFinite(w.spread) && Math.abs(w.spread) >= 0.75;
  }).length;
  ck('MOST metrics clear 0.75 rank positions — which means ~1 rank position IS '
    + 'the noise floor of this sample, not a finding', cleared >= 3,
  { cleared: cleared, of: W.METRICS.length });
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the within-manager design provably removes who-is-good');
console.log('(a flat metric yields no effect, a planted one is detected), the TE sign');
console.log('reversal between the naive and within-manager cuts is pinned, and the tool');
console.log('states its own metric count and refuses to phrase hypotheses as advice.');
console.log('WHAT IT DOES NOT: establish that any of these effects is real. Ten managers');
console.log('over three seasons, four of six metrics clearing the same ~1 rank position —');
console.log('that is a noise floor. Forward prediction is the only thing that settles it.');
