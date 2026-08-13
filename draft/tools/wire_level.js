// TERRITORY: A
/* WHAT THE WIRE ACTUALLY PAYS — the empirical SAMPLE, not a summary statistic.
 *
 * The bench equation needs one thing from history: if I do NOT carry this man,
 * what do I get instead? Every bench number in the war room is quoted against
 * that line, so the line had better be measured and had better be honest about
 * how thin it is.
 *
 * ── WHY THIS FILE EXISTS AT ALL ────────────────────────────────────────────
 *
 * `emit_seat_plan.js` shipped `WIRE = {QB: 20.9, RB: 5.3, WR: 13.3, TE: 6.3}`
 * with `WIRE_N = {QB: 5, RB: 46, WR: 39, TE: 6}` and prose telling Cory it came
 * from "764 measured acquisitions". Reproduced on 2026-08-13, every part of
 * that is a different quantity from the one beside it:
 *
 *   THE VALUE is the median of the per-(position, week) CELL MEDIANS, over only
 *              the cells that cleared C's `min_n = 5` reporting floor.
 *   THE n      is the pooled ACQUISITION count of those same cells — the n of a
 *              different estimator. RB's 5.3 is a median of SIX cell medians,
 *              printed as n=46.
 *   THE PROSE  says 764. 764 is the number of acquisitions in the log. 420 of
 *              them score. NINETY-SIX survive the cell filter.
 *
 * And the filter is the part that matters, because it is not a rounding
 * difference. The median per-season (position, week) cell in a ten-team league
 * holds TWO adds:
 *
 *     pos  cells  median cell size   cells n>=5      adds kept by min_n=5
 *     QB    42          2            1 of 42 ( 2%)     5 of  83 ( 6%)
 *     RB    48          2            6 of 48 (12%)    46 of 143 (32%)
 *     TE    43          2            1 of 43 ( 2%)     6 of  82 ( 7%)
 *     WR    43          2            7 of 43 (16%)    39 of 112 (35%)
 *
 * So the shipped quarterback wire is ONE WEEK, and so is the tight end. And the
 * filter selects on the thing being measured: a cell only reaches five adds in a
 * week when the position is churning, and churn weeks are panic weeks. RB reads
 * 5.3 through the filter and 7.8 without it.
 *
 * `min_n = 5` IS CORRECT WHERE IT LIVES. C wrote it so a per-cell REPORT cannot
 * print a median of one — "a median of one reads exactly like a median of forty
 * to anything consuming it", which is right. The defect is entirely on this side
 * of the boundary: A pooled the survivors of a reporting filter and called the
 * result a league-wide level. Nothing in `waiver_replacement.py` changes.
 *
 * ── AND IT IS A SAMPLE, NOT A NUMBER ───────────────────────────────────────
 *
 * The bench simulator DRAWS from this, week by week. A median cannot produce
 * convexity: the whole reason a bench player is worth anything is that some
 * weeks the wire hands you 3 points and some weeks it hands you 24, and the
 * lineup optimizer only calls on your bench in the first kind of week. Reducing
 * the wire to its median deletes exactly the variance the decision turns on —
 * the same mistake as pricing a bench player by a scalar upside metric, one
 * layer down. So this exports `sample[pos]`, sorted, and the summary statistics
 * are FOR READING, not for the model.
 *
 * ── THE WEEK KEY IS COERCED, AND THE REASON IS A MISTAKE I MADE ──────────
 *
 * `waiver_replacement.acquisitions()` dates every row with an INT (its own test
 * asserts that). `nflverse_weekly_points_*.json` stores the week as a NUMBER
 * too. THE TWO ALREADY AGREE and C's library joins them correctly.
 *
 * I REPORTED OTHERWISE FOR AN HOUR. My first probe built the points table as
 * `{str(wk["week"]): ...}`, joined it against int weeks, and got 764
 * acquisitions and ZERO measured cells — and the miss landed in `unscored`,
 * which is a legitimate, expected, non-zero field. It read exactly like a
 * finding about the pipeline. It was a fact about my own probe, which is rule
 * 13g in the one form that is hardest to catch: the instrument was fine, the
 * output was fine, and the READING was wrong because "nothing is there" reads
 * as an absence rather than as an assertion.
 *
 * The `Number()` at the boundary below stays, because a JSON round-trip through
 * any tool that quotes numerics would make it real and the cost is nothing. But
 * it is a GUARD AGAINST A MISTAKE I MADE, not a fix for a defect that shipped,
 * and the difference is written here so nobody later cites a bug that never
 * existed.
 *
 * Run: node draft/tools/wire_level.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const SEASONS = ['2023', '2024', '2025'];
/* The rows that represent a player actually ARRIVING on a roster off the wire.
 * A `failed` claim is somebody who did NOT get the player, and counting one puts
 * players nobody could have into the pool of what was gettable — the exact
 * overstatement the realized line exists to replace. A `trade` was never on the
 * wire at all. Same three exclusions as C's module, by the same reasoning. */
const ACQUIRING = ['waiver', 'free_agent'];

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

/* POSITIONS COME FROM THE BOARD, and a non-numeric add id is a defence.
 * Sleeper keys a defence by TEAM ABBREVIATION (`{"GB": 6}`) where every other
 * add carries a numeric id. Requiring a numeric id silently deletes the busiest
 * waiver position in the league. */
function positionMap() {
  const board = readJson(path.join(ROOT, 'public', 'draft_data.json'));
  const m = {};
  (board.players || []).forEach(p => { m[String(p.player_id)] = p.position; });
  return m;
}

/* Every completed arrival, with the week it arrived. THE WEEK IS THE DICT KEY —
 * a transaction row carries `type/status/roster_ids/adds/drops/waiver_bid/
 * created` and no week of its own, so a row read in isolation cannot be dated.
 * `adds` is a MAP of {player_id: roster_id}, so one transaction can be several
 * acquisitions and taking `Object.keys(adds)[0]` would drop the rest. */
function acquisitions(history, season) {
  const node = (history.seasons || []).find(s => String(s.season) === String(season));
  const tx = (node || {}).transactions || {};
  const out = [];
  Object.keys(tx).forEach(wkKey => {
    const week = Number(wkKey);
    if (!Number.isFinite(week)) return;
    (tx[wkKey] || []).forEach(row => {
      if (row.status !== 'complete') return;
      if (ACQUIRING.indexOf(row.type) < 0) return;
      Object.keys(row.adds || {}).forEach(pid => {
        out.push({ week: week, player_id: String(pid), type: row.type });
      });
    });
  });
  out.sort((a, b) => a.week - b.week || (a.player_id < b.player_id ? -1 : 1));
  return out;
}

/* {week: {player_id: points}} for one season, with EVERY key a number.
 * The store nests a `weeks` LIST of records rather than a week-keyed map, and
 * `season` is a string in it while `week` is a number — so both are coerced
 * here rather than compared as they arrive. */
function weeklyPoints(season) {
  const f = path.join(ROOT, 'draft', 'backtest', 'nflverse_weekly_points_' + season + '.json');
  if (!fs.existsSync(f)) return null;
  const store = readJson(f);
  const out = {};
  (store.weeks || []).forEach(w => {
    if (String(w.season) !== String(season)) return;
    const wk = Number(w.week);
    if (!Number.isFinite(wk)) return;
    const row = out[wk] || (out[wk] = {});
    Object.keys(w.points || {}).forEach(pid => { row[String(pid)] = +w.points[pid]; });
  });
  return out;
}

const q = (sorted, p) => (sorted.length
  ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))]
  : null);
const med = s => (s.length ? (s.length % 2 ? s[(s.length - 1) / 2]
  : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null);

/* THE MEASUREMENT. Returns the sample per position plus a full accounting of
 * every acquisition that did NOT make it in, because a coverage number that
 * hides its exclusions is how the string-key join stayed invisible. */
function measure() {
  const history = readJson(path.join(ROOT, 'draft', 'data', 'league_history.json'));
  const POS = positionMap();
  const sample = {}, byWeek = {}, ledger = {
    acquisitions: 0, scored: 0, unpositioned: 0, def_or_k_unscorable: 0,
    no_row_that_week: 0, seasons: [], missing_store: [],
  };

  SEASONS.forEach(season => {
    const wp = weeklyPoints(season);
    if (!wp) { ledger.missing_store.push(season); return; }
    const acq = acquisitions(history, season);
    let scored = 0;
    acq.forEach(a => {
      ledger.acquisitions++;
      const numeric = /^\d+$/.test(a.player_id);
      const pos = numeric ? POS[a.player_id] : 'DEF';
      const row = wp[a.week] || {};
      /* A PLAYER WITH NO ROW THAT WEEK IS ABSENT, NEVER 0.0. A stashed rookie or
       * an IR add would otherwise drag the shelf to the floor with men nobody
       * started. A player who PLAYED and scored 0.0 is KEPT — that is most of
       * this shelf, and the honest waiver add is very often a dud. */
      if (!Object.prototype.hasOwnProperty.call(row, a.player_id)) {
        if (pos === 'DEF' || pos === 'K') ledger.def_or_k_unscorable++;
        else if (!pos) ledger.unpositioned++;
        else ledger.no_row_that_week++;
        return;
      }
      if (!pos) { ledger.unpositioned++; return; }
      (sample[pos] || (sample[pos] = [])).push(row[a.player_id]);
      ((byWeek[pos] || (byWeek[pos] = {}))[a.week] || (byWeek[pos][a.week] = []))
        .push(row[a.player_id]);
      scored++; ledger.scored++;
    });
    ledger.seasons.push({ season: season, acquisitions: acq.length, scored: scored });
  });

  const summary = {};
  Object.keys(sample).forEach(pos => {
    const s = sample[pos].slice().sort((a, b) => a - b);
    sample[pos] = s;
    const mean = s.reduce((t, v) => t + v, 0) / s.length;
    summary[pos] = {
      n: s.length, median: +med(s).toFixed(2), mean: +mean.toFixed(2),
      sd: +Math.sqrt(s.reduce((t, v) => t + (v - mean) * (v - mean), 0)
        / Math.max(1, s.length - 1)).toFixed(2),
      p25: q(s, 0.25), p75: q(s, 0.75), max: s[s.length - 1],
      weeks_covered: Object.keys(byWeek[pos] || {}).length,
    };
  });
  return { sample: sample, summary: summary, byWeek: byWeek, ledger: ledger };
}

/* ── WHAT IS NOT HERE, NAMED RATHER THAN DEFAULTED ─────────────────────────
 *
 * K AND DEF HAVE NO REALIZED WIRE AND THIS FILE WILL NOT INVENT ONE. Defences
 * are added constantly in this league — 207 of 764 acquisitions are team codes —
 * and nflverse weekly is PLAYER-LEVEL OFFENCE, so it carries no defensive or
 * kicking score to join to. The sample is empty for both and `summary` simply
 * has no key. Anything that needs a K or DEF bench value must say out loud that
 * it is using a different line (preseason best-undrafted, which draft_plan's
 * `WAIVER` computes) rather than reading a zero out of here and pricing a
 * kicker as though the wire paid nothing. A missing position that throws beats
 * a missing position that defaults — that is the whole lesson of `SCHED`. */
const MEASURED_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

function requireSample(pos) {
  const M = module.exports.measured || (module.exports.measured = measure());
  const s = M.sample[pos];
  if (!s || !s.length) {
    throw new Error('wire_level: no realized-wire sample for ' + pos + '. REFUSING to '
      + 'return a default — nflverse weekly is player-level offence and carries no '
      + 'K or DEF scoring, so a number here would be invented. Use draft_plan.WAIVER '
      + '(preseason best-undrafted) and SAY that is what you used.');
  }
  return s;
}

module.exports = { measure, acquisitions, weeklyPoints, requireSample,
  MEASURED_POSITIONS, ACQUIRING, SEASONS };

if (require.main === module) {
  const M = measure();
  console.log('WHAT THE WIRE ACTUALLY PAYS — realized acquisition-week scores, '
    + SEASONS.join('/') + '\n');
  console.log('  pos     n   median    mean      sd     p25     p75     max   weeks');
  MEASURED_POSITIONS.forEach(p => {
    const s = M.summary[p];
    if (!s) { console.log('  ' + p.padEnd(4) + '    — no sample'); return; }
    console.log('  ' + p.padEnd(4) + String(s.n).padStart(5)
      + s.median.toFixed(2).padStart(9) + s.mean.toFixed(2).padStart(8)
      + s.sd.toFixed(2).padStart(8) + s.p25.toFixed(2).padStart(8)
      + s.p75.toFixed(2).padStart(8) + s.max.toFixed(2).padStart(8)
      + String(s.weeks_covered).padStart(8));
  });
  const L = M.ledger;
  console.log('\n  ACCOUNTING — every acquisition, placed:');
  console.log('    ' + L.acquisitions + ' completed adds in the log');
  console.log('    ' + L.scored + ' joined to a score in the week they were added');
  console.log('    ' + L.def_or_k_unscorable + ' K/DEF with no player-level row (nflverse is offence only)');
  console.log('    ' + L.no_row_that_week + ' offensive adds who did not play that week (ABSENT, not 0.0)');
  console.log('    ' + L.unpositioned + ' with no position on the current board');
  console.log('    ' + (L.acquisitions - L.scored - L.def_or_k_unscorable
    - L.no_row_that_week - L.unpositioned) + ' unaccounted (must be 0)');
  console.log('\n  AGAINST THE CONSTANT emit_seat_plan.js SHIPS:');
  const SHIPPED = { QB: 20.9, RB: 5.3, WR: 13.3, TE: 6.3 };
  MEASURED_POSITIONS.forEach(p => {
    const s = M.summary[p];
    if (!s) return;
    console.log('    ' + p.padEnd(4) + ' shipped ' + SHIPPED[p].toFixed(2).padStart(6)
      + '   measured ' + s.median.toFixed(2).padStart(6)
      + '   delta ' + (s.median - SHIPPED[p] >= 0 ? '+' : '')
      + (s.median - SHIPPED[p]).toFixed(2).padStart(6) + ' pts/week');
  });
  console.log('\n  K and DEF: NO SAMPLE. Not zero — unmeasurable from this source.');
}
