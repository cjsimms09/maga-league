// TERRITORY: A
// WHAT WE PREDICT AND NEVER GRADE — and the detector that first got it wrong.
//
// Cory: "This model needs to make as many predictions as reasonably possible and
// close the loop to actually grade these … not necessarily this year but going
// forward." A prediction that is never resolved is storage, not evidence, and
// `loop_closure.js` is the measurement that separates the two.
//
// ── THE BUG IN MY OWN DETECTOR, PINNED HERE BECAUSE IT NEARLY SHIPPED ─────
//
// The first version searched for `send('<kind>'` and reported that almost
// NOTHING was captured — a confident, alarming zero. The client does not call
// `send` at the call sites; it calls named helpers (`PredLedger.survival({...})`)
// and the kind string appears only inside the helper body. A detector blind to
// the shape the code actually uses returns a wrong answer that looks like a
// finding. Same class as everything else this repository keeps catching.
//
// §2 is the guard against that: the helper->kind map is PARSED from
// predledger.js, and a parse that yields nothing must REFUSE rather than report
// a tidy "nothing is captured".
//
// Run: node draft/tests/loop_closure.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const LC = require(path.join(ROOT, 'draft', 'tools', 'loop_closure.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};
const rows = LC.scan();
const by = k => rows.find(r => r.kind === k);

// ── 1. THE KINDS COME FROM THE SERVER'S OWN LIST ────────────────────────
{
  const kinds = LC.declaredKinds();
  ck('the kind list is read out of src/predledger.js, not typed here',
    kinds.length >= 15, kinds.length);
  ck('and it contains the ones the draft actually writes',
    ['recommendation', 'pick', 'survival', 'override'].every(k => kinds.indexOf(k) >= 0));
  ck('every declared kind is classified as gradeable or not — an unclassified '
    + 'kind means nobody can tell a hole from an observation',
  rows.every(r => r.gradeable !== null), rows.filter(r => r.gradeable === null).map(r => r.kind));
}

// ── 2. THE DETECTOR SEES THE SHAPE THE CODE ACTUALLY USES ───────────────
// The check that would have caught my first version.
{
  ck('CONTROL — the detector finds captures for the kinds we KNOW are wired, so '
    + 'a "nothing is captured" report cannot pass as a finding',
  ['recommendation', 'survival', 'pick'].every(k => by(k).captured),
  ['recommendation', 'survival', 'pick'].map(k => [k, by(k).captured]));

  ck('and it names the file, so the claim is checkable rather than a boolean',
    by('survival').capturedIn.length > 0, by('survival').capturedIn);

  /* THE HELPER MAP IS PARSED, NOT TRANSCRIBED. `platformSample` writes
   * `mock_platform_sample` — a pairing no hand-written table would keep right. */
  const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'predledger.js'), 'utf8');
  ck('the helper whose name differs from its kind is present in the source, so '
    + 'the parse has something to get wrong',
  /platformSample: function[^\n]*'mock_platform_sample'/.test(src));
  ck('and the tool resolves it correctly rather than by name-matching',
    by('mock_platform_sample').captured === true);

  /* REFUSAL ARM — a predledger the parse cannot read must throw, not return an
   * empty map that makes every kind read as uncaptured. */
  const orig = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'predledger.js'));
  const tmp = path.join(require('os').tmpdir(), 'lc-' + process.pid);
  fs.mkdirSync(path.join(tmp, 'public', 'js', 'draft'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'public', 'js', 'draft', 'predledger.js'), '// no helpers here\n');
  fs.copyFileSync(path.join(ROOT, 'src', 'predledger.js'), path.join(tmp, 'src', 'predledger.js'));
  let threw = '';
  try {
    const mod = path.join(ROOT, 'draft', 'tools', 'loop_closure.js');
    require('child_process').execFileSync('node', ['-e',
      'const p=require("path"),fs=require("fs"),o=fs.readFileSync;'
      + 'fs.readFileSync=function(f,e){const s=String(f);'
      + 'if(s.endsWith("draft/predledger.js"))return o(p.join(' + JSON.stringify(tmp)
      + ',"public","js","draft","predledger.js"),e);return o.apply(this,arguments)};'
      + 'require(' + JSON.stringify(mod) + ').scan();'], { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) { threw = String(e.stderr || e.message); }
  ck('FAIL ARM — a predledger with no parseable helpers makes the tool REFUSE, '
    + 'instead of reporting a tidy "nothing is captured"',
  /REFUSING/.test(threw) && /confident, wrong zero/.test(threw), threw.slice(0, 200));
  fs.rmSync(tmp, { recursive: true, force: true });
  void orig;
}

// ── 3. THE LOOPS THAT ARE ACTUALLY CLOSED ───────────────────────────────
{
  const closed = rows.filter(r => r.gradeable && r.captured && r.resolved);
  ck('some loops ARE closed, so "open loop" is a distinction and not the only '
    + 'state the tool can report', closed.length >= 3, closed.map(r => r.kind));
  ck('`pick` is one of them — the decision the whole model exists to make',
    by('pick').captured && by('pick').resolved);
  ck('and `opponent_prediction`, which resolves within picks',
    by('opponent_prediction').resolved);
}

// ── 4. THE OPEN LOOPS, NAMED ────────────────────────────────────────────
// Asserted as a SET rather than a count, so closing one is a visible change to
// this file rather than a number quietly ticking down.
{
  const open = rows.filter(r => r.gradeable && r.captured && !r.resolved).map(r => r.kind).sort();
  ck('the open loops are exactly the ones we know about — if this list changes, '
    + 'either a loop was closed or a new claim went ungraded',
  JSON.stringify(open) === JSON.stringify(['doctrine', 'doctrine_decline', 'lrm',
    'override', 'recommendation', 'shadow_pick', 'survival']), open);

  ck('SURVIVAL is among them, and it is the cheapest to close — the next pick '
    + 'resolves it', open.indexOf('survival') >= 0);
  ck('every open loop carries a stated reason it is gradeable, so none of them '
    + 'is on the list by accident',
  rows.filter(r => r.gradeable && r.captured && !r.resolved)
    .every(r => typeof r.why === 'string' && r.why.length > 20));
}

// ── 5. THE IN-SEASON KINDS NOT CAPTURED AT ALL ──────────────────────────
// The Sept 1 deadline items. A prediction never made cannot be graded later, and
// the weeks it would have covered are not recoverable.
{
  const missing = rows.filter(r => r.gradeable && !r.captured).map(r => r.kind).sort();
  ck('the uncaptured gradeable kinds are the in-season rail',
    JSON.stringify(missing) === JSON.stringify(['inseason_override', 'lineup_call',
      'stream_call', 'trade_eval', 'waiver_claim']), missing);
  ck('they are DECLARED, so the shape is agreed and only the wiring is missing — '
    + 'which is why this is a deadline and not a design question',
  missing.every(k => LC.declaredKinds().indexOf(k) >= 0));
}

// ── 6. IT DOES NOT OVERSTATE WHAT IT CHECKED ────────────────────────────
{
  const { execFileSync } = require('child_process');
  const out = execFileSync('node', [path.join(ROOT, 'draft', 'tools', 'loop_closure.js')],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  ck('it says outright that it does not check a resolver is CORRECT',
    /does not.*check that a resolver is CORRECT/is.test(out));
  // Whitespace-normalised: the sentence wraps across lines in the report, and a
  // regex that only matches the unwrapped form tests the line width, not the text.
  const flat = out.replace(/\s+/g, ' ');
  ck('and that a resolver which exists but never runs still reads as resolved — '
    + 'the same defect class the tool is written against',
  /never reached still reads as "resolved"/.test(flat), flat.slice(flat.indexOf('WHAT THIS DOES NOT'), flat.indexOf('WHAT THIS DOES NOT') + 200));
  ck('an observation is labelled n/a rather than counted as a hole',
    /mock_platform_sample\s+yes\s+NO\s+n\/a/.test(out.replace(/ +/g, ' ')));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the kinds come from the server\'s own list, the helper');
console.log('to kind map is parsed rather than transcribed, a parse that sees nothing');
console.log('REFUSES instead of reporting "nothing is captured", and the open-loop set is');
console.log('pinned by name so closing one shows up as a change here.');
console.log('WHAT IT DOES NOT: prove any resolver works, or that one ever ran. Reading the');
console.log('code cannot tell you that — only rows in the ledger can, and that needs a season.');
