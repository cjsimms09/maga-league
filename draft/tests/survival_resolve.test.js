// TERRITORY: A
// THE SHORTEST LOOP IN THE MODEL, CLOSED.
//
// `loop_closure.js` measured seven claims the model makes and never learns
// from. This closes the one with the shortest feedback cycle and the highest
// leverage: a survival call names a pick, and within a handful of picks the
// player is either on the board or gone. **The draft grades it, during the
// draft.** And survival drives expectedBestAvailable, which is VONA, which is
// 62% of what moves the composite — so this grades the input Cory said has to
// be locked solid.
//
// ── THE TRAP THIS FILE EXISTS TO KEEP SHUT ────────────────────────────────
//
// Resolving a capture whose `to_pick` has not been reached would score every
// still-open prediction as a correct "survived" and produce a model with a
// perfect record. Absence of a pick is not evidence he lasted; it is evidence
// the draft has not got there. §1 is that arm.
//
// ── WHY BRIER, AND WHY A BASELINE SHIPS WITH IT ───────────────────────────
//
// These are probabilities, not calls. "Survives with p=0.7" is not wrong when
// he goes — it is wrong only if 0.7 was the wrong number. Accuracy would reward
// a model that said 1.0 and 0.0 about everything and punish an honest 0.7.
// Brier cannot be gamed that way. And a Brier score alone is unreadable, so the
// row carries what always-predicting-the-base-rate would have scored: beat that
// and the model knows WHICH player survives, not merely how many.
//
// Run: node draft/tests/survival_resolve.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const S = require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};
const cap = (from, to, est) => [{ _key: from + '>' + to, pick: from,
  payload: { to_pick: to, estimates: est } }];
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-6);

// ── 1. IT REFUSES TO GRADE WHAT THE DRAFT HAS NOT REACHED ───────────────
{
  const c = cap(33, 48, [{ player_id: 'a', survival: 0.9 }, { player_id: 'b', survival: 0.2 }]);
  ck('a capture whose to_pick is beyond the last pick made resolves to NOTHING',
    S.resolveSurvival(c, { picks: [{ overall: 40, player_id: 'b' }] }).length === 0);
  ck('CONTROL — the same capture DOES resolve once the draft reaches to_pick, so '
    + 'the refusal above is about timing and not a broken resolver',
  S.resolveSurvival(c, { picks: [{ overall: 40, player_id: 'b' },
    { overall: 48, player_id: 'z' }] }).length === 1);

  /* WHY IT MATTERS, stated as the number it would have produced: resolving
   * early scores every un-taken player as a correct survival. */
  const early = S.resolveSurvival(c, { picks: [{ overall: 34, player_id: 'q' }] });
  ck('FAIL ARM — had it resolved early, both players would have scored as '
    + 'survived and the model would show a flawless record it had not earned',
  early.length === 0);
  ck('an empty pick log resolves nothing rather than grading against silence',
    S.resolveSurvival(c, { picks: [] }).length === 0);
}

// ── 2. THE BRIER ARITHMETIC, CHECKED BY HAND ────────────────────────────
{
  // a: said 0.9, survived (1) -> 0.01 | b: said 0.2, taken (0) -> 0.04
  // c: said 0.5, survived (1) -> 0.25 | mean = 0.30/3 = 0.10
  const c = cap(33, 48, [{ player_id: 'a', survival: 0.9 },
    { player_id: 'b', survival: 0.2 }, { player_id: 'c', survival: 0.5 }]);
  const r = S.resolveSurvival(c, { picks: [{ overall: 40, player_id: 'b' },
    { overall: 48, player_id: 'z' }] })[0].payload;
  ck('every estimate is graded, none dropped', r.n === 3, r.n);
  ck('the Brier score is the mean squared error of the probabilities',
    near(r.brier, 0.1), r.brier);
  ck('the survivor/taken outcomes are recorded per player, with WHERE he went',
    r.results.find(x => x.player_id === 'b').taken_at === 40
      && r.results.find(x => x.player_id === 'a').taken_at === null,
    r.results.map(x => [x.player_id, x.survived, x.taken_at]));

  // base rate 2/3; baseline Brier = (1/9 + 4/9 + 1/9)/3 = 0.2222
  ck('it carries the base rate actually observed', near(r.base_rate, 0.667, 1e-3), r.base_rate);
  ck('and what always predicting that base rate would have scored — a Brier '
    + 'score with nothing to compare against is unreadable',
  near(r.baseline_brier, 0.222222, 1e-5), r.baseline_brier);
  ck('skill is the fraction of the baseline\'s error removed',
    near(r.skill, 0.55, 1e-3), r.skill);
}

// ── 3. A MODEL WITH NO INFORMATION MUST SCORE ZERO SKILL ────────────────
// The control that makes a positive number mean something.
{
  // Four players, two survive. A forecaster who says 0.5 about everyone knows
  // the base rate and nothing else — that is exactly zero skill, by construction.
  const c = cap(10, 20, [{ player_id: 'a', survival: 0.5 }, { player_id: 'b', survival: 0.5 },
    { player_id: 'c', survival: 0.5 }, { player_id: 'd', survival: 0.5 }]);
  const r = S.resolveSurvival(c, { picks: [{ overall: 12, player_id: 'a' },
    { overall: 13, player_id: 'b' }, { overall: 20, player_id: 'z' }] })[0].payload;
  ck('CONTROL — predicting the base rate for everyone scores exactly zero skill',
    near(r.skill, 0, 1e-9), { skill: r.skill, brier: r.brier, base: r.baseline_brier });

  // And a model that is confidently WRONG must go negative, or "skill" is a
  // number that only ever flatters.
  const bad = cap(10, 20, [{ player_id: 'a', survival: 0.95 }, { player_id: 'b', survival: 0.95 },
    { player_id: 'c', survival: 0.05 }, { player_id: 'd', survival: 0.05 }]);
  const rb = S.resolveSurvival(bad, { picks: [{ overall: 12, player_id: 'a' },
    { overall: 13, player_id: 'b' }, { overall: 20, player_id: 'z' }] })[0].payload;
  ck('CONTROL — a confidently WRONG model scores NEGATIVE skill, so the metric '
    + 'can punish and not only praise', rb.skill < 0, rb.skill);
}

// ── 4. SKILL IS UNDEFINED, NOT ZERO, WHEN NOTHING COULD BE LEARNED ──────
{
  const c = cap(10, 20, [{ player_id: 'a', survival: 0.8 }, { player_id: 'b', survival: 0.6 }]);
  const r = S.resolveSurvival(c, { picks: [{ overall: 20, player_id: 'z' }] })[0].payload;
  ck('when every player survives, the base rate is already perfect and skill is '
    + 'null rather than 0 — reporting 0 would read as "no skill" when the truth '
    + 'is "this round cannot show skill"', r.skill === null, r.skill);
  ck('and the row SAYS so, so a null is never mistaken for a missing field',
    /undefined/.test(r.skill_note), r.skill_note);
  ck('the Brier score is still reported — the calls were still right or wrong',
    r.brier > 0, r.brier);
}

// ── 5. THE WINDOW BOUNDARIES ────────────────────────────────────────────
// Off-by-one here silently rewrites every outcome.
{
  const est = [{ player_id: 'x', survival: 0.5 }];
  const at = S.resolveSurvival(cap(10, 20, est),
    { picks: [{ overall: 20, player_id: 'x' }] })[0].payload;
  ck('a player taken AT to_pick did NOT survive to it', at.results[0].survived === 0,
    at.results[0]);

  const before = S.resolveSurvival(cap(10, 20, est),
    { picks: [{ overall: 5, player_id: 'x' }, { overall: 20, player_id: 'z' }] })[0].payload;
  ck('a player taken BEFORE the call was never in the pool being predicted over, '
    + 'so he counts as surviving the window rather than as a miss',
  before.results[0].survived === 1, before.results[0]);

  const during = S.resolveSurvival(cap(10, 20, est),
    { picks: [{ overall: 11, player_id: 'x' }, { overall: 20, player_id: 'z' }] })[0].payload;
  ck('and a player taken strictly inside the window did not survive',
    during.results[0].survived === 0 && during.results[0].taken_at === 11);
}

// ── 6. THE WIRING — CAPTURED, DEDUPED, RESOLVED ONCE, NOT IN A MOCK ─────
{
  const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  ck('the capture is remembered client-side, because the resolution needs the '
    + 'original call back and only the client has it mid-draft',
  /state\.survivalCaptures/.test(app));
  ck('captures are de-duplicated on (pick, to_pick) — this render path can fire '
    + 'twice for one pick and a doubled capture double-weights that pick',
  /_key === sKey/.test(app));
  ck('the resolver runs from the pick sync, beside the forecast resolver that '
    + 'already works', /resolveSurvivalCalls\(picks\);/.test(app));
  ck('it is GATED on mockMode — a rehearsal is not forward evidence',
    /function resolveSurvivalCalls[\s\S]{0,200}state\.mockMode/.test(app));
  ck('and a capture is marked resolved only when ITS OWN resolution is written, '
    + 'not all of them — marking all would drop the ones not yet reached',
  /c\._key === key/.test(app));
  ck('the resolution is written as its own ledger kind so it can be found',
    /'survival_resolved'/.test(app));

  /* ⚠ MY FIRST VERSION OF THIS CHECK WAS `/'survival_resolved'/.test(kinds) ||
   * /survival/.test(kinds)` — and the second clause is trivially true, because
   * `survival` is itself a declared kind. It passed while `survival_resolved`
   * was NOT declared, which `buildEntry` rejects outright: the loop would have
   * read as closed in the code and been empty in the data. Asserted against the
   * server's real list instead of a substring of the file. */
  const SRV = require(path.join(ROOT, 'src', 'predledger.js'));
  ck('the resolution kind is DECLARED on the server — an undeclared kind is '
    + 'REJECTED by buildEntry, so the rows would vanish and the loop would look '
    + 'closed while collecting nothing',
  SRV.KINDS.indexOf('survival_resolved') >= 0, SRV.KINDS.length);
  ck('CONTROL — a kind that is genuinely absent is reported absent, so the check '
    + 'above is not matching anything that happens to be in the file',
  SRV.KINDS.indexOf('survival_resolved_typo') < 0);
  /* AND THE REJECTION IS REAL, exercised rather than quoted. */
  let threw = '';
  try { SRV.buildEntry({ kind: 'not_a_real_kind', payload: {} }, { nowIso: 'x', seq: 1 }); }
  catch (e) { threw = String(e.message); }
  ck('FAIL ARM — buildEntry really does refuse an unknown kind, which is why the '
    + 'declaration matters', /unknown ledger kind/.test(threw), threw);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: a survival call is graded only once the draft has');
console.log('actually reached the pick it spoke about, scored by Brier against the base-rate');
console.log('forecaster, with skill negative when the model is confidently wrong and null');
console.log('when the round could not show skill at all. Window boundaries are pinned on');
console.log('both sides, and the wiring captures once, resolves once, and never in a mock.');
console.log('WHAT IT DOES NOT: prove the survival MODEL is good. It builds the instrument');
console.log('that will say so on 22 August — the first real numbers arrive with the draft.');
