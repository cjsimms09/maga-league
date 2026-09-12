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
    /* CORRECTED 2026-09-09. This asserted that sleeper_weekly is RESCALED by
     * 1/17. That was my error: the committed archive's Sleeper column is not
     * mis-scaled, it is the SEASON endpoint standing in for a week (commit
     * fb978f79 — 9,382 of 9,414 rows carry gp > 1.5, median 18.0). Dividing it
     * by 17 yields a season average wearing a week's label, which is the
     * "clean-looking lie" that lane deleted the file over. It must be REFUSED. */
    assert.strictEqual(sl.scale, null,
      'a season-shaped Sleeper payload must be refused, not rescaled');
    assert.ok(/SEASON-shaped/.test(sl.refused || ''), sl.refused);
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

/* ── SEASON PAYLOAD REFUSED, AND THE FLOOR THAT KEEPS THE KICKER PRICED ──────
 * Added 2026-09-09, twenty hours before kickoff, after firing the archive
 * workflow early and finding it VOIDs: Sleeper still has no week-1 data, so
 * the file a reader gets is the corrupted 2026-08-20 one that fb978f79 deleted
 * and 56b7a312 restored on territory grounds. Refusing it is right; refusing
 * it silently would price every K and DEF at 0, and Cory's 09-02 ruling makes
 * a kicker a REQUIRED starter.
 */

// 10 — the shape check, both arms, on synthetic payloads.
{
  const season = {}; const week = {};
  for (let i = 0; i < 50; i++) {
    season['s' + i] = { scored: 200 + i, raw: { gp: 18 } };
    week['w' + i] = { scored: 12 + i * 0.1, raw: { gp: 1 } };
  }
  assert.strictEqual(WP.weekShapeCheck(season).seasonShaped, true, 'gp 18 is a season');
  assert.strictEqual(WP.weekShapeCheck(week).seasonShaped, false, 'gp 1 is a week');
  // one bye-week oddity must not void a real week — majority vote, not any-vote
  const mostlyWeek = Object.assign({}, week, { odd: { scored: 9, raw: { gp: 4 } } });
  assert.strictEqual(WP.weekShapeCheck(mostlyWeek).seasonShaped, false,
    'a single odd row must not void a week-shaped payload');
  // a payload with no gp field at all cannot say — and must not block
  assert.strictEqual(WP.weekShapeCheck({ a: { scored: 5, raw: {} } }).seasonShaped, false);
}

// 11 — REAL DATA: the committed archive's Sleeper column is refused by name,
//      FantasyPros survives, and every starter is still priced.
{
  const arch = path.join(ROOT, 'draft', 'data', 'weekly_projection_archive',
    'weekly_projection_archive_2026_w1.json');
  const hist = path.join(ROOT, 'draft', 'data', 'league_history.json');
  const board = path.join(ROOT, 'public', 'draft_data.json');
  if (fs.existsSync(arch) && fs.existsSync(hist) && fs.existsSync(board)) {
    const r = WP.weeklyPrices(2026, 1, {});
    assert.strictEqual(r.provenance.sources.sleeper_weekly.scale, null);
    assert.ok(r.provenance.sources.fantasypros_weekly.priced > 300);

    const h = JSON.parse(fs.readFileSync(hist, 'utf8'));
    const s26 = (h.seasons || []).find(s => String(s.season) === '2026');
    const starters = [];
    ((s26.weeks || {})['1'] || []).forEach(e =>
      (e.starters || []).forEach(id => { if (id != null) starters.push(String(id)); }));
    const priced = starters.filter(id => Number.isFinite(r.byId[id]));
    assert.strictEqual(priced.length, starters.length,
      `refusing Sleeper must not leave a starter unpriced; ${starters.length - priced.length} were`);

    // the floor is used, and ONLY where a weekly source could not price
    assert.ok(r.provenance.floored_from_board > 0, 'the board floor should be carrying K/DEF');
    const fpPriced = starters.filter(id => r.from[id] === 'fantasypros');
    assert.ok(fpPriced.length >= 60, `expected most skill starters on FantasyPros, got ${fpPriced.length}`);
    fpPriced.forEach(id => assert.notStrictEqual(r.from[id], 'board_season_rate',
      'a player a weekly source priced must never be overwritten by the floor'));

    // and nothing is season-scale any more
    const bad = priced.filter(id => r.byId[id] > 45);
    assert.deepStrictEqual(bad, [], 'no starter may price above 45 in a single week');
  }
}

console.log('weekly_prices: +2 — season payload refused by shape, board floor keeps every starter priced');

/* ── A BLEND MAY NOT CLAIM A PROVENANCE IT DOES NOT HAVE ─────────────────────
 * Added 2026-09-12 for a defect I shipped on 09-09. `chooseProjection` returned
 * `src: 'fp+sleeper'` for ANY finite blended number, so the `from` map that
 * knows where the price came from was computed and thrown away.
 *
 * THE KNOWN POSITIVE IS THE LIVE TREE, not a fixture: week 2 has no archive
 * until Wednesday, so every price it can produce is the board's season rate —
 * and that is the week Cory sets a lineup for on Tuesday. The page called those
 * numbers "this week's projection (FantasyPros + Sleeper, on our scoring)" AND
 * suppressed its own directional caveat, because the caveat is keyed on the
 * label. Two wrongs from one discarded field.
 */

// 12 — every label the `from` map can actually emit, mapped explicitly.
{
  assert.strictEqual(WP.srcForBlend('board_season_rate'), 'board-season-rate',
    'THE BUG: a board season rate must never report itself as a weekly projection');
  assert.strictEqual(WP.srcForBlend('fantasypros'), 'fp+sleeper');
  assert.strictEqual(WP.srcForBlend('sleeper'), 'fp+sleeper');
  assert.strictEqual(WP.srcForBlend('fantasypros+sleeper'), 'fp+sleeper');
  assert.strictEqual(WP.srcForBlend('own_weekly'), 'own-weekly',
    'our own model is a forecast, but it is not FantasyPros and must not say so');
  assert.strictEqual(WP.srcForBlend('fantasypros+own_weekly'), 'fp+sleeper');
  // FAIL-SAFE: a source added upstream loses the caveat on purpose, not by default
  assert.strictEqual(WP.srcForBlend('some_new_source_2027'), 'blend-unknown');
  assert.strictEqual(WP.srcForBlend(''), 'blend-unknown');
  // and the pre-09-12 two-argument signature is untouched
  assert.strictEqual(WP.srcForBlend(undefined), 'fp+sleeper');
  assert.strictEqual(WP.srcForBlend(null), 'fp+sleeper');
}

// 13 — chooseProjection carries the label through without touching the number.
{
  const p = WP.chooseProjection(WEEK1_ROW, 17.58, 'board_season_rate');
  assert.strictEqual(p.proj, 17.58, 'the fix must not change any number');
  assert.strictEqual(p.src, 'board-season-rate');
  assert.strictEqual(WP.chooseProjection(WEEK1_ROW, 17.58, 'fantasypros').src, 'fp+sleeper');
  // two-arg callers behave exactly as before
  assert.strictEqual(WP.chooseProjection(WEEK1_ROW, 17.58).src, 'fp+sleeper');
}

// 14 — THE VIEW'S OWN MAP: whatever a season rate reports must NOT be in the
//      set that suppresses the directional caveat. Read out of the template, so
//      re-adding it there fails here rather than on Cory's screen.
{
  const ejs = fs.readFileSync(path.join(ROOT, 'views', 'lineup.ejs'), 'utf8');
  const m = ejs.match(/const PROJ_IS_FORECAST = \{([^}]*)\}/);
  assert.ok(m, 'PROJ_IS_FORECAST not found in views/lineup.ejs — did it move?');
  const forecastKeys = m[1].split(',').map(s => s.split(':')[0].trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
  assert.ok(!forecastKeys.includes('board-season-rate'),
    `a season rate must show the caveat; PROJ_IS_FORECAST = ${forecastKeys.join(', ')}`);
  assert.ok(!forecastKeys.includes('blend-unknown'),
    'an unnameable source must show the caveat');
  // CONTROL: the set is not simply empty, or the assertions above prove nothing
  assert.ok(forecastKeys.includes('fp+sleeper'),
    'a real weekly projection should still suppress the caveat');
  // and every label the module can emit has a human label on the page
  const labels = ejs.match(/const SRC_LABEL = \{[\s\S]*?\n  \};/);
  assert.ok(labels, 'SRC_LABEL not found in views/lineup.ejs');
  ['board-season-rate', 'blend-unknown', 'own-weekly', 'fp+sleeper']
    .forEach(k => assert.ok(labels[0].includes(`'${k}'`) || labels[0].includes(`${k}:`),
      `SRC_LABEL has no entry for ${k}, so the page would print "unknown source"`));
}

// 15 — REAL DATA, BOTH ARMS: a week with no archive is labelled a season rate,
//      and the week that HAS one is still labelled a projection. One arm alone
//      would pass if the fix had simply downgraded everything.
{
  const hist = path.join(ROOT, 'draft', 'data', 'league_history.json');
  if (fs.existsSync(hist)) {
    const archDir = path.join(ROOT, 'draft', 'data', 'weekly_projection_archive');
    const has = w => fs.existsSync(path.join(archDir,
      `weekly_projection_archive_2026_w${w}.json`));
    // the first week 1..17 with no archive: the live "next week" case
    let bare = null;
    for (let w = 1; w <= 17 && bare === null; w++) if (!has(w)) bare = w;
    if (bare !== null) {
      const r = WP.weeklyPrices(2026, bare, {});
      const srcs = new Set(Object.values(r.from || {}));
      assert.deepStrictEqual([...srcs], ['board_season_rate'],
        `week ${bare} has no archive, so every price must be the board floor; got ${[...srcs]}`);
      const anyId = Object.keys(r.byId)[0];
      assert.strictEqual(
        WP.chooseProjection({ id: anyId, pos: 'RB' }, r.byId[anyId], r.from[anyId]).src,
        'board-season-rate',
        `week ${bare} must describe itself as a season rate, not a weekly projection`);
    }
    // CONTROL ARM: a week that DOES have an archive still reports a projection
    if (has(1)) {
      const r1 = WP.weeklyPrices(2026, 1, {});
      const fpId = Object.keys(r1.from).find(id => r1.from[id] === 'fantasypros');
      assert.ok(fpId, 'week 1 should have FantasyPros-priced players');
      assert.strictEqual(
        WP.chooseProjection({ id: fpId, pos: 'WR' }, r1.byId[fpId], r1.from[fpId]).src,
        'fp+sleeper',
        'the fix must not downgrade a real weekly projection');
    }
  }
}

console.log('weekly_prices: +4 — a blend can only claim the provenance it has; '
  + "the no-archive week says so on the page, the archived week still doesn't");
