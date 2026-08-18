// TERRITORY: A
'use strict';
/* LAYER 4 — WAR-ROOM OPERATIONAL RELIABILITY.
 * ONE THROWN PANEL FROZE EVERY PANEL AFTER IT, AND THE HEADER KEPT ADVANCING.
 *
 * `renderAll` guarded EIGHT of its calls with
 *
 *     try { renderX(); } catch (e) { /* never blocks the clock *\/ }
 *
 * and left NINETEEN unguarded — including `renderRecommendations`. A throw in
 * any unguarded call meant every render after it never ran, and the DOM kept
 * the PREVIOUS pick's content.
 *
 * The hazard was understood: those eight comments say so. It simply was not
 * applied to the main chain.
 *
 * ── WHY THE ORDERING MAKES THE WORST CASE THE LIKELY ONE ───────────────────
 *
 * `renderHeader` runs BEFORE `renderRecommendations`. So when recommendations
 * throw, the header advances to pick 55 and the advice stays frozen at pick 40.
 * Every visual cue says the board is current. Cory drafts off a panel that
 * stopped updating fifteen picks ago and looks exactly as it always does.
 *
 * If instead the FIRST call throws, nothing updates and nothing looks wrong
 * either — the board simply stops, silently, mid-draft.
 *
 * ── CATCHING ALONE WOULD HAVE BEEN THE WRONG FIX ───────────────────────────
 *
 * Swallowing turns a frozen panel from a visible crash into an invisible lie —
 * strictly worse than the defect, and the `|| true` shape this repo keeps
 * removing. `safeRender` catches so one panel cannot freeze the rest, COUNTS
 * the failure into `state.renderFailures`, names the panel on the console, and
 * raises a status banner saying which panels are showing an earlier pick.
 *
 * That is the same instrument every other defect in this audit needed: an
 * aggregate nobody was computing.
 *
 * ── WHAT STAYS UNGUARDED, DELIBERATELY ─────────────────────────────────────
 *
 * `applyAutoWeights`, `saveDraftSession`, `checkKeeperLock` are not renders. If
 * the weights for THIS pick cannot be established, every panel below would
 * render last pick's opinion while looking fine — worth failing loudly for.
 *
 * Run: node draft/tests/render_isolation.test.js
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 200) : ''))); };

// Every call renderAll makes, in source order. Derived from the function's own
// text so it cannot drift from it.
function callOrder(body) {
  const out = [];
  /* THE try-BRANCH IS ANCHORED TO FOUR SPACES ON PURPOSE. Unanchored, it also
   * matched `try { fn(); }` INSIDE the safeRender helper's own body, adding a
   * phantom `fn` to the call list that could never run because it is a
   * parameter. A false positive in the extraction reads exactly like a missing
   * render — the same family as the fixed-window slice that turned five
   * assertions red in manual_pick_retires with the logic intact. */
  const re = /safeRender\('[^']+',\s*(\w+)\)|^\s{4}(\w+)\(\);|^\s{4}try \{ (\w+)\(\);/gm;
  let m;
  while ((m = re.exec(body))) out.push(m[1] || m[2] || m[3]);
  return out.filter(Boolean);
}

const i = SRC.indexOf('  function renderAll()');
const end = SRC.indexOf('\n  function ', i + 10);
const BODY = SRC.slice(i, end).trim();
ck('renderAll is locatable and is the whole function', BODY.length > 800 && end > i);

const NAMES = callOrder(BODY);
ck('CONTROL — the call list is derived from the source, not hand-written',
  NAMES.length >= 25, NAMES.length);
ck('CONTROL — recommendations is in it, and header comes FIRST (the ordering '
  + 'that makes a frozen panel look current)',
  NAMES.indexOf('renderHeader') >= 0
  && NAMES.indexOf('renderHeader') < NAMES.indexOf('renderRecommendations'),
  { header: NAMES.indexOf('renderHeader'), recs: NAMES.indexOf('renderRecommendations') });

function runWith(throwing) {
  const ran = [];
  const st = { recentPicks: [] };
  const stubs = NAMES.map(n => () => {
    if (n === throwing) throw new Error('boom in ' + n);
    ran.push(n);
  });
  const fn = new Function('state', 'setStatus', 'console', 'requestAnimationFrame',
                          ...NAMES, 'return ' + BODY)(
    st, () => {}, { error: () => {}, warn: () => {} }, null, ...stubs);
  fn();
  return { ran, st };
}

// ── ISOLATION: a throw must not stop the panels after it ────────────────────
{
  const after = NAMES.slice(NAMES.indexOf('renderRecommendations') + 1);
  const { ran, st } = runWith('renderRecommendations');
  const stillRan = after.filter(n => ran.indexOf(n) >= 0);
  ck('recommendations throwing does NOT freeze the panels after it',
    stillRan.length === after.length,
    { rendered: stillRan.length, expected: after.length });
  ck('...and the failure is RECORDED, not swallowed',
    !!(st.renderFailures && st.renderFailures.recommendations),
    st.renderFailures);
  ck('...naming the panel, so the banner can say which one is stale',
    Object.keys(st.renderFailures || {}).indexOf('recommendations') >= 0);
}

// ── EVERY render call is isolated, not just the one I happened to test ──────
{
  const renders = NAMES.filter(n => /^render|^layoutPinned|^assertPickState/.test(n));
  ck('CONTROL — there are many render calls to isolate', renders.length >= 20, renders.length);
  const leaky = renders.filter(n => {
    const after = NAMES.slice(NAMES.indexOf(n) + 1)
      .filter(x => /^render|^layoutPinned|^assertPickState/.test(x));
    const { ran } = runWith(n);
    return after.some(x => ran.indexOf(x) < 0);
  });
  ck('EVERY render call is isolated — no single throw can freeze a later panel',
    leaky.length === 0, leaky);
}

// ── A CLEAN RENDER RECORDS NOTHING ──────────────────────────────────────────
{
  const { ran, st } = runWith(null);
  ck('CONTROL — with nothing throwing, every call runs', ran.length === NAMES.length,
    { ran: ran.length, of: NAMES.length });
  ck('...and no failure is recorded, so the banner stays quiet',
    !st.renderFailures || !Object.keys(st.renderFailures).length, st.renderFailures);
}

// ── THE NON-RENDERS STAY LOUD, DELIBERATELY ────────────────────────────────
{
  const body = BODY.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ['applyAutoWeights', 'saveDraftSession', 'checkKeeperLock'].forEach(n => {
    ck(n + ' is NOT wrapped — it is not a render, and a board that cannot '
      + 'establish this pick\'s weights must fail loudly rather than render '
      + 'last pick\'s opinion',
      !new RegExp("safeRender\\('[^']*',\\s*" + n).test(body));
  });
}

// ── FAIL ARM ────────────────────────────────────────────────────────────────
{
  const body = BODY.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ck('FAIL ARM — bare unguarded render calls are gone from renderAll',
    !/^\s{4}render[A-Z]\w*\(\);/m.test(body),
    'an unguarded render call is back; a throw there freezes everything after it');
  ck('the failure aggregate is surfaced, not merely stored',
    /PANEL\(S\) NOT UPDATING/.test(BODY));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
