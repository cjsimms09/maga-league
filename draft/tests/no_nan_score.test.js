// TERRITORY: A
/* NO NON-FINITE SCORE MAY REACH A RANKING — item 13's guard.
 *
 * THE HISTORY, because the guard means nothing without it. Commit 39f1a92
 * (2026-08-12) reported "EVERY PLAYER AT A FILLED POSITION SCORES NaN" — 219 of
 * 219 QBs at pick 41 with a single QB rostered, 1,580 of 1,719 with a QB and
 * three RBs, zero on an empty roster — and named it as the mechanism behind "I
 * could not tell which player the tool was telling me to take", the QB/TE
 * over-recommendation, and the pick-110 UNKNOWN resolution. It was routed and
 * then could not be reproduced.
 *
 * NON-REPRODUCTION IS NOT A FIX. A defect that disappears without an identified
 * cause is dormant. Three explanations fit and only one is safe: something
 * changed, the state is rare, or the reproduction misses the path.
 *
 * The first is now EXCLUDED by measurement (draft/tools/nan_provenance.js):
 * every engine revision back to 2026-08-11 is clean on the reported states, and
 * public/draft_data.json is byte-identical to the board the report ran on. The
 * third is what happened. The cause is a ROSTER ENTRY WITHOUT A PROJECTION:
 * starterSlotMarginal computes `player.proj_mean - incumbent.proj_mean`, and an
 * incumbent built by hand as {name, position} — which is how that session
 * generated its sample screens — makes that `x - undefined` = NaN. Reproduced
 * exactly: 219/219 QBs and 391/391 RBs.
 *
 * THIS FILE IS THE CLOSURE THAT IS AVAILABLE, AND IT IS NOT "UNDERSTOOD". The
 * reporting session's actual context was never captured, so the cause above is
 * a reconstruction that fits every measurement rather than a confession. What
 * is closed is PROPAGATION: this state can no longer reach a ranking.
 *
 * Run: node draft/tests/no_nan_score.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'engine.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'draft_data.json'), 'utf8'));
const L = DATA.league;
const pool = DATA.players.filter(p => p.position && p.proj_mean != null && p.vorp != null);
const byVorp = pool.slice().sort((a, b) => b.vorp - a.vorp);
const adpOf = p => (p.adjusted_adp != null ? p.adjusted_adp : (p.raw_adp != null ? p.raw_adp : 9999));

function rec(roster) {
  const taken = new Set(roster.map(p => String(p.player_id)));
  pool.slice().sort((a, b) => adpOf(a) - adpOf(b)).slice(0, 40)
    .forEach(p => taken.add(String(p.player_id)));
  return E.recommend({
    board: pool.filter(p => !taken.has(String(p.player_id))),
    roster: roster, league: L, currentPick: 41, nextPick: 56, totalPicks: 150,
    myPicksLeft: 10, roundsLeft: 10, runMultipliers: {}, intervening: [],
    weights: E.MEASURED_WEIGHTS,
  });
}

const REAL = [byVorp.filter(p => p.position === 'QB')[0]]
  .concat(byVorp.filter(p => p.position === 'RB').slice(0, 3));
const HANDBUILT = REAL.map(p => ({ name: p.name, position: p.position }));

// ── THE CONTROL ARM: a real roster must be completely unaffected ───────────
{
  const r = rec(REAL);
  ck('a roster of real board objects produces no refusals at all',
    r.every(e => !e.score_error), r.filter(e => e.score_error).length);
  ck('  and every score is finite',
    r.every(e => isFinite(Number(e.score))),
    r.filter(e => !isFinite(Number(e.score))).slice(0, 2).map(e => e.player.name));
  ck('  and the top recommendation is a real player with a real score',
    r.length && isFinite(Number(r[0].score)) && Number(r[0].player.proj_mean) > 0,
    r.length ? { name: r[0].player.name, score: r[0].score } : null);
}

// ── THE DEFECT ARM: it still reproduces, and is now refused ────────────────
{
  const r = rec(HANDBUILT);

  /* NON-VACUITY FIRST. If the hand-built roster stopped reaching the poisoned
   * path, every assertion below would pass while testing nothing. The refusals
   * must actually happen. */
  const refused = r.filter(e => e.score_error);
  ck('CONTROL: the hand-built roster still reaches the poisoned path',
    refused.length > 100, refused.length);

  ck('  NO entry carries a non-finite score — the board is never poisoned',
    r.every(e => e.score === null || isFinite(Number(e.score))),
    r.filter(e => e.score !== null && !isFinite(Number(e.score)))
      .slice(0, 3).map(e => e.player.name));

  ck('  the refusal is POSITION-SELECTIVE, as reported (filled positions only)',
    (function () {
      const hit = new Set(refused.map(e => e.player.position));
      const clean = new Set(r.filter(e => !e.score_error).map(e => e.player.position));
      return hit.size > 0 && clean.size > 0
        && Array.from(hit).every(p => ['QB', 'RB'].indexOf(p) >= 0);
    })(),
    Array.from(new Set(refused.map(e => e.player.position))));

  ck('  the failure is NAMED, not just nulled',
    refused.every(e => e.score_error.reason && e.score_error.terms.length),
    refused.length ? refused[0].score_error : null);

  ck('  and it names the roster entries that caused it',
    refused[0].score_error.roster_without_projection.length === HANDBUILT.length,
    refused.length ? refused[0].score_error.roster_without_projection : null);

  /* THE ORDERING PROPERTY, and it is the one a wrong guard gets wrong.
   * `b.score - a.score` coerces null to 0, so a refused entry would outrank
   * every negative score — which late in a draft is most of the board. */
  const firstRefusedAt = r.findIndex(e => !!e.score_error);
  const lastScoredAt = (function () {
    for (let i = r.length - 1; i >= 0; i--) if (!r[i].score_error) return i;
    return -1;
  })();
  ck('  every REFUSED entry sorts after every scoreable one',
    firstRefusedAt > lastScoredAt,
    { first_refused_at: firstRefusedAt, last_scored_at: lastScoredAt });

  ck('  so the top recommendation is never a refused entry',
    !r[0].score_error && isFinite(Number(r[0].score)),
    { top: r[0].player.name, score: r[0].score, refused: !!r[0].score_error });

  ck('  and a refused entry says so in its reasons, where a human would read it',
    /REFUSED/.test((refused[0].reasons || []).join(' ')),
    refused.length ? refused[0].reasons : null);
}

// ── THE SORT COMPARATOR ITSELF, on the case that motivated it ──────────────
{
  /* Direct, because the board arm above cannot distinguish "sorted correctly"
   * from "no negative scores happened to be present". */
  /* SORTED WITH THE SHIPPED COMPARATOR, NOT A COPY OF IT. My first version of
   * this block fell back to a locally-written comparator when the export was
   * missing — and that local copy contained the identical `isFinite(Number(x))`
   * coercion bug the engine had, so it agreed with the defect perfectly.
   * Rule 10d: a fixture that reimplements the thing under test always agrees
   * with itself. If the export is gone, that is a FAILURE, not a fallback. */
  ck('the comparator is exported so this test uses the shipped one',
    typeof E.byScoreRefusedLast === 'function');

  const rows = [{ score: 5 }, { score: null }, { score: -80 }, { score: NaN }, { score: 0 }];
  const sorted = rows.slice().sort(E.byScoreRefusedLast);
  const scores = sorted.map(x => (E.scoreable(x) ? x.score : 'REFUSED'));
  ck('a -80 outranks a refused entry (null coercion would have reversed this)',
    scores.indexOf(-80) < scores.indexOf('REFUSED'), scores);
  ck('  and a legitimate score of 0 is NOT treated as a refusal',
    scores.indexOf(0) < scores.indexOf('REFUSED'), scores);
  ck('  and both refusal shapes (null and NaN) land after every real score',
    scores.slice(scores.indexOf('REFUSED')).every(s => s === 'REFUSED'), scores);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
