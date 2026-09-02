// TERRITORY: relay
// My Team rows carry this week's game (site review 09-02, item 5). The join
// reads the committed schedule store; its nulls must mean "cannot say" and
// its BYE must only ever come from a FULL week. Known positive: week 1 of
// 2026 (SEA hosts NE, the Wednesday-night opener); the WAS/WSH alias that
// once printed a playing player as BYE on the week brief.
const assert = require('assert');
const S = require('../../src/sleeper.js');

let pass = 0;
function check(name, fn) { fn(); pass++; console.log('PASS  ' + name); }

check('KNOWN POSITIVE — week 1 of 2026 is a full week and SEA hosts NE on the opener', () => {
  const g = S.gamesForWeek(2026, 1);
  assert.ok(g && g.full, 'week 1 should be a full 32-team week');
  const sea = g.lookup('SEA');
  assert.deepStrictEqual({ opp: sea.opp, home: sea.home }, { opp: 'NE', home: true });
  assert.ok(/^2026-09-10T00:20/.test(sea.kickoff));
});

check('the WAS/WSH alias resolves both ways, so no Washington player reads BYE by a join failure', () => {
  const g = S.gamesForWeek(2026, 1);
  assert.ok(g.lookup('WAS') && g.lookup('WSH'), 'both codes must find the game');
  assert.strictEqual(g.lookup('WAS').opp, g.lookup('WSH').opp);
});

check('CANNOT SAY is null — a week the schedule does not hold, or a foreign season', () => {
  assert.strictEqual(S.gamesForWeek(2026, 99), null);
  assert.strictEqual(S.gamesForWeek(1999, 1), null);
});

check('a team absent from a full week looks up to null (the caller turns that into BYE only when full)', () => {
  const g = S.gamesForWeek(2026, 1);
  assert.strictEqual(g.lookup('ZZZ'), null);
});

console.log(`\n${pass}/4 checks passed`);
