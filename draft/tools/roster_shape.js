// TERRITORY: A
/* IS QB2 / TE2 THE RIGHT SHAPE FOR THIS LEAGUE? — measured against this league.
 *
 * Cory: *"2 QBs and 2 TE I have a hard time believing is the optimal roster for
 * this league."* The wrong response is to add a penalty until the roster looks
 * right; that is the constitutional rule in one move -- the change that resolves
 * the symptom is the one most likely to ship unverified. The right response is
 * to make the model draft the shape he expects and REPORT WHAT IT SAYS THAT
 * COSTS, then check whether the model has the resolution to be believed.
 *
 * ── WHAT THIS FOUND, IN ORDER OF HOW MUCH IT MATTERS ────────────────────────
 *
 * 1. A REAL BUG, now fixed in draft_plan.js: ROSTERED was hardcoded 180 ("10
 *    teams x 18 spots") when this league drafts 150 (15 rounds x 10 teams,
 *    confirmed all three seasons). RB waiver replacement 63 -> 130.
 *
 * 2. THE DEVIATION IS NOT WHERE THE COMPLAINT POINTED. Against this league's
 *    own three-year drafted average, QB is +0.40 and TE +0.60 -- real but small.
 *    WR is -2.23. The roster is receiver-starved far more than it is
 *    quarterback-heavy, and two picks sit UNPRICED which would mostly close it.
 *
 * 3. AND THE MODEL CANNOT DEFEND ITS OWN PREFERENCE. Forcing QB1/TE1 costs it
 *    19.8 points. A single running back's season projection carries a standard
 *    deviation near 79. The model is expressing a preference two orders below
 *    its own resolution, and it converts the freed picks into UNPRICED rather
 *    than into anything better -- so the 19.8 is not lost to a superior
 *    alternative, it is lost to a blank.
 *
 * Run: node draft/tools/roster_shape.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const HIST = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
/* POSITION COMES FROM THE RECORD, NOT THE LIVE BOARD — this is a measurement
 * about 2023-2025 and the board is 2026. Defences arrive as a team abbreviation
 * rather than a numeric id, and position_map handles that in ONE place; without
 * it every DEF row reads as "unresolved" and the churn table silently loses a
 * position, which is the kind of quiet drop that makes a table look complete. */
const PM = require(path.join(ROOT, 'draft', 'tools', 'position_map.js'));
const posOf = PM.resolver();
const done = HIST.seasons.filter(s => s.status === 'complete');
const TEAMS = ((DATA.league || {}).teams) || 10;

console.log('ROSTER SHAPE — what this league actually builds, and what our plan builds\n');

/* ── 1. THE LEAGUE'S OWN SHAPE, DRAFTED vs FINAL ───────────────────────────
 * Both, because they answer different questions. DRAFTED is what a draft plan
 * is comparable to. FINAL includes everything acquired in-season, and the
 * DIFFERENCE between them is the only direct evidence on disk about which
 * positions this league replaces from the wire. */
const drafted = {}, final = {};
POS.forEach(p => { drafted[p] = 0; final[p] = 0; });
let unresolved = 0;
done.forEach(s => {
  ((s.drafts[0] || {}).picks || []).forEach(pk => {
    const q = posOf(pk.player_id); if (q) drafted[q]++; else unresolved++;
  });
  s.final_rosters.forEach(r => (r.players || []).forEach(id => {
    const q = posOf(id); if (q) final[q]++; else unresolved++;
  }));
});
const N = done.length * TEAMS;
console.log('  THIS LEAGUE, ' + done.length + ' completed seasons, per team');
console.log('    pos    drafted    final    churn (final - drafted)');
console.log('    ' + '-'.repeat(56));
POS.forEach(p => {
  const d = drafted[p] / N, f = final[p] / N, c = f - d;
  console.log('    ' + p.padEnd(7) + d.toFixed(2).padStart(6) + f.toFixed(2).padStart(9)
    + '     ' + (c >= 0 ? '+' : '') + c.toFixed(2)
    + (Math.abs(c) >= 0.25 ? (c > 0 ? '   ACQUIRED in-season' : '   SHED in-season') : ''));
});
console.log('    unresolved player ids: ' + unresolved);
console.log('\n    QB +0.20 and TE +0.30 are ACQUIRED in-season; RB -0.37 and WR -0.27 are SHED.');
console.log('    That is the direct evidence for Cory\'s instinct: the two positions the plan');
console.log('    doubles up on are the two this league tops up from the wire.');

/* ── 2. OURS AGAINST THAT ───────────────────────────────────────────────── */
const PLAN = require('./draft_plan.js');
const ours = {};
PLAN.plan.forEach(x => { if (x.p) ours[x.p.position] = (ours[x.p.position] || 0) + 1; });
console.log('\n  OUR DRAFTED SHAPE vs THE LEAGUE');
console.log('    pos    league    ours    delta');
console.log('    ' + '-'.repeat(46));
POS.forEach(p => {
  const l = drafted[p] / N, o = ours[p] || 0, d = o - l;
  console.log('    ' + p.padEnd(7) + l.toFixed(2).padStart(6) + String(o).padStart(8)
    + '   ' + (d >= 0 ? '+' : '') + d.toFixed(2)
    + (Math.abs(d) >= 0.5 ? '   <<' : ''));
});
const unp = PLAN.plan.filter(x => x.unpriced).length;
console.log('    plus ' + unp + ' UNPRICED picks the model refuses to allocate.');
console.log('\n    THE LARGEST DEVIATION IS WR, NOT QB OR TE. Our keepers are 2 RB + 1 WR,');
console.log('    so the roster tilts RB before a single pick is made; the DRAFT is');
console.log('    receiver-starved. Sending the unpriced picks to WR closes most of it.');

/* ── 3. PRICE THE SHAPE CORY EXPECTS ──────────────────────────────────────
 * One implementation of the pricing: the same draft_plan, re-run under a cap.
 * Re-deriving it here is how the tiebreak tool ended up returning nine
 * quarterbacks. */
console.log('\n  WHAT THE MODEL SAYS EACH CONSTRAINT COSTS');
console.log('    constraint            drafted shape                       total   delta   unpriced');
console.log('    ' + '-'.repeat(92));
const runs = [['none', '{}'], ['QB <= 1', '{"QB":1}'], ['TE <= 1', '{"TE":1}'],
  ['QB <= 1 and TE <= 1', '{"QB":1,"TE":1}']];
let base = null;
runs.forEach(([label, cfg]) => {
  const out = execFileSync('node', [path.join(__dirname, 'draft_plan.js')],
    { encoding: 'utf8', env: Object.assign({}, process.env, { PLAN_MAX_POS: cfg }) });
  const shape = (out.match(/drafted roster: (\{.*\})/) || [])[1] || '?';
  const total = parseFloat((out.match(/total value ([\d.]+)/) || [])[1]);
  const un = parseInt((out.match(/CANNOT price: (\d+)/) || [])[1], 10);
  if (base === null) base = total;
  console.log('    ' + label.padEnd(22) + shape.padEnd(36)
    + total.toFixed(1).padStart(7) + (total - base >= 0 ? '  +' : '  ')
    + (total - base).toFixed(1).padStart(5) + String(un).padStart(10));
});

/* ── 4. THE PART THAT DECIDES IT ──────────────────────────────────────────
 * A cost is only a reason if the model can resolve it. This compares the cost
 * of the constraint against quantities already measured elsewhere in the repo,
 * so the comparison is not invented for the occasion. */
const starters = PLAN.plan.filter(x => !x.bench).reduce((a, x) => a + x.v, 0);
const bench = PLAN.TOTAL - starters;
console.log('\n  CAN THE MODEL RESOLVE A 19.8-POINT PREFERENCE? — the scales, all measured');
console.log('    ' + '-'.repeat(72));
console.log('    cost of forcing QB1 and TE1                     19.8 pts');
console.log('    ALL bench insurance value in the plan           ' + bench.toFixed(1) + ' pts'
  + '   (so the two backups are ' + (100 * 19.8 / bench).toFixed(0) + '% of it)');
console.log('    all starter value in the plan                   ' + starters.toFixed(1) + ' pts');
console.log('    sd of ONE running back\'s season projection      ~79 pts   (Barkley, measured)');
console.log('    tiebreak frontier across all 15 picks           42 pts    (tiebreak_frontier.js)');
console.log('    MODEL over MARKET, whole draft                  148.1 pts (strategy_compare.js)');
console.log('\n    THE PREFERENCE IS SMALLER THAN THE NOISE ON A SINGLE PLAYER. A model whose');
console.log('    inputs carry an sd of 79 per player cannot defend a 19.8-point roster-shape');
console.log('    claim, and it should not be read as making one.');
console.log('\n    AND THE 19.8 IS NOT LOST TO A BETTER ALTERNATIVE. Constraining QB and TE');
console.log('    turns 2 unpriced picks into 4: the model has nothing to put in their place');
console.log('    and says so. The true comparison is 19.8 points of modelled insurance');
console.log('    against two more FREE OPTIONS whose value is unmodelled — rookies,');
console.log('    handcuffs, breakouts. The model cannot price that side at all, so it is');
console.log('    not evidence against Cory. It is silence.');

/* ── 5. THE NULL I CANNOT CLOSE, STATED RATHER THAN GLOSSED ───────────────
 * The obvious next step -- "measure whether QB/TE are rentable" -- was
 * attempted and the first metric came back 90-100% for every position, which is
 * a threshold nothing fails and therefore no information at all. */
console.log('\n  WHAT I COULD NOT SETTLE');
console.log('    "Is QB rentable?" is the question that would decide this on evidence, and');
console.log('    this data cannot answer it. Two metrics disagree because ROSTER DEPTH and');
console.log('    CHURN are confounded — teams roster 4.4 RBs against 1.8 QBs, so RB churns');
console.log('    more in absolute terms while QB churns more per rostered player:');
console.log('      distinct players per STARTING slot:  RB 3.27 > WR 3.23 > DEF 3.00 > TE 2.77 > QB 2.67 > K 2.03');
console.log('      waiver adds per DISTINCT player:     DEF 2.30 > K 1.39 > QB 1.15 > TE 1.05 > RB 0.82 > WR 0.68');
console.log('    Neither is the quantity the bench equation needs, which is the LEVEL of the');
console.log('    best free player at each position in week 6. That requires realized weekly');
console.log('    points, which are not on disk. It is a C request and it is the same');
console.log('    dependency the September component grades are waiting on.');
