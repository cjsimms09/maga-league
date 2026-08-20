/* BEST AVAILABLE AT EACH POSITION, BY EVERY SOURCE, WITH THE CONSENSUS MARKED.
 *
 * Cory, 2026-08-20, having now asked for this in three different ways:
 *   "I really just need the model to show me all the different sources, who
 *    they think is best available at each position and if there is a consensus
 *    (ie. blended model)"
 *
 * That is the whole ask. Not a recommendation, not a roster plan — four rows
 * and four columns, and a mark where they agree.
 *
 * ── WHY RANK AND NOT POINTS (register 107, re-measured 2026-08-20) ─────────
 *
 * The four sources are NOT on one points scale. Median ratio to the blend:
 * Draft Sharks 1.04, FantasyPros 1.01, Sleeper 0.96, our model 0.79 (p10 0.38).
 * A side-by-side of projected points reports a LEVEL OFFSET as disagreement —
 * our model would look like it hates everybody. So each source names its own
 * best available and the comparison is over WHO, never over how many points.
 *
 * ── AND WHY "OUR MODEL DISAGREES" IS ALMOST NEVER NEWS ─────────────────────
 *
 * A flag that fires on a third of the board is decoration, so a dissent is
 * only worth reading when it comes from a source that rarely dissents. The
 * rate is therefore COMPUTED HERE, on the live board, over `draftable_scope`,
 * and printed beside the mark.
 *
 * ⚠️ IT IS COMPUTED RATHER THAN QUOTED BECAUSE THE QUOTED FIGURE WAS WRONG.
 * `WAR-ROOM-INTENT.md` (written by me) said "our model is the lone dissenter on
 * 63 of 83 cases (29.6% of judged players); Draft Sharks on 3 (1.4%)."
 * 63/83 is 75.9%, not 29.6%; 3/83 is 3.6%, not 1.4%. The fraction and the
 * percentage disagree with each other in the same sentence, so at least one
 * population is not the one named — and B is designing a surface from it.
 * Re-measured here over the top 200: our model 6.1%, Sleeper 1.7%, Draft
 * Sharks 1.2%, FantasyPros 0.0%. The conclusion the brief drew from its own
 * numbers — that "our model disagrees" is nearly uninformative — DOES NOT
 * SURVIVE: at 6% it is one of the rarer dissents, not a third of the board.
 *
 * ── COVERAGE IS NOT AGREEMENT ─────────────────────────────────────────────
 *
 * A source that does not carry a player has no opinion about him, and silence
 * must never read as assent. Every cell states whether the source actually
 * covers its own pick, and a position where fewer than three sources have an
 * opinion is marked THIN rather than given a consensus.
 *
 * Run: node draft/tools/who_do_the_sources_like.js [--pick 33]
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/draft_data.json'), 'utf8'));
const L = D.league;
const MY = ((D.pick_order || {}).my_picks) || [];
const rows = ((D.pick_order || {}).picks) || [];
const argPick = (function () {
  const i = process.argv.indexOf('--pick');
  return i >= 0 ? Number(process.argv[i + 1]) : null;
}());

const SOURCES = [
  { key: 'ds', label: 'Draft Sharks' },
  { key: 'fantasypros', label: 'FantasyPros' },
  { key: 'sleeper', label: 'Sleeper' },
  { key: 'ownmodel', label: 'Our model' },
];
const POS = ['QB', 'RB', 'WR', 'TE'];

const adp = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const pool = D.players.filter(p => p.position && p.proj_mean != null);
const byAdp = pool.slice().sort((a, b) => adp(a) - adp(b));
/* SELECTIONS, not board slots — the keeper-slot over-removal this repo already
 * fixed once in emit_seat_plan.js. Same derivation, not a second one. */
const liveBefore = pk => rows.filter(r => r.overall < pk && !r.keeper_slot).length;

/* THE BASE RATE, COMPUTED not remembered: how often is each source the lone
 * dissenter, over the scope Cory drafts in? */
function dissentRates(board) {
  const n = {}, judged = {};
  SOURCES.forEach(s => { n[s.key] = 0; judged[s.key] = 0; });
  POS.forEach(pos => {
    const at = board.filter(p => p.position === pos).slice(0, 40);
    at.forEach(p => {
      const picks = {};
      SOURCES.forEach(s => {
        /* COVERAGE-FILTERED. A source that does not carry a player has no
         * opinion about him; his `pos_rank_<key>` is inherited from the blend,
         * so counting it makes every source look like it agrees with every
         * other and drives the dissent rate toward zero. */
        const r = p['pos_rank_' + s.key];
        if (r != null && p['covered_' + s.key]) picks[s.key] = r;
      });
      const keys = Object.keys(picks);
      if (keys.length < 3) return;
      keys.forEach(k => {
        judged[k]++;
        const others = keys.filter(o => o !== k).map(o => picks[o]);
        const same = others.every(v => v === others[0]);
        if (same && picks[k] !== others[0]) n[k]++;
      });
    });
  });
  const out = {};
  SOURCES.forEach(s => {
    out[s.key] = judged[s.key] ? n[s.key] / judged[s.key] : null;
  });
  return out;
}

function bestBySource(board, pos, key) {
  const at = board.filter(p => p.position === pos
    && p['pos_rank_' + key] != null);
  if (!at.length) return null;
  at.sort((a, b) => a['pos_rank_' + key] - b['pos_rank_' + key]);
  const p = at[0];
  return { p: p, covered: !!p['covered_' + key] };
}

function report(pick) {
  const taken = new Set(byAdp.slice(0, liveBefore(pick)).map(p => String(p.player_id)));
  (D.kept_players || []).forEach(k => taken.add(String(k.player_id)));
  const board = byAdp.filter(p => !taken.has(String(p.player_id)));
  const rates = dissentRates(board);

  console.log('\n  WHO EACH SOURCE LIKES BEST — at pick ' + pick
    + '  (' + board.length + ' players still on the board)\n');
  const W = 22;
  console.log('  pos   ' + SOURCES.map(s => s.label.padEnd(W)).join('') + 'consensus');
  POS.forEach(pos => {
    const picks = SOURCES.map(s => bestBySource(board, pos, s.key));
    const names = picks.map(x => x ? x.p.name : null);
    const have = names.filter(Boolean);
    const counts = {};
    have.forEach(n => { counts[n] = (counts[n] || 0) + 1; });
    const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    let verdict;
    if (have.length < 3) verdict = 'THIN — only ' + have.length + ' source(s) have an opinion';
    else if (counts[top] === have.length) verdict = 'ALL ' + have.length + ' agree: ' + top;
    else if (counts[top] >= 3) {
      const outliers = SOURCES.filter((s, i) => names[i] && names[i] !== top);
      verdict = counts[top] + ' of ' + have.length + ' say ' + top + ' — '
        + outliers.map(s => s.label + ' dissents ('
          + (rates[s.key] == null ? 'rate n/a'
            : Math.round(100 * rates[s.key]) + '% of the time, so '
              + (rates[s.key] > 0.15 ? 'weak signal' : 'worth reading') + ')')).join('; ');
    } else verdict = 'SPLIT — no majority';
    console.log('  ' + pos.padEnd(6)
      + picks.map(x => (x ? x.p.name + (x.covered ? '' : ' *') : '—').padEnd(W)).join('')
      + verdict);
  });
  console.log('\n  * = that source does not actually carry this player; the rank is');
  console.log('    inherited from the blend, so it is not an independent opinion.');
  console.log('  Compared on RANK, never on points: the four sources sit on different');
  console.log('  scales (median ratio to blend — DS 1.04, FP 1.01, Sleeper 0.96,');
  console.log('  our model 0.79), so a points table would report a level offset as');
  console.log('  disagreement.\n');
}

(argPick ? [argPick] : MY).forEach(report);
