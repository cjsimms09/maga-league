// TERRITORY: A
/* WHICH SCORING TERMS ACTUALLY MOVE CORY'S PICKS — BEFORE AND AFTER THE VONA FIX.
 *
 * Cory, 2026-08-19: *"can we keep fine tuning our roster building with vona
 * correct now."* The first thing to know before tuning anything is WHICH LEVERS
 * ARE CONNECTED, and that changed this morning.
 *
 * ── WHY THIS IS NOT A REPEAT OF `engine_ablation.js` ──────────────────────
 * That tool ablates terms and reports score deltas across a board. This one
 * asks the only question a drafter cares about: **at Cory's fifteen real picks,
 * with his real keepers and his real schedule, does zeroing this term change
 * what the tool tells him to do?** A term can move a thousand scores and change
 * no pick, and a term can move few scores and flip a first-rounder. Score
 * movement is not participation.
 *
 * ── THE MEASUREMENT THAT MOTIVATED IT ─────────────────────────────────────
 * Zeroing the KEEPER weight changed the top 10 at **0 of 15** picks under the
 * pre-fix engine and **12 of 15** after. The keeper term was not weak — it was
 * being swamped by VONA magnitudes that priced urgency for players who were
 * certainly going to still be there. A term reported as inert may have been a
 * term nobody could hear.
 *
 * ── IT REPORTS. IT DOES NOT TUNE. ─────────────────────────────────────────
 * No weight is selected or changed here (no_fit_guard). This says which dials
 * are connected; which way to turn them is a graded question.
 *
 * ⚠️ WHAT IT CANNOT SAY: the room is drained in strict ADP order, which the
 * real room will not be. This measures the SHAPE of the engine's own
 * dependence on each term, not what happens on the 22nd.
 *
 * Run: node draft/tools/term_participation.js [--json <path>]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

global.window = global;
global.document = { getElementById: () => null, querySelector: () => null, addEventListener: () => {} };

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const KEEP = require(path.join(__dirname, 'keepers_of.js'));

const ARMS = {
  a0: { VONA_INCLUDE_SELF: false, VONA_SURVIVAL_RESCALE: false },  // pre-fix
  a1: { VONA_INCLUDE_SELF: true,  VONA_SURVIVAL_RESCALE: false },  // shipped
};
const SCHED = [8, 13, 28, 33, 48, 53, 68, 73, 88, 93, 108, 113, 128, 133, 148];
const BASE = E.MEASURED_WEIGHTS || E.DEFAULT_WEIGHTS;

const keep = KEEP.keepersFrom(DATA);
const pool = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));

function setArm(arm) { Object.keys(ARMS[arm]).forEach(k => { E.CFG[k] = ARMS[arm][k]; }); }

/* ONE GREEDY WALK. The roster ADVANCES on the tool's own pick, because the
 * question is what a drafter following it ends up holding — a walk that always
 * resets to the same roster measures a board, not a draft. */
function walk(weights) {
  const taken = new Set(keep.map(k => String(k.player_id)));
  const roster = keep.map(k => Object.assign({}, k, { is_keeper: true }));
  const picks = [], tops = [];
  SCHED.forEach((pk, i) => {
    let need = (pk - 1) - (taken.size - keep.length);
    for (let j = 0; j < byAdp.length && need > 0; j++) {
      const p = byAdp[j];
      if (taken.has(String(p.player_id))) continue;
      taken.add(String(p.player_id)); need--;
    }
    const board = pool.filter(p => !taken.has(String(p.player_id)));
    const ctx = {
      board: board, roster: roster, nextPick: SCHED[i + 1] || null,
      currentPick: pk, pick: pk, round: Math.ceil(pk / (DATA.league.teams || 10)),
      myPicksLeft: SCHED.length - i, myPickIndex: i, totalMyPicks: SCHED.length,
      totalPicks: 150, league: DATA.league, weights: weights,
      currentKeepers: roster.filter(p => p.is_keeper),
      ceilingAllStages: false, doctrine: null, drift: null,
      intervening: (SCHED[i + 1] || pk) - pk,
    };
    const out = E.recommend(ctx);
    const list = Array.isArray(out) ? out : (out && out.scored) || [];
    tops.push(list.slice(0, 10).map(x => String(x.player.player_id)).join(','));
    const t = list[0];
    if (!t || !t.player) { picks.push(null); return; }
    taken.add(String(t.player.player_id));
    roster.push(Object.assign({}, t.player));
    picks.push({ pick: pk, id: String(t.player.player_id),
                 name: t.player.name, pos: t.player.position });
  });
  const counts = {};
  roster.filter(p => !p.is_keeper).forEach(p => { counts[p.pos || p.position] = (counts[p.pos || p.position] || 0) + 1; });
  return { picks: picks, tops: tops, counts: counts };
}

const TERMS = Object.keys(BASE);
const report = {
  _territory: 'TERRITORY: A — draft/tools/term_participation.js',
  _note: 'REPORT ONLY, selects nothing. "Participates" = zeroing the term '
       + 'changes what the tool would TELL CORY TO DO at his own picks — not '
       + 'that it moves scores. Room drained in strict ADP order, which the '
       + 'real room will not be.',
  board_built_at: DATA.built_at || null,
  weights: BASE,
  schedule: SCHED,
  arms: {},
};

['a0', 'a1'].forEach(arm => {
  setArm(arm);
  const base = walk(BASE);
  const rows = TERMS.map(term => {
    if (!BASE[term]) return { term: term, weight: BASE[term], shipped_off: true };
    const w = Object.assign({}, BASE, {}); w[term] = 0;
    const alt = walk(w);
    let picksChanged = 0, topsChanged = 0;
    for (let i = 0; i < SCHED.length; i++) {
      const a = base.picks[i], b = alt.picks[i];
      if ((a && a.id) !== (b && b.id)) picksChanged++;
      if (base.tops[i] !== alt.tops[i]) topsChanged++;
    }
    return { term: term, weight: BASE[term], shipped_off: false,
             picks_changed: picksChanged, top10_changed: topsChanged,
             roster_without: alt.counts };
  });
  report.arms[arm] = { baseline_roster: base.counts,
                       baseline_picks: base.picks.map(p => p ? p.pos + ' ' + p.name : null),
                       terms: rows };
});
setArm('a1');   // leave the engine as it ships

console.log('TERM PARTICIPATION AT CORY\'S 15 PICKS — board ' + report.board_built_at);
console.log('weights: ' + JSON.stringify(BASE) + '\n');
console.log('  term        w      a0 picks / top10      a1 picks / top10   (a0 = pre-fix, a1 = shipped)');
console.log('  ' + '-'.repeat(84));
TERMS.forEach(t => {
  const r0 = report.arms.a0.terms.find(x => x.term === t);
  const r1 = report.arms.a1.terms.find(x => x.term === t);
  if (r0.shipped_off) {
    console.log('  ' + t.padEnd(11) + String(BASE[t]).padEnd(6)
      + '  — shipped at weight 0, nothing to zero —');
    return;
  }
  const f = r => String(r.picks_changed) + '/' + SCHED.length + '  ' + String(r.top10_changed) + '/' + SCHED.length;
  const woke = (r0.picks_changed === 0 && r1.picks_changed > 0) ? '   <-- WOKE UP'
             : (r0.picks_changed > 0 && r1.picks_changed === 0) ? '   <-- WENT SILENT' : '';
  console.log('  ' + t.padEnd(11) + String(BASE[t]).padEnd(6)
    + '  ' + f(r0).padEnd(20) + '  ' + f(r1).padEnd(18) + woke);
});
console.log('\n  roster the tool builds (non-keeper picks):');
console.log('    a0 pre-fix : ' + JSON.stringify(report.arms.a0.baseline_roster));
console.log('    a1 shipped : ' + JSON.stringify(report.arms.a1.baseline_roster));

const outPath = (() => { const i = process.argv.indexOf('--json'); return i >= 0 ? process.argv[i + 1] : null; })();
if (outPath) { fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); console.log('\nwrote ' + outPath); }
module.exports = { report };
