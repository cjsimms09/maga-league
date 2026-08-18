'use strict';
/**
 * Tests for the inbox-latency ratchet.
 *
 * The classifier is pure and takes an injected clock, so nothing here depends on the
 * real ROUTES.md — a guard whose tests read the live file passes or fails on today's
 * backlog, which is the flakiness `intervention_rate.js` had to freeze a pool to escape.
 */
const assert = require('assert');
const R = require('../tools/routes_response_check.js');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const NOW = Date.parse('2026-08-18T12:00:00Z');

// --- parsing ---------------------------------------------------------------------
{
  const md = [
    '## TO: A',
    '- [ ] 2026-08-17 · relay → E · ask one',
    '  more body for ask one',
    '- [x] 2026-08-14 · C · answered already',
    '## TO: B',
    '- [ ] 2026-08-18 · A · ask two',
  ].join('\n');
  const items = R.parse(md);
  check('parses every item and its open/closed state',
    items.length === 3 && items[0].done === false && items[1].done === true,
    JSON.stringify(items.map(i => [i.date, i.done])));
  check('an item owns the body lines beneath it, not just its header',
    items[0].body.length === 2, JSON.stringify(items[0].body));
  check('a section header ends the preceding item rather than being absorbed',
    items[2].body.length === 1 && !/TO: B/.test(items[2].body.join('')));
}

// --- THE RULE: a DEFAULT is what makes silence a legitimate answer ----------------
{
  const withDef = R.parse('- [ ] 2026-08-10 · relay · ask\n  **DEFAULT if you say nothing:** I proceed.');
  const withColon = R.parse('- [ ] 2026-08-10 · relay · ask\n  DEFAULT: I proceed.');
  const without = R.parse('- [ ] 2026-08-10 · relay · ask\n  please advise');
  check('an item offering a DEFAULT is recognised (the "DEFAULT if" form)', R.hasDefault(withDef[0]));
  check('  and the "DEFAULT:" form too', R.hasDefault(withColon[0]));
  check('an item with no default is recognised as blocking', !R.hasDefault(without[0]));
  check('the word "default" in ordinary prose does not count as an escape hatch',
    !R.hasDefault(R.parse('- [ ] 2026-08-10 · relay · the default weights are 1.0')[0]),
    'a loose match here would silently empty the backlog');
}

// --- the blocked set -------------------------------------------------------------
function item(date, done, body) {
  return R.parse('- [' + (done ? 'x' : ' ') + '] ' + date + ' · relay → E · ask\n  ' + body)[0];
}
{
  const items = [
    item('2026-08-05', false, 'please advise'),          // old, no default -> BLOCKED
    item('2026-08-05', false, '**DEFAULT if silent:** go'), // old, has default -> fine
    item('2026-08-05', true, 'please advise'),            // answered -> fine
    item('2026-08-17', false, 'please advise'),           // 1d old -> in flight
  ];
  const b = R.blocked(items, NOW, R.RESPOND_BY_DAYS);
  check('only the open, default-less, aged item counts as blocked',
    b.length === 1 && b[0].date === '2026-08-05', JSON.stringify(b.map(i => i.date)));

  check('a DEFAULT keeps an item out of the count at ANY age — silence resolves it',
    R.blocked([item('2026-01-01', false, '**DEFAULT if silent:** go')], NOW, 3).length === 0);
  check('an ANSWERED item never counts, however old',
    R.blocked([item('2026-01-01', true, 'please advise')], NOW, 3).length === 0);
  check('a fresh default-less ask is in flight, not a failure',
    R.blocked([item('2026-08-18', false, 'please advise')], NOW, 3).length === 0);
  check('the boundary is inclusive — exactly RESPOND_BY_DAYS old counts',
    R.blocked([item('2026-08-15', false, 'please advise')], NOW, 3).length === 1,
    'ageDays=' + R.ageDays(item('2026-08-15', false, 'x'), NOW));
}

// --- per-lane latency, which is the part a human reads ---------------------------
{
  const items = [
    item('2026-08-10', false, 'a'), item('2026-08-12', false, 'b'),
    R.parse('- [ ] 2026-08-01 · relay → B · ask\n  a')[0],
  ];
  const lanes = R.byLane(items, NOW);
  check('items are attributed to the lane they were sent TO, not the sender',
    lanes.some(l => l.lane === 'E' && l.count === 2), JSON.stringify(lanes));
  check('  and each lane reports the age of its OLDEST item, not its average',
    lanes.find(l => l.lane === 'E').oldest === 8,
    JSON.stringify(lanes.find(l => l.lane === 'E')));
  check('  lanes sort by how much is waiting on them',
    lanes[0].count >= lanes[lanes.length - 1].count);
}

// --- attribution by section, which is how most items are addressed ---------------
{
  const md = [
    '## TO: E',
    '- [ ] 2026-08-10 · C · C is waiting on E for this',
    '  body',
    '## TO: A',
    '- [ ] 2026-08-10 · C · and this one on A',
    '  body',
  ].join('\n');
  const items = R.parse(md);
  check('an item with no arrow is attributed to its SECTION, not its author',
    items[0].section === 'E' && items[1].section === 'A',
    JSON.stringify(items.map(i => [i.who, i.section])));
  const lanes = R.byLane(items, NOW);
  check('  so the dashboard names who is BLOCKING, not who is waiting',
    lanes.every(l => l.lane === 'E' || l.lane === 'A') && !lanes.some(l => l.lane === 'C'),
    JSON.stringify(lanes));
}

// --- KNOWN-POSITIVE: the case that caused this to be built ------------------------
{
  // Six asks to E, dated 08-17, none carrying a default — the real shape.
  const six = [];
  for (let i = 0; i < 6; i++) six.push(item('2026-08-13', false, 'you own this, please answer'));
  const b = R.blocked(six, NOW, R.RESPOND_BY_DAYS);
  check("KNOWN-POSITIVE — E's real backlog shape is detected in full",
    b.length === 6 && R.byLane(b, NOW)[0].lane === 'E' && R.byLane(b, NOW)[0].oldest === 5,
    JSON.stringify(R.byLane(b, NOW)));
}

// --- and the control that matters most: it must not pass vacuously ---------------
{
  check('CONTROL — a healthy inbox produces an EMPTY blocked set, not an empty parse',
    R.parse('- [x] 2026-08-01 · relay → E · done\n  body').length === 1
    && R.blocked(R.parse('- [x] 2026-08-01 · relay → E · done\n  body'), NOW, 3).length === 0,
    'if these two ever agree at zero the check has gone blind');
}

console.log('\n' + pass + '/' + (pass + fail) + ' routes-response checks passed');
assert.strictEqual(fail, 0);
