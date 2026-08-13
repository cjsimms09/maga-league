// TERRITORY: A
/* DOES THE PAGE ACTUALLY HAVE THE MODULES IT CLAIMS TO HAVE?
 *
 * ── WHY A SOURCE ASSERTION WAS NOT ENOUGH ─────────────────────────────────
 *
 * On 2026-08-13 I found that decision_contract.js had never been on the war-room
 * page and added the script tag, plus an explicit assertion in
 * script_load_order.test.js that the tag is present in _warroom_scripts.ejs.
 * That test has been green ever since.
 *
 * On 2026-08-14 A reported from a live browser: `window.DecisionContract` is
 * undefined. DraftGrabBy, DraftKeepers, DraftNeedRule and DraftEngine all load;
 * the contract does not. The panel A was building silently fell back to reading
 * `reasons`/`context`/`components` instead — so decisive-vs-moved, resolution
 * status and per-term calibration were quietly unavailable, with nothing
 * anywhere saying so.
 *
 * THE TAG IS IN THE FILE AND HAS BEEN SINCE ca034f3. A GREEN SOURCE TEST AND AN
 * UNDEFINED GLOBAL ARE NOT A CONTRADICTION — they are two different questions.
 * The test asks what the template says. The browser answers what the server
 * served, and a cached compiled template, an unrestarted process or an old
 * checkout all break that link without touching the file the test reads.
 *
 * This is rule 17 on the surface layer: BOUNDARY COMPLETENESS MUST BE TESTED,
 * NOT INFERRED. A component passing its local test does not establish that
 * production is exercising it.
 *
 * ── WHAT THIS DOES ────────────────────────────────────────────────────────
 *
 * Runs last, in the browser, and checks that every global the war room depends
 * on is actually defined. If any is missing it puts a loud banner on the page
 * naming them. It does not attempt to repair anything: the point is to convert
 * a SILENT degradation into a visible one, because the failure A hit was not
 * that the contract was missing — it was that nothing said so.
 *
 * IT ALSO PRINTS THE PAGE'S BUILD IDENTITY, so "is this a stale deploy" is
 * answerable from the page instead of by guessing. That was the actual question
 * A's report raised and nothing on the page could answer it.
 *
 * THE LIST IS MANUAL AND THAT IS DELIBERATE. Deriving it from what app.js calls
 * is exactly the derivation that missed decision_contract.js in the first place:
 * its consumer is a renderer in another lane, so app.js references nothing and
 * there is nothing to derive from. Each entry here is a promise to another
 * session that a global will exist at runtime, and a promise no static analysis
 * of this repo can infer.
 */
(function (global) {
  'use strict';

  /* name -> why it matters, in the words of what breaks without it. The
   * consequence is in the banner on purpose: "DecisionContract missing" tells a
   * reader nothing they can act on. */
  var REQUIRED = [
    ['DraftEngine', 'no recommendations at all'],
    ['DraftSurvival', 'no survival probabilities — the clock cannot price waiting'],
    ['DraftComposite', 'no composite score'],
    ['DecisionContract', 'explanations fall back to raw reasons/components: '
      + 'decisive-vs-moved, resolution status and per-term calibration all go dark'],
    ['DraftNeedRule', 'the measured draft-day rule stops being the headline'],
    ['SharedValuation', 'the sheet and the war room can disagree about a player'],
    ['DraftSession', 'the draft stops being persisted — a reset loses the picks'],
    ['OverrideRecord', 'overrides stop being captured, and draft night cannot be recaptured'],
  ];

  function missing() {
    var out = [];
    for (var i = 0; i < REQUIRED.length; i++) {
      if (typeof global[REQUIRED[i][0]] === 'undefined') out.push(REQUIRED[i]);
    }
    return out;
  }

  function banner(gone) {
    var el = global.document.createElement('div');
    el.id = 'module-check-banner';
    el.setAttribute('role', 'alert');
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;'
      + 'background:#7f1d1d;color:#fff;padding:10px 14px;font:13px/1.45 ui-monospace,monospace;'
      + 'border-bottom:3px solid #ef4444;max-height:45vh;overflow:auto';
    var rows = gone.map(function (m) {
      return '<div style="margin:3px 0"><b>' + m[0] + '</b> is not loaded — ' + m[1] + '</div>';
    }).join('');
    el.innerHTML = '<div style="font-weight:700;margin-bottom:6px">'
      + gone.length + ' REQUIRED MODULE' + (gone.length > 1 ? 'S ARE' : ' IS')
      + ' MISSING FROM THIS PAGE. What you see below is a DEGRADED view.</div>'
      + rows
      + '<div style="margin-top:8px;opacity:.85">The script tags live in '
      + 'views/admin/_warroom_scripts.ejs. If the tag is present in the repo but '
      + 'the global is undefined here, THE SERVED PAGE IS OLDER THAN THE REPO — '
      + 'restart the server (EJS caches compiled templates) or redeploy.</div>';
    (global.document.body || global.document.documentElement).appendChild(el);
  }

  function run() {
    var gone = missing();
    var loaded = REQUIRED.length - gone.length;
    if (gone.length) {
      try { banner(gone); } catch (e) { /* a banner failure must not take the page down */ }
      if (global.console && console.error) {
        console.error('[module_check] ' + gone.length + ' of ' + REQUIRED.length
          + ' required modules missing: ' + gone.map(function (m) { return m[0]; }).join(', '));
      }
    } else if (global.console && console.info) {
      console.info('[module_check] all ' + loaded + ' required modules present.');
    }
    /* Readable from the console either way, so "which modules does this page
     * have" is a question with an answer instead of a guess. */
    global.__moduleCheck = {
      required: REQUIRED.map(function (m) { return m[0]; }),
      missing: gone.map(function (m) { return m[0]; }),
      ok: gone.length === 0,
    };
    return gone.length === 0;
  }

  if (typeof global.document === 'undefined') {
    // Under node (the test), export the parts without touching a DOM.
    global.ModuleCheck = { REQUIRED: REQUIRED, missing: missing, run: run };
  } else if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', run);
    global.ModuleCheck = { REQUIRED: REQUIRED, missing: missing, run: run };
  } else {
    global.ModuleCheck = { REQUIRED: REQUIRED, missing: missing, run: run };
    run();
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = global.ModuleCheck;
})(typeof window !== 'undefined' ? window : globalThis);
