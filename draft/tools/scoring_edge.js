// TERRITORY: A
/* THE ROOM IS PRICING A DIFFERENT SCORING SYSTEM THAN THE ONE YOU PLAY IN.
 *
 * Cory asked directly: *"how are we accounting for that in our standings or big
 * board? Are we? Should we? How do we?"* The answer had two halves and only one
 * of them was true.
 *
 *   VALUE — yes. `score_stat_line` recomputes every projection from raw stat
 *           lines against this league's own 44 rules. A provider's precomputed
 *           points are never trusted; they encode that provider's league.
 *   PRICE — no. ADP comes from Fantasy Football Calculator's HALF-PPR feed, and
 *           FFC publishes no 6-point-passing-TD redraft format. So the board's
 *           values are ours and its prices are somebody else's.
 *
 * That is not a defect. It is the arbitrage — the room drafts on the market's
 * scoring and scores on ours. What WAS a defect is that nothing said so.
 *
 * ── WHY THIS PRINTS VALUE-OVER-REPLACEMENT AND NOT A RANK GAP ─────────────
 *
 * The obvious way to show this is the rank gap: where a position sits on our
 * board versus where the market prices it. Measured on the relevant board it is
 * dramatic — QB a median 66 places better for us — and it is the wrong thing to
 * print, for two reasons.
 *
 * IT IS ONE FINDING WITH THREE SHADOWS. Ranked within the subset the gaps must
 * sum to zero, and they do: QB carries -1013 places of displacement and RB, WR
 * and TE split +1012 of it between 102 players. Printing four numbers invites a
 * reader to treat them as four findings when the last three are the first one
 * spread thin.
 *
 * AND CROSS-POSITION RANK IS NOT A DECISION QUANTITY. A quarterback outscores a
 * running back in every league ever played; comparing their raw totals or their
 * ranks says nothing about which to draft. That mistake was live in this repo
 * this morning — three tools claimed "the RB wire is the worst on the board"
 * from raw points across positions — so it is not a hypothetical to guard
 * against. VALUE OVER THE LAST STARTER AT THE POSITION is the comparable unit,
 * and it is what this prints.
 *
 * ── WHAT THIS CANNOT SEPARATE, STATED BECAUSE IT BOUNDS THE CLAIM ─────────
 *
 * The QB displacement has TWO possible causes and this cannot tell them apart:
 *
 *   (a) the scoring difference — 6-point passing TDs against 4, partly offset
 *       by a doubled interception penalty — worth +29 to +66 season points to a
 *       quarterback NET of the offset, and exactly ZERO to everyone else, since
 *       no other position throws either one;
 *   (b) our projections simply liking quarterbacks more than the market does,
 *       which has nothing to do with scoring at all.
 *
 * Separating them needs the RAW STAT LINES rescored at 4 points, and the board
 * stores scored projections rather than the lines behind them. So (a) is
 * computed from representative lines and reported AS an illustration, and the
 * live displacement is reported as the sum of both. Anyone who wants the split
 * has to cache the stat lines at build time — named here rather than fudged.
 *
 * Run: node draft/tools/scoring_edge.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const PLAN = require('./draft_plan.js');

const L = DATA.league || {};
const SC = L.scoring || {};
const teams = +L.teams;
const starters = L.starters || {};

/* THE STANDARD THE MARKET'S ADP IS BUILT ON. FFC publishes standard, half-PPR,
 * PPR, 2QB and dynasty; we request half-PPR, and every one of those uses a
 * FOUR-point passing touchdown.
 *
 * ⚠️ I WROTE "this is the only rule that differs" HERE AND THE ENUMERATION
 * BELOW FOUND TWO. `pass_int` is -2 in this league against the standard -1, so
 * we punish an interception twice as hard as the market does. It is small — a
 * dozen picks a season, about 12 points — and it cuts AGAINST the passing-TD
 * edge rather than with it, which is exactly why an assumption would have kept
 * it invisible. The list is computed and printed for that reason; nothing here
 * asserts which rules differ. */
const MARKET = {
  pass_td: 4.0, pass_yd: 0.04, pass_int: -1.0,
  rec: 0.5, rec_yd: 0.1, rec_td: 6.0,
  rush_yd: 0.1, rush_td: 6.0, fum_lost: -2.0,
};

console.log('WHERE OUR SCORING AND THE MARKET\'S PRICES DISAGREE\n');

// ── 1. THE RULES THAT DIFFER, ENUMERATED RATHER THAN ASSERTED ───────────
{
  const diffs = Object.keys(MARKET)
    .filter(k => SC[k] != null && Math.abs(+SC[k] - MARKET[k]) > 1e-9)
    .map(k => ({ k: k, ours: +SC[k], market: MARKET[k] }));
  console.log('  1. THE RULES THEMSELVES');
  if (!diffs.length) {
    console.log('     None. Our table matches the half-PPR standard on every scoring rule');
    console.log('     the market prices, so ADP and our values are on the same footing and');
    console.log('     there is no edge here to find. Nothing below applies.');
  } else {
    diffs.forEach(d => console.log('     ' + d.k.padEnd(10)
      + 'ours ' + String(d.ours).padStart(6) + '   market ' + String(d.market).padStart(6)
      + '   ' + (d.ours > d.market ? 'we pay MORE' : 'we pay LESS')));
    console.log('     Everything else matches. Note they do not all point the same way:');
    console.log('     the passing TD favours quarterbacks here and the interception');
    console.log('     penalty cuts against them, so section 2 is the NET, not the gross.');
    console.log('     A rule appearing here that no quarterback can trigger would change');
    console.log('     which positions are affected — read the list, do not assume QB.');
  }
  /* WHO IT CAN POSSIBLY TOUCH. A passing touchdown is thrown by a quarterback,
   * so a change to `pass_td` is worth exactly zero to every other position.
   * Derived from the rule name rather than hardcoded to QB, so a difference in
   * `rec` would correctly implicate receivers instead. */
  const PASSERS = { pass_td: 'QB', pass_yd: 'QB', pass_int: 'QB', pass_2pt: 'QB' };
  const touched = new Set(diffs.map(d => PASSERS[d.k] || 'ALL'));
  console.log('     Positions this can reach: ' + Array.from(touched).join(', '));
}

// ── 2. WHAT IT IS WORTH, ON LINES THAT ARE INPUTS AND SAY SO ────────────
/* NOT MEASURED FROM THE BOARD, and the difference matters. The board stores
 * SCORED projections, not the stat lines behind them, so nothing here can be
 * recomputed from it. These are representative full-season lines, stated as
 * assumptions — they illustrate the size of the rule change and are not
 * evidence about any particular player. */
{
  const LINES = {
    'an elite QB': { pass_yd: 4600, pass_td: 38, pass_int: 10, rush_yd: 350, rush_td: 4, fum_lost: 2 },
    'the last starting QB': { pass_yd: 3900, pass_td: 25, pass_int: 12, rush_yd: 150, rush_td: 2, fum_lost: 3 },
    'a streamed QB': { pass_yd: 3500, pass_td: 21, pass_int: 13, rush_yd: 120, rush_td: 2, fum_lost: 3 },
    'a WR1 (control)': { rec: 100, rec_yd: 1400, rec_td: 10, fum_lost: 1 },
  };
  const score = (line, tbl) => Object.keys(tbl).reduce(
    (t, k) => t + (line[k] != null ? line[k] * tbl[k] : 0), 0);
  console.log('\n  2. WHAT THE DIFFERENCE IS WORTH (illustrative lines, not board data)');
  console.log('     ' + 'line'.padEnd(24) + 'ours'.padStart(8) + 'market'.padStart(9)
    + 'delta'.padStart(8) + '/wk'.padStart(7));
  Object.keys(LINES).forEach(name => {
    const o = score(LINES[name], SC), m = score(LINES[name], MARKET);
    console.log('     ' + name.padEnd(24) + o.toFixed(0).padStart(8) + m.toFixed(0).padStart(9)
      + (o - m).toFixed(0).padStart(8) + ((o - m) / 15).toFixed(2).padStart(7));
  });
  console.log('     The control is the point: a receiver moves by ZERO, because no rule');
  console.log('     that differs can reach him. The edge is a quarterback edge or it is');
  console.log('     nothing.');
}

// ── 3. WHERE IT BECOMES A DECISION — VALUE OVER THE LAST STARTER ────────
{
  const VS = PLAN.wireVsStarter();          // reuses the one starter-line derivation
  const pool = PLAN.pool.filter(p => Number.isFinite(+p.proj_mean) && +p.proj_mean > 0);
  const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
    : (p.raw_adp != null ? +p.raw_adp : 9999));
  const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
  const POS = ['QB', 'RB', 'WR', 'TE'];
  const repl = {};
  POS.forEach(p => {
    const slots = VS[p] ? VS[p].slots : null;
    const s = pool.filter(x => x.position === p).map(x => +x.proj_mean).sort((a, b) => b - a);
    repl[p] = (slots && s.length >= slots) ? s[slots - 1] : null;
  });
  console.log('\n  3. WHERE IT BECOMES A DECISION — points above the LAST STARTER at each');
  console.log('     position, for the best man still there at each of my picks. This is');
  console.log('     the only cross-position comparison that means anything.');
  console.log('     pick' + POS.map(p => p.padStart(8)).join('') + '     take');
  const rows = [];
  PLAN.SCHED.forEach(pk => {
    const gone = new Set(byAdp.slice(0, PLAN.liveBefore(pk)).map(p => String(p.player_id)));
    const v = {};
    POS.forEach(p => {
      const live = byAdp.filter(x => x.position === p && !gone.has(String(x.player_id)));
      v[p] = (live.length && repl[p] != null) ? +live[0].proj_mean - repl[p] : null;
    });
    /* ⚠️ "BEST" ONLY MEANS SOMETHING ABOVE REPLACEMENT. The first version of
     * this took the maximum unconditionally, so at pick 108 — where every
     * position is BELOW its last starter — it reported QB at -8 as the pick to
     * make. The least-bad option in a seat with no value left is not a
     * recommendation, and printing it as one is how a table starts arguing for
     * picks nobody should make. */
    const ranked = POS.filter(p => v[p] != null && v[p] > 0).sort((a, b) => v[b] - v[a]);
    const best = ranked.length ? ranked[0] : null;
    rows.push({ pk: pk, v: v, best: best });
    console.log('     ' + String(pk).padStart(4)
      + POS.map(p => (v[p] == null ? '—' : (v[p] >= 0 ? '+' : '') + v[p].toFixed(0)).padStart(8)).join('')
      + '     ' + (best || 'none above replacement'));
  });

  /* THE PART THAT STOPS THIS BECOMING "DRAFT QUARTERBACKS EARLY". The rule
   * difference is real and it does NOT automatically move a pick, because the
   * decision is a comparison and the other positions have value at the same
   * seats. Computed, so it cannot drift from the table above. */
  const live = rows.filter(r => r.v.QB != null);
  const qbPos = live.filter(r => r.v.QB > 0);
  const qbBest = live.filter(r => r.best === 'QB');
  const dead = rows.filter(r => r.best === null);
  console.log('\n     QB is above replacement at ' + qbPos.length + ' of my ' + live.length
    + ' picks, and is the BEST');
  console.log('     available value at ' + qbBest.length + ' of them'
    + (qbBest.length ? ' (' + qbBest.map(r => r.pk).join(', ') + ')' : '') + '.');
  if (dead.length) {
    console.log('     ' + dead.length + ' of my picks (' + dead.map(r => r.pk).join(', ')
      + ') have NOTHING above replacement at any');
    console.log('     position — those are the free picks, and this table has no opinion');
    console.log('     about them. free_picks.js is where they get spent.');
  }
  if (!qbBest.length) {
    console.log('     SO THE EDGE IS REAL AND IT DOES NOT MOVE A PICK BY ITSELF. The market');
    console.log('     underprices the position in our scoring, and at every seat I own');
    console.log('     something else is still worth more. It changes the TIE-BREAK, not');
    console.log('     the plan — take the quarterback when he is level, not when he is behind.');
  } else {
    console.log('     SO IT DOES MOVE A PICK, at the seats named above — and that is where');
    console.log('     the market pricing a different scoring system pays.');
  }
}

// ── 4. WHAT THIS DOES NOT SETTLE ────────────────────────────────────────
console.log('\n  WHAT THIS DOES NOT SETTLE');
console.log('     · WHY the market and our board disagree about quarterbacks. Two causes');
console.log('       are possible — the scoring rule, and our projections simply liking');
console.log('       them more — and separating them needs the raw stat lines rescored at');
console.log('       4 points. The board stores SCORED projections, so it cannot be done');
console.log('       from the artifact. Cache the lines at build time and it can.');
console.log('     · Whether the room drafts to FFC\'s ADP at all. The seat plan already');
console.log('       assumes it does; this inherits that assumption and adds nothing to it.');
console.log('     · The replacement line moves as the room drafts. These are the values at');
console.log('       MY picks under an ADP-order room, not a promise about the live board.');
