#!/usr/bin/env node
'use strict';
/* Writes draft/data/wire_level.json from wire_level.js's own levels() —
 * so the wire-compared bench branch (VONA_WIRE_BENCH, engine.js) reads a
 * real, committed, regeneratable artifact instead of a hardcoded constant
 * baked into JS that would silently go stale as more wire data accumulates
 * in-season. Same discipline as build.py writing draft_data.json: the number
 * is committed, not just described.
 *
 * Run: node draft/tools/emit_wire_level.js
 */
const fs = require('fs');
const path = require('path');
const WL = require(path.join(__dirname, 'wire_level.js'));

const L = WL.levels();
const out = {
  per_week: L.per_week,
  n: L.n,
  statistic: L.statistic,
  scored: L.scored,
  acquisitions: L.acquisitions,
  /* THE OTHER NUMBER THE WIRE PAYS (added 2026-08-15): wire_level.js has
   * published `ongoing` (median of the three weeks AFTER acquisition — what a
   * HELD add delivers, systematically lower than the add-week spike) beside
   * per_week since 08-13, and this artifact silently dropped it. The
   * waiver_claim resolver (src/forecast_grade.js buildInseasonResolutions)
   * needs both: a claim's baseline window is its add week at per_week plus its
   * held weeks at ongoing. Emitted from the same measured source, never
   * transcribed. */
  ongoing: L.ongoing,
  seasons: WL.SEASONS,
  generated_at: new Date().toISOString(),
  note: 'Real acquisition-week medians from draft/tools/wire_level.js, '
    + '2023-2025. K/DEF absent: nflverse is offense-only, unmeasurable from '
    + 'this source, not zero. Regenerate: node draft/tools/emit_wire_level.js',
};
const outPath = path.join(__dirname, '..', 'data', 'wire_level.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log('wrote ' + outPath);
console.log(JSON.stringify(out.per_week));
