// TERRITORY: A
'use strict';
/* MEMBER WEEK ENGINE — pure checks on the member-site pass's three engines:
 * previews (h2h-backed), the Sleeper-fed odds (access-rule mechanics: the mean
 * is proj_sleeper and ONLY proj_sleeper; refusal over fabrication; symmetric
 * K/DEF exclusion), and the swing-layer stake lines (real re-rank arithmetic).
 * Everything here is offline-pure: fixtures in, claims out.
 */
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mweng-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const MW = require(path.join(ROOT, 'src', 'routes', 'memberweek'));
const RW = require(path.join(ROOT, 'src', 'routes', 'recordswatch'));
const WW = require(path.join(ROOT, 'src', 'routes', 'whatwatch'));
const LO = require(path.join(ROOT, 'src', 'routes', 'lineup'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

(async () => {
  // ── 1. PREVIEWS, over a fixture harvest ────────────────────────────────────
  // Two owners with three meetings: David won the last two, Marian the first.
  // The name→uid resolution reads the REAL archive's handle table (that is the
  // production join), so the fixture carries the real user_ids for those names.
  const H2H = require(path.join(ROOT, 'src', 'routes', 'h2h'));
  const uD = H2H.userIdForName('David'), uM = H2H.userIdForName('Marian');
  ck('preview precondition: the real archive resolves David and Marian', !!uD && !!uM);
  const fixture = { seasons: [{ season: '2024', owners: {
      1: { user_id: uD, display_name: 'ds7mmet' }, 2: { user_id: uM, display_name: 'MarianSaar' } },
    weeks: {
      3: [{ roster_id: 1, matchup_id: 1, points: 90 }, { roster_id: 2, matchup_id: 1, points: 100 }],
      7: [{ roster_id: 1, matchup_id: 2, points: 120 }, { roster_id: 2, matchup_id: 2, points: 95 }],
      10: [{ roster_id: 1, matchup_id: 3, points: 131.5 }, { roster_id: 2, matchup_id: 3, points: 101.25 }],
    } }] };
  const pv = MW.previewFor('David', 'Marian', fixture);
  ck('preview: the lead line states the real record', pv && pv.leadLine === 'David leads 2–1 all-time', pv && pv.leadLine);
  ck('preview: the streak is the current run', pv && pv.streakLine === 'David has won 2 straight', pv && pv.streakLine);
  ck('preview: the last meeting is the most recent game with its score',
    pv && /last meeting: David won 131\.5–101\.[23]/.test(pv.lastLine) && /2024 wk10/.test(pv.lastLine), pv && pv.lastLine);
  const pvNone = MW.previewFor('David', 'Nobody Real', fixture);
  ck('preview: an unplaceable name refuses (lookup failure ≠ no meetings)', pvNone === null);

  // ── 2. THE SLEEPER-FED ODDS ────────────────────────────────────────────────
  const board = players => ({ players });
  const P = (id, pos, sleeper, opts = {}) => Object.assign(
    { player_id: id, name: 'P' + id, position: pos, proj_sleeper: sleeper,
      proj_mean: 999, proj_ownmodel: 888, bye: null, injury_status: null }, opts);
  const art = board([
    P('a1', 'QB', 340), P('a2', 'RB', 255), P('a3', 'K', null), P('a4', 'DEF', null),
    P('b1', 'QB', 255), P('b2', 'RB', 170), P('b3', 'K', null), P('b4', 'DEF', null),
    // A priced WR exists on the board, so WR is a Sleeper-projected position —
    // which makes x9 (a WR with no number) a REFUSAL, not an exclusion.
    P('w1', 'WR', 200), P('x9', 'WR', null),
  ]);
  const o1 = MW.matchupOdds(['a1', 'a2', 'a3', 'a4'], ['b1', 'b2', 'b3', 'b4'], { week: 8, artifact: art });
  ck('odds: prices a fully-covered matchup', o1.ok === true, JSON.stringify(o1));
  ck('odds: favors the stronger Sleeper side', o1.ok && o1.pWin > 0.5, o1.pWin);
  // THE ACCESS-RULE MECHANIC: the mean is proj_sleeper/17, NOT proj_mean (999)
  // and NOT proj_ownmodel (888). 340+255 = 595/17 = 35.0.
  ck('odds: the mean is proj_sleeper/17 — never proj_mean, never the model',
    o1.ok && Math.abs(o1.my - 35.0) < 0.11, o1.my);
  ck('odds: K/DEF are excluded symmetrically and named',
    o1.ok && o1.excluded.join(',') === 'DEF,K', o1.excluded && o1.excluded.join(','));
  ck('odds: the basis names Sleeper', o1.ok && /sleeper/.test(o1.basis), o1.basis);
  // pWin agreement with the /watch core, same inputs.
  {
    const sig = LO.positionSigmas();
    const sd = pos => Number(sig && sig[pos]) || WW.CFG.DEFAULT_SD;
    const va = sd('QB') ** 2 + sd('RB') ** 2;
    const expected = LO.pWin(595 / 17, va, 425 / 17, va);
    ck('odds: the probability core IS the /watch panel\'s (LO.pWin, same number)',
      o1.ok && Math.abs(o1.pWin - expected) < 1e-9, `${o1.pWin} vs ${expected}`);
  }
  // Refusals: a skill starter with no Sleeper number, or off the board.
  const o2 = MW.matchupOdds(['a1', 'x9'], ['b1', 'b2'], { week: 8, artifact: art });
  ck('odds: REFUSES when a skill starter has no Sleeper projection (absent ≠ zero)',
    o2.ok === false && /no Sleeper projection/.test(o2.why), JSON.stringify(o2));
  const o3 = MW.matchupOdds(['a1', 'zz'], ['b1', 'b2'], { week: 8, artifact: art });
  ck('odds: REFUSES a starter the board has never seen', o3.ok === false && /not on the board/.test(o3.why));
  const o4 = MW.matchupOdds(['a1', 'a2'], ['b1', 'b2'], { week: 8, artifact: null });
  ck('odds: REFUSES with no board artifact', o4.ok === false);
  // Bye zeroing rides proj_feed's ladder: a player on bye contributes zero mean.
  const artBye = board([P('a1', 'QB', 340, { bye: 8 }), P('b1', 'QB', 340)]);
  const o5 = MW.matchupOdds(['a1'], ['b1'], { week: 8, artifact: artBye });
  ck('odds: a bye starter projects zero (the feed\'s ladder, reused)',
    o5.ok && o5.my === 0 && o5.opp === 20, JSON.stringify(o5));

  // ── 3. WEEK NAV: pastWeek + ownerSeason off the frozen docs ───────────────
  await store.set('pickem-slate:2026:3', { season: 2026, week: 3, games: [
    { id: '1:2', a: { id: 1, name: 'Cory' }, b: { id: 2, name: 'David' } },
    { id: '3:4', a: { id: 3, name: 'Michael' }, b: { id: 4, name: 'Sam' } }] });
  await store.set('pickem-points:2026:3', { 1: 101.5, 2: 99.5, 3: 88, 4: 120 });
  const pw = await MW.pastWeek(2026, 'LID', 3);
  ck('pastWeek: reads the frozen slate + points', pw && pw.final && pw.games.length === 2);
  ck('pastWeek: the winner is derived from the frozen points',
    pw && pw.games[0].winnerId === 1 && pw.games[1].winnerId === 4);
  const pwNone = await MW.pastWeek(2026, 'LID', 9);
  ck('pastWeek: an unfrozen week is null (honest gap, not empty slate)', pwNone === null);

  const sched = { fetched_at: Date.now(), weeks: { 5: [[1, 4], [2, 3]] } };
  const season = await MW.ownerSeason(1, { seasonYear: 2026, leagueId: 'LID', curWeek: 4,
    regWeeks: 5, nameOf: id => 'O' + id, currentOppId: 3, scheduleDoc: sched });
  ck('ownerSeason: a past win reads W with both scores',
    season[2].state === 'past' && season[2].result === 'W' && season[2].myPts === 101.5 && season[2].oppName === 'David',
    JSON.stringify(season[2]));
  ck('ownerSeason: an unfrozen past week is known:false', season[0].known === false && season[1].known === false);
  ck('ownerSeason: the current week names the live opponent', season[3].state === 'current' && season[3].oppName === 'O3');
  ck('ownerSeason: the future week reads the schedule doc ("when do I play O4 again")',
    season[4].state === 'future' && season[4].known === true && season[4].oppId === 4);

  // futureSchedule failure memory: a dead fetch is remembered, not re-paid.
  {
    let calls = 0;
    const dead = async () => { calls++; return null; };
    await MW.futureSchedule('L2', 2026, 4, 8, { fetchWeek: dead, rosterToOwner: () => 1 });
    ck('futureSchedule: a dead fetch stops at the FIRST week (one timeout, not five)', calls === 1, calls);
    await MW.futureSchedule('L2', 2026, 4, 8, { fetchWeek: dead, rosterToOwner: () => 1 });
    ck('futureSchedule: the failure is remembered — the next render pays nothing', calls === 1, calls);
  }

  // ── 4. RECORDS WATCH honesty ───────────────────────────────────────────────
  const records = {
    highestWeek: [180, 175, 170, 168, 166.3].map(p => ({ points: p })),
    biggestBlowout: [80, 75, 70, 65, 60].map(m => ({ margin: m })),
    lowestWeek: [40, 45, 50, 55, 58].map(p => ({ points: p })),
    mostInLoss: [150, 145, 140, 138, 135].map(p => ({ points: p })),
  };
  const mk = (aPts, bPts) => [{ a: { id: 1, name: 'Mike' }, b: { id: 2, name: 'Dave' }, aPts, bPts }];
  ck('records: dormant on an ordinary score', RW.liveWatch(records, mk(120, 110)).length === 0);
  const inBook = RW.liveWatch(records, mk(171.9, 100));
  ck('records: a live score past the No. 5 week fires as a fact-in-progress (scores only rise)',
    inBook.some(c => c.kind === 'high' && c.level === 'in' && /already past the all-time No\. 5 week/.test(c.text)),
    JSON.stringify(inBook));
  const blow = inBook.find(c => c.kind === 'blowout');
  ck('records: a live blowout margin ALWAYS says IF IT HOLDS (margins can shrink)',
    blow && /IF IT HOLDS/.test(blow.text), blow && blow.text);
  const near = RW.liveWatch(records, mk(158, 100));
  ck('records: near-the-book says shy-of, with both printed numbers subtractable',
    near.some(c => c.level === 'near' && /8\.3 shy of the all-time top-5/.test(c.text)), JSON.stringify(near));
  ck('records: liveWatch NEVER emits a bad-beat (a loss does not exist mid-game)',
    !RW.liveWatch(records, mk(139, 160)).some(c => c.kind === 'badbeat'));
  const done = RW.completedWatch(records, [{ ownerId: 1, name: 'Rich', pts: 139, oppPts: 160 }], 7);
  ck('records: a finished top-5 loss IS a bad beat banner',
    done.some(c => c.kind === 'badbeat' && /scored 139 and LOST/.test(c.text)), JSON.stringify(done));
  ck('records: a thin book (fewer than 5 entries) stays silent rather than inventing a bar',
    RW.liveWatch({ highestWeek: [{ points: 150 }] }, mk(171, 100)).length === 0);

  // ── 5. THE SWING LAYER: gameStake re-ranks the real table ─────────────────
  const rows = [
    { owner_id: 1, wins: 6, losses: 2, pf: 900 },
    { owner_id: 2, wins: 5, losses: 3, pf: 880 },
    { owner_id: 3, wins: 4, losses: 4, pf: 860 },
    { owner_id: 4, wins: 4, losses: 4, pf: 840 },
    { owner_id: 5, wins: 4, losses: 4, pf: 820 },
    { owner_id: 6, wins: 1, losses: 7, pf: 700 },
  ];
  const names = { 1: 'A1', 2: 'B2', 3: 'C3', 4: 'D4', 5: 'E5', 6: 'F6' };
  // 4 vs 5: both at the cut boundary (cut 4) — winner in, loser out.
  const s45 = WW.gameStake(4, 5, { rows, cut: 4, names });
  ck('stake: a cut-boundary game reads as a playoff-line game',
    s45 && /playoff-line game/.test(s45), s45);
  // 5 vs 6, both at the bottom and close on points: whoever loses holds last.
  const rows2 = rows.map(r => r.owner_id === 5 ? { ...r, wins: 2, losses: 6, pf: 690 }
    : r.owner_id === 6 ? { ...r, wins: 2, losses: 6, pf: 700 } : r);
  const s56 = WW.gameStake(5, 6, { rows: rows2, cut: 4, names });
  ck('stake: a bottom-pair game carries the toilet line', s56 && /toilet/.test(s56), s56);
  // The $100 leader's game says so.
  const s12 = WW.gameStake(1, 2, { rows, cut: 4, names, whLeaderId: 2 });
  ck('stake: the $100 lead is named when it rides in the game', s12 && /\$100 lead \(B2\)/.test(s12), s12);
  ck('stake: dormant with a thin table', WW.gameStake(1, 2, { rows: rows.slice(0, 2), cut: 4, names }) === null);
  ck('stake: rankOwners sorts wins then points-for (the standings\' own order)',
    JSON.stringify(WW.rankOwners(rows)) === JSON.stringify({ 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 }));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
