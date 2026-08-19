// TERRITORY: A
/* RUN ANY ENGINE-DRIVEN STUDY UNDER A NAMED VONA ARM, WITHOUT EDITING IT.
 *
 * Cory, 2026-08-19: *"I feel like we need to run more tests using correct vona
 * calc. Test our roster building, our adjusters etc."* He is right, and the
 * scope is larger than it looks: THIRTY-THREE harnesses in draft/tools and
 * draft/backtest drive `recommend()`, and every conclusion any of them produced
 * was measured on a `vona()` that priced the cost of waiting on a player over a
 * pool that EXCLUDED him. Register 56 / P107.
 *
 * ── WHY A PRELOAD AND NOT AN --arm FLAG IN EACH TOOL ──────────────────────
 * Thirty-three edits is thirty-three chances to wire an arm slightly
 * differently, and the whole value of an A/B is that ONE thing differs. This
 * sets the flags once, in the module cache, before the study's own `require`
 * resolves — so the study is BYTE-IDENTICAL between arms and cannot disagree
 * with another study about what "a0" means.
 *
 * ── WHY NOT AN ENV VAR READ INSIDE engine.js ──────────────────────────────
 * Because that would put a stray environment variable one export away from
 * changing the board Cory drafts from. The shipped engine reads no environment
 * at all, and it stays that way: the override lives HERE, in a file nothing in
 * the serving path requires, and it REFUSES to do anything unless VONA_ARM is
 * set explicitly.
 *
 * Run: VONA_ARM=a0 node -r ./draft/tools/vona_arm_preload.js draft/tools/<study>.js
 */
'use strict';
const path = require('path');

const ARMS = {
  a0: { VONA_INCLUDE_SELF: false, VONA_SURVIVAL_RESCALE: false },  // pre-fix
  a1: { VONA_INCLUDE_SELF: true,  VONA_SURVIVAL_RESCALE: false },  // SHIPPED 08-19
  a2: { VONA_INCLUDE_SELF: false, VONA_SURVIVAL_RESCALE: true },   // diagnostic
};

const arm = process.env.VONA_ARM;
if (arm) {
  if (!Object.prototype.hasOwnProperty.call(ARMS, arm)) {
    console.error('vona_arm_preload: unknown VONA_ARM=' + arm
      + '; known: ' + Object.keys(ARMS).join(','));
    process.exit(2);
  }
  // Many studies stub these themselves; setting them first is harmless and lets
  // the preload require engine.js in a bare node process.
  if (typeof global.window === 'undefined') global.window = global;
  if (typeof global.document === 'undefined') {
    global.document = { getElementById: () => null, querySelector: () => null,
                        addEventListener: () => {} };
  }
  const E = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'engine.js'));
  Object.keys(ARMS[arm]).forEach(k => {
    if (!(k in E.CFG)) {          // a renamed flag must not fail silently
      console.error('vona_arm_preload: engine has no flag ' + k);
      process.exit(2);
    }
    E.CFG[k] = ARMS[arm][k];
  });
  /* THE ARM MUST BE VISIBLE IN THE OUTPUT IT PRODUCES. A study run under an arm
   * and printed without one is an artifact nobody can attribute later, which is
   * the same disease as an unlabelled choice file. */
  console.log('# VONA_ARM=' + arm + ' ' + JSON.stringify(ARMS[arm]));
}

module.exports = { ARMS };
