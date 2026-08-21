// TERRITORY: A
/* CORY, 2026-08-21: "Does changing source change VONA as well?"
 *
 * It does, and this file is here so it keeps doing it. THE FAILURE THIS GUARDS
 * IS A TOGGLE THAT LOOKS LIVE AND IS INERT — a class this repo has already paid
 * for once: `CFG.VONA_WIRE_BENCH` read as enabled for days while `vona()`
 * returned before ever reaching the branch, and nothing was red. Here the same
 * shape is available for free: `forSource()` swaps `proj_mean` (via
 * `proj_used_<key>`), and VONA is `player.proj_mean - E[best available]`. Stop
 * swapping that one field and the toggle still re-sorts the Big Board, still
 * drops uncovered players, still prints its ordering note — and silently stops
 * moving the number the recommendation is made from.
 *
 * WHICH REGRESSION, MEASURED, BECAUSE MY FIRST VERSION OF THIS PARAGRAPH
 * OVERCLAIMED. It said "every existing suite would stay green", and for the
 * crude break — deleting 'proj_mean' from SWAP_FIELDS — that is FALSE:
 * `source_board.test.js` pins the field list and goes red. Checked rather than
 * assumed, and the sentence corrected.
 *
 * THE ONE NOTHING ELSE CATCHES is the silent no-op, which is also the likelier
 * one: `forSource` only swaps when `p[proj_used_<key>] != null`, so if
 * `alt_source_rankings.py` ever stops writing those fields, SWAP_FIELDS still
 * lists `proj_mean`, the list-pinning test still passes, and the swap quietly
 * does nothing. Measured by stripping all 5,600 `proj_used_*` fields off the
 * board: `source_board`, `source_top_board`, `board_ordering_note` and
 * `source_toggle_predraft_shape` ALL STAYED GREEN. This file was the only one
 * that went red. That is the gap it exists to cover.
 *
 * MEASURED when this was written, median |VONA shift| vs the blend across the
 * top 200: FantasyPros 3.0, Sleeper 7.3, Draft Sharks 7.5, FFToday 8.4, ESPN
 * 9.9, CBS 9.9, Clay 10.6, our model 19.0. The thresholds below sit well under
 * the smallest of those, because the board is rebuilt nightly and this must
 * pin the BEHAVIOUR, not last night's numbers.
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
require(path.join(ROOT, 'public/js/draft/survival.js'));
require(path.join(ROOT, 'public/js/draft/composite.js'));
require(path.join(ROOT, 'public/js/draft/source_board.js'));
const SB = global.window.SourceBoard;
const E = require(path.join(ROOT, 'public/js/draft/engine.js'));
const data = require(path.join(ROOT, 'public/draft_data.json'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 280) : '')); }
};

const my = ((data.pick_order || {}).my_picks) || [];
const keptIds = ((data.kept_player_ids) || []).map(String);
const kept = (data.kept_players) || [];
const base = data.players.filter(p => !keptIds.includes(String(p.player_id)));

const mk = pool => ({
  board: pool, currentPick: my[0], nextPick: my[1],
  totalPicks: ((data.pick_order || {}).picks || []).length || null,
  roster: kept.slice(), currentKeepers: kept.slice(), league: data.league,
  pickBoard: (data.pick_order || {}).picks || null, intervening: [],
  myPickIndex: 0, totalMyPicks: my.length, myPicksLeft: my.length,
  roundsLeft: my.length, runMultipliers: {}, drift: null, preDraftPrep: true,
});

/* VONA and score for every draftable player under one source view. */
function viewOf(key) {
  const pool = SB.forSource(base, key);
  const ctx = mk(pool);
  const vona = new Map(); const scored = [];
  pool.forEach(p => {
    if (p.adjusted_adp == null || p.adjusted_adp > 200) return;
    const s = E.scorePlayer(p, ctx) || {};
    const c = s.components || {};
    if (c.vona != null) vona.set(p.name, c.vona);
    if (s.score != null) scored.push({ name: p.name, score: s.score });
  });
  scored.sort((a, b) => b.score - a.score);
  return { vona: vona, top: scored.length ? scored[0].name : null };
}

const blend = viewOf(null);
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

ck('CONTROL: the blend view scores a full board, so every comparison below has '
  + 'something to compare against',
blend.vona.size >= 100 && blend.top, { scored: blend.vona.size, top: blend.top });

const tops = [blend.top];
SB.SOURCES.forEach(s => {
  const v = viewOf(s.key);
  tops.push(v.top);
  const shifts = [];
  v.vona.forEach((val, name) => {
    if (blend.vona.has(name)) shifts.push(Math.abs(val - blend.vona.get(name)));
  });

  ck('CONTROL [' + s.label + '] enough shared players to measure — an almost '
    + 'empty overlap would make the check below pass on noise',
    shifts.length >= 100, { shared: shifts.length });

  /* The inertness detector. Threshold 1.0 against a measured minimum of 3.0,
   * so a real source can drift closer to the blend without going red, but a
   * toggle that stopped swapping proj_mean (every shift exactly 0) cannot. */
  ck('[' + s.label + '] switching to this source actually MOVES VONA — the '
    + 'recommendation is made from a different number, not just a re-sorted list',
    median(shifts) > 1.0,
    { medianShift: +median(shifts).toFixed(2), n: shifts.length,
      moved: shifts.filter(x => x > 1e-9).length });
});

/* ── EVERY DISPLAYED NUMBER COMES FROM ONE SOURCE, NOT TWO SPLICED TOGETHER ──
 *
 * Cory, 2026-08-21: "So everything that should changes when I change source??"
 * It did not. `proj_ceiling` and `proj_floor` were absent from SWAP_FIELDS while
 * `alt_source_rankings.py` had been writing per-source versions of both all
 * along, so a source view showed that source's MEAN beside the BLEND's CEILING.
 *
 * This is the third instance of one shape — a frozen field surviving a toggle
 * that everything around it follows (VONA frozen to Draft Sharks; two VONAs on
 * one page; now the band). So the guard is written against the SHAPE rather than
 * against those two field names: for every source, no player may carry a swapped
 * mean beside an unswapped band when that source publishes a band for him.
 */
{
  const bandFields = ['proj_ceiling', 'proj_floor'];
  let checked = 0;
  const spliced = [];
  SB.SOURCES.forEach(s => {
    const view = SB.forSource(base, s.key);
    const byId = new Map(base.map(p => [String(p.player_id), p]));
    view.forEach(q => {
      const o = byId.get(String(q.player_id));
      if (!o || q.proj_mean === o.proj_mean) return;   // mean did not move: nothing to splice
      bandFields.forEach(f => {
        const src = o[f + '_' + s.key];
        if (src == null) return;                        // no band from this source: keeping blend is correct
        checked++;
        if (q[f] !== src) spliced.push({ src: s.key, player: q.name, field: f,
          shown: q[f], should_be: src });
      });
    });
  });
  ck('CONTROL: there are players whose mean moves AND whose source publishes a '
    + 'band, so the check below is measuring something rather than nothing',
  checked >= 100, { comparisons: checked });
  ck('no player shows one source\'s MEAN beside another source\'s BAND — the '
    + 'floor/mean/ceiling a human reads is one opinion, not two spliced',
  spliced.length === 0,
  { spliced: spliced.length, sample: spliced.slice(0, 4) });
}

/* ESPN and Mike Clay are ONE source (register 197) — Clay is ESPN's projections
 * man and both stores score raw stat lines under our table.
 *
 * ⚠️ PINNED ON THE PROJECTIONS, NOT ON VONA, AND THE DIFFERENCE IS THE POINT.
 * I wrote this arm against VONA first, with a threshold of 85% carried over
 * from the 92.4% the PROJECTIONS agree at. It failed at 62.4% — and the code
 * was right, the threshold was wrong. VONA is `proj_mean - E[best available]`,
 * and the second term depends on the POOL: ESPN covers 400 players, Clay 377,
 * so the two views disagree about who is still on the board even where they
 * agree exactly about a player's points. Quoting a number from one
 * distribution and testing it against another is the failure this repo files
 * as rule 3i, and it does not stop being that failure when I am the one doing
 * it inside a guard.
 *
 * So this pins what register 197 actually measured: the two stores' PLAYER
 * PROJECTIONS are the same number. That claim is clean, has no pool term in
 * it, and is the one the blend's double-count rests on.
 *
 * ⚠️ IF THIS GOES RED, THAT IS GOOD NEWS, NOT A BUG: the two ingests have
 * genuinely diverged and are now separate opinions. Re-open register 197 — the
 * blend's double-count may no longer apply, and the "Mike Clay (= ESPN)" label
 * would then be wrong and need removing. */
let shared = 0, identical = 0;
base.forEach(p => {
  if (p.proj_espn == null || p.proj_clay == null) return;
  shared++;
  if (Math.abs(p.proj_espn - p.proj_clay) < 1e-9) identical++;
});
ck('CONTROL: both ESPN and Clay projections are stamped on the board, so the '
  + 'register-197 pin below is measuring something rather than nothing',
shared >= 100, { shared: shared });

ck('KNOWN PROPERTY (register 197): ESPN and Mike Clay carry the SAME per-player '
  + 'projection, because they are one source — if this fails they have diverged '
  + 'and 197 needs re-opening, which would be good news',
shared >= 100 && identical / shared > 0.80,
{ identical: identical, shared: shared,
  pct: shared ? +(100 * identical / shared).toFixed(1) : null });

/* The decision surface, not just the arithmetic: at least one source must
 * disagree with the blend about who to take. If every view named the same
 * player the toggle would be informative about ordering and useless about the
 * pick, which is not what it claims to be. */
const distinctTops = new Set(tops.filter(Boolean));
ck('and the toggle can change the RECOMMENDATION itself — at least one source '
  + 'names a different top pick than the blend',
distinctTops.size >= 2, { tops: [...distinctTops] });

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
