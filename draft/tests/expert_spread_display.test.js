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

const NAMES = ['Brock Bowers', 'Emeka Egbuka', 'Drake Maye', 'Harold Fannin Jr.',
  'Jonathon Brooks', 'Jordyn Tyson', 'Tyler Shough', 'Malik Willis'];
NAMES.forEach(name => {
  const p = byName[name];
  ck('COMMITTED: ' + name + ' is in the artifact', !!p, name);
  if (p) {
    const e = idx[String(p.player_id)];
    ck('COMMITTED: ' + name + ' (rank ' + p.rank_ecr + ') flags extreme',
      !!(e && e.extreme), e);
  }
});

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
