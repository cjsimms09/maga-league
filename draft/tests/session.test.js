/* THE DRAFT SESSION lifecycle — mock #1's back-half blockers.
 * Run: node draft/tests/session.test.js
 */
'use strict';
const S = require('../../public/js/draft/session.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const T0 = 1000000;

// --- the happy path ---------------------------------------------------------
{
  let s = S.create(T0);
  check('a fresh session is idle and manual entry is offered',
    s.state === 'idle' && /Manual mode/.test(S.describe(s).text));
  s = S.connecting(s, '123', T0);
  check('entering a draft id moves to connecting', s.state === 'connecting');
  s = S.sawResponse(s, T0 + 2300, true);
  check('the first response goes live and RECORDS the connect time',
    s.state === 'live' && s.timings.connectMs === 2300, JSON.stringify(s.timings));
  check('the live line reports the measured connect time',
    /connected in 2\.3s/.test(S.describe(s).text), S.describe(s).text);
}

// --- THE HANG. A spinner that hangs is the worst draft-night behavior. ------
{
  let s = S.connecting(S.create(T0), '123', T0);
  s = S.tick(s, T0 + S.CONNECT_TIMEOUT - 1);
  check('before the deadline it is still connecting, not prematurely abandoned',
    s.state === 'connecting');
  s = S.tick(s, T0 + S.CONNECT_TIMEOUT);
  check('a first response that never arrives WEDGES rather than spinning forever',
    s.state === 'wedged', s.state);
  const d = S.describe(s);
  check('the wedged message says what happened, what still works, and what to do',
    /GAVE UP/.test(d.text) && /manual/i.test(d.text) && /draft ID|Reset/.test(d.text)
    && d.tone === 'bad', d.text);
  check('the hang duration is RECORDED — the number mock #1 could not report',
    S.report(s).wedged_at === T0 + S.CONNECT_TIMEOUT
    && S.report(s).log.some(l => /no first response/.test(l.note || '')),
    JSON.stringify(S.report(s).log));
}

// --- degradation ladder: live -> stalled -> wedged ---------------------------
{
  let s = S.sawResponse(S.connecting(S.create(T0), '9', T0), T0 + 500, true);
  s = S.tick(s, T0 + 500 + S.STALL_AFTER);
  check('a quiet live sync degrades to stalled, still trying', s.state === 'stalled');
  check('stalled tells the user manual entry works meanwhile',
    /Manual entry works/i.test(S.describe(s).text), S.describe(s).text);
  s = S.tick(s, T0 + 500 + S.WEDGE_AFTER);
  check('a long enough silence wedges', s.state === 'wedged');

  // Recovery: a response after stalling returns to live.
  let s2 = S.sawResponse(S.connecting(S.create(T0), '9', T0), T0 + 500, true);
  s2 = S.tick(s2, T0 + 500 + S.STALL_AFTER);
  s2 = S.sawResponse(s2, T0 + 500 + S.STALL_AFTER + 100, true);
  check('a response after a stall recovers to live', s2.state === 'live');
  check('the longest gap is measured across the whole session',
    s2.timings.longestGapMs >= S.STALL_AFTER, String(s2.timings.longestGapMs));
}

// --- THE HARD RESET. Must work from every state, especially wedged. ---------
{
  S.STATES.forEach(st => {
    let s = S.create(T0);
    s = S.transition(s, st, T0 + 10, 'setup');
    const fresh = S.hardReset(s, T0 + 20);
    check('hard reset returns to idle from ' + st, fresh.state === 'idle', fresh.state);
  });
  const s = S.hardReset(S.transition(S.create(T0), 'wedged', T0, 'x'), T0 + 5);
  check('the reset is recorded, so a wedged session leaves a trace',
    s.log.some(l => l.note === 'HARD RESET' && l.from === 'wedged'), JSON.stringify(s.log));
  check('reset clears the draft id and the timing history',
    s.draftId === null && s.timings.connectMs === null && s.lastResponseAt === null);
}

// --- the timing report is the deliverable -----------------------------------
{
  let s = S.connecting(S.create(T0), '123', T0);
  s = S.sawResponse(s, T0 + 4000, true);
  s = S.sawResponse(s, T0 + 30000, false);
  const r = S.report(s);
  check('the report carries connect time, longest gap and the transition count',
    r.connect_ms === 4000 && r.longest_gap_ms === 26000 && r.transitions >= 2,
    JSON.stringify(r));
  check('a session that never wedged reports wedged_at null, not zero',
    r.wedged_at === null);
}

// --- transitions are honest -------------------------------------------------
{
  let s = S.create(T0);
  const before = s.log.length;
  s = S.transition(s, 'idle', T0 + 5);
  check('a no-op transition is not logged as an event', s.log.length === before);
  s = S.transition(s, 'not-a-state', T0 + 6);
  check('an unknown state is refused rather than stored', s.state === 'idle');
}

console.log(`\n${pass}/${pass + fail} session checks passed`);
process.exit(fail ? 1 : 0);
