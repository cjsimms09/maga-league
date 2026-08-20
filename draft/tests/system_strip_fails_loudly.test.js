/* THE HEALTH SURFACE'S OWN FAILURE WAS THE ONE FAILURE NOTHING ANNOUNCED.
 *
 * Register E27. `renderAll` runs sixteen panels through `safeRender(name, fn)`,
 * which records a throw in `state.renderFailures` and lets the block above it
 * announce the panel by name: "PANEL(S) NOT UPDATING: … those panels are
 * showing an EARLIER pick. Do not draft off them."
 *
 * Six renders were wrapped in bare `catch (e) { /* never blocks the clock *\/ }`
 * instead — isolation without announcement. One of the six was
 * `renderSystemStrip`, and that one is structural rather than incidental:
 *
 *   IT IS THE HEALTH SURFACE. It computes the whole red/amber verdict (sync
 *   stale, seat unknown, thin projections, board aged, slate unconfirmed) and
 *   only THEN assigns host.className / host.innerHTML. So a throw anywhere in
 *   the computation left the PREVIOUS strip on screen — not blank, but a stale
 *   verdict, possibly an all-clear from a state that no longer exists.
 *
 * That is the exact shape the comment above `state.renderFailures` already
 * names: "a frozen panel from a visible crash into an invisible lie". The
 * mechanism existed; these six were not wired into it.
 *
 * NOTE ON THE FIX: the first version of this added a bespoke wrapper that
 * painted the strip red itself. `render_isolation.test.js` and
 * `panel_spec.test.js` both went red and were RIGHT to — the wrapper broke
 * per-call isolation and introduced an undocumented painting function. The
 * shipped fix uses the repo's own mechanism instead.
 *
 * Run: node draft/tests/system_strip_fails_loudly.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

// ─────── 1. THE PREMISE: the strip writes only after computing the verdict
{
  const at = SRC.indexOf('  function renderSystemStrip() {');
  ck('renderSystemStrip exists', at > 0);
  let i = SRC.indexOf('{', at), d = 0, end = -1;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') d++;
    else if (SRC[j] === '}') { d--; if (!d) { end = j; break; } }
  }
  const body = SRC.slice(at, end);
  const firstWrite = body.search(/host\.(innerHTML|className)\s*=/);
  ck('it computes the whole verdict BEFORE touching the DOM — which is why a '
    + 'throw leaves the previous strip intact rather than blanking it',
  firstWrite > 400, { firstWriteAt: firstWrite });
  ck('and it really is the health surface, not a decoration',
    /SYNC STALE/.test(body) && /SEAT UNKNOWN/.test(body)
    && /thin projections/.test(body) && /slate unconfirmed/.test(body));
}

// ─────── 2. THE FIX: it now goes through the mechanism that names panels
{
  ck('renderSystemStrip is registered with safeRender under a name',
    /safeRender\('systemStrip', renderSystemStrip\)/.test(SRC));
  ck('FAIL ARM: the bare silent-catch call form is gone from renderAll',
    !/try \{ renderSystemStrip\(\); \} catch \(e\) \{ \/\* never blocks the clock \*\/ \}/.test(SRC));
  ['pickState', 'accountingNote', 'unrecordedPicks', 'pickControls', 'legality']
    .forEach(n => ck('the other formerly-silent render is named too: ' + n,
      new RegExp("safeRender\\('" + n + "'").test(SRC)));
}

// ─────── 3. THE MECHANISM IT RELIES ON IS STILL THERE
/* If safeRender stops recording, or the announcement stops naming, then
 * registering above buys nothing. Pin both ends. */
{
  ck('safeRender records the failure under the panel name',
    /state\.renderFailures\[name\] = \{/.test(SRC));
  ck('and renderAll ANNOUNCES the names it finds',
    /PANEL\(S\) NOT UPDATING: '\s*\n?\s*\+ names\.join/.test(SRC)
    || /PANEL\(S\) NOT UPDATING/.test(SRC));
  ck('the announcement tells Cory not to draft off a frozen panel',
    /Do not draft off them/.test(SRC));
}

// ─────── 4. THE TICKER PATH, which safeRender cannot reach
/* The 1s sync-age ticker calls the strip from outside renderAll, so a strip
 * that throws only on that path would otherwise stay stale until some
 * unrelated render happened to run. */
{
  const at = SRC.indexOf('  function startSyncAgeTicker() {');
  ck('the ticker exists and re-evaluates the strip', at > 0
    && /renderSystemStrip\(\)/.test(SRC.slice(at, at + 1400)));
  const body = SRC.slice(at, at + 1600);
  ck('a throw on the ticker path is RECORDED into the same store, so the next '
    + 'renderAll announces it under the same name',
  /state\.renderFailures\.systemStrip = \{/.test(body));
  ck('and it still cannot block the clock — the recorder is itself guarded',
    /catch \(e2\)/.test(body));
}

// ─────── 5. NO SECOND MECHANISM WAS INVENTED
/* The first attempt added a bespoke painting wrapper; panel_spec and
 * render_isolation both caught it. This asserts it did not survive. */
{
  ck('no bespoke renderSystemStripSafely wrapper remains — the repo has ONE '
    + 'panel-failure mechanism and this uses it',
  !/renderSystemStripSafely/.test(SRC));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
