/* Keeper slate editing, diffing and locking.
 * Run: node draft/tests/keeperlock.test.js
 */
const K = require('../../public/js/draft/keeperlock.js');
const DK = require('../../public/js/draft/keepers.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const kp = (id, round, slot) => ({
  player_id: String(id), name: 'P' + id, position: 'RB',
  original_round: round, years_kept: 1, team_slot: slot,
});
const slateOf = (...entries) => {
  const s = {};
  entries.forEach(e => { (s[String(e.team_slot)] = s[String(e.team_slot)] || []).push(e); });
  return s;
};

// --- recovering the slate the artifact was built with -----------------------
{
  const forfeited = [
    { player_id: 7, name: 'Guy', position: 'RB', original_round: 2, years_kept: 1, team_slot: 3, cost_round: 2 },
    { player_id: 9, name: 'Other', position: 'WR', team_slot: 3, cost_round: 5 },
  ];
  const s = K.slateFromForfeited(forfeited);
  check('the slate is recovered from the artifact\'s forfeited picks',
    s['3'].length === 2 && s['3'][0].player_id === '7', JSON.stringify(s));
  check('a keeper with no original round falls back to the cost it was charged',
    s['3'][1].original_round === 5, JSON.stringify(s['3'][1]));
  // Bug fix (2026-08-08): the slate must PRESERVE the distinct cost rounds so the
  // keeper screen shows the real forfeited rounds (1/2/3), not "round 1" three
  // times. Under top_picks_flat the display derives cost by rank (i+1); the raw
  // cost_round must still survive slateFromForfeited for non-flat models.
  check('slateFromForfeited preserves each keeper\'s distinct cost_round',
    s['3'][0].cost_round === 2 && s['3'][1].cost_round === 5, JSON.stringify(s['3']));
  check('an empty forfeited list is an empty slate, not a crash',
    JSON.stringify(K.slateFromForfeited([])) === '{}'
      && JSON.stringify(K.slateFromForfeited(null)) === '{}');
}

// --- the hash is what makes a lock mean anything ----------------------------
{
  const a = slateOf(kp(1, 1, 1), kp(2, 3, 1), kp(3, 2, 5));
  const b = slateOf(kp(3, 2, 5), kp(2, 3, 1), kp(1, 1, 1));   // same, reordered
  check('reordering a team\'s keepers does not change the slate',
    K.slateHash(a) === K.slateHash(b));
  check('changing a keeper\'s cost round DOES change the slate',
    K.slateHash(a) !== K.slateHash(slateOf(kp(1, 4, 1), kp(2, 3, 1), kp(3, 2, 5))));
  check('moving a keeper to another seat changes the slate',
    K.slateHash(a) !== K.slateHash(slateOf(kp(1, 1, 2), kp(2, 3, 1), kp(3, 2, 5))));
  check('swapping one player for another changes the slate',
    K.slateHash(a) !== K.slateHash(slateOf(kp(1, 1, 1), kp(2, 3, 1), kp(4, 2, 5))));
}

// --- validation: the mistakes somebody will actually make -------------------
{
  const cfg = { teams: 10, keepers: { count: 3, cost_model: 'original_round' } };
  check('a clean slate has nothing to say',
    K.validate(slateOf(kp(1, 1, 1), kp(2, 2, 1)), cfg).length === 0);

  const tooMany = K.validate(slateOf(kp(1, 1, 1), kp(2, 2, 1), kp(3, 3, 1), kp(4, 4, 1)), cfg);
  check('four keepers in a three-keeper league is reported',
    tooMany.length === 1 && /4 keepers/.test(tooMany[0]), JSON.stringify(tooMany));

  const dupe = K.validate(slateOf(kp(1, 1, 1), kp(1, 1, 6)), cfg);
  check('the same player kept by two teams is reported, naming both seats',
    dupe.some(p => /seat 1 AND seat 6|seat 6 AND seat 1/.test(p)), JSON.stringify(dupe));

  // A keeper is BY DEFINITION off the draftable board. Warning about that
  // fired on all thirty keepers of a normal slate and buried the duplicate
  // warning — thirty warnings on the happy path teaches you to ignore them.
  const offBoard = K.validate(slateOf(kp(1, 1, 1), kp(2, 2, 1)), cfg, { 99: {} });
  check('being off the draftable board is NOT a problem — that is what a keeper is',
    offBoard.length === 0, JSON.stringify(offBoard));

  const noCost = K.validate(
    slateOf({ player_id: '8', name: 'Mystery', original_round: null, team_slot: 1 }), cfg);
  check('a keeper with no cost round IS a problem, and names the default he will be charged',
    noCost.length === 1 && /undrafted default of round 10|no cost round set/.test(noCost[0]),
    JSON.stringify(noCost));

  const tooDeep = K.validate(slateOf(kp(1, 40, 1)), { teams: 10, rounds: 13, keepers: { count: 3 } });
  check('a cost round past the end of the draft is reported',
    tooDeep.some(p => /only 13 rounds/.test(p)), JSON.stringify(tooDeep));

  check('a keeper on a seat that does not exist is reported',
    K.validate(slateOf(kp(1, 1, 14)), cfg).some(p => /14/.test(p)));

  const ineligible = K.validate(
    slateOf({ player_id: '5', name: 'Undrafted', original_round: null, team_slot: 1 }),
    { teams: 10, keepers: { count: 3, cost_model: 'original_round', undrafted_rule: 'ineligible' } });
  check('an undrafted keeper in a league that forbids them is reported',
    ineligible.some(p => /not allow undrafted/.test(p)), JSON.stringify(ineligible));
}

// --- the diff ---------------------------------------------------------------
{
  const before = slateOf(kp(1, 1, 1), kp(2, 3, 1), kp(3, 2, 5));
  check('an unchanged slate diffs to nothing',
    K.diffSlates(before, before).changed === 0);

  const swapped = slateOf(kp(1, 1, 1), kp(9, 3, 1), kp(3, 2, 5));
  const d = K.diffSlates(before, swapped);
  check('a swap shows as one in and one out',
    d.added.length === 1 && d.removed.length === 1 && d.added[0].player_id === '9'
      && d.removed[0].player_id === '2', JSON.stringify(d));

  const recost = K.diffSlates(before, slateOf(kp(1, 1, 1), kp(2, 8, 1), kp(3, 2, 5)));
  check('a cost change shows as a move with both rounds, not as in-and-out',
    recost.moved.length === 1 && recost.moved[0].from === 3 && recost.moved[0].to === 8
      && recost.added.length === 0 && recost.removed.length === 0, JSON.stringify(recost));

  const reseated = K.diffSlates(before, slateOf(kp(1, 1, 2), kp(2, 3, 1), kp(3, 2, 5)));
  check('a player moving seats shows as both teams changing',
    reseated.added.length === 1 && reseated.removed.length === 1, JSON.stringify(reseated));
}

// --- the lock: three states, and the third is the dangerous one -------------
{
  const slate = slateOf(kp(1, 1, 1), kp(2, 3, 1));
  const now = Date.parse('2026-08-07T12:00:00Z');

  const never = K.lockState(null, slate, now);
  check('never confirmed is not locked and says why it matters',
    never.locked === false && /never been confirmed/.test(never.message));

  const good = K.lockState({ hash: K.slateHash(slate), at: '2026-08-07T09:00:00Z' }, slate, now);
  check('confirming the slate on screen locks it',
    good.locked === true && good.matches === true && good.stale === false);

  // THE ONE THAT MATTERS: a cleared banner over an edited slate actively
  // asserts that somebody checked, which is worse than no banner at all.
  const edited = K.lockState({ hash: K.slateHash(slate), at: '2026-08-07T09:00:00Z' },
    slateOf(kp(1, 1, 1), kp(2, 3, 1), kp(3, 5, 4)), now);
  check('editing after confirming UNLOCKS rather than leaving the banner cleared',
    edited.locked === false && edited.edited === true, JSON.stringify(edited));
  check('and it says the slate was edited, not that it was never confirmed',
    /edited since it was confirmed/.test(edited.message));

  const old = K.lockState({ hash: K.slateHash(slate), at: '2026-06-01T09:00:00Z' }, slate, now);
  check('a very old confirmation stays locked but is marked stale',
    old.locked === true && old.stale === true && /days ago/.test(old.message),
    JSON.stringify(old));
}

// --- consequence: the sentence that catches a bad edit ----------------------
{
  const one = K.consequence({ myPicks: [4, 17, 24], poolSize: 200 },
                            { myPicks: [4, 17, 25], poolSize: 199 });
  check('a pick move is stated as a before and after',
    one.some(l => /24 → 25/.test(l)), JSON.stringify(one));
  check('and a change in pool size is counted',
    one.some(l => /1 player is no longer/.test(l)), JSON.stringify(one));

  const gained = K.consequence({ myPicks: [4, 17], poolSize: 199 },
                               { myPicks: [4, 17, 30], poolSize: 200 });
  check('gaining a pick says so explicitly',
    gained.some(l => /3 picks, not 2/.test(l)), JSON.stringify(gained));
  check('and a growing pool reads as growing',
    gained.some(l => /1 player is now in the draft pool/.test(l)), JSON.stringify(gained));

  const best = K.consequence(
    { myPicks: [4], bestAtFirst: { player_id: '1', name: 'Alpha' }, poolSize: 200 },
    { myPicks: [4], bestAtFirst: { player_id: '2', name: 'Bravo' }, poolSize: 200 });
  check('the best player likely to reach you is named before and after',
    best.some(l => /Alpha → Bravo/.test(l)), JSON.stringify(best));

  check('an edit that changes nothing says exactly that',
    K.consequence({ myPicks: [4, 17], poolSize: 200 },
                  { myPicks: [4, 17], poolSize: 200 })[0] === 'No change to your picks or to the pool.');
}

// --- and the thing this is all for: the recompute is real -------------------
{
  /* REMOVING ANOTHER TEAM'S KEEPER MUST NOT MOVE MY PICKS.
   *
   * This block used to say the opposite — "removing ONE keeper from ONE team
   * must shift every downstream pick number, not just that team's" — and
   * `buildTruePickOrder` renumbered survivors 1..N to make it true. Sleeper's
   * own log for this league says otherwise: 150 picks and round 4 at overall 31
   * in 2023 (0 keepers), 2024 (23) and 2025 (20) alike. A forfeited pick is
   * OCCUPIED, not deleted.
   *
   * The consequence line has to follow the same truth, and this is where it
   * matters most: `keeperlock` exists so a slate edit STATES what it did. Under
   * the old model it told Cory his picks had moved when another owner declared a
   * keeper. They had not, and acting on that is a real cost — it is the number
   * he plans the whole draft around. */
  const cfg = { teams: 10, rounds: 5, draft_type: 'snake', my_draft_slot: 4,
                adp_blend_weight: 0.7,
                keepers: { count: 3, cost_model: 'original_round', undrafted_round: 10 } };
  const players = [];
  for (let i = 1; i <= 60; i++) {
    players.push({ player_id: String(i), name: 'P' + i, position: 'RB',
                   raw_adp: i, adjusted_adp: i, proj_mean: 300 - i, vorp: (300 - i) / 10 });
  }
  const full = { '1': [kp(1, 1, 1)], '7': [kp(20, 2, 7)] };
  const fewer = { '1': [kp(1, 1, 1)] };

  const a = DK.reapply(players, cfg, full);
  const b = DK.reapply(players, cfg, fewer);
  check('removing one keeper gives everyone one more pick',
    b.order.picks.length === a.order.picks.length + 1,
    a.order.picks.length + ' -> ' + b.order.picks.length);
  check('but it does NOT move MY pick numbers — the keeper was another team\'s',
    a.order.my_picks.join(',') === b.order.my_picks.join(','),
    a.order.my_picks + ' vs ' + b.order.my_picks);
  check('CONTROL — the removed keeper really did belong to another team',
    Number(cfg.my_draft_slot) !== 7, cfg.my_draft_slot);
  check('the removed keeper is back in the pool',
    a.kept_ids.indexOf('20') >= 0 && b.kept_ids.indexOf('20') < 0);

  // Two keepers costing the same round must roll forward, not collide. This
  // rule exists in the Python implementation and must not be lost.
  const collide = DK.reapply(players, cfg, { '2': [kp(30, 3, 2), kp(31, 3, 2)] });
  const rounds = collide.order.forfeited.filter(f => f.team_slot === 2)
    .map(f => f.cost_round).sort();
  check('two keepers costing the same round roll forward instead of colliding',
    rounds.length === 2 && rounds[0] !== rounds[1], JSON.stringify(rounds));
  check('and both still leave the pool',
    collide.kept_ids.indexOf('30') >= 0 && collide.kept_ids.indexOf('31') >= 0);

  // A slate edit has to produce a consequence a human can check.
  const c = K.consequence(
    { myPicks: a.order.my_picks, poolSize: players.length - a.kept_ids.length },
    { myPicks: b.order.my_picks, poolSize: players.length - b.kept_ids.length });
  check('the consequence names the POOL change and does not claim my picks moved',
    c.length >= 1 && /draft pool/i.test(c.join(' ')) && !/picks change/i.test(c.join(' ')),
    JSON.stringify(c));

  /* THE CONTROL THAT KEEPS THE CHECK ABOVE HONEST. "Does not say picks changed"
   * would also pass if `consequence` could never say it. Dropping one of MY OWN
   * keepers gives me back an earlier round, and it must say so. */
  const mineFull = { '4': [kp(1, 1, 4), kp(2, 2, 4)], '7': [kp(20, 2, 7)] };
  const mineFewer = { '4': [kp(1, 1, 4)], '7': [kp(20, 2, 7)] };
  const m1 = DK.reapply(players, cfg, mineFull);
  const m2 = DK.reapply(players, cfg, mineFewer);
  check('CONTROL — dropping one of MY keepers DOES move my picks',
    m1.order.my_picks.join(',') !== m2.order.my_picks.join(','),
    m1.order.my_picks + ' vs ' + m2.order.my_picks);
  const cMine = K.consequence(
    { myPicks: m1.order.my_picks, poolSize: players.length - m1.kept_ids.length },
    { myPicks: m2.order.my_picks, poolSize: players.length - m2.kept_ids.length });
  check('and the consequence says so in words', /picks change/i.test(cMine.join(' ')),
    JSON.stringify(cMine));
}


// ---------------------------------------------------------------------------
// A SLATE ABOUT A DIFFERENT BOARD
//
// The slate persists in localStorage and stores the player's NAME snapshotted
// at save time. A slate built while a fixture board was loaded therefore keeps
// showing fixture names — "RB Player 2" — forever, and its ids are synthetic
// too. Confirming it would recompute adjusted ADP and the true pick order
// against players that do not exist, with every screen looking normal.
// ---------------------------------------------------------------------------
{
  const clone = o => JSON.parse(JSON.stringify(o));
  const board = { '9221': { player_id: '9221', name: 'Jahmyr Gibbs' },
                  '9509': { player_id: '9509', name: 'Bijan Robinson' } };
  const good = { 1: [{ player_id: '9221', name: 'Jahmyr Gibbs', original_round: 3 }] };
  const stale = { 1: [{ player_id: 'p12', name: 'RB Player 2', original_round: 3 }] };

  // THE TRAP: a real keeper is ABSENT from the draftable board — that is what
  // being kept MEANS. An earlier version of this check tested ids against the
  // board alone and flagged all thirty legitimate keepers, reintroducing a
  // false positive this project had already fixed once. Hence the third
  // argument: Sleeper's own keeper set.
  const sleeperKeepers = { 3: [{ player_id: '4034', name: 'Christian McCaffrey' }] };
  const realKeeper = { 3: [{ player_id: '4034', name: 'Christian McCaffrey',
                             original_round: 2 }] };

  check('a player still on the draftable board is not an orphan',
    K.orphans(good, board, {}).length === 0);
  check('a REAL keeper is off the board and must NOT be flagged — that is what '
    + 'being kept means',
    K.orphans(realKeeper, board, sleeperKeepers).length === 0,
    JSON.stringify(K.orphans(realKeeper, board, sleeperKeepers)));
  check('a slate entry in neither the board nor Sleeper\u2019s keepers IS an '
    + 'orphan, reported by the name it is wearing',
    K.orphans(stale, board, sleeperKeepers).length === 1
      && K.orphans(stale, board, sleeperKeepers)[0].name === 'RB Player 2',
    JSON.stringify(K.orphans(stale, board, sleeperKeepers)));

  // Divergence: same shape, different question. Not "did I edit this since
  // confirming" but "did Sleeper change under my saved copy".
  const built = { 1: [{ player_id: '9221', name: 'Jahmyr Gibbs', original_round: 3 }],
                  2: [{ player_id: '9509', name: 'Bijan Robinson', original_round: 5 }] };
  check('an identical saved slate does not claim divergence',
    K.divergesFromSource(clone(built), built) === null);
  check('a saved slate that Sleeper has moved past is reported, with both counts',
    (function () {
      const d = K.divergesFromSource(good, built);
      return d && d.diverged && d.saved_count === 1 && d.source_count === 2;
    })(), JSON.stringify(K.divergesFromSource(good, built)));
}


console.log(`\n${pass}/${pass + fail} keeper-lock checks passed`);
process.exit(fail ? 1 : 0);
