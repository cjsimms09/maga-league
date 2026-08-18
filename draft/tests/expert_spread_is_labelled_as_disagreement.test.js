// TERRITORY: relay measures · A ordered the label · B renders it
// THE EXPERT-SPREAD BADGE SAYS "DISAGREEMENT" AND MUST NEVER SAY "UPSIDE".
//
// Register 4u: "a war-room column is about to show a number that was measured
// not to predict anything." The DATA is sound — expert disagreement is genuinely
// per-player (365 distinct spreads, ρ(ECR, spread) 0.855). What it is not is
// predictive: graded on 1,111 player-seasons 2023-25 (prereg §10, ledger P4),
// P(top-12 finish at position) moves −0.0134 within ECR band. Effectively zero,
// and NEGATIVE.
//
// So the row's ask was never a veto — it was that the LABEL match the
// MEASUREMENT: "caption it as disagreement, never as upside/ceiling/breakout."
//
// ── THIS FILE EXISTS BECAUSE THE ASK WAS ALREADY MET, AND THAT IS FRAGILE ───
//
// Checked 2026-08-18: the badge renders "⚡ split" and its tooltip ends
// "Published disagreement, not a model number." A's instruction is quoted
// verbatim in the module header. Nothing needed fixing.
//
// A label that is correct today and guarded by nothing is one well-meaning edit
// from becoming "⚡ upside" — and that edit would be easy to make, because the
// badge marks exactly the players who LOOK like breakouts. The measurement says
// they are not. This pins the wording to the measurement.
//
// Run: node draft/tests/expert_spread_is_labelled_as_disagreement.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(
  path.join(ROOT, 'public', 'js', 'draft', 'expert_spread.js'), 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

// ── 1. THE WORDS THE MEASUREMENT FORBIDS ───────────────────────────────────
{
  /* Strip comments first. A's own prohibition is quoted in the header — "DO NOT
   * present it as a ceiling" — so a naive scan finds "ceiling" and fails on the
   * sentence that exists to prevent the thing. Scanning the CODE, not the prose,
   * is the difference between a guard and a tripwire on its own documentation. */
  const code = SRC
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

  ['upside', 'ceiling', 'breakout', 'sleeper'].forEach(word => {
    ck('the rendered badge never calls it "' + word + '" — the grade says it '
      + 'does not predict a finish, so that framing would be a claim we measured '
      + 'to be false',
    !new RegExp(word, 'i').test(code),
    (code.match(new RegExp('.{0,50}' + word + '.{0,50}', 'i')) || [])[0]);
  });

  /* CONTROL — the scan looks at live code, not at nothing. If comment-stripping
   * ever eats the whole file, every assertion above passes vacuously. */
  ck('CONTROL: the stripped code is still substantial, so the checks above are '
    + 'reading something', code.length > 800, code.length);
  ck('CONTROL: the stripping did NOT remove the header quote from the raw '
    + 'source — A\'s instruction is still on the record',
  /DO NOT present it as a ceiling/.test(SRC));
}

// ── 2. WHAT IT DOES SAY ────────────────────────────────────────────────────
{
  ck('DEFECT-ANSWERED: the badge reads "split", the word the measurement '
    + 'supports', /⚡ split/.test(SRC));
  ck('...and the tooltip names it as published disagreement rather than a '
    + 'model output', /Published disagreement, not a model number/.test(SRC));
  ck('...and it says the comparison is to his ADP NEIGHBOURS, which is the '
    + 'design call that stops every deep player reading as controversial',
  /disagree far more than his neighbors/.test(SRC));
}

// ── 3. DISPLAY-ONLY, VERIFIED RATHER THAN ASSERTED IN A COMMENT ────────────
{
  /* The header claims "nothing here is read by engine.js, composite.js,
   * valuation.js, survival.js or any scoring path". That is the claim that
   * makes a wrong label survivable — it annotates a name, it never moves a
   * rank or a dollar. A claim like that belongs in a test, not a comment. */
  const scoring = ['engine.js', 'composite.js', 'valuation.js', 'survival.js', 'value.js'];
  const leaked = scoring.filter(m => {
    const t = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', m), 'utf8');
    return /expert_?[sS]pread/.test(t);
  });
  ck('DISPLAY-ONLY: no scoring module reads expert spread, so a label mistake '
    + 'can mislead a reader but can never move a number', !leaked.length, leaked);

  /* CONTROL — those files are real and readable, or the null above is a lie. */
  const control = fs.readFileSync(
    path.join(ROOT, 'public', 'js', 'draft', 'engine.js'), 'utf8');
  ck('CONTROL: the scoring modules were actually opened and do contain scoring '
    + 'terms, so "no hits" means absence and not an unread file',
  (control.match(/proj_mean/g) || []).length > 10);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
