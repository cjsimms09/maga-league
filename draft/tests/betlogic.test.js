/* The side-bet condition engine.
 *
 * This module decides who pays whom, so it gets tested harder than the UI
 * around it. The cases that matter are the ones where the honest answer is
 * "I can't tell yet" — an engine that guesses is worse than no engine, because
 * a wrong verdict with confident-looking arithmetic is exactly what starts the
 * argument this feature exists to prevent.
 */
const path = require('path');
const B = require(path.join(__dirname, '..', '..', 'src', 'betlogic.js'));
const SB = require(path.join(__dirname, '..', '..', 'src', 'sidebets.js'));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ', name); }
  else { fail++; console.log('FAIL ', name, extra != null ? '\n      ' + extra : ''); }
}
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

const OWNERS = [
  { id: 1, name: 'Cory' }, { id: 2, name: 'Marian' }, { id: 3, name: 'David' },
  { id: 4, name: 'Michael' }, { id: 5, name: 'Bates' }, { id: 6, name: 'Dylan' },
  { id: 7, name: 'Sam' }, { id: 8, name: 'Jeremy' }, { id: 9, name: 'Richard' },
  { id: 10, name: 'Justin' },
];
const nameOf = id => (OWNERS.find(o => o.id === Number(id)) || {}).name || `#${id}`;
const rows = pairs => pairs.map(([name, wins, pf]) => ({ owner_name: name, wins, pf }));

// A finished 2025: Michael champion, Richard last.
const DONE = {
  season: { year: 2025, status: 'complete', standings: [4, 5, 8, 3, 6, 2, 1, 10, 7, 9] },
  liveRows: rows([['Michael', 11, 1810.5], ['Bates', 10, 1755.2], ['Jeremy', 9, 1700.0],
                  ['David', 8, 1690.1], ['Dylan', 7, 1600], ['Marian', 6, 1590],
                  ['Cory', 5, 1580], ['Justin', 4, 1500], ['Sam', 3, 1400], ['Richard', 2, 1300]]),
  weeklyHigh: [3, 8, 4, 6, 4, 3, 9, 8, 4, 5, 4, 5, 9, 3, 2],
  weekPoints: { 4: { 1: 132.55, 3: 118.20, 9: 132.55 }, 9: { 1: 99.4 } },
  weekNow: 18,
  owners: OWNERS,
};
// A live 2026, currently week 6 (so weeks 1-5 are gradeable).
const LIVE = {
  season: { year: 2026, status: 'active', standings: [] },
  liveRows: rows([['Marian', 4, 620.5], ['Cory', 3, 610.0], ['Richard', 1, 400.0]]),
  weeklyHigh: [2, 1, 2, 1, 2],
  weekPoints: { 4: { 1: 140.10, 2: 121.00 }, 5: { 1: 88.0, 2: 88.0 } },
  weekNow: 6,
  owners: OWNERS,
};
const ctxDone = B.makeContext(DONE);
const ctxLive = B.makeContext(LIVE);

const cond = (o) => ({ id: 'c1', when: 'week', ...o });
const propBet = (conditions, extra = {}) => ({
  format: 'prop', logic: 'all', proposer_id: 1, for_id: 1, stake: 50,
  conditions,
  parties: [{ owner_id: 1, accepted: true }, { owner_id: 3, accepted: true }],
  winner_ids: [], ...extra,
});

console.log('\n--- the sentence reads as English ---');
eq('outscores in a week',
  B.conditionText(cond({ test: 'outscores', subject_id: 1, target_id: 3, week: 4 }), nameOf),
  "Cory's team outscores David in week 4");
eq('a finishing place',
  B.conditionText(cond({ test: 'finishes', subject_id: 2, target_place: 'champion', when: 'season' }), nameOf),
  "Marian's team finishes champion");

console.log('\n--- head-to-head points, a finished week ---');
{
  const r = B.evalCondition(cond({ test: 'outscores', subject_id: 1, target_id: 3, week: 4 }), ctxDone, nameOf);
  ok('Cory 132.55 beat David 118.20', r.value === true, r.line);
  ok('and it shows both numbers', /132\.55/.test(r.line) && /118\.20/.test(r.line), r.line);
}
{
  const r = B.evalCondition(cond({ test: 'outscores', subject_id: 3, target_id: 1, week: 4 }), ctxDone, nameOf);
  ok('the mirror of it is false', r.value === false, r.line);
}
{
  // 132.55 vs 132.55. A tie is not a win for either side.
  const r = B.evalCondition(cond({ test: 'outscores', subject_id: 1, target_id: 9, week: 4 }), ctxDone, nameOf);
  ok('a dead tie is undecided, not a win', r.value === null, r.line);
  ok('and says so in words', /tie/i.test(r.line), r.line);
}
{
  const r = B.evalCondition(cond({ test: 'outscores', subject_id: 1, target_id: 3, week: 12 }), ctxDone, nameOf);
  ok('a week with no scores on file is undecided', r.value === null, r.line);
}

console.log('\n--- a week that has not finished yet ---');
{
  // Week 6 is the current week; the lag says do not grade it.
  const r = B.evalCondition(cond({ test: 'outscores', subject_id: 1, target_id: 2, week: 6 }), ctxLive, nameOf);
  ok('the current week is never graded', r.value === null, r.line);
  ok('and explains why', /isn't final/.test(r.line), r.line);
}
{
  const r = B.evalCondition(cond({ test: 'outscores', subject_id: 1, target_id: 2, week: 4 }), ctxLive, nameOf);
  ok('last week is graded', r.value === true, r.line);
}
{
  const r = B.evalCondition(cond({ test: 'outscores', subject_id: 1, target_id: 2, week: 5 }), ctxLive, nameOf);
  ok('88.0 vs 88.0 is a tie, mid-season too', r.value === null, r.line);
}

console.log('\n--- finishing places ---');
{
  const c = cond({ test: 'finishes', subject_id: 4, target_place: 'champion', when: 'season' });
  ok('Michael was champion', B.evalCondition(c, ctxDone, nameOf).value === true);
}
{
  const c = cond({ test: 'finishes', subject_id: 3, target_place: 'playoffs', when: 'season' });
  ok('David finished 4th — in the playoffs', B.evalCondition(c, ctxDone, nameOf).value === true);
}
{
  const c = cond({ test: 'finishes', subject_id: 6, target_place: 'playoffs', when: 'season' });
  ok('Dylan finished 5th — out of them', B.evalCondition(c, ctxDone, nameOf).value === false);
}
{
  const c = cond({ test: 'finishes', subject_id: 9, target_place: 'last', when: 'season' });
  ok('Richard took the toilet', B.evalCondition(c, ctxDone, nameOf).value === true);
}
{
  const c = cond({ test: 'finishes', subject_id: 2, target_place: 'champion', when: 'season' });
  const r = B.evalCondition(c, ctxLive, nameOf);
  ok('mid-season a finish is undecided', r.value === null, r.line);
  ok('but it still shows where they are now', /1st right now/.test(r.line), r.line);
}

console.log('\n--- ALL vs ANY ---');
const T_WEEK  = cond({ test: 'outscores', subject_id: 1, target_id: 3, week: 4 });          // true
const F_PLACE = cond({ test: 'finishes', subject_id: 1, target_place: 'playoffs', when: 'season' }); // Cory 7th -> false
const T_PLACE = cond({ test: 'finishes', subject_id: 4, target_place: 'champion', when: 'season' }); // true
const U_WEEK  = cond({ test: 'outscores', subject_id: 1, target_id: 3, week: 12 });         // unknown
{
  const v = B.evaluate(propBet([T_WEEK, T_PLACE]), ctxDone, nameOf);
  ok('ALL with both true → the for-side wins', v.decided && JSON.stringify(v.winner_ids) === '[1]', v.headline);
  ok('and it shows a line per condition', v.lines.length === 2, JSON.stringify(v.lines));
}
{
  const v = B.evaluate(propBet([T_WEEK, F_PLACE]), ctxDone, nameOf);
  ok('ALL with one false → the other side wins', v.decided && JSON.stringify(v.winner_ids) === '[3]', v.headline);
}
{
  const v = B.evaluate(propBet([F_PLACE, T_PLACE], { logic: 'any' }), ctxDone, nameOf);
  ok('ANY with one true → the for-side wins', v.decided && JSON.stringify(v.winner_ids) === '[1]', v.headline);
}
{
  // The false already settles it — waiting on the unknown would leave a decided
  // bet open for months.
  const v = B.evaluate(propBet([F_PLACE, U_WEEK]), ctxDone, nameOf);
  ok('ALL short-circuits on the first false', v.decided && JSON.stringify(v.winner_ids) === '[3]', v.headline);
}
{
  const v = B.evaluate(propBet([T_PLACE, U_WEEK], { logic: 'any' }), ctxDone, nameOf);
  ok('ANY short-circuits on the first true', v.decided && JSON.stringify(v.winner_ids) === '[1]', v.headline);
}
{
  const v = B.evaluate(propBet([T_PLACE, U_WEEK]), ctxDone, nameOf);
  ok('ALL with true+unknown stays open', !v.decided, v.headline);
  ok('and says how many are outstanding', /1 condition still open/.test(v.headline), v.headline);
}
{
  const v = B.evaluate(propBet([]), ctxDone, nameOf);
  ok('no conditions → settle by hand, not a guess', !v.decided && /by hand/.test(v.headline), v.headline);
}
{
  ok('only the two useful tests survive — no stat thresholds',
    JSON.stringify(Object.keys(B.TESTS)) === '["outscores","finishes"]', JSON.stringify(Object.keys(B.TESTS)));
}

console.log('\n--- the pool: Cory and Richard each take five teams ---');
// The real bet. Cory: Marian, Bates, Dylan, Justin, himself.
//                Richard: Michael, Sam, Jeremy, David, himself.
const pool = (rules, extra = {}) => ({
  format: 'pool', picks_required: 5, pool_rules: rules, proposer_id: 1, stake: 100,
  terms: 'the annual pool',
  parties: [
    { owner_id: 1, accepted: true, picks: [2, 5, 6, 10, 1] },
    { owner_id: 9, accepted: true, picks: [4, 7, 8, 3, 9] },
  ],
  winner_ids: [], ...extra,
});
{
  const v = B.evaluate(pool(['champion']), ctxDone, nameOf);
  ok('Michael won it, and Richard had him', v.decided && JSON.stringify(v.winner_ids) === '[9]', v.headline);
  ok('the working names the champion', v.lines.some(l => /Michael won it all/.test(l)), JSON.stringify(v.lines));
}
{
  const v = B.evaluate(pool(['last_place']), ctxDone, nameOf);
  ok('Richard finished last and had himself', v.decided && JSON.stringify(v.winner_ids) === '[9]', v.headline);
}
{
  const v = B.evaluate(pool(['champion']), ctxLive, nameOf);
  ok('mid-season it is not settled', !v.decided, v.headline);
  ok('but it still shows who is leading', v.lines.some(l => /lead/.test(l)), JSON.stringify(v.lines));
}

console.log('\n--- the year neither of you has the champion ---');
{
  // THE case this shape exists for. Cory has Marian(6th) and Bates(2nd);
  // Richard has Sam(9th) and Jeremy(3rd). Michael won — neither picked him.
  const p = pool(['champion']);
  p.parties[0].picks = [2, 5];      // Marian 6th, Bates 2nd
  p.parties[1].picks = [7, 8];      // Sam 9th, Jeremy 3rd
  const v = B.evaluate(p, ctxDone, nameOf);
  ok('with only one rule it is a push', v.decided && v.push && !v.winner_ids.length, v.headline);
  ok('and it says to add a tiebreaker', /tiebreaker/.test(v.headline), v.headline);
}
{
  // Same picks, but with the fallback you would actually agree in the chat.
  const p = pool(['champion', 'best_finish']);
  p.parties[0].picks = [2, 5];      // best = Bates, 2nd
  p.parties[1].picks = [7, 8];      // best = Jeremy, 3rd
  const v = B.evaluate(p, ctxDone, nameOf);
  ok('the tiebreaker decides it — Bates 2nd beats Jeremy 3rd',
    v.decided && JSON.stringify(v.winner_ids) === '[1]', v.headline);
  ok('and the working shows the first rule failing first',
    /Nobody hit that one/.test(v.lines.join(' ')), JSON.stringify(v.lines));
  ok('then the tiebreaker with both placings',
    v.lines.some(l => /best was 2nd/.test(l) && /best was 3rd/.test(l)), JSON.stringify(v.lines));
}
{
  // BOTH picked the champion. Old behaviour split the pot; a cascade breaks it.
  const p = pool(['champion', 'most_wins']);
  p.parties[0].picks = [4, 2];      // Michael 11w + Marian 6w = 17
  p.parties[1].picks = [4, 7];      // Michael 11w + Sam 3w    = 14
  const v = B.evaluate(p, ctxDone, nameOf);
  ok('both had the champion, so wins break the tie',
    v.decided && JSON.stringify(v.winner_ids) === '[1]', v.headline);
  ok('and it says they were level first', /Level on that one/.test(v.lines.join(' ')), JSON.stringify(v.lines));
}
{
  // Level all the way down, with rules left unused.
  const p = pool(['champion', 'most_wins']);
  p.parties[0].picks = [5];         // Bates 10w
  p.parties[1].picks = [3];         // David 8w
  const v = B.evaluate(p, ctxDone, nameOf);
  ok('nobody had the champion so it falls to wins',
    v.decided && JSON.stringify(v.winner_ids) === '[1]', v.headline);
}
{
  const p = pool(['champion']);
  p.parties[0].picks = [4]; p.parties[1].picks = [4];
  const v = B.evaluate(p, ctxDone, nameOf);
  ok('identical picks and no tiebreaker really is a split',
    v.decided && !v.push && JSON.stringify(v.winner_ids) === '[1,9]', v.headline);
}

console.log('\n--- the other rules ---');
{
  const p = pool(['most_playoff']);
  p.parties[0].picks = [2, 5];      // Marian 6th, Bates 2nd  -> 1 in
  p.parties[1].picks = [4, 8, 3];   // Michael 1st, Jeremy 3rd, David 4th -> 3 in
  const v = B.evaluate(p, ctxDone, nameOf);
  ok('most teams in the playoffs', v.decided && JSON.stringify(v.winner_ids) === '[9]', v.headline);
  ok('counted in words', v.lines.some(l => /3 in/.test(l)), JSON.stringify(v.lines));
}
{
  const p = pool(['most_points']);
  p.parties[0].picks = [1];         // Cory 1580
  p.parties[1].picks = [4];         // Michael 1810.5
  const v = B.evaluate(p, ctxDone, nameOf);
  ok('most combined points', v.decided && JSON.stringify(v.winner_ids) === '[9]', v.headline);
}
{
  const p = pool(['top_scorer']);
  p.parties[1].picks = [4];
  const v = B.evaluate(p, ctxDone, nameOf);
  ok('picked the highest-scoring team', v.decided && JSON.stringify(v.winner_ids) === '[9]', v.headline);
}
{
  const p = pool(['reg_first']);
  const v = B.evaluate(p, ctxLive, nameOf);
  ok('a regular-season rule waits for the season to finish', !v.decided, v.headline);
  ok('and says why', /still running/.test(v.headline), v.headline);
}
{
  // A bet written before rules were ordered must still grade.
  const old = { format: 'pool', pool_outcome: 'champion', proposer_id: 1, stake: 100, terms: 'old',
    parties: [{ owner_id: 1, picks: [2] }, { owner_id: 9, picks: [4] }], winner_ids: [] };
  const v = B.evaluate(old, ctxDone, nameOf);
  ok('an old single-outcome pool still resolves', v.decided && JSON.stringify(v.winner_ids) === '[9]', v.headline);
}
{
  eq('the sentence reads like the bet you would text someone',
    B.betText({ format: 'pool', picks_required: 5, pool_rules: ['champion', 'best_finish'] }, nameOf),
    "We each pick 5 teams. Decided by whoever picked the champion; if that ties, whoever's best team finished higher.");
}

console.log('\n--- which weeks we will actually fetch ---');
{
  const bets = [
    { status: 'locked', conditions: [cond({ test: 'outscores', week: 3 }), cond({ test: 'outscores', week: 3 })] },
    { status: 'locked', conditions: [cond({ test: 'outscores', week: 5 })] },
    { status: 'locked', conditions: [cond({ test: 'outscores', week: 6 })] },  // current week — not graded
    { status: 'proposed', conditions: [cond({ test: 'outscores', week: 2 })] }, // not locked — not graded
  ];
  eq('deduped, newest first, current week and unlocked bets excluded',
    B.weeksNeeded(bets, 6), [5, 3]);
  const many = Array.from({ length: 20 }, (_, i) => (
    { status: 'locked', conditions: [cond({ test: 'outscores', week: i + 1 })] }));
  ok('and bounded so one page render cannot fan out twenty requests',
    B.weeksNeeded(many, 30).length === B.CFG.MAX_WEEK_FETCH);
}

console.log('\n--- settlement legs: who actually owes whom ---');
{
  // The paperwork side, in sidebets.js, driven by the same numbers.
  const bets = [{
    id: 'a', status: 'settled', stake: 100, created_at: '2026-01-01', winner_ids: [1],
    parties: [{ owner_id: 1 }, { owner_id: 9 }, { owner_id: 3 }],
    legs: [{ id: 'l1', from: 9, to: 1, amount: 100, paid: false },
           { id: 'l2', from: 3, to: 1, amount: 100, paid: false }],
  }, {
    id: 'b', status: 'settled', stake: 40, created_at: '2026-02-01', winner_ids: [9],
    parties: [{ owner_id: 1 }, { owner_id: 9 }],
    legs: [{ id: 'l3', from: 1, to: 9, amount: 40, paid: false }],
  }];
  const s = SB.settlementsFor(bets, 1, nameOf);
  const richard = s.rows.find(r => r.owner_id === 9);
  ok('Richard owes 100 and is owed 40 → netted to 60', richard.net === 60, JSON.stringify(richard.net));
  ok('both legs are still listed to tick off individually', richard.legs.length === 2);
  eq('and the two sides of the summary', [s.owed_to_me, s.i_owe], [160, 0]);

  const t = SB.tallies(bets, OWNERS);
  eq('outstanding money shows up per owner', [t[1].owed_to_me, t[1].i_owe], [200, 40]);
  bets[0].legs[0].paid = true;
  const t2 = SB.tallies(bets, OWNERS);
  ok('and a paid leg stops counting', t2[1].owed_to_me === 100, String(t2[1].owed_to_me));
}
{
  // A push settles the bet and moves no money.
  const bets = [{ id: 'p', status: 'settled', push: true, stake: 100, created_at: '2026-01-01',
                  winner_ids: [], legs: [], parties: [{ owner_id: 1 }, { owner_id: 9 }] }];
  const t = SB.tallies(bets, OWNERS);
  eq('a push is 0-0 and $0, not a loss', [t[1].net, t[1].wins, t[1].losses], [0, 0, 0]);
  const l = SB.ledgerFor(bets, 1, nameOf);
  eq('and it lands in the ledger as a zero, not a blank', [l.rows[0].delta, l.net], [0, 0]);
}

console.log('\n--- money riding on a team, for the standings marker ---');
{
  const bets = [
    // Cory and Richard's pool: each holds five teams.
    { status: 'locked', format: 'pool', stake: 100, terms: 'The annual pool',
      parties: [{ owner_id: 1, picks: [2, 5, 6, 10, 1] }, { owner_id: 9, picks: [4, 7, 8, 3, 9] }] },
    // A straight bet naming two teams.
    { status: 'locked', format: 'prop', stake: 25, for_id: 3, terms: 'Week 4 head to head',
      parties: [{ owner_id: 3 }, { owner_id: 6 }],
      conditions: [cond({ test: 'outscores', subject_id: 3, target_id: 6, week: 4 })] },
    // Not money: a proposal nobody has accepted, and a bet already settled.
    { status: 'proposed', format: 'pool', stake: 999, terms: 'not yet',
      parties: [{ owner_id: 1, picks: [4] }] },
    { status: 'settled', format: 'pool', stake: 999, terms: 'over',
      parties: [{ owner_id: 1, picks: [4] }], winner_ids: [1] },
  ];
  const m = SB.moneyOnTeams(bets, 1, nameOf);
  ok('a team Cory picked is flagged as his money', m[2] && m[2].mine === 100, JSON.stringify(m[2]));
  ok('a team Richard picked is flagged, but not as Cory\'s',
    m[4] && m[4].total === 100 && m[4].mine === 0, JSON.stringify(m[4]));
  // Dylan is in Cory's pool picks (100) AND is the target of David's bet (25).
  // Both count, and only the pool stake is Cory's.
  ok('both sides of a head-to-head carry the money',
    m[6] && m[6].total === 125 && m[6].mine === 100, JSON.stringify(m[6]));
  ok('and a team on two bets lists both reasons', m[6].notes.length === 2, JSON.stringify(m[6].notes));
  ok('David is on two bets at once — the pool and his own', m[3] && m[3].total === 125, JSON.stringify(m[3]));
  ok('and the marker explains itself in words', m[2].notes.some(n => /Cory has 100/.test(n)),
    JSON.stringify(m[2].notes));
  // 999 would show up on Michael if proposals or settled bets counted.
  ok('a proposal is not money and a settled bet is over', m[4].total === 100, JSON.stringify(m[4]));
  ok('nobody picked Justin twice, so he is not double counted', !m[10] || m[10].total === 100);
}

console.log(`\n${pass}/${pass + fail} side-bet logic checks passed`);
if (fail) process.exit(1);
