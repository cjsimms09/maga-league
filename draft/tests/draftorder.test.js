'use strict';
// DRAFT-SELECTION ORDER — engine unit tests + VERIFICATION AGAINST HISTORY.
// Cory: "verify it against history; if it does not reproduce the actual selection
// order, the rule is wrong somewhere and I would rather find that now."
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { computeSelectionOrder, regSeasonOrder } = require(path.join(ROOT, 'src', 'routes', 'draftorder'));
const seed = require(path.join(ROOT, 'src', 'seed-data'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(function () {
  // ── engine unit tests ────────────────────────────────────────────────────────
  const reg = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]; // owner ids, best→worst reg season
  const stage1 = computeSelectionOrder(reg, null, 4);
  ck('stage 1: first 6 picks lock (non-playoff, worst first)',
    eq(stage1.picks.map(p => p.owner_id), [1, 2, 3, 4, 5, 6]), stage1.picks.map(p => p.owner_id).join());
  ck('stage 1: playoff four pending', eq(stage1.pending, [10, 9, 8, 7]) && !stage1.complete);
  ck('stage 1: last place buys dinner', stage1.dinner === 1);

  // bracket decided: champ=10, ru=9, 3rd=8, 4th=7 → they select 7..10, champ last
  const done = computeSelectionOrder(reg, [10, 9, 8, 7], 4);
  ck('stage 2: complete, champion selects last',
    eq(done.picks.map(p => p.owner_id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) && done.complete,
    done.picks.map(p => p.owner_id).join());
  ck('regSeasonOrder tiebreaks on PF', eq(
    regSeasonOrder([{ owner_id: 'a', wins: 8, pf: 900 }, { owner_id: 'b', wins: 8, pf: 950 }, { owner_id: 'c', wins: 6, pf: 999 }]),
    ['b', 'a', 'c']));

  // ── VERIFICATION AGAINST HISTORY ──────────────────────────────────────────────
  // Map names→ids in seed order (Cory=1 … Justin=10).
  const id = {}; seed.OWNERS.forEach((o, i) => { id[o.name] = i + 1; });
  const names = ids => ids.map(x => Object.keys(id).find(k => id[k] === x));

  // The STATED rule = reverse of final standings (5–10 reg-season, 1–4 bracket).
  // Compare that to the ACTUAL selection order the league used the next year.
  //   DRAFTS[2025] followed 2024's results; DRAFTS[2026] followed 2025's.
  function check(resultYear, draftYear) {
    const finalStd = seed.STANDINGS[resultYear].map(nm => id[nm]);      // best→worst
    const predicted = [...finalStd].reverse();                          // stated rule
    const actual = seed.DRAFTS[draftYear].order.map(([nm]) => id[nm]);  // real selection order
    const six = eq(predicted.slice(0, 6), actual.slice(0, 6));
    const four = eq(predicted.slice(6), actual.slice(6));
    console.log(`  ${draftYear} draft (from ${resultYear}): non-playoff six ${six ? 'REPRODUCES' : 'MISMATCH'}, playoff four ${four ? 'REPRODUCES' : 'MISMATCH'}`);
    if (!four) {
      console.log(`     predicted 7-10: ${names(predicted.slice(6)).join(', ')}`);
      console.log(`     ACTUAL    7-10: ${names(actual.slice(6)).join(', ')}`);
    }
    return { six, four };
  }
  const y26 = check(2025, 2026);
  const y25 = check(2024, 2025);

  // The solid part reproduces for both years — this is verified, bake it in:
  ck('history: non-playoff six reproduces (2026 draft)', y26.six);
  ck('history: non-playoff six reproduces (2025 draft)', y25.six);
  ck('history: 2026 draft fully reproduces the stated rule', y26.six && y26.four);

  // THE FINDING (Cory asked to be told): the 2025 draft's playoff-four order does
  // NOT match "reverse bracket". This assertion DOCUMENTS the discrepancy so it
  // can't be silently "fixed" by a future change without a human re-deciding the
  // rule. If someone makes 2025 reproduce, this flips and forces a re-read.
  ck('history: 2025 draft playoff-four does NOT match reverse-bracket (FLAGGED for Cory)', !y25.four,
    'if this now reproduces, the rule question below is resolved — update the report');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
