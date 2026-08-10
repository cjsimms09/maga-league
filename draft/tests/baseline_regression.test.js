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
const BASELINE = path.join(ROOT, 'draft', 'baseline', 'v1.json');
const { build } = require(path.join(ROOT, 'draft', 'tools', 'freeze_baseline.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n))
  : (fail++, console.log('FAIL ' + n + (d ? '\n        -> ' + d : ''))); };

if (!fs.existsSync(BASELINE)) {
  console.log('FAIL no frozen baseline at draft/baseline/v1.json — run freeze_baseline.js --freeze');
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
  const picks = f.next_pick - f.current_pick;
  ck('[' + f.state + '] and still conserves (mass ~= picks in window)',
     l.survival_mass / picks > 0.5 && l.survival_mass / picks < 1.5,
     'mass ' + l.survival_mass + ' over ' + picks + ' picks');
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

console.log('\n' + pass + '/' + (pass + fail) + ' baseline-regression checks passed');
if (fail) {
  console.log('\nA FAILURE HERE MEANS RECOMMENDATION BEHAVIOUR CHANGED.');
  console.log('If that was deliberate: freeze a NEW version and say why —');
  console.log('  node draft/tools/freeze_baseline.js --freeze --version v2');
  console.log('The old version stays on the books (binding rule 6).');
}
process.exit(fail ? 1 : 0);
