// TERRITORY: relay (built 2026-09-06 on Cory's "fix this for all tools")
/* ONE WEEKLY PRICE PER PLAYER, FOR EVERY TOOL, INCLUDING ROSTERED PLAYERS.
 *
 * Cory, 2026-09-06: "We need to fix this for all tools. Also lineup optimizer
 * isn't giving any recommendation for this week. Should it default to fantasy
 * pros and sleeper projection mean until our model is better?"
 *
 * ⚠️ FIRST, A CORRECTION I OWE THIS FILE. Its first version said the board is
 * "the AVAILABLE pool, drafted and kept players removed from it", on the
 * evidence that 23 of the 90 week-1 starters were missing and they were the
 * league's best players. THAT DIAGNOSIS WAS WRONG. `public/draft_data.json`
 * splits into two disjoint lists (register 80): `players` (738) and
 * `kept_players` (23). Together they cover 90/90. I read only the first, and
 * the 23 "missing stars" were exactly the 23 keepers. Register 476 already
 * recorded ten consumers bitten by that split; this was the eleventh, and it
 * was found by reading register 476 rather than by any check of mine.
 *
 * WHAT SURVIVES THE CORRECTION, because it is a different claim: the board
 * carries SEASON totals, which proj_feed divides by 17 to get a week. That is a
 * flat season rate — the same number in week 1 and week 12, blind to opponent,
 * injury and role. A weekly archive is a genuinely better instrument for a
 * weekly decision, which is what these tools make. So the archive is preferred
 * on its merits, not because the board "cannot" price a roster.
 *
 * THE WEEK-1 SYMPTOM HAD ITS OWN CAUSE, unrelated to either: the lineup
 * optimizer never read the board at all. It priced from Sleeper's roster view —
 * season-average-to-date, else last week — and in week 1 both are empty, so
 * every player came back 0 and there was nothing to rank.
 *
 * ⚠️ AND THE OBVIOUS FIX HAS A 17x TRAP IN IT.
 * `weekly_projection_archive_<season>_w<week>.json` carries the whole league
 * (sleeper_weekly covers 90/90 starters), so it looks like the answer. But
 * SLEEPER'S "WEEKLY" ROWS ARE SEASON TOTALS: Jahmyr Gibbs comes back with
 * rush_yd 1406 and scored 299.9, while FantasyPros — genuinely weekly — has him
 * at rush_yd 83.18 and scored 17.51 (our own model: 20.08). Wiring the archive
 * naively prices every Sleeper-covered player ~17x high, and a lineup optimizer
 * fed that would bench every player FantasyPros covers in favour of anyone it
 * does not. Register 480 already recorded this exact shape for CBS.
 *
 * So no source is trusted by name. Every source passes a SCALE GUARD that reads
 * the distribution it actually returned (Rule 3i) and converts or refuses.
 *
 * SOURCE ORDER, and why: FantasyPros and Sleeper are averaged where both price
 * a player, which is Cory's own instruction ("default to fantasy pros and
 * sleeper projection mean until our model is better") and matches the standing
 * rule that our model ships only behind a graded prior — its first grade is
 * 09-15. Sleeper alone covers what FantasyPros does not (K and DEF), so the
 * blend reaches every starter instead of refusing 21 of them.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PROJ_GAMES = 17;             // the divisor proj_feed uses; kept identical on purpose
/* A single fantasy player's WEEKLY score. Nobody scores 40+ a week routinely, and
 * a season total is ~17x a weekly one, so these two bands cannot overlap by
 * accident: a median above SEASON_LIKE is a season column wearing a weekly name. */
const WEEKLY_MAX_MEDIAN = 40;
const SEASON_LIKE_MEDIAN = 80;

function findFile(rel) {
  let d = __dirname;
  for (let i = 0; i < 6; i++) {
    const p = path.join(d, rel);
    if (fs.existsSync(p)) return p;
    d = path.dirname(d);
  }
  return null;
}
function readJson(rel) {
  const p = findFile(rel);
  if (!p) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

/* THE STATISTIC IS THE MEDIAN OF THE TOP 64, NOT THE MEDIAN OF EVERYONE, AND
 * THAT DISTINCTION IS THE WHOLE GUARD. Measured 2026-09-06: the plain median
 * over sleeper_weekly's 9,414 rows is 0 — the league is mostly players nobody
 * rosters — so a season-scale column sailed through a median<=40 test and
 * priced Gibbs at 158.7. Caught only by running it against real data and
 * reading a number that could not be a week (Rule 3i: look at the distribution
 * before trusting a statistic drawn from it). The top 64 is roughly the
 * startable population in a 10-team league, where weekly and season scales are
 * cleanly separated. */
function topMedian(xs, n) {
  const a = xs.filter(v => Number.isFinite(v) && v > 0).slice().sort((x, y) => y - x);
  if (!a.length) return null;
  const top = a.slice(0, Math.min(n || 64, a.length));
  const m = top.length >> 1;
  return top.length % 2 ? top[m] : (top[m - 1] + top[m]) / 2;
}

/* THE SCALE GUARD. Returns {byId, scale, median, refused}. A source whose median
 * says "season" is divided by 17 and re-checked; one that still does not look
 * weekly is REFUSED rather than shipped, because a wrong scale is not a worse
 * projection, it is a different quantity, and on screen it is indistinguishable
 * from a real one. */
function scaleGuard(rawById, label) {
  const ids = Object.keys(rawById || {});
  const vals = ids.map(id => Number(rawById[id])).filter(Number.isFinite);
  const med = topMedian(vals);
  if (med == null) return { byId: {}, scale: 1, median: null, refused: 'no finite values' };
  if (med <= WEEKLY_MAX_MEDIAN) return { byId: rawById, scale: 1, median: med, refused: null };
  if (med >= SEASON_LIKE_MEDIAN) {
    const out = {};
    for (const id of ids) {
      const v = Number(rawById[id]);
      if (Number.isFinite(v)) out[id] = v / PROJ_GAMES;
    }
    const med2 = topMedian(Object.values(out));
    if (med2 != null && med2 <= WEEKLY_MAX_MEDIAN) {
      return { byId: out, scale: 1 / PROJ_GAMES, median: med2, refused: null };
    }
    return { byId: {}, scale: null, median: med,
      refused: `${label}: median ${med.toFixed(1)} is not weekly and /${PROJ_GAMES} gives ${med2 == null ? 'nothing' : med2.toFixed(1)}` };
  }
  // Between the bands: neither clearly weekly nor clearly a season total. Refuse
  // rather than guess — this is the case where a silent wrong answer is likeliest.
  return { byId: {}, scale: null, median: med,
    refused: `${label}: median ${med.toFixed(1)} sits between weekly and season scale; refusing to guess` };
}

function sourceFromArchive(archive, key, label) {
  const m = (archive || {})[key];
  if (!m) return { byId: {}, refused: `${label}: absent from the archive` };
  const raw = {};
  for (const [id, row] of Object.entries(m)) {
    const v = row && row.scored;
    if (Number.isFinite(Number(v))) raw[String(id)] = Number(v);
  }
  return scaleGuard(raw, label);
}

/* Our own weekly model, when its snapshot exists. Kept SEPARATE and not blended
 * in by default: it is a challenger until the 09-15 grade, and nothing ships to
 * a surface ahead of a graded prior. Callers opt in with opts.includeOwn. */
function ownWeekly(season, week) {
  const d = readJson(path.join('draft', 'data', 'weekly_own',
    `own_weekly_${season}_w${week}.json`));
  if (!d || !d.projections) return { byId: {}, refused: 'own_weekly snapshot not committed for this week' };
  const raw = {};
  for (const [id, r] of Object.entries(d.projections)) {
    if (Number.isFinite(Number(r && r.mean))) raw[String(id)] = Number(r.mean);
  }
  return scaleGuard(raw, 'own_weekly');
}

/* weeklyPrices(season, week, opts) -> { byId, provenance }
 *
 * byId maps sleeper player_id -> projected points for THIS week, on this
 * league's scoring. provenance says how many players each source priced, what
 * each source's median looked like, whether it was rescaled, and what was
 * refused — so a reader can always tell which source a number came from.
 */
function weeklyPrices(season, week, opts) {
  const o = opts || {};
  const archive = readJson(path.join('draft', 'data', 'weekly_projection_archive',
    `weekly_projection_archive_${season}_w${week}.json`));
  const fp = sourceFromArchive(archive, 'fantasypros_weekly', 'fantasypros_weekly');
  const sl = sourceFromArchive(archive, 'sleeper_weekly', 'sleeper_weekly');
  const own = o.includeOwn ? ownWeekly(season, week) : { byId: {}, refused: 'not requested' };

  const byId = {}, from = {};
  const ids = new Set([...Object.keys(fp.byId), ...Object.keys(sl.byId), ...Object.keys(own.byId)]);
  for (const id of ids) {
    const parts = [];
    if (Number.isFinite(fp.byId[id])) parts.push(['fantasypros', fp.byId[id]]);
    if (Number.isFinite(sl.byId[id])) parts.push(['sleeper', sl.byId[id]]);
    if (o.includeOwn && Number.isFinite(own.byId[id])) parts.push(['own_weekly', own.byId[id]]);
    if (!parts.length) continue;
    byId[id] = parts.reduce((s, p) => s + p[1], 0) / parts.length;
    from[id] = parts.map(p => p[0]).join('+');
  }
  return {
    byId,
    from,
    provenance: {
      _what: 'weekly points per sleeper player_id, blended across the sources that passed the scale guard',
      season, week,
      archive_present: !!archive,
      sources: {
        fantasypros_weekly: { priced: Object.keys(fp.byId).length, median: fp.median, scale: fp.scale, refused: fp.refused || null },
        sleeper_weekly: { priced: Object.keys(sl.byId).length, median: sl.median, scale: sl.scale, refused: sl.refused || null },
        own_weekly: { priced: Object.keys(own.byId).length, median: own.median, scale: own.scale, refused: own.refused || null },
      },
      blended: Object.keys(byId).length,
      rule: 'mean of the sources that priced a player; a source whose distribution is not weekly is rescaled by /17 or refused, never trusted by name',
    },
  };
}

/* WHICH NUMBER PRICES A ROSTER ROW, and how good it is.
 *
 * Lives here rather than inline in the lineup route so it can be tested at all.
 * The week-1 case is the whole point: a roster row before any game has been
 * played carries no `proj` (sleeper.rosterView never sets one — the field is
 * read in the route and assigned nowhere in src/sleeper.js), no seasonPts and
 * no wkPts, so every source below the blend returns 0 and the optimizer has
 * nothing to rank. That is exactly what Cory saw.
 *
 * Ranked best-first. `rank` lets a caller report the BEST source in play rather
 * than the last one it happened to use — a lineup mixing a real projection with
 * a season average should describe itself as the projection.
 */
const SOURCE_RANK = { 'fp+sleeper': 4, sleeper: 3, 'season-avg': 2, 'last-week': 1, none: 0 };

function chooseProjection(row, blended) {
  const r = row || {};
  if (Number.isFinite(Number(blended))) return { proj: Number(blended), src: 'fp+sleeper' };
  if (r.proj != null) return { proj: Number(r.proj), src: 'sleeper' };
  if (r.seasonPts != null && r.gp) return { proj: Number(r.seasonPts) / Number(r.gp), src: 'season-avg' };
  if (r.wkPts != null) return { proj: Number(r.wkPts), src: 'last-week' };
  return { proj: 0, src: 'none' };
}

function betterSource(a, b) {
  return (SOURCE_RANK[b] || 0) > (SOURCE_RANK[a] || 0) ? b : a;
}

module.exports = { weeklyPrices, scaleGuard, ownWeekly, PROJ_GAMES,
  WEEKLY_MAX_MEDIAN, SEASON_LIKE_MEDIAN, chooseProjection, betterSource, SOURCE_RANK };
