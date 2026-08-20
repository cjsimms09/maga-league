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
 * ── ⛔ THIS IS A CLI STUDY TOOL. IT MUST NOT BE WIRED INTO THE WAR ROOM. ──
 *
 * B flagged this on 2026-08-20 (ROUTES, TO: A) as a side-door reintroduction
 * of own_v6 against Cory's ruling. CHECKED RATHER THAN ASSUMED, and the flag
 * is half right, so both halves are written down here:
 *
 *   · WRONG about the ruling as it applies to THIS FILE. Cory, CORY-ASKS ④,
 *     2026-08-19, verbatim: "V6 should still be used to predict and study just
 *     not part of warroom this year." A command-line study tool is the
 *     permitted half of that sentence, not the forbidden half. Verified there
 *     is no UI wiring: the only reference to this filename anywhere in the
 *     tree is its own usage line, and nothing in `public/` fetches its output
 *     (it has none — it prints to stdout).
 *   · RIGHT about the risk, which is why this block exists. `source_boards.js`
 *     is the WAR-ROOM surface for this question and own_v6 is deliberately
 *     absent from it. If the dissent-rate and coverage handling below are ever
 *     worth having on the page, PORT THEM INTO `source_boards.js` and DROP the
 *     `ownmodel` row on the way across — do not mount this file, and do not
 *     add own_v6 to the surface that already excludes it. One surface per
 *     question.
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

/* ⚠️ ADP IS A SOURCE, AND IT WAS THE ONE MISSING (Cory, 2026-08-20: "should we
 * incorporate ADP as well?").
 *
 * It is not a projection, which is exactly why it belongs here. The other four
 * are forecasts of what a player will score; ADP is a REVEALED PREFERENCE — what
 * ten thousand drafters actually did with their picks. On the question this
 * table answers ("who is the best player available right now"), the market's
 * own answer is a fifth opinion and arguably the hardest one to dismiss.
 *
 * It is also already the backbone of the availability half of the model:
 * survival is ADP-driven (`adp_source: fantasypros` on 198 of the top 200), so
 * the board has been USING it to decide who is gone while never SHOWING it as
 * an opinion about who is good. Those are two different uses of one number and
 * only one of them was on screen.
 *
 * RANKED, NOT SCORED. ADP has no points, so it enters the comparison the same
 * way everything else does — by rank within position — which is the reason this
 * whole table is rank-based and not points-based. No conversion, no scale
 * question, nothing to get wrong. */
const SOURCES = [
  { key: 'ds', label: 'Draft Sharks' },
  { key: 'fantasypros', label: 'FantasyPros' },
  { key: 'sleeper', label: 'Sleeper' },
  { key: 'adp', label: 'ADP (market)' },
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
/* ADP's within-position rank, computed once per board rather than per player —
 * the same ordering `bestBySource` uses, so the table and the rate cannot
 * disagree about what the market thinks. */
let _adpRank = null;
function buildAdpRank(board) {
  _adpRank = {};
  const byPos = {};
  board.forEach(p => { (byPos[p.position] = byPos[p.position] || []).push(p); });
  Object.keys(byPos).forEach(pos => {
    byPos[pos].filter(p => adp(p) < 9999).sort((a, b) => adp(a) - adp(b))
      .forEach((p, i) => { _adpRank[String(p.player_id)] = i + 1; });
  });
}
function adpRank(p) {
  return _adpRank ? _adpRank[String(p.player_id)] : null;
}

/* ⚠️ THE RATE IS COMPUTED OVER `draftable_scope`, NOT THE WHOLE BOARD, AND THAT
 * WAS A REAL BUG FOR ABOUT TEN MINUTES.
 *
 * Called with the full live board — 671 players — the denominator fills with
 * hundreds of deep players no source covers, every rate collapses toward zero,
 * and the tool printed "Our model dissents (0% of the time, so worth reading)".
 * Confidently wrong, not crashed. The only reason I caught it is that the same
 * quantity had measured 6.1% ten minutes earlier and I remembered the number.
 *
 * Measured both ways, so the size of the error is on the record rather than
 * asserted: over the top 200 the rates are ds 0.5%, FP 0.0%, Sleeper 1.0%,
 * ADP 1.0%, our model 5.6%. Over the whole board they round to zero.
 *
 * This is the third time tonight that a number was wrong because of the
 * population it was taken over rather than the arithmetic on it. */
function dissentRates(board) {
  buildAdpRank(board);
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
        /* ⚠️ ADP MUST ENTER AS A WITHIN-POSITION RANK, NOT AS A RAW ADP VALUE.
         * My first version put `adp(p)` straight in beside the other sources'
         * `pos_rank_*` integers — two different scales in one equality test, so
         * "the others all agree and this one differs" became true almost never
         * and every dissent rate collapsed to 0.0%. It printed as "our model
         * dissents 0% of the time, so worth reading", which is the confident
         * wrong answer rather than a crash: the rate had been 6.1% one minute
         * earlier and the only reason I caught it is that I remembered the
         * previous number. Ranked against its own position, like everything
         * else on this table. */
        if (s.key === 'adp') {
          const r = adpRank(p);
          if (r != null) picks.adp = r;
          return;
        }
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

/* ADP carries no `pos_rank_adp` field, so its within-position rank is derived
 * here from the same `adjusted_adp` the survival model uses. Deriving it rather
 * than adding a board field keeps ONE definition of the market's order — the
 * board already has ten adp_* fields and an eleventh that could disagree with
 * them is the defect this repo keeps paying for. */
function bestBySource(board, pos, key) {
  if (key === 'adp') {
    const at = board.filter(p => p.position === pos && adp(p) < 9999);
    if (!at.length) return null;
    at.sort((a, b) => adp(a) - adp(b));
    return { p: at[0], covered: true };
  }
  const at = board.filter(p => p.position === pos
    && p['pos_rank_' + key] != null);
  if (!at.length) return null;
  at.sort((a, b) => a['pos_rank_' + key] - b['pos_rank_' + key]);
  const p = at[0];
  return { p: p, covered: !!p['covered_' + key] };
}

/* ⚠️ THE BASE RATE IS TAKEN ONCE, OVER A FIXED REFERENCE POPULATION, AND THAT
 * TOOK THREE WRONG ANSWERS TO GET RIGHT.
 *
 * It was computed per-pick against the LIVE board, which shrinks as players are
 * drafted. At pick 33 the top 32 by ADP are already gone — and those are exactly
 * the elite players where our model's shrinkage disagreement is largest — so the
 * rate legitimately measured 0.0% there, and the tool printed "Our model
 * dissents (0% of the time, so worth reading)" while the stable figure is 5.6%.
 *
 * NOT A BUG IN THE ARITHMETIC. Every version of this computed exactly what it
 * was asked. A rate that moves as the draft proceeds is simply not a BASE rate,
 * and the sentence beside it ("so worth reading") is a claim about how often a
 * source dissents IN GENERAL. So the population is now the draftable top 200 by
 * ADP, fixed, computed once before any pick is reported.
 *
 * Two false trails first, both plausible and both wrong: a scale mismatch from
 * putting raw ADP beside pos_rank integers (real, fixed, not the cause), and
 * the whole-board denominator (real, fixed, not the cause either). The cause was
 * the population moving under the number. THIRD TIME TONIGHT a figure was wrong
 * because of what it was taken over rather than the arithmetic on it. */
const REFERENCE_RATES = dissentRates(byAdp.slice(0,
  ((L.draftable_scope || {}).focus) || 200));

function report(pick) {
  const taken = new Set(byAdp.slice(0, liveBefore(pick)).map(p => String(p.player_id)));
  (D.kept_players || []).forEach(k => taken.add(String(k.player_id)));
  const board = byAdp.filter(p => !taken.has(String(p.player_id)));
  const rates = REFERENCE_RATES;

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
