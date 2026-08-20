/* TERRITORY: A
 *
 * THE DISAGREEMENT PANEL MUST NOT LIE, AND THE TWO WAYS IT COULD ARE SPECIFIC.
 *
 * Cory, 2026-08-20: "let me know when sources disagree... clean, easy to
 * understand".
 *
 *   1. IT COULD DRAW ABSENCE AS AGREEMENT. A player only two sources project
 *      has no measurable agreement. If THIN ever renders like AGREE — or worse,
 *      renders as nothing, which is how AGREE renders — the panel would be
 *      telling Cory the sources concur when in fact nobody asked three of them.
 *      This is the single most likely way for it to mislead, and it is the same
 *      failure this session already fixed twice (a source button reading 247
 *      because coverage was counted over all 700; a keeper priced on a table
 *      nobody else used).
 *
 *   2. IT COULD FLAG SO MUCH THAT THE FLAG STOPS MEANING ANYTHING. Our model is
 *      the lone dissenter on 63 of 83 dissents. Badging all of them puts a mark
 *      on a third of the board, and a mark on a third of the board is
 *      decoration. The base rate is what makes the badge worth reading.
 *
 * Run: node draft/tests/source_agreement_is_honest.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DOC_PATH = path.join(ROOT, 'public', 'source_agreement.json');
const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

let pass = 0;
const fails = [];
const check = (n, ok, d) => {
  if (ok) { pass++; return; }
  fails.push(n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 240) : ''));
};

check('the artifact exists — the panel hides itself without it, but a missing '
  + 'artifact in the repo means the post-chain did not run',
  fs.existsSync(DOC_PATH));
if (!fs.existsSync(DOC_PATH)) {
  fails.forEach(f => console.log('  FAILED  ' + f)); process.exit(1);
}
const D = JSON.parse(fs.readFileSync(DOC_PATH, 'utf8'));

/* ── 1. IT IS BUILT ON RANKS, NOT POINTS, AND SAYS WHY ──────────────────── */

check('every judged player carries per-source RANKS, not projections',
  D.players.every(p => p.ranks && typeof p.ranks === 'object'));
check('the artifact records WHY rank and not points, so the choice is auditable',
  typeof D._why_rank_not_points === 'string' && D._why_rank_not_points.length > 60);
check('it is scoped to Cory\'s ruling rather than a cutoff of its own',
  !!(D.draftable_scope && D.draftable_scope.outer), D.draftable_scope);

/* THE RANKS MUST COME FROM THE PER-SOURCE BOARDS, not be recomputed here.
 * Verified against the artifacts themselves, spot-checked across every source. */
{
  const boards = {};
  ['ds', 'sleeper', 'own', 'fp'].forEach(k => {
    const p = path.join(ROOT, 'public', 'board_' + k + '.json');
    if (fs.existsSync(p)) {
      boards[k] = {};
      JSON.parse(fs.readFileSync(p, 'utf8')).players
        .forEach(pl => { boards[k][String(pl.player_id)] = pl.pos_rank; });
    }
  });
  let checked = 0;
  const wrong = [];
  D.players.forEach(r => {
    Object.keys(r.ranks || {}).forEach(k => {
      if (!boards[k]) return;
      checked++;
      if (boards[k][r.player_id] !== r.ranks[k]) {
        wrong.push(r.name + '/' + k + ': ' + r.ranks[k] + ' vs board '
          + boards[k][r.player_id]);
      }
    });
  });
  check('every rank matches the per-source board it came from — nothing is '
    + 're-ranked here (rule 11)', wrong.length === 0, wrong.slice(0, 4));
  check('CONTROL — enough ranks were actually compared for that to mean anything',
    checked > 400, checked);
}

/* ── 2. ABSENCE IS NEVER AGREEMENT ──────────────────────────────────────── */

const thin = D.players.filter(p => p.state === 'THIN');
check('THIN exists on this board, so the rule below is not vacuous',
  thin.length > 0, thin.length);
check('every THIN player really does have fewer than three sources',
  thin.every(p => Object.keys(p.ranks || {}).length < 3),
  thin.filter(p => Object.keys(p.ranks || {}).length >= 3).slice(0, 3).map(p => p.name));
check('and no player with three or more sources is called THIN',
  D.players.filter(p => Object.keys(p.ranks || {}).length >= 3
    && p.state === 'THIN').length === 0);
check('AGREE is never assigned to a player with fewer than three sources — '
  + 'that would be drawing absence as agreement',
  D.players.filter(p => p.state === 'AGREE'
    && Object.keys(p.ranks || {}).length < 3).length === 0,
  D.players.filter(p => p.state === 'AGREE'
    && Object.keys(p.ranks || {}).length < 3).slice(0, 3).map(p => p.name));

/* THE UI HALF: AGREE renders nothing, so THIN must NOT also render nothing. */
{
  const a = APP.indexOf('function agreementBadge');
  const b = APP.indexOf('\n  function ', a + 10);
  const src = APP.slice(a, b > a ? b : a + 4000);
  check('agreementBadge() found', src.length > 200);

  /* ⚠️ EXECUTED, NOT GREPPED — and the first version of this block was grepped
   * and was fooled. It asserted that the strings `state === 'THIN'` and
   * `agr-thin` appear in the function. Planting the exact defect this file
   * exists to catch — an early `return '';` in the THIN branch, leaving the
   * mark's dead code below it — left both strings present, so the check PASSED
   * while THIN rendered exactly like AGREE, which is absence drawn as
   * agreement. A regex proves a string exists; only running the function proves
   * the string is REACHED. */
  const badge = (function () {
    const stubs = {
      escapeHtml: s => String(s).replace(/[&<>"]/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
      state: { agreeById: {
        agree: { state: 'AGREE', ranks: { ds: 1, sleeper: 1, own: 1, fp: 1 } },
        thin: { state: 'THIN', ranks: { ds: 4, sleeper: 5 } },
        split: { state: 'SPLIT', ranks: { ds: 10, sleeper: 40, own: 25, fp: 60 } },
        rare: { state: 'DISSENT', dissenter: 'ds', dissenter_base_rate_pct: 1.4,
          ranks: { ds: 60, sleeper: 12, own: 14, fp: 13 } },
        routine: { state: 'DISSENT', dissenter: 'own', dissenter_base_rate_pct: 29.6,
          ranks: { ds: 12, sleeper: 14, own: 60, fp: 13 } },
      },
      sourceAgreement: { sources: { ds: 'Draft Sharks', sleeper: 'Sleeper',
        own: 'our model', fp: 'FantasyPros' } } },
    };
    // eslint-disable-next-line no-new-func
    return new Function('escapeHtml', 'state', src + '; return agreementBadge;')(
      stubs.escapeHtml, stubs.state);
  }());

  const out = k => badge({ player_id: k, position: 'WR' });
  check('AGREE draws NOTHING — silence is the signal', out('agree') === '',
    out('agree'));
  check('THIN draws a mark of its own, so absence cannot be read as agreement',
    out('thin') !== '' && /agr-thin/.test(out('thin')), out('thin'));
  check('and the THIN mark SAYS it is absence rather than agreement',
    /absence, not agreement/i.test(out('thin')), out('thin'));
  check('SPLIT draws the loudest mark',
    /agr-split/.test(out('split')), out('split'));
  check('a RARE dissent is shown, and NAMES the source',
    /agr-dissent/.test(out('rare')) && /Draft Sharks/.test(out('rare')), out('rare'));
  check('a ROUTINE dissent is suppressed — a mark on a third of the board is '
    + 'decoration', out('routine') === '', out('routine'));
  check('KNOWN NEGATIVE: an unknown player draws nothing rather than throwing',
    badge({ player_id: 'nobody', position: 'WR' }) === '');
}

/* ── 3. THE BASE RATE IS PUBLISHED AND USED ─────────────────────────────── */

check('the artifact publishes how often each source is the lone dissenter',
  !!D.dissent_base_rate_pct
  && Object.keys(D.dissent_base_rate_pct).length === Object.keys(D.sources).length,
  D.dissent_base_rate_pct);
check('every dissent carries its dissenter\'s base rate, so a reader can weigh it',
  D.players.filter(p => p.state === 'DISSENT')
    .every(p => typeof p.dissenter_base_rate_pct === 'number'));

/* KNOWN POSITIVE: the base rates must actually DIFFER, or weighting by them is
 * ceremony. Measured: our model 29.6%, Draft Sharks 1.4%. */
{
  const rates = Object.values(D.dissent_base_rate_pct).filter(v => typeof v === 'number');
  check('KNOWN POSITIVE: the sources dissent at genuinely different rates, which '
    + 'is what makes weighting by the rate worth doing',
    Math.max.apply(null, rates) - Math.min.apply(null, rates) >= 10,
    D.dissent_base_rate_pct);
}

check('the badge suppresses a dissent from a source that dissents often — '
  + 'a mark on a third of the board is decoration',
  /rate == null \|\| rate > 10\) return ''/.test(APP));

/* ── 4. THE ROUTINE ONES ARE DEMOTED, NOT DELETED ───────────────────────── */
{
  const a = APP.indexOf('function renderSourceAgreement');
  const b = APP.indexOf('\n  function ', a + 10);
  const src = APP.slice(a, b > a ? b : a + 9000);
  check('renderSourceAgreement() found', src.length > 500);
  check('the routine dissents are still REACHABLE, behind a fold — hiding them '
    + 'would be a different claim than "these are usually uninformative"',
    /<details/.test(src) && /routine/.test(src));
  check('the panel states what THIN means where it cannot be missed',
    /absence, never agreement/i.test(src));
  check('the panel explains rank-not-points on its face',
    /not on one points scale|not projected\s*\n?\s*.\s*points|positional rank/i.test(src));
}

/* ── 5. NO TYPED THRESHOLD ──────────────────────────────────────────────── */

check('the per-position baseline is DERIVED from this board and published',
  !!D.position_baseline_spread
  && Object.keys(D.position_baseline_spread).length >= 4,
  D.position_baseline_spread);
/* KNOWN POSITIVE: the baselines must differ by position, otherwise a single
 * typed number would have done and the derivation is decoration. Measured:
 * WR 17 vs DEF 4. */
{
  const v = Object.values(D.position_baseline_spread);
  check('KNOWN POSITIVE: positions really do have different spreads, so a single '
    + 'absolute threshold would have flagged every WR and no DEF',
    Math.max.apply(null, v) >= 2 * Math.min.apply(null, v), D.position_baseline_spread);
}

/* ── 6. THE COUNTS ADD UP ───────────────────────────────────────────────── */

check('the published counts account for every player in the artifact',
  Object.values(D.counts).reduce((a, b) => a + b, 0) === D.players.length,
  { counts: D.counts, players: D.players.length });

console.log('\n  WHERE THE SOURCES DISAGREE — is the panel honest?\n');
console.log('    ' + Object.keys(D.counts).map(k => D.counts[k] + ' ' + k.toLowerCase()).join(' · '));
console.log('    lone-dissenter rate: ' + Object.keys(D.dissent_base_rate_pct)
  .map(k => (D.sources[k] || k) + ' ' + D.dissent_base_rate_pct[k] + '%').join(' · ') + '\n');
if (fails.length) {
  fails.forEach(f => console.log('  FAILED  ' + f));
  console.log('\n  ' + pass + ' passed, ' + fails.length + ' FAILED\n');
  process.exit(1);
}
console.log('  ' + pass + ' checks passed\n');
