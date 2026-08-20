#!/usr/bin/env node
// TERRITORY: relay — measurement for ROUTES item "A → PM/relay 08-17: the $4
// even-money bands". A owns the constant; this derives, it does not ship.
/**
 * WHAT GAP BETWEEN TWO SAME-POSITION PLAYERS ACTUALLY SEPARATES SEASON OUTCOMES?
 *
 * `DG_NOISE_BAND: 4.0` (engine.js) and `noiseBand: 4.0` (doctrine.js) declare a
 * dollar gap inside which a pick is "even money". Archaeology (20a6c256,
 * 08-14): the 4.0 arrived inside the "v1 CRUDE boom-capacity proxy" block whose
 * own header calls its coefficients "ROUGH placeholders" — **it is a chosen
 * round number, no derivation exists**. A's ask: derive the band from the gap
 * below which season outcomes cannot be separated, on the current board's
 * dollar scale.
 *
 * METHOD, DECLARED BEFORE THE RUN (the bars below were written before any
 * result was seen; a control failure REFUSES the run rather than reporting):
 *
 *  1. For each season 2023-25: preseason projection = `our_pts` from
 *     fp_hist_rows.json (FP stat lines scored under OUR league table);
 *     realized = sum of nflverse_weekly_points weeks 1-17; positions from
 *     player_positions.json; join on sleeper pid.
 *  2. Population: per position, the top-K projected that season —
 *     QB 24 / RB 48 / WR 48 / TE 24 (twice drafted depth, the pool draft
 *     decisions actually choose from). K/DEF excluded: the dollar panel
 *     already refuses cross-position K/DEF gaps (D10a) and their weekly
 *     points live on a different construction.
 *  3. Every same-position pair in that pool, all three seasons pooled:
 *     x = projection gap (pts), y = did the realized order FLIP?
 *  4. The curve: flip rate in projection-gap bins. The band candidates are
 *     read off the curve at declared flip rates — 45%, 47.5%, 49% — with
 *     linear interpolation between bins.
 *  5. Dollar conversion: the war room's band compares E[$] gaps. $ per
 *     projection-point is measured on the CURRENT board as the median
 *     within-position |Δ$|/|Δproj_mean| over adjacent-by-$ pairs (the same
 *     neighborhood the band adjudicates), using the shipped dollar model.
 *
 * CONTROLS (known-positive and known-negative, Rule 3e — both must pass or
 * the output is a bug report, not a finding):
 *   C1 (signal exists): pairs with gap > 80 pts must flip < 35% of the time.
 *   C2 (null anchors): pairs with gap < 5 pts must flip within 45-55%.
 *   C3 (join sanity): >= 60% of each season's pool must join to realized
 *      points; a season below that is dropped LOUDLY, not silently.
 *
 * Run: node draft/tools/even_money_band_derivation.js
 * Output: draft/data/even_money_band_derivation.json + console table.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const POS = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft/data/player_positions.json'), 'utf8'));
const posOf = id => (POS.positions || POS)[String(id)] || null;

const POOL_K = { QB: 24, RB: 48, WR: 48, TE: 24 };
const SEASONS = ['2023', '2024', '2025'];
const FLIP_TARGETS = [0.45, 0.475, 0.49];
const BIN_W = 5; // pts

function realizedFor(season) {
  const f = JSON.parse(fs.readFileSync(path.join(ROOT, `draft/backtest/nflverse_weekly_points_${season}.json`), 'utf8'));
  const tot = {};
  f.weeks.filter(w => w.week >= 1 && w.week <= 17).forEach(w => {
    Object.entries(w.points).forEach(([pid, p]) => { tot[pid] = (tot[pid] || 0) + p; });
  });
  return tot;
}

function main() {
  const hist = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft/backtest/fp_hist_rows.json'), 'utf8'));
  const pairs = []; // [gapPts, flipped]
  const seasonNotes = [];

  for (const season of SEASONS) {
    const y = hist.years[season];
    if (!y || !y.gradeable) { seasonNotes.push(`${season}: not gradeable — skipped`); continue; }
    const real = realizedFor(season);
    const byPos = {};
    y.rows.forEach(r => {
      const q = r.position || posOf(r.pid);
      if (!q || !POOL_K[q] || r.our_pts == null) return;
      (byPos[q] || (byPos[q] = [])).push({ pid: String(r.pid), proj: r.our_pts });
    });
    for (const q of Object.keys(POOL_K)) {
      const pool = (byPos[q] || []).sort((a, b) => b.proj - a.proj).slice(0, POOL_K[q]);
      const joined = pool.filter(p => real[p.pid] != null);
      if (pool.length && joined.length / pool.length < 0.6) {
        seasonNotes.push(`${season} ${q}: JOIN FAILURE — ${joined.length}/${pool.length} matched realized points; position-season dropped (C3)`);
        continue;
      }
      for (let i = 0; i < joined.length; i++) for (let j = i + 1; j < joined.length; j++) {
        const a = joined[i], b = joined[j];
        const gap = Math.abs(a.proj - b.proj);
        const flip = (a.proj - b.proj) * (real[a.pid] - real[b.pid]) < 0;
        pairs.push([gap, flip ? 1 : 0]);
      }
    }
  }

  // controls, before any curve is read
  const wide = pairs.filter(p => p[0] > 80);
  const tight = pairs.filter(p => p[0] < 5);
  const wideFlip = wide.reduce((s, p) => s + p[1], 0) / (wide.length || 1);
  const tightFlip = tight.reduce((s, p) => s + p[1], 0) / (tight.length || 1);
  const c1 = wide.length >= 100 && wideFlip < 0.35;
  const c2 = tight.length >= 100 && tightFlip > 0.45 && tightFlip < 0.55;
  if (!c1 || !c2) {
    console.error(`CONTROL FAILURE — refusing to report a band.\n  C1 wide-gap (${wide.length} pairs, flip ${(wideFlip * 100).toFixed(1)}%, need <35%): ${c1 ? 'ok' : 'FAIL'}\n  C2 near-tie (${tight.length} pairs, flip ${(tightFlip * 100).toFixed(1)}%, need 45-55%): ${c2 ? 'ok' : 'FAIL'}`);
    process.exit(1);
  }

  // the curve
  const bins = new Map();
  pairs.forEach(([g, f]) => {
    const b = Math.min(30, Math.floor(g / BIN_W)); // cap tail at 150+
    if (!bins.has(b)) bins.set(b, [0, 0]);
    const e = bins.get(b); e[0] += f; e[1] += 1;
  });
  const curve = [...bins.keys()].sort((a, b) => a - b).map(b => {
    const [f, n] = bins.get(b);
    return { gap_lo: b * BIN_W, gap_hi: b === 30 ? null : (b + 1) * BIN_W, n, flip: f / n };
  });

  // read band candidates off the curve (first crossing below each target,
  // interpolated between bin centers)
  const centers = curve.map(c => ({ x: c.gap_lo + BIN_W / 2, y: c.flip, n: c.n }));
  const bandAt = target => {
    for (let i = 1; i < centers.length; i++) {
      const a = centers[i - 1], b = centers[i];
      if (a.y >= target && b.y < target) {
        return a.x + (a.y - target) / (a.y - b.y) * (b.x - a.x);
      }
    }
    return null;
  };
  const candidates = FLIP_TARGETS.map(t => ({ flip_target: t, gap_pts: bandAt(t) }));

  const out = {
    _territory: 'relay measurement; A owns DG_NOISE_BAND/noiseBand',
    _method: 'see file header — declared before the run',
    _controls: { c1_wide: { n: wide.length, flip: wideFlip }, c2_near_tie: { n: tight.length, flip: tightFlip }, c3_notes: seasonNotes },
    pairs_total: pairs.length,
    curve, candidates,
    dollar_conversion: 'multiply gap_pts by the current board\'s $/pt (measured separately — engine dollars are client-side); see the audit doc',
  };
  fs.writeFileSync(path.join(ROOT, 'draft/data/even_money_band_derivation.json'), JSON.stringify(out, null, 1));

  console.log('EVEN-MONEY BAND DERIVATION — flip rate vs preseason projection gap');
  console.log(`pairs: ${pairs.length}   controls: C1 ${(wideFlip * 100).toFixed(1)}% @>80pts  C2 ${(tightFlip * 100).toFixed(1)}% @<5pts`);
  seasonNotes.forEach(n => console.log('  note: ' + n));
  curve.forEach(c => console.log(`  ${String(c.gap_lo).padStart(4)}-${c.gap_hi == null ? '   +' : String(c.gap_hi).padStart(4)} pts  n=${String(c.n).padStart(5)}  flip ${(c.flip * 100).toFixed(1)}%`));
  candidates.forEach(c => console.log(`  band @ flip ${(c.flip_target * 100).toFixed(1)}% : ${c.gap_pts == null ? 'no crossing' : c.gap_pts.toFixed(1) + ' pts'}`));
}

main();
