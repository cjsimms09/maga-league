// TERRITORY: A
/* WHERE THE TWO CARDS DISAGREE, AND ABOUT WHAT.
 *
 * Cory routed the headline from B's driven-mock log: the needrule card's pick is
 * not on the composite's list two thirds of the time. That number is correct.
 * This asks the question underneath it — WHEN they diverge and WHAT ABOUT —
 * because "68% of the time" describes a uniform disagreement and the log does not
 * show a uniform disagreement.
 *
 * ── READ THE FIVE AS THE SCREEN, NOT AS THE LOG'S LIMIT ─────────────────────
 *
 * The log records the composite's top five. That is not a truncation choice by
 * B: app.js:3451 renders `all.slice(0, 5)` into #recs, so five IS what the war
 * room shows. "Not on the list" therefore means genuinely not visible in the
 * composite panel, not merely absent from the capture.
 *
 * ── WHAT THIS CANNOT SEE, STATED SO A ROW IS NOT OVER-READ ──────────────────
 *
 * When the rule's pick is off the list, this cannot say WHERE it ranked — 6th or
 * 600th are identical here. The log records page_says.drafted and board_left as
 * COUNTS and never which players were taken, so the board cannot be rebuilt and
 * the rank cannot be recovered. Every magnitude below is therefore computed on
 * the rows where the cards NEARLY AGREE, which is the mildest third of the
 * disagreement. See surface_log_audit.js for the one-field request that would
 * lift this.
 *
 * ── HOW THIS ONE WAS CHECKED ────────────────────────────────────────────────
 *
 * Every number here was computed TWICE from the same log by two independent
 * implementations — once ad hoc in Python while reading the artifact, once here
 * in JS — and they agree to the digit, including the bucket counts (8/10/39),
 * the sorted gap vector and the round split. That is not a substitute for a
 * fixture suite, and it is recorded as what it is: a cross-implementation
 * agreement, which catches transcription and indexing slips (the class that
 * produced the 4.42) and does NOT catch a premise both implementations share.
 * The stated-numbers check that matters most — the classification rule itself —
 * is a three-line function visible above rather than something to trust.
 *
 * Run: node draft/tools/card_disagreement.js <path-to-drive-log.ndjson>
 */
'use strict';
const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.log('usage: node draft/tools/card_disagreement.js <path-to-drive-log.ndjson>');
  console.log('\nB\'s log lives on claude/in-season-surface-fixes-6nyayc at');
  console.log('public/js/drivelog/draft-drive-log.ndjson — extract it with `git show`.');
  process.exit(2);
}
let rows;
try {
  rows = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
} catch (e) { console.log('CANNOT READ: ' + e.message); process.exit(2); }

/* STALE-BOARD ROWS ARE EXCLUDED AND THE EXCLUSION IS SHOWN.
 * The follow-2-killed run froze at picks 13/28/33 and repeated one
 * recommendation; the log flagged it (board_caught_up=false) and fired a kill
 * event. Those rows are not independent observations. All three happen to be
 * AGREEMENTS, so dropping them makes the disagreement look worse — the exclusion
 * cuts against the headline it supports, which is the direction to err in. */
const all = rows.filter(r => r.recommended);
const picks = all.filter(r => r.board_caught_up);
console.log('CARD DISAGREEMENT — ' + all.length + ' pick rows, ' + picks.length
  + ' with a caught-up board (' + (all.length - picks.length) + ' stale rows excluded)\n');

function rulePos(r) {
  const nm = ((r.panels || {}).needrule_card) || '';
  const t = ((r.panels || {}).needrule_text) || '';
  const i = t.indexOf(nm);
  if (i < 0 || !nm) return null;
  const m = t.slice(i + nm.length).match(/^\s*(QB|RB|WR|TE|K|DEF)\b/);
  return m ? m[1] : null;
}
function bucket(r) {
  const rule = (r.panels || {}).needrule_card;
  const names = [r.recommended].concat(r.alternatives || []).map(t => t.name);
  return rule === names[0] ? 'same' : (names.indexOf(rule) > 0 ? 'mid' : 'out');
}

/* ── 1. IT IS NOT UNIFORM. THERE IS A ROUND BOUNDARY. ─────────────────────── */
const SPLIT = 3;
console.log('  WHEN THEY DIVERGE');
[['rounds 1-' + (SPLIT - 1), r => r.round < SPLIT],
 ['rounds ' + SPLIT + '+', r => r.round >= SPLIT]].forEach(([lbl, f]) => {
  const g = picks.filter(f);
  const c = { same: 0, mid: 0, out: 0 };
  g.forEach(r => { c[bucket(r)]++; });
  console.log('    ' + lbl.padEnd(12) + 'n=' + String(g.length).padEnd(4)
    + ' rule pick IS the composite #1: ' + String(c.same).padEnd(4)
    + ' on the list 2-5: ' + String(c.mid).padEnd(4)
    + ' OFF THE LIST: ' + c.out
    + '  (' + Math.round(100 * c.out / (g.length || 1)) + '%)');
});
console.log('    The headline rate is an average over two regimes, not a constant.');

/* ── 2. THE DIVERGENCE HAS A DIRECTION ───────────────────────────────────── */
const out = picks.filter(r => bucket(r) === 'out');
const ONE_START = ['QB', 'TE', 'K', 'DEF'];
const samePos = out.filter(r => rulePos(r) === r.recommended.pos).length;
const compOne = out.filter(r => ONE_START.indexOf(r.recommended.pos) >= 0).length;
const ruleOne = out.filter(r => ONE_START.indexOf(rulePos(r)) >= 0).length;
console.log('\n  WHAT THEY DIVERGE ABOUT (' + out.length + ' off-list rows)');
console.log('    same position, different player: ' + samePos
  + '  — pure ADP-vs-VONA ordering, no positional disagreement at all');
console.log('    different position:              ' + (out.length - samePos));
console.log('    composite #1 is a ONE-START position (QB/TE/K/DEF): ' + compOne
  + ' of ' + out.length + ' (' + Math.round(100 * compOne / out.length) + '%)');
console.log('    the rule\'s pick is one-start:                       ' + ruleOne
  + ' of ' + out.length + ' (' + Math.round(100 * ruleOne / out.length) + '%)');

const cnt = {};
out.forEach(r => {
  const k = (rulePos(r) || '?') + ' -> ' + r.recommended.pos;
  cnt[k] = (cnt[k] || 0) + 1;
});
console.log('\n    rule position -> composite position, most common:');
Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 6)
  .forEach(k => console.log('      ' + k.padEnd(14) + cnt[k]));

/* ── 3. MAGNITUDE, ON THE ONLY ROWS WHERE IT IS MEASURABLE ───────────────── */
const gaps = [];
picks.forEach(r => {
  if (bucket(r) !== 'mid') return;
  const top = [r.recommended].concat(r.alternatives || []);
  const i = top.map(t => t.name).indexOf((r.panels || {}).needrule_card);
  gaps.push(top[0].score - top[i].score);
});
gaps.sort((a, b) => a - b);
const med = gaps.length % 2 ? gaps[(gaps.length - 1) / 2]
  : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2;
/* CFG.COIN_FLIP_GAP 1.0, TIE_THRESHOLD 2.0, CLOSE_GAP 3.5 — the engine's own
 * resolution constants, so the gap is read against the bands the engine already
 * uses to decide whether it considers two players distinguishable. */
const band = x => (x < 1.0 ? 'TIE (within coin flip)' : (x < 2.0 ? 'tie band'
  : (x < 3.5 ? 'CLOSE' : 'DECISIVE')));
console.log('\n  MAGNITUDE — measurable on ' + gaps.length + ' rows only');
gaps.forEach(x => console.log('      ' + x.toFixed(2).padStart(7) + '   ' + band(x)));
console.log('    median ' + med.toFixed(2) + '  max ' + gaps[gaps.length - 1].toFixed(2));
/* A MEDIAN IS THE WRONG SUMMARY OF A BIMODAL SAMPLE AND SAYING SO IS THE POINT.
 * The routed figure was 4.42, which is the 6th of 10 sorted values — the upper
 * of the two middle ones, not the median (3.03). The off-by-one crosses
 * CLOSE_GAP, so it moves the typical disagreement from CLOSE to DECISIVE. But
 * neither number describes the sample: it is bimodal, with nothing between
 * 1.65 and 4.42. */
const lo = gaps.filter(x => x < 2.0).length;
console.log('    BIMODAL: ' + lo + ' at or inside the tie band, '
  + (gaps.length - lo) + ' decisive, nothing in between.');
console.log('    A median summarises this badly whichever way it is computed.');

console.log('\n  NOT MEASURED HERE: the ' + out.length + ' off-list rows have NO gap, because');
console.log('  the log cannot say where the rule\'s pick ranked. The magnitudes above');
console.log('  are the rows where the cards NEARLY agree.');
