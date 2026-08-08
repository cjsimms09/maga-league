/* A-3 — my-turn alerting (complete-backlog.md A-3 + the iOS notes).
 * Run: node draft/tests/alerts.test.js
 */
'use strict';
const AL = require('../../public/js/draft/alerts.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const MY = [4, 17, 24, 37];

// --- the edge detector -------------------------------------------------------
{
  let st = null;
  let r = AL.tick(st, 1, MY);
  check('not my turn: no fire', r.fire === false);
  r = AL.tick(r.st, 4, MY);
  check('entering my turn FIRES', r.fire === true);
  r = AL.tick(r.st, 4, MY);
  check('the same turn seen again does NOT re-fire (edge, not level)', r.fire === false);
  r = AL.tick(r.st, 5, MY);
  check('after my pick passes, quiet again', r.fire === false);
  r = AL.tick(r.st, 17, MY);
  check('my NEXT turn fires again', r.fire === true);
}

// --- the pocket scenario: catch-up sweep -------------------------------------
{
  // Phone dark from pick 10; polls throttled; the tab re-foregrounds at pick 17
  // — my turn, which ARRIVED while backgrounded. The first tick after
  // re-foreground must fire even though no tick saw the transition happen.
  let st = AL.tick(null, 10, MY).st;
  const r = AL.tick(st, 17, MY);
  check('a turn that arrived while backgrounded fires on the catch-up tick', r.fire === true);

  // And a turn that arrived AND PASSED while backgrounded stays quiet — the
  // clock is on pick 19 now; alerting for a dead turn would train me to ignore it.
  const r2 = AL.tick(AL.tick(null, 10, MY).st, 19, MY);
  check('a turn that came and went in the pocket does not fire late', r2.fire === false);
}

// --- fire(): config gates + graceful degradation -----------------------------
{
  const fakeDoc = { title: 'War Room' };
  const vibs = [];
  const fakeNav = { vibrate: p => { vibs.push(p); return true; } };
  const ran = AL.fire({ audio: true, vibrate: true, titleFlash: true, ntfyTopic: '' },
    { document: fakeDoc, navigator: fakeNav });
  check('unarmed audio degrades silently (no context, no crash)', ran.audio === false);
  check('vibration fires where supported', ran.vibrate === true && vibs.length === 1);
  check('title flash engages', ran.title === true);
  check('ntfy does NOT fire without a configured topic', ran.ntfy === false);
  AL.stopFlash(fakeDoc);
  check('stopFlash restores the original title', fakeDoc.title === 'War Room');

  const ran2 = AL.fire({ audio: false, vibrate: false, titleFlash: false, ntfyTopic: 'x' }, {});
  check('a configured ntfy topic marks the push as sent', ran2.ntfy === true);
  const ran3 = AL.fire({ audio: false, vibrate: true, titleFlash: false }, {});
  check('no navigator: vibration degrades without crashing', ran3.vibrate === false);
}

// --- arm state ---------------------------------------------------------------
{
  check('armed() is false before any user gesture (iOS reality)', AL.armed() === false);
  // arm() needs a real AudioContext; in node it must fail CLEANLY, not throw.
  check('arm() in a context with no AudioContext returns false, never throws',
    AL.arm() === false);
}

console.log(`\n${pass}/${pass + fail} my-turn alert checks passed`);
process.exit(fail ? 1 : 0);
