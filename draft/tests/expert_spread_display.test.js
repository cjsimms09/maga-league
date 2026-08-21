// TERRITORY: A
/* EXPERT SPREAD DISPLAY — pins the "extreme for his ADP neighborhood"
 * derivation against the COMMITTED artifact (`public/expert_spread_2026.json`),
 * plus fixture-driven edge cases the real artifact can't isolate cleanly.
 *
 * WHAT THIS PINS:
 *   1. THE COMMITTED HEADLINES: the top-150 draftable-range flags measured
 *      by hand before this test was written (Bowers, Egbuka, Maye, Fannin,
 *      Brooks, Tyson, Shough, Willis — 8 players) reproduce exactly. A drift
 *      here means either the artifact changed under this test (route it) or
 *      the derivation changed (a real behavior change, not a silent one).
 *   2. RATIO, NOT RAW SPREAD, DRIVES THE FLAG: a fixture where every player
 *      has a large but UNIFORM spread (no real disagreement, just deep-bench
 *      noise) flags NOBODY — proves the neighborhood normalization is doing
 *      its job, not just thresholding on a big number.
 *   3. THE RELIABILITY FLOOR: a fixture with a genuinely extreme ratio but
 *      n_experts below MIN_N_EXPERTS does NOT flag — a spread computed on a
 *      handful of raters is sample noise, not disagreement.
 *   4. ABSENT IS NEVER A GUESS: no artifact / empty players -> index() is
 *      null -> badgeHtml() is '' for everyone, never a placeholder.
 *   5. THE BADGE IS A FACT, NEVER A NUMBER IN DISGUISE: badgeHtml() never
 *      prints spread/ratio in the visible text — only inside `title`, which
 *      is the one-tap-deeper detail, not the glance.
 *
 * Run: node draft/tests/expert_spread_display.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const ES = require(path.join(ROOT, 'public', 'js', 'draft', 'expert_spread.js'));
const ART = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'public', 'expert_spread_2026.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── 1. COMMITTED HEADLINES ──────────────────────────────────────────────────
const idx = ES.index(ART);
ck('index() builds from the committed artifact', idx !== null);

const EXPECTED_TOP150_FLAGGED = {
  '1043': 'Brock Bowers',        // rank 17
  // player_ids looked up by name below rather than hardcoded twice — the
  // headline is the NAME SET, not the ids, which are an artifact-encoding
  // detail this test should not need to know to make its point.
};
const byName = {};
(ART.players || []).forEach(p => { byName[p.name] = p; });

/* ⚠️ JORDYN TYSON WAS REMOVED FROM THIS LIST 2026-08-21, AND THE ARTIFACT IS
 * WHY, NOT THE TEST. These are COMMITTED HEADLINES — the specific names this
 * panel published to Cory — measured against an artifact that refreshes from
 * FantasyPros. When a headline stops being true the right move is to correct
 * the headline, not to keep asserting it.
 *
 * Measured before removing him, with the population rather than his one number
 * (rule 3i): the experts CONVERGED on Tyson. His spread/neighborhood-median
 * ratio is 1.197 against an EXTREME_RATIO of 1.6, and 1.197 sits around the
 * 70th percentile of the 414 indexed players — no longer a disagreement
 * headline by any reading. The other seven are all still well clear (Bowers
 * 1.750, Egbuka 1.612, Maye 1.941, Fannin 1.620, Brooks 1.903, Shough 1.626,
 * Willis 2.905), so this is one player moving, not the flag breaking.
 *
 * A LIST OF NAMES CANNOT BE THE WHOLE GUARD, which is the real lesson — it
 * drifts every time FantasyPros publishes. The property arm below it is
 * board-independent and is what should catch a broken flag. */
const NAMES = ['Brock Bowers', 'Emeka Egbuka', 'Drake Maye', 'Harold Fannin Jr.',
  'Jonathon Brooks', 'Tyler Shough', 'Malik Willis'];
NAMES.forEach(name => {
  const p = byName[name];
  ck('COMMITTED: ' + name + ' is in the artifact', !!p, name);
  if (p) {
    const e = idx[String(p.player_id)];
    ck('COMMITTED: ' + name + ' (rank ' + p.rank_ecr + ') flags extreme',
      !!(e && e.extreme), e);
  }
});

/* THE PROPERTY, so this section is not purely a snapshot of one evening. The
 * flag must stay SELECTIVE — a headline everyone earns is not a headline — and
 * it must agree with its own published threshold on every player it indexes. */
{
  const all = Object.keys(idx).map(k => idx[k]).filter(e => e && e.ratio != null);
  const flagged = all.filter(e => e.extreme);
  ck('CONTROL: the index holds enough players for a rate to mean anything',
    all.length >= 100, { indexed: all.length });
  ck('the extreme flag is SELECTIVE — it fires on a minority, so it still marks '
    + 'a player out rather than describing the field',
  flagged.length > 0 && flagged.length < all.length * 0.25,
  { flagged: flagged.length, of: all.length,
    pct: +(100 * flagged.length / all.length).toFixed(1) });
  /* ⚠️ MY FIRST VERSION OF THIS ARM WAS WRONG AND THE ARM ITSELF CAUGHT IT
   * (rule 3f). I wrote `extreme === (ratio >= EXTREME_RATIO)` and it went red on
   * three players sitting at ratios 1.71, 1.76 and 1.96 while flagged FALSE.
   * The code is right and my restatement of it was incomplete: `extreme` is
   * `reliable && ratio >= EXTREME_RATIO`, and `reliable` is a MIN_N_EXPERTS
   * floor — a wild ratio computed off a handful of experts is noise, not
   * disagreement, and the panel correctly refuses to headline it. Restating a
   * rule from memory instead of from the source is how a guard ends up
   * asserting something the code never claimed. */
  const disagree = all.filter(e =>
    e.extreme !== ((e.n_experts || 0) >= ES.MIN_N_EXPERTS && e.ratio >= ES.EXTREME_RATIO));
  ck('and every flag agrees with the published rule — reliable AND at or above '
    + 'EXTREME_RATIO — with no player flagged below it or unflagged above it',
  disagree.length === 0,
  { threshold: ES.EXTREME_RATIO, min_experts: ES.MIN_N_EXPERTS,
    disagreeing: disagree.slice(0, 4).map(e => ({ ratio: e.ratio,
      n_experts: e.n_experts, extreme: e.extreme })) });

  /* KNOWN POSITIVE for the arm above: the `reliable` half must actually be
   * doing something on this artifact, or the conjunct is decoration and the
   * simpler wrong version would have passed. */
  const thinButWild = all.filter(e => e.ratio >= ES.EXTREME_RATIO
    && (e.n_experts || 0) < ES.MIN_N_EXPERTS);
  ck('KNOWN POSITIVE: the reliability floor is load-bearing here — there really '
    + 'are players above EXTREME_RATIO held back by a thin expert count, which '
    + 'is what my first version of the arm above got wrong',
  thinButWild.length > 0,
  { held_back: thinButWild.length,
    sample: thinButWild.slice(0, 3).map(e => ({ rank: e.rank_ecr,
      ratio: +e.ratio.toFixed(2), n_experts: e.n_experts })) });
}

// A random top-150 player NOT in the flagged set should NOT flag — proves
// the threshold has real selectivity rather than firing on everyone near the
// top of the board.
const gibbs = byName['Jahmyr Gibbs'];
ck('CONTROL: Jahmyr Gibbs (rank 1, tight consensus) does NOT flag',
  gibbs && idx[String(gibbs.player_id)] && !idx[String(gibbs.player_id)].extreme);

// ── 2. RATIO, NOT RAW SPREAD ─────────────────────────────────────────────────
function uniformFixture(n, spread, nExperts) {
  const players = [];
  for (let i = 1; i <= n; i++) {
    players.push({ player_id: String(i), name: 'P' + i, position: 'RB',
      rank_ecr: i, n_experts: nExperts, rank_min: i, rank_max: i + spread,
      spread: spread, rank_std: spread / 4 });
  }
  return { players };
}
const uniformIdx = ES.index(uniformFixture(50, 200, 80));
const anyFlaggedUniform = Object.keys(uniformIdx).some(k => uniformIdx[k].extreme);
ck('UNIFORM SPREAD FIXTURE: a deep-bench-wide but UNIFORM spread flags NOBODY',
  !anyFlaggedUniform, Object.keys(uniformIdx).length);

// One genuine outlier inside a uniform neighborhood SHOULD flag.
const outlierFx = uniformFixture(50, 100, 80);
outlierFx.players[24].spread = 100 * ES.EXTREME_RATIO + 50;   // player rank 25
const outlierIdx = ES.index(outlierFx);
ck('OUTLIER FIXTURE: one real outlier inside a flat neighborhood DOES flag',
  outlierIdx['25'] && outlierIdx['25'].extreme, outlierIdx['25']);

// ── 3. RELIABILITY FLOOR ─────────────────────────────────────────────────────
const lowN = uniformFixture(50, 100, 80);
lowN.players[24].spread = 100 * ES.EXTREME_RATIO + 50;
lowN.players[24].n_experts = ES.MIN_N_EXPERTS - 1;   // same outlier, too few raters
const lowNIdx = ES.index(lowN);
ck('LOW-n FIXTURE: the same outlier magnitude does NOT flag below MIN_N_EXPERTS',
  lowNIdx['25'] && !lowNIdx['25'].extreme, lowNIdx['25']);

// ── 4. ABSENT IS NEVER A GUESS ───────────────────────────────────────────────
ck('index(null) is null, not a guess', ES.index(null) === null);
ck('index({players: []}) is null', ES.index({ players: [] }) === null);
ck('badgeHtml() on a null index is always empty', ES.badgeHtml('1', null, esc) === '');
ck('badgeHtml() on an unknown id is empty', ES.badgeHtml('nonexistent-id', idx, esc) === '');

// ── 5. THE BADGE IS A FACT LABEL, NOT A NUMBER ───────────────────────────────
const bowers = byName['Brock Bowers'];
const badge = ES.badgeHtml(bowers.player_id, idx, esc);
ck('badge is non-empty for a flagged player', badge.length > 0, badge);
const visibleText = badge.replace(/title="[^"]*"/, '');
ck('the VISIBLE badge text never prints spread/ratio as a number (fact only)',
  !/\d/.test(visibleText.replace(/split/, '')), visibleText);
ck('the detail (spread/ratio) lives in title, one tap deeper, not the glance',
  /rank spread/.test(badge), badge);

console.log('\n' + pass + '/' + (pass + fail) + ' expert-spread display checks passed');
process.exit(fail ? 1 : 0);
