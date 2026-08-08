/* Side-bet TRACKER — the owners x years grid + drill-down (side-bet-tracker.md).
 * Run: node draft/tests/sidebets.test.js
 *
 * Covers the derived layer: the grid, the year-filtered views, and the two hard
 * invariants — every bet is zero-sum, and empty owner-years render as a dash
 * (null), never a zero.
 */
'use strict';
const SB = require('../../src/sidebets.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const OWNERS = [{ id: 1, name: 'Cory' }, { id: 2, name: 'Richard' }, { id: 3, name: 'David' }];
const nameOf = id => (OWNERS.find(o => o.id === Number(id)) || {}).name || String(id);

// A settled two-party bet: `winner` beats `loser` for `stake`, resolved in `year`.
function settledBet(id, winner, loser, stake, year) {
  return {
    id, status: 'settled', push: false, stake,
    parties: [{ owner_id: winner, position: '', picks: [] },
              { owner_id: loser, position: '', picks: [] }],
    winner_ids: [winner],
    created_at: `${year}-01-05T00:00:00.000Z`,
    settled_at: `${year}-06-05T12:00:00.000Z`,
    terms: 'test bet', resolves: '', legs: [],
  };
}

const BETS = [
  settledBet('a', 1, 2, 100, 2024),   // Cory +100, Richard -100  (2024)
  settledBet('b', 2, 1, 40, 2024),    // Richard +40, Cory -40    (2024)
  settledBet('c', 1, 3, 50, 2025),    // Cory +50, David -50      (2025)
  // an OPEN bet — must not touch the grid at all
  { id: 'open', status: 'locked', push: false, stake: 999,
    parties: [{ owner_id: 2 }, { owner_id: 3 }], winner_ids: [],
    created_at: '2025-02-01T00:00:00.000Z', settled_at: null, terms: 'live', legs: [] },
  // a PUSH — settled but nobody won; moves no money, no grid effect
  { id: 'push', status: 'settled', push: true, stake: 25,
    parties: [{ owner_id: 1 }, { owner_id: 3 }], winner_ids: [],
    created_at: '2025-03-01T00:00:00.000Z', settled_at: '2025-04-01T00:00:00.000Z', terms: 'push', legs: [] },
];

// --- the grid ---------------------------------------------------------------
{
  const g = SB.gridByYear(BETS, OWNERS);
  check('grid years are exactly the settled years, sorted', JSON.stringify(g.years) === '[2024,2025]', JSON.stringify(g.years));

  const cory = g.rows.find(r => r.owner.id === 1);
  const rich = g.rows.find(r => r.owner.id === 2);
  const david = g.rows.find(r => r.owner.id === 3);

  check('Cory 2024 net = +100 − 40 = +60', cory.cells[2024] === 60, String(cory.cells[2024]));
  check('Cory 2025 net = +50', cory.cells[2025] === 50, String(cory.cells[2025]));
  check('Cory career = 110', cory.career === 110, String(cory.career));
  check('Richard 2024 net = −100 + 40 = −60', rich.cells[2024] === -60, String(rich.cells[2024]));

  // Empty owner-year is a quiet dash (null), never zero.
  check('Richard 2025 has no bets -> null (dash), not 0', rich.cells[2025] === null, String(rich.cells[2025]));
  check('David 2024 has no bets -> null (dash), not 0', david.cells[2024] === null, String(david.cells[2024]));
  check('David 2025 net = −50', david.cells[2025] === -50, String(david.cells[2025]));

  // Zero-sum invariant: every year's column sums to 0 across all owners.
  for (const y of g.years) {
    const colSum = g.rows.reduce((s, r) => s + (r.cells[y] || 0), 0);
    check('year ' + y + ' column is zero-sum', Math.abs(colSum) < 1e-9, String(colSum));
  }
  // And every career total sums to zero league-wide.
  const careerSum = g.rows.reduce((s, r) => s + r.career, 0);
  check('career column is zero-sum league-wide', Math.abs(careerSum) < 1e-9, String(careerSum));
}

// --- per-bet zero-sum -------------------------------------------------------
{
  const bet = settledBet('z', 1, 2, 75, 2025);
  const dW = SB.partyDelta(bet, 1), dL = SB.partyDelta(bet, 2);
  check('a bet\'s two parties carry opposite signs', dW === 75 && dL === -75, dW + '/' + dL);
  check('a bet sums to zero', Math.abs(dW + dL) < 1e-9);
}

// --- cell-click: owner ledger filtered to a year ----------------------------
{
  const y2024 = SB.ledgerFor(BETS, 1, nameOf, { year: 2024 });
  check('cell-click filters Cory to exactly his 2024 bets', y2024.rows.length === 2, String(y2024.rows.length));
  check('cell-click year net matches the grid cell (+60)', y2024.net === 60, String(y2024.net));

  const y2025 = SB.ledgerFor(BETS, 1, nameOf, { year: 2025 });
  check('Cory 2025 year ledger nets +50 (push excluded)', y2025.net === 50, String(y2025.net));

  const career = SB.ledgerFor(BETS, 1, nameOf);
  check('name-click career ledger nets Cory +110', career.net === 110, String(career.net));
}

// --- year-click: league-wide ledger -----------------------------------------
{
  const yr = SB.leagueLedgerForYear(BETS, 2024, nameOf);
  check('year-click lists both 2024 settled bets', yr.rows.length === 2, String(yr.rows.length));
  check('every year-bet shows both parties', yr.rows.every(r => r.parties.length === 2));
  check('each bet in the year view is zero-sum',
    yr.rows.every(r => Math.abs(r.parties.reduce((s, p) => s + p.delta, 0)) < 1e-9));
  check('2024 biggest winner is Cory (+60)', yr.biggest_winner.owner_id === 1 && yr.biggest_winner.net === 60,
    JSON.stringify(yr.biggest_winner));
  check('2024 biggest loser is Richard (−60)', yr.biggest_loser.owner_id === 2 && yr.biggest_loser.net === -60,
    JSON.stringify(yr.biggest_loser));

  const yr25 = SB.leagueLedgerForYear(BETS, 2025, nameOf);
  check('2025 year view excludes the open and the push bet', yr25.rows.length === 1, String(yr25.rows.length));
}

// --- firewall (§6/§7): no side-bet content outside the side-bets section -----
{
  const fs = require('fs'), path = require('path');
  const V = f => fs.readFileSync(path.join(__dirname, '../../views', f), 'utf8');

  // The tracker/side-bet partial is included ONLY behind the section guard in
  // bank.ejs — the one page that has a side-bets section.
  const bank = V('bank.ejs');
  const guarded = /section === 'sidebets'[\s\S]{0,80}include\('partials\/_side_bets'\)/.test(bank);
  check('bank.ejs includes _side_bets ONLY inside the section===sidebets guard', guarded, 'guard not found');

  // The league-money surfaces never include the side-bet partial or its markup.
  for (const f of ['history.ejs', 'team.ejs', 'dashboard.ejs']) {
    const src = V(f);
    check(f + ' does not include the side-bet partial',
      !/_side_bets/.test(src) && !/sb-tracker/.test(src), f + ' references side bets');
  }
}

console.log(`\n${pass}/${pass + fail} side-bet tracker checks passed`);
process.exit(fail ? 1 : 0);
