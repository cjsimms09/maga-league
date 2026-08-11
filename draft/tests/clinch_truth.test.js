'use strict';
// "CLINCHED" IS THE ONE WORD ON THE SITE THAT CLAIMS CERTAINTY.
//
// The playoff badges (🔒 IN / ❌ OUT on the standings and the scoreboard) come
// from clinchElim, which works in bounds rather than probabilities precisely so
// it can say "can't possibly". It counted only teams whose best case was
// STRICTLY GREATER than a team's current wins, so anyone who could merely draw
// LEVEL was ignored — and level is settled on points-for. Two consequences, both
// reachable:
//
//   • a 9–4 team in the final week with the worst points-for in the league, five
//     8–5 teams behind it, was badged CLINCHED on a table where an ordinary set
//     of results leaves it TENTH;
//   • with the season over the bounds still ran, so a team that finished FIFTH
//     on the points tiebreak was badged CLINCHED while the odds column beside
//     it — which does break ties on points — read 0%.
//
// So this does not restate the arithmetic. It SEARCHES for a finish that
// contradicts the badge, using the same schedule-agnostic model the function
// itself claims (each team may win any number of its remaining games), which is
// how the two above were found in the first place.
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const PO = require(path.join(ROOT, 'src', 'routes', 'playoffs'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

// Deterministic PRNG — a counterexample has to be reproducible to be fixable.
let _s = 20260811;
const rnd = () => (_s = (Math.imul(_s, 1664525) + 1013904223) >>> 0) / 4294967296;
const pick = n => Math.floor(rnd() * n);

/** Where each team lands in one reachable finish, ordered as the season is. */
function finishRanks(rows, gamesLeft) {
  const final = rows.map(r => ({ id: r.owner_id, w: r.wins + pick(gamesLeft + 1), pf: r.pf }))
    .sort((a, b) => b.w - a.w || b.pf - a.pf);
  const rank = {};
  final.forEach((r, i) => { rank[r.id] = i + 1; });
  return rank;
}

/**
 * Hunt for a finish that makes a badge false.
 * @returns null, or the counterexample {owner, said, finished, cut}
 */
function hunt(rows, gamesLeft, cut, tries = 4000) {
  const ce = PO.clinchElim(rows, gamesLeft, cut);
  for (let t = 0; t < tries; t++) {
    const rank = finishRanks(rows, gamesLeft);
    for (const r of rows) {
      const said = (ce[r.owner_id] || {}).status;
      if (said === 'clinched' && rank[r.owner_id] > cut) {
        return { owner: r.owner_id, said, finished: rank[r.owner_id], cut, record: r.wins + 'W pf' + r.pf };
      }
      if (said === 'eliminated' && rank[r.owner_id] <= cut) {
        return { owner: r.owner_id, said, finished: rank[r.owner_id], cut, record: r.wins + 'W pf' + r.pf };
      }
    }
  }
  return null;
}

// ── 1) THE TWO TABLES THAT WERE WRONG, by name.
{
  // Final week. p0 is 9–4 with the WORST points-for in the league; five 8–5
  // teams can all draw level with it and all beat it on points.
  const rows = [9, 9, 9, 9, 8, 8, 8, 8, 8, 8]
    .map((w, i) => ({ owner_id: 'p' + i, wins: w, losses: 13 - w, pf: i === 0 ? 700 : 900 - i }));
  const ce = PO.clinchElim(rows, 1, 4);
  ck('a team the tiebreak can drop out of the field is not told it clinched',
    ce.p0.status !== 'clinched', { p0: ce.p0.status, rows: rows.map(r => r.wins + '/' + r.pf) });
  ck('  and the search finds no finish that contradicts any badge on that table',
    hunt(rows, 1, 4) === null, hunt(rows, 1, 4));
}
{
  // Season over. Two teams tie on 5 wins across the cut line.
  const rows = [8, 7, 6, 5, 5, 4, 4, 3, 3, 2]
    .map((w, i) => ({ owner_id: 'o' + i, wins: w, losses: 13 - w, pf: 900 - i * 10 }));
  const ce = PO.clinchElim(rows, 0, 4);
  const odds = PO.simOdds(rows, 0, 4);
  ck('with the season over, the team that finished 5th on points is OUT',
    ce.o4.status === 'eliminated', { o4: ce.o4.status });
  // The badge and the odds are two derivations of one fact and sat side by side
  // on the page saying different things.
  const disagree = rows.filter(r => (ce[r.owner_id].status === 'clinched') !== (odds[r.owner_id] === 1));
  ck('  the badge and the odds column agree on every row',
    disagree.length === 0, disagree.map(r => ({ id: r.owner_id, badge: ce[r.owner_id].status, odds: odds[r.owner_id] })));
}

// ── 2) THE ADVERSARIAL SWEEP. Random tables across the states a season passes
// through, each searched for a finish the badge forbids.
{
  let checked = 0, verdicts = { clinched: 0, eliminated: 0, alive: 0 };
  let counter = null;
  for (let trial = 0; trial < 120 && !counter; trial++) {
    const n = 8 + pick(3);                       // 8–10 teams
    const gamesLeft = pick(6);                   // 0–5 to play
    const played = 13 - gamesLeft;
    const cut = 4 + pick(3);                     // 4–6 spots
    const rows = Array.from({ length: n }, (_, i) => {
      const w = pick(played + 1);
      return { owner_id: 't' + i, wins: w, losses: played - w, pf: 600 + pick(400) };
    });
    const ce = PO.clinchElim(rows, gamesLeft, cut);
    for (const r of rows) verdicts[(ce[r.owner_id] || {}).status] = (verdicts[(ce[r.owner_id] || {}).status] || 0) + 1;
    checked++;
    counter = hunt(rows, gamesLeft, cut, 600);
    if (counter) counter.table = { n, gamesLeft, cut, rows: rows.map(r => r.wins + '/' + r.pf) };
  }
  ck('the sweep ran', checked > 0, checked);
  // A guard that only ever sees 'alive' proves nothing — the interesting
  // verdicts have to actually occur, or this passes by never being tested.
  ck('  fixture check: the sweep produced real verdicts, not just "alive"',
    verdicts.clinched > 0 && verdicts.eliminated > 0, verdicts);
  ck('  no random table admits a finish that contradicts its badges', counter === null, counter);
}

// ── 3) IT MUST STILL BE ABLE TO SAY YES. Conservative is not the same as mute:
// a team that genuinely cannot be caught has to get its badge.
{
  const rows = [{ owner_id: 'runaway', wins: 12, losses: 1, pf: 1200 }]
    .concat([8, 7, 7, 6, 6, 5, 5, 4, 3].map((w, i) => ({ owner_id: 'c' + i, wins: w, losses: 13 - w, pf: 800 - i })));
  const ce = PO.clinchElim(rows, 1, 4);
  ck('a team nobody can reach is still told it clinched', ce.runaway.status === 'clinched', ce.runaway);
  ck('  and the team that cannot reach the field is still told it is out',
    ce.c8.status === 'eliminated', { c8: ce.c8, best: 3 + 1 });
  ck('  the middle of the table stays alive',
    ce.c1.status === 'alive' && ce.c3.status === 'alive', { c1: ce.c1.status, c3: ce.c3.status });
}

// ── 4) NUMBERS NOBODY READS. magic/tragic rode along in picture() and were
// computed by the same tie-blind arithmetic — two more figures that would have
// been false the day something rendered them.
{
  const rows = [6, 5, 5, 4, 4, 3, 3, 2].map((w, i) => ({ owner_id: 'm' + i, wins: w, losses: 9 - w, pf: 800 - i * 9 }));
  const p = PO.picture(rows, 4, 4);
  ck('picture() carries the badge a view actually reads', typeof p.m0.status === 'string', p.m0);
  ck('  and no longer carries figures nothing reads',
    !('magic' in p.m0) && !('tragic' in p.m0), Object.keys(p.m0));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
