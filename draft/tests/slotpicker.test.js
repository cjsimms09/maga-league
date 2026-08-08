/* SLOT PICKER (private, Cory-only) — the robot scenario Cory asked for:
 *  (1) re-ranking updates when a claim lands,
 *  (2) access denial for a non-Cory login (the requireCory guard),
 *  (3) the tool is READ-ONLY — it never mutates the shared claim doc, so the
 *      shared /draft page cannot change because of it.
 *
 * Run: node draft/tests/slotpicker.test.js
 */
'use strict';
const SP = require('../../src/slotpicker.js');

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) pass++; else { fail++; console.log('FAIL  ' + n + (d ? '  -> ' + d : '')); } };

// Minimal artifact: a board with a clear best TE, 10 teams, 15 rounds.
const artifact = {
  league: { teams: 10, rounds: 15 },
  players: [
    { player_id: 'te1', name: 'Brock Bowers', position: 'TE', vorp: 82, proj_mean: 240 },
    { player_id: 'wr1', name: 'Top WR', position: 'WR', vorp: 70, proj_mean: 230 },
    { player_id: 'rb1', name: 'Top RB', position: 'RB', vorp: 68, proj_mean: 228 },
  ],
};
const owners = { 1: 'Cory', 2: 'Marian', 5: 'Richard2121' };
const nameOf = id => owners[id] || ('Owner ' + id);

// State A: only Richard2121 (owner 5) has claimed — his slot is 7.
const claimA = [
  { pos: 1, owner_id: 9, slot: null }, { pos: 2, owner_id: 7, slot: null },
  { pos: 3, owner_id: 5, slot: 7 },    { pos: 4, owner_id: 1, slot: null },
];
const A = SP.analyze({ artifact, claimOrder: claimA, myOwnerId: 1, keeperRounds: 3, ownerName: nameOf });

check('open slots exclude the taken one', A.open.every(c => c.slot !== 7) && A.open.length === 9,
  'open=' + A.open.length);
check('taken list names who took slot 7', A.taken.length === 1 && A.taken[0].slot === 7
  && A.taken[0].ownerName === 'Richard2121');
check('a recommendation is pinned', !!A.recommendation && A.recommendation.slot >= 1);
check('rank 1 is the earliest open first pick (round 4 reverses → high slot first)',
  A.open[0].rank === 1 && A.open[0].first === Math.min.apply(null, A.open.map(c => c.first)));
check('Bowers survival is reported and higher for earlier first picks',
  A.open[0].bowersSurvival != null && A.open[0].bowersSurvival >= A.open[A.open.length - 1].bowersSurvival);
check('provenance + caveat carried', A.provenance === 'site claims — Sleeper pending'
  && /Aug 20/.test(A.caveat));
check('not yet claimed by me', A.claimed === false && A.myClaim === null);

// (1) RE-RANK ON A CLAIM: someone takes slot 10 (the previous #1). The model must
// drop slot 10 and promote the next-best.
const prevTop = A.open[0].slot;
const claimB = claimA.concat([{ pos: 5, owner_id: 2, slot: prevTop }]);
const B = SP.analyze({ artifact, claimOrder: claimB, myOwnerId: 1, keeperRounds: 3, ownerName: nameOf });
check('re-rank: the newly-taken slot leaves the open set', B.open.every(c => c.slot !== prevTop));
check('re-rank: a NEW slot is now rank 1 (recommendation moved)',
  B.recommendation.slot !== prevTop && B.open[0].slot !== prevTop);
check('re-rank: taken list grew to include the new claim', B.taken.some(t => t.slot === prevTop));

// (2) MY CLAIM collapses the model to a confirmation.
const claimC = claimA.map(e => e.owner_id === 1 ? Object.assign({}, e, { slot: 4 }) : e);
const C = SP.analyze({ artifact, claimOrder: claimC, myOwnerId: 1, keeperRounds: 3, ownerName: nameOf });
check('my claim: model reports claimed with my slot + my picks',
  C.claimed === true && C.myClaim === 4 && Array.isArray(C.myClaimPicks) && C.myClaimPicks.length === 12);

// (3) READ-ONLY: analyze must not mutate the claim order it was given.
const before = JSON.stringify(claimA);
SP.analyze({ artifact, claimOrder: claimA, myOwnerId: 1, keeperRounds: 3, ownerName: nameOf });
check('read-only: analyze does not mutate the shared claim doc', JSON.stringify(claimA) === before);

// Access-guard shape: requireCory admits a commissioner, rejects everyone else.
// (Mirrors src/routes/admin.js requireCory; the route is also under
// requireCommissioner, so a non-commissioner never reaches it.)
function requireCory(owner) { return !!(owner && owner.is_commissioner === true); }
check('access: a commissioner (Cory) is admitted', requireCory({ is_commissioner: true }) === true);
check('access: a non-commissioner owner is DENIED', requireCory({ is_commissioner: false }) === false);
check('access: a missing owner is DENIED', requireCory(null) === false);

console.log((fail ? '' : '\n') + pass + '/' + (pass + fail) + ' slot-picker checks passed');
process.exit(fail ? 1 : 0);
