/* ITEM 11, THE NORMALISATION HUNT — DOES EVERY THRESHOLD BIND?
 *
 * Cory's question: anywhere a quantity is compared, ranked, subtracted or
 * thresholded against another, are they the same unit, the same scale, the same
 * horizon and the same population?
 *
 * NAMING THE UNITS BY HAND WOULD NOT ANSWER IT. A unit table is a
 * self-description, and item 9 is the whole argument for not trusting one. So
 * this measures the OBSERVABLE CONSEQUENCE instead: a threshold on the wrong
 * scale does not bind. If CFG.X is compared against a quantity an order of
 * magnitude away, moving X does not change a single decision, because the
 * comparison was already pinned. So:
 *
 *   perturb each constant, re-run the twelve picks Cory actually holds, and see
 *   whether ANY visible output moves.
 *
 * THREE OUTCOMES AND ONLY ONE IS GOOD:
 *   BINDS     the output moves. The constant is on the right scale and is doing
 *             work. Nothing to look at.
 *   INERT     nothing moves at any perturbation. Either the constant is on the
 *             wrong scale for what it is compared against, or the branch it
 *             guards is unreachable, or it is genuinely non-binding at this
 *             board. ALL THREE NEED ADJUDICATION — this tool does not claim to
 *             tell them apart, and says so per row.
 *   FRAGILE   a 10% nudge changes a recommendation. Not a bug by itself, but a
 *             constant that decides picks on its second decimal place is a
 *             tuned number wearing a principled one, and Cory should know which
 *             of his picks rest on it.
 *
 * WHAT IS PERTURBED: every numeric CFG key. PATHS_BAND is a getter derived from
 * COIN_FLIP_GAP and is deliberately NOT perturbed directly — perturbing its
 * source is the honest test, and an attempt to assign it would silently no-op,
 * which would report a derived constant as INERT. That exact false negative is
 * why the getter is listed separately below.
 *
 * Run: node draft/tools/cfg_sensitivity.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const CFG = E.CFG;

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const L = DATA.league;

const keepers = require(path.join(__dirname, 'keepers_of.js')).keepersFrom(DATA);

/* FOUR PICKS, NOT TWELVE, AND A SLICED BOARD.
 *
 * The honest version — all twelve picks over the full 1,719-player board — is
 * 60 constants x 4 perturbations x 12 recommends, and it does not finish inside
 * ten minutes. A sweep nobody can run is a sweep nobody runs.
 *
 * SO THE COST IS DECLARED RATHER THAN HIDDEN: four picks spanning early, middle,
 * late and last, and the top 400 by ADP at each. THE RISK IS FALSE INERTIA — a
 * constant that only binds at pick 50, or only on a candidate ranked 600th,
 * reads as INERT here. That is a FALSE NEGATIVE, and it is the direction this
 * tool errs in, which is the direction that matters: every INERT row is a lead
 * to check, not a verdict, and a missed one is a lead not raised rather than a
 * false alarm raised. --full runs the twelve-pick version for anyone willing to
 * wait for it. */
const FULL = process.argv.indexOf('--full') >= 0;
const MY_PICKS = FULL ? [30, 45, 50, 65, 70, 85, 90, 105, 110, 125, 130, 145]
  : [30, 70, 110, 145];
const BOARD_SLICE = FULL ? Infinity : 400;
const pool = DATA.players.filter(p => p.position && p.proj_mean != null && p.vorp != null);
const adpOf = p => (p.adjusted_adp != null ? p.adjusted_adp : (p.raw_adp != null ? p.raw_adp : 9999));
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));

/* A SIGNATURE OF EVERYTHING CORY CAN SEE, not just the top pick. A constant that
 * only moves a tie label or a path name is still binding, and scoring on the top
 * name alone would report it INERT — the same "measured nothing because I only
 * looked at one output" mistake as the single-state degeneracy probe. */
function signature() {
  const parts = [];
  MY_PICKS.forEach((pick, i) => {
    const taken = new Set(byAdp.slice(0, pick - 1).map(p => String(p.player_id)));
    keepers.forEach(k => taken.add(String(k.player_id)));
    const board = pool.filter(p => !taken.has(String(p.player_id)))
      .slice(0, BOARD_SLICE === Infinity ? undefined : BOARD_SLICE);
    const roster = keepers.concat(byAdp.filter(p => taken.has(String(p.player_id))).slice(0, i));
    const ctx = {
      board: board, roster: roster, league: L, currentPick: pick,
      nextPick: MY_PICKS[i + 1] || 147, totalPicks: 147,
      myPicksLeft: MY_PICKS.length - i, roundsLeft: MY_PICKS.length - i,
      runMultipliers: {}, intervening: [], weights: E.MEASURED_WEIGHTS,
    };
    let recs;
    try { recs = E.recommend(ctx); } catch (err) { parts.push(pick + ':THREW:' + err.message); return; }
    const top = recs.slice(0, 8)
      .map(r => r.player.name + '@' + (E.scoreable(r) ? r.score.toFixed(3) : 'REFUSED')).join('|');

    /* THE FIRST VERSION OF THIS FUNCTION CALLED computePaths(recs, ctx). The
     * signature is computePaths(ctx, scored). It threw on every invocation, the
     * catch below turned that into the constant string 'PATHS_THREW', and the
     * constant string compared equal every time — so the entire paths panel was
     * invisible to the sweep while looking like it was covered. A swallowed
     * exception inside a measuring instrument is the instrument reporting
     * "no change" for "I never looked". */
    let paths = '';
    try {
      const p = E.computePaths(ctx, recs);
      paths = Array.isArray(p)
        ? p.map(c => (c.name || '') + ':' + ((c.members || []).length)).join(',')
        : 'NOT_AN_ARRAY';
    } catch (err) { paths = 'PATHS_THREW:' + err.message; }

    let conf = '';
    try { conf = JSON.stringify(E.confidence(recs)); } catch (err) { conf = 'CONF_THREW:' + err.message; }

    let clock = '';
    try {
      const oc = E.onTheClock(ctx, {});
      clock = JSON.stringify(oc.confidence) + '#'
        + (oc.branches || []).map(b => (b.player && b.player.name) + ':'
          + JSON.stringify(b.verdict || b.recommendation || '')).join(',');
    } catch (err) { clock = 'CLOCK_THREW:' + err.message; }

    let extra = '';
    try {
      extra = JSON.stringify([
        recs[0] && recs[0].contested, recs[0] && recs[0].gap_to_second,
        recs[0] && recs[0].doctrine_report, recs[0] && recs[0].legality_warning,
        recs.slice(0, 20).map(r => r.rails && r.rails.length),
        recs.slice(0, 20).map(r => !!r.demoted),
      ]);
    } catch (err) { extra = 'EXTRA_THREW:' + err.message; }

    /* THE OTHER SURFACES, AND LEAVING THEM OUT WAS THE SAME MISTAKE TWICE.
     *
     * The first table reported 52 of 60 constants INERT. Most of that was the
     * instrument, not the engine: SHEET_*, TELL_*, THREAT_* and AUTO_* have no
     * consumer inside recommend/confidence/paths at all, so no perturbation of
     * them could ever have moved a signature built from those three. They were
     * being reported INERT for the same reason the paths panel was — NOT
     * MEASURED, printed as NOT MOVED.
     *
     * Every exported surface Cory can see is now called. Ones that throw record
     * the message rather than a constant, so a surface that breaks under a
     * perturbation registers as a change instead of vanishing into a catch. */
    const surfaces = [];
    const call = (name, fn) => {
      try { surfaces.push(name + '=' + JSON.stringify(fn()).slice(0, 400)); }
      catch (err) { surfaces.push(name + '=THREW:' + err.message); }
    };
    call('sheet', () => E.cheatSheet(ctx, {}, {}));
    call('threat', () => E.threatBoard(ctx, {}));
    call('auto', () => E.autoWeights(ctx));
    call('plan', () => E.rosterPlan(ctx));
    call('byes', () => E.byeGrid(ctx));
    call('stackroutes', () => E.liveStackRoutes(ctx.roster, recs, {}));
    call('tells', () => E.managerTells({ picks: [], profile: {} }));
    call('runs', () => E.detectRuns && E.detectRuns(ctx));
    call('doctrine', () => E.doctrineTilt && E.doctrineTilt(recs, ctx));

    parts.push(pick + ':' + top + ';' + paths + ';' + conf + ';' + clock + ';' + extra
      + ';' + surfaces.join('~'));
  });
  return parts.join('\n');
}

const BASE = signature();

const descs = Object.getOwnPropertyDescriptors(CFG);
const getters = Object.keys(descs).filter(k => descs[k].get);
const numeric = Object.keys(CFG).filter(k => typeof CFG[k] === 'number' && !getters.includes(k));

/* Perturbations. A multiplicative sweep cannot move a constant that is 0, so
 * zero-valued constants get an additive probe instead — otherwise every zeroed
 * setting reports INERT for a purely arithmetic reason. */
/* THE RANGE HAS TO REACH PAST THE QUANTITY, AND MY FIRST ONE DID NOT.
 *
 * It probed [x0.5, x0.9, x1.1, x2] and reported TIE_THRESHOLD, CLOSE_GAP and
 * PATHS_MAX as INERT. Hand-checked, all three bind:
 *
 *   TIE_THRESHOLD 2   contested flips false->true between 0.01 and 50
 *   CLOSE_GAP 3.5     confidence goes "clear"->"close" at 500
 *   PATHS_MAX 4       the paths menu goes 2 cards -> 1 at 1
 *
 * A THRESHOLD ONLY BINDS WHEN IT CROSSES AN OBSERVED VALUE, and doubling it
 * crosses nothing when the quantity it guards sits an order of magnitude away.
 * The score gaps at three of the four picks are 8.7, 8.3 and 21.7, so a
 * TIE_THRESHOLD of 4 is as far from binding as a TIE_THRESHOLD of 2 — the sweep
 * was measuring "is this constant near a boundary", and printing "does this
 * constant do anything". Three false INERT rows out of the first ten I checked.
 *
 * So the range now spans four orders of magnitude. INERT then means the constant
 * does not bind ANYWHERE reachable, which is the claim worth making; the ±10%
 * pair is kept for the separate FRAGILE question. */
function probes(v) {
  if (v === 0) return [0.01, 1, -1, 5, 100];
  return [v * 0.01, v * 0.1, v * 0.5, v * 0.9, v * 1.1, v * 2, v * 10, v * 100];
}

const rows = [];
numeric.forEach(k => {
  const orig = CFG[k];
  let moved = [], nudgeMoved = false;
  probes(orig).forEach(val => {
    CFG[k] = val;
    let sig;
    try { sig = signature(); } catch (err) { sig = 'THREW:' + err.message; }
    if (sig !== BASE) {
      moved.push(val);
      if (orig !== 0 && Math.abs(val / orig - 1) <= 0.1001) nudgeMoved = true;
    }
  });
  CFG[k] = orig;
  if (CFG[k] !== orig) throw new Error('failed to restore CFG.' + k);
  rows.push({ key: k, value: orig, binds: moved.length > 0, fragile: nudgeMoved,
    movedAt: moved });
});

console.log('CFG SENSITIVITY — does each constant bind on the picks Cory holds?\n');
console.log('  seat 8, keepers ' + keepers.map(p => p.name).join(', '));
console.log('  picks measured: ' + MY_PICKS.join(', ')
  + (FULL ? '   (--full)' : '   (pass --full for all twelve)'));
console.log('  board per pick: ' + (BOARD_SLICE === Infinity ? 'all ' + pool.length
  : 'top ' + BOARD_SLICE + ' by ADP of ' + pool.length));
console.log('  signature covers, at every pick: the top 8 names and scores, the path');
console.log('  cards, confidence, onTheClock branches, contested/gap/doctrine/legality,');
console.log('  rails and demotions, and nine other rendered surfaces (cheat sheet,');
console.log('  threat board, auto weights, roster plan, bye grid, stack routes, tells,');
console.log('  runs, doctrine tilt).\n');

/* ── UNTESTED IS NOT INERT, AND CONFLATING THEM WOULD REPEAT THE WEEK'S DEFECT ─
 *
 * Some surfaces are called here with empty inputs — managerTells gets no picks,
 * threatBoard no opponents, cheatSheet no personal lists, and ctx carries no
 * intervening picks or run multipliers. A constant read ONLY inside one of those
 * cannot move no matter what it is set to, and reporting it as INERT would be
 * "not measured, printed as not moved" a third time.
 *
 * So each constant is attributed to the function(s) whose body references it, by
 * parsing engine.js's function boundaries. That is a source scan, but for
 * ATTRIBUTION — which function mentions a name — which is the one question a
 * source scan answers reliably (rule 11e is about inferring BEHAVIOUR from
 * source, not location). Constants read only by an under-fed surface are
 * reported UNTESTED, and they are a to-do list for a richer harness, not a
 * finding about the engine. */
/* EVERY draft module, not just engine.js. The first version scanned engine.js
 * alone and printed "NO CONSUMER FOUND" for ADP_SD_* and RUN_* — which are read
 * by survival.js and deviation.js. "No consumer" and "consumer I did not look
 * for" are different claims and only one of them was true. */
const MODULE_SRC = {};
fs.readdirSync(path.join(ROOT, 'public', 'js', 'draft'))
  .filter(f => /\.js$/.test(f))
  .forEach(f => { MODULE_SRC[f] = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', f), 'utf8'); });
const ENGINE_SRC = MODULE_SRC['engine.js'];
const UNDERFED = {
  managerTells: 'called with no picks and an empty profile',
  threatBoard: 'called with no opponent rosters',
  cheatSheet: 'called with no personal lists',
  detectRuns: 'ctx carries no intervening picks',
  runMultipliers: 'ctx.runMultipliers is {}',
  applyPersonalLists: 'no target or avoid list supplied',
};
function consumersOf(key) {
  const out = new Set();
  Object.keys(MODULE_SRC).forEach(file => {
    const src = MODULE_SRC[file];
    if (!new RegExp('CFG\\.' + key + '\\b').test(src)) return;
    const fnRe = /\n\s*function ([A-Za-z0-9_]+)\s*\(/g;
    const bounds = [];
    let m;
    while ((m = fnRe.exec(src))) bounds.push({ name: m[1], at: m.index });
    let found = false;
    bounds.forEach((b, i) => {
      const body = src.slice(b.at, i + 1 < bounds.length ? bounds[i + 1].at : src.length);
      if (new RegExp('CFG\\.' + key + '\\b').test(body)) {
        out.add(file === 'engine.js' ? b.name : file + ':' + b.name);
        found = true;
      }
    });
    if (!found) out.add(file + ':<module scope>');
  });
  return Array.from(out);
}

const notBinding = rows.filter(r => !r.binds);
notBinding.forEach(r => {
  r.consumers = consumersOf(r.key);
  r.untested = r.consumers.length > 0 && r.consumers.every(c => UNDERFED[c]);
});
const inert = notBinding.filter(r => !r.untested);
const untested = notBinding.filter(r => r.untested);
const fragile = rows.filter(r => r.fragile);

console.log('  UNTESTED — read only by a surface this harness fed nothing ('
  + untested.length + '). NOT a finding about the engine:');
untested.forEach(r => console.log('    ' + r.key.padEnd(26) + String(r.value).padEnd(8)
  + r.consumers.join(', ') + '  — ' + UNDERFED[r.consumers[0]]));

console.log('\n  INERT — perturbed across four orders of magnitude, nothing Cory can');
console.log('  see moved, and its consumers WERE exercised (' + inert.length
  + ' of ' + rows.length + '):');
inert.forEach(r => console.log('    ' + r.key.padEnd(26) + String(r.value).padEnd(8)
  + (r.consumers.length ? r.consumers.slice(0, 3).join(', ') : 'NO CONSUMER FOUND IN engine.js')));
console.log('\n  FRAGILE — a 10% nudge changed a visible output (' + fragile.length + '):');
fragile.forEach(r => console.log('    ' + r.key.padEnd(26) + String(r.value)));
console.log('\n  BINDS but not fragile: ' + (rows.length - inert.length - fragile.length));

console.log('\n  NOT PERTURBED (derived getters — perturb their source instead): '
  + (getters.join(', ') || 'none'));

console.log('\n  WHAT AN INERT ROW DOES AND DOES NOT MEAN');
console.log('    It means: on THIS board, at THESE twelve picks, with the measured');
console.log('    weights, moving that constant changed nothing visible. It does NOT');
console.log('    by itself mean the constant is wrong, dead, or mis-scaled — those');
console.log('    three look identical here and each row needs adjudicating. What it');
console.log('    does mean is that no test resting on that constant is testing');
console.log('    anything about this board.');

/* CONTROL — if signature() were constant, EVERY key would read INERT and the
 * whole table would be a lie. Move a constant known to bind and require a diff. */
/* THE CONTROL IS TWO-DIRECTIONAL, AND THE FIRST VERSION WAS NOT.
 *
 * It moved COIN_FLIP_GAP from 1 to 999 and required the signature to change. It
 * did not, and I nearly read that as "the signature is blind". The signature was
 * fine; THE CONTROL WAS MIS-SPECIFIED. At pick 110 the top two score within
 * 0.73, so the verdict is ALREADY "coin-flip" — raising the threshold to 999
 * cannot change a state the board has already entered. A control has to move the
 * constant in the direction that can produce a different answer, and knowing
 * which direction that is requires knowing the current state. So both are tried
 * and either one firing is enough. Same principle as the sweep itself: a check
 * that finds nothing is only meaningful if it could have found something. */
const savedGap = CFG.COIN_FLIP_GAP;
CFG.COIN_FLIP_GAP = 0.01; const controlDown = signature() !== BASE;
CFG.COIN_FLIP_GAP = 999;  const controlUp = signature() !== BASE;
CFG.COIN_FLIP_GAP = savedGap;
const control = controlDown || controlUp;
console.log('\n  CONTROL: signature() responds to a constant known to bind');
console.log('    COIN_FLIP_GAP -> 0.01: ' + (controlDown ? 'moved' : 'no change'));
console.log('    COIN_FLIP_GAP -> 999 : ' + (controlUp ? 'moved' : 'no change')
  + '   (a threshold already crossed cannot be crossed harder)');
console.log('    ' + (control ? 'TABLE IS MEANINGFUL'
  : '*** SIGNATURE IS BLIND — every row above is worthless'));
if (!control) process.exit(2);

process.exit(inert.length ? 1 : 0);
