/* Turn replays into the report the spec asks for, with the pre-registration
 * written into the code rather than recalled afterwards.
 *
 * THE PRE-REGISTERED EXPECTATION, fixed here before any result exists:
 *   Edge should concentrate in rounds 3-9, where ADP is noisiest.
 *   Round 1 should be near zero — the top of the board is the one place the
 *   market is genuinely efficient and there is little to disagree about.
 *   A LARGE ROUND-1 EDGE IS A BUG ALARM, NOT AN INSIGHT. It is far more likely
 *   to be a leak than a discovery, and this file says so in the output rather
 *   than leaving it to whoever reads the table.
 */
'use strict';
const R = require('./replay.js');

const PREREG = {
  EDGE_ROUNDS: [3, 9],
  ROUND1_ALARM: 8.0,        // points/pick in round 1 above which we suspect a leak
  BAR_PER_DRAFT: 10.0,      // the spec's bar: under this, sophistication is not paying
};

function fmt(n, d) { return (n == null ? '—' : Number(n).toFixed(d == null ? 2 : d)); }

function render(graded, cal, meta) {
  const L = [];
  const h = graded.headline;
  L.push('='.repeat(78));
  L.push('HISTORICAL BACKTEST — does the composite beat ADP on our own drafts?');
  L.push('='.repeat(78));
  L.push('');
  L.push('git HEAD        ' + (meta.git_head || '?'));
  L.push('seasons         ' + (meta.seasons || []).join(', '));
  L.push('graded picks    ' + graded.graded_picks + '  (rounds 1-' + (meta.max_round || 12) + ')');
  L.push('');

  L.push('--- 1. HEADLINE ---');
  L.push('  mean actual points of the recommended player');
  L.push('    B0  ADP                 ' + fmt(h.b0_mean));
  L.push('    B1  projected points    ' + fmt(h.b1_mean));
  L.push('    B2  VORP                ' + fmt(h.b2_mean));
  L.push('    B3  full composite      ' + fmt(h.b3_mean));
  L.push('  B3 - B0 per pick          ' + fmt(h.mean_gain_per_pick) + '  +/- ' + fmt(h.ci95_per_pick));
  L.push('  B3 - B0 per draft         ' + fmt(h.mean_gain_per_draft) + '  +/- ' + fmt(h.ci95_per_draft)
         + '   (n=' + h.drafts_counted + ' drafts)');
  const beatsBar = h.mean_gain_per_draft >= PREREG.BAR_PER_DRAFT;
  const ciCrossesZero = Math.abs(h.mean_gain_per_draft) < h.ci95_per_draft;
  L.push('');
  L.push('  VERDICT AGAINST THE PRE-REGISTERED BAR (' + PREREG.BAR_PER_DRAFT + ' pts/draft):');
  if (ciCrossesZero) {
    L.push('    INCONCLUSIVE. The confidence interval crosses zero, so this sample');
    L.push('    cannot distinguish the composite from ADP in either direction.');
    L.push('    That is a statement about N, not a verdict on the model.');
  } else if (!beatsBar) {
    L.push('    BELOW THE BAR. The composite gains ' + fmt(h.mean_gain_per_draft) + ' points per draft,');
    L.push('    under the ' + PREREG.BAR_PER_DRAFT + ' the spec set. Said plainly: on this evidence the');
    L.push('    sophistication is not paying for itself. That is a finding, not a failure.');
  } else {
    L.push('    CLEARS THE BAR at ' + fmt(h.mean_gain_per_draft) + ' points per draft.');
  }
  // B2 is the diagnostic that separates "the value model works" from
  // "everything layered on top of it works".
  if (h.b2_mean != null && h.b3_mean <= h.b2_mean) {
    L.push('');
    L.push('    NOTE: B3 does not beat plain VORP (B2). Whatever edge exists is in the');
    L.push('    value model, not in the survival/tier/need machinery above it.');
  }
  L.push('');

  L.push('--- 2. THE DISAGREEMENT SUBSET (where the model claims edge) ---');
  const d = graded.disagreement;
  L.push('  picks where B3 != B0      ' + d.n + '  (' + fmt(100 * d.share_of_picks, 1) + '% of graded)');
  L.push('  win rate on those         ' + (d.win_rate == null ? '—' : fmt(100 * d.win_rate, 1) + '%'));
  L.push('  mean gain on those        ' + fmt(d.mean_gain) + '  +/- ' + fmt(d.ci95));
  L.push('  (Picks where the two agree cannot show edge either way — this is the');
  L.push('   honest denominator, and it is always smaller than the headline sample.)');
  L.push('');

  L.push('--- 3. PER ROUND ---');
  L.push('  round      n   mean gain      95% CI');
  graded.per_round.forEach(r => {
    L.push('  ' + String(r.round).padStart(5) + String(r.n).padStart(7)
           + fmt(r.mean_gain).padStart(12) + ('+/- ' + fmt(r.ci95)).padStart(13));
  });
  const r1 = graded.per_round.find(r => r.round === 1);
  L.push('');
  L.push('  PRE-REGISTERED EXPECTATION (written before any result): edge concentrates');
  L.push('  in rounds ' + PREREG.EDGE_ROUNDS.join('-') + ', near zero in round 1.');
  if (r1 && Math.abs(r1.mean_gain) > PREREG.ROUND1_ALARM) {
    L.push('  ** BUG ALARM ** round 1 shows ' + fmt(r1.mean_gain) + ' points/pick, past the '
           + PREREG.ROUND1_ALARM + ' threshold.');
    L.push('  The top of the board is where the market is most efficient. An edge this');
    L.push('  large there is more likely a leak than an insight. Investigate the AsOf');
    L.push('  store and the projection fit BEFORE believing any number in this report.');
  } else if (r1) {
    L.push('  Round 1 is ' + fmt(r1.mean_gain) + ' points/pick — consistent with the expectation.');
  }
  L.push('');

  L.push('--- 4. SURVIVAL CALIBRATION ---');
  L.push('  Does "70% likely to last" mean he lasted 70% of the time?');
  L.push('  bucket        n   predicted   actual    error');
  (cal || []).forEach(b => {
    L.push('  ' + b.bucket.padEnd(10) + String(b.n).padStart(5)
           + fmt(b.predicted_mid).padStart(12) + (b.actual_rate == null ? '—' : fmt(b.actual_rate)).padStart(9)
           + (b.error == null ? '—' : fmt(b.error)).padStart(9));
  });
  L.push('  (positive error = too pessimistic; negative = overconfident.)');
  L.push('  This is the empirical answer on adp_sd and the need-aware layer, and it');
  L.push('  is worth more than the headline: the headline is one number on three');
  L.push('  drafts, this is thousands of individual predictions.');
  L.push('');

  L.push('--- 5. MODEL vs HUMAN ---');
  const v = graded.vs_human;
  L.push('  picks where B3 disagreed with the manager  ' + v.n);
  L.push('  B3 scored more often                       ' + (v.win_rate == null ? '—' : fmt(100 * v.win_rate, 1) + '%'));
  L.push('  mean gain over the human                   ' + fmt(v.mean_gain) + '  +/- ' + fmt(v.ci95));
  L.push('  (Includes my own picks. Seeds the override analysis with real history.)');
  L.push('');

  L.push('--- 6. CAVEATS (mandatory) ---');
  (meta.caveats || []).forEach(c => L.push('  * ' + c));
  L.push('  * Sample: ' + h.drafts_counted + ' drafts. Confidence intervals above are the');
  L.push('    finding, not decoration. Do NOT read per-weight conclusions out of this.');
  L.push('  * Projections are era-appropriate reconstructions, not archived forecasts.');
  L.push('    This grades the DECISION MACHINERY on plausible inputs; it is not a test');
  L.push('    of projection accuracy and must not be cited as one.');
  (meta.methods || []).forEach(m => L.push('  * ' + m.season + ' used ' + m.method
    + ' (spearman vs ADP ' + fmt(m.spearman) + ')'));
  L.push('='.repeat(78));
  return L.join('\n');
}

module.exports = { PREREG, render };
