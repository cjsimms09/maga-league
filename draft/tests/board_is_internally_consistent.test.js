// TERRITORY: relay measures · A owns the board
// THE BOARD CORY DRAFTS ON IS INTERNALLY CONSISTENT — CHECKED, NOT ASSUMED.
//
// Cory's standing order, verbatim: "Above all!! Fix the data problem and make
// sure we don't have other mistakes in our info!!"
//
// Every register row is a KNOWN concern. This file asks the other question: does
// the published board contradict ITSELF, in ways nobody has filed? Nine
// structural properties, each one a thing that would put a wrong number on the
// screen at eight seconds a pick.
//
// ── EVERY CHECK SHIPS WITH A PLANTED-DEFECT CONTROL, AND THAT IS THE POINT ──
//
// This file is nine clean nulls. Rule 3e: "a null from a probe is a bug report
// until the probe has demonstrated it can return a positive" — five false
// negatives in one evening taught this project that "nothing found" and "asked
// wrong" are indistinguishable from outside.
//
// So each assertion is immediately followed by the same audit run against a
// board with that exact defect injected, and the control FAILS the build if the
// injected defect is not caught. A green run here means nine things were
// checked, not that nine checks ran.
//
// Run: node draft/tests/board_is_internally_consistent.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const REP = B.replacement.replacement_points;
const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);
const UI_NUMERIC = ['proj_mean', 'proj_ceiling', 'proj_floor', 'proj_sd', 'vorp'];
const clone = () => B.players.map(p => Object.assign({}, p));

/* ONE audit function, run against the live board and against every mutant, so a
 * control cannot pass by exercising different code from the assertion. */
function audit(P) {
  const count = (arr) => {
    const m = {};
    arr.forEach(k => { m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).filter(k => m[k] > 1).length;
  };
  const finite = v => typeof v === 'number' && isFinite(v);
  return {
    dup_ids: count(P.map(p => String(p.player_id))),
    dup_names: count(P.map(p => p.name)),
    vorp_broken: P.filter(p => p.vorp != null && p.proj_mean != null
      && REP[p.position] != null
      && Math.abs(p.vorp - (p.proj_mean - REP[p.position])) > 0.01).length,
    bad_numeric: P.filter(p => UI_NUMERIC.some(f => p[f] != null && !finite(p[f]))).length,
    missing_numeric: P.filter(p => p.proj_mean == null || p.vorp == null).length,
    inverted: P.filter(p => p.proj_ceiling != null && p.proj_mean != null
      && (p.proj_ceiling < p.proj_mean
        || (p.proj_floor != null && p.proj_floor > p.proj_mean))).length,
    negative: P.filter(p => (p.proj_mean || 0) < 0).length,
    unknown_pos: P.filter(p => !POSITIONS.has(p.position)).length,
    no_replacement: P.filter(p => REP[p.position] == null).length,
  };
}

const live = audit(B.players);

// ── 0. THE BOARD IS REAL ───────────────────────────────────────────────────
{
  ck('CONTROL: the board is populated, so nine zeros below mean "checked and '
    + 'clean" rather than "checked nothing"',
  B.players.length > 400 && !!B.replacement && !!REP.RB,
  { players: B.players.length, built_at: B.built_at });
}

// ── 1..9. EACH PROPERTY, THEN ITS PLANTED-DEFECT CONTROL ───────────────────
const CHECKS = [
  ['dup_ids', 'no duplicate player_id — a duplicate makes "drafted" ambiguous '
    + 'and can hide a player from the pool',
  P => P.concat([Object.assign({}, P[0])])],

  ['dup_names', 'no duplicate NAME — the war room matches on name in places, '
    + 'and two Josh Allens is a crosswalk failure waiting for draft night',
  P => P.concat([Object.assign({}, P[0], { player_id: 'PLANTED-9' })])],

  ['vorp_broken', 'vorp EQUALS proj_mean minus the published replacement level '
    + 'for every player — the board ranks across positions on this identity',
  P => P.map((p, i) => (i === 0 ? Object.assign({}, p, { vorp: p.vorp + 50 }) : p))],

  ['bad_numeric', 'no NaN or Infinity in any number the board renders',
    P => P.map((p, i) => (i === 0 ? Object.assign({}, p, { proj_sd: NaN }) : p))],

  ['missing_numeric', 'every player carries a proj_mean and a vorp — a null '
    + 'sorts unpredictably and renders as blank or zero',
  P => P.map((p, i) => (i === 0 ? Object.assign({}, p, { proj_mean: null }) : p))],

  ['inverted', 'no ceiling below the projection and no floor above it — an '
    + 'inverted range bar is a visibly wrong picture',
  P => P.map((p, i) => (i === 0 ? Object.assign({}, p, { proj_ceiling: p.proj_mean - 1 }) : p))],

  ['negative', 'no negative projection — negative points would price a player '
    + 'below an empty roster slot',
  P => P.map((p, i) => (i === 0 ? Object.assign({}, p, { proj_mean: -5 }) : p))],

  ['unknown_pos', 'every position is one the engine knows, so nobody is '
    + 'silently excluded from a positional rail',
  P => P.map((p, i) => (i === 0 ? Object.assign({}, p, { position: 'FLEX' }) : p))],

  ['no_replacement', 'every position on the board has a published replacement '
    + 'level, or its players cannot be ranked against anyone',
  P => P.map((p, i) => (i === 0 ? Object.assign({}, p, { position: 'XX' }) : p))],
];

CHECKS.forEach(([key, label, mutate]) => {
  ck(label, live[key] === 0, { [key]: live[key] });

  /* THE CONTROL. Same audit, one defect injected. If the count does not rise,
   * the assertion above is decorative and this file says so loudly. */
  const mutant = audit(mutate(clone()));
  ck('   CONTROL — the same audit CATCHES a planted `' + key + '` defect, so '
    + 'the clean result above is a measurement',
  mutant[key] > live[key], { clean: live[key], planted: mutant[key] });
});

// ── 10. THE SEAT: CORY'S PICKS ARE INSIDE THE DRAFT ────────────────────────
{
  const picks = ((B.pick_order || {}).my_picks) || [];
  const total = ((B.pick_order || {}).picks || []).length || null;
  ck('Cory\'s picks are present and ascending — a scrambled pick list moves '
    + 'every survival and timing number on the page',
  picks.length > 0 && picks.every((v, i) => i === 0 || v > picks[i - 1]), picks);

  if (total) {
    ck('...and every one of them is inside the draft',
      picks.every(p => p >= 1 && p <= total), { picks: picks, total: total });
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
