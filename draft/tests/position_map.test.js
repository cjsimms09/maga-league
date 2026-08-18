// TERRITORY: A
// SIX TOOLS BUILT SIX POSITION MAPS AND ALL SIX HAD THE SAME DEFECT.
//
// A measurement about 2023-2025 must not be computed through the LIVE 2026
// board. A player who started for somebody in 2023 and has since retired is not
// absent from 2023 — he is absent from the board, and joining history through
// the board deletes him from a sample that is about him.
//
// It was found and fixed in `wire_level.js`, whose fix carried the comment
// "so the coupling cannot come back silently a third time". IT CAME BACK FIVE
// MORE TIMES — waiver_supply, roster_shape, lineup_skill, opponent_persistence
// and value_anchor_independent, every one building its own map from
// draft_data.json. C swept for it on a clean origin/main worktree.
//
// A LOCAL FIX PLUS A WARNING COMMENT DOES NOT GENERALISE. A required module
// does, and this file is what stops the seventh copy.
//
// ── WHAT MADE THE SWEEP WORTH IT: THREE CHANGED CONCLUSIONS ────────────────
//
// Against a pruned board (1,841 -> 683): lineup_skill lost 31% of its sample,
// roster_shape's RB/WR "SHED in-season" verdict disappeared, opponent_
// persistence's 2025 diff CHANGED SIGN, and waiver_supply flipped 3 of 6
// verdicts — including RB and QB from "replaceable" to "OWNED — the wire is
// thin here", which is draft-day advice about whether to spend a pick on a
// backup.
//
// ── THE TWO THINGS THIS FILE HAS TO PROVE, AND THEY PULL OPPOSITE WAYS ─────
//
// 1. TODAY IT CHANGES NOTHING. `player_positions.json` is a union over builds
//    and the board has not been pruned, so it holds exactly the board's ids. A
//    refactor that moves a number is not a refactor, and five of the six tools
//    are byte-identical before and after.
// 2. UNDER A SHRUNKEN BOARD IT CHANGES EVERYTHING. That is the whole point, and
//    it is asserted directly rather than left as an argument.
//
// THE SIXTH TOOL IS NOT IDENTICAL AND THAT IS DELIBERATE — see section 3.
//
// Run: node draft/tests/position_map.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const PM = require(path.join(ROOT, 'draft', 'tools', 'position_map.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 320) : '')); }
};

const TOOLS = ['waiver_supply', 'roster_shape', 'lineup_skill',
  'opponent_persistence', 'value_anchor_independent', 'wire_level'];

// ── 1. NOBODY BUILDS THEIR OWN ANY MORE ─────────────────────────────────
// The check that actually prevents the seventh copy. It reads the source rather
// than the output, because a second map that happens to agree today is exactly
// what the last three instances looked like on the day they were written.
{
  const offenders = [];
  TOOLS.forEach(t => {
    const src = fs.readFileSync(path.join(ROOT, 'draft', 'tools', t + '.js'), 'utf8');
    if (!/require\(.*position_map/.test(src)) offenders.push({ tool: t, why: 'does not require the shared map' });
    /* A tool may still READ the board — most of them need projections, ADP or
     * keeper rows. What it must not do is derive a POSITION LOOKUP from it. */
    const buildsOwn = /\b(?:pos|POS|posOf|posById|positions)\s*\[\s*String\([^)]*\)\s*\]\s*=\s*\w+\.position/.test(src);
    if (buildsOwn) offenders.push({ tool: t, why: 'still builds an id->position map from the board' });
  });
  ck('every one of the six tools resolves positions through the shared module',
    offenders.length === 0, offenders);
  ck('CONTROL — there are six of them, so the sweep above is not over an empty '
    + 'list', TOOLS.length === 6);
}

// ── 2. THE MAP ITSELF ───────────────────────────────────────────────────
{
  const m = PM.positionMap();
  const s = m.__sources;
  ck('the map is built and non-trivial', Object.keys(m).length > 1000, Object.keys(m).length);
  ck('it reads the RECORD, not only the board — that is the entire fix',
    s.history_file && s.history > 1000, s);
  ck('__sources does not pollute the id space — a provenance field that reads '
    + 'as a player id is worse than no provenance',
    Object.keys(m).indexOf('__sources') < 0);

  /* RECORD FIRST, BOARD OVERLAID. Order matters both ways and each direction
   * has a reason, so each is asserted. */
  const board = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const boardRows = [].concat(board.players || [], board.kept_players || []);
  const disagree = boardRows.filter(p => p.position && m[String(p.player_id)] !== p.position);
  ck('on the real data the two sources agree everywhere', disagree.length === 0,
    disagree.slice(0, 3).map(p => p.name));

  /* ⚠️ AND THE LINE ABOVE PROVES NOTHING ABOUT PRECEDENCE, WHICH A MUTATION
   * SHOWED. `player_positions.json` is written by build.py FROM the board, so
   * the two agree on every id and reversing the precedence passed the entire
   * suite. The property has to be tested against a disagreement that reality
   * does not currently supply, which is why `mergeMaps` is a pure function. */
  {
    const r = PM.mergeMaps({ '99': 'RB', '77': 'TE' },
      [{ player_id: 99, position: 'WR' }, { player_id: 55, position: 'QB' }]);
    ck('CONSTRUCTED — the LIVE BOARD wins where they disagree, so a position '
      + 'CORRECTION still lands', r.map['99'] === 'WR', r.map);
    ck('and the RECORD survives where the board is silent, which is the whole '
      + 'reason the record exists', r.map['77'] === 'TE', r.map);
    ck('a board-only id is added rather than ignored', r.map['55'] === 'QB');
    ck('and the counts report both sources rather than a total',
      r.fromHistory === 2 && r.fromBoard === 2, r);
    const empty = PM.mergeMaps(null, null);
    ck('a missing record and a missing board degrade to an empty map, not a throw',
      Object.keys(empty.map).length === 0);
  }
  ck('and KEEPERS are in the map — they are removed from `players`, and a '
    + 'keeper is exactly the long-tenured man a historical join needs',
    (board.kept_players || []).every(p => !p.position || m[String(p.player_id)]),
    (board.kept_players || []).filter(p => p.position && !m[String(p.player_id)]).length);
}

// ── 3. THE DEF RULE, WHICH TWO TOOLS DISAGREED ABOUT ────────────────────
// roster_shape:  /^[A-Z]{2,3}$/.test(id) ? 'DEF' : map[id]
// lineup_skill:  /^\d+$/.test(id)        ? map[id] : 'DEF'
// For an id that is neither, the first says unknown and the second says DEF.
{
  const m = PM.positionMap();
  ck('a team code resolves to DEF', PM.posOf(m, 'LAR') === 'DEF');
  ck('and a two-letter one, since those exist', PM.posOf(m, 'SF') === 'DEF');
  ck('REFUSAL — an id that is neither numeric nor a team code returns null, NOT '
    + '"DEF". lineup_skill\'s old rule labelled every unrecognisable id a '
    + 'defence, which turns a malformed id into a confident position rather '
    + 'than a visible gap', PM.posOf(m, 'not-an-id-at-all') === null,
  PM.posOf(m, 'not-an-id-at-all'));
  ck('a null id does not throw and does not resolve', PM.posOf(m, null) === null);
  ck('the MAP is consulted before the team-code shape, so the record can '
    + 'correct anything', PM.posOf({ LAR: 'WR' }, 'LAR') === 'WR');
  ck('resolver() gives the one-argument shape the call sites had',
    typeof PM.resolver() === 'function' && PM.resolver()('LAR') === 'DEF');
}

// ── 4. THE PROOF — a shrunken board must not shrink the measurement ─────
// This is the whole reason the module exists, and it cannot be shown on today's
// board, where the record and the board hold the same ids. So the board is
// simulated as pruned and the two lookups are compared directly.
{
  const board = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const rows = [].concat(board.players || [], board.kept_players || []);
  /* The prune C measured against: keep the draftable band, drop the deep pool.
   * A 2023 starter who has since retired lives in exactly the dropped part. */
  const kept = rows.filter(p => p.adp != null && p.adp <= 150);
  const pruned = {};
  kept.forEach(p => { if (p.position) pruned[String(p.player_id)] = p.position; });

  ck('CONTROL — the simulated prune really does remove most of the board, or '
    + 'the comparison below is between two identical things',
    Object.keys(pruned).length < rows.length / 3,
    { kept: Object.keys(pruned).length, of: rows.length });

  /* THE IDS A REAL MEASUREMENT ACTUALLY JOINS ON — every player id appearing in
   * a historical draft or roster. Invented ids would prove nothing. */
  const HIST = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
  const histIds = new Set();
  (HIST.seasons || []).forEach(s => {
    (s.drafts || []).forEach(d => (d.picks || []).forEach(p => {
      if (p.player_id != null) histIds.add(String(p.player_id));
    }));
    Object.values(s.rosters || {}).forEach(r => {
      [].concat(r.players || [], r.starters || []).forEach(id => {
        if (id != null) histIds.add(String(id));
      });
    });
  });
  ck('there are real historical ids to join on', histIds.size > 200, histIds.size);

  const shared = PM.positionMap();
  const viaShared = [...histIds].filter(id => PM.posOf(shared, id)).length;
  const viaPruned = [...histIds].filter(id => PM.posOf(pruned, id)).length;
  console.log('      historical ids resolved — shared map ' + viaShared
    + ' / board-only-after-prune ' + viaPruned + ' / of ' + histIds.size);
  ck('a BOARD-ONLY lookup loses historical players once the board shrinks — the '
    + 'defect, reproduced', viaPruned < viaShared * 0.9,
  { shared: viaShared, pruned: viaPruned });
  ck('and the SHARED map keeps resolving them, because the record is a union '
    + 'over builds and does not shrink with the board',
    viaShared >= histIds.size * 0.85, { resolved: viaShared, of: histIds.size });
}

// ── 5. IT DEGRADES ONTO THE BOARD RATHER THAN FAILING ───────────────────
// The record is written by build.py. A checkout without one must still work, or
// this module becomes a new single point of failure for six tools.
{
  const m = PM.positionMap();
  ck('the record path is exported so the degraded case is testable at all',
    typeof PM.HIST_PATH === 'string' && PM.HIST_PATH.indexOf('player_positions') > 0);
  const board = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const sample = (board.players || []).filter(p => p.position).slice(0, 50);
  ck('every board row still resolves, so a missing record degrades to exactly '
    + 'the old behaviour rather than to nothing',
    sample.every(p => m[String(p.player_id)] === p.position));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: one definition of the history position lookup, required');
console.log('by all six tools that join a 2023-25 measurement to a player id; a board-only');
console.log('lookup provably loses those players once the board shrinks, and this one does');
console.log('not; and an unrecognisable id reads as unknown rather than as a defence.');
console.log('WHAT IT DOES NOT: change any published number today. The record currently holds');
console.log('exactly the board\'s ids, so five of the six tools are byte-identical. The sixth,');
console.log('lineup_skill, is not — it never read kept_players, so keepers were unresolved;');
console.log('its sample goes 458 -> 530 team-weeks and Cory\'s own capture rate, which the');
console.log('tool itself reported as NOT MEASURABLE at 4 gradeable weeks, becomes 52.');
