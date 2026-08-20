#!/usr/bin/env node
// TERRITORY: relay
/* WHAT DID REAL WAIVER ADDS ACTUALLY SCORE? — prereg DISTRIBUTIONAL-OBJECTIVE §2, P150.
 *
 * The external audit's second attack: the waiver-aware grading floors every
 * starting slot at WAIVER_WK — the measured level of what SITS on the wire.
 * But a floor you cannot actually acquire (priority, competition, timing)
 * over-credits streaming and compresses every drafted-roster edge. This
 * measures the ACQUISITION value: join all completed adds 2023-25 to the
 * players' realized weekly points over the four weeks starting at the add.
 *
 * waiver_supply.js measured demand and states its own gap verbatim: "It does
 * NOT say what the replacement SCORED, because realized weekly points are
 * not in the repo." They are now (league_history.json weeks), so the join it
 * declared missing is exactly what runs here.
 *
 * Rule 3e control: K/DEF are the known positive — their pools cycle 83-100%,
 * so the realized-add level must land within ±2/week of the floor there, or
 * the join is broken and the run REFUSES to report the other rows.
 *
 * Run: node draft/tools/waiver_realized_level.js
 * Writes draft/data/waiver_realized_level.json. REPORT ONLY.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const H = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const PP = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'player_positions.json'), 'utf8'));

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const POSOF = {};
Object.entries(PP.positions || {}).forEach(([id, q]) => { POSOF[String(id)] = q; });
BOARD.players.forEach(p => { if (p.position) POSOF[String(p.player_id)] = p.position; });
const posOf = id => POSOF[String(id)] || (/^[A-Z]{2,3}$/.test(String(id)) ? 'DEF' : null);

/* the floor under attack — §13's numbers, per week */
const FLOOR = { QB: 322.9 / 17, RB: 78.4 / 17, WR: 124.8 / 17, TE: 130.4 / 17, K: 128.6 / 17, DEF: 100.0 / 17 };

const perAdd = { QB: [], RB: [], WR: [], TE: [], K: [], DEF: [] };
let joined = 0, skippedNoGames = 0;
Object.values(H.seasons).forEach(season => {
  const t = season.transactions || {};
  if (!Object.keys(t).length || !season.weeks) return;
  const wk = {};   // week -> {id: pts}
  Object.entries(season.weeks).forEach(([wn, arr]) => {
    const w = +wn;
    if (w < 1 || w > 17 || !Array.isArray(arr)) return;
    const pts = {};
    arr.forEach(m => Object.entries(m.players_points || {}).forEach(([id, v]) => { pts[id] = v; }));
    wk[w] = pts;
  });
  Object.entries(t).forEach(([wn, arr]) => {
    const w = +wn;
    (arr || []).forEach(x => {
      if (x.status !== 'complete' || !x.adds) return;
      Object.keys(x.adds).forEach(pid => {
        const q = posOf(pid);
        if (!q) return;
        /* the four weeks starting at the add week, only weeks he had a game
         * (absent from players_points = no game; a played 0 is a real 0) */
        const games = [];
        for (let k = w; k < w + 4 && k <= 17; k++) {
          if (wk[k] && wk[k][String(pid)] != null) games.push(wk[k][String(pid)]);
        }
        if (!games.length) { skippedNoGames++; return; }
        joined++;
        perAdd[q].push(games.reduce((a, b) => a + b, 0) / games.length);
      });
    });
  });
});

const rows = {};
POS.forEach(q => {
  const a = perAdd[q].slice().sort((x, y) => x - y);
  if (!a.length) { rows[q] = null; return; }
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  rows[q] = {
    n: a.length,
    realized_mean_per_week: +mean.toFixed(2),
    realized_median_per_week: +a[Math.floor(a.length / 2)].toFixed(2),
    floor_per_week: +FLOOR[q].toFixed(2),
    realized_over_floor: +(mean / FLOOR[q]).toFixed(3),
    share_of_adds_beating_floor: +(a.filter(v => v > FLOOR[q]).length / a.length).toFixed(3),
  };
});

/* Rule 3e control BEFORE reporting anything else */
['K', 'DEF'].forEach(q => {
  const r = rows[q];
  if (!r || Math.abs(r.realized_mean_per_week - r.floor_per_week) > 2) {
    throw new Error('CONTROL FAILED at ' + q + ': realized ' + (r && r.realized_mean_per_week)
      + ' vs floor ' + (r && r.floor_per_week) + ' — the free-cycling positions must sit within ±2. '
      + 'The join is suspect; REFUSING to report.');
  }
});
console.error('[control] K/DEF realized-add level within ±2 of floor — join is live');

console.log('='.repeat(74));
console.log('REALIZED VALUE OF ACTUAL WAIVER ADDS vs THE GRADING FLOOR — P150');
console.log('  (' + joined + ' completed adds joined; ' + skippedNoGames + ' had no game in the 4-week window)');
console.log('='.repeat(74));
console.log('  pos      n   realized/wk   floor/wk   ratio   share beating floor');
POS.forEach(q => {
  const r = rows[q];
  if (!r) return;
  console.log('  ' + q.padEnd(5) + String(r.n).padStart(4)
    + String(r.realized_mean_per_week.toFixed(2)).padStart(12)
    + String(r.floor_per_week.toFixed(2)).padStart(11)
    + String(r.realized_over_floor.toFixed(2)).padStart(8)
    + String((r.share_of_adds_beating_floor * 100).toFixed(0) + '%').padStart(14));
});
console.log('='.repeat(74));

fs.writeFileSync(path.join(ROOT, 'draft', 'data', 'waiver_realized_level.json'),
  JSON.stringify({ generated: new Date().toISOString(),
    prereg: 'DISTRIBUTIONAL-OBJECTIVE-PREREG-2026-08-20.md §2 (P150)',
    window: 'add week + next 3, game weeks only', joined, skippedNoGames, rows }, null, 1));
