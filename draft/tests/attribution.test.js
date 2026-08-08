/* Every ordering of "I marked it" vs "Sleeper said it". Sleeper must win, and
 * the final roster must match Sleeper exactly in all of them.
 */
const A = require('../../public/js/draft/attribution.js');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d ? '  -> ' + d : '')); } };

const P = id => ({ player_id: id, name: 'P' + id, position: 'RB' });
const LOVELAND = P('12517'), OTHER = P('999');
const MY = 4;
const ids = list => list.map(p => String(p.player_id)).sort().join(',');

// 1. Local mark first, then the real pick — the Loveland sequence.
{
  const s = A.emptyState();
  A.markLocal(s, LOVELAND, MY, MY);
  A.applyRemote(s, LOVELAND, MY, MY);
  check('local mark then real pick: on my roster exactly once',
    ids(s.myRoster) === '12517' && s.myRoster.length === 1, ids(s.myRoster));
}
// 2. Real pick first, then a late local mark of the same player.
{
  const s = A.emptyState();
  A.applyRemote(s, LOVELAND, MY, MY);
  A.markLocal(s, LOVELAND, MY, MY);
  check('real pick then late local mark: still exactly once, no duplicate',
    s.myRoster.length === 1 && s.rosters[MY].length === 1);
}
// 3. THE WRONG GUESS. I marked him to seat 7; Sleeper says he is mine.
{
  const s = A.emptyState();
  A.markLocal(s, LOVELAND, 7, MY);
  check('the wrong guess lands on seat 7 first', ids(s.rosters[7]) === '12517');
  A.applyRemote(s, LOVELAND, MY, MY);
  check('Sleeper overrides a wrong local guess — he moves to my roster',
    ids(s.myRoster) === '12517', ids(s.myRoster));
  check('...and is removed from the seat I wrongly gave him',
    ids(s.rosters[7]) === '', ids(s.rosters[7]));
}
// 4. The mirror: I claimed someone else's pick as mine.
{
  const s = A.emptyState();
  A.markLocal(s, OTHER, MY, MY);
  A.applyRemote(s, OTHER, 7, MY);
  check('a pick I wrongly claimed leaves my roster when Sleeper reassigns it',
    s.myRoster.length === 0 && ids(s.rosters[7]) === '999');
}
// 5. Idempotence — this runs every four seconds forever.
{
  const s = A.emptyState();
  for (let i = 0; i < 25; i++) A.applyRemote(s, LOVELAND, MY, MY);
  check('25 polls of the same pick produce one roster entry',
    s.myRoster.length === 1 && s.rosters[MY].length === 1, String(s.myRoster.length));
}
// 6. A manual mark during a sync gap, reconciled when the gap closes.
{
  const s = A.emptyState();
  A.markLocal(s, LOVELAND, MY, MY);
  A.markLocal(s, OTHER, 7, MY);
  A.applyRemote(s, LOVELAND, MY, MY);
  A.applyRemote(s, OTHER, 7, MY);
  check('marks made during a sync gap survive reconciliation unchanged',
    ids(s.myRoster) === '12517' && ids(s.rosters[7]) === '999');
}
// 7. A seatless pick (mock draft with no roster_id AND no draft_slot) is
//    recorded as gone but placed nowhere — never silently assigned to me.
{
  const s = A.emptyState();
  A.applyRemote(s, LOVELAND, null, MY);
  check('a seatless pick is marked drafted but not given to anybody',
    s.drafted.has('12517') && s.myRoster.length === 0);
}
// 8. The whole-draft invariant: no player on two rosters, ever.
{
  const s = A.emptyState();
  A.markLocal(s, LOVELAND, 2, MY);
  A.applyRemote(s, LOVELAND, 9, MY);
  A.applyRemote(s, LOVELAND, MY, MY);
  const seats = Object.keys(s.rosters).filter(k => ids(s.rosters[k]).includes('12517'));
  check('after three conflicting claims he sits on exactly one seat',
    seats.length === 1 && Number(seats[0]) === MY, JSON.stringify(seats));
}
// 9. A-2 undo: unmarkLocal is the EXACT inverse of markLocal — mark a guess,
//    take it back, and the state is indistinguishable from never marking.
{
  const s = A.emptyState();
  A.markLocal(s, LOVELAND, MY, MY);
  check('setup: the guess landed on my roster',
    s.drafted.has('12517') && ids(s.myRoster).includes('12517'));
  A.unmarkLocal(s, LOVELAND);
  check('undo removes him from the drafted set', !s.drafted.has('12517'));
  check('undo removes him from every seat and my roster',
    s.myRoster.length === 0
    && Object.values(s.rosters).every(r => !ids(r).includes('12517')));
}
// 10. A-2 undo of a wrong-seat guess: mark him to seat 2, undo, no residue.
{
  const s = A.emptyState();
  A.markLocal(s, LOVELAND, 2, MY);
  A.unmarkLocal(s, LOVELAND);
  check('a wrong-seat guess unwinds with no residue anywhere',
    !s.drafted.has('12517') && Object.values(s.rosters).every(r => r.length === 0));
}
// 11. THE SEATLESS MARK — "✕ this man is gone", which says nothing about who
//     took him. The commonest manual action in the war room, and until the
//     mock-#3 rehearsal it was the one case no test here exercised: every
//     assertion above passes a slot. markLocal returned early on the null and
//     DISCARDED the mark, so the player never entered state.drafted.
{
  const s = A.emptyState();
  A.markLocal(s, LOVELAND, null, MY);
  check('a seatless mark still records the player as GONE',
    s.drafted.has('12517'));
  check('...and attributes him to nobody, because nobody was named',
    Object.values(s.rosters).every(r => !ids(r).includes('12517'))
    && !ids(s.myRoster).includes('12517'));

  // THE CONSEQUENCE THAT MADE THIS SEVERITY-1: every board rebuild in app.js
  // derives from the drafted set, so a mark missing from it comes back onto
  // the board as available the next time the board is rebuilt.
  const pool = [LOVELAND, OTHER];
  const rebuilt = pool.filter(p => !s.drafted.has(String(p.player_id)));
  check('a rebuilt board does NOT resurrect a seatlessly-marked player',
    !ids(rebuilt).includes('12517'), JSON.stringify(ids(rebuilt)));
}

// 12. THE TWO PATHS MUST AGREE. applyRemote always handled the unknown seat
//     correctly (record, leave unplaced); markLocal did not. One canonical
//     fact, one derivation — the shared-state audit's whole premise.
{
  const local = A.emptyState(), remote = A.emptyState();
  A.markLocal(local, LOVELAND, null, MY);
  A.applyRemote(remote, LOVELAND, null, MY);
  check('a seatless LOCAL mark and a seatless REMOTE pick agree on the fact',
    local.drafted.has('12517') === remote.drafted.has('12517'));
  check('...and both leave him unattributed rather than guessing a seat',
    Object.values(local.rosters).every(r => r.length === 0)
    && Object.values(remote.rosters).every(r => r.length === 0));
}

// 13. Undo still inverts it exactly, with no seat to unwind.
{
  const s = A.emptyState();
  A.markLocal(s, LOVELAND, null, MY);
  A.unmarkLocal(s, LOVELAND);
  check('undoing a seatless mark puts him back (drafted set is clean)',
    !s.drafted.has('12517'));
}

console.log('\n' + pass + '/' + (pass + fail) + ' attribution checks passed');
process.exit(fail ? 1 : 0);
