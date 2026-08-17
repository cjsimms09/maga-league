#!/usr/bin/env node
// TERRITORY: A
/* THE VARIANCE PROBE — §5.2 of draft/audit/barbell_strategy_2026-08-17.md.
 *
 * ⚠️ THIS IS A NEW, UNVALIDATED INSTRUMENT AND NO VERDICT RESTS ON IT.
 * `roster_construction_2026-08-16.md` limitation 3 declined to build a
 * per-roster weekly sd — "a new unvalidated instrument; deliberately not
 * invented in draft week" — and that judgement is respected. This exists for
 * one narrow purpose, fixed in the preregistration BEFORE the arms were run:
 *
 *   The archetype harness's only channel from roster to outcome is MEAN weekly
 *   points at a CONSTANT league sd (21.3 for every team). A barbell trades
 *   expected points for right-tail mass. So a barbell LOSING in that harness
 *   might mean the strategy is bad, or might mean the instrument is blind to
 *   the axis the strategy lives on — and SESSION-A clause 13f says a null that
 *   confirms what you expected must first show the instrument could have
 *   produced anything else.
 *
 * TWO QUESTIONS, and the first one is the one that matters:
 *
 *   1. DOES A BARBELL ROSTER EVEN HAVE MORE VARIANCE? If the arm's rosters do
 *      not carry measurably more weekly spread than the control's, then there
 *      is no hidden right tail for the harness to have missed, the blindness
 *      concern is moot, and the mean-channel verdict stands unchallenged. This
 *      question needs NO new outcome model — only the board's own measured
 *      `weekly_sd` column and the rosters the run already produced.
 *
 *   2. IF IT DOES, how much champ probability would that buy? Answered by
 *      re-running the SAME committed bracket (`src/routes/champodds.js
 *      simulate`, which already accepts a per-team sd) on the SAME final
 *      rosters, with each team's sd scaled by its own roster spread instead of
 *      pinned to the league constant. That scaling IS the new instrument, and
 *      it is crude: the measured 21.3 contains matchup and scoring noise that
 *      has nothing to do with roster composition, so scaling all of it by a
 *      roster-only ratio OVERSTATES how much a roster can move team variance.
 *      Overstating is the right direction of error here — it makes the probe
 *      generous to the barbell, so a barbell that still does not win under it
 *      has not been robbed by the harness.
 *
 * The per-roster spread is the starting lineup's weekly sd added in quadrature
 * (independence assumed — false, and named: real fantasy weeks are correlated
 * by game script and by stacking, which would widen it further). Starters are
 * the top proj_mean at each dedicated slot plus the best remaining flex, the
 * same fill archetype_season.js uses.
 *
 * Run: node draft/tools/barbell_variance_probe.js [--rooms-file <json>]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const AS = require(path.join(ROOT, 'draft', 'tools', 'archetype_season.js'));
const CH = require(path.join(ROOT, 'src', 'routes', 'champodds.js'));

const args = process.argv.slice(2);
const idx = args.indexOf('--rooms-file');
const ROOMS_FILE = idx >= 0 ? args[idx + 1]
  : path.join(ROOT, 'draft', 'data', 'archetype_rooms_barbell.json');

const board = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const BY_NAME = new Map();
board.players.forEach(p => { if (!BY_NAME.has(p.name)) BY_NAME.set(p.name, p); });
const KEEPERS = board.kept_players || [];

const rooms = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));

/** My final roster for one room: keepers + every logged pick, joined to the
 *  board by name. A pick that cannot be joined is COUNTED, never dropped
 *  silently — a missing join would quietly shrink a roster and lower its
 *  spread, which is the direction that would fake this probe's answer. */
function myRoster(room) {
  const out = KEEPERS.map(k => BY_NAME.get(k.name)).filter(Boolean);
  let missed = 0;
  (room.picksLog || []).forEach(pk => {
    const p = BY_NAME.get(pk.name);
    if (p) out.push(p); else missed++;
  });
  return { roster: out, missed };
}

/** Starting-lineup weekly sd, added in quadrature. Starters chosen by
 *  proj_mean (the same ordering archetype_season's lineup fill uses). */
function rosterWeeklySd(roster) {
  const byPos = {};
  roster.forEach(p => (byPos[p.position] || (byPos[p.position] = [])).push(p));
  Object.keys(byPos).forEach(pos => byPos[pos].sort(
    (a, b) => (Number(b.proj_mean) || 0) - (Number(a.proj_mean) || 0)));
  const starters = [];
  Object.keys(AS.STARTERS).forEach(pos => {
    for (let i = 0; i < AS.STARTERS[pos]; i++) {
      if ((byPos[pos] || [])[i]) starters.push(byPos[pos][i]);
    }
  });
  let flex = null;
  AS.FLEX_ELIG.forEach(pos => {
    const extra = (byPos[pos] || [])[AS.STARTERS[pos]];
    if (extra && (!flex || (Number(extra.proj_mean) || 0) > (Number(flex.proj_mean) || 0))) {
      flex = extra;
    }
  });
  if (flex) starters.push(flex);
  let v = 0, priced = 0;
  starters.forEach(p => {
    const s = Number(p.weekly_sd);
    if (s > 0) { v += s * s; priced++; }
  });
  return { sd: Math.sqrt(v), starters: starters.length, priced };
}

const ARMS = rooms.arms;
const out = {};
ARMS.forEach(a => { out[a] = { sds: [], missed: 0, unpriced: 0 }; });
ARMS.forEach(arm => {
  (rooms.detail[arm] || []).forEach(room => {
    if (room.crashed) return;
    const { roster, missed } = myRoster(room);
    const r = rosterWeeklySd(roster);
    out[arm].sds.push(r.sd);
    out[arm].missed += missed;
    out[arm].unpriced += (r.starters - r.priced);
  });
});
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;

console.log('VARIANCE PROBE — ' + path.basename(ROOMS_FILE));
console.log('⚠️  NEW UNVALIDATED INSTRUMENT. No verdict rests on it (§5.2).\n');
console.log('QUESTION 1 — does a barbell roster carry more weekly spread at all?');
console.log('  starting-lineup weekly sd, quadrature, mean over rooms:');
const base = mean(out[ARMS[0]].sds);
ARMS.forEach(a => {
  const m = mean(out[a].sds);
  console.log('  ' + a.padEnd(15) + m.toFixed(2)
    + '   vs shipped ' + (m - base >= 0 ? '+' : '') + (m - base).toFixed(2)
    + '   (' + (100 * (m / base - 1)).toFixed(1) + '%)'
    + (out[a].missed ? '  UNJOINED PICKS ' + out[a].missed : '')
    + (out[a].unpriced ? '  UNPRICED STARTERS ' + out[a].unpriced : ''));
});

// QUESTION 2 — only worth asking if question 1 said yes.
console.log('\nQUESTION 2 — if that spread were priced, what would it buy?');
console.log('  champodds bracket on the SAME final rosters, each team\'s sd');
console.log('  scaled by its own roster spread (generous to the barbell — see');
console.log('  the module header for why the error runs that way):');
const paired = {};
ARMS.forEach(a => { paired[a] = []; });
const seeds = (rooms.detail[ARMS[0]] || []).map(r => r.seed);
seeds.forEach((seed, i) => {
  // Every team in the room, not just mine — a relative sd only means something
  // against the field. Opponent rosters are not in the artifact, so their sd
  // stays at the league constant; that is stated rather than hidden and it
  // makes the probe MORE generous still (only my team's spread moves).
  ARMS.forEach(arm => {
    const room = rooms.detail[arm][i];
    if (!room || room.crashed) return;
    const { roster } = myRoster(room);
    const r = rosterWeeklySd(roster);
    const ref = rosterWeeklySd(myRoster(rooms.detail.shipped[i]).roster).sd;
    const strengths = {};
    for (let s = 1; s <= 10; s++) {
      strengths[s] = { mean: room.mean_weekly, sd: CH.CFG.WEEKLY_SD };
    }
    // The other nine teams sit at the room's own mean; only the sd differs, so
    // this probe measures the VARIANCE channel in isolation.
    const mySlot = board.league.my_draft_slot;
    strengths[mySlot] = { mean: room.mean_weekly,
      sd: CH.CFG.WEEKLY_SD * (ref > 0 ? r.sd / ref : 1) };
    const res = CH.simulate({ strengths, baseRec: null,
      futureWeeks: AS.REGULAR_SEASON_WEEKS, schedule: null, cut: 4,
      sims: 4000, seed: (seed * 104729 + 31) >>> 0 });
    paired[arm].push(res[mySlot].champ_prob);
  });
});
ARMS.forEach(a => {
  if (!paired[a].length) return;
  const d = paired[a].map((v, i) => v - paired.shipped[i]);
  const m = mean(d);
  const sd = Math.sqrt(d.reduce((s, x) => s + (x - m) * (x - m), 0)
    / Math.max(1, d.length - 1));
  const se = sd / Math.sqrt(d.length);
  console.log('  ' + a.padEnd(15) + 'd champ ' + (m >= 0 ? '+' : '') + m.toFixed(4)
    + '  [' + (m - 1.96 * se).toFixed(4) + ', ' + (m + 1.96 * se).toFixed(4) + ']');
});
console.log('\n  NOTE: this holds every team at the SAME mean, so it isolates the');
console.log('  variance channel and deliberately DISCARDS the mean penalty the');
console.log('  barbell actually pays. It answers "could variance ever pay here",');
console.log('  not "does the barbell win".');
