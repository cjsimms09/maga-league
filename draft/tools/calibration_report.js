#!/usr/bin/env node
// TERRITORY: A
/* THE PER-SURFACE CALIBRATION SCORECARD — "when the tool says 70%, how often
 * does it happen?", answered separately for every surface that makes claims.
 *
 * Cory's ruling (2026-08-16, "Do 6"). src/forecast_grade.js already computes
 * Brier + one reliability table over EVERYTHING it grades; a single pooled
 * curve lets a sharp surface hide a broken one (the matchup model could be
 * calibrated while champodds runs 20 points hot, and the pooled table would
 * read "fine"). This module buckets the GRADED output of the prediction
 * ledger by SURFACE and scores each on its own: calibration curve, Brier,
 * sample size, over/under-confidence verdict.
 *
 * ── INPUT: the graded snapshot, never the raw ledger ────────────────────────
 *
 * grade-cron's runGrade() writes calibration:<season>:<ISO> snapshots whose
 * `forecasts.graded` rows carry {key, ftype, value, outcome, brier, method}
 * and whose `decisions.inseason.rows` carry the in-season decision grades.
 * This module reads THAT — one grader, one derivation; a second grader here
 * is how the scorecard and the accuracy page come to disagree. The curve
 * arithmetic itself is imported from forecast_grade (reliabilityTable), not
 * re-implemented.
 *
 * ── SURFACES: a REGISTRY, not a discovery ───────────────────────────────────
 *
 * Surfaces are DECLARED with their key shapes below, exactly the discipline
 * accuracy.js's PENDING_KINDS establishes: a surface that emits nothing yet
 * (side-bet advisor) still appears, labelled with WHY it is empty, so the
 * report cannot quietly look like it covers surfaces it does not — and a
 * graded row matching no declared surface lands in `unregistered`, counted,
 * never dropped.
 *
 * Verdict rule, stated so a reader can recompute it: gap = mean predicted
 * probability − observed frequency. n < 10 → no verdict (a coin read as a
 * verdict); |gap| ≤ 5pp → calibrated; gap > +5pp → over-confident (claims run
 * hot); gap < −5pp → under-confident. Directional, deliberately simple, and
 * the full curve is right next to it for anyone who wants the bin-level view.
 *
 * PRE-SEASON: every surface reports an honest empty state — "no resolved
 * forecasts yet; first real rows ~Sep 15" (week 1 scores go final Sep 14-15,
 * claims-cron resolves them the following Sunday, grade-cron grades Tuesday).
 *
 * Pure module + CLI. Artifact: draft/data/calibration_report.json
 * (_territory first). The weekly grade path regenerates it — wiring point
 * noted on ROUTES TO:A, not wired here (grade-cron is A's).
 *
 * Run:  node draft/tools/calibration_report.js
 *         [--in draft/data/calibration_latest.json] [--out draft/data/calibration_report.json]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const FG = require(path.join(ROOT, 'src', 'forecast_grade.js'));

const MIN_N_FOR_VERDICT = 10;
const GAP_TOLERANCE = 0.05;
const EMPTY_NOTE = 'no resolved forecasts yet; first real rows ~Sep 15 '
  + '(week-1 scores final, resolved by claims-cron that Sunday, graded by '
  + 'grade-cron the Tuesday after)';

/* ── the surface registry ─────────────────────────────────────────────────── */

const SURFACES = [
  { id: 'matchup_winprob', label: 'Weekly matchup win probabilities',
    ftype: 'probability',
    emitter: 'claims-cron (weekly-claims-v1), Sundays',
    match: k => k.startsWith('wk|') && k.split('|')[3] === 'matchup' },
  { id: 'weekly_high', label: 'Weekly-high pick',
    ftype: 'categorical',
    emitter: 'claims-cron (weekly-claims-v1), Sundays',
    match: k => k.startsWith('wk|') && k.split('|')[3] === 'weekly_high' },
  { id: 'champodds', label: 'Playoff/championship odds checkpoints',
    ftype: 'probability',
    emitter: 'analyzer-cron (analyzer-checkpoint-v1), weekly from week 2',
    match: k => k.startsWith('an|') && k.split('|')[3] === 'playoff' },
  { id: 'exp_wins', label: 'Expected-wins checkpoints (point)',
    ftype: 'point',
    emitter: 'analyzer-cron (analyzer-checkpoint-v1), weekly from week 2',
    match: k => k.startsWith('an|') && k.split('|')[3] === 'exp_wins' },
  { id: 'survival', label: 'Draft-board survival calls',
    ftype: 'probability',
    emitter: 'war room forecast.js (draft night)',
    match: k => k.startsWith('survival:') },
  { id: 'room_seat', label: 'Round-1 room-seat forecasts',
    ftype: 'categorical',
    emitter: 'war room forecast.js (draft night)',
    match: k => k.startsWith('room_seat:') },
  { id: 'player_projection', label: 'Player-week point projections',
    ftype: 'point',
    emitter: 'player-projection-cron (player-week-projection-v1)',
    match: k => k.split('|')[3] === 'player' },
  // The in-season DECISION kinds — captured by member routes, resolved by
  // claims-cron, graded by forecast_grade.gradeDecisions as realized EDGE
  // (chosen minus counterfactual), not probability. They are surfaces of the
  // scorecard with their own sample sizes; a calibration CURVE applies only
  // if they ever emit probability claims, and the verdict says so.
  { id: 'lineup_call', label: 'Start/sit calls', decision: true,
    emitter: 'member /lineup/log; resolved weekly by claims-cron' },
  { id: 'waiver_claim', label: 'Waiver calls', decision: true,
    emitter: 'member /waivers/log; resolved weekly by claims-cron' },
  { id: 'stream_call', label: 'Streaming calls', decision: true,
    emitter: 'member /stream/log; resolved weekly by claims-cron' },
  // Declared with NO emitter, the PENDING_KINDS discipline: nothing writes a
  // side-bet forecast into the ledger today, and the report must say that
  // rather than show a row that looks merely unlucky to be empty.
  { id: 'sidebet_advisor', label: 'Side-bet advisor',
    ftype: 'probability',
    emitter: null,
    pending: 'no capture emits side-bet forecasts into the ledger yet '
      + '(pooladvisor/betedge render odds but never append a forecast kind); '
      + 'until one does, this surface CANNOT have rows — declared so its '
      + 'emptiness reads as "not wired", never "0-for-0 and fine"',
    match: k => k.startsWith('sidebet') },
];

/** Which declared surface a graded forecast row belongs to (null = none). */
function surfaceOf(row) {
  const k = String((row && row.key) || '');
  for (const s of SURFACES) {
    if (s.match && s.match(k)) return s.id;
  }
  return null;
}

/* ── the per-surface arithmetic ───────────────────────────────────────────── */

const r4 = v => Math.round(v * 1e4) / 1e4;
const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function verdictFor(n, gap) {
  if (n === 0) return EMPTY_NOTE;
  if (n < MIN_N_FOR_VERDICT) {
    return `insufficient sample (n=${n}) — no verdict before n=${MIN_N_FOR_VERDICT}; `
      + 'a winner over a handful of rows is a coin read as a verdict';
  }
  const pp = Math.round(gap * 1000) / 10;   // signed percentage points
  if (Math.abs(gap) <= GAP_TOLERANCE) {
    return `well-calibrated within ±${GAP_TOLERANCE * 100}pp (gap ${pp}pp over n=${n})`;
  }
  if (gap > 0) {
    return `over-confident: claims run ${pp}pp HOT — predicted probabilities `
      + `average higher than the observed frequency (n=${n})`;
  }
  return `under-confident: claims run ${Math.abs(pp)}pp COLD — outcomes happen `
    + `more often than predicted (n=${n})`;
}

/** Probability rows -> {n, brier, curve, mean_predicted, observed_rate, gap, verdict}. */
function probabilityStats(rows) {
  const pts = [];
  for (const g of rows) {
    const p = Number(g.value), o = Number(g.outcome);
    if (!Number.isFinite(p) || !Number.isFinite(o)) continue;
    pts.push([p, o >= 0.5 ? 1 : 0]);
  }
  const n = pts.length;
  const brier = n ? r4(mean(pts.map(([p, o]) => (p - o) ** 2))) : null;
  const mp = n ? r4(mean(pts.map(([p]) => p))) : null;
  const or_ = n ? r4(mean(pts.map(([, o]) => o))) : null;
  const gap = n ? r4(mp - or_) : null;
  return {
    ftype: 'probability', n, brier,
    mean_predicted: mp, observed_rate: or_, confidence_gap: gap,
    // ONE derivation of the curve — forecast_grade's, imported.
    curve: n ? FG.reliabilityTable(pts) : [],
    verdict: verdictFor(n, gap || 0),
  };
}

function pointStats(rows) {
  const errs = [];
  for (const g of rows) {
    const e = Number(g.error);
    if (Number.isFinite(e)) errs.push(e);
    else {
      const p = Number(g.value), o = Number(g.outcome);
      if (Number.isFinite(p) && Number.isFinite(o)) errs.push(p - o);
    }
  }
  const n = errs.length;
  return {
    ftype: 'point', n,
    bias: n ? r4(mean(errs)) : null,
    mae: n ? r4(mean(errs.map(Math.abs))) : null,
    verdict: n === 0 ? EMPTY_NOTE
      : 'point surface — graded by signed error (bias) and |error| (mae); '
        + 'probability calibration does not apply',
  };
}

function categoricalStats(rows) {
  let n = 0, hits = 0;
  for (const g of rows) {
    n += 1;
    if (g.hit === true || (g.hit == null && String(g.value) === String(g.outcome))) hits += 1;
  }
  return {
    ftype: 'categorical', n,
    accuracy: n ? r4(hits / n) : null,
    verdict: n === 0 ? EMPTY_NOTE
      : `categorical surface — hit rate ${r4(hits / n)} over n=${n}; `
        + 'probability calibration does not apply',
  };
}

function decisionStats(inseasonRows, kind) {
  const rows = (inseasonRows || []).filter(r => r.kind === kind);
  const scored = rows.filter(r => r.edge != null);
  const wins = scored.filter(r => r.edge > 0).length;
  const losses = scored.filter(r => r.edge < 0).length;
  return {
    ftype: 'decision_edge',
    n: rows.length, scored: scored.length,
    tool_won: wins, counterfactual_won: losses,
    mean_edge: scored.length ? r4(mean(scored.map(r => r.edge))) : null,
    verdict: rows.length === 0 ? EMPTY_NOTE
      : 'decision surface — graded as realized edge (chosen minus '
        + 'counterfactual, forecast_grade.gradeDecisions), not probability; a '
        + 'calibration curve applies only if this surface ever emits '
        + 'probability claims',
  };
}

/* ── the report ───────────────────────────────────────────────────────────── */

/**
 * Build the per-surface scorecard. PURE.
 * @param snapshot  a grade-cron calibration snapshot ({forecasts:{graded},
 *                  decisions:{inseason:{rows}}, player_weeks, graded_at,
 *                  rules_era}), or null pre-season.
 */
function buildReport(snapshot, opts) {
  const o = opts || {};
  const graded = ((snapshot || {}).forecasts || {}).graded || [];
  const inseason = ((((snapshot || {}).decisions) || {}).inseason || {}).rows || [];

  // Route every graded forecast row to its declared surface — or count it.
  const bySurface = {};
  const unregistered = [];
  for (const g of graded) {
    const sid = surfaceOf(g);
    if (sid == null) { unregistered.push(g.key || null); continue; }
    (bySurface[sid] || (bySurface[sid] = [])).push(g);
  }

  const surfaces = {};
  for (const s of SURFACES) {
    let stats;
    if (s.decision) {
      stats = decisionStats(inseason, s.id);
    } else {
      const rows = bySurface[s.id] || [];
      // A surface is scored on its DECLARED ftype (the registry states what
      // it emits); rows of any OTHER ftype are counted next to the score, a
      // visible anomaly rather than a silent drop or a silent blend.
      const own = rows.filter(g => g.ftype === s.ftype);
      if (s.ftype === 'probability') stats = probabilityStats(own);
      else if (s.ftype === 'point') stats = pointStats(own);
      else stats = categoricalStats(own);
      const extras = {};
      for (const g of rows) {
        if (g.ftype !== s.ftype) extras[g.ftype] = (extras[g.ftype] || 0) + 1;
      }
      if (Object.keys(extras).length) {
        stats.other_ftypes_received = Object.entries(extras)
          .map(([t, c]) => `${c} ${t}`).join(', ');
      }
    }
    surfaces[s.id] = Object.assign({ label: s.label, emitter: s.emitter }, stats);
    if (s.pending) surfaces[s.id].pending = s.pending;
  }

  const gradedTotal = graded.length + inseason.filter(r => r.edge != null).length;
  return {
    season: (snapshot && snapshot.rules_era && snapshot.rules_era.season)
      || (snapshot && snapshot.season) || null,
    source_graded_at: (snapshot && snapshot.graded_at) || null,
    generated_at: o.now || null,
    verdict_rule: `gap = mean predicted probability - observed frequency; `
      + `no verdict under n=${MIN_N_FOR_VERDICT}; |gap| <= ${GAP_TOLERANCE * 100}pp `
      + 'calibrated; above = over-confident (hot); below = under-confident (cold)',
    empty_state: gradedTotal === 0,
    empty_note: gradedTotal === 0 ? EMPTY_NOTE : null,
    totals: {
      forecast_rows_graded: graded.length,
      decision_rows_scored: inseason.filter(r => r.edge != null).length,
      unregistered_rows: unregistered.length,
    },
    surfaces,
    // Rows no declared surface claimed — COUNTED with their keys, the
    // accuracy-page discipline: an unroutable row must be visible, because a
    // new emitter minting a new key shape would otherwise vanish from the
    // scorecard precisely when it starts mattering.
    unregistered_keys: unregistered.slice(0, 25),
  };
}

/* ── CLI ──────────────────────────────────────────────────────────────────── */

function main(argv) {
  const argOf = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  const defaultIn = path.join(ROOT, 'draft', 'data', 'calibration_latest.json');
  const inP = argOf('--in') || (fs.existsSync(defaultIn) ? defaultIn : null);
  const outP = argOf('--out')
    || path.join(ROOT, 'draft', 'data', 'calibration_report.json');

  let snapshot = null, source = 'none (pre-season: no graded snapshot exists yet)';
  if (inP) {
    snapshot = JSON.parse(fs.readFileSync(inP, 'utf8'));
    // Accept either one snapshot or an append-only ledger array (latest wins —
    // the same "most recent snapshot" read the accuracy page performs).
    if (Array.isArray(snapshot)) snapshot = snapshot[snapshot.length - 1] || null;
    source = path.relative(ROOT, inP);
  }

  const report = buildReport(snapshot, { now: new Date().toISOString() });
  // _territory FIRST — the artifact convention (conditional_value_2026.json).
  const artifact = Object.assign({
    _territory: 'TERRITORY: A — produced by draft/tools/calibration_report.js '
      + 'from the graded calibration snapshot; per-surface scorecard, read-only '
      + 'over the ledger (contamination rule: never writes back)',
    rebuild: 'node draft/tools/calibration_report.js',
    source,
  }, report);
  fs.writeFileSync(outP, JSON.stringify(artifact, null, 1) + '\n');
  console.log(JSON.stringify({
    ok: true, out: path.relative(ROOT, outP), source,
    empty_state: report.empty_state,
    surfaces: Object.keys(report.surfaces).length,
    graded: report.totals,
  }));
  return 0;
}

module.exports = { buildReport, surfaceOf, probabilityStats, pointStats,
  categoricalStats, decisionStats, verdictFor, SURFACES,
  MIN_N_FOR_VERDICT, GAP_TOLERANCE, EMPTY_NOTE };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
