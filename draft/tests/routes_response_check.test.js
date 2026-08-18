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


// ── CLASSIFYING AN ITEM THAT ASKS FOR NOTHING ───────────────────────────────
//
// Added 2026-08-18 after turning this tool on the relay's own lane. It counted
// 12 default-less relay items into A against D's 6 — and three of the four I had
// filed that day said outright "NO ASK, NO DEFAULT NEEDED". The checker could not
// tell a REQUEST from a REPORT, so it was overstating the backlog, and an
// overstated backlog is one people stop reading.
//
// TWO CLASSIFIERS, DELIBERATELY DIFFERENT IN KIND:
//
//   noAsk()      — the sender SAYS so. A loophole anyone can type, which is
//                  exactly why it is reported beside the blocked count and never
//                  subtracted from it.
//   isBroadcast() — STRUCTURAL and unfakeable: the same header in 3+ inboxes is a
//                  rule announcement, not four pending decisions. You cannot fake
//                  it by rewording, because rewording stops it matching.
{
  //: local builder — the file's own `item()` has a different signature
  const mk = (head, body) => ({ body: [head].concat(body || []), section: 'A' });

  check('an item whose HEADER says NO ASK is classified as asking nothing',
    R.noAsk(mk('- [ ] 2026-08-18 · relay → A · **NO ASK — reporting a number.**')));
  check('CONTROL — an ordinary item is NOT',
    !R.noAsk(mk('- [ ] 2026-08-18 · relay → A · **RULE ON THE DOLLAR FIGURE.**')));

  /* THE HEADER-ONLY RULE, AND IT IS LOAD-BEARING. Items routinely quote another
   * item's wording several paragraphs down; reading the whole body would let a
   * quoted "no ask" silence a live request. */
  check('a "no ask" buried in the BODY does not reclassify a real request',
    !R.noAsk(mk('- [ ] 2026-08-18 · relay → A · **RULE ON THIS.**',
      ['  earlier I filed one with NO ASK and this is not that one'])));

  const four = ['A', 'B', 'C', 'D'].map(s => ({
    section: s,
    body: ['- [ ] 2026-08-17 · relay → ' + s + ' · 🚨 **STANDING RULE — you do not stop a capture job.**'],
  }));
  const one = { section: 'E',
    body: ['- [ ] 2026-08-17 · relay → E · 📐 **A one-off ask that exists in a single inbox only.**'] };
  const keys = R.broadcastKeys(four.concat([one]));
  check('the same header in 3+ inboxes is detected as a BROADCAST',
    four.every(i => R.isBroadcast(i, keys)));
  check('CONTROL — an item in ONE inbox is not a broadcast', !R.isBroadcast(one, keys));

  /* THE THRESHOLD DISCRIMINATES. Two lanes is a pair of requests, not a rule. */
  const two = ['A', 'B'].map(s => ({ section: s,
    body: ['- [ ] 2026-08-17 · relay → ' + s + ' · 📌 **Sent to exactly two lanes and no more.**'] }));
  check('CONTROL — the same header in only TWO inboxes is NOT a broadcast',
    !R.isBroadcast(two[0], R.broadcastKeys(two)));

  /* REWORDING IS WHAT MAKES IT UNFAKEABLE — and that cuts both ways, so it is
   * pinned rather than assumed: a lane cannot opt IN by paraphrasing either. */
  const reworded = four.slice(0, 3).map((i, n) => ({ section: i.section,
    body: ['- [ ] 2026-08-17 · relay → ' + i.section + ' · 🚨 **Standing rule number ' + n + ' about capture jobs.**'] }));
  check('paraphrased copies do NOT count as one broadcast — the match is on text',
    !R.isBroadcast(reworded[0], R.broadcastKeys(reworded)));

  /* AGAINST THE REAL FILE, both directions. All-zero would mean the classifier
   * is blind; everything-classified would mean it is useless. */
  const live = R.parse(require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'ROUTES.md'), 'utf8'));
  const liveKeys = R.broadcastKeys(live);
  const liveB = live.filter(i => R.isBroadcast(i, liveKeys));
  check('KNOWN-POSITIVE — the live file really does contain broadcasts', liveB.length >= 6, liveB.length);
  check('CONTROL — and they are a small minority, not the whole file',
    liveB.length < live.length / 10, { broadcasts: liveB.length, items: live.length });
}


// ── THE CLOSURE RATCHET, AND ITS FAIL ARM ───────────────────────────────────
//
// Cory, 2026-08-18: "Have you solved communication problem going forward?" The
// measurement was solved; the behaviour was not. This is the half that bites.
//
// THE UNIT IS A COUNT, NOT A RATE, AND THAT IS THE WHOLE DESIGN. `D → A` sits at
// 5% ticked; the moment D files a legitimate new item that rate falls further, so
// a rate ratchet would fail the build for doing the right thing — the
// intervention-rate epitaph verbatim. A TICKED COUNT cannot fall by filing. It
// can only fall by un-ticking or losing a closed item, which is precisely the
// union-merge resurrection this baseline's own _history records: seven items
// closed 08-17, re-opened by a merge on 08-18, deleted by routes_resurrections.py
// after somebody noticed. The ratchet is the guard that notices.
{
  //: this file's header requires only `assert` and the module under test
  const fs = require('fs');
  const path = require('path');
  const bl = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'baseline', 'routes_backlog_baseline.json'), 'utf8'));

  check('the closure baseline is committed, or the ratchet is not armed',
    bl.closure_by_pair && Object.keys(bl.closure_by_pair).length >= 10,
    JSON.stringify(Object.keys(bl.closure_by_pair || {}).length));

  check('it records BOTH n and done per pair — a done with no n cannot be read '
    + 'as a rate later, and a rate is what this deliberately is not',
  Object.values(bl.closure_by_pair).every(v =>
    typeof v.n === 'number' && typeof v.done === 'number' && v.done <= v.n));

  check('KNOWN-POSITIVE — the two pairs Cory asked about are both baselined, so '
    + 'the answer to his question stays measurable',
  bl.closure_by_pair['D → A'] && bl.closure_by_pair['E (red team) → A'],
  JSON.stringify({ D: bl.closure_by_pair['D → A'], E: bl.closure_by_pair['E (red team) → A'] }));

  /* CONTROL — the baseline is not all zeros. A ratchet whose every entry is 0
   * can never regress and would be a check that cannot fail. */
  check('CONTROL — the baseline records real closures, so it CAN regress',
    Object.values(bl.closure_by_pair).filter(v => v.done > 0).length >= 5,
    Object.values(bl.closure_by_pair).filter(v => v.done > 0).length);

  /* FAIL ARM — the regression the ratchet exists for, simulated. */
  const live = R.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'ROUTES.md'), 'utf8'));
  const now = {};
  live.forEach(i => {
    if (!i.section) return;
    const k = i.who.replace(/\s*→.*$/, '').trim() + ' → ' + i.section;
    (now[k] = now[k] || { n: 0, done: 0 });
    now[k].n++;
    if (i.done) now[k].done++;
  });
  const regressedAgainst = b => Object.keys(b)
    .filter(k => (now[k] ? now[k].done : 0) < b[k].done);

  check('against the live file the ratchet is CLEAN — nothing has come untucked',
    regressedAgainst(bl.closure_by_pair).length === 0,
    regressedAgainst(bl.closure_by_pair).join(', '));

  const tampered = JSON.parse(JSON.stringify(bl.closure_by_pair));
  tampered['E (red team) → A'].done += 1;   // pretend one more had been closed
  check('FAIL ARM — if a closed item came back open the ratchet DETECTS it',
    regressedAgainst(tampered).indexOf('E (red team) → A') >= 0,
    regressedAgainst(tampered).join(', '));

  /* AND IT MUST NOT FIRE ON NEW WORK — the wolf-crying case, pinned. */
  const moreFiled = JSON.parse(JSON.stringify(bl.closure_by_pair));
  moreFiled['D → A'].n += 20;   // D files twenty new items; ticked count unchanged
  check('CONTROL — filing twenty NEW items does not trip it, which is why the '
    + 'unit is a count and not a rate',
  regressedAgainst(moreFiled).length === 0, regressedAgainst(moreFiled).join(', '));
}

console.log('\n' + pass + '/' + (pass + fail) + ' routes-response checks passed');
assert.strictEqual(fail, 0);
