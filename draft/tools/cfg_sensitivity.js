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

const KEEPER_NAMES = ["Ja'Marr Chase", 'Derrick Henry', 'Kenneth Walker'];
const keepers = KEEPER_NAMES.map(n => DATA.players.find(p => p.name === n)
  || (DATA.kept_players || []).find(p => p.name === n)).filter(Boolean);
if (keepers.length !== KEEPER_NAMES.length) {
  console.log('CANNOT RUN — ' + keepers.length + '/' + KEEPER_NAMES.length + ' keepers found.');
  process.exit(2);
}

const MY_PICKS = [30, 45, 50, 65, 70, 85, 90, 105, 110, 125, 130, 145];
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
    const board = pool.filter(p => !taken.has(String(p.player_id)));
    const roster = keepers.concat(byAdp.filter(p => taken.has(String(p.player_id))).slice(0, i));
    const ctx = {
      board: board, roster: roster, league: L, currentPick: pick,
      nextPick: MY_PICKS[i + 1] || 147, totalPicks: 147,
      myPicksLeft: MY_PICKS.length - i, roundsLeft: MY_PICKS.length - i,
      runMultipliers: {}, intervening: [], weights: E.MEASURED_WEIGHTS,
    };
    let recs;
    try { recs = E.recommend(ctx); } catch (err) { parts.push(pick + ':THREW:' + err.message); return; }
    const top = recs.slice(0, 5).map(r => r.player.name + '@' + Number(r.score).toFixed(3)).join('|');
    let paths = '';
    try {
      const p = E.computePaths ? E.computePaths(recs, ctx) : null;
      paths = p ? p.map(c => (c.name || '') + ':' + (c.members || []).length).join(',') : '';
    } catch (err) { paths = 'PATHS_THREW'; }
    let verdict = '';
    try {
      const v = E.oneVoice ? E.oneVoice(recs, ctx) : null;
      verdict = v ? JSON.stringify(v).slice(0, 200) : '';
    } catch (err) { verdict = ''; }
    parts.push(pick + ':' + top + ';' + paths + ';' + verdict);
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
function probes(v) {
  if (v === 0) return [1, -1, 5];
  return [v * 0.5, v * 0.9, v * 1.1, v * 2];
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

console.log('CFG SENSITIVITY — does each constant bind on Cory\'s twelve picks?\n');
console.log('  board ' + pool.length + ' players, seat 8, keepers '
  + keepers.map(p => p.name).join(', '));
console.log('  signature covers the top 5 names AND scores, the path cards, and the');
console.log('  one-voice verdict at each of the twelve picks.\n');

const inert = rows.filter(r => !r.binds);
const fragile = rows.filter(r => r.fragile);

console.log('  INERT — no perturbation changed anything Cory can see (' + inert.length
  + ' of ' + rows.length + '):');
inert.forEach(r => console.log('    ' + r.key.padEnd(26) + String(r.value)));
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
const savedGap = CFG.COIN_FLIP_GAP;
CFG.COIN_FLIP_GAP = 999;
const control = signature() !== BASE;
CFG.COIN_FLIP_GAP = savedGap;
console.log('\n  CONTROL: signature() responds to a constant known to bind '
  + '(COIN_FLIP_GAP -> 999): ' + (control ? 'YES — table is meaningful'
    : '*** NO — signature() is blind and every row above is worthless'));
if (!control) process.exit(2);

process.exit(inert.length ? 1 : 0);
