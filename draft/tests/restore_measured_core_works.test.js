// TERRITORY: relay measures · B owns the surface · A owns the policy it restores
// THE "⏮ RESTORE THE MEASURED CORE" BUTTON WORKS. REGISTER 4i IS A FALSE PREMISE.
//
// ── WHY THIS FILE EXISTS AT ALL ──────────────────────────────────────────────
//
// Register 4i says the button is "a silent no-op, and it is on the surface Cory
// drafts on": `app.js` reads `state.frozenBaseline.engine_policy.MEASURED_WEIGHTS`,
// and `draft/data/pre_draft_freeze_2026.json` has no `engine_policy` key.
//
// The second half is TRUE. The freeze really has no `engine_policy` — 24
// top-level keys, none of them that. **It is the wrong file.**
//
// `state.frozenBaseline` is not the freeze. It is fetched from
// `/admin/api/baseline?version=v1`, and `src/routes/admin.js` serves that from
// `draft/baseline/v1.json` — a different artifact, with a different job. That
// file DOES carry `engine_policy.MEASURED_WEIGHTS`, so the control renders, the
// handler gets a real object, and the restore does its work.
//
// ── THE PART THAT IS ACTUALLY EMBARRASSING, AND WHY IT IS WRITTEN DOWN ───────
//
// The relay has now got this row wrong THREE times in one day:
//   1. told A the premise was false and offered to close it — right, by luck,
//      with no evidence beyond a hunch;
//   2. WITHDREW that, "corrected" itself, and re-scoped the row as real — wrong,
//      having checked `pre_draft_freeze_2026.json`, which is not the input;
//   3. re-verified it "before the lane works it" — wrong again, same file.
//
// Three probes, one wrong artifact, and the third was performed under a banner
// about verifying premises. A null (or a positive) from the wrong file is not a
// measurement, and no amount of re-running fixes the aim. So the fix is not
// another re-read: it is a test that names BOTH files and asserts which one
// feeds the button, so the next reader cannot make the same substitution.
//
// Run: node draft/tests/restore_measured_core_works.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const BASELINE = path.join(ROOT, 'draft', 'baseline', 'v1.json');
const FREEZE = path.join(ROOT, 'draft', 'data', 'pre_draft_freeze_2026.json');
const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const ADMIN = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'admin.js'), 'utf8');

// ── 1. THE FILE THE BUTTON ACTUALLY DEPENDS ON ──────────────────────────────
{
  ck('the baseline the endpoint serves EXISTS', fs.existsSync(BASELINE));
  const b = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));

  ck('DEFECT-DISPROVING: it carries `engine_policy`, which is the key register '
    + '4i says is missing', !!b.engine_policy, Object.keys(b));

  const w = (b.engine_policy || {}).MEASURED_WEIGHTS;
  ck('...and `MEASURED_WEIGHTS` inside it, which is what the handler reads',
    !!w && typeof w === 'object', w);

  /* The handler does `state.weights = Object.assign({}, w)` and then syncs the
   * sliders from it. A weights object that is empty, or carries non-numbers,
   * would pass a truthiness check and still corrupt the board on click — which
   * would be a REAL version of the defect 4i describes. */
  const vals = Object.values(w || {});
  ck('the restored weights are a non-empty map of NUMBERS — a truthy-but-junk '
    + 'object would be a real no-op-shaped bug where 4i looked for one',
  vals.length > 0 && vals.every(v => typeof v === 'number' && isFinite(v)), w);

  ck('it names the moment it was frozen, which the button prints to Cory',
    typeof b.frozen_at === 'string' && /^\d{4}-\d{2}-\d{2}/.test(b.frozen_at),
    b.frozen_at);
}

// ── 2. THE CHAIN, END TO END, SO THE SUBSTITUTION CANNOT RECUR ──────────────
{
  //: v1 -> BASELINE_VERSION (A, 08-18, register 5g ruling): the pin moved to
  //: v27 so restore no longer reverts the ceiling/stack rulings. The chain
  //: check is about the ROUTE, not the version — match the pinned constant.
  ck('the client loads the baseline from the ADMIN API...',
    /fetch\('\/admin\/api\/baseline\?version=' \+ BASELINE_VERSION/.test(APP));

  ck('...and assigns the response to `state.frozenBaseline`, which is the object '
    + 'register 4i assumed was the freeze',
  /state\.frozenBaseline\s*=\s*d\.baseline/.test(APP));

  ck('the server resolves that request to draft/baseline/<version>.json',
    /'draft',\s*'baseline',\s*version \+ '\.json'/.test(ADMIN));

  /* ⚠️ THE CONTROL THAT CARRIES THE WHOLE ARGUMENT. If app.js ever DID read the
   * freeze for the baseline, 4i would be correct and this file would be wrong.
   * So assert the negative explicitly rather than leaving it implied. */
  const freezeFeedsBaseline =
    /frozenBaseline[^\n]*pre_draft_freeze|pre_draft_freeze[^\n]*frozenBaseline/.test(APP);
  ck('CONTROL — the client NEVER sources `frozenBaseline` from '
    + '`pre_draft_freeze_2026.json`; they are different artifacts and conflating '
    + 'them is the entire error in register 4i',
  !freezeFeedsBaseline);
}

// ── 3. THE HALF OF 4i THAT IS TRUE, PINNED AS TRUE ─────────────────────────
{
  const fz = JSON.parse(fs.readFileSync(FREEZE, 'utf8'));
  ck('KNOWN-POSITIVE — the freeze really does lack `engine_policy`, exactly as '
    + '4i reports. The observation was correct; only the inference was not.',
  !('engine_policy' in fz), Object.keys(fz).length);

  /* And this is not a defect in the freeze either: the freeze records the BOARD
   * Cory drafts from, and the baseline records the POLICY the sliders hold. Two
   * artifacts, two jobs. Asserting the freeze still does its own job stops
   * someone "fixing" 4i by bolting engine_policy onto the wrong file. */
  ck('...and the freeze still carries its OWN payload, so nobody is tempted to '
    + 'graft engine_policy onto it to "fix" a bug that is not there',
  Array.isArray(fz.players) && fz.players.length > 0 && !!fz.replacement,
  { players: (fz.players || []).length });
}

// ── 4. THE HANDLER DOES SOMETHING, NOT JUST ANYTHING ───────────────────────
{
  ck('the click handler assigns the frozen weights, disables auto-weights and '
    + 're-renders — so with a real MEASURED_WEIGHTS it cannot be a no-op',
  /state\.weights\s*=\s*Object\.assign\(\{\}, w\)/.test(APP)
    && /state\.autoWeights\s*=\s*false/.test(APP)
    && /renderRecommendations\(\)/.test(APP));

  ck('the early return that 4i names is a GUARD, and it is the right one to keep '
    + '— it fires only when the baseline genuinely has no weights',
  /const w = \(state\.frozenBaseline\.engine_policy \|\| \{\}\)\.MEASURED_WEIGHTS;\s*\n\s*if \(!w\) return;/.test(APP));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
