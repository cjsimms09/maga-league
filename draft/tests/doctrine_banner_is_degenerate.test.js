// TERRITORY: relay measures · A owns the constant and the banner design
// THE DOCTRINE LEADER GAP IS EXACTLY ZERO AT EVERY ONE OF CORY'S PICKS.
//
// Register 4x asks for `DG_NOISE_BAND` to be re-derived so the banner can fire.
// It cannot be made to fire by any band, and this file is why.
//
// `scoreBoardDetail` scores a doctrine as the E[$] of the best board player that
// doctrine PERMITS. A doctrine that does not forbid the top-of-board player
// therefore scores exactly the unconstrained maximum — the same number as every
// other non-forbidding doctrine. A doctrine that DOES bind scores strictly
// lower, by definition of binding. So the leader is always a non-binding
// doctrine, tied with all the other non-binding ones, and first-minus-second is
// a subtraction of one number from itself.
//
// The switch condition is `challenger - current > band`. With the gap pinned at
// 0 that is false for every band >= 0, and false at a band of zero too, because
// the comparison is strict.
//
// ── WHAT THIS FILE IS CAREFUL ABOUT ─────────────────────────────────────────
//
// It asserts the MECHANISM, not today's dollar figures. A new board changes
// every score; it does not change the fact that non-binding doctrines tie. So
// the assertions are about ties and binding, and the one number pinned exactly
// is the leader gap — which is structurally zero, not incidentally small.
//
// ⚠️ AND IT IS BUILT TO DIE. If someone re-scores doctrines over the PLAN they
// imply across remaining picks (what the Lab's archetypes actually do), the gaps
// go non-zero and these assertions fail. That is the correct outcome: this file
// pins a limitation, and the day the limitation is lifted it should be deleted,
// not adjusted.
//
// Run: node draft/tests/doctrine_banner_is_degenerate.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const D = require(path.join(ROOT, 'public', 'js', 'draft', 'doctrine.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const CFG = { DG_HIGH_K: 0.22, DG_ENTRY_K: 0.08, DG_RS_K: 0.05 };
const REP = B.replacement.replacement_points;
const dollarsOf = p => {
  const m = Math.max(0, (p.proj_mean || 0) - (REP[p.position] || 0));
  const c = p.proj_ceiling != null ? p.proj_ceiling : p.proj_mean;
  return CFG.DG_HIGH_K * Math.max(0, c - (p.proj_mean || 0))
    + (CFG.DG_ENTRY_K + CFG.DG_RS_K) * m;
};
const entries = B.players.filter(p => (p.proj_mean || 0) > 0).map(p => ({ player: p }));
const picks = ((B.pick_order || {}).my_picks) || [];

// ── 0. THE INPUTS ARE REAL, OR EVERY NULL BELOW IS VACUOUS ─────────────────
{
  ck('CONTROL: Cory\'s picks are loaded from pick_order.my_picks — an empty '
    + 'list would make every "gap is zero" check below pass on no data',
  picks.length >= 10, picks);
  ck('CONTROL: the board is priced, so the doctrine scores are real dollars',
    entries.length > 400 && entries.some(e => dollarsOf(e.player) > 0),
    entries.length);
}

// ── 1. THE GAP, AT EVERY PICK ──────────────────────────────────────────────
const perPick = picks.map((pk, idx) => {
  const d = D.scoreBoardDetail(entries, { dollarsOf, liveIndex: idx + 1, roster: [] });
  const s = Object.entries(d).map(([k, v]) => [k, v.score]).sort((a, b) => b[1] - a[1]);
  return {
    pick: pk,
    gap: s[0][1] - s[1][1],
    distinct: new Set(s.map(x => x[1])).size,
    binds: Object.entries(d).filter(([, v]) => v.binds).map(([k]) => k),
    tiedAtTop: s.filter(x => x[1] === s[0][1]).length,
  };
});

{
  ck('DEFECT: the leader gap is EXACTLY zero at every one of Cory\'s picks — '
    + 'not small against a $4 band, zero',
  perPick.every(r => r.gap === 0),
  perPick.map(r => r.pick + ':' + r.gap.toFixed(3)));

  ck('...so no value of DG_NOISE_BAND can satisfy `challenger - current > band`, '
    + 'including zero, because the comparison is strict',
  perPick.every(r => !(r.gap > 0)));

  ck('at least six of the nine doctrines are TIED at the top at every pick, '
    + 'which is the reason the gap is zero',
  perPick.every(r => r.tiedAtTop >= 6),
  perPick.map(r => r.pick + ':' + r.tiedAtTop + ' tied'));
}

// ── 2. THE MECHANISM, NOT THE NUMBERS ──────────────────────────────────────
{
  /* A binding constraint scores strictly LOWER — that is what binding means —
   * so a doctrine that binds can never be the leader, and the leader is always
   * drawn from the tied non-binding block. Asserting this makes the zero above
   * explicable rather than a coincidence of one board. */
  const d = D.scoreBoardDetail(entries, { dollarsOf, liveIndex: 2, roster: [] });
  const bind = Object.entries(d).filter(([, v]) => v.binds);
  const free = Object.entries(d).filter(([, v]) => !v.binds);

  ck('KNOWN-POSITIVE: some constraint DOES bind at an early pick, so the '
    + 'binding machinery works and the ties are not "nothing is implemented"',
  bind.length >= 1, bind.map(([k]) => k));

  ck('every NON-binding doctrine scores the identical unconstrained maximum',
    new Set(free.map(([, v]) => v.score)).size === 1,
    free.map(([k, v]) => k + '=' + v.score));

  ck('every BINDING doctrine scores strictly lower, so it can never lead',
    bind.every(([, v]) => v.score < free[0][1].score),
    bind.map(([k, v]) => k + '=' + v.score));
}

// ── 3. THE CONSTANT'S ORIGIN, PINNED AS UNDERIVED ──────────────────────────
{
  /* 4x asks what the $4 was derived from and says "if the answer is 'a chosen
   * round number,' say so." It is. This asserts the state of the evidence, so
   * that if someone later DOES derive it, this check fails and gets updated
   * with the derivation rather than the claim quietly changing. */
  const eng = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'), 'utf8');
  ck('DG_NOISE_BAND is still the undocumented 4.0 — a chosen round number, '
    + 'later cited as though measured (engine.js:321)',
  /DG_NOISE_BAND:\s*4\.0/.test(eng));

  ck('CONTROL: the file really was read and does define the other dollar '
    + 'constants, so the check above is not matching an empty string',
  /DG_HIGH_K:\s*0\.22/.test(eng) && /DG_ENTRY_K:\s*0\.08/.test(eng));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
