// TERRITORY: A
/* CONDITIONAL-VALUE DISPLAY — the chip + drill readout, driven against the
 * COMMITTED artifact (never fixtures for the headline cases: the numbers Cory
 * ruled on are the numbers the war room must print).
 *
 * WHAT THIS PINS, in the order the ruling names it:
 *   1. THE HEADLINES render from the artifact: Burrow +$18–22/season and
 *      +26–31 composite pts FOR CORY ONLY (r=0.52, n=60 wks — the n always
 *      prints); Higgins WITHOUT Burrow is NEGATIVE (−$6); the handcuffs are
 *      "round 15 or wire, never a mid-round spend" — that sentence IS the
 *      measured verdict and must appear verbatim; Walker's cuff carries the
 *      market-vs-depth-chart flag.
 *   2. THE ONE-VOICE CONTRACT: the chip annotates — no take control, no
 *      second unmarked recommendation, and every chip says "not in the
 *      score" because the composite genuinely does not contain it.
 *   3. ABSENT IS NEVER ZERO: no artifact -> no index -> '' everywhere; a
 *      player with no premium -> ''; the roster gates work (Higgins' entry
 *      flips between the −$6 WR-pair case and the +$9–10 double-stack case
 *      on whether Burrow is rostered — the audit's own two-row structure).
 *   4. THE NUMBERS REPRODUCE from the artifact's own fields (no literal in
 *      the module can drift from the measurement without failing here).
 *
 * Run: node draft/tests/conditional_value_display.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CV = require(path.join(ROOT, 'public', 'js', 'draft', 'conditional_value.js'));
const ART = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'data', 'conditional_value_2026.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const KEEPERS = ['3198', '7564', '8151'];             // Henry, Chase, Walker
const idx = CV.index(ART);

// ── the join itself ─────────────────────────────────────────────────────────
ck('the committed artifact indexes', !!idx);
ck('stack entries joined by player_id (Burrow 6770, Higgins 6801)',
  !!(idx.stacks['6770'] && idx.stacks['6801']));
ck('handcuff entries joined by player_id (Hill, Randall, Johnson, Demercado)',
  ['5995', '13302', '13337', '11199'].every(pid => !!idx.handcuffs[pid]));

// ── headline 1: Burrow, for Cory only ───────────────────────────────────────
{
  const chip = CV.chipHtml('6770', idx, KEEPERS);
  ck('Burrow carries a stack chip on the keeper roster', chip.length > 0);
  ck('  +$18–22/season — the audit headline, from the artifact\'s two rho arms',
    chip.indexOf('+$18–22/season') >= 0, chip);
  ck('  +26–31 composite pts beside it', chip.indexOf('+26–31 pts') >= 0, chip);
  ck('  the correlation prints WITH its n (r=0.52, n=60 wks)',
    chip.indexOf('r=0.52') >= 0 && chip.indexOf('n=60 wks') >= 0, chip);
  ck('  the pair is named (Burrow×Chase)', chip.indexOf('Burrow×Chase') >= 0, chip);
  ck('  labelled as roster-conditional ("to your roster")',
    chip.indexOf('to your roster') >= 0);
  ck('  and as OUTSIDE the composite ("not in the score")',
    chip.indexOf('not in the score') >= 0);
  // the dollars REPRODUCE: [class-rho arm, pair-rho arm] rounded
  const st = ART.stacks_for_cory.find(s => s.pids.board === '6770');
  const lo = Math.round(Math.min(st.premium_dollars_season, st.premium_dollars_season_class_rho));
  const hi = Math.round(Math.max(st.premium_dollars_season, st.premium_dollars_season_class_rho));
  ck('  the printed range IS the artifact\'s (recomputed here: $' + lo + '–' + hi + ')',
    chip.indexOf('+$' + lo + '–' + hi) >= 0);
  // FOR CORY ONLY: strip Chase off the roster and the premium is not his
  ck('  the premium vanishes without Chase on the roster (conditional means conditional)',
    CV.chipHtml('6770', idx, ['3198', '8151']) === '');
}

// ── headline 2: Higgins — negative without Burrow, flips with him ───────────
{
  const without = CV.chipHtml('6801', idx, KEEPERS);
  ck('Higgins WITHOUT Burrow: the stack case is NEGATIVE (−$6)',
    without.indexOf('−$6/season') >= 0, without);
  ck('  with its own correlation and n (r=−0.19, n=58 wks)',
    without.indexOf('r=−0.19') >= 0 && without.indexOf('n=58 wks') >= 0, without);
  ck('  and the plain-language verdict ("no roster-fit case")',
    without.indexOf('no roster-fit case') >= 0);
  const withBurrow = CV.chipHtml('6801', idx, KEEPERS.concat('6770'));
  ck('Higgins WITH Burrow rostered: the double-stack case replaces it (+$9–10)',
    withBurrow.indexOf('+$9–10/season') >= 0 && withBurrow.indexOf('−$6') < 0, withBurrow);
  ck('  carrying ITS n (n=50 wks)', withBurrow.indexOf('n=50 wks') >= 0, withBurrow);
}

// ── headline 3: the handcuffs — free-round-15/wire guidance ─────────────────
{
  const VERDICT = 'round 15 or wire, never a mid-round spend';
  const hill = CV.chipHtml('5995', idx, KEEPERS);
  ck('Justice Hill carries the handcuff chip', hill.length > 0);
  ck('  the measured verdict, verbatim: "' + VERDICT + '"',
    hill.indexOf(VERDICT) >= 0, hill);
  ck('  premium to Cory vs the room, both printed (+4.5–8 pts … +1 to the room)',
    /to you/.test(hill) && /to the room/.test(hill), hill);
  ck('  with the elevated-weeks n (n=111 wks)', hill.indexOf('n=111 wks') >= 0, hill);
  ck('  Henry\'s cuff carries NO market-vs-chart flag (market and chart agree on Hill)',
    hill.indexOf('⚑') < 0, hill);
  const johnson = CV.chipHtml('13337', idx, KEEPERS);
  ck('Emmett Johnson (Walker\'s cuff): same verdict line', johnson.indexOf(VERDICT) >= 0);
  ck('  ⚑ the market-vs-depth-chart flag prints (Johnson ADP 199 vs Demercado on the chart)',
    johnson.indexOf('⚑') >= 0 && /market prices Emmett Johnson/.test(johnson)
      && /depth chart lists Emari Demercado/.test(johnson), johnson);
  ck('  the premium follows the ROLE — the flag says so',
    /follows the ROLE/.test(johnson));
  ck('  handcuff premium vanishes if Cory does not own the starter',
    CV.chipHtml('13337', idx, ['3198', '7564']) === '');
}

// ── the one-voice contract: annotation, never a second recommendation ───────
{
  const all = ['6770', '6801', '5995', '13302', '13337', '11199']
    .map(pid => CV.chipHtml(pid, idx, KEEPERS.concat('6770'))).join('');
  ck('no chip carries a take control (data-draft-me)', all.indexOf('data-draft-me') < 0);
  ck('no chip carries ANY button', all.indexOf('<button') < 0);
  ck('no chip says TAKE — the adjudicated verdict owns that word',
    !/TAKE/.test(all.replace(/title="[^"]*"/g, '')));
  ck('every chip is labelled "to your roster"',
    (all.match(/cv-chip/g) || []).length === (all.match(/to your roster/g) || []).length);
  ck('every chip says "not in the score"',
    (all.match(/cv-chip/g) || []).length === (all.match(/not in the score/g) || []).length);
}

// ── absent is never zero ────────────────────────────────────────────────────
{
  ck('no artifact -> no index (absent, not zero)', CV.index(null) === null);
  ck('no index -> empty chip, empty drill',
    CV.chipHtml('6770', null, KEEPERS) === '' && CV.drillHtml('6770', null, KEEPERS) === '');
  ck('a player with no premium renders NOTHING (never "+$0")',
    CV.chipHtml('4046', idx, KEEPERS) === '');
  ck('the absence note exists for the provenance rail and says ABSENT, not zero',
    /ABSENT, not zero/.test(CV.absentNote()) && /composite never reads/.test(CV.absentNote()));
  // a stack whose premium is absent (history: null) must never chip — build a
  // synthetic artifact around the real one to prove the branch
  const synth = JSON.parse(JSON.stringify(ART));
  synth.stacks_for_cory[0].history = null;
  const sIdx = CV.index(synth);
  ck('a premium the stores could not measure is ABSENT from the join',
    CV.chipHtml('6770', sIdx, KEEPERS) === '');
}

// ── the drill-down readout ──────────────────────────────────────────────────
{
  const burrow = CV.drillHtml('6770', idx, KEEPERS);
  ck('Burrow drill: premium, mechanism, correlation all present',
    /premium/.test(burrow) && /mechanism/.test(burrow) && /correlation/.test(burrow), burrow.slice(0, 200));
  ck('  the class baseline prints with ITS n (151 pairs, 1,992 wks — the shrunk arm)',
    burrow.indexOf('151 pairs') >= 0 && burrow.indexOf('1992 wks') >= 0, burrow);
  ck('  the bust tail is REPORTED, not netted (dLow +2.2pp, dBelow1Sd +3.1pp)',
    burrow.indexOf('+2.2pp') >= 0 && burrow.indexOf('+3.1pp') >= 0
      && /reported, not netted/.test(burrow), burrow);
  ck('  the honest pricing caveat (v1 money model, simulated-room proxy)',
    /v1 money model in the simulated-room proxy/.test(burrow));
  ck('  the separate-print contract is stated on the readout itself',
    /never added into board value/.test(burrow));
  const hill = CV.drillHtml('5995', idx, KEEPERS);
  ck('Hill drill: class availability with n (44% of top-24 RB1s, n=120 starter-seasons)',
    hill.indexOf('44%') >= 0 && hill.indexOf('n=120') >= 0, hill);
  ck('  his own elevated history is named ABSENT, not zero (Henry missed 0 as a Raven)',
    /ABSENT, not zero/.test(hill));
  ck('  elevated production vs wire, both printed (12.5 vs 7.8)',
    hill.indexOf('12.5') >= 0 && hill.indexOf('7.8') >= 0, hill);
  ck('  the round-15-or-wire verdict reaches the drill too',
    /round 15 or wire, never a mid-round spend/.test(hill));
  ck('a no-premium player drills to nothing', CV.drillHtml('4046', idx, KEEPERS) === '');
}

// ── the wiring is on the page (guarded consumers degrade SILENTLY — so the
//    tags and call sites are asserted loud, same pattern as override_record) ──
{
  const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  ck('app.js fetches the artifact beside the board',
    app.indexOf("fetch('/conditional_value_2026.json'") >= 0);
  ck('the shortlist rec card emits the chip (condValueChip beside board value)',
    /condValueChip\(p\)/.test(app));
  ck('the provenance rail carries the honest absence note',
    /condValueLoaded && !state\.condValue/.test(app));
  const charts = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'warroom_charts.js'), 'utf8');
  ck('the drill-down panel renders the conditional readout',
    /conditionalDrillHtml/.test(charts));
  const ejs = fs.readFileSync(path.join(ROOT, 'views', 'admin', '_warroom_scripts.ejs'), 'utf8');
  ck('conditional_value.js is ON the war-room page, before app.js',
    ejs.indexOf('/js/draft/conditional_value.js') >= 0
      && ejs.indexOf('/js/draft/conditional_value.js') < ejs.indexOf('/js/draft/app.js'));
}

// ── the public copy the display actually fetches ────────────────────────────
{
  const pub = path.join(ROOT, 'public', 'conditional_value_2026.json');
  ck('public/conditional_value_2026.json ships (the web root serves the display copy)',
    fs.existsSync(pub));
  ck('  byte-identical to the committed measurement',
    fs.readFileSync(pub, 'utf8') === fs.readFileSync(
      path.join(ROOT, 'draft', 'data', 'conditional_value_2026.json'), 'utf8'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
