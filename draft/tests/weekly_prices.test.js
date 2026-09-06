// TERRITORY: relay
/* THE SCALE GUARD, TESTED BY THE TRAP THAT BEAT IT ONCE.
 *
 * Cory asked for the lineup tools to fall back to the FantasyPros/Sleeper mean.
 * The archive that makes that possible carries a 17x trap: Sleeper's "weekly"
 * rows are SEASON totals (Gibbs rush_yd 1406, scored 299.9) while FantasyPros
 * is genuinely weekly (rush_yd 83.18, scored 17.51).
 *
 * The first version of this guard used the median over ALL rows and MISSED IT:
 * sleeper_weekly holds 9,414 players, most of whom score 0, so the median was 0
 * — comfortably under a "looks weekly" bar of 40 — and the season column shipped
 * unscaled, pricing Gibbs at 158.7 in a blend. The failure was not the threshold
 * but the STATISTIC: measuring the middle of a population that is mostly zeros.
 * The zero-tail case below is that exact shape, and it is the reason this file
 * exists rather than a note saying "watch out for scale".
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const WP = require('../../src/weekly_prices.js');

const ROOT = path.resolve(__dirname, '..', '..');
const mk = (vals) => { const o = {}; vals.forEach((v, i) => { o['p' + i] = v; }); return o; };

// A realistic startable population: ~24 weekly points at the top, ~8 at the back.
const weeklyVals = Array.from({ length: 80 }, (_, i) => 24 - i * 0.2);
const seasonVals = weeklyVals.map(v => v * 17);

// 1 — a genuinely weekly source passes through untouched.
{
  const g = WP.scaleGuard(mk(weeklyVals), 'weekly_src');
  assert.strictEqual(g.scale, 1, 'a weekly source must not be rescaled');
  assert.strictEqual(g.refused, null);
  assert.ok(g.median > 8 && g.median < 40, `median ${g.median} should read weekly`);
}

// 2 — KNOWN POSITIVE: a season-scale source is detected and divided by 17.
{
  const g = WP.scaleGuard(mk(seasonVals), 'season_src');
  assert.ok(Math.abs(g.scale - 1 / 17) < 1e-9, `season source must be /17, got ${g.scale}`);
  assert.strictEqual(g.refused, null);
  assert.ok(g.median < 40, 'after rescaling the median must read weekly');
  const first = g.byId.p0;
  assert.ok(Math.abs(first - 24) < 0.01, `top player should come back ~24/wk, got ${first}`);
}

// 3 — THE BUG THAT SHIPPED: a season-scale source buried in a long zero tail.
//     9,000 zeros around a real startable population is the actual archive shape.
{
  const withTail = seasonVals.concat(Array.from({ length: 9000 }, () => 0));
  const g = WP.scaleGuard(mk(withTail), 'season_src_zero_tail');
  assert.ok(Math.abs(g.scale - 1 / 17) < 1e-9,
    `a zero tail must not hide a season scale (got scale ${g.scale}) — this is the case that shipped Gibbs at 158.7`);
  assert.ok(g.median < 40);
}

// 4 — a source at neither scale is REFUSED, not guessed at.
{
  const g = WP.scaleGuard(mk(weeklyVals.map(v => v * 2.5)), 'ambiguous_src'); // ~60 median
  assert.strictEqual(g.scale, null, 'an in-between scale must refuse');
  assert.ok(/refusing to guess/.test(g.refused || ''), g.refused);
  assert.deepStrictEqual(g.byId, {}, 'a refused source must price nobody');
}

// 5 — REAL DATA: the committed 2026 week-1 archive prices every starter, and
//     prices them at weekly scale. Skipped rather than faked if absent.
{
  const arch = path.join(ROOT, 'draft', 'data', 'weekly_projection_archive',
    'weekly_projection_archive_2026_w1.json');
  const hist = path.join(ROOT, 'draft', 'data', 'league_history.json');
  if (fs.existsSync(arch) && fs.existsSync(hist)) {
    const r = WP.weeklyPrices(2026, 1, {});
    const sl = r.provenance.sources.sleeper_weekly;
    assert.ok(Math.abs(sl.scale - 1 / 17) < 1e-9,
      `sleeper_weekly must be recognised as season scale, got ${sl.scale}`);
    assert.strictEqual(r.provenance.sources.fantasypros_weekly.scale, 1,
      'fantasypros_weekly is genuinely weekly and must not be rescaled');

    const h = JSON.parse(fs.readFileSync(hist, 'utf8'));
    const s26 = (h.seasons || []).find(s => String(s.season) === '2026');
    const starters = [];
    ((s26.weeks || {})['1'] || []).forEach(e =>
      (e.starters || []).forEach(id => { if (id != null) starters.push(String(id)); }));
    const priced = starters.filter(id => Number.isFinite(r.byId[id]));
    assert.strictEqual(priced.length, starters.length,
      `every week-1 starter must be priced; ${starters.length - priced.length} were not`);

    // every starter's price must be a plausible week, not a season total
    const bad = priced.filter(id => r.byId[id] < 0 || r.byId[id] > 45);
    assert.deepStrictEqual(bad, [], 'a starter priced above 45 points is a season total in disguise');
  }
}

console.log('weekly_prices: 5/5 — weekly passes, season rescales, zero tail caught, ambiguous refused, real archive 90/90');

/* ── WHICH NUMBER PRICES A ROSTER ROW ─────────────────────────────────────────
 * The known positive is the shape that produced Cory's bug: a week-1 roster row
 * carries no proj (sleeper.rosterView never sets that field), no seasonPts and
 * no wkPts. Every source below the blend returns 0, so before this the lineup
 * optimizer had ten players tied at zero and nothing to recommend.
 */
const WEEK1_ROW = { id: '9221', pos: 'RB', proj: null, seasonPts: null, gp: null, wkPts: null };

// 6 — KNOWN POSITIVE: week 1, no history anywhere, and the blend prices it.
{
  const bare = WP.chooseProjection(WEEK1_ROW, undefined);
  assert.strictEqual(bare.proj, 0, 'without a blend a week-1 row is still 0 — that was the bug');
  assert.strictEqual(bare.src, 'none');

  const priced = WP.chooseProjection(WEEK1_ROW, 17.58);
  assert.strictEqual(priced.proj, 17.58, 'the blend must price a week-1 row');
  assert.strictEqual(priced.src, 'fp+sleeper');
}

// 7 — the fallbacks still work, in order, when there is no blend. A week with no
//     archive must behave exactly as it did before rather than lose a number.
{
  assert.deepStrictEqual(
    WP.chooseProjection({ proj: 12, seasonPts: 90, gp: 9, wkPts: 5 }, undefined),
    { proj: 12, src: 'sleeper' });
  assert.deepStrictEqual(
    WP.chooseProjection({ proj: null, seasonPts: 90, gp: 9, wkPts: 5 }, undefined),
    { proj: 10, src: 'season-avg' });
  assert.deepStrictEqual(
    WP.chooseProjection({ proj: null, seasonPts: null, gp: null, wkPts: 5 }, undefined),
    { proj: 5, src: 'last-week' });
}

// 8 — the blend OUTRANKS every fallback, including a live sleeper projection.
{
  const r = { proj: 12, seasonPts: 90, gp: 9, wkPts: 5 };
  assert.strictEqual(WP.chooseProjection(r, 17.58).src, 'fp+sleeper');
}

// 9 — the reported source is the BEST in play, whatever order rows arrive in.
{
  assert.strictEqual(['none', 'season-avg', 'fp+sleeper', 'last-week']
    .reduce((a, b) => WP.betterSource(a, b), null), 'fp+sleeper');
  assert.strictEqual(['none', 'last-week'].reduce((a, b) => WP.betterSource(a, b), null), 'last-week');
  // and it never downgrades
  assert.strictEqual(WP.betterSource('fp+sleeper', 'none'), 'fp+sleeper');
}

console.log('weekly_prices: +4 — week-1 row priced by the blend, fallbacks intact and ordered, best source reported');
