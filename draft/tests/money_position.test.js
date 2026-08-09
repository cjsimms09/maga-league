'use strict';
// THE MONEY SCOREBOARD — ledger.moneyStandings, unit + real-data sweep.
//
// The league plays for dollars; the standings show wins. moneyStandings turns the
// ledger into the real scoreboard (banked $ this season + rank + what's left in the
// pot). Two layers, deliberately — the bug in the optimizer taught us a path that
// passed unit tests still failed the moment it met real data:
//   (1) UNIT — the arithmetic on a hand-built ledger (won excludes buy-in/payment,
//       net, tie-ranking, pot conservation).
//   (2) REAL SWEEP — run it over the actual seeded ledger for every season and
//       assert the invariants hold on real entries, not just fixtures.
//
// Run: node draft/tests/money_position.test.js
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'money-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const H = require(path.join(ROOT, 'src', 'helpers'));
const L = require(path.join(ROOT, 'src', 'ledger'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        ' + JSON.stringify(d) : ''))); };

// ------------------------------------------------------------------ UNIT
{
  const owners = [{ id: 1, name: 'Ann' }, { id: 2, name: 'Bo' }, { id: 3, name: 'Cy' }];
  const season = { year: 2026, buy_in: -400, total_pot: 4000, weekly_payout: 100, weeks: 15,
    payouts: { reg: [], playoff: [] } };
  const led = [
    { owner_id: 1, year: 2026, type: 'buy_in', amount: -400, settled: false },
    { owner_id: 1, year: 2026, type: 'weekly', amount: 100, week: 1 },
    { owner_id: 1, year: 2026, type: 'weekly', amount: 100, week: 3 },
    { owner_id: 2, year: 2026, type: 'weekly', amount: 100, week: 2 },
    { owner_id: 2, year: 2026, type: 'award', amount: 250, category: 'reg_1' },
    // A buy-in PAYMENT is money moving, not money won — must never count as winnings.
    { owner_id: 3, year: 2026, type: 'payment', amount: 400 },
    // A prior-year weekly must not leak into this season's board.
    { owner_id: 3, year: 2025, type: 'weekly', amount: 100, week: 5 },
  ];
  const mb = L.moneyStandings(led, owners, season);
  const by = id => mb.rows.find(r => r.owner_id === id);

  ck('won counts weekly + award only (not buy-in, not payment, not prior years)',
    by(1).won === 200 && by(2).won === 350 && by(3).won === 0, mb.rows);
  ck('net = won minus buy-in', by(1).net === -200 && by(2).net === -50 && by(3).net === -400);
  ck('rank orders by winnings (Bo 350 #1, Ann 200 #2, Cy 0 #3)',
    by(2).rank === 1 && by(1).rank === 2 && by(3).rank === 3);
  ck('distributed = sum of winnings', mb.distributed === 550);
  ck('pot conservation: distributed + onTheTable === totalPot',
    mb.distributed + mb.onTheTable === mb.totalPot, { d: mb.distributed, o: mb.onTheTable, p: mb.totalPot });
  ck('weekly progress: 3 distinct weeks paid of 15', mb.weeksPaid === 3 && mb.weeklyPaid === 300
    && mb.weeklyPool === 1500 && mb.weeklyRemaining === 1200);

  // Tie ranking: two owners on equal winnings share a rank.
  const tied = L.moneyStandings(
    [{ owner_id: 1, year: 2026, type: 'weekly', amount: 100, week: 1 },
     { owner_id: 2, year: 2026, type: 'weekly', amount: 100, week: 2 }],
    owners, season);
  ck('equal winnings share a rank (competition ranking)',
    tied.rows[0].rank === 1 && tied.rows[1].rank === 1 && tied.rows[2].rank === 3,
    tied.rows.map(r => [r.name, r.won, r.rank]));
}

// -------------------------------------------------------------- REAL SWEEP
(async () => {
  await data.ensureSeeded();
  const world = await H.loadWorld();
  const owners = H.activeOwners(world.owners);
  const seasons = Object.values(world.seasons || {});
  ck('the sweep has real seasons to run over (non-vacuity)', seasons.length >= 1, seasons.length);

  let swept = 0;
  for (const season of seasons) {
    let mb;
    try { mb = L.moneyStandings(world.ledger, owners, season); }
    catch (e) { ck('moneyStandings does not throw on real season ' + season.year, false, e.message); continue; }
    swept++;
    const sumWon = Math.round(mb.rows.reduce((s, r) => s + r.won, 0) * 100) / 100;
    ck(season.year + ': one row per active owner', mb.rows.length === owners.length);
    ck(season.year + ': sum(won) === distributed', sumWon === mb.distributed, { sumWon, d: mb.distributed });
    ck(season.year + ': pot conserved (distributed + onTheTable === totalPot)',
      Math.round((mb.distributed + mb.onTheTable) * 100) / 100 === mb.totalPot,
      { d: mb.distributed, o: mb.onTheTable, p: mb.totalPot });
    ck(season.year + ': no season pays more weekly than its pool',
      mb.weeklyPaid <= mb.weeklyPool + 1e-9, { paid: mb.weeklyPaid, pool: mb.weeklyPool });
    ck(season.year + ': ranks are non-decreasing down the sorted board',
      mb.rows.every((r, i) => i === 0 || r.rank >= mb.rows[i - 1].rank));
    ck(season.year + ': no winnings figure is negative',
      mb.rows.every(r => r.won >= 0), mb.rows.filter(r => r.won < 0));
  }
  ck('swept every real season without a throw', swept === seasons.length, { swept, seasons: seasons.length });

  console.log(`\n${pass}/${pass + fail} money-position checks passed`);
  process.exit(fail ? 1 : 0);
})();
