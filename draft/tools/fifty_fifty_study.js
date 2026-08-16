// TERRITORY: A
/* THE 50/50 STUDY — the war-room-facing half: turn the measured artifact
 * (draft/data/fifty_fifty_study.json, produced by fifty_fifty_study.py under
 * the preregistration in draft/audit/edge_hunt_2026-08-16.md §1) into the
 * measured tie-break table, and hold the PREPARED (never applied) verdict.js
 * ordering.
 *
 * WHAT THIS DOES AND DOES NOT DO:
 *   - reads the committed artifact and RE-DERIVES every verdict from raw
 *     (wins, n) with its own Wilson interval — the rule-11 cross-path check:
 *     python's verdicts and this file's must agree cell for cell, held by
 *     draft/tests/fifty_fifty_study.test.js;
 *   - prints the tie-break table the war room could quote ("in 176
 *     historical toss-ups the hotter-finishing player won 58%", "age
 *     predicted nothing, n=133") with n in every sentence;
 *   - computes the PREPARED ordering for verdict.js tiebreakFacts — the
 *     measured ranking of PREDICTIVE features followed by the shipped order
 *     for everything else — and the Bonferroni-adjusted honesty line (nine
 *     features were tested; a single-feature CI that barely clears 0.5 is
 *     weaker than it looks and the table says so);
 *   - GATED: nothing imports this on any live surface. Applying the ordering
 *     to verdict.js is Cory's ruling via DECISIONS-NEEDED.md.
 *
 * Run: node draft/tools/fifty_fifty_study.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const ARTIFACT = path.join(ROOT, 'draft', 'data', 'fifty_fifty_study.json');

/* verdict.js tiebreakFacts prints facts in this fixed order today (read from
 * the shipped source: market divergence, bye overlap, age, depth chart).
 * Feature-name mapping between the study and the printed facts, for the
 * PREPARED ordering: study features that verdict.js does not print at all
 * (e.g. late_trajectory) would become NEW facts — that is exactly why the
 * diff is prepared as evidence and never auto-applied. */
const SHIPPED_TIEBREAK_ORDER = ['market', 'byes', 'age', 'depth'];

/** Wilson 95% score interval — the same arithmetic the python half uses,
 *  derived independently here (rule 11: two paths, one answer). */
function wilson(wins, n) {
  if (!(n > 0)) return { p: null, lo: null, hi: null };
  const z = 1.959963984540054;
  const p = wins / n;
  const den = 1 + z * z / n;
  const centre = (p + z * z / (2 * n)) / den;
  const half = (z / den) * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return { p, lo: centre - half, hi: centre + half };
}

/** Two-sided normal-approximation p-value for wins of n at 0.5, and its
 *  Bonferroni adjustment across the study's nine preregistered features —
 *  the honesty number printed BESIDE the preregistered verdict, never in
 *  place of it. */
function binomTwoSided(wins, n, features) {
  if (!(n > 0)) return { p_value: null, bonferroni: null };
  const z = Math.abs(wins - n / 2) / Math.sqrt(n / 4);
  // complementary normal CDF via erfc approximation (Abramowitz-Stegun 7.1.26)
  const t = 1 / (1 + 0.3275911 * (z / Math.SQRT2));
  const erfc = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741
    + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-(z * z) / 2);
  const p = Math.min(1, erfc);
  return { p_value: p, bonferroni: Math.min(1, p * features) };
}

/** Re-derive each feature's verdict from raw wins/n under the preregistered
 *  rule (pooled CI excludes 0.5 AND n >= min_n). Returns rows sorted by the
 *  study's own feature order. */
function deriveVerdicts(artifact) {
  const minN = artifact.prereg.min_n;
  const nFeatures = Object.keys(artifact.feature_table).length;
  return Object.keys(artifact.feature_table).sort().map(f => {
    const cell = artifact.feature_table[f];
    const pooled = cell.pooled;
    const w = wilson(pooled.wins, pooled.n);
    const predictive = pooled.n >= minN && w.lo !== null
      && (w.lo > 0.5 || w.hi < 0.5);
    return Object.assign({ feature: f, direction: cell.direction,
      n: pooled.n, wins: pooled.wins, predictive },
    w, binomTwoSided(pooled.wins, pooled.n, nFeatures));
  });
}

/** The measured ranking: PREDICTIVE features by |p - 0.5| descending. */
function measuredRanking(artifact) {
  return deriveVerdicts(artifact)
    .filter(r => r.predictive)
    .sort((a, b) => Math.abs(b.p - 0.5) - Math.abs(a.p - 0.5))
    .map(r => r.feature);
}

/** The PREPARED (not applied) tiebreakFacts ordering: measured PREDICTIVE
 *  features first, then the shipped order unchanged. Null when the study is
 *  a full null — no diff is prepared from nothing. */
function preparedOrdering(artifact) {
  const ranked = measuredRanking(artifact);
  if (!ranked.length) return null;
  return ranked.concat(SHIPPED_TIEBREAK_ORDER);
}

function main() {
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT, 'utf8'));
  const rows = deriveVerdicts(artifact);
  console.log('THE MEASURED TIE-BREAK TABLE — ' + artifact.prereg.audit_doc);
  console.log('(pooled over ' + Object.keys(artifact.seasons).join('/')
    + '; a null row IS the answer for that feature)\n');
  rows.forEach(r => {
    const pct = (100 * r.p).toFixed(1);
    const line = r.predictive
      ? 'in ' + r.n + ' historical toss-ups, the favored side won ' + pct
        + '% (CI ' + (100 * r.lo).toFixed(1) + '-' + (100 * r.hi).toFixed(1)
        + '%; two-sided p=' + r.p_value.toFixed(3) + ', Bonferroni x9 p='
        + r.bonferroni.toFixed(2) + ' — clears the prereg rule, NOT the '
        + 'multiplicity bar; the queue item says both)'
      : 'predicted nothing (n=' + r.n + ', ' + pct + '%)';
    console.log('  ' + r.feature.padEnd(20) + ' [' + r.direction + '] '
      + line);
  });
  const ord = preparedOrdering(artifact);
  console.log('\nPREPARED verdict.js tiebreakFacts ordering (NOT applied): '
    + (ord ? ord.join(' > ') : 'none — the study is a null, no diff exists'));
}

module.exports = { SHIPPED_TIEBREAK_ORDER, wilson, binomTwoSided,
  deriveVerdicts, measuredRanking, preparedOrdering };

if (require.main === module) main();
