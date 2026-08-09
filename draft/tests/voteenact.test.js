'use strict';
// VOTE → CONFIG — the enactment path. Proves a passed vote's effect lands in the
// season config and that everything money DERIVES from it then follows.
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { applyVoteEffect, defaultTargetYear, skeletonFrom } = require(path.join(ROOT, 'src', 'routes', 'voteenact'));
const H = require(path.join(ROOT, 'src', 'helpers'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

(function () {
  const seasons = {
    2025: { year: 2025, status: 'complete', buy_in: 400, total_pot: 4000, weeks: 15, weekly_payout: 100, payouts: { reg: [0.10, 0.05], playoff: [0.27, 0.22, 0.20, 0.16] } },
    2026: { year: 2026, status: 'active', buy_in: 400, total_pot: 4000, weeks: 15, weekly_payout: 100, payouts: { reg: [0.10, 0.05], playoff: [0.27, 0.22, 0.20, 0.16] } },
  };

  // default target = the upcoming season (active + 1, since none is 'upcoming')
  ck('defaultTargetYear = active + 1 when no upcoming', defaultTargetYear(seasons) === 2027);

  // THE LIVE CASE: buy-in vote to 500, 10 active owners → 2027 created, pot rederives
  const r = applyVoteEffect(seasons, { type: 'buy_in', value: 500 }, 2027, 10);
  ck('creates the target (upcoming) season', !!r.seasons[2027] && r.seasons[2027].status === 'upcoming');
  ck('buy-in set to 500', r.seasons[2027].buy_in === 500);
  ck('pot rederives from buy_in × active (500×10)', r.seasons[2027].total_pot === 5000, r.seasons[2027].total_pot);
  ck('inherits prior payout structure', JSON.stringify(r.seasons[2027].payouts) === JSON.stringify(seasons[2026].payouts));
  ck('does not mutate the input seasons', seasons[2027] === undefined && seasons[2026].buy_in === 400);
  ck('audit line describes the change', /Buy-in.*500/.test(r.changed), r.changed);

  // DOWNSTREAM FOLLOWS: the money math (payoutTable) reflects the new config with no other step
  const pt = H.payoutTable(r.seasons[2027]);
  const remaining = 5000 - 15 * 100; // pot − weekly total
  ck('payoutTable pot flows through (remaining = 3500)', pt.remaining === remaining, pt.remaining);
  ck('champion payout rederives from new pot', pt.playoff[0].amount === Math.round(remaining * 0.27 * 100) / 100, pt.playoff[0].amount);

  // STRUCTURE change (Cory's harder case): a differently-shaped payout table
  const rs = applyVoteEffect(seasons, { type: 'payouts', reg: [0.12, 0.06, 0.03], playoff: [0.28, 0.20, 0.15, 0.10, 0.06] }, 2027, 10);
  ck('payout STRUCTURE change accepts a new shape (3 reg + 5 playoff)',
    rs.seasons[2027].payouts.reg.length === 3 && rs.seasons[2027].payouts.playoff.length === 5);
  const pts = H.payoutTable(rs.seasons[2027]);
  ck('payoutTable renders the new-shaped structure', pts.reg.length === 3 && pts.playoff.length === 5);

  // weekly payout + generic config key
  ck('weekly_payout effect applies', applyVoteEffect(seasons, { type: 'weekly_payout', value: 125 }, 2027, 10).seasons[2027].weekly_payout === 125);
  ck('generic config key applies (keeper_count)', applyVoteEffect(seasons, { type: 'config', key: 'keeper_count', value: 2 }, 2027, 10).seasons[2027].keeper_count === 2);

  // FAILS LOUDLY on a bad effect (never a silent no-op)
  let threw = false; try { applyVoteEffect(seasons, { type: 'bogus' }, 2027, 10); } catch (e) { threw = true; }
  ck('unknown effect throws (fails loud, not silent)', threw);
  let threw2 = false; try { applyVoteEffect(seasons, { type: 'buy_in', value: 'abc' }, 2027, 10); } catch (e) { threw2 = true; }
  ck('non-numeric buy_in throws', threw2);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
