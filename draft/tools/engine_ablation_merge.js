#!/usr/bin/env node
// TERRITORY: A
/* MERGE SEED-CHUNK RUNS OF THE ENGINE ABLATION LADDER into one artifact.
 *
 * Why this exists: a single 120-seed × 32-arm run of engine_ablation.js is
 * ~an hour of drafting, and this environment kills background processes on a
 * wall-clock cap shorter than that. The committed primary artifact is
 * therefore regenerated as THREE 40-seed chunk runs plus this merge:
 *
 *   ENGINE_ABLATION_OUT=chunk1.json node draft/tools/engine_ablation.js --rooms 40 --seed 1
 *   ENGINE_ABLATION_OUT=chunk2.json node draft/tools/engine_ablation.js --rooms 40 --seed 41
 *   ENGINE_ABLATION_OUT=chunk3.json node draft/tools/engine_ablation.js --rooms 40 --seed 81
 *   node draft/tools/engine_ablation_merge.js chunk1.json chunk2.json chunk3.json
 *
 * Every per-room number in `detail` is byte-identical to what the monolithic
 * run would produce (rooms are seeded independently; nothing crosses seeds),
 * and the summary/paired/batches/verdict blocks are recomputed here with the
 * DRIVER'S OWN exported functions — never a second implementation
 * (summarizeArm, pairedDeltas, batchMeans, classify). A chunk-consistency
 * check refuses to merge chunks whose config (arms, sims, opponents) differ.
 *
 * Writes: draft/data/engine_ablation_2026.json (ENGINE_ABLATION_OUT overrides).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
require(path.join(ROOT, 'public', 'js', 'draft', 'composite.js'));
require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
require(path.join(ROOT, 'public', 'js', 'draft', 'needrule.js'));
const EA = require(path.join(ROOT, 'draft', 'tools', 'engine_ablation.js'));

const files = process.argv.slice(2);
if (files.length < 2) {
  console.error('usage: engine_ablation_merge.js chunk1.json chunk2.json [...]');
  process.exit(2);
}
const chunks = files.map(f => JSON.parse(fs.readFileSync(f, 'utf8')));

// Config consistency — a merge across differing configs is a different study.
const cfgOf = c => JSON.stringify({ arms: c.arms, sims: c.sims_per_room,
  opponents: c.opponents, batch: c.batch });
chunks.forEach((c, i) => {
  if (cfgOf(c) !== cfgOf(chunks[0])) {
    throw new Error('chunk ' + files[i] + ' config differs from ' + files[0]
      + ' — refusing to merge different studies');
  }
});
// Seed ranges must be disjoint and contiguous when sorted.
const ordered = chunks.slice().sort((a, b) => a.seed_start - b.seed_start);
for (let i = 1; i < ordered.length; i++) {
  if (ordered[i].seed_start !== ordered[i - 1].seed_start + ordered[i - 1].rooms) {
    throw new Error('chunk seed ranges are not contiguous/disjoint: '
      + ordered[i - 1].seed_start + '+' + ordered[i - 1].rooms
      + ' then ' + ordered[i].seed_start);
  }
}

const first = ordered[0];
const ROOMS = ordered.reduce((s, c) => s + c.rooms, 0);
const SEED0 = first.seed_start;
const ALL_ARMS = EA.buildArms();
const armNames = first.arms;

const detail = {};
armNames.forEach(a => {
  detail[a] = [];
  ordered.forEach(c => { detail[a] = detail[a].concat(c.detail[a]); });
  if (detail[a].length !== ROOMS) {
    throw new Error('arm ' + a + ' has ' + detail[a].length + ' rooms, expected ' + ROOMS);
  }
});

const summary = {}, paired = {}, byBatch = {}, verdicts = {};
armNames.forEach(a => {
  summary[a] = EA.summarizeArm(detail[a]);
  byBatch[a] = EA.batchMeans(detail[a], SEED0, ROOMS, first.batch);
  const control = ALL_ARMS[a] && ALL_ARMS[a].control;
  if (control && detail[control]) {
    paired[a] = Object.assign({ control }, EA.pairedDeltas(detail[a], detail[control]));
    if (ALL_ARMS[a].layer) {
      verdicts[a] = { layer: ALL_ARMS[a].layer,
        direction: ALL_ARMS[a].direction,
        classification: EA.classify(paired[a], ALL_ARMS[a].direction) };
    }
  }
});

let replayFrame = null;
const replayPath = path.join(ROOT, 'draft', 'data', 'engine_ablation_replay_2026.json');
if (fs.existsSync(replayPath)) {
  const raw = fs.readFileSync(replayPath);
  replayFrame = { file: 'draft/data/engine_ablation_replay_2026.json',
    sha256: crypto.createHash('sha256').update(raw).digest('hex'),
    summary: JSON.parse(raw.toString()).summary || null };
}

const out = Object.assign({}, first, {
  rooms: ROOMS, seed_start: SEED0,
  merged_from_chunks: ordered.map((c, i) => ({
    seeds: c.seed_start + '-' + (c.seed_start + c.rooms - 1),
    generated_at: c.generated_at })),
  generated_at: new Date().toISOString(),
  summary, paired_vs_control: paired, verdicts, batches: byBatch,
  replay_frame: replayFrame,
  detail,
});
// _territory must stay the first key — Object.assign preserves first's order.
if (Object.keys(out)[0] !== '_territory') throw new Error('_territory must be first');

const OUT_PATH = process.env.ENGINE_ABLATION_OUT
  || path.join(ROOT, 'draft', 'data', 'engine_ablation_2026.json');
fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 1));
console.log('merged ' + files.length + ' chunks (' + ROOMS + ' rooms/arm, seeds '
  + SEED0 + '-' + (SEED0 + ROOMS - 1) + ') -> ' + OUT_PATH);
armNames.forEach(a => {
  const p = paired[a];
  if (!p) return;
  console.log('  ' + a.padEnd(26)
    + ' Δwk ' + p.zero.mean_weekly.mean.toFixed(2)
    + ' [' + p.zero.mean_weekly.ci95.join(',') + '] vs ' + p.control
    + '  diverged ' + p.rooms_diverged + '/' + ROOMS
    + (verdicts[a] ? ('  ' + verdicts[a].classification) : ''));
});
