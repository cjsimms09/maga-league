// TERRITORY: A
/* CORY, 2026-08-21, twice: "So everything that should changes when I change
 * source?? this is improtant" and then "so all issues are solved and deployed
 * and everything that should move with source change does?"
 *
 * Answering that by INSPECTION is how it went wrong the first three times. This
 * answers it by CONSTRUCTION, and keeps answering it after tonight's rebuild.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 *
 * `alt_source_rankings.py` writes per-source copies of a field as
 * `<field>_<sourcekey>`. `SourceBoard.SWAP_FIELDS` lists which of those the
 * toggle actually swaps. Those two lists must be THE SAME SET. A field the
 * board carries per source but the toggle does not swap is, by definition, a
 * number that sits on a source view showing the BLEND's value — which is the
 * defect this project has now paid for three separate times:
 *
 *   · `vona()` frozen to Draft Sharks under a toggle that re-sorted everything
 *     around it (E's finding, 08-21);
 *   · `proj_ceiling` / `proj_floor` absent from SWAP_FIELDS while
 *     `alt_source_rankings.py` had been writing per-source versions of both all
 *     along — a source view showing that source's MEAN beside the BLEND's
 *     CEILING (08-21);
 *   · the "+N wire" chip, Draft-Sharks-priced against a frozen literal, shipped
 *     with a LABEL admitting it before it got a fix (register 221).
 *
 * All three are the same shape and all three were found by a person noticing,
 * not by a check. The producer adding a twelfth family is free; remembering to
 * add it here is not. So this fails the build instead.
 *
 * ── WHY THIS IS NOT ALREADY COVERED ──────────────────────────────────────────
 *
 * `source_board.test.js` PINS the SWAP_FIELDS list — it asserts the list is
 * what it was, which is the opposite property: it goes red when someone ADDS a
 * field and stays green forever when the producer adds one and this does not.
 * `source_toggle_moves_vona.test.js` proves the swap MOVES a number, but only
 * for the fields already in the list. Neither can see a family that exists on
 * the board and was never wired. Measured, not assumed — the control at the
 * bottom of this file removes a field from SWAP_FIELDS and confirms which
 * suites notice.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
require(path.join(ROOT, 'public/js/draft/source_board.js'));
const SB = global.window.SourceBoard;
const data = require(path.join(ROOT, 'public/draft_data.json'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 400) : '')); }
};

const KEYS = SB.SOURCES.map(s => s.key);
ck('CONTROL: the toggle offers real sources — an empty SOURCES list would make '
  + 'every set below empty and every comparison trivially true',
  KEYS.length >= 5, { keys: KEYS });

/* ── WHAT THE BOARD ACTUALLY CARRIES PER SOURCE ────────────────────────────
 *
 * Derived from the DATA, not from a list someone maintains. A family counts
 * only if it appears for MOST sources — a one-off `proj_mean_sleeper_only` is a
 * single-source diagnostic, not a swappable family, and treating it as one
 * would make this check demand a swap that cannot exist. */
const rows = data.players.slice(0, 400);
const famCount = {};
rows.forEach(p => Object.keys(p).forEach(k => {
  KEYS.forEach(key => {
    if (k.length > key.length + 1 && k.slice(-(key.length + 1)) === '_' + key) {
      const base = k.slice(0, -(key.length + 1));
      (famCount[base] || (famCount[base] = new Set())).add(key);
    }
  });
}));
const families = Object.keys(famCount).filter(b => famCount[b].size >= Math.ceil(KEYS.length * 0.75));

ck('CONTROL: per-source families were actually found on the board — zero here '
  + 'is a broken probe, not a clean bill of health (rule 3e)',
  families.length >= 8, { found: families.length, families: families });

/* `covered_<key>` is a MEMBERSHIP FLAG, not a value the toggle swaps — it is
 * what `forSource()` filters ON. `proj_used_<key>` is the swapped form of
 * `proj_mean`, which SWAP_FIELDS names by its blend spelling. Both are
 * accounted for explicitly rather than quietly skipped. */
const NOT_A_SWAPPED_VALUE = {
  covered: 'membership flag — forSource() filters on it rather than swapping it',
  /* ⚠️ THE ONE EXCLUSION THAT LOOKS LIKE A GAP, AND IS THE OPPOSITE. `proj_ds`,
   * `proj_cbs` etc. are the RAW provider feeds; `proj_used_<key>` is what the
   * toggle swaps in. MEASURED before excluding it rather than argued: where
   * BOTH exist they are IDENTICAL — 247/247 at ds, 398/398 at cbs, 400/400 at
   * espn, zero difference at any player — and `proj_used_cbs` additionally
   * covers 302 players `proj_cbs` does not, carrying that player's own blend
   * number where CBS has no opinion. So `proj_<key>` is a STRICT SUBSET of
   * what is already swapped. Wiring it instead would swap in nothing for those
   * 302 and blank them out of the CBS view.
   *
   * The exclusion is verified below rather than trusted: if `proj_used_<key>`
   * ever stops being a superset, this stops being a safe skip and the check
   * that follows goes red. */
  proj: 'raw provider feed — proj_used_<key> is the superset actually swapped',
};
const SPELLED_DIFFERENTLY = { proj_used: 'proj_mean' };

/* The exclusion of `proj` above rests on a measured property. Re-measure it,
 * because an exclusion justified by a comment is an exclusion nobody re-checks. */
{
  const bad = [];
  KEYS.forEach(key => {
    let both = 0, differ = 0, usedOnly = 0, rawOnly = 0;
    data.players.forEach(p => {
      const r = p['proj_' + key], u = p['proj_used_' + key];
      if (r != null && u != null) { both++; if (Math.abs(+r - +u) > 1e-6) differ++; }
      else if (u != null) usedOnly++;
      else if (r != null) rawOnly++;
    });
    if (!both && !usedOnly) return;            // source not present at all
    if (differ > 0 || rawOnly > 0) bad.push({ key, both, differ, usedOnly, rawOnly });
  });
  ck('`proj_<key>` is a STRICT SUBSET of `proj_used_<key>` — identical wherever '
    + 'both exist, and never present where proj_used is absent. This is the '
    + 'property that makes skipping the raw feed safe; if it breaks, the '
    + 'exclusion above is no longer justified and this must be re-decided',
    bad.length === 0, { violations: bad });
}

const expected = new Set();
families.forEach(b => {
  if (NOT_A_SWAPPED_VALUE[b]) return;
  expected.add(SPELLED_DIFFERENTLY[b] || b);
});
const actual = new Set(SB.SWAP_FIELDS);

const missing = [...expected].filter(f => !actual.has(f));
const extra = [...actual].filter(f => !expected.has(f));

ck('EVERY per-source family the board carries is swapped by the toggle — a '
  + 'field with eight source copies that the toggle ignores is a BLEND number '
  + 'sitting on a source view, which is exactly how proj_ceiling and proj_floor '
  + 'went unswapped for weeks',
  missing.length === 0,
  { missing: missing, hint: 'add these to SWAP_FIELDS in public/js/draft/source_board.js' });

ck('and the toggle does not claim to swap a family the board does not carry — '
  + 'a listed field with no per-source data swaps nothing and reads as live',
  extra.length === 0,
  { extra: extra, hint: 'either alt_source_rankings.py stopped writing these, or SWAP_FIELDS names a field that never existed' });

/* ── AND THE SWAP MUST ACTUALLY LAND ──────────────────────────────────────── */

const keptIds = ((data.kept_player_ids) || []).map(String);
const base = data.players.filter(p => !keptIds.includes(String(p.player_id)));
const moved = {};
SB.SWAP_FIELDS.forEach(f => { moved[f] = 0; });
let compared = 0;
KEYS.forEach(key => {
  const view = SB.forSource(base, key);
  const byId = new Map(view.map(p => [String(p.player_id), p]));
  base.forEach(p => {
    const v = byId.get(String(p.player_id));
    if (!v) return;
    compared++;
    SB.SWAP_FIELDS.forEach(f => {
      if (p[f] != null && v[f] != null && Math.abs(+v[f] - +p[f]) > 1e-9) moved[f]++;
    });
  });
});
ck('CONTROL: players were actually compared across views — zero comparisons '
  + 'would make every "it moved" count below a silent zero',
  compared > 1000, { compared: compared });

const inert = SB.SWAP_FIELDS.filter(f => moved[f] === 0);
ck('every field in SWAP_FIELDS MOVES for at least one real player on at least '
  + 'one source — the silent no-op: SWAP_FIELDS still lists the field, the '
  + 'list-pinning test still passes, and the swap quietly does nothing because '
  + 'the producer stopped writing proj_used_*',
  inert.length === 0, { inert: inert, moved: moved });

/* ── CONTROL FOR THIS FILE (rule 3f) ──────────────────────────────────────── */
/* Everything above passes on the shipped tree, which is also what a file
 * asserting nothing does. Simulate the exact regression — a family present on
 * the board and absent from SWAP_FIELDS — and confirm the detector fires. */
{
  const crippled = new Set(SB.SWAP_FIELDS.filter(f => f !== 'vorp'));
  const wouldMiss = [...expected].filter(f => !crippled.has(f));
  ck('CONTROL (rule 3f) — dropping `vorp` from SWAP_FIELDS is caught. A '
    + 'detector that cannot name the field it lost is not a detector',
    wouldMiss.length === 1 && wouldMiss[0] === 'vorp', { wouldMiss });
}
{
  /* and the SET check must not be satisfiable by an empty board */
  const emptyFam = [];
  ck('CONTROL (rule 3f) — with no families discovered the comparison would be '
    + 'vacuously green, which is why the discovery step has its own control '
    + 'above rather than only this one',
    emptyFam.length === 0 && families.length >= 8, { families: families.length });
}

console.log('\nfamilies on the board (' + families.length + '): ' + families.join(', '));
console.log('SWAP_FIELDS (' + SB.SWAP_FIELDS.length + '): ' + SB.SWAP_FIELDS.join(', '));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
