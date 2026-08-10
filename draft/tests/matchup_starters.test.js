'use strict';
// MATCHUP STARTERS PAIRING — the fix for "my QB across from their WR."
// Sleeper's `starters` array is ordered by the league's starting slots, the same
// order for both teams, so pairing must be BY SLOT INDEX. These fixtures are built
// so a naive "sort each side then zip" would misalign — the test asserts it does not.
const path = require('path');
const MU = require(path.join(__dirname, '..', '..', 'src', 'matchup'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

// QB,RB,RB,WR,WR,TE,FLEX,K,DEF starting + two bench slots.
const ROSTER_POS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN'];

// A player DB keyed by id. Names encode who they are so misalignment is obvious.
const playersDb = { players: {
  m_qb:  { name: 'My QB',   pos: 'QB' },
  m_rb1: { name: 'My RB1',  pos: 'RB' },
  m_rb2: { name: 'My RB2',  pos: 'RB' },
  m_wr1: { name: 'My WR1',  pos: 'WR' },
  m_wr2: { name: 'My WR2',  pos: 'WR' },
  m_te:  { name: 'My TE',   pos: 'TE' },
  m_flex:{ name: 'My FLEX', pos: 'WR' },
  m_k:   { name: 'My K',    pos: 'K' },
  m_def: { name: 'My DEF',  pos: 'DEF' },
  o_qb:  { name: 'Opp QB',  pos: 'QB', inj: 'Q' },
  o_rb1: { name: 'Opp RB1', pos: 'RB' },
  o_rb2: { name: 'Opp RB2', pos: 'RB' },
  o_wr1: { name: 'Opp WR1', pos: 'WR' },
  o_wr2: { name: 'Opp WR2', pos: 'WR' },
  o_te:  { name: 'Opp TE',  pos: 'TE' },
  o_flex:{ name: 'Opp FLEX',pos: 'RB' },
  o_k:   { name: 'Opp K',   pos: 'K' },
  o_def: { name: 'Opp DEF', pos: 'DEF', inj: 'OUT' },
} };

const myRow = {
  roster_id: 1,
  starters: ['m_qb', 'm_rb1', 'm_rb2', 'm_wr1', 'm_wr2', 'm_te', 'm_flex', 'm_k', 'm_def'],
  starters_points: [24.1, 12.0, 8.4, 19.3, 6.2, 11.1, 15.0, 7.0, 9.0],
  players_points: { m_qb: 24.1, m_rb1: 12.0, m_rb2: 8.4, m_wr1: 19.3, m_wr2: 6.2, m_te: 11.1, m_flex: 15.0, m_k: 7.0, m_def: 9.0 },
};
const oppRow = {
  roster_id: 2,
  starters: ['o_qb', 'o_rb1', 'o_rb2', 'o_wr1', 'o_wr2', 'o_te', 'o_flex', 'o_k', 'o_def'],
  starters_points: [30.0, 5.0, 22.0, 3.0, 14.0, 9.0, 18.0, 4.0, 2.0],
  players_points: { o_qb: 30.0, o_rb1: 5.0, o_rb2: 22.0, o_wr1: 3.0, o_wr2: 14.0, o_te: 9.0, o_flex: 18.0, o_k: 4.0, o_def: 2.0 },
};

const out = MU.pairStarters(myRow, oppRow, ROSTER_POS, playersDb);
ck('returns a rows array', !!(out && Array.isArray(out.rows)));
ck('one row per STARTING slot (9), bench excluded', out.rows.length === 9, out && out.rows.length);

// THE CORE INVARIANT: same slot on both sides of every row.
const posOf = name => (Object.values(playersDb.players).find(p => p.name === name) || {}).pos;
let everyRowSamePosFamily = true;
for (const row of out.rows) {
  const a = row.me.pos, b = row.opp.pos;
  // For dedicated slots the two positions must match exactly; FLEX pairs flex-eligible.
  if (row.slotCode && row.slotCode !== 'FLEX') { if (a !== b) everyRowSamePosFamily = false; }
}
ck('QB row pairs QB vs QB', out.rows[0].me.name === 'My QB' && out.rows[0].opp.name === 'Opp QB');
ck('the TE row pairs TE vs TE (not TE vs a WR)', out.rows[5].me.pos === 'TE' && out.rows[5].opp.pos === 'TE');
ck('every dedicated-slot row is same position on both sides', everyRowSamePosFamily);
ck('slot labels ride each row', out.rows[0].slot === 'QB' && out.rows[6].slot === 'FLEX' && out.rows[8].slot === 'DEF');

// Points come off the index-aligned starters_points (QB=24.1 vs 30.0).
ck('points align to the paired player', out.rows[0].me.points === 24.1 && out.rows[0].opp.points === 30.0);

// Injury tags carry through (the manager checks these mid-game).
ck('opponent QB carries a Q tag', out.rows[0].opp.inj === 'Q');
ck('opponent DEF carries an OUT tag', out.rows[8].opp.inj === 'OUT');

// EMPTY SLOT: a '0' pid renders as an empty cell, not a phantom player.
const withEmpty = MU.pairStarters(
  { starters: ['m_qb', '0'], starters_points: [10, 0], players_points: {} },
  { starters: ['o_qb', 'o_rb1'], starters_points: [11, 5], players_points: {} },
  ['QB', 'RB'], playersDb);
ck('an unfilled slot (pid 0) is marked empty, not a phantom', withEmpty.rows[1].me.empty === true && withEmpty.rows[1].me.name === '');
ck('the opponent side of that slot still renders its real player', withEmpty.rows[1].opp.name === 'Opp RB1');

// OPPONENT BYE (no oppRow, e.g. odd week / not yet posted): my side still renders.
const soloMe = MU.pairStarters(myRow, null, ROSTER_POS, playersDb);
ck('with no opponent row, my starters still list and opp cells are empty', soloMe.rows.length === 9 && soloMe.rows[0].opp.empty === true && soloMe.rows[0].me.name === 'My QB');

// No projections supplied -> hasProj false (Proj column stays hidden, honest).
ck('hasProj is false when no projections are supplied', out.hasProj === false);
// Projections wire through when A supplies them.
const withProj = MU.pairStarters(myRow, oppRow, ROSTER_POS, playersDb, { me: { m_qb: 22.5 }, opp: { o_qb: 26.0 } });
ck('projections wire through per-player when supplied', withProj.hasProj === true && withProj.rows[0].me.proj === 22.5 && withProj.rows[0].opp.proj === 26.0);

// Null guard.
ck('null myRow returns null (no throw)', MU.pairStarters(null, oppRow, ROSTER_POS, playersDb) === null);

// MISALIGNMENT DETECTION: if the two starters arrays disagree on a slot's
// position family (a genuinely broken feed), flag it rather than silently show it.
const bad = MU.pairStarters(
  { starters: ['m_qb', 'm_rb1'], starters_points: [10, 5], players_points: {} },
  { starters: ['o_wr1', 'o_rb1'], starters_points: [8, 6], players_points: {} },  // WR sitting in the QB slot
  ['QB', 'RB'], playersDb);
ck('a position/slot conflict sets the misaligned flag', bad.misaligned === true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
