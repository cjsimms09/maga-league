// TERRITORY: A
// A PROGRAMMATIC OPEN IS NOT A USER DECISION.
//
// B instrumented the war room rather than reasoning about it and found the
// single biggest lever on the page: Layer 3 open is 19,910px (23.6 phone
// screens); closed, as A's own `layerDepthForMode` asks for under sync, it is
// 4,725px (5.6). A 76% cut with no layout work.
//
// The cause was a guard that reads correctly and does not work. `toggle` on
// <details> fires at RENDERING TIME — after the current task and after timers —
// so `layerProgrammatic = false` on the next line had already run, every
// listener saw false, and our own programmatic open stamped `userOpened`. From
// then on `layerDepthForMode` returns early forever and the close rule never
// runs, for the whole draft, with no user click anywhere in the session.
//
// B also proved the obvious fix fails: setTimeout(..., 0) still measures
// prog:false, because timers run BEFORE rendering. The guard has to live on the
// ELEMENT until that element's event arrives.
//
// ── WHY THIS TEST FIRES THE TOGGLE ASYNCHRONOUSLY ──────────────────────────
//
// A stub that calls the listener synchronously on assignment would pass against
// the BROKEN code, because the boolean is still true at that instant. The bug
// only exists because the event is late, so a test that fires it early cannot
// see it. The stub below defers to a macrotask — later than a promise, later
// than a timer-free microtask — to model the real ordering.
//
// Run: node draft/tests/layer_guard.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 240) : '')); }
};

const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
function extract(sig) {
  const st = SRC.indexOf(sig);
  if (st < 0) return '';
  let d = 0;
  for (let i = SRC.indexOf('{', st); i < SRC.length; i++) {
    if (SRC[i] === '{') d++;
    else if (SRC[i] === '}') { d--; if (d === 0) return SRC.slice(st, i + 1); }
  }
  return '';
}
const setLayerSrc = extract('  function setLayer(el, open) {');
const onToggleSrc = extract('  function onLayerToggle(el) {');
ck('setLayer exists in the shipped app.js', setLayerSrc.length > 40);
ck('and the toggle handler is ONE shared function, not a copy per layer',
  onToggleSrc.length > 40 && (SRC.match(/dataset\.userOpened = '1'/g) || []).length === 1,
  (SRC.match(/dataset\.userOpened = '1'/g) || []).length);

// eslint-disable-next-line no-new-func
const mod = new Function(setLayerSrc + '\n' + onToggleSrc
  + '; return { setLayer: setLayer, onLayerToggle: onLayerToggle };')();

/* A <details> stub whose `toggle` arrives LATE, which is the entire bug. */
function makeDetails() {
  const el = { dataset: {}, _open: false, _queue: [] };
  Object.defineProperty(el, 'open', {
    get() { return this._open; },
    set(v) {
      if (this._open === v) return;
      this._open = v;
      // Rendering-time delivery: later than the assignment, later than a timer.
      el._queue.push(() => mod.onLayerToggle(el));
    },
  });
  el.flush = () => { const q = el._queue.slice(); el._queue.length = 0; q.forEach(f => f()); };
  return el;
}

// ── 1. THE BUG ITSELF ─────────────────────────────────────────────────────
{
  const el = makeDetails();
  mod.setLayer(el, true);          // renderSystemStrip -> layerDepthForMode('MANUAL')
  el.flush();                      // ...the toggle finally arrives
  ck('a PROGRAMMATIC open does not stamp userOpened', !el.dataset.userOpened,
    el.dataset);
  ck('and the guard cleans itself up, so it cannot mask a later real click',
    el.dataset.progToggle === undefined, el.dataset);
}

// ── 2. A REAL USER TOGGLE STILL COUNTS ────────────────────────────────────
// The check that stops the fix from being "never stamp anything", which would
// pass check 1 and destroy the feature — a deliberate tap must still stick.
{
  const el = makeDetails();
  mod.onLayerToggle(el);           // a click: no programmatic marker outstanding
  ck('a USER toggle still stamps userOpened', el.dataset.userOpened === '1', el.dataset);
}

// ── 3. THE COUNTER CASE ───────────────────────────────────────────────────
// Two programmatic sets before either event arrives. A boolean marker would be
// cleared by the first toggle and the second would be miscounted as a decision.
{
  const el = makeDetails();
  mod.setLayer(el, true);
  mod.setLayer(el, false);
  el.flush();
  ck('TWO programmatic sets before delivery stamp nothing', !el.dataset.userOpened,
    el.dataset);
  ck('and both markers are consumed', el.dataset.progToggle === undefined, el.dataset);
}

// ── 4. A PROGRAMMATIC OPEN FOLLOWED BY A REAL CLICK ──────────────────────
{
  const el = makeDetails();
  mod.setLayer(el, true);
  el.flush();                      // programmatic, absorbed
  mod.onLayerToggle(el);           // now the user taps
  ck('a user click AFTER a programmatic open is still honoured',
    el.dataset.userOpened === '1', el.dataset);
}

// ── 5. A NO-OP SET MUST NOT LEAVE A MARKER BEHIND ────────────────────────
// setLayer returns early when the state already matches, so no toggle fires. A
// marker left there would swallow the NEXT real click.
{
  const el = makeDetails();
  el._open = true;
  mod.setLayer(el, true);          // no change, no event
  ck('a no-op setLayer leaves no marker to swallow a later click',
    el.dataset.progToggle === undefined, el.dataset);
  mod.onLayerToggle(el);
  ck('so the next real click is still counted', el.dataset.userOpened === '1', el.dataset);
}

// ── 6. FAIL ARM — the OLD time-scoped guard must fail this suite ──────────
// Without this, every check above could be passing for a reason unrelated to
// the fix. This reconstructs the previous implementation and confirms it is
// caught by the async stub.
{
  let layerProgrammatic = false;
  const oldSet = (el, open) => {
    if (!el || el.open === open) return;
    layerProgrammatic = true; el.open = open; layerProgrammatic = false;
  };
  const oldToggle = (el) => { if (!layerProgrammatic) el.dataset.userOpened = '1'; };
  const el = { dataset: {}, _open: false, _q: [] };
  Object.defineProperty(el, 'open', {
    get() { return this._open; },
    set(v) { if (this._open === v) return; this._open = v; el._q.push(() => oldToggle(el)); },
  });
  oldSet(el, true);
  el._q.forEach(f => f());
  ck('FAIL ARM — the OLD time-scoped guard DOES poison userOpened',
    el.dataset.userOpened === '1', el.dataset);
}

// ── 7. AND THE CLOSE RULE STILL READS THE FLAG ───────────────────────────
// The fix is worthless if layerDepthForMode stopped consulting userOpened.
ck('layerDepthForMode still returns early on a genuine userOpened',
  /dataset\.userOpened\) return/.test(SRC));

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: our own opens never masquerade as the user\'s, a real');
console.log('tap still sticks for the session, and the close rule can actually run — which');
console.log('is what takes the page from 23.6 screens to 5.6.');
console.log('WHAT IT DOES NOT: measure the page. B\'s warroom_first_screens.test.js drives');
console.log('the connected page and asserts the screen budget; this only proves the flag');
console.log('that gates it is honest.');
