/* Live keeper reconciliation — Part 4 §3, "the highest-risk gap".
 * Run: node draft/tests/reconcile.test.js
 */
const R = require('../../public/js/draft/reconcile.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const players = { a: { name: 'Player A' }, b: { name: 'Player B' },
                  c: { name: 'Player C' }, z: { name: 'Surprise Guy' } };
const assumed = [
  { player_id: 'a', team_slot: 1, cost_round: 1, name: 'Player A' },
  { player_id: 'b', team_slot: 2, cost_round: 3, name: 'Player B' },
  { player_id: 'c', team_slot: 3, cost_round: 5, name: 'Player C' },
];
const opts = { playersById: players, currentRound: 6 };

// --- clean slate ------------------------------------------------------------
{
  const picks = assumed.map((k, i) => ({ player_id: k.player_id, is_keeper: true,
                                         draft_slot: k.team_slot, pick_no: i + 1 }));
  const r = R.reconcile(picks, assumed, opts);
  check('a matching slate reconciles clean and does not halt', r.ok && !r.halt, JSON.stringify(r));
}

// --- a keeper nobody told us about -----------------------------------------
{
  const picks = assumed.map((k, i) => ({ player_id: k.player_id, is_keeper: true,
                                         draft_slot: k.team_slot, pick_no: i + 1 }));
  picks.push({ player_id: 'z', is_keeper: true, draft_slot: 7, pick_no: 9 });
  const r = R.reconcile(picks, assumed, opts);
  check('an unknown keeper is detected', r.unknown.length === 1 && r.unknown[0].player_id === 'z');
  check('an unknown keeper halts recommendations', r.halt === true);
  check('the alert names him', /Surprise Guy/.test(r.message || ''), r.message);

  const slate = R.correctedSlate(assumed, r, { playersById: players });
  check('the corrected slate adds him to the right team',
    (slate['7'] || []).some(k => String(k.player_id) === 'z'), JSON.stringify(slate['7']));
  check('the corrected slate keeps everyone else',
    (slate['1'] || []).length === 1 && (slate['2'] || []).length === 1);
}

// --- an assumed keeper who was not kept -------------------------------------
{
  // Player B (cost round 3) never appears, and we are in round 6.
  const picks = [
    { player_id: 'a', is_keeper: true, draft_slot: 1, pick_no: 1 },
    { player_id: 'c', is_keeper: true, draft_slot: 3, pick_no: 2 },
  ];
  const r = R.reconcile(picks, assumed, opts);
  check('an assumed keeper who was not kept is detected',
    r.missing.length === 1 && r.missing[0].player_id === 'b', JSON.stringify(r.missing));
  check('the message explains why this one is dangerous',
    /invisible/.test(r.message || ''), r.message);

  const slate = R.correctedSlate(assumed, r, { playersById: players });
  check('the corrected slate frees him back into the pool',
    !(slate['2'] || []).some(k => String(k.player_id) === 'b'), JSON.stringify(slate['2']));
}

// --- absence proves nothing before his round ---------------------------------
{
  // Same missing keeper, but the draft is only in round 2 — his round 3 keeper
  // pick has not happened yet, so silence is expected, not a discrepancy.
  const picks = [{ player_id: 'a', is_keeper: true, draft_slot: 1, pick_no: 1 }];
  const early = R.reconcile(picks, assumed, { playersById: players, currentRound: 2 });
  check('a keeper is not reported missing before his cost round passes',
    early.missing.length === 0, JSON.stringify(early.missing));
  check('and nothing halts on that basis alone', early.halt === false);
}

// --- non-keeper picks must not be mistaken for keepers ----------------------
{
  const picks = [
    { player_id: 'a', is_keeper: true, draft_slot: 1, pick_no: 1 },
    { player_id: 'b', is_keeper: true, draft_slot: 2, pick_no: 2 },
    { player_id: 'c', is_keeper: true, draft_slot: 3, pick_no: 3 },
    { player_id: 'z', is_keeper: false, draft_slot: 7, pick_no: 4 },   // ordinary pick
  ];
  const r = R.reconcile(picks, assumed, opts);
  check('an ordinary pick of an unknown player is not a keeper discrepancy',
    r.ok === true, JSON.stringify(r));
}

console.log(`\n${pass}/${pass + fail} reconciliation checks passed`);
process.exit(fail ? 1 : 0);
