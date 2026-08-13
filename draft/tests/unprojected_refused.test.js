// TERRITORY: A
/* A PLAYER WITH NO PROJECTION IS REFUSED, NOT RANKED.
 *
 * 1181 of the board's 1759 players carry proj_mean 0, and vorp for such a player
 * is a POSITION CONSTANT — every unprojected WR is -172.7, every RB -188.5.
 * They are not merely bad, they are INDISTINGUISHABLE, and a 1181-way tie is
 * decided by whatever the sort happens to favour.
 *
 * They were not safely buried: the first sat at board rank 161 at pick 8 and
 * rank 150 at pick 148 — inside a 150-pick draft — and the man at that rank was
 * Adam Vinatieri, retired since 2019. Three attempts at slot-aware VONA
 * promoted members of this block into the top ten the moment they disturbed
 * ordering in the tail. The old valuation was holding them down BY ACCIDENT.
 *
 * THIS SUITE PINS THE INVARIANT, NOT THE COUNTS. The numbers move when ingest
 * improves; "no unprojected player is rankable" must not.
 *
 * Run: node draft/tests/unprojected_refused.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const KEEP = require(path.join(ROOT, 'draft', 'tools', 'keepers_of.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const L = DATA.league;
const pool = DATA.players.filter(p => p.position && p.proj_mean != null && p.vorp != null);
const keep = KEEP.keepersFrom(DATA);
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));

function at(pick) {
  const t = new Set(byAdp.slice(0, pick - 1).map(p => String(p.player_id)));
  keep.forEach(k => t.add(String(k.player_id)));
  const board = pool.filter(p => !t.has(String(p.player_id)));
  return E.recommend({ board, roster: keep, league: L, currentPick: pick,
    nextPick: pick + 5, totalPicks: 150, myPicksLeft: 5, roundsLeft: 5,
    runMultipliers: {}, intervening: [], weights: E.MEASURED_WEIGHTS });
}

// ── CONTROL: the tie block is real, or this suite guards nothing ───────────
{
  const zero = pool.filter(p => (p.proj_mean || 0) === 0);
  ck('CONTROL: the board really does carry unprojected players',
    zero.length > 100, zero.length);
  const wr = new Set(zero.filter(p => p.position === 'WR').map(p => Math.round((p.vorp || 0) * 10)));
  ck('  and their vorp is a POSITION CONSTANT — they are indistinguishable',
    wr.size === 1, { distinct_wr_vorp_values: wr.size });
}

// ── THE INVARIANT ─────────────────────────────────────────────────────────
[1, 8, 73, 148].forEach(pick => {
  const all = at(pick);
  const rankable = all.filter(x => E.scoreable(x));
  const bad = rankable.filter(x => !(Number(x.player.proj_mean) > 0));
  ck('pick ' + pick + ': no unprojected player is rankable',
    bad.length === 0, bad.slice(0, 3).map(x => x.player.name));
  ck('  and there is still a deep rankable board to draft from',
    rankable.length > 200, rankable.length);
});

// ── REFUSED, NOT DROPPED ──────────────────────────────────────────────────
{
  const all = at(1);
  const refused = all.filter(x => !E.scoreable(x));
  ck('an unprojected player is REFUSED rather than removed from the list',
    refused.length > 100, refused.length);
  ck('  and each one SAYS why, so a missing man reads as missing data',
    refused.every(x => x.score_error && /no projection/.test(x.score_error.reason)));

  /* THE ONE THAT MATTERS. Refusal must not quietly hide somebody the market
   * expects in the middle rounds. Pearsall (ADP ~107) is currently the only
   * unprojected player inside the draftable range; if that count grows, the
   * board has an ingest problem this suite should surface rather than absorb. */
  const inRange = refused.filter(x => adpOf(x.player) <= 250);
  ck('at most ONE unprojected player sits inside ADP 250',
    inRange.length <= 1, inRange.map(x => x.player.name + ' @' + Math.round(adpOf(x.player))));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
