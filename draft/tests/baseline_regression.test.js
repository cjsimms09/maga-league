'use strict';
/* BASELINE REGRESSION — the live engine against the FROZEN measured core.
 *
 * Part 1 of the shadow-layer brief, and the protection Cory said is worth doing
 * regardless of whether the rest ever happens. Runs on EVERY deploy with NO
 * file-based filter, by explicit instruction: this week's corruptions arrived
 * through a display predicate, a merge that dropped edits, a null coercion inside
 * a materiality gate, and a valuation re-implemented in a route file. No
 * reasonable file filter would have caught any of them, and the classification
 * step is exactly where the miss happens.
 *
 * WHAT A FAILURE MEANS. Not "the code is wrong" — it means RECOMMENDATION
 * BEHAVIOUR CHANGED. That is either a bug caught the moment it landed, or a
 * deliberate improvement, and binding rule 6 says there is no third option where
 * the reference quietly follows the code. A deliberate change freezes a NEW
 * baseline version (`node draft/tools/freeze_baseline.js --freeze --version v2`)
 * and says why. The old version stays on the books.
 *
 * WHY IT COMPARES A WIDE SURFACE. A recommendation-only diff would have caught one
 * of this week's four. So it also asserts badge FIRING RATES, the survival
 * conservation total and the rule headline — the classes where every individual
 * row looks defensible and only the aggregate reveals the fault.
 *
 * Run: node draft/tests/baseline_regression.test.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
/* THE REFERENCE IS NAMED, NOT DISCOVERED. Pointing this at "the newest file in
 * draft/baseline/" would make the reference follow the code the instant anyone
 * freezes — the exact third state binding rule 6 forbids. Moving it is an edit
 * someone has to make and defend in a diff.
 *
 * v1 -> v2 on 2026-08-11: v1 froze a Layer-1-only world (freeze_baseline.js
 * supplied intervening: [], and survival.js gates Layer 2 on it), so it was
 * testing a context the app never runs in.
 * v2 -> v3, same day: PRECISION ONLY, no behaviour change. v2 stored the mass at
 * three decimals, so a conservation ceiling written as `1 + 1e-9` could not
 * resolve better than 1.7e-4 and stayed green when the live ratio was broken to
 * 1.0000001. Six decimals now, epsilon 1e-6.
 * v3 -> v4, same day: A GATED DEPARTURE, and the first one that moved
 * recommendations. The conservation tilt went LIVE (it had been built, exported,
 * tested and called by nothing), N was corrected from the whole window to
 * opponent picks, and solveTilt was made two-sided. Conservation is now exactly
 * 1.000000 where it was 0.862-0.900. The fourth canonical state was dropped: it
 * emitted a byte-identical surface to the first, so the baseline honestly spans
 * three pick regimes.
 * Each version's reason is in the artifact itself under `_why`. v1, v2 and v3
 * all stay on the books. */
/* The version is NOT repeated here. freeze_baseline.js declares it once and this
 * test imports the path, so the frozen surface and the pinned board it was
 * computed against cannot drift apart into a green comparison nobody intended. */
const F = require(path.join(ROOT, 'draft', 'tools', 'freeze_baseline.js'));
const { build } = F;
const BASELINE = F.BASELINE_PATH;

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n))
  : (fail++, console.log('FAIL ' + n + (d ? '\n        -> ' + d : ''))); };

if (!fs.existsSync(BASELINE)) {
  console.log('FAIL no frozen baseline at ' + BASELINE + '  — run freeze_baseline.js --freeze');
  process.exit(1);
}
const frozen = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const live = build();

// ── POLICY CONSTANTS ────────────────────────────────────────────────────────
ck('the loaded weight vector matches the frozen core',
   JSON.stringify(live.engine_policy.MEASURED_WEIGHTS)
     === JSON.stringify(frozen.engine_policy.MEASURED_WEIGHTS),
   'frozen ' + JSON.stringify(frozen.engine_policy.MEASURED_WEIGHTS)
   + '\n           live   ' + JSON.stringify(live.engine_policy.MEASURED_WEIGHTS));

Object.keys(frozen.engine_policy.CFG).forEach(k => {
  ck('CFG.' + k + ' unchanged',
     live.engine_policy.CFG[k] === frozen.engine_policy.CFG[k],
     'frozen ' + frozen.engine_policy.CFG[k] + ', live ' + live.engine_policy.CFG[k]);
});

ck('the anchor source is unchanged',
   live.anchor_source === frozen.anchor_source,
   'frozen ' + frozen.anchor_source + ', live ' + live.anchor_source);

ck('the preset list is unchanged',
   JSON.stringify(live.engine_policy.preset_keys) === JSON.stringify(frozen.engine_policy.preset_keys));

// ── THE EMITTED SURFACE, PER CANONICAL STATE ────────────────────────────────
const liveByName = {};
live.surfaces.forEach(s => { liveByName[s.state] = s; });

frozen.surfaces.forEach(f => {
  const l = liveByName[f.state];
  if (!l) { ck('state "' + f.state + '" still exists', false); return; }

  // The ranked list, in order and by identity. Score drift is allowed a hair of
  // float slack; ORDER is not.
  const fIds = f.top10.map(p => p.player_id).join(',');
  const lIds = l.top10.map(p => p.player_id).join(',');
  ck('[' + f.state + '] top-10 ranking unchanged', fIds === lIds,
     'frozen ' + f.top10.map(p => p.name).slice(0, 4).join(' > ')
     + '\n           live   ' + l.top10.map(p => p.name).slice(0, 4).join(' > '));

  const scoreDrift = f.top10.some((p, i) =>
    !l.top10[i] || Math.abs((p.score || 0) - (l.top10[i].score || 0)) > 0.01);
  ck('[' + f.state + '] composite scores unchanged', !scoreDrift);

  /* PER-PLAYER SURVIVAL WAS FROZEN AND NEVER COMPARED. It has sat in every
   * baseline file since v1, in the top-10 rows, read by nothing — so removing
   * survival's currentPick guard (which reverts the model to the unconditional
   * form and moves every player's number) left the suite green. The aggregate
   * mass could not catch it either once the tilt was live, because the tilt
   * re-normalises the TOTAL to the pick count no matter how the shape moves.
   *
   * That is rule 14 inside the guard that exists to catch rule 14: a value
   * computed, written down, and read by no consumer.
   *
   * 0.005 is half the coarsening the UI applies (survival renders in 5% buckets
   * with a tilde), so anything this tolerates cannot change what is displayed. */
  /* JOINED BY PLAYER, NOT BY INDEX — corrected 2026-08-12 while reading a real
   * departure. The old version compared slot i to slot i, so the moment the
   * top-10 MEMBERSHIP changed it paired two different players and reported
   * "Marcedes Lewis frozen 1 live 0.994" when Lewis had simply been replaced in
   * that slot by Hunter Henry. Survival had not moved at all.
   *
   * The DETECTION was never wrong — a ranking change is caught by the top-10
   * check directly above. The MESSAGE was, and a guard whose message asserts
   * something it did not measure is how a re-ordering gets investigated as a
   * survival regression. Players who left the top-10 are not compared here;
   * their departure is the other check's business. */
  const liveById = new Map(l.top10.map(x => [String(x.player_id), x]));
  const survDrift = f.top10.filter(p => {
    const live = liveById.get(String(p.player_id));
    if (!live) return false;                  // not a survival question
    const lv = live.survival_to_next;
    if (p.survival_to_next == null || lv == null) return p.survival_to_next != lv;
    return Math.abs(p.survival_to_next - lv) > 0.005;
  });
  ck('[' + f.state + '] per-player survival unchanged', survDrift.length === 0,
     survDrift.slice(0, 3).map((p, i) => p.name + ' frozen ' + p.survival_to_next
       + ' live ' + (l.top10[f.top10.indexOf(p)] || {}).survival_to_next).join('; '));

  // THE HEADLINE THE WAR ROOM ACTUALLY SHOWS.
  ck('[' + f.state + '] rule headline unchanged',
     JSON.stringify(f.rule_headline) === JSON.stringify(l.rule_headline),
     'frozen ' + JSON.stringify(f.rule_headline && f.rule_headline.name)
     + ', live ' + JSON.stringify(l.rule_headline && l.rule_headline.name));

  ck('[' + f.state + '] confidence reading unchanged',
     f.confidence_level === l.confidence_level,
     'frozen ' + f.confidence_level + ', live ' + l.confidence_level);

  // FIRING RATES — the class a single-case diff cannot see.
  Object.keys(f.firing_rates).forEach(k => {
    ck('[' + f.state + '] firing rate ' + k + ' unchanged',
       Math.abs(f.firing_rates[k] - l.firing_rates[k]) < 1e-6,
       'frozen ' + f.firing_rates[k] + ', live ' + l.firing_rates[k]);
  });

  // CONSERVATION — survival must still track the picks that actually happen.
  ck('[' + f.state + '] survival conservation unchanged',
     Math.abs(f.survival_mass - l.survival_mass) < 0.01,
     'frozen ' + f.survival_mass + ', live ' + l.survival_mass);
  /* CONSERVATION AGAINST THE RIGHT DENOMINATOR, IN A BAND THAT BINDS.
   *
   * Two faults, both found on 2026-08-11 while re-freezing:
   *
   *   WRONG DENOMINATOR. It used next_pick - current_pick, the whole window. My
   *   own pick is in that window and a player I take is not a player who got
   *   away, so the identity's right-hand side is OPPONENT picks — 6, not 7.
   *
   *   A BAND THAT ACCEPTED ANYTHING. 0.5-1.5 admits 3.5 to 10.5 expected
   *   departures against 7 real picks. It passed v1's 7.279, which is a 21%
   *   conservation violation against the correct denominator of 6 — the guard
   *   was present and green on the very number it exists to catch.
   *
   * AND 0.8-1.2 WAS ALSO CHOSEN TO PASS. That was my first replacement band, and
   * rule 10b applied to it says so plainly: CONSERVATION IS AN EXACT IDENTITY.
   * Every opponent pick removes exactly one player from the board, so the sum of
   * P(gone) over the board must EQUAL the number of opponent picks. A 20%
   * tolerance on an exact quantity is not noise allowance, it is a window sized
   * to admit the current numbers. So it is split into the two halves it always
   * was, which have completely different justifications:
   *
   *   CEILING — EXACT, to an epsilon. Expected departures cannot exceed available
   *   picks; there is no measurement noise that makes 1.05 acceptable. This is
   *   what would have caught v1 (7.279 / 6 = 1.213), and it is the half that can
   *   be stated with no judgement at all.
   *
   *   FLOOR — A RATCHET OVER A DECLARED, OPEN VIOLATION. The live model
   *   under-predicts: 0.862-0.900 against an identity that demands 1.000. That is
   *   a REAL DEFECT, currently ~10-14%, and no honest band accepts it as passing.
   *   Pretending otherwise is the thing 10b forbids. So the deficit is frozen per
   *   surface and only allowed to shrink. It fails the moment it grows, and it
   *   stays visible as an open violation rather than being absorbed into a
   *   tolerance and forgotten. */
  const opp = l.opponent_picks_in_window
    || (f.next_pick - f.current_pick - 1);
  const ratio = opp ? l.survival_mass / opp : null;
  /* 1e-6, NOT 1e-9. The mass is frozen at six decimals, so its rounding
   * granularity is 5e-7 of mass — about 8e-8 of ratio over six picks. An epsilon
   * of 1e-6 sits safely above that and far below any real violation. Writing 1e-9
   * would be claiming a precision the stored number does not carry, which is how
   * the first version of this ceiling silently admitted 1.00017. */
  ck('[' + f.state + '] conservation CEILING is exact (mass <= opponent picks)',
     ratio != null && ratio <= 1 + 1e-6,
     'mass ' + l.survival_mass + ' over ' + opp + ' opponent picks = '
     + (ratio == null ? 'n/a' : ratio.toFixed(4))
     + ' — expected departures cannot exceed the picks that happen');
  const frozenRatio = f.conservation_ratio;
  ck('[' + f.state + '] conservation deficit has not WIDENED (open violation, ratcheted)',
     ratio != null && frozenRatio != null && ratio >= frozenRatio - 1e-3,
     'frozen ratio ' + frozenRatio + ', live ' + (ratio == null ? 'n/a' : ratio.toFixed(4))
     + ' — the model under-predicts departures by '
     + (ratio == null ? '?' : ((1 - ratio) * 100).toFixed(1)) + '%, which is a KNOWN '
     + 'OPEN DEFECT, not a passing tolerance');

  /* DID BOTH LAYERS RUN? v1 froze a LAYER-1-ONLY world — the freeze tool passed
   * intervening: [], survival.js gates Layer 2 on it, and the suite reported
   * 51/51 for a baseline that never executed the code it claimed to protect.
   * "No drift" was silence, not agreement. Asserted now, per surface, because
   * the same silence recurred twice more while fixing it. */
  const layers = l.survival_layers || [];
  ck('[' + f.state + '] Layer 2 actually ran (not a layer-1-only baseline)',
     layers.indexOf('intervening') >= 0,
     'layers ' + JSON.stringify(layers) + ', opponent picks ' + opp);
});

// ── BINDING RULE 7: LANGUAGE DISCIPLINE ─────────────────────────────────────
// "The measured core" names the FROZEN object and nothing else; what the sliders
// hold is live policy under continuous measurement. The rule exists because drift
// happens in the mental model before it happens in the code — the live weights
// plus a couple of gated promotions start getting described as "what we really
// run", and the idea of the core moves even though the frozen object does not.
// Policing the WORDS makes that drift visible in a diff.
{
  const files = {
    'engine.js': path.join(ROOT, 'public', 'js', 'draft', 'engine.js'),
    'app.js': path.join(ROOT, 'public', 'js', 'draft', 'app.js'),
    'warroom.ejs': path.join(ROOT, 'views', 'admin', 'warroom.ejs'),
  };
  Object.keys(files).forEach(name => {
    const src = fs.readFileSync(files[name], 'utf8');
    // Strip comments — the prohibition is on what the UI SAYS, not on explaining
    // the rule. A comment describing the history is exactly how it stays fixed.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      .replace(/<%#[\s\S]*?%>/g, '');
    // Every occurrence must be ANCHORED to the frozen object — either by the word
    // FROZEN or by the Restore control that only ever restores it. An unanchored
    // "measured core" is the drift this rule exists to catch: it is the phrase
    // quietly attaching itself to whatever is currently running.
    const hits = (code.match(/.{0,40}[Mm]easured core/g) || []);
    const unanchored = hits.filter(h => !/FROZEN|[Rr]estor/.test(h));
    ck('[rule 7] "measured core" in ' + name + ' names only the frozen baseline',
       unanchored.length === 0,
       unanchored.length + ' unanchored: ' + JSON.stringify(unanchored.slice(0, 2))
       + ' — live policy must not be called the measured core');
  });
}

/* A GREEN THAT STATES ITS OWN SCOPE CANNOT BE MISREAD by a reader who was not in
 * the conversation that produced it — which includes me in a fortnight. I read a
 * green from this suite as evidence the conservation tilt had changed behaviour;
 * it was not, and could not have been.
 *
 * MEASURED, NOT ARGUED: this suite reports 51/51 while the live context() has
 * currentPick, nextPick, roster, myPickIndex or the doctrine wiring DELETED, and
 * while nextPick is reverted to the exact bug that caused the conservation
 * violation. All eight of B's breaks, every one green here.
 *
 * The cause is structural rather than a coverage gap: freeze_baseline.js has no
 * reference to app.js. It HAND-BUILDS the context it scores, so a field the app
 * fails to supply is always supplied by the fixture. Rules 6 and 7 both bear on
 * it — the artifact must say what it covers AT THE POINT IT REPORTS, or the
 * number gets read as a warrant it never was. */
console.log('\nSCOPE — what this green does and does not mean:');
console.log('  COVERS   weights, policy constants, and the emitted surface, from a');
console.log('           HAND-BUILT context.');
console.log('  DOES NOT read app.js. It cannot detect a live-context defect, and');
console.log('           reads 51/51 through all eight known context breaks.');
console.log('  ELSEWHERE context wiring: context_interface.test.js, app-wiring.test.js');
console.log('\n' + pass + '/' + (pass + fail) + ' baseline-regression checks passed');
if (fail) {
  console.log('\nA FAILURE HERE MEANS RECOMMENDATION BEHAVIOUR CHANGED.');
  console.log('If that was deliberate: freeze a NEW version and say why —');
  console.log('  node draft/tools/freeze_baseline.js --freeze --version v2');
  console.log('The old version stays on the books (binding rule 6).');
}
process.exit(fail ? 1 : 0);
