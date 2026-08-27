/* THE WIRE-BENCH REMEDY ON FILE WOULD NOT MAKE THE FEATURE WORK.
 *
 * Register E22, and it is deliberately ADDITIVE to an existing filing rather
 * than a re-report of it. ROUTES already records (2026-08-16) that
 * `VONA_WIRE_BENCH` is dead code because the branch is unreachable while
 * `VONA_SLOT_AWARE` is false, with a ruling pending and one proposed remedy:
 * "finish slot-aware so the branch is reachable".
 *
 * THAT REMEDY IS NOT SUFFICIENT. Even reachable, the DATA never arrives.
 * `app.js:2079` reads `state.data.wire_level`; `build.py` never writes
 * `wire_level` onto the board. The measured artifact
 * `draft/data/wire_level.json` is committed and real — 422 scored acquisitions
 * across 2023-25 — and is simply not joined into `public/draft_data.json`.
 *
 * So `ctx.wireWeekly` was null in production, `wireBenchValue` returned null on
 * its first line, and every player fell back to the vorp rule — a fallback
 * whose own comment documents it as the K/DEF case ("nflverse is
 * offense-only"), i.e. a per-POSITION gap being taken by every position.
 *
 * ── ✅ THE JOIN LANDED, AND THIS FILE WAS STILL MOURNING IT (2026-08-20) ────
 *
 * The board now carries top-level `wire_level` — QB 23.38 · RB 7.8 · WR 10.85 ·
 * TE 11.6 — with full provenance in `wire_level_source`. The fix shipped; the
 * test that MEMORIALIZED the gap was never flipped, so it kept asserting
 * `ART.wire_level === undefined` and turned CI red over its own remedy
 * arriving. Found by the relay's T-minus-2 sweep, which called it exactly
 * right: "a STALE TOMBSTONE... GOOD NEWS misread as red."
 *
 * ⚠️ A TEST THAT PINS AN ABSENCE MUST BE FLIPPED THE DAY THE ABSENCE ENDS, and
 * nothing makes that happen automatically — the assertion goes red, someone
 * reads "test failing" instead of "gap closed", and the signal inverts. The
 * filename is left alone deliberately: renaming it would break every inbound
 * reference, and the header is where the history belongs.
 *
 * It now pins the JOIN'S PRESENCE and that the board agrees with the measured
 * artifact, which is the property worth protecting from here on. Nothing here
 * asserts a flag should flip — that is still A's ruling.
 *
 * Run: node draft/tests/wire_level_never_reaches_the_board.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const BOARD = path.join(ROOT, 'public', 'draft_data.json');
const WIRE = path.join(ROOT, 'draft', 'data', 'wire_level.json');
if (!fs.existsSync(BOARD)) { console.log('SKIP  no built board'); process.exit(0); }
const ART = JSON.parse(fs.readFileSync(BOARD, 'utf8'));

// ─────────────── 1. the artifact is real, and the board does not carry it
ck('the measured wire artifact exists and is committed', fs.existsSync(WIRE));
const WL = JSON.parse(fs.readFileSync(WIRE, 'utf8'));
ck('it carries a per-position weekly level for the four offensive positions',
  ['QB', 'RB', 'WR', 'TE'].every(p => typeof WL.per_week[p] === 'number'), WL.per_week);
ck('and it is measured, not asserted — a real sample size travels with it',
  WL.scored > 100 && Array.isArray(WL.seasons) && WL.seasons.length >= 2,
  { scored: WL.scored, seasons: WL.seasons });

/* FLIPPED 2026-08-20 — this asserted `=== undefined` to document the gap. */
ck('THE JOIN LANDED: the published board carries a top-level `wire_level`',
  ART.wire_level && typeof ART.wire_level === 'object', Object.keys(ART).slice(0, 40));
ck('...for all four offensive positions, as numbers',
  ['QB', 'RB', 'WR', 'TE'].every(q => typeof (ART.wire_level || {})[q] === 'number'),
  ART.wire_level);
/* ⚠️ THIS CHECK ASKED TWO QUESTIONS AND REPORTED THEM AS ONE, and only one of
 * them is a join defect. It compared the board's flat `wire_level` against the
 * COMMITTED FILE ON DISK TODAY, and called any difference "a join that lands
 * with different numbers" — the sentence for a broken join. But the file on disk
 * can legitimately move AFTER a board is built, and when it does this printed
 * that sentence about a join that was perfect at build time.
 *
 * IT IS NOT A HYPOTHETICAL — it is what happened on 2026-08-26 and it is
 * STRUCTURAL, not decay. `build.py` writes `draft/data/player_positions.json` as
 * a UNION THAT MAY ONLY GROW ("written BEFORE the activity filter so the wire
 * sample cannot shrink", build.py ~1232), so every board build can add ids;
 * `wire_level.js` resolves its 2023-25 wire adds through that record; so the
 * measured sample GROWS BY DESIGN and any snapshot of it goes stale on its own.
 * Measured: one id (4080, a 2023 week-2 WR add worth 0.0) gained a position
 * record between the 08-17 build and the 08-25 one, taking the WR sample 114 ->
 * 115 and the pooled median from the even-n midpoint of (10.60, 11.10) = 10.85
 * to the odd-n order statistic 10.60. QB, RB and TE did not move by a cent.
 * ROUTES already recorded the SAME event one iteration earlier — "stale by one
 * player", n 113 vs 114 — which is what shows this is a mechanism and not a bug.
 *
 * SO THE TWO QUESTIONS ARE ASKED SEPARATELY, same split as register 348:
 *
 *   · THE JOIN — is the flat map the board serves the same numbers as the
 *     provenance block it was built from? That is checkable INSIDE the board,
 *     needs no file on disk, and is true or false forever once the board is
 *     written. A mismatch here really is worse than no join.
 *   · THE STALENESS — has the measurement moved since this board was built?
 *     That is a REBUILD question, not a join question, and it has a direction:
 *     the sample may only grow. A board behind the artifact is expected between
 *     a build and the next one; the artifact SHRINKING is the alarm, because
 *     build.py's union is written specifically so it cannot.
 *
 * Register 351 ③. */
ck('THE JOIN: the flat `wire_level` the board serves is the same numbers as the '
  + '`wire_level_source` provenance block it was built from — a join that lands '
  + 'with different numbers is worse than no join',
  ART.wire_level_source && ART.wire_level_source.per_week
    && ['QB', 'RB', 'WR', 'TE'].every(q =>
      Math.abs(ART.wire_level[q] - ART.wire_level_source.per_week[q]) < 0.01),
  { board: ART.wire_level,
    provenance: (ART.wire_level_source || {}).per_week });

{
  /* STALENESS, with the direction that makes it readable. `n` travels on both
   * sides, so this compares SAMPLES rather than medians — a median can move
   * either way on one added observation (it just did), but the sample itself is
   * monotone by construction. */
  const bn = ((ART.wire_level_source || {}).n) || {};
  const an = WL.n || {};
  const POS = ['QB', 'RB', 'WR', 'TE'];
  const shrunk = POS.filter(q => typeof bn[q] === 'number' && typeof an[q] === 'number'
    && an[q] < bn[q]);
  const behind = POS.filter(q => typeof bn[q] === 'number' && typeof an[q] === 'number'
    && an[q] > bn[q]);
  ck('STALENESS: the committed measurement has not SHRUNK below the sample this '
    + 'board was built from — build.py\'s position record is a union that may '
    + 'only grow, so a smaller sample means that guarantee broke',
    shrunk.length === 0, { shrunkAt: shrunk, board_n: bn, artifact_n: an });
  if (behind.length) {
    console.log('NOTE  the committed measurement has GROWN past this board at '
      + behind.join('/') + ' (board ' + JSON.stringify(bn) + ' -> artifact '
      + JSON.stringify(an) + '). Expected between a wire_level.json regeneration '
      + 'and the next board rebuild; the next build picks it up. Not a join '
      + 'defect — see the header.');
  }
}
ck('...and it ships its own provenance, so nobody has to trust the number '
  + 'because it is present',
  ART.wire_level_source && ART.wire_level_source.per_week
    && ART.wire_level_source.n,
  ART.wire_level_source ? Object.keys(ART.wire_level_source) : null);

// ─────────────── 2. the app reads the key the board does not have
{
  const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  ck('app.js reads `state.data.wire_level` into ctx.wireWeekly — consumer and '
    + 'producer are now BOTH wired, which is what makes the join real',
  /wireWeekly:\s*\(state\.data \|\| \{\}\)\.wire_level/.test(app));
}

// ─────────────── 3. the engine's guard turns absence into the K/DEF fallback
{
  const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'), 'utf8');
  ck('wireBenchValue returns null when the map is absent',
    /const wireWeekly = \(ctx && ctx\.wireWeekly\) \|\| \{\};/.test(src)
    && /if \(wire == null\) return null;/.test(src));
  ck('and the fallback is documented as the per-POSITION K/DEF case, not a '
    + 'whole-map case — which is what makes taking it wholesale wrong',
  /nflverse is offense-only/.test(src));
}

// ─────────────── 4. KNOWN-POSITIVE: the data would matter if it arrived
/* The point of the file. Force the outer flag — the remedy on file — and show
 * the wire data still changes scores, i.e. the branch reaching the code is NOT
 * the same as the branch working. CFG is exported directly and this process is
 * throwaway, so mutating it here affects nothing else. */
{
  const RP = ART.replacement.replacement_points;
  const board = ART.players;
  /* ⚠️ FILTERED TO CORY'S SEAT (A, 2026-08-24, register 303). Post-lock
   * `kept_players` is the whole league's 23, and these rows go to
   * `ctx.currentKeepers`, which composite.js folds into INCUMBENTS —
   * the men competing for MY keeper slots. Its own comment says "with
   * three valued keepers the bar is ranked[2]". Twenty-three inflates
   * that bar and collapses every candidate's keeper value, and `keeper`
   * ships at weight 1.0. */
  const _mySlot = String((ART.league || {}).my_draft_slot);
  const keepers = ART.kept_players
    .filter(k => String(k.team_slot) === _mySlot)
    .map(k => Object.assign({}, k, { is_keeper: true,
      vorp: Math.round((k.proj_mean - RP[k.position]) * 100) / 100 }));
  const burrow = board.find(p => p.name === 'Joe Burrow');
  const byAdp = board.slice().sort((a, b) => (a.adjusted_adp || 9999) - (b.adjusted_adp || 9999));
  const PB = ART.pick_order.picks, MY = ART.pick_order.my_picks;
  const run = (pick, wire) => {
    const roster = keepers.concat(burrow ? [burrow] : []);
    const t = new Set();
    for (let i = 0; i < pick - 1 && i < byAdp.length; i++) t.add(String(byAdp[i].player_id));
    roster.forEach(p => t.add(String(p.player_id)));
    const ctx = { board: board.filter(p => !t.has(String(p.player_id))), roster: roster,
      currentKeepers: keepers, league: ART.league, weights: E.MEASURED_WEIGHTS,
      currentPick: pick, nextPick: MY.find(q => q > pick) || null, totalPicks: 150,
      myPicksLeft: MY.filter(q => q >= pick).length, roundsLeft: 8,
      runMultipliers: {}, intervening: [], pickBoard: PB, taken: t };
    if (wire) ctx.wireWeekly = WL.per_week;
    return E.onTheClock(ctx, { targets: [], avoid: [] }).scored;
  };

  const wasAware = E.CFG.VONA_SLOT_AWARE;
  const wasWire = E.CFG.VONA_WIRE_BENCH;
  try {
    // CONTROL: at the SHIPPED flags the data changes nothing, because the
    // branch is unreachable. That half is the existing filing, re-verified.
    E.CFG.VONA_SLOT_AWARE = false;
    const a0 = run(93, false), b0 = run(93, true);
    const m0 = new Map(a0.map(s => [s.player.player_id, s.score]));
    const moved0 = b0.filter(s => Math.abs(s.score - (m0.get(s.player.player_id) || 0)) > 0.005).length;
    ck('CONTROL: at the shipped flags, supplying the wire data changes NOTHING '
      + '(the branch is unreachable — the half already on file)', moved0 === 0, { moved: moved0 });

    // KNOWN-POSITIVE: apply the remedy on file, and the data still matters.
    E.CFG.VONA_SLOT_AWARE = true;
    const a1 = run(93, false), b1 = run(93, true);
    const m1 = new Map(a1.map(s => [s.player.player_id, s.score]));
    const moved1 = b1.filter(s => Math.abs(s.score - (m1.get(s.player.player_id) || 0)) > 0.005).length;
    ck('KNOWN-POSITIVE: with slot-aware forced true — the remedy on file — the '
      + 'wire data changes many scores, so making the branch REACHABLE is not '
      + 'the same as making it WORK', moved1 > 20, { moved: moved1 });
  } finally {
    E.CFG.VONA_SLOT_AWARE = wasAware;
    E.CFG.VONA_WIRE_BENCH = wasWire;
  }
  ck('the flags are restored, so this file cannot leak state into a shared run',
    E.CFG.VONA_SLOT_AWARE === wasAware && E.CFG.VONA_WIRE_BENCH === wasWire);
}

// ─────────────── 5. the stale self-description is gone
{
  const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'), 'utf8');
  ck('the docstring no longer says OFF BY DEFAULT while the flag is on',
    !/PROTOTYPED 2026-08-14\/15, OFF BY DEFAULT/.test(src));
  ck('and VONA_WIRE_BENCH really is on, which is what made that stale',
    E.CFG.VONA_WIRE_BENCH === true);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
