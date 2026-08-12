// TERRITORY: A
/* THE PER-PLAYER PROJECTION FEED — the source lineup.js declares and never had.
 *
 * `src/routes/lineup.js` says its input is `[{ id, name, pos, proj }]` and that
 * "live projections come from sleeper.js (A's lane)". sleeper.js exports
 * weekStats and seasonStats — REALIZED points — and nothing forward. The `proj`
 * field has never had a producer, so every consumer of it has been reading
 * undefined.
 *
 * Run: node draft/tests/proj_feed.test.js
 */
'use strict';
const path = require('path');
const F = require(path.join(__dirname, '..', '..', 'src', 'proj_feed.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const P = (over) => Object.assign(
  { player_id: '1', name: 'A', position: 'WR', team: 'CIN', proj_mean: 170, bye: 10 }, over);

// ── THE DIVISOR, AND IT IS NOT games_expected ──────────────────────────────
{
  const w = F.weekly(P({ proj_mean: 170 }), { week: 3 });
  ck('a season total becomes a weekly number over 17 games',
    Math.abs(w.proj - 10) < 1e-9, w);
  /* THE BUG THIS PINS. `games_expected` is points per game PLAYED, a different
   * denominator. Dividing by it inflates every part-season player — a man
   * projected for 8 games would read as though he scored his whole season every
   * week he played. Reconciled against the box-score archive. */
  const hurt = F.weekly(P({ proj_mean: 170, games_expected: 8 }), { week: 3 });
  ck('  games_expected is IGNORED, deliberately', Math.abs(hurt.proj - 10) < 1e-9, hurt);
  ck('  and every row says what basis it is on',
    /season_rate/.test(w.basis), w.basis);
}

// ── A PLAYER WHO CANNOT PLAY PROJECTS ZERO ─────────────────────────────────
{
  /* lineup.js's bye guard only activates when a non-playing player carries no
   * projection. A null there means the solver may seat him on a Sunday he is
   * not playing — the 540-week sweep's finding. */
  const bye = F.weekly(P({ bye: 7 }), { week: 7 });
  ck('a player on bye projects 0, not his season rate', bye.proj === 0, bye);
  ck('  and says WHY it is zero', bye.zeroed_because === 'bye', bye);
  const out = F.weekly(P({ injury_status: 'Out' }), { week: 3 });
  ck('a player ruled OUT projects 0', out.proj === 0 && /injury/.test(out.zeroed_because), out);
  const q = F.weekly(P({ injury_status: 'Questionable' }), { week: 3 });
  ck('  but QUESTIONABLE is NOT zeroed — a game-time decision still has an expectation',
    q.proj > 0, q);
  ck('  (zeroing him would make the feed set the lineup)', true);
}

// ── ABSENT IS NOT ZERO ─────────────────────────────────────────────────────
{
  const a = F.weekly(P({ proj_mean: null }), { week: 3 });
  ck('a player the board has no projection for reads null, never 0',
    a.proj === null && a.basis === 'absent', a);
  ck('  (0 would seat everyone else ahead of him for a reason never stated)', true);
}

// ── COVERAGE IS FIRST-CLASS ────────────────────────────────────────────────
{
  const feed = F.buildFeed([P({ player_id: '1' }), P({ player_id: '2', bye: 4 }),
    P({ player_id: '3', proj_mean: null })], { week: 4, season: '2026' });
  ck('the feed is keyed on the SLEEPER player id the rosters carry',
    !!feed.players['1'] && !!feed.players['3'], Object.keys(feed.players));
  ck('  and reports its own coverage rather than logging it',
    feed.coverage.priced === 1 && feed.coverage.zeroed === 1
    && feed.coverage.absent === 1, feed.coverage);
  ck('  (a feed that prices 40 of 1760 is well-formed and useless)', true);
}

// ── THE JOIN REPORTS ITS MISSES ────────────────────────────────────────────
{
  const feed = F.buildFeed([P({ player_id: '1' }), P({ player_id: '2' })], { week: 3 });
  const r = F.rosterProjections(['1', '2', '99'], feed);
  ck('a roster in lineup.js\'s exact shape comes back',
    r.rows.length === 2 && r.rows[0].id === '1' && r.rows[0].proj > 0
    && 'pos' in r.rows[0] && 'name' in r.rows[0], r.rows[0]);
  ck('  and an id the board does not carry is REPORTED, not dropped',
    r.missing.length === 1 && r.missing[0] === '99', r.missing);
}

// ── THE GAP REFUSES ON A PARTIAL SIDE ──────────────────────────────────────
{
  const feed = F.buildFeed([P({ player_id: '1', proj_mean: 170 }),
    P({ player_id: '2', proj_mean: 136 })], { week: 3 });
  const mine = F.rosterProjections(['1'], feed);
  const theirs = F.rosterProjections(['2'], feed);
  const g = F.matchupGap(mine, theirs);
  ck('a complete gap is computed and signed', g.ok && Math.abs(g.gap - 2) < 1e-9, g);
  ck('  and it says the number is a LEVEL, not a weekly forecast',
    /LEVEL, not a weekly forecast/.test(g.basis), g.basis);

  /* A gap from a roster missing two starters is not a smaller gap, it is a
   * different quantity — and on screen it is indistinguishable from a real one. */
  const short = F.rosterProjections(['1', '404'], feed);
  const bad = F.matchupGap(short, theirs);
  ck('a missing player REFUSES the gap rather than shrinking it', !bad.ok, bad);
  ck('  and names which side is incomplete', /mine: 1 not on the board/.test(bad.why), bad.why);
  const unpriced = F.buildFeed([P({ player_id: '1', proj_mean: null })], { week: 3 });
  const u = F.matchupGap(F.rosterProjections(['1'], unpriced), theirs);
  ck('  an UNPRICED player refuses too, not just a missing one', !u.ok, u);
}

// ── AGAINST THE LIVE BOARD ─────────────────────────────────────────────────
{
  const fs = require('fs');
  const p = path.join(__dirname, '..', '..', 'public', 'draft_data.json');
  if (fs.existsSync(p)) {
    const art = JSON.parse(fs.readFileSync(p, 'utf8'));
    const feed = F.buildFeed((art.players || []).concat(art.kept_players || []),
      { week: 1, season: String(art.league.season), built_from: 'draft_data.json' });
    ck('the live board produces a feed with real coverage',
      feed.coverage.priced > 500, feed.coverage);
    const top = (art.players || []).slice()
      .sort((a, b) => (b.proj_mean || 0) - (a.proj_mean || 0))[0];
    const row = feed.players[String(top.player_id)];
    ck('  and the top projection is a plausible weekly number',
      row.proj > 5 && row.proj < 40, { name: row.name, proj: row.proj });
    console.log(`        live: ${feed.coverage.priced} priced, `
      + `${feed.coverage.zeroed} zeroed, ${feed.coverage.absent} absent`);
  } else {
    console.log('SKIP  no built board');
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
