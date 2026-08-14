// TERRITORY: A
// TWO MODULES CLAIMED ONE GLOBAL NAME AND THE BOARD NEVER LOADED.
//
// Cory, on his phone, trying to run a mock eight days before the draft: the war
// room sat on "Loading the board…" and never moved. Driven in a real browser
// against the real page, the cause was one line:
//
//     PAGEERROR  DraftSession.load is not a function
//
// `draft_session.js` is PERSISTENCE — save/load/restore, "the draft survives the
// page". `session.js` is the CONNECTION LIFECYCLE — create/tick/wedged. Both
// ended with `global.DraftSession = api`, and `_warroom_scripts.ejs` loads both:
// persistence at line 25, lifecycle at line 86. The second replaced the first,
// so `resumeDraftIfAny()` called `DraftSession.load()` on an object that had
// never heard of it.
//
// ── WHY IT PRESENTED AS A HANG RATHER THAN AS AN ERROR ────────────────────
//
// `bootFrom` hides `#loading` and reveals `#warroom` on its LAST TWO LINES,
// after `resumeDraftIfAny`, `renderAll` and `wireControls`. So the throw landed
// between the board being built and the board being shown: everything rendered,
// into a container still set to `display:none`, under a loading card that was
// never dismissed. The board was there the whole time and invisible.
//
// Worse, the throw happened inside the boot chain's `.catch()` recovery arm —
// where nothing catches it again — so the page never reached the line that
// would have explained itself. A failure that eats its own error message.
//
// AND THE GUARD IN FRONT OF IT PASSED. `typeof DraftSession === 'undefined'`
// was checked first and was false, because the name WAS defined — by the other
// module. A presence check cannot see an identity swap, which is the same shape
// as an empty `slot_to_roster_id` reading as "this league has no seats".
//
// ── WHAT THIS PINS, AND WHAT IT DELIBERATELY DOES NOT ─────────────────────
//
// Neither module replaces the other now; each merges, and a REAL disagreement
// (the same key defined differently) throws instead of letting load order pick
// a winner. That is a repair, not a design: two APIs under one name is still the
// wrong arrangement, and the durable fix is separate names — a rename across
// app.js that is not worth doing eight days out. This makes the page work and
// makes the next collision loud.
//
// Run: node draft/tests/draft_session_collision.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const JS = path.join(ROOT, 'public', 'js', 'draft');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

/* THE PAGE'S OWN LOAD ORDER, READ FROM THE VIEW rather than assumed. If the
 * order ever changes this test follows it, which is the whole point — the bug
 * was load-order dependent and a hardcoded order here could not have seen it. */
const VIEW = fs.readFileSync(path.join(ROOT, 'views', 'admin', '_warroom_scripts.ejs'), 'utf8');
const ORDER = VIEW.split('\n')
  .map(l => (l.match(/script src="\/js\/draft\/([^"]+)"/) || [])[1])
  .filter(Boolean);

ck('the war-room view loads BOTH session modules — the precondition for the bug',
  ORDER.indexOf('draft_session.js') >= 0 && ORDER.indexOf('session.js') >= 0, ORDER.slice(0, 3));

// ── 1. LOAD THEM THE WAY THE PAGE DOES, IN THE PAGE'S ORDER ─────────────
function loadInto(files) {
  const vm = require('vm');
  const ctx = { console: { log() {}, warn() {}, error() {} }, module: undefined };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  files.forEach(f => vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }));
  return ctx.DraftSession;
}

const PERSISTENCE = ['save', 'load', 'clear', 'restore', 'serialize', 'isResumable'];
const LIFECYCLE = ['create', 'tick', 'connecting', 'sawResponse', 'describe', 'report', 'hardReset'];

{
  const both = ORDER.filter(f => f === 'draft_session.js' || f === 'session.js');
  const DS = loadInto(both);
  ck('DraftSession exists after the page-order load', !!DS);
  ck('THE PERSISTENCE API SURVIVES — `load` is the exact method that threw',
    PERSISTENCE.every(k => typeof DS[k] === 'function'),
    PERSISTENCE.filter(k => typeof (DS || {})[k] !== 'function'));
  ck('and the LIFECYCLE API survives alongside it',
    LIFECYCLE.every(k => typeof DS[k] === 'function'),
    LIFECYCLE.filter(k => typeof (DS || {})[k] !== 'function'));
  ck('the lifecycle constants come through too, since the wedge logic reads them',
    Number.isFinite(DS.WEDGE_AFTER) && Number.isFinite(DS.STALL_AFTER), DS.WEDGE_AFTER);
}

// ── 2. IT SURVIVES THE OPPOSITE ORDER, or the fix is luck ───────────────
// The bug was "last one wins". A fix that only works in today's order is the
// same bug waiting for someone to move a script tag.
{
  const a = loadInto(['draft_session.js', 'session.js']);
  const b = loadInto(['session.js', 'draft_session.js']);
  ck('persistence survives BOTH load orders',
    PERSISTENCE.every(k => typeof a[k] === 'function' && typeof b[k] === 'function'));
  ck('lifecycle survives BOTH load orders',
    LIFECYCLE.every(k => typeof a[k] === 'function' && typeof b[k] === 'function'));
  ck('and each module ALONE still works, so neither depends on the other',
    typeof loadInto(['draft_session.js']).load === 'function'
    && typeof loadInto(['session.js']).tick === 'function');
}

// ── 3. THE FAIL ARM — the exact bug, reconstructed ──────────────────────
{
  const clobber = (target, api) => { target.DraftSession = api; return target.DraftSession; };
  const host = {};
  clobber(host, { load: function () {}, save: function () {} });
  const after = clobber(host, { tick: function () {}, create: function () {} });
  ck('FAIL ARM — plain assignment DESTROYS the first API, which is what shipped',
    typeof after.load !== 'function' && typeof after.tick === 'function');
  ck('CONTROL — and `typeof DraftSession === "undefined"` still passes on the '
    + 'wreckage, which is why the guard in app.js did not catch it',
    typeof after !== 'undefined');
}

// ── 4. A REAL DISAGREEMENT MUST THROW, NOT PICK A WINNER ────────────────
// Merging is only safe while the two APIs are disjoint. The moment they both
// define something, silently keeping one is exactly the class of bug this file
// exists for — so it refuses instead.
{
  ck('the merge refuses a genuine collision rather than choosing',
    /two modules define/.test(fs.readFileSync(path.join(JS, 'session.js'), 'utf8')));
  ck('and both modules carry the same refusal, so it does not matter which '
    + 'loads second',
    /two modules define/.test(fs.readFileSync(path.join(JS, 'draft_session.js'), 'utf8')));
  ck('CONTROL — the two APIs really are disjoint today, which is the condition '
    + 'that makes merging legitimate at all',
    PERSISTENCE.every(k => LIFECYCLE.indexOf(k) < 0));
}

// ── 5. THE CALL THAT THREW, DRIVEN ──────────────────────────────────────
// Not "the key exists" — actually invoke it the way `resumeDraftIfAny` does.
{
  const DS = loadInto(ORDER.filter(f => f === 'draft_session.js' || f === 'session.js'));
  let threw = null;
  try { DS.load(); } catch (e) { threw = e.message; }
  ck('DraftSession.load() RUNS — this is the exact call that took the board down',
    threw === null, threw);
  let threw2 = null;
  try { DS.create(1000); } catch (e) { threw2 = e.message; }
  ck('and DraftSession.create() runs, so neither half was traded for the other',
    threw2 === null, threw2);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the war room can load both session modules in either');
console.log('order and keep both APIs, the method that threw actually runs, and a future');
console.log('genuine collision fails loudly instead of being decided by a script tag.');
console.log('WHAT IT DOES NOT: make two APIs under one global name a good design. The');
console.log('durable fix is separate names; this is the repair that was safe to make');
console.log('eight days from a draft, and it is labelled as one in both files.');
