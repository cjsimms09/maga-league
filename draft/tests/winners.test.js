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
// The tool's own printed output, run once. Several sections below assert on what
// a READER is shown, not just on what the functions return — the output is the
// product here, and a correct function behind a misleading table is the defect
// this whole file exists to prevent.
const OUT = require('child_process').execFileSync(
  'node', [require('path').join(ROOT, 'draft', 'tools', 'winners.js')],
  { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });

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

// ── 5. THE SECOND OUTCOME: THE WEEKLY POT ───────────────────────────────
// Cory: "maybe also test teams that won weekly pot the most". It is 37.5% of the
// money ($100 x 15 weeks of a $4,000 pot) and it is won by CEILING rather than
// season total — so it can reward a different draft shape, and nothing measured
// before this saw it.
{
  const wk = D.map(r => r.weekly_highs);
  ck('every team-season carries a weekly-high count', wk.every(Number.isFinite));
  /* THE ARITHMETIC THAT MUST HOLD: one winner per paid week, so the counts sum
   * to weeks x seasons. If this drifts, the weekly column is measuring something
   * other than the pot it claims to measure. */
  const seasons = [...new Set(D.map(r => r.season))].length;
  ck('the counts sum to exactly one winner per paid week per season — the pot is '
    + 'fully accounted for and no week is double-counted',
  wk.reduce((a, b) => a + b, 0) === W.WEEKLY_HIGH_WEEKS * seasons,
  { total: wk.reduce((a, b) => a + b, 0), expected: W.WEEKLY_HIGH_WEEKS * seasons });
  ck('only the PAID weeks count — a playoff-week blowout must not buy a share of '
    + 'a regular-season pot', W.WEEKLY_HIGH_WEEKS === 15);

  ck('the negated column really is the negation, so "lower is better" holds for '
    + 'both outcomes and a sign cannot mean two things',
  D.every(r => r.weekly_highs_neg === -r.weekly_highs));

  /* THE CONTROL THAT DECIDES WHAT "AGREEMENT" IS WORTH. If rank and weekly-high
   * wins were the same thing twice, agreeing across them would be worth nothing
   * and the filter in §6 would be theatre. */
  const oc = W.outcomeCorrelation(D);
  ck('the two outcomes are CORRELATED — a good season tends to produce both, so '
    + 'agreement across them is partly automatic', oc.within < -0.2, oc.within);
  ck('but they are NOT the same measurement, which is what makes the second one '
    + 'worth running at all', oc.within > -0.8, oc.within);
  ck('and the tool PRINTS that correlation rather than letting a reader count '
    + 'two columns as two witnesses', /NOT INDEPENDENT/.test(OUT)
    && new RegExp(oc.within.toFixed(3)).test(OUT), oc.within.toFixed(3));
  ck('it also states the coarse resolution — wins run 0..4, so every spread is a '
    + 'fraction of one win', /FRACTION OF ONE/.test(OUT) && oc.maxWins <= 5, oc.maxWins);
}

// ── 6. THE FILTER, AND THE RESULT THAT CHANGED ──────────────────────────
{
  ck('the tool applies the agreement filter itself rather than leaving three '
    + 'tables to be cherry-picked from', /WHAT SURVIVES BOTH OUTCOMES/.test(OUT));
  ck('and it reports the comparison count as 18, not 6 — adding outcomes '
    + 'multiplies the chances of a spurious standout',
  /COMPARISONS RUN: 18/.test(OUT));

  /* THE FINDING THAT JUSTIFIES HAVING RUN IT. QB was the one metric that agreed
   * across the naive and within-manager cuts, and the note said it was the only
   * one worth carrying forward. The SECOND OUTCOME contradicts it. */
  const qbR = W.withinManager(D, 'qb_first', 'rank');
  const qbW = W.withinManager(D, 'qb_first', 'weekly_highs_neg');
  ck('QB is now IN TENSION: taking him earlier goes with a better RANK but '
    + 'FEWER weekly-high wins — the second outcome demoted the one signal the '
    + 'rank-only test had promoted',
  Math.sign(qbR.spread) !== Math.sign(qbW.spread),
  { rank: qbR.spread, weekly: qbW.spread });
  ck('and the tool says so in those terms rather than reporting the rank column '
    + 'alone', /IN TENSION/.test(OUT) && /first QB taken/.test(OUT));

  /* AND THE CONTROL: something must survive, or the filter is just a way of
   * rejecting everything and would prove nothing about QB. */
  const survives = W.METRICS.filter(([k]) => {
    const a = W.withinManager(D, k, 'rank'), b = W.withinManager(D, k, 'weekly_highs_neg');
    return isFinite(a.spread) && isFinite(b.spread) && Math.abs(a.spread) >= 0.75
      && Math.sign(a.spread) === Math.sign(b.spread);
  });
  ck('CONTROL — the filter is not simply rejecting everything: some metrics DO '
    + 'agree across both pots', survives.length >= 1, survives.map(m => m[1]));
}

// ── 7. "LEAGUE WORST" IS ANSWERED AS ASYMMETRY, NOT A SECOND CUT ────────
{
  ck('the tool says outright that a bottom-three cut would be the same data '
    + 'again rather than new evidence', /SAME data again/i.test(OUT));
  const a = W.asymmetry(D, 'qb_first', 'rank');
  const wm = W.withinManager(D, 'qb_first', 'rank');
  /* THE SPLIT IS BY OUTCOME, NOT BY METRIC, so every row of a multi-season
   * manager lands in one half or the other. That is deliberately a LARGER n than
   * `withinManager` reports: that function drops rows where the metric sits
   * exactly on the manager's own mean (no deviation to attribute), and the
   * asymmetry split has no such hole. My first assertion here copied the 28 and
   * was simply wrong about a correct function. */
  ck('the asymmetry split uses every row of every multi-season manager — none '
    + 'is dropped', a.nGood + a.nBad === D.length, { good: a.nGood, bad: a.nBad, rows: D.length });
  ck('and that is MORE rows than the deviation test keeps, because a season '
    + 'sitting exactly on his own average has no deviation to classify',
  a.nGood + a.nBad > wm.nEarly + wm.nLate,
  { asym: a.nGood + a.nBad, within: wm.nEarly + wm.nLate });
  ck('CONTROL — both halves are populated, or a one-sided table would read as a '
    + 'finding', a.nGood > 5 && a.nBad > 5, { good: a.nGood, bad: a.nBad });

  /* MY OWN BUG, PINNED. The ratio column divided by the good-half effect with a
   * 0.01 guard, and duly printed -23.75 for TE off a denominator of +0.03 — the
   * largest number in the table, manufactured entirely by dividing by nothing. */
  ck('a ratio with a near-zero denominator is reported as `flat`, not as a large '
    + 'number', !/-?\d{2,}\.\d\d/.test((OUT.match(/his GOOD half[\s\S]*?\n\n/) || [''])[0]),
  (OUT.match(/his GOOD half[\s\S]*?\n\n/) || [''])[0].slice(0, 240));
  ck('and the guard is stated as a threshold rather than left implicit',
    /flat/.test(OUT));
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
