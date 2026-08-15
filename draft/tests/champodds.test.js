// TERRITORY: A
// CHAMPODDS — the measured championship-probability model gets fail arms.
//
// The claims under test, each stated where it's checked:
//   1. the bracket SHAPE the model assumes (top-4, 1v4/2v3) is what the league
//      actually ran, recomputed from the raw bracket records every run;
//   2. the simulator's probabilities are probabilities (sum/bounds/nesting);
//   3. it is deterministic under a seed;
//   4. it refuses what it cannot price (non-4 cut, preseason live rows);
//   5. the forward test on real seasons clears the uniform baseline by a wide
//      margin — the anti-regression bar for "measured", set at 15% against a
//      measured ~28% so it trips on real damage, not on Monte-Carlo breath.
'use strict';
const assert = require('assert');
const path = require('path');
const CH = require(path.join(__dirname, '..', '..', 'src', 'routes', 'champodds'));
const LO = require(path.join(__dirname, '..', '..', 'src', 'routes', 'lineup'));

let pass = 0;
const ck = (name, fn) => {
  try { fn(); pass++; console.log(`PASS  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
};

const history = LO.harvest();
const years = LO.defaultSeasons(history);

// ── 1. the bracket assumption is pinned to the data ─────────────────────────
ck('every completed season ran a top-4, 1v4/2v3 bracket (the model\'s shape)', () => {
  assert(years.length >= 3, `expected >=3 completed seasons, got ${years.length}`);
  for (const y of years) {
    const season = LO.seasonOf(history, y);
    const pw = Number(season.settings.playoff_week_start);
    // Seeds from regular-season results, the same (wins, pf) order the model uses.
    const fws = LO.fieldWeeklyScores(season), wm = LO.weeklyMatchups(season);
    const rec = {};
    for (const w of Object.keys(fws).map(Number).filter(w => w < pw)) {
      const sc = fws[w], pr = wm[w] || {}, seen = new Set();
      for (const rid of Object.keys(sc)) {
        (rec[rid] ??= { rid: Number(rid), wins: 0, pf: 0 }).pf += sc[rid];
        const opp = pr[rid];
        if (opp == null || seen.has(rid)) continue;
        seen.add(rid); seen.add(String(opp));
        rec[opp] ??= { rid: Number(opp), wins: 0, pf: 0 };
        if (sc[rid] > sc[opp]) rec[rid].wins++; else if (sc[opp] > sc[rid]) rec[opp].wins++;
      }
    }
    const seeds = Object.values(rec).sort((a, b) => b.wins - a.wins || b.pf - a.pf).map(r => r.rid);
    const seedNo = {}; seeds.forEach((rid, i) => { seedNo[rid] = i + 1; });
    const r1 = (season.brackets.winners || []).filter(g => g.r === 1 && g.t1 != null);
    assert.strictEqual(r1.length, 2, `${y}: expected 2 semifinals, got ${r1.length}`);
    const pairs = r1.map(g => [seedNo[g.t1], seedNo[g.t2]].sort((a, b) => a - b).join('v')).sort();
    assert.deepStrictEqual(pairs, ['1v4', '2v3'], `${y}: semis were ${pairs}, model assumes 1v4/2v3`);
    const final = (season.brackets.winners || []).find(g => g.p === 1);
    assert(final && final.w != null, `${y}: no decided final in the bracket`);
  }
});

// ── 2-3. simulator invariants + determinism, on a hand-built field ──────────
const flat = {};
for (let id = 1; id <= 10; id++) flat[id] = { mean: 110, sd: 20 };

ck('probabilities are probabilities: champ sums to 1, playoff to 4, nested', () => {
  const res = CH.simulate({ strengths: flat, baseRec: null, futureWeeks: 14, cut: 4, sims: 4000, seed: 7 });
  const ids = Object.keys(res);
  const sumC = ids.reduce((s, id) => s + res[id].champ_prob, 0);
  const sumP = ids.reduce((s, id) => s + res[id].playoff_prob, 0);
  assert(Math.abs(sumC - 1) < 1e-9, `champ probs sum to ${sumC}`);
  assert(Math.abs(sumP - 4) < 1e-9, `playoff probs sum to ${sumP}`);
  for (const id of ids) {
    const r = res[id];
    assert(r.champ_prob >= 0 && r.champ_prob <= 1, `champ_prob out of range: ${r.champ_prob}`);
    assert(r.champ_prob <= r.playoff_prob + 1e-9,
      `team ${id}: champ ${r.champ_prob} > playoff ${r.playoff_prob} — won a title without making the bracket`);
  }
});

ck('identical strengths → near-uniform title odds (no positional bias in the sim)', () => {
  const res = CH.simulate({ strengths: flat, baseRec: null, futureWeeks: 14, cut: 4, sims: 4000, seed: 7 });
  for (const id of Object.keys(res)) {
    assert(Math.abs(res[id].champ_prob - 0.1) < 0.03,
      `team ${id} at ${res[id].champ_prob} — a flat field should sit near 10%`);
  }
});

ck('deterministic under a seed; a different seed actually moves the draw', () => {
  const a = CH.simulate({ strengths: flat, baseRec: null, futureWeeks: 14, cut: 4, sims: 1000, seed: 42 });
  const b = CH.simulate({ strengths: flat, baseRec: null, futureWeeks: 14, cut: 4, sims: 1000, seed: 42 });
  const c = CH.simulate({ strengths: flat, baseRec: null, futureWeeks: 14, cut: 4, sims: 1000, seed: 43 });
  assert.deepStrictEqual(a, b, 'same seed produced different results');
  assert(Object.keys(a).some(id => a[id].champ_prob !== c[id].champ_prob), 'seed had no effect');
});

ck('a dominant team tops the board but the bracket still taxes it', () => {
  const s = { ...flat, 1: { mean: 135, sd: 20 } };
  const res = CH.simulate({ strengths: s, baseRec: null, futureWeeks: 14, cut: 4, sims: 4000, seed: 11 });
  const top = Object.entries(res).sort((x, y) => y[1].champ_prob - x[1].champ_prob)[0];
  assert.strictEqual(Number(top[0]), 1, `dominant team not on top (got ${top[0]})`);
  assert(res[1].playoff_prob > 0.9, `dominant team's playoff odds only ${res[1].playoff_prob}`);
  // +25 pts/wk is huge, but two single-elimination games are two coin-ish flips:
  // a title is NEVER the near-certainty the seed is. This is the whole reason
  // champ_prob is a different number than playoff_prob.
  assert(res[1].champ_prob < res[1].playoff_prob - 0.1,
    `bracket risk missing: champ ${res[1].champ_prob} vs playoff ${res[1].playoff_prob}`);
});

// ── 4. refusals ─────────────────────────────────────────────────────────────
ck('refuses a non-4 playoff cut instead of silently mispricing it', () => {
  assert.throws(() => CH.simulate({ strengths: flat, baseRec: null, futureWeeks: 14, cut: 6, sims: 10, seed: 1 }),
    /pinned to a 4-team playoff/);
});

ck('champProbLive stays pending (null) before anyone has played a game', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ owner_id: i + 1, wins: 0, losses: 0, pf: 0 }));
  assert.strictEqual(CH.champProbLive(rows, 14), null);
  assert.strictEqual(CH.champProbLive([], 14), null);
});

ck('projectChampionship refuses throughWeek 0 — preseason needs stated means', () => {
  const season = LO.seasonOf(history, years[0]);
  assert.throws(() => CH.projectChampionship(season, { throughWeek: 0 }), /preseasonFromMeans/);
});

// ── 5. live rows: season over → seeding is exact, field outside top-4 at 0 ──
ck('gamesLeft 0: the table is the answer — only the real top 4 hold title odds', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    owner_id: i + 1, wins: 12 - i, losses: 2 + i, pf: 1600 - i * 30,
  }));
  const probs = CH.champProbLive(rows, 0, { sims: 2000, seed: 5 });
  for (let id = 5; id <= 10; id++) {
    assert.strictEqual(probs[id], 0, `team ${id} missed the playoffs but holds ${probs[id]} title odds`);
  }
  const sum = Object.values(probs).reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 1) < 1e-9, `sums to ${sum}`);
  assert(probs[1] >= probs[4], 'the 1 seed should not trail the 4 seed with identical spreads');
});

// ── 6. the forward test clears the uniform baseline, both variants ──────────
// Measured at build time: full model ~28% mean P(actual champion), live-path
// approx ~27%, uniform 10%. The bar is 15% — real damage trips it, MC noise
// and one unlucky season don't.
for (const variant of [
  { name: 'full model', opts: {} },
  { name: 'live-path approx', opts: { constantSd: true, randomSchedule: true } },
]) {
  ck(`forward test 2023-25: mean P(actual champion) > 15% (${variant.name})`, () => {
    let sum = 0, n = 0;
    for (const y of years) {
      const season = LO.seasonOf(history, y);
      const final = (season.brackets.winners || []).find(g => g.p === 1);
      const actual = Number(final.w);
      for (const cw of [7, 14]) {
        const res = CH.projectChampionship(season, { throughWeek: cw, sims: 1500, seed: 999 + cw, ...variant.opts });
        sum += res[actual] ? res[actual].champ_prob : 0; n++;
        // Invariants must hold on real data too, not just the synthetic field.
        const sumC = Object.values(res).reduce((s, r) => s + r.champ_prob, 0);
        assert(Math.abs(sumC - 1) < 1e-9, `${y}@${cw}: champ probs sum to ${sumC}`);
        for (const [id, r] of Object.entries(res)) {
          assert(r.champ_prob <= r.playoff_prob + 1e-9, `${y}@${cw} team ${id}: champ > playoff`);
        }
      }
    }
    const mean = sum / n;
    assert(mean > 0.15, `mean P(actual champion) ${(mean * 100).toFixed(1)}% — under the 15% bar (uniform is 10%)`);
  });
}

// ── 7. preseasonFromMeans: ordering follows the stated means ────────────────
ck('preseasonFromMeans: better stated mean → better title odds, and refuses empty', () => {
  const means = {}; for (let id = 1; id <= 10; id++) means[id] = 100 + id * 3;
  const res = CH.preseasonFromMeans({ means, sims: 3000, seed: 9 });
  assert(res[10].champ_prob > res[1].champ_prob, 'the strongest stated team should out-price the weakest');
  assert(res[10].champ_prob > res[5].champ_prob, 'monotone at the top');
  assert.strictEqual(CH.preseasonFromMeans({ means: {} }), null);
});

console.log(`\n${pass} checks passed${process.exitCode ? ' — WITH FAILURES ABOVE' : ''}`);
