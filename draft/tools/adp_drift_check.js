/* TERRITORY: relay — the check Cory asked for and nobody owned.
 *
 * Cory, 2026-08-17: "BIG BOARD MAKE FOOTBALL SENSE (SHOULDNT STRAY TOO MUCH
 * FROM ADP OR SOMETHING PROBABLY WRONG, IF WRONG SOMEONE NEEDS TO FIND AND FIX)."
 *
 * The market is ten thousand drafters. When our board disagrees with it by a
 * lot, the prior is that WE are wrong — a crosswalk miss, a scoring mismatch, a
 * degenerate field — not that we found an edge.
 *
 * BUT THE CHECK IS TWO-SIDED, AND THE SECOND HALF IS EASIER TO FORGET:
 * TOO LITTLE DRIFT IS ALSO A FAILURE. A board that never disagrees with ADP is
 * an expensive way to reproduce the consensus. Every disagreement is where the
 * edge lives, so a board with zero drift fails this check as surely as one with
 * wild drift. That is why this reports a DISTRIBUTION and two verdicts, not a
 * count and a pass.
 *
 * Run: node draft/tools/adp_drift_check.js [path/to/draft_data.json]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROUND = 10;                 // 10-team league: one round = 10 picks
const FLAG_ROUNDS = 1;            // flag anything moving more than a round
const EXTREME_ROUNDS = 4;         // "almost certainly a bug, not an opinion"
const MIN_DRIFT_SHARE = 0.15;     // below this, the board is echoing the market
const TOP_N = 150;                // the picks that actually decide a season

/* A stated model reason, in the board's own fields. A flag without one of these
 * is a suspected defect — not because the board must justify itself in prose,
 * but because a large disagreement with the market that no model term explains
 * is exactly the shape of a bug. */
function reasonFor(p) {
  const why = [];
  if (p.is_keeper || p.keeper_value) why.push('keeper');
  if (p.tier_cliff || p.tier_urgency) why.push('tier cliff');
  if (p.stack_bonus) why.push('stack');
  if (p.adp_stale) why.push('ADP is stale');
  if (p.proj_ceiling_source && p.proj_ceiling_source !== 'measured-2023-25-p90') {
    why.push(`ceiling from ${p.proj_ceiling_source}`);
  }
  if (p.adp_source && p.adp_source !== 'fantasypros') why.push(`adp from ${p.adp_source}`);
  return why;
}

function analyse(board) {
  /* BOARD RANK IS COMPUTED OVER THE WHOLE BOARD, NOT OVER THE JOINED SUBSET.
   *
   * The first version filtered to players having BOTH vorp and adp before
   * ranking, so every player without an ADP silently lifted everyone else's
   * board rank — Darren Waller (vorp −52, genuinely outside the top 200) came
   * out as board rank 136 and looked like a +126 disagreement with the market.
   * That is the shrunken-population join this project keeps flagging in others,
   * committed inside the tool written to catch it. Rank on everything; compare
   * only where both numbers exist. */
  const all = (board.players || []).filter(p => p.vorp != null);
  const byBoard = all.slice().sort((a, b) => b.vorp - a.vorp);
  const players = all.filter(p => p.adp != null);
  const byAdp = players.slice().sort((a, b) => a.adp - b.adp);

  const boardRank = new Map(byBoard.map((p, i) => [p.player_id, i + 1]));
  const adpRank = new Map(byAdp.map((p, i) => [p.player_id, i + 1]));

  const rows = byBoard.slice(0, TOP_N).filter(p => p.adp != null).map(p => {
    const br = boardRank.get(p.player_id), ar = adpRank.get(p.player_id);
    return { name: p.name, pos: p.position, boardRank: br, adpRank: ar,
             drift: ar - br, reasons: reasonFor(p) };
  });

  const flagged = rows.filter(r => Math.abs(r.drift) > ROUND * FLAG_ROUNDS);
  const extreme = rows.filter(r => Math.abs(r.drift) > ROUND * EXTREME_ROUNDS);
  const unexplained = flagged.filter(r => r.reasons.length === 0);
  const share = rows.length ? flagged.length / rows.length : 0;

  return { n: rows.length, rows, flagged, extreme, unexplained, share };
}

/* TWO verdicts, because there are two ways to fail and they are opposite. */
function verdicts(a) {
  const out = [];
  if (a.share < MIN_DRIFT_SHARE) {
    out.push(`🔴 TOO LITTLE DRIFT — only ${(a.share * 100).toFixed(1)}% of the top ${a.n} `
      + `disagree with ADP by more than a round. The board is largely reproducing the `
      + `market, and a board that agrees with the consensus everywhere cannot beat it. `
      + `THE EDGE LIVES IN THE DISAGREEMENTS.`);
  } else {
    out.push(`✅ DRIFT PRESENT — ${(a.share * 100).toFixed(1)}% of the top ${a.n} disagree `
      + `with ADP by more than a round. The board is expressing a view.`);
  }
  if (a.unexplained.length) {
    out.push(`🔴 ${a.unexplained.length} FLAGGED PLAYERS HAVE NO STATED MODEL REASON. `
      + `A large disagreement no model term explains is the shape of a bug — a crosswalk `
      + `miss, a scoring mismatch, a degenerate field. Each is a suspected defect.`);
  } else {
    out.push(`✅ every flagged player carries a stated model reason.`);
  }
  if (a.extreme.length) {
    out.push(`🔴 ${a.extreme.length} move more than ${EXTREME_ROUNDS} ROUNDS. At this `
      + `magnitude the prior is strongly that we are wrong, not the market.`);
  }
  return out;
}

function main() {
  const file = process.argv[2] || path.join(__dirname, '..', '..', 'public', 'draft_data.json');
  const board = JSON.parse(fs.readFileSync(file, 'utf8'));
  const a = analyse(board);

  console.log(`ADP DRIFT CHECK — top ${a.n} by board rank, vs ADP rank\n`);
  const buckets = { '0-9': 0, '10-19': 0, '20-39': 0, '40+': 0 };
  a.rows.forEach(r => {
    const d = Math.abs(r.drift);
    if (d < 10) buckets['0-9']++; else if (d < 20) buckets['10-19']++;
    else if (d < 40) buckets['20-39']++; else buckets['40+']++;
  });
  console.log('  drift distribution (|board rank − ADP rank|):');
  Object.entries(buckets).forEach(([k, v]) =>
    console.log(`    ${k.padEnd(6)} ${String(v).padStart(4)}  ${'█'.repeat(Math.round(v / 2))}`));

  console.log(`\n  biggest disagreements:`);
  a.rows.slice().sort((x, y) => Math.abs(y.drift) - Math.abs(x.drift)).slice(0, 12)
    .forEach(r => console.log(
      `    ${(r.name || '?').padEnd(22)} ${String(r.pos || '').padEnd(3)} `
      + `board ${String(r.boardRank).padStart(3)}  adp ${String(r.adpRank).padStart(3)}  `
      + `${r.drift > 0 ? '+' : ''}${r.drift}  ${r.reasons.length ? r.reasons.join(', ') : '⚠️ NO STATED REASON'}`));

  console.log('');
  verdicts(a).forEach(v => console.log('  ' + v));
  return a.unexplained.length || a.extreme.length || a.share < MIN_DRIFT_SHARE ? 1 : 0;
}

if (require.main === module) process.exitCode = main();
module.exports = { analyse, verdicts, reasonFor, ROUND, FLAG_ROUNDS, MIN_DRIFT_SHARE };
