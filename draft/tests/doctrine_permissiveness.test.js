// TERRITORY: A
// THE DOCTRINE PANEL WAS RANKING PERMISSIVENESS, AND CORY READ IT AS ADVICE.
//
// Cory: "the last time I looked at war room it said take early QB". It did, in
// two independent places, and this file pins the second of them.
//
//     scoreBoard(k) = E[$] of the best board player doctrine k LETS me take now
//
// The banner presented that as what a plan is WORTH. Those are different
// quantities, and the difference is not subtle. On the live board at Cory's
// first pick (33), EIGHT of nine doctrines score $67.0 — the board leader — and
// Late-QB Patience alone scores $46.0 and ranks last of nine. The eight tie
// because none of their constraints binds there, so each returns the
// unconstrained maximum. The ninth differs ONLY because it is forbidden from the
// man topping the board.
//
// So the ranking has exactly one degree of freedom — whose constraint happens to
// bite — and none whatsoever about which plan is better.
//
// ── THE PART THAT IS ALGEBRA, NOT A PROPERTY OF THIS BOARD ────────────────
//
// At live pick i < 8 the late_qb pool is a strict SUBSET of the unconstrained
// pool, so its score can never exceed it under ANY pricing function. Late-QB
// Patience is structurally incapable of leading this panel. §2 proves that over
// randomised boards rather than asserting it from the source.
//
// ── AND THE COST IS CHARGED ONE-SIDED ─────────────────────────────────────
//
// Deferring a quarterback buys a better RB/WR at THIS pick and pays for it at a
// LATER one. `forgone` sees only the decline. `slot_schedule.js` computes the
// two-sided version — a DP over 15 picks x 2^6 slot states, verified against
// brute force over 3,603,600 assignments — and the comparison INVERTS once you
// look past the next pick: QB falls 103 points across the draft, RB/WR 139.
//
// The fix does NOT price the later half. It stops reporting the earlier half as
// a ranking, and says which number is missing.
//
// Run: node draft/tests/doctrine_permissiveness.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const D = require(path.join(ROOT, 'public', 'js', 'draft', 'doctrine.js'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const dollarsOf = p => E.playerDollars(p).total;
const POOL = B.players.filter(p => p.position && Number.isFinite(+p.proj_mean));
const BY_ADP = POOL.filter(p => p.adp != null).sort((a, b) => a.adp - b.adp);
const KEEPERS = [{ position: 'WR' }, { position: 'RB' }, { position: 'RB' }];
const MY = (B.pick_order || {}).my_picks || [];

// The board as it stands at pick `pk`, assuming the room drafts in ADP order.
function boardAt(pk) {
  const gone = new Set(BY_ADP.slice(0, pk - 1).map(p => p.player_id));
  return POOL.filter(p => !gone.has(p.player_id))
    .sort((a, b) => dollarsOf(b) - dollarsOf(a))
    .slice(0, 150).map(p => ({ player: p }));
}

// ── 1. THE PANEL AT CORY'S REAL PICKS ───────────────────────────────────
{
  const rows = boardAt(MY[0]);
  const det = D.scoreBoardDetail(rows, { liveIndex: 1, roster: KEEPERS, dollarsOf });
  const scores = {}; Object.keys(det).forEach(k => { scores[k] = det[k].score; });
  const ranked = D.rankDoctrines(scores);

  ck('at Cory\'s first pick EIGHT of the nine doctrines carry the SAME number, '
    + 'because none of their constraints binds there',
  ranked.filter(r => Math.abs(r.score - ranked[0].score) < 0.01).length === 8,
  ranked.map(r => [r.key, r.score]));

  ck('and the ninth — Late-QB Patience — is last of nine',
    ranked[ranked.length - 1].key === 'late_qb', ranked.map(r => r.key));

  ck('its whole deficit is the man it is forbidden from taking, who is a QB',
    det.late_qb.binds && det.late_qb.declined.position === 'QB',
    det.late_qb);

  /* THE NUMBER IS REAL AND THE SENTENCE WAS NOT. $21 of decline is a true
   * measurement of one half of a two-sided trade. */
  ck('the decline is material — this is not a rounding artifact',
    det.late_qb.forgone > 15, det.late_qb.forgone);

  ck('CONTROL — every non-binding doctrine reports forgone exactly 0, so `binds` '
    + 'is not just "has a constraint"',
  Object.keys(det).filter(k => !det[k].binds).every(k => det[k].forgone === 0),
  Object.keys(det).map(k => [k, det[k].binds, det[k].forgone]));
}

// ── 2. THE ALGEBRAIC CLAIM, OVER RANDOMISED BOARDS ──────────────────────
// Not "it happens on this board" — it cannot happen otherwise.
{
  let violations = 0, bindingRounds = 0;
  const POS = ['QB', 'RB', 'WR', 'TE'];
  for (let s = 0; s < 300; s++) {
    // A deterministic pseudo-random board, so a failure is reproducible.
    let x = s * 2654435761 % 4294967296;
    const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
    const rows = [];
    for (let j = 0; j < 40; j++) {
      rows.push({ player: { position: POS[Math.floor(rnd() * 4)], name: 'p' + j,
        proj_mean: 100 + rnd() * 300 } });
    }
    const dOf = p => p.proj_mean;
    for (let i = 1; i <= 7; i++) {
      const det = D.scoreBoardDetail(rows, { liveIndex: i, roster: [], dollarsOf: dOf });
      const top = Math.max.apply(null, Object.keys(det).map(k => det[k].score));
      if (det.late_qb.score > top + 1e-9) violations++;
      if (det.late_qb.binds) bindingRounds++;
    }
  }
  ck('over 300 randomised boards x 7 live picks, Late-QB Patience NEVER scores '
    + 'above the panel maximum — it is structurally unable to lead',
  violations === 0, { violations: violations });
  ck('CONTROL — and it DID bind in a large share of those rounds, so the result '
    + 'above is not "the constraint never applied"',
  bindingRounds > 300, { bindingRounds: bindingRounds, of: 2100 });
}

// ── 3. THE CONTROL THAT PROVES `binds` TRACKS THE BOARD ─────────────────
// If the top man is not a quarterback, late_qb declines nothing and must tie.
{
  const noQb = [
    { player: { position: 'RB', name: 'Back', proj_mean: 300 } },
    { player: { position: 'WR', name: 'Wideout', proj_mean: 280 } },
    { player: { position: 'QB', name: 'Passer', proj_mean: 200 } },
  ];
  const det = D.scoreBoardDetail(noQb, { liveIndex: 1, roster: [], dollarsOf: p => p.proj_mean });
  ck('CONTROL — when an RB tops the board, Late-QB Patience does NOT bind and '
    + 'ties the field, so `binds` is a fact about the board and not a label',
  det.late_qb.binds === false && det.late_qb.score === det.balanced.score,
  { late_qb: det.late_qb, balanced: det.balanced });

  const qbTop = [
    { player: { position: 'QB', name: 'Passer', proj_mean: 300 } },
    { player: { position: 'RB', name: 'Back', proj_mean: 250 } },
  ];
  const d2 = D.scoreBoardDetail(qbTop, { liveIndex: 1, roster: [], dollarsOf: p => p.proj_mean });
  ck('and when a QB tops it, the decline is exactly the gap to the best man it '
    + 'may still take — the arithmetic is stated, not approximated',
  d2.late_qb.binds && Math.abs(d2.late_qb.forgone - 50) < 1e-9, d2.late_qb);
}

// ── 4. THE FIX: A DEFERRAL IS REPORTED AS ONE ───────────────────────────
{
  const rows = boardAt(MY[0]);
  const det = D.scoreBoardDetail(rows, { liveIndex: 1, roster: KEEPERS, dollarsOf });
  const scores = {}; Object.keys(det).forEach(k => { scores[k] = det[k].score; });

  const fixed = new D.DoctrineState('balanced', { noiseBand: 4, minPicks: 2 })
    .update(scores, MY[0], { detail: det });
  ck('WITH the detail the pick reads as doctrine-NEUTRAL, which is what an '
    + 'eight-way tie actually is', fixed.neutral === true, fixed.confidence);
  ck('and the deferral is reported separately, naming the position deferred',
    fixed.deferrals.length === 1 && fixed.deferrals[0].key === 'late_qb'
      && fixed.deferrals[0].declined.position === 'QB', fixed.deferrals);
  ck('the deferral still carries its dollar decline — the fix does not hide the '
    + 'cost, it stops calling the cost a ranking',
  fixed.deferrals[0].forgone > 15, fixed.deferrals[0]);
  ck('and a deferring doctrine is NOT offered as the live alternative',
    fixed.alternative_key !== 'late_qb', fixed.alternative_key);

  /* FAIL ARM — the defect reproduced rather than remembered. */
  const old = new D.DoctrineState('balanced', { noiseBand: 4, minPicks: 2 })
    .update(scores, MY[0], {});
  ck('FAIL ARM — without the detail the old sentence comes back: Late-QB '
    + 'Patience presented as an alternative that TRAILS by a dollar figure',
  old.neutral === false && old.alternative === 'Late-QB Patience' && old.gap > 15,
  { neutral: old.neutral, alternative: old.alternative, gap: old.gap });
  ck('FAIL ARM — and the old confidence line called that pick "on script" rather '
    + 'than doctrine-free', /on script/.test(old.confidence), old.confidence);
}

// ── 5. IT HELD AT EVERY PICK CORY OWNS, NOT JUST THE FIRST ──────────────
{
  const bad = [];
  MY.slice(0, 6).forEach((pk, idx) => {
    const det = D.scoreBoardDetail(boardAt(pk),
      { liveIndex: idx + 1, roster: KEEPERS, dollarsOf });
    const scores = {}; Object.keys(det).forEach(k => { scores[k] = det[k].score; });
    const out = new D.DoctrineState('balanced', { noiseBand: 4, minPicks: 2 })
      .update(scores, pk, { detail: det });
    if (!out.neutral) bad.push([pk, out.alternative, out.gap]);
  });
  ck('every one of Cory\'s first six picks now reads doctrine-neutral instead of '
    + 'showing a QB-deferral contest', bad.length === 0, bad);
}

// ── 6. THE OLD CALLERS ARE UNTOUCHED ────────────────────────────────────
// scoreBoard's {key: dollars} shape is what every existing test and consumer
// was written against. A "fix" that changed it would be a second defect.
{
  const rows = boardAt(MY[0]);
  const flat = D.scoreBoard(rows, { liveIndex: 1, roster: KEEPERS, dollarsOf });
  const det = D.scoreBoardDetail(rows, { liveIndex: 1, roster: KEEPERS, dollarsOf });
  ck('scoreBoard still returns {key: number} and agrees with the detail view',
    Object.keys(flat).every(k => typeof flat[k] === 'number' && flat[k] === det[k].score),
    Object.keys(flat).slice(0, 3).map(k => [k, flat[k], det[k].score]));
  ck('and update() without ctx.detail keeps its previous semantics exactly, so '
    + 'no caller silently changed meaning',
  new D.DoctrineState('balanced', {}).update(flat, 1, {}).deferrals.length === 0);
}

// ── 7. THE ENROLLED PLAN IS GONE FROM THE SHIPPED BOARD ─────────────────
// The other half of "the war room said take early QB": `early_qb` was ENROLLED,
// GOVERNING, and tilting recommendations. The race that enrolled it is void —
// its control could not field a quarterback in 198 of 200 rooms.
{
  const enr = D.enrollment(B.doctrine);
  ck('no doctrine is enrolled on the shipped board', enr.enrolled === false,
    B.doctrine);
  ck('so the banner says it is running the control rather than naming a plan',
    /no doctrine enrolled/.test(D.governanceLine(enr.enrolled)),
    D.governanceLine(enr.enrolled));
  ck('and the control tilts nothing — every position reads 0',
    ['QB', 'RB', 'WR', 'TE'].every(p => D.prefers(enr.key, p, 1, []) === 0),
    ['QB', 'RB', 'WR', 'TE'].map(p => [p, D.prefers(enr.key, p, 1, [])]));

  const cc = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'draft', 'backtest', 'cory-conditional.json'), 'utf8'));
  ck('the race artifact records WHY nothing enrolled, so the next reader does '
    + 'not re-enroll it', !!cc.void_reason && /could not field/.test(cc.void_reason),
  cc.void_reason);
  ck('and it keeps the control-validity measurement that voided it',
    cc.control_validity && cc.control_validity.rate > 0.5, cc.control_validity);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the panel can no longer present a one-step deferral cost');
console.log('as a plan ranking. The eight-way tie reads as doctrine-neutral, the deferral is');
console.log('named with its position and its dollar decline, and the claim that Late-QB');
console.log('Patience cannot lead is proved over randomised boards rather than quoted.');
console.log('WHAT IT DOES NOT: price the other half of the trade. What deferring a QB BUYS at');
console.log('a later pick is still unmodelled here — slot_schedule.js computes it and nothing');
console.log('on this surface reads it. Until that lands the honest surface says "cost here,');
console.log('gain not counted", which is why the deferral line says exactly that.');
