// TERRITORY: A
/* CORY'S RULING, 2026-08-21, VERBATIM: "the pick should show the player with
 * highest VONA for the source selected." Reaffirmed the same evening, shown the
 * measurement and asked to choose: "Ship it — pure top-VONA headline."
 *
 * ── WHY THIS FILE EXISTS AND WHY NOTHING ELSE COULD COVER IT ────────────────
 *
 * When the ruling shipped, the FULL JS SUITE STAYED GREEN — including all four
 * files that exercise `DraftVerdict.derive()`. That is not reassurance, it is a
 * bug report (rule 3e). Measured: `ui_fidelity_verdict`, `ui_fidelity_tiebreak`,
 * `tiebreak_facts_bake` and `click_ins` mention `vona` **zero times between
 * them**. Their fixtures carry `score` and `gap_to_second` but no `components`,
 * so `vonaTop` resolves to null in every one of them and the new branch never
 * executes. They passed because they cannot see it.
 *
 * A headline change that swaps Cory's first-round pick, covered by four suites
 * that structurally cannot reach the code, is precisely the shape this project
 * keeps paying for. So this drives `derive()` against the REAL board with REAL
 * engine scores, per source.
 *
 * ── WHAT IS BEING GUARDED, AND WHAT IS DELIBERATELY NOT ─────────────────────
 *
 * GUARDED: the headline IS the top-VONA player on the active source; it MOVES
 * when the source moves; the `why` sentence names the source and, when the full
 * model disagrees, names the player it would have taken instead; and the
 * composite headline is still reachable via `vonaHeadline: false`.
 *
 * NOT GUARDED: whether the ruling is CORRECT. It drops `need`, `keeper` and
 * `stack` from the headline, and keeper and stack both ship at weight 1.0 —
 * real terms, not rounding. That is Cory's call, made with the 20%-agreement
 * measurement in front of him, and it is a preference until something grades
 * it. This file pins that the code does what he ruled, not that he ruled well.
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
require(path.join(ROOT, 'public/js/draft/survival.js'));
require(path.join(ROOT, 'public/js/draft/composite.js'));
require(path.join(ROOT, 'public/js/draft/source_board.js'));
const SB = global.window.SourceBoard;
const E = require(path.join(ROOT, 'public/js/draft/engine.js'));
const V = require(path.join(ROOT, 'public/js/draft/verdict.js'));
const data = require(path.join(ROOT, 'public/draft_data.json'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 320) : '')); }
};

const my = ((data.pick_order || {}).my_picks) || [];
const allPicks = ((data.pick_order || {}).picks || []);
const keptIds = ((data.kept_player_ids) || []).map(String);
const kept = (data.kept_players) || [];
const base = data.players.filter(p => !keptIds.includes(String(p.player_id)));

/* Score the board the way the war room does: source-adjusted pool, real ctx. */
function scoredAt(pick, idx, srcKey) {
  const pool = SB.forSource(base, srcKey);
  const ctx = { board: pool, currentPick: pick, nextPick: my[idx + 1] || pick + 20,
    totalPicks: allPicks.length || 150, roster: kept.slice(), currentKeepers: kept.slice(),
    league: data.league, pickBoard: allPicks, intervening: [], myPickIndex: idx,
    totalMyPicks: my.length, myPicksLeft: my.length - idx, roundsLeft: my.length - idx,
    runMultipliers: {}, drift: null, preDraftPrep: true };
  const out = [];
  pool.forEach(p => {
    if (p.adjusted_adp == null || p.adjusted_adp > 250) return;
    const s = E.scorePlayer(p, ctx) || {};
    if (s.score == null) return;
    out.push({ player: p, score: s.score, components: s.components || {},
      gap_to_second: null });
  });
  out.sort((a, b) => b.score - a.score);
  if (out[1]) out[0].gap_to_second = out[0].score - out[1].score;
  return out;
}

const topVona = scored => scored.reduce((best, s) => {
  const v = s.components ? s.components.vona : null;
  if (v == null) return best;
  return (best === null || v > best.v) ? { v: v, p: s.player } : best;
}, null);

const PICK = my[0], IDX = 0;

/* ── CONTROLS FIRST ───────────────────────────────────────────────────────── */

const blendScored = scoredAt(PICK, IDX, null);
ck('CONTROL: the board scores under the blend, so every derive() below is '
  + 'handed a real slate rather than an empty one',
  blendScored.length >= 100, { scored: blendScored.length });

ck('CONTROL: those scored rows actually CARRY components.vona — this is the '
  + 'exact gap that let four existing verdict suites stay green through this '
  + 'ruling. A fixture without it cannot reach the branch under test',
  blendScored.filter(s => s.components && s.components.vona != null).length >= 100,
  { withVona: blendScored.filter(s => s.components && s.components.vona != null).length });

/* ── 1. THE HEADLINE IS THE TOP-VONA PLAYER ───────────────────────────────── */

const vBlend = V.derive({ cfg: E.CFG, scored: blendScored, confidence: { level: 'none', gap: 0, message: '' },
  roster: kept.slice(), sourceLabel: 'the blend' });
const tvBlend = topVona(blendScored);

ck('CONTROL: derive() returned a real verdict with a pick, so the identity '
  + 'check below is comparing two players rather than two nulls',
  vBlend && vBlend.pick && tvBlend && tvBlend.p, { verdict: vBlend && vBlend.verdict });

ck('THE HEADLINE IS THE HIGHEST-VONA PLAYER — Cory\'s ruling, on the blend',
  String(vBlend.pick.player_id) === String(tvBlend.p.player_id),
  { headline: vBlend.pick.name, topVona: tvBlend.p.name, vona: +tvBlend.v.toFixed(1) });

ck('and the sentence NAMES the source it was computed on — a headline that '
  + 'said "the blend" while the board was ranked on CBS is worse than no label',
  /Highest VONA on the blend/.test(vBlend.why), { why: vBlend.why.slice(0, 160) });

ck('and it quotes the VONA number, so the claim is checkable against the '
  + 'position blocks rather than taken on trust',
  vBlend.why.indexOf(tvBlend.v.toFixed(1)) >= 0, { why: vBlend.why.slice(0, 200) });

/* ── 2. IT FOLLOWS THE SOURCE TOGGLE ──────────────────────────────────────── */

const perSource = [];
SB.SOURCES.forEach(s => {
  const sc = scoredAt(PICK, IDX, s.key);
  if (sc.length < 20) return;
  const tv = topVona(sc);
  const v = V.derive({ cfg: E.CFG, scored: sc, confidence: { level: 'none', gap: 0, message: '' },
    roster: kept.slice(), sourceLabel: s.label });
  perSource.push({ key: s.key, label: s.label, headline: v.pick && v.pick.name,
    expect: tv && tv.p.name, why: v.why, ok: !!(v.pick && tv
      && String(v.pick.player_id) === String(tv.p.player_id)) });
});

ck('CONTROL: several sources produced a scored board — one source would make '
  + 'the "it moves" check below untestable',
  perSource.length >= 5, { sources: perSource.length });

ck('the headline is the top-VONA player under EVERY source, not just the blend',
  perSource.every(r => r.ok),
  { wrong: perSource.filter(r => !r.ok).map(r => r.key + ': ' + r.headline + ' != ' + r.expect) });

ck('each source\'s sentence names ITS OWN label — this is the frozen-field '
  + 'defect in the one panel Cory reads every eight seconds',
  perSource.every(r => r.why.indexOf('Highest VONA on ' + r.label) >= 0),
  { first: perSource.filter(r => r.why.indexOf('Highest VONA on ' + r.label) < 0)
      .slice(0, 2).map(r => r.key + ': ' + r.why.slice(0, 90)) });

/* ── 3. THE FULL MODEL'S ANSWER IS NOT SILENTLY DROPPED ───────────────────── */
/* The ruling removes need/keeper/stack from the headline while the rest of the
 * board still ranks on them. Two different answers on one screen with nothing
 * explaining the gap is the failure this project keeps producing, so when they
 * disagree the sentence must say so BY NAME. */
const disagreeing = perSource.concat([{ key: 'blend', label: 'the blend',
  why: vBlend.why }]).filter(r => /The full model — VONA plus need/.test(r.why));
const agreeing = perSource.concat([{ key: 'blend', why: vBlend.why }])
  .filter(r => /The full model agrees/.test(r.why));

ck('CONTROL: every sentence takes ONE of the two branches — a row in neither '
  + 'means the disagreement clause was skipped silently',
  disagreeing.length + agreeing.length === perSource.length + 1,
  { disagree: disagreeing.length, agree: agreeing.length, of: perSource.length + 1 });

ck('when the composite would have taken someone else, the sentence NAMES him '
  + 'and says the headline is VONA-only by Cory\'s ruling — measured 08-21, '
  + 'the two answers agree in only 11 of 54 source x pick cells, so this '
  + 'branch is the common case and not an edge',
  disagreeing.length >= 1 && disagreeing.every(r => /you ruled the headline to VONA alone/.test(r.why)),
  { n: disagreeing.length, sample: (disagreeing[0] || {}).why });

/* ── 4. THE OLD HEADLINE IS ONE ARGUMENT AWAY ─────────────────────────────── */
/* Not a nicety: it is how this gets reverted mid-draft if Cory changes his mind
 * with the clock running, and it is what makes the change reviewable at all. */
const vOff = V.derive({ cfg: E.CFG, scored: blendScored,
  confidence: { level: 'none', gap: 0, message: '' }, roster: kept.slice(),
  vonaHeadline: false });
ck('CONTROL: the composite arm returns a pick too, so the comparison below is '
  + 'between two real answers',
  vOff && vOff.pick, {});
ck('`vonaHeadline: false` restores the COMPOSITE headline exactly — the escape '
  + 'hatch if Cory reverses this with the clock running',
  String(vOff.pick.player_id) === String(blendScored[0].player.player_id),
  { composite: vOff.pick.name, expect: blendScored[0].player.name });

ck('FAIL ARM — and the two arms genuinely DISAGREE on this board, so the check '
  + 'above is discriminating rather than passing on two identical answers. '
  + '(If this ever goes red because they agree, that is information, not a '
  + 'defect: re-measure the 20% before reading it as a break.)',
  String(vOff.pick.player_id) !== String(vBlend.pick.player_id),
  { vona: vBlend.pick.name, composite: vOff.pick.name });

console.log('\nblend  headline: ' + vBlend.pick.name + '  (composite would take: '
  + vOff.pick.name + ')');
perSource.forEach(r => console.log('  ' + r.label.padEnd(14) + r.headline));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
