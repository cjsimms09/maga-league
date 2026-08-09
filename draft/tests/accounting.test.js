/* THE ACCOUNTING RECONCILER — itemize by source + assert the coordinate systems agree.
 * Run: node draft/tests/accounting.test.js
 */
'use strict';
const A = require('../../public/js/draft/accounting.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const keeper = id => ({ player_id: id, name: 'K' + id, is_keeper: true });
const pick = id => ({ player_id: id, name: 'P' + id });

// --- itemization: which entries are keepers vs marked vs phantom ------------
{
  const it = A.itemizeRoster([keeper('a'), keeper('b'), pick('c'), { name: 'ghost' }]);
  check('itemize splits keepers / marked / other', it.keepers.length === 2
    && it.marked.length === 1 && it.other.length === 1 && it.total === 4,
    JSON.stringify(it));
}

// --- the reported "5/9 with 3 keepers + 2 picks" is RECONCILED, not wrong ----
{
  // 3 keepers + 2 marked picks; I've made 2 picks; drafted = 2 picks + 3 keepers.
  const r = A.reconcile({
    roster: [keeper('k1'), keeper('k2'), keeper('k3'), pick('p1'), pick('p2')],
    drafted: new Set(['p1', 'p2', 'k1', 'k2', 'k3']),
    recentPicks: [pick('p1'), pick('p2')],
    syncPickNumber: null,
    myPicks: [6, 13, 24, 31, 40, 49, 58, 67, 76, 85, 94, 103, 112, 121, 130],
    currentPick: 24,   // made picks 6 and 13
    rehearsalRemovals: 0,
  });
  check('a keeper+pick roster reconciles (no false alarm)', r.agree, JSON.stringify(r.problems));
  check('itemization names 3 keepers + 2 marked picks',
    r.itemization.keepers === 3 && r.itemization.marked === 2);
  check('picks made == marked picks == 2', r.picksMade === 2);
  check('the human line itemizes the blend', /3 keepers \+ 2 picks = 5 on roster/.test(r.line), r.line);
}

// --- THE DILUTION BUG: keepers counted as picks -> loud, named --------------
{
  // Marked picks (4) exceed picks actually made (2): the need model is over-reading.
  const r = A.reconcile({
    roster: [pick('p1'), pick('p2'), pick('p3'), pick('p4')],
    drafted: new Set(['p1', 'p2', 'p3', 'p4']),
    recentPicks: [pick('p1'), pick('p2')],
    myPicks: [1, 12, 23, 34],
    currentPick: 23,   // made 1 and 12 -> 2 picks
  });
  check('over-counted roster fails the marked==made invariant', !r.agree);
  check('...and names it as the dilution/need-bias', r.problems.some(p => /need model is reading MORE/.test(p)),
    JSON.stringify(r.problems));
}

// --- board/slate disagreement (the invariant-2 alarm) -----------------------
{
  const r = A.reconcile({
    roster: [keeper('k1'), pick('p1')],
    drafted: new Set(['p1', 'k1', 'ghost']),   // 3 off board, but only 1 pick + 1 keeper
    recentPicks: [pick('p1')],
    myPicks: [1, 12],
    currentPick: 12,
  });
  check('board removals != picks+keepers is named', r.problems.some(p => /off the board/.test(p)),
    JSON.stringify(r.problems));
}

// --- picks made + left must equal my total slots ----------------------------
{
  const r = A.reconcile({
    roster: [pick('p1')], drafted: new Set(['p1']), recentPicks: [pick('p1')],
    myPicks: [5, 16, 27], currentPick: 16,   // made 1 (pick 5), left 2 (16,27) -> 3 total, ok
  });
  check('made+left == total when consistent', r.agree && r.picksMade === 1 && r.picksLeft === 2,
    JSON.stringify(r));
}

// --- sync mode: pick events come from the room clock ------------------------
{
  const r = A.reconcile({
    roster: [pick('p1')], drafted: new Set(['p1']),
    syncPickNumber: 2,        // room on pick 2 -> 1 event observed
    myPicks: [1, 11], currentPick: 2,
  });
  check('sync pick number drives pickEvents (n-1)', r.pickEvents === 1, String(r.pickEvents));
}

// --- a phantom roster entry is caught -----------------------------------------
{
  const r = A.reconcile({ roster: [{ name: 'nowhere' }], drafted: new Set(), myPicks: [] });
  check('a roster entry with no keeper flag and no id is flagged phantom',
    r.problems.some(p => /came from nowhere/.test(p)), JSON.stringify(r.problems));
}

// --- MUTATION CHECK: prove the assertion can actually FAIL --------------------
// We have shipped tests this month that passed while proving nothing. This starts
// from a GREEN snapshot, breaks exactly one field, and confirms it goes RED with
// the right named problem — so the reconciler is demonstrably falsifiable.
{
  const good = () => ({
    roster: [keeper('k1'), keeper('k2'), keeper('k3'), pick('p1'), pick('p2')],
    drafted: new Set(['k1', 'k2', 'k3', 'p1', 'p2']),
    recentPicks: [pick('p1'), pick('p2')],
    myPicks: [10, 20, 30, 40, 50], currentPick: 30,   // made 2 (10,20) == marked 2
  });
  check('MUTATION baseline is GREEN', A.reconcile(good()).agree, JSON.stringify(A.reconcile(good()).problems));

  // Break 1: a ghost off the board -> board/slate must go red, naming drafted-set.
  const m1 = good(); m1.drafted = new Set(['k1', 'k2', 'k3', 'p1', 'p2', 'ghost']);
  const r1 = A.reconcile(m1);
  check('MUTATION drafted+1 -> RED and names [drafted-set]',
    !r1.agree && r1.problems.some(p => /\[drafted-set\]/.test(p)), JSON.stringify(r1.problems));

  // Break 2: a marked pick with no advance of the clock -> dilution must go red.
  const m2 = good(); m2.roster = m2.roster.concat([pick('p3')]); m2.drafted.add('p3');
  const r2 = A.reconcile(m2);
  check('MUTATION marked+1 without clock advance -> RED and names [roster marked]',
    !r2.agree && r2.problems.some(p => /\[roster marked\]/.test(p)), JSON.stringify(r2.problems));

  // Break 3: a phantom roster entry -> phantom must go red.
  const m3 = good(); m3.roster = m3.roster.concat([{ name: 'nowhere' }]);
  const r3 = A.reconcile(m3);
  check('MUTATION phantom entry -> RED', !r3.agree && r3.problems.some(p => /came from nowhere/.test(p)),
    JSON.stringify(r3.problems));
}

// --- REHEARSAL KEEPER HANDLING (Cory's #3) -----------------------------------
// In a rehearsal my keepers are rostered; MARKING picks must never mutate the
// keeper bucket, and a later pick must land normally. Henry + Walker are Cory's
// actual RB keepers, so this is the real case.
{
  const keepers = [keeper('henry'), keeper('walker')];
  const afterThree = keepers.concat([pick('r1'), pick('r2'), pick('r3')]);
  const it3 = A.itemizeRoster(afterThree);
  check('rehearsal: 3 marked picks leave the keeper roster unchanged (2 keepers)',
    it3.keepers.length === 2, JSON.stringify(it3));
  check('rehearsal: the 3 marked picks land in the marked bucket', it3.marked.length === 3);

  const afterFour = afterThree.concat([pick('r4')]);
  const it4 = A.itemizeRoster(afterFour);
  check('rehearsal: a 4th pick lands normally; keepers still 2', it4.keepers.length === 2 && it4.marked.length === 4);

  // Through the full reconciler in a mock context: keepers seeded + drafted, picks
  // marked, and it all reconciles (keepers counted as placements, not as picks).
  const r = A.reconcile({
    roster: afterFour,
    drafted: new Set(['henry', 'walker', 'r1', 'r2', 'r3', 'r4']),
    recentPicks: [pick('r1'), pick('r2'), pick('r3'), pick('r4')],
    myPicks: [4, 17, 24, 37, 44, 57], currentPick: 44,   // made 4 == marked 4
    keeperPlacements: 2, isMock: true,
  });
  check('rehearsal: keepers-as-placements + 4 marked picks fully reconciles',
    r.agree && r.itemization.keepers === 2 && r.picksMade === 4, JSON.stringify(r.problems));
}

console.log(`\n${pass}/${pass + fail} accounting checks passed`);
process.exit(fail ? 1 : 0);
