/* A KEEPER SEEDED WITHOUT `vorp` IS SCORED AS WORTH ZERO, AND THE SCREEN THEN
 * TELLS CORY HE BEATS HIM.
 *
 * Register E17. `kept_players` is a different population from `players` and
 * carries a different field set — it lacks `vorp`, `replacement`, `pos_rank`,
 * `tier` and `adjusted_adp`. `populateKeepers` pushed the row through verbatim,
 * so `ctx.currentKeepers` held three players with `vorp === undefined`, and
 * `composite.js:nextYearVorp` reads `(player.vorp || 0)` — absent became a
 * confident ZERO.
 *
 * The keeper bar is the weakest incumbent. With all three scored at zero the
 * bar went NEGATIVE, so `max(0, raw - bar)` ADDED to every candidate. At pick
 * 33, Cory's first, the war room said:
 *
 *     Zay Flowers - KEEPER TARGET ... he beats Ja'Marr Chase for the last
 *     slot by 17 pts
 *
 * Run: node draft/tests/keeper_seeded_with_a_value.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const C = require(path.join(ROOT, 'public', 'js', 'draft', 'composite.js'));
const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

/* Lift the real helper rather than re-implementing it: a private copy would
 * pass forever while the shipped one rotted. */
function lift(name) {
  const at = SRC.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('helper not found in app.js: ' + name);
  let i = SRC.indexOf('{', at), depth = 0, end = -1;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') depth++;
    else if (SRC[j] === '}') { depth--; if (!depth) { end = j + 1; break; } }
  }
  return SRC.slice(at, end);
}
const withKeeperValuation = new Function(lift('withKeeperValuation')
  + '\nreturn withKeeperValuation;')();

const BOARD = path.join(ROOT, 'public', 'draft_data.json');
if (!fs.existsSync(BOARD)) { console.log('SKIP  no built board'); process.exit(0); }
const art = JSON.parse(fs.readFileSync(BOARD, 'utf8'));
const board = art.players, league = art.league, teams = league.teams || 10;
const RP = art.replacement.replacement_points;

// ─────────────────────── 1. the artifact really does omit it
ck('kept_players carry proj_mean but NOT vorp — the premise of this whole file',
  art.kept_players.length > 0
  && art.kept_players.every(k => k.proj_mean != null && k.vorp === undefined),
  art.kept_players.map(k => ({ n: k.name, proj: k.proj_mean, vorp: k.vorp })));

// ─────────────────────── 2. the derivation is the board's own, not invented
{
  const wrong = board.filter(p => p.vorp != null && p.proj_mean != null
    && Math.abs(Math.round((p.proj_mean - RP[p.position]) * 100) / 100 - p.vorp) > 0.011);
  ck('vorp === round(proj_mean - replacement_points[pos], 2) on EVERY board row, '
    + 'so deriving it for a keeper applies the artifact\'s own formula',
  wrong.length === 0, wrong.slice(0, 3).map(p => p.name));
}

// ─────────────────────── 3. the seeding now supplies it
const seeded = art.kept_players.map(k => withKeeperValuation(k, art));
ck('every seeded keeper carries a finite, positive vorp',
  seeded.every(k => Number.isFinite(k.vorp) && k.vorp > 0),
  seeded.map(k => k.name + '=' + k.vorp));
ck('and it matches the board formula exactly',
  seeded.every(k => k.vorp === Math.round((k.proj_mean - RP[k.position]) * 100) / 100),
  seeded.map(k => ({ n: k.name, got: k.vorp, want: Math.round((k.proj_mean - RP[k.position]) * 100) / 100 })));
ck('is_keeper survives the seeding', seeded.every(k => k.is_keeper === true));

// ─────────────────────── 4. ABSENT STAYS ABSENT — no fallback constant
ck('an unknown position leaves vorp ABSENT rather than guessing a replacement',
  withKeeperValuation({ name: 'X', position: 'ZZ', proj_mean: 200 }, art).vorp === undefined);
ck('a row with no projection leaves vorp ABSENT',
  withKeeperValuation({ name: 'X', position: 'RB' }, art).vorp === undefined);
ck('an already-valued row is not overwritten',
  withKeeperValuation({ name: 'X', position: 'RB', proj_mean: 200, vorp: 42 }, art).vorp === 42);

// ─────────────────────── 5. THE BAR STOPS BEING NEGATIVE
const rawSeed = art.kept_players.map(k => Object.assign({}, k, { is_keeper: true }));
function ctxAt(pick, ks) {
  return { league: league, board: board, roster: ks.slice(),
    currentKeepers: ks.filter(p => p.is_keeper), currentPick: pick };
}
function barAt(pick, ks) {
  const c = ctxAt(pick, ks);
  const r = ks.map(p => C.keeperOptionValueRaw(p, c).value).sort((a, b) => b - a);
  return r.length >= 3 ? r[2] : 0;
}
{
  const rd1 = 1, pick = (rd1 - 1) * teams + 1;
  ck('KNOWN-POSITIVE: with vorp absent the round-1 bar is NEGATIVE, which is what '
    + 'made it ADD to every candidate instead of subtracting',
  barAt(pick, rawSeed) < -10, { bar: barAt(pick, rawSeed) });
  ck('and the seeded keepers raise it', barAt(pick, seeded) > barAt(pick, rawSeed),
    { before: barAt(pick, rawSeed), after: barAt(pick, seeded) });
}

// ─────────────────────── 6. THE FALSE CLAIM IS GONE, AT CORY'S REAL PICKS
{
  const myPicks = art.pick_order.my_picks;
  const byAdp = board.slice().sort((a, b) => (a.adjusted_adp || 9999) - (b.adjusted_adp || 9999));
  const takenAt = pick => {
    const s = new Set();
    for (let i = 0; i < pick - 1 && i < byAdp.length; i++) s.add(String(byAdp[i].player_id));
    return s;
  };
  const mkCtx = (pick, ks) => {
    const t = takenAt(pick);
    return { league: league, board: board.filter(p => !t.has(String(p.player_id))),
      roster: ks.slice(), currentKeepers: ks.filter(p => p.is_keeper),
      currentPick: pick, taken: t };
  };
  const count = ks => myPicks.reduce((n, pk) => {
    const c = mkCtx(pk, ks);
    return n + c.board.filter(p => C.keeperOptionValue(p, c).value >= C.CFG.KOV_BADGE_AT).length;
  }, 0);
  const before = count(rawSeed), after = count(seeded);
  ck('KNOWN-POSITIVE: the unseeded state really did fire KEEPER TARGET badges at '
    + 'Cory\'s picks — if this hits 0 the defect is gone and this file must be re-read',
  before > 0, { badges: before });
  ck('and with the keepers valued, none of them survive', after === 0,
    { before: before, after: after });

  /* THE NAMED CLAIM, because a count is not the thing that was wrong. */
  const c33 = mkCtx(33, rawSeed);
  const flowers = c33.board.find(p => p.name === 'Zay Flowers');
  ck('the specific false claim reproduces: at pick 33 a candidate was said to beat '
    + 'a named keeper for the last slot',
  !!flowers && C.keeperOptionValue(flowers, c33).value >= C.CFG.KOV_BADGE_AT
    && art.kept_players.some(k => k.name === C.keeperOptionValue(flowers, c33).displaced),
  flowers && { who: flowers.name, beats: C.keeperOptionValue(flowers, c33).displaced,
    by: Math.round(C.keeperOptionValue(flowers, c33).value) });
  const c33f = mkCtx(33, seeded);
  const flowersF = c33f.board.find(p => p.name === 'Zay Flowers');
  ck('and it does not survive the fix',
    C.keeperOptionValue(flowersF, c33f).value < C.CFG.KOV_BADGE_AT,
    { value: C.keeperOptionValue(flowersF, c33f).value });
}

// ─────────────────────── 7. AND THE RANKING DOES NOT MOVE
{
  const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
  const W = E.MEASURED_WEIGHTS;
  if (!W || typeof W.value !== 'number') {
    throw new Error('REFUSING to score: engine.js no longer exports MEASURED_WEIGHTS');
  }
  const myPicks = art.pick_order.my_picks;
  const byAdp = board.slice().sort((a, b) => (a.adjusted_adp || 9999) - (b.adjusted_adp || 9999));
  let moved = 0;
  myPicks.forEach(pk => {
    const t = new Set();
    for (let i = 0; i < pk - 1 && i < byAdp.length; i++) t.add(String(byAdp[i].player_id));
    const mk = ks => ({ league: league, board: board.filter(p => !t.has(String(p.player_id))),
      weights: W, roster: ks.slice(), currentKeepers: ks.filter(p => p.is_keeper),
      currentPick: pk, taken: t });
    const a = E.recommend(mk(rawSeed)), b = E.recommend(mk(seeded));
    const an = (a.scored || a).slice(0, 10).map(s => (s.player || {}).name);
    const bn = (b.scored || b).slice(0, 10).map(s => (s.player || {}).name);
    moved += an.filter((n, i) => n !== bn[i]).length;
  });
  ck('0 of 120 name slots move across Cory\'s twelve picks — this corrects a false '
    + 'claim, not a ranking (measured, not assumed)', moved === 0, { slots_moved: moved });
}

// ─────────────────────── 8. THE FAIL ARM
{
  const reverted = SRC.replace(/state\.myRoster\.push\(withKeeperValuation\(k, data\)\);/,
    'state.myRoster.push(Object.assign({}, k, { is_keeper: true }));');
  /* The CALL SITE, not the bare name — the function DEFINITION also contains
   * `withKeeperValuation(k, data)`, so a loose pattern matched the declaration
   * and this arm passed while asserting nothing. It caught that on first run. */
  ck('FAIL ARM: with the seeding reverted, the wiring check goes red',
    !/state\.myRoster\.push\(withKeeperValuation\(/.test(reverted));
  ck('the shipped file really does call it',
    /state\.myRoster\.push\(withKeeperValuation\(k, data\)\);/.test(SRC));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
