// TERRITORY: relay
/* THE DATE-CLUSTER CAP, TESTED BY THE WALL IT WAS WRITTEN FOR.
 *
 * 2026-09-06, four days before kickoff: 119 open register rows shared the
 * single recheck date 09-05. When it passed, `main` went red on ~100 rows at
 * once — and the only move available against a hundred rows is to bulk-roll
 * the block, which is what had already happened twice (93 rows read "recheck
 * WAS ... rolled to", 33 read "date bulk-moved"). Every roll re-clustered.
 * Behind that one sat 42 rows due on week-1 Sunday and 23 on kickoff day.
 *
 * The cap makes a date mean "someone will actually look on this day". These
 * tests are its controls: a synthetic wall must FAIL, a spread must PASS, and
 * a far-future parking lot must be EXEMPT — because a cap that fired on
 * `recheck 2027-06-01` would push next-offseason work into the season, which
 * is the opposite of what it is for.
 */
const assert = require('assert');
const { audit } = require('../tools/register_recheck_check.js');

const HEAD = '| # | what | owner | status | action |\n|---|---|---|---|---|\n';
const row = (id, due) =>
  `| ${id} | 🟠 a finding that matters | A | 🟠 OPEN | do the thing, recheck ${due} |\n`;

/* The cap logic as main() applies it, over audit()'s own parse — so this test
 * measures the code rather than a re-implementation of it (the mistake that
 * produced two wrong sweeps the same evening this was written). */
function walls(md, today = '2026-09-06', cap = 10, horizonDays = 90) {
  const a = audit(md, today);
  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + horizonDays * 864e5)
    .toISOString().slice(0, 10);
  const byDay = new Map();
  for (const x of a.dated) {
    if (x.due > horizon) continue;
    byDay.set(x.due, (byDay.get(x.due) || 0) + 1);
  }
  return [...byDay.entries()].filter(([, n]) => n > cap).sort();
}

// KNOWN POSITIVE — 12 rows on one near date is a wall.
{
  let md = HEAD;
  for (let i = 0; i < 12; i++) md += row(`w${i}`, '09-20');
  const w = walls(md);
  assert.strictEqual(w.length, 1, 'a 12-row same-day cluster must be reported');
  assert.strictEqual(w[0][0], '2026-09-20');
  assert.strictEqual(w[0][1], 12);
}

// KNOWN NEGATIVE — the same 12 rows spread 6/day pass. Without this the cap
// could be always-red and would be switched off the first time it mattered.
{
  let md = HEAD;
  for (let i = 0; i < 12; i++) md += row(`s${i}`, i < 6 ? '09-20' : '09-21');
  assert.deepStrictEqual(walls(md), [], 'a spread backlog must pass');
}

// EXEMPTION — a far-future parking lot is not a wall.
{
  let md = HEAD;
  for (let i = 0; i < 19; i++) md += row(`p${i}`, '2027-06-01');
  assert.deepStrictEqual(walls(md), [],
    'a next-offseason park must not be capped: capping it pulls work into the season');
}

// BOUNDARY — exactly at the cap passes, one over fails, so the threshold is
// a real line and not decoration.
{
  const at = HEAD + Array.from({ length: 10 }, (_, i) => row(`a${i}`, '09-25')).join('');
  const over = HEAD + Array.from({ length: 11 }, (_, i) => row(`o${i}`, '09-25')).join('');
  assert.deepStrictEqual(walls(at), [], '10 rows (== cap) must pass');
  assert.strictEqual(walls(over).length, 1, '11 rows (> cap) must fail');
}

console.log('register_date_cluster: 4/4 — wall fails, spread passes, far-future exempt, boundary exact');
