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

console.log(`\n${pass}/${pass + fail} accounting checks passed`);
process.exit(fail ? 1 : 0);
