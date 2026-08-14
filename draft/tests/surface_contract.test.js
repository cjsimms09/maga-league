// TERRITORY: A
// THE WAR-ROOM CONTRACT, ASSERTED AGAINST THE LIVE CODE.
//
// `draft/backtest/WAR-ROOM-SURFACE-CONTRACT.md` states what each pick-driving
// number IS, what it EXCLUDES, and the sentence a reader could wrongly take
// away. Cory: "make 100% sure what B is showing me matches what model actually
// says. This could ruin whole draft."
//
// ── WHY THE DOCUMENT IS TESTED AND NOT JUST WRITTEN ───────────────────────
//
// Two of the three defects that audit has found so far were DOCUMENTS AND
// LABELS THAT HAD STOPPED BEING TRUE — a caveat naming a sampler the run did not
// use, and a "+$353 season edge" whose experiment was void. A contract that can
// drift is the same failure one level up, and it would be the most damaging
// version of it: the thing everyone checks against.
//
// So every load-bearing claim in that file is re-derived here from the shipped
// engine. If the model changes and the document does not, this goes red.
//
// Run: node draft/tests/surface_contract.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const DOC = path.join(ROOT, 'draft', 'backtest', 'WAR-ROOM-SURFACE-CONTRACT.md');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};
const docRaw = fs.readFileSync(DOC, 'utf8');
// WHITESPACE-NORMALISED. Three of my first assertions failed on prose that says
// exactly what they claimed — the sentences simply wrapped across lines. A regex
// that fails on line width is testing the formatter, not the content.
const doc = docRaw.replace(/\s+/g, ' ');
const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

// ── 1. THE SHIPPED WEIGHTS ARE THE ONES THE DOC DESCRIBES ───────────────
{
  ck('the app initialises from MEASURED_WEIGHTS, which is what makes the '
    + '"five of eight are zero" claim true of PRODUCTION and not of a default',
  /weights: Object\.assign\(\{\}, E\.MEASURED_WEIGHTS/.test(app));

  const zeroed = Object.keys(E.MEASURED_WEIGHTS).filter(k => E.MEASURED_WEIGHTS[k] === 0);
  ck('exactly five terms are zeroed', zeroed.length === 5, zeroed);
  ck('and they are the five the document names',
    JSON.stringify(zeroed.slice().sort())
      === JSON.stringify(['bye', 'ceiling', 'need', 'risk', 'tier']), zeroed);
  const live = Object.keys(E.MEASURED_WEIGHTS).filter(k => E.MEASURED_WEIGHTS[k] !== 0);
  ck('the three that survive are value, keeper and stack — the whole composite',
    JSON.stringify(live.slice().sort()) === JSON.stringify(['keeper', 'stack', 'value']), live);
  ck('the document says so', /`value \+ keeper \+ stack`/.test(doc));
}

// ── 2. THE ZEROS ARE HONEST, AND THE DOC SAYS WHICH KIND ────────────────
// "measured inert" and "could not be measured" are different states, and only
// one of them is a finding. Collapsing them would be the same defect as a null
// reading as a zero.
{
  const prov = E.WEIGHT_PROVENANCE || {};
  ck('the engine records provenance per weight, so the distinction exists in '
    + 'code rather than only in prose', Object.keys(prov).length >= 8, Object.keys(prov).length);
  ck('`ceiling` is recorded as UNMEASURED, not as measured-zero',
    /UNMEASURED/.test(String(prov.ceiling)), prov.ceiling);
  ck('`risk` likewise', /UNMEASURED/.test(String(prov.risk)), prov.risk);
  ck('while `tier` and `need` are recorded as MEASURED',
    /measured/i.test(String(prov.tier)) && !/UNMEASURED/.test(String(prov.tier))
      && /measured/i.test(String(prov.need)) && !/UNMEASURED/.test(String(prov.need)),
    { tier: prov.tier, need: prov.need });
  ck('and the document keeps the two apart rather than calling them all "zero"',
    /measured inert/.test(doc) && /UNMEASURED/.test(doc));
  ck('the unsignable ceiling interval is quoted with its sign ambiguity, which '
    + 'is the reason the weight is 0',
  /−4\.8/.test(doc) && /\[−26, \+17\] interval\*\*: unsignable/.test(doc));
}

// ── 3. A ZERO-WEIGHT TERM REPORTS ZERO, NOT A NUMBER ────────────────────
// The claim that stops a breakdown listing eight terms as if eight were used.
{
  const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'), 'utf8');
  ck('components are multiplied by their weight before being reported, so a '
    + 'zero-weight term cannot show a contribution it did not make',
  /tier: w\.tier \* tier, need: w\.need \* need\.value/.test(src));
  ck('and a reason for a zero-weight term is suppressed rather than printed',
    /if \(w\.need \* need\.value > 0\) reasons\.push/.test(src));
}

// ── 4. THE DOLLAR TERMS ─────────────────────────────────────────────────
{
  const d = E.playerDollars({ proj_mean: 200, proj_ceiling: 260 });
  ck('the dollar figure is a linear rescaling of the projection, exactly as the '
    + 'document states', Math.abs(d.total - (0.22 * 60 + 0.08 * 200 + 0.05 * 200)) < 1e-9,
  d.total);
  ck('the coefficients in the document are the coefficients in the engine',
    /0\.22 × \(ceiling − mean\) \+ 0\.08 × mean \+ 0\.05 × mean/.test(doc)
      && E.CFG.DG_HIGH_K === 0.22 && E.CFG.DG_ENTRY_K === 0.08 && E.CFG.DG_RS_K === 0.05);
  ck('and the collinearity claim holds — entry over rs is the ratio of their '
    + 'constants, for any player',
  Math.abs(d.entry / d.rs - E.CFG.DG_ENTRY_K / E.CFG.DG_RS_K) < 1e-9, d.entry / d.rs);
  ck('the document states it is NOT a simulation of the pot',
    /IS NOT:\*\* a simulation of the pot/.test(doc));
}

// ── 5. VONA IS WHAT THE DOC SAYS, INCLUDING ITS WEAKNESS ────────────────
{
  ck('the document defines VONA over the next player AT THAT POSITION rather '
    + 'than over a starter or replacement',
  /next player at that position/i.test(doc) && /not.*over a \*starter\*/i.test(doc));
  ck('and names the live weakness — survival reads market ADP while our room '
    + 'takes QBs earlier at every slot',
  /market ADP/.test(doc) && /18 of 18/.test(doc));
  ck('and says no correction is fitted, which is the standing decision',
    /No correction is fitted/.test(doc));
  ck('the survival resolver the document points at actually exists',
    typeof require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js')).resolveSurvival
      === 'function');
}

// ── 6. THE PATHS CLAIM ──────────────────────────────────────────────────
{
  ck('the document claims one row per position', /one per position/.test(doc));
  ck('and records the pick-33 WR/RB/RB defect it was written after',
    /WR \/ RB \/ RB/.test(doc));
  ck('PATHS_MAX still bounds the panel at four, as stated',
    E.CFG.PATHS_MAX === 4 && /up to four \*directions\*/.test(doc), E.CFG.PATHS_MAX);
}

// ── 7. IT DOES NOT CLAIM TO BE A COMPLETE SWEEP ─────────────────────────
// A partial audit that reads as finished is worse than no audit: it retires the
// question. This is the assertion that keeps it honest.
{
  ck('the document names what it has NOT audited', /What I have NOT audited yet/.test(doc));
  ck('and says roughly how much is left, so "four surfaces" cannot read as "all '
    + 'of them"', /20 more surfaces/.test(doc));
  ck('it states the four covered are covered BECAUSE they decide a pick',
    /those four decide a pick/.test(doc));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the contract document is re-derived from the shipped');
console.log('engine — the weights, which zeros are measured versus unmeasured, the dollar');
console.log('coefficients and their collinearity, and the paths bound. If the model moves');
console.log('and the document does not, this goes red rather than the document going quietly');
console.log('stale — which is how two of the three defects it describes came to exist.');
console.log('WHAT IT DOES NOT: check what B renders. That half is B\'s and is routed. A');
console.log('contract both sides agree with is the point; this only pins my side of it.');
