'use strict';
/* C1 — ONE VALUATION, ACROSS EVERY TOOL AND EVERY POOL STATE.
 *
 * The contract: draft, waiver and lineup return the SAME value for the same
 * player and roster state. It broke in production the obvious way — not because
 * the three tools implemented different maths, but because they were handed
 * different POOLS, and the shared valuation quietly re-derived its replacement
 * baseline from whatever it was given.
 *
 * THE BUG THIS SUITE EXISTS FOR (2026-08-10): replacementLevels indexed
 * (starters x teams) into the array it received and clamped with
 * Math.min(length - 1, ...). On a subset the clamp landed on the WORST player in
 * that subset, so the baseline collapsed and every VORP above it inflated. On the
 * live board: RB replacement 189 full vs 225 on a 25-player pool; QB and TE to 0;
 * the same RB (proj 200) worth +11.5 on the draft board and -24.5 on a waiver
 * pool. A sign flip on one player under one set of league rules.
 *
 * So this suite does not check that the formula is right. It checks that the
 * ANSWER DOES NOT MOVE when the pool does, and that where an honest answer is
 * impossible the code FAILS CLOSED (null) instead of inventing one.
 *
 * Run: node draft/tests/c1_agreement.test.js
 */
const fs = require('fs');
const path = require('path');
const V = require('../../public/js/draft/value.js');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n))
  : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

const ART = path.join(__dirname, '..', '..', 'public', 'draft_data.json');
if (!fs.existsSync(ART)) { console.log('SKIP — no artifact'); process.exit(0); }
const art = JSON.parse(fs.readFileSync(ART, 'utf8'));
const league = art.league;

// ── THE PRODUCTION PATH: players carry `replacement`, precomputed over the FULL
// pool by the pipeline. This is subset-independent BY CONSTRUCTION, and that is
// the property the whole contract rests on, so assert it explicitly.
const withRep = art.players.filter(p => p.proj_mean != null && p.replacement != null);
if (withRep.length) {
  const full = V.replacementLevels(withRep, league);
  const states = {
    'thin (25)': withRep.slice(0, 25),
    'post-claim (120)': withRep.slice(0, 120),
    'one position only': withRep.filter(p => p.position === 'RB'),
    'reversed order': withRep.slice().reverse(),
  };
  Object.keys(states).forEach(name => {
    const got = V.replacementLevels(states[name], league);
    const shared = Object.keys(got).filter(k => full[k] != null && got[k] != null);
    const same = shared.every(k => Math.abs(got[k] - full[k]) < 1e-9);
    ck('pipeline replacement is identical on ' + name, same,
       JSON.stringify(shared.filter(k => Math.abs(got[k] - full[k]) >= 1e-9)
         .map(k => k + ': ' + full[k] + ' vs ' + got[k])));
  });
}

// ── THE DERIVED PATH (no `replacement` field): a subset must never invent one.
const bare = art.players.filter(p => p.proj_mean != null)
  .map(p => ({ position: p.position, proj_mean: p.proj_mean }));
const fullDerived = V.replacementLevels(bare, league);
ck('a full pool derives a complete set of levels',
   V.replacementIsComplete(fullDerived), JSON.stringify(fullDerived.__thin || []));

const thinPool = bare.filter(p => p.position === 'RB' || p.position === 'WR').slice(0, 25);
const thinLevels = V.replacementLevels(thinPool, league);
ck('a THIN pool fails closed (null), never a clamped number',
   thinLevels.RB === null || thinLevels.RB === undefined,
   'RB came back ' + JSON.stringify(thinLevels.RB));
ck('a thin pool is reported as incomplete',
   !V.replacementIsComplete(thinLevels),
   JSON.stringify(thinLevels.__thin || []));
ck('the thin positions are NAMED, not just missing',
   (thinLevels.__thin || []).length > 0, JSON.stringify(thinLevels.__thin));

// A position absent from the subset entirely must not read as 0 either — 0 is a
// real baseline ("replacement scores nothing"), which would make every player at
// that position look like a superstar.
ck('a position missing from the subset does not silently become 0',
   thinLevels.QB !== 0 && thinLevels.TE !== 0,
   JSON.stringify({ QB: thinLevels.QB, TE: thinLevels.TE }));

// ── THE GUARD CONSUMERS USE. makeValuer must advertise that it is unusable
// rather than hand back confident numbers off a collapsed baseline.
const thinValuer = V.makeValuer({ league: league, players: thinPool });
ck('makeValuer built on a thin pool reports itself INCOMPLETE',
   thinValuer.complete === false, String(thinValuer.complete));
ck('and names which positions it could not price',
   Array.isArray(thinValuer.thinPositions) && thinValuer.thinPositions.length > 0,
   JSON.stringify(thinValuer.thinPositions));
const fullValuer = V.makeValuer({ league: league, players: bare });
ck('makeValuer on the full pool reports COMPLETE', fullValuer.complete === true);

// ── DELIBERATELY BREAK IT ONCE, so we know the suite can actually catch this
// (Cory's instruction). Reproduce the OLD behaviour — clamp into the subset —
// and confirm it produces the divergence this file exists to prevent.
{
  const starters = league.starters || {};
  const teams = league.teams || 10;
  function oldBuggyLevels(players) {
    const out = {}, byPos = {};
    players.forEach(p => { (byPos[p.position] = byPos[p.position] || []).push(p); });
    Object.keys(byPos).forEach(pos => {
      byPos[pos].sort((a, b) => (b.proj_mean || 0) - (a.proj_mean || 0));
      const idx = Math.min(byPos[pos].length - 1, Math.max(0, (starters[pos] || 1) * teams));
      out[pos] = (byPos[pos][idx] || {}).proj_mean || 0;
    });
    return out;
  }
  const buggyFull = oldBuggyLevels(bare);
  const buggyThin = oldBuggyLevels(thinPool);
  const player = { position: 'RB', proj_mean: 200 };
  const vFull = player.proj_mean - (buggyFull.RB || 0);
  const vThin = player.proj_mean - (buggyThin.RB || 0);
  ck('CONTROL: the old clamp really did move the answer (so this suite can catch it)',
     Math.abs(vFull - vThin) > 5,
     'full ' + vFull.toFixed(1) + ' vs thin ' + vThin.toFixed(1));
  // ...and the fixed code does not.
  const fixedThin = V.replacementLevels(thinPool, league);
  ck('and the FIX refuses instead of moving it',
     fixedThin.RB == null, JSON.stringify(fixedThin.RB));
}

console.log('\n' + pass + '/' + (pass + fail) + ' C1 agreement checks passed');
process.exit(fail ? 1 : 0);
