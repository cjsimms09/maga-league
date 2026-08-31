// TERRITORY: A
'use strict';
/* BOARD SLOTS AND SELECTIONS ARE TWO SCALES, AND survival.js USED ONLY ONE.
 *
 * `adpOf` returns `adjusted_adp`, which counts SELECTIONS — keepers.py maps
 * market ADP onto the live sequence with kept players removed from the
 * numbering. Every pick number handed to the module counts BOARD SLOTS, keeper
 * slots included. They were compared directly.
 *
 * The rule already existed on the other side. keepers.py has `live_index_of`,
 * which REFUSES rather than defaulting:
 *
 *     "live_index_of: no board rows. REFUSING to fall back to the pick number
 *      — that is exactly the scale confusion this exists to fix."
 *
 * `grab_by.py:233` calls it. `grep -c live_index public/js/draft/survival.js`
 * returned 0. One rule, implemented on one side — the same shape as the four
 * adp_sd formulas and as `picks` versus `my_picks`.
 *
 * ── MEASURED COST, at my first pick (board slot 33) ─────────────────────────
 *
 *                     today (3 keepers)      after keeper lock (17)
 *   live index of 33         30                       15
 *   Josh Allen         4.0% vs 1.5%            61.8% vs 1.5%
 *   A.J. Brown         0.0% vs 0.0%            95.9% vs 0.0%
 *   Nico Collins       0.2% vs 0.0%            97.4% vs 0.0%
 *
 * Small today because only my three keepers are on the board. THE SLATE LOCKS
 * 20 AUGUST AND THE DRAFT IS THE 22nd, so the error on the night is the
 * right-hand column: the board calls a 96%-available receiver certainly gone.
 * It UNDERSTATES survival, which manufactures urgency and makes the tool reach.
 *
 * B reported "Josh Allen reads 98% where he should read 61%". The mechanism B
 * named was a different defect (applySlot, fixed separately). 61% is THIS
 * defect's correct post-lock answer, to a tenth — worth recording, because it
 * means a report can carry a right number and a wrong cause at the same time.
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const S = require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
const DATA = require(path.join(ROOT, 'public', 'draft_data.json'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

const ROWS = DATA.pick_order.picks;
const KEEPERS = ROWS.filter(r => r.keeper_slot).length;
const ctx = { pickBoard: ROWS };

// ── CONTROLS ────────────────────────────────────────────────────────────────
ck('CONTROL — the board carries keeper slots, or the two scales coincide and '
  + 'nothing below can discriminate', KEEPERS > 0, `${KEEPERS} keeper slots`);
ck('CONTROL — the module exports the converter, so this tests the shipped one '
  + 'rather than a copy of it', typeof S.liveIndexOf === 'function');

// ── THE CONVERSION ──────────────────────────────────────────────────────────
ck('a board slot converts to the count of SELECTIONS at or before it',
  S.liveIndexOf(33, ctx) === 33 - ROWS.filter(r => r.keeper_slot && r.overall <= 33).length,
  String(S.liveIndexOf(33, ctx)));
/* ⚠️ THIS WAS `=== 30`, A CONSTANT THAT EXPIRED WITH THE LEAGUE-WIDE KEEPER
 * SLATE (A, 2026-08-24, register 300). 30 = 33 − 3 assumed only Cory's three
 * keepers were flagged. Post-lock ALL 23 are, and every one costs a round 1-3
 * pick, so all 23 sit at or before overall 33 and the correct answer is 10.
 * `liveIndexOf` was right the whole time; the hardcode was asserting the old
 * board's shape. Derived now — and note the REAL cross-implementation check is
 * the python subprocess below, which runs keepers.py itself; this line only
 * ever restated the assertion above it, which is why replacing the constant
 * loses nothing. */
{
  const expected = 33 - ROWS.filter(r => r.keeper_slot && r.overall <= 33).length;
  ck('and it agrees with the board\'s own keeper-slot count at my first pick '
    + '(the keepers.py cross-check is the python arm below)',
  S.liveIndexOf(33, ctx) === expected,
  `${S.liveIndexOf(33, ctx)} vs ${expected} (${ROWS.filter(r => r.keeper_slot && r.overall <= 33).length} keeper slots at or before 33)`);
}
ck('the two scales genuinely differ, or the fix is a no-op',
  S.liveIndexOf(33, ctx) !== 33);
ck('it is monotone — a later slot is never fewer selections', (() => {
  let prev = 0;
  for (let p = 1; p <= 150; p++) {
    const v = S.liveIndexOf(p, ctx);
    if (v < prev) return false;
    prev = v;
  }
  return true;
})());
ck('the last board slot maps to the number of real SELECTIONS, not 150',
  S.liveIndexOf(150, ctx) === 150 - KEEPERS,
  `${S.liveIndexOf(150, ctx)} vs ${150 - KEEPERS}`);

// ── THE SURVIVAL NUMBERS THEMSELVES ─────────────────────────────────────────
/* ⚠️ THIS WAS `find(p => p.name === 'Josh Allen')` AND HE IS NOW A KEEPER, so
 * `build.py` moved him to `kept_players`, the find returned undefined, and the
 * CONTROL failed (A, 2026-08-24, register 300/301). The probe is DERIVED now,
 * so it survives any keeper slate.
 *
 * CHOSEN BY CONSTRUCTION, NOT BY OUTCOME: the player whose adjusted_adp sits
 * nearest my first pick, because that is where a mis-scaled selection count
 * moves the answer most — picking whoever maximises the difference would make
 * the "converting CHANGES the answer" assertion below circular. */
const allen = DATA.players
  .filter(p => (p.adjusted_adp || 0) > 0 && (p.adp_sd || 0) > 0)
  .sort((a, b) => Math.abs(a.adjusted_adp - 33) - Math.abs(b.adjusted_adp - 33))[0];
ck('CONTROL — the probe player is on the board with a spread',
  !!allen && allen.adjusted_adp > 0 && allen.adp_sd > 0,
  allen && { who: allen.name, adp: allen.adjusted_adp, sd: allen.adp_sd });
{
  const withBoard = 1 - S.layer1Taken(allen, 33, ctx);
  const without = 1 - S.layer1Taken(allen, 33, {});
  ck('converting CHANGES the answer — the defect was live, not cosmetic',
    Math.abs(withBoard - without) > 0.01,
    `${(100 * withBoard).toFixed(1)}% vs ${(100 * without).toFixed(1)}%`);
  ck('and it moves survival UP: the unconverted scale over-counts selections '
    + 'and so understates who is left',
    withBoard > without,
    `${(100 * withBoard).toFixed(1)}% vs ${(100 * without).toFixed(1)}%`);
  /* RE-DERIVED 2026-08-15: this used to pin the python side's answer as the
   * LITERAL 4.0 — the number keepers.py produced on the board of 2026-08-13.
   * The first fresh nightly rebuild after the pipeline was unblocked moved
   * Allen's adjusted_adp and the check went red at 3.18 with both sides in
   * perfect agreement — the pin was comparing tonight's JS against Wednesday's
   * python. The check's own name states the real contract ("matches the python
   * side"), so now it RUNS the python side — keepers.survival_probability on
   * live_index_of, the exact pairing freeze_pre_draft.py ships — on the same
   * board, same probe, and compares live-to-live. Board-independent, and a
   * genuine cross-language divergence still fails to the tenth. */
  const { execSync } = require('child_process');
  const pyPct = parseFloat(execSync('python3 -', {
    cwd: ROOT, encoding: 'utf8',
    env: Object.assign({}, process.env, { PROBE_NAME: allen.name }),
    input: [
      'import json, sys',
      "sys.path.insert(0, 'draft')",
      'import keepers as K',
      "data = json.load(open('public/draft_data.json'))",
      "rows = data['pick_order']['picks']",
      /* ⚠️ THE PROBE NAME IS PASSED IN, NOT HARDCODED. This line read
       * `x['name'] == 'Josh Allen'` and raised StopIteration the moment he was
       * kept — the JS side above was already derived by then, so the two sides
       * were probing different players until this one crashed. Both sides now
       * read the SAME derived probe, which is the whole point of a
       * cross-language check. */
      "import os",
      "want = os.environ['PROBE_NAME']",
      "p = next((x for x in data['players'] if x['name'] == want), None)",
      "assert p is not None, 'probe %r is not on the board' % want",
      "print(100 * K.survival_probability(float(p['adjusted_adp']), K.live_index_of(33, rows), p.get('adp_sd')))",
    ].join('\n'),
  }));
  ck('the converted value matches the python side to a tenth of a point',
    Number.isFinite(pyPct) && Math.abs(100 * withBoard - pyPct) < 0.1,
    `js ${(100 * withBoard).toFixed(2)} vs py ${pyPct.toFixed(2)}`);
}

// ── A SLATE BIGGER THAN TODAY'S — THE SCALE MUST KEEP UP ────────────────────
/* ⚠️ THIS BLOCK WAS WRITTEN TO PRE-PIN A FUTURE, AND THE FUTURE ARRIVED
 * (A, 2026-08-24, register 300). Its header read "THE POST-LOCK CASE, PINNED
 * WHILE IT IS STILL CHEAP — a check that only fires after 20 August is a check
 * that fires too late", and it simulated a big slate by flagging rounds 1-2.
 * That was exactly right when the live board carried THREE keeper slots. The
 * lock landed and the live board now carries TWENTY-THREE, all in rounds 1-3 —
 * so the simulation produced 26 against a real 23 and its own control
 * ("materially bigger than today's", `> KEEPERS * 3`) correctly said no.
 *
 * The post-lock case is no longer hypothetical; it is asserted live by every
 * check above, on the real board. What is still worth exercising here is the
 * SENSITIVITY — that the conversion keeps working when the slate grows past
 * anything we have seen — so the simulation is rebased on TODAY's slate rather
 * than on a fixed round cutoff, and the control now derives its bar from the
 * live count instead of from the number 3. */
{
  const SIM_ROUNDS = 5;      // 10 teams x 5 rounds = 50 slots, vs today's 23
  const sim = ROWS.map(r => Object.assign({}, r,
    { keeper_slot: r.keeper_slot || r.round <= SIM_ROUNDS }));
  const simKeepers = sim.filter(r => r.keeper_slot).length;
  ck('CONTROL — the simulated slate is materially bigger than TODAY\'s live '
    + 'one (rebased on the live count, not on the pre-lock 3)',
  simKeepers >= KEEPERS * 2, `${simKeepers} simulated vs ${KEEPERS} live`);
  const simCtx = { pickBoard: sim };
  /* ⚠️ WAS `find(p => p.name === 'A.J. Brown')`, WRAPPED IN `if (brown)`. He is
   * a keeper now, so the find returned undefined and the assertion SILENTLY
   * SKIPPED — a vacuous check wearing an if-guard, which is worse than a red
   * one because nothing reports it. Derived, and the skip is gone: if no
   * suitable probe exists the control below says so and fails. */
  const brown = DATA.players
    .filter(p => (p.adjusted_adp || 0) > 0 && (p.adp_sd || 0) > 0
      && 1 - S.layer1Taken(p, 33, {}) < 0.05)
    .sort((a, b) => (1 - S.layer1Taken(b, 33, simCtx)) - (1 - S.layer1Taken(a, 33, simCtx)))[0];
  ck('CONTROL — some player IS called certainly-gone by the unconverted scale, '
    + 'or there is no case to test here', !!brown,
  brown ? { who: brown.name, adp: brown.adjusted_adp } : 'none below 5% unconverted');
  if (brown) {
    const conv = 1 - S.layer1Taken(brown, 33, simCtx);
    const raw = 1 - S.layer1Taken(brown, 33, {});
    ck('BIGGER SLATE — a player the unconverted scale calls certainly gone is '
      + 'mostly available once keepers are counted',
    conv > 0.5 && raw < 0.05,
    `${brown.name}: converted ${(100 * conv).toFixed(1)}% vs unconverted ${(100 * raw).toFixed(1)}%`);
  }
}

// ── THE FALLBACK IS VISIBLE, NOT SILENT ─────────────────────────────────────
{
  const before = S.SCALE.unconverted;
  S.liveIndexOf(33, {});
  ck('a missing pick board increments a COUNTER rather than passing quietly — '
    + 'keepers.py refuses here, and refusing in the browser would blank the war '
    + 'room mid-draft, so the identity fallback announces itself instead',
    S.SCALE.unconverted === before + 1);
  const c0 = S.SCALE.converted;
  S.liveIndexOf(33, ctx);
  ck('and a real conversion increments the other one', S.SCALE.converted === c0 + 1);
}

// ── THE WIRING, ASSERTED AT SOURCE ──────────────────────────────────────────
// The converter is useless if app.js never threads the board. That is exactly
// how this survived: the rule existed in keepers.py and the caller never used it.
{
  const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  const body = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const n = (body.match(/pickBoard:/g) || []).length;
  ck('app.js threads pickBoard into every survival context it builds',
    n >= 2, `${n} site(s)`);
  ck('and it reads it from pick_order.picks, the BOARD, not from my_picks',
    /pickBoard:\s*\(\(state\.data \|\| \{\}\)\.pick_order \|\| \{\}\)\.picks/.test(body));
  const surv = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'), 'utf8');
  const sbody = surv.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ck('layer1Taken converts rather than using the raw pick',
    /normalCdf\(liveIndexOf\(pick, ctx\)/.test(sbody),
    'the entry point still compares a board slot to a selection-scale ADP');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
