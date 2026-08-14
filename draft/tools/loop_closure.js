// TERRITORY: A
/* WHAT DO WE PREDICT THAT WE NEVER GRADE?
 *
 * Cory, repeatedly and in these words: *"This model needs to make as many
 * predictions as reasonably possible and close the loop to actually grade these
 * and find useful info wherever we can. The whole point of this project is to
 * get a model that learns this league inside and out … not necessarily this
 * year but going forward."* And: *"Closing loops!!! Finding edge!!"*
 *
 * A prediction that is never resolved is not evidence. It is storage. This tool
 * answers the only question that distinguishes the two, per ledger kind:
 *
 *     is it CAPTURED?   is it RESOLVED?   if captured and never resolved, WHY
 *
 * ── DERIVED FROM SOURCE, NOT A TABLE ─────────────────────────────────────
 *
 * A hand-maintained list of "which kinds we grade" is exactly the artefact this
 * project keeps finding wrong — it would be written once, be true for a week,
 * and then quietly describe a system that had moved. So both halves are found by
 * reading the code:
 *
 *   CAPTURED — a call to `PredLedger.<helper>(` or `send('<kind>'` anywhere in
 *              the shipped client or server.
 *   RESOLVED — a resolution row written for it, or a named resolver that reads
 *              it. Resolution rows follow the ledger's own naming
 *              (`*_resolved`, `*_reconciled`, `forecast_resolution`).
 *
 * ── WHAT A RED ROW MEANS, AND WHAT IT DOES NOT ───────────────────────────
 *
 * "Captured, never resolved" is NOT automatically a defect. Some kinds are raw
 * observation with no outcome to compare against (`mock_platform_sample` is a
 * sample of Sleeper's ordering, not a claim). The tool therefore reports the
 * gap and refuses to call it a bug — naming which ones have a gradeable outcome
 * is a judgement, and it is made in the OUTCOMES table below, in one place,
 * with a reason per kind.
 *
 * Run: node draft/tools/loop_closure.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

/* THE KINDS, READ OFF THE SERVER'S OWN LIST. If a kind is added to
 * `src/predledger.js` it appears here on the next run without an edit. */
function declaredKinds() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'predledger.js'), 'utf8');
  const m = src.match(/const KINDS = \[([\s\S]*?)\];/);
  if (!m) throw new Error('REFUSING: could not read KINDS out of src/predledger.js — '
    + 'a hardcoded fallback list here is the exact drift this tool exists to catch');
  return [...new Set((m[1].match(/'([a-z_]+)'/g) || []).map(s => s.replace(/'/g, '')))];
}

/* ── HELPER -> KIND, READ OUT OF THE CLIENT ───────────────────────────────
 *
 * MY FIRST VERSION OF THIS TOOL LOOKED FOR `send('<kind>'` AND REPORTED THAT
 * ALMOST NOTHING WAS CAPTURED. That was false and alarming: the client does not
 * call `send` at the call sites, it calls NAMED HELPERS —
 * `PredLedger.survival({...})`, `PredLedger.recommendation({...})` — and the
 * kind string only appears inside the helper. A detector that could not see the
 * shape the code actually uses, reporting a confident zero. The exact defect
 * this tool is written to find, in the tool.
 *
 * So the mapping is parsed from `predledger.js`: each helper's one-line body
 * names its kind (`platformSample` -> `mock_platform_sample`, which no
 * transcription would have got right for long).
 */
function helperKinds() {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'predledger.js'), 'utf8');
  const map = {};
  const re = /^\s{4}([a-zA-Z]+): function [^\n]*?(?:oncePer|send)\(\s*'([a-z_]+)'/gm;
  let m;
  while ((m = re.exec(src))) map[m[1]] = m[2];
  if (!Object.keys(map).length) {
    throw new Error('REFUSING: parsed ZERO helper->kind pairs out of predledger.js. '
      + 'That is how this tool first reported "nothing is captured" — a detector '
      + 'blind to the shape the code uses returns a confident, wrong zero.');
  }
  return map;
}

/* The files that can capture or resolve. The shipped client and the server —
 * NOT the tests, which would make every kind look wired. */
function sourceFiles() {
  const dirs = [path.join(ROOT, 'public', 'js', 'draft'), path.join(ROOT, 'src')];
  const out = [];
  dirs.forEach(d => {
    if (!fs.existsSync(d)) return;
    fs.readdirSync(d).forEach(f => { if (f.endsWith('.js')) out.push(path.join(d, f)); });
  });
  return out;
}

/* ── IS THERE AN OUTCOME TO GRADE IT AGAINST? ─────────────────────────────
 *
 * The one judgement in this file, made once and in the open rather than implied
 * by whether a resolver happens to exist. `gradeable: false` means the row is an
 * OBSERVATION — there is no later fact that makes it right or wrong — so an
 * absent resolver is correct rather than a hole.
 */
const OUTCOMES = {
  recommendation: [true, 'the board resolves it: did the man we ranked first outscore the alternatives'],
  pick: [true, 'the season resolves it — this is the decision the whole model exists to make'],
  survival: [true, 'the next pick resolves it: was he still there or not. The cheapest, fastest loop we have'],
  override: [true, 'my judgement against the model\'s, the one place disagreement is cleanly measurable'],
  lrm: [true, 'a late-round claim is a forecast about a player nobody else wanted'],
  run: [true, 'a run either continued or it did not, within a handful of picks'],
  doctrine: [true, 'the enrolled plan against the season it produced'],
  doctrine_decline: [true, 'declining a switch is a decision with a counterfactual — the branch not taken'],
  mock_platform_sample: [false, 'an OBSERVATION of Sleeper\'s default ordering, not a claim. Nothing later makes it wrong'],
  shadow_freeze: [false, 'a frozen snapshot, kept so a later grade has a baseline. It IS the baseline'],
  shadow_pick: [true, 'the shadow board\'s pick against the one actually made'],
  opponent_prediction: [true, 'the room resolves it within picks — already wired'],
  opponent_prediction_resolved: [false, 'this IS a resolution row'],
  pick_reconciled: [false, 'this IS a reconciliation row'],
  correction: [false, 'a correction to an earlier row, not a forward claim'],
  inseason_override: [true, 'same as override, in season'],
  lineup_call: [true, 'the week resolves it — start/sit against what both scored'],
  waiver_claim: [true, 'the rest of the season resolves it against who we passed on'],
  stream_call: [true, 'the week resolves it'],
  trade_eval: [true, 'the season resolves it against the roster we would have had'],
  weekly_brief: [false, 'a summary of rows that are graded individually'],
  forecast: [true, 'a committed claim about a future pick — resolved by buildResolutions'],
  forecast_resolution: [false, 'this IS a resolution row'],
  survival_resolved: [false, 'this IS a resolution row — the grade for a survival call'],
};

function scan() {
  const kinds = declaredKinds();
  const files = sourceFiles().map(f => ({ f: f, src: fs.readFileSync(f, 'utf8') }));
  const rel = f => path.relative(ROOT, f);

  const helpers = helperKinds();
  return kinds.map(kind => {
    const captures = [], resolves = [];
    // Every helper that writes THIS kind, plus the generic escape hatch.
    const names = Object.keys(helpers).filter(h => helpers[h] === kind);
    files.forEach(({ f, src }) => {
      if (/predledger\.js$/.test(f)) return;      // the library is not a call site
      // CAPTURE — a named helper for this kind, or an explicit generic capture.
      const viaHelper = names.some(n =>
        new RegExp("PredLedger\\." + n + "\\s*\\(").test(src));
      const viaCapture = new RegExp("\\.capture\\(\\s*'" + kind + "'").test(src);
      const viaSend = new RegExp("send\\(\\s*'" + kind + "'").test(src);
      if (viaHelper || viaCapture || viaSend) captures.push(rel(f));

      // RESOLUTION — a resolution row for this kind, or a named resolver.
      const resolvedKind = new RegExp("'" + kind + "_(resolved|reconciled)'", 'g');
      const namedResolver = new RegExp("function resolve[A-Za-z]*\\b[\\s\\S]{0,600}?\\b" + kind + "\\b", 'g');
      if (resolvedKind.test(src) || namedResolver.test(src)) resolves.push(rel(f));
    });

    const [gradeable, why] = OUTCOMES[kind] || [null, 'NOT CLASSIFIED — add it to OUTCOMES'];
    return { kind, gradeable, why,
      captured: captures.length > 0, capturedIn: captures,
      resolved: resolves.length > 0, resolvedIn: resolves };
  });
}

if (require.main === module) {
  const rows = scan();
  const unclassified = rows.filter(r => r.gradeable === null);
  console.log('CLOSING THE LOOP — what we predict, and what we ever grade\n');
  console.log('  ' + rows.length + ' ledger kinds declared in src/predledger.js\n');

  console.log('  kind                        captured  resolved  gradeable');
  rows.forEach(r => {
    console.log('  ' + r.kind.padEnd(28)
      + (r.captured ? '   yes  ' : '   NO   ').padEnd(10)
      + (r.resolved ? '  yes   ' : '  NO    ').padEnd(10)
      + (r.gradeable === null ? '   ?' : (r.gradeable ? '   yes' : '   n/a')));
  });

  /* THE ONLY ROWS THAT ARE A PROBLEM: something we claim, that has an outcome,
   * that nothing ever compares against it. */
  const openLoops = rows.filter(r => r.gradeable === true && r.captured && !r.resolved);
  const uncaptured = rows.filter(r => r.gradeable === true && !r.captured);

  console.log('\n  ── OPEN LOOPS: predicted, gradeable, never graded ──────────────');
  if (openLoops.length) {
    openLoops.forEach(r => console.log('  🔴 ' + r.kind.padEnd(24) + r.why));
    console.log('\n  These are claims the model makes and never learns from. Each one is a');
    console.log('  season of evidence that does not accumulate.');
  } else {
    console.log('  none — every gradeable kind that is captured is also resolved.');
  }

  console.log('\n  ── NOT CAPTURED AT ALL: gradeable, and we are not even claiming it ──');
  if (uncaptured.length) {
    uncaptured.forEach(r => console.log('  ⚪ ' + r.kind.padEnd(24) + r.why));
    console.log('\n  Cheaper to fix than an open loop and worth more: a prediction that is');
    console.log('  never made cannot be graded later, and the season it would have covered');
    console.log('  is not recoverable.');
  } else {
    console.log('  none.');
  }

  if (unclassified.length) {
    console.log('\n  ⚠ UNCLASSIFIED KINDS — a kind was added and nobody said whether it has');
    console.log('  an outcome. Until it is classified this tool cannot tell a hole from an');
    console.log('  observation: ' + unclassified.map(r => r.kind).join(', '));
  }

  console.log('\n  WHAT THIS DOES NOT DO: check that a resolver is CORRECT, or that it ever');
  console.log('  actually ran. It reads the code, so a resolver that exists and is never');
  console.log('  reached still reads as "resolved" here — the same class of defect this');
  console.log('  file is written against. The health of a live loop is a question for the');
  console.log('  ledger\'s own rows, and it needs rows, which needs a season.');
}

module.exports = { scan, declaredKinds, OUTCOMES };
