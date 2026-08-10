/* COHERENCE (feature A) — the one-voice resolver, tested on CONSTRUCTED conflict
 * boards (Cory's audit: build states where the signals disagree, check the voice).
 * Run: node draft/tests/coherence.test.js
 */
'use strict';
const C = require('../../public/js/draft/coherence.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// --- obvious pick: everything agrees -> quiet, take -------------------------
{
  const r = C.resolve([
    { name: 'value', stance: 'for', magnitude: 80, cite: 'VORP' },
    { name: 'need', stance: 'for', magnitude: 40 },
    { name: 'market-reliability', stance: 'for', magnitude: 35 },
  ]);
  check('all-agree is a quiet take', r.verdict === 'take' && r.loud === false, JSON.stringify(r));
}

// --- CONTESTED: strong value vs a material market/dead-zone AGAINST ----------
{
  const r = C.resolve([
    { name: 'value', stance: 'for', magnitude: 70, cite: 'VORP' },
    { name: 'dead-zone', stance: 'against', magnitude: 60, cite: 'exp25+BBM' },
  ]);
  check('a real two-sided conflict is CONTESTED and loud', r.verdict === 'contested' && r.loud === true, JSON.stringify(r));
  check('the dissent names the opposing signal', r.dissent.indexOf('dead-zone') >= 0);
  check('the voice says slow down', /slow down/.test(r.voice));
}

// --- the exp25 tempering: elite RB value OVERRIDES the dead-zone PRIOR --------
{
  // dead-zone marker is a PRIOR (magnitude small, prior:true); an elite measured
  // value on the other side must NOT read as contested — "don't let the dead zone
  // override a genuinely elite RB value."
  const r = C.resolve([
    { name: 'value', stance: 'for', magnitude: 120, cite: 'VORP' },
    { name: 'dead-zone', stance: 'against', magnitude: 20, prior: true, cite: 'exp25' },
  ]);
  check('an elite value overrides the dead-zone PRIOR (take, not contested)',
    r.verdict === 'take' && r.loud === false, JSON.stringify(r));
}

// --- but a dead-zone prior DOES bite a marginal pick -------------------------
{
  // no strong value edge; the dead-zone prior is the only real signal -> lean pass,
  // quiet (a prior alone is not "contested", it just steers the default).
  const r = C.resolve([
    { name: 'value', stance: 'for', magnitude: 10 },
    { name: 'dead-zone', stance: 'against', magnitude: 25, prior: true, cite: 'exp25' },
  ]);
  check('a marginal RB in the dead zone leans pass, quietly', r.lean === 'against' && !r.loud, JSON.stringify(r));
}

// --- plan-adherence nudge: taking against the plan prints the measured cost --
{
  const r = C.resolve([
    { name: 'value', stance: 'for', magnitude: 45, cite: 'VORP' },
    { name: 'plan', stance: 'against', magnitude: 55, cite: 'Nacua gap' },
  ], { planStance: 'against' });
  check('deviating from the plan is loud with a $ cost', r.loud === true && r.planNudge && r.planNudge.cost === 55, JSON.stringify(r));
  check('the nudge cites the gap', /measured cost ≈ \$55/.test(r.voice) && /Nacua gap/.test(r.voice));
}

// --- immaterial disagreement stays quiet (below the null-p95 material bar) ----
{
  const r = C.resolve([
    { name: 'value', stance: 'for', magnitude: 65 },
    { name: 'need', stance: 'against', magnitude: 12 },   // < MATERIAL (30)
  ]);
  check('an immaterial dissent does not make a clear take go loud',
    r.verdict === 'take' && r.loud === false && r.dissent.length === 0, JSON.stringify(r));
  check('MATERIAL bar is the tournament null p95 ($30)', C.MATERIAL === 30);
}

// --- no signal -> take the market default -----------------------------------
{
  const r = C.resolve([]);
  check('empty signals -> market default, quiet', r.verdict === 'obvious' && !r.loud, JSON.stringify(r));
}

console.log(`\n${pass}/${pass + fail} coherence checks passed`);
process.exit(fail ? 1 : 0);
