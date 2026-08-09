'use strict';
// DRAFT-SELECTION ORDER — engine unit tests + VERIFICATION AGAINST HISTORY.
// Cory: "verify it against history; if it does not reproduce the actual selection
// order, the rule is wrong somewhere and I would rather find that now."
//
// The rule (Cory, confirmed 2026-08-09): non-playoff six by REVERSE regular-season
// finish, then the playoff four by REVERSE BRACKET finish (4th, 3rd, runner-up,
// champion last). We verify against the SELECTION ORDER the league actually used
// (seed.DRAFTS[year].order — "entries listed in pick order"), NOT the resulting
// slots, and we drive the playoff four from the BRACKET (seed.AWARDS playoff_1..4),
// not the regular-season standings — the two differ, and the bracket is what governs.
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { computeSelectionOrder, regSeasonOrder, bracketFinishFromAwards,
        PLAYOFF_RULE_CONFIRMED } = require(path.join(ROOT, 'src', 'routes', 'draftorder'));
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

  // THE DISTINCTION: bracket ≠ standings. If the regular-season order among the
  // four were [10,9,8,7] but the BRACKET finished [7,8,9,10] (the top seed won it
  // all... no — champ=7 means the 4th seed won), the four select by BRACKET.
  const swapped = computeSelectionOrder(reg, [7, 8, 9, 10], 4);
  ck('stage 2: playoff four ordered by BRACKET, not standings',
    eq(swapped.picks.slice(6).map(p => p.owner_id), [10, 9, 8, 7]),
    swapped.picks.slice(6).map(p => p.owner_id).join());

  ck('regSeasonOrder tiebreaks on PF', eq(
    regSeasonOrder([{ owner_id: 'a', wins: 8, pf: 900 }, { owner_id: 'b', wins: 8, pf: 950 }, { owner_id: 'c', wins: 6, pf: 999 }]),
    ['b', 'a', 'c']));

  // ── VERIFICATION AGAINST HISTORY ──────────────────────────────────────────────
  const id = {}; seed.OWNERS.forEach((o, i) => { id[o.name] = i + 1; });
  const names = ids => ids.map(x => Object.keys(id).find(k => id[k] === x));
  const nameToId = nm => id[nm];

  // Predict the selection order the engine produces from a season's results, and
  // compare to the actual order the league used the NEXT year.
  //   DRAFTS[2025] followed 2024's results; DRAFTS[2026] followed 2025's.
  function verify(resultYear, draftYear) {
    const regOrder = seed.STANDINGS[resultYear].map(nm => id[nm]);        // best→worst reg
    const bracket = bracketFinishFromAwards(seed.AWARDS[resultYear], nameToId, 4); // champ→4th
    const predicted = computeSelectionOrder(regOrder, bracket, 4).picks.map(p => p.owner_id);
    const actual = seed.DRAFTS[draftYear].order.map(([nm]) => id[nm]);    // real selection order
    const six = eq(predicted.slice(0, 6), actual.slice(0, 6));
    const four = eq(predicted.slice(6), actual.slice(6));
    const full = eq(predicted, actual);
    console.log(`  ${draftYear} draft (from ${resultYear}): six ${six ? 'REPRODUCES' : 'MISMATCH'}, four ${four ? 'REPRODUCES' : 'MISMATCH'}`);
    if (!full) {
      console.log(`     predicted: ${names(predicted).join(', ')}`);
      console.log(`     ACTUAL   : ${names(actual).join(', ')}`);
    }
    return { six, four, full, predicted, actual };
  }

  const y25 = verify(2024, 2025);
  // 2025 is THE decisive case: 2024's bracket (Jeremy champ, David 4th) differs
  // from its regular-season standings (David 1st, Jeremy 2nd). Reverse-standings
  // would send David — the 1st seed — to pick LAST; reverse-bracket sends him to
  // pick 7th (first among the four). The actual order has him at 7th, so it
  // confirms the rule is reverse-BRACKET and reproduces the whole order exactly.
  ck('history: 2025 draft reproduces the selection order EXACTLY (reverse-bracket)', y25.full,
    y25.full ? '' : `predicted ${names(y25.predicted)} vs actual ${names(y25.actual)}`);
  ck('history: 2025 non-playoff six reproduces', y25.six);
  ck('history: 2025 playoff four reproduces (bracket, not standings)', y25.four);

  // 2026 is NOT yet drafted (seed.DRAFTS[2026].open === true). Its seed order is a
  // PLACEHOLDER built with the OLD naive reverse-standings rule, so under the
  // confirmed reverse-bracket rule it differs at picks 7–8 (Jeremy/David swap,
  // because they swapped between the 2025 standings and the 2025 bracket). The
  // live board must therefore use the ENGINE's order, not that placeholder. We
  // assert the champion still selects last in both — the invariant that always holds.
  const y26 = verify(2025, 2026);
  ck('2026 is still open (live selection, placeholder not authoritative)', seed.DRAFTS[2026].open === true);
  ck('2026: champion selects last in the engine order', y26.predicted[9] === id['Michael'], names([y26.predicted[9]]).join());
  ck('2026: champion selects last in the seed placeholder too', y26.actual[9] === id['Michael']);
  ck('2026: engine and placeholder differ ONLY at picks 7–8 (the standings-vs-bracket swap)',
    eq(y26.predicted.slice(0, 6), y26.actual.slice(0, 6)) && eq(y26.predicted.slice(8), y26.actual.slice(8))
      && !eq(y26.predicted.slice(6, 8), y26.actual.slice(6, 8)));

  // The rule is confirmed — the flag surfaces read to render the four as final.
  ck('PLAYOFF_RULE_CONFIRMED is true', PLAYOFF_RULE_CONFIRMED === true);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
