/* EXTERNAL SANITY TRIAGE — the model against a market-ADP reference drafter.
 *
 * Cory, 2026-08-13: "INTERNAL CONSISTENCY IS NOT EXTERNAL VALIDITY. Every arm
 * you have run compares the model against another version of the model."
 *
 * THIS IS TRIAGE, NOT VALIDATION. ADP cannot show the model is correct. It can
 * show that the model is wildly outside normal drafting behaviour, or that it is
 * broadly inside it, and those two answers start completely different
 * investigations.
 *
 * ── THE REFERENCE DRAFTER, AND WHY IT IS NOT "COMPARE OUR PICK TO AN ADP" ────
 *
 * Comparing pick 41 against a raw ADP of 140 manufactures a 99-pick reach that
 * does not exist, because the market's ADP does not know Cory keeps three
 * players. So the reference is a DRAFTER, not a number: SAME SEAT, SAME KEEPERS,
 * SAME OPPONENTS, SAME DRAFT STATE, whose only selection rule is "take the
 * highest-ranked available player by ADP".
 *
 * That makes the reference's OWN reach distribution the control for the keeper
 * effect. If removing three top players and their pick slots shifts everything
 * forward, the reference shows that shift too, and only the model's EXCESS over
 * the reference is a property of the model.
 *
 * Two independent simulations. After the first differing pick the two boards
 * legitimately diverge — that is the counterfactual, not a confound.
 *
 * ── STAGE 1 IS MEASUREMENT ONLY ─────────────────────────────────────────────
 *
 * No diagnosis, no VORP explanation, no hypothesis. Cory registered a prediction
 * before this was written and it is deliberately not repeated here, so nothing
 * in this file can shape what it reports.
 *
 * SIGNED, NOT ABSOLUTE: absolute reach shows a position that is noise around
 * zero as equally divergent to one that is systematically pulled forward.
 * DISTRIBUTED, NOT AVERAGED: -8, +2, +5, -4, +7, +52, +61, +48 averages to
 * something unremarkable.
 *
 * Run: node draft/tools/adp_sanity.js
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
['survival', 'composite', 'engine', 'needrule'].forEach(m =>
  require(path.join(ROOT, 'public', 'js', 'draft', m + '.js')));
const LC = require(path.join(ROOT, 'draft', 'tools', 'live_context.js'));
const E = global.DraftEngine;

const BOARD = LC.loadBoard();
const ALL = BOARD.players;
const KEEPERS = BOARD.kept_players;
const MY = (BOARD.pick_order.my_picks || []).slice();
const TOTAL = (BOARD.pick_order.picks || []).length;

const adpOf = p => (p.adp == null ? 9999 : Number(p.adp));

/* The market's own ordering, used both for opponents and for the reference
 * drafter's own selections — one derivation, so the two cannot disagree. */
function bestByAdp(pool) {
  let best = null;
  for (const p of pool) if (!best || adpOf(p) < adpOf(best)) best = p;
  return best;
}

function simulate(chooser) {
  const drafted = new Set();
  KEEPERS.forEach(k => drafted.add(String(k.player_id)));
  const roster = KEEPERS.map(k => Object.assign({}, k, { is_keeper: true }));
  const mine = [];
  for (let i = 0; i < MY.length; i++) {
    const pick = MY[i];
    const next = MY[i + 1] || pick;
    let pool = ALL.filter(p => !drafted.has(String(p.player_id)));
    const gap = i === 0 ? pick - 1 : pick - MY[i - 1] - 1;
    for (let k = 0; k < gap; k++) {
      const o = bestByAdp(pool);
      if (!o) break;
      drafted.add(String(o.player_id));
      pool = pool.filter(x => x !== o);
    }
    const chosen = chooser(pool, roster, pick, next, i);
    if (!chosen) break;
    mine.push({ pick, player: chosen });
    drafted.add(String(chosen.player_id));
    roster.push(chosen);
  }
  return mine;
}

const modelPicks = simulate((pool, roster, pick, next, i) => {
  const r = E.recommend(LC.liveContext({
    currentPick: pick, nextPick: next, board: pool, roster: roster,
    myPicksLeft: MY.length - i, myPickIndex: i,
  }));
  return r && r.length ? r[0].player : null;
});
const marketPicks = simulate(pool => bestByAdp(pool));

// ── REPORT ────────────────────────────────────────────────────────────────
function posCounts(picks) {
  const c = {};
  picks.forEach(x => { c[x.player.position] = (c[x.player.position] || 0) + 1; });
  return c;
}
function occurrences(picks, pos) {
  return picks.filter(x => x.player.position === pos).map(x => x.pick);
}
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
/* SIGNED REACH = ADP - PICK NUMBER. Positive means taken EARLIER than the market
 * prices him. The reference drafter's own distribution is printed beside it as
 * the control: whatever the keeper slate does to the pick numbering, it does to
 * both arms. */
function reaches(picks) {
  return picks.filter(x => x.player.adp != null)
    .map(x => ({ pos: x.player.position, name: x.player.name,
      pick: x.pick, adp: Number(x.player.adp), reach: Number(x.player.adp) - x.pick }));
}
function dist(rs) {
  const s = rs.map(r => r.reach).sort((a, b) => a - b);
  return { n: s.length, median: quantile(s, 0.5), p75: quantile(s, 0.75),
    p90: quantile(s, 0.9), max: s.length ? s[s.length - 1] : null,
    min: s.length ? s[0] : null };
}
const fmt = v => v == null ? '  -  ' : (v >= 0 ? '+' : '') + v.toFixed(1);

console.log('STAGE 1 — MEASUREMENT ONLY. No diagnosis in this file or this output.\n');
console.log('  ' + MY.length + ' of my picks in a ' + TOTAL + '-pick draft, seat '
  + BOARD.league.my_draft_slot + ', keepers ' + KEEPERS.map(k => k.name).join(', '));
console.log('  Both arms: identical seat, keepers, opponents (ADP) and pick numbers.\n');

console.log('POSITIONAL DISTRIBUTION');
const mc = posCounts(modelPicks), kc = posCounts(marketPicks);
const allPos = [...new Set([...Object.keys(mc), ...Object.keys(kc)])].sort();
console.log('  pos   model   market');
allPos.forEach(p => console.log('  ' + p.padEnd(5) + String(mc[p] || 0).padStart(5)
  + String(kc[p] || 0).padStart(9)));

console.log('\nEXACT PICK NUMBERS BY POSITION');
allPos.forEach(p => {
  const m = occurrences(modelPicks, p), k = occurrences(marketPicks, p);
  console.log('  ' + p.padEnd(5) + ' model: ' + (m.length ? m.join(', ') : '-').padEnd(30)
    + ' market: ' + (k.length ? k.join(', ') : '-'));
});

console.log('\nFIRST / SECOND / THIRD OCCURRENCE');
console.log('  pos   model 1st  2nd  3rd    market 1st  2nd  3rd');
allPos.forEach(p => {
  const m = occurrences(modelPicks, p), k = occurrences(marketPicks, p);
  const cell = a => [0, 1, 2].map(i => (a[i] == null ? ' - ' : String(a[i]).padStart(3))).join('  ');
  console.log('  ' + p.padEnd(5) + '     ' + cell(m) + '        ' + cell(k));
});

console.log('\nPOSITION BY ROUND (round = ceil(pick / 10))');
const rounds = {};
modelPicks.forEach(x => {
  const r = Math.ceil(x.pick / 10);
  rounds[r] = rounds[r] || { m: null, k: null };
  rounds[r].m = x.player.position;
});
marketPicks.forEach(x => {
  const r = Math.ceil(x.pick / 10);
  rounds[r] = rounds[r] || { m: null, k: null };
  rounds[r].k = x.player.position;
});
console.log('  round   model   market');
Object.keys(rounds).map(Number).sort((a, b) => a - b).forEach(r =>
  console.log('  ' + String(r).padStart(5) + '   ' + String(rounds[r].m || '-').padEnd(7)
    + String(rounds[r].k || '-')));

const mr = reaches(modelPicks), kr = reaches(marketPicks);
console.log('\nSIGNED REACH (adp - pick; positive = taken EARLIER than market prices him)');
const md = dist(mr), kd = dist(kr);
console.log('           n   median    p75     p90     max     min');
console.log('  model ' + String(md.n).padStart(4) + '  ' + fmt(md.median).padStart(7)
  + fmt(md.p75).padStart(8) + fmt(md.p90).padStart(8) + fmt(md.max).padStart(8) + fmt(md.min).padStart(8));
console.log('  market' + String(kd.n).padStart(4) + '  ' + fmt(kd.median).padStart(7)
  + fmt(kd.p75).padStart(8) + fmt(kd.p90).padStart(8) + fmt(kd.max).padStart(8) + fmt(kd.min).padStart(8));

console.log('\nSIGNED REACH BY POSITION');
console.log('  pos        arm     n   median     p75     p90     max');
allPos.forEach(p => {
  [['model', mr], ['market', kr]].forEach(([label, rs]) => {
    const sub = rs.filter(r => r.pos === p);
    if (!sub.length) return;
    const d = dist(sub);
    console.log('  ' + p.padEnd(5) + '  ' + label.padEnd(8) + String(d.n).padStart(3)
      + '  ' + fmt(d.median).padStart(7) + fmt(d.p75).padStart(8)
      + fmt(d.p90).padStart(8) + fmt(d.max).padStart(8));
  });
});

console.log('\nEVERY MODEL PICK, WITH ITS SIGNED REACH');
mr.forEach(r => console.log('  pick ' + String(r.pick).padStart(3) + '  ' + r.pos.padEnd(4)
  + ' ' + r.name.padEnd(24) + ' adp ' + String(r.adp).padStart(7) + '   reach ' + fmt(r.reach)));
console.log('\nEVERY MARKET PICK, WITH ITS SIGNED REACH');
kr.forEach(r => console.log('  pick ' + String(r.pick).padStart(3) + '  ' + r.pos.padEnd(4)
  + ' ' + r.name.padEnd(24) + ' adp ' + String(r.adp).padStart(7) + '   reach ' + fmt(r.reach)));

/* ── THE REFERENCE'S OWN REACH IS A TAUTOLOGY. PRINTED SO NOBODY QUOTES IT. ──
 *
 * Added 2026-08-13, after I used "the model's median reach is 3.5x the
 * reference's" as this report's headline. The reference takes argmin(adp); with
 * ADP-drafting opponents the best player left at pick N is the Nth-lowest ADP,
 * so its reach is the ADP-rank-minus-pick offset and NOTHING ELSE. It cannot
 * reach. A ratio against it measures the selection rule, not the model.
 *
 * The check below recomputes that offset straight off the sorted board, with no
 * simulation involved, and asserts it matches the arm. If it ever stops
 * matching, the reference has started doing something and the ratio becomes
 * meaningful — until then the positional distribution and the model's ABSOLUTE
 * reaches are the diagnostic parts of this report. */
const sortedByAdp = ALL.filter(p => p.adp != null).sort((a, b) => adpOf(a) - adpOf(b));
const predicted = MY.map(n => (sortedByAdp[n - 1] ? adpOf(sortedByAdp[n - 1]) - n : null));
const actual = kr.map(r => r.reach);
const same = predicted.every((v, i) => v == null || Math.abs(v - actual[i]) < 0.01);
console.log('\nTAUTOLOGY CHECK — the reference arm\'s reach, recomputed from the sorted');
console.log('board with no simulation: ' + predicted.map(v => v == null ? '-' : v.toFixed(1)).join(', '));
console.log('  matches the simulated market arm exactly: ' + same);
console.log('  => the reference CANNOT reach. Do not quote a ratio against it. The');
console.log('     positional distribution and the model\'s ABSOLUTE reaches are what');
console.log('     this report can support.');
