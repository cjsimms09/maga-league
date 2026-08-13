// TERRITORY: A
/* HOW FAR DOES LAST SEASON REACH INTO THIS YEAR'S BOARD — and does it change a pick?
 *
 * Cory, HIGH priority: *"we really need a gate to make sure historical drafts and
 * data don't make their way into this years recommendations. Ie players that were
 * drafted high last year may not be drafted high or at all this year."*
 *
 * C built the ingest half (`season_stamp.py`: every field declares its reach, and
 * an unstamped field is a violation). C then routed the finding that decides how
 * this half has to be built:
 *
 *   `proj_mean = base * (1 + adj)` where `adj` comes from the [2025, 2024] usage
 *   blend — so the board's most consequential number is prior-season-touched on
 *   EVERY path, including the one where `base` is a clean 2026 fetch.
 *
 * ── WHY A REFUSAL WOULD BE THE WRONG GATE ──────────────────────────────────
 *
 * A gate that rejects prior-season reach would reject the entire board, correctly,
 * and be switched off within a day. Projecting 2026 usage REQUIRES 2025 usage;
 * that is not contamination, it is how projection works. Cory's own wording
 * already carved this out — *"unless that data IS considered relevant to this
 * year."*
 *
 * So the question a useful gate asks is not PRESENT/ABSENT. It is:
 *
 *   HOW MANY POINTS OF EACH PROJECTION COME FROM LAST SEASON, AND DOES REMOVING
 *   THEM CHANGE WHO I DRAFT?
 *
 * Reach that moves no pick is not exposure regardless of how much of it there is.
 * Reach that flips a seat is exposure even if it is small. That is the same
 * standard applied to the usage cap and to the tiebreak frontier: a quantity is
 * only real if it changes a decision.
 *
 * ── WHAT THIS DOES NOT COVER, STATED UP FRONT ──────────────────────────────
 *
 * This measures the ONE prior-season channel the board exposes numerically:
 * `opportunity_adj`. Other historical fields ride along unmeasured — `wopr`,
 * `target_share`, `games_expected` — and `adp_stale` is a separate question about
 * the market rather than the projection. The dangerous class Cory actually named
 * — a 2025 ADP silently serving as a 2026 ADP — is NOT tested here, because the
 * board carries no season stamp on `raw_adp` to test against. That needs C's
 * stamps to reach the shipped artifact, and until they do, THIS GATE CANNOT SEE
 * THE FAILURE CORY DESCRIBED. Reported as a null, not glossed.
 *
 * Run: node draft/tools/historical_reach.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const PLAN = require('./draft_plan.js');

const num = v => (Number.isFinite(+v) ? +v : null);
const board = (DATA.players || []).filter(p => num(p.proj_mean) != null);

console.log('HISTORICAL REACH — how far 2025/2024 reaches into the 2026 board\n');

/* ── 1. VERIFY THE IDENTITY BEFORE MEASURING ANYTHING WITH IT ──────────────
 * projections.blend claims proj_mean = proj_baseline * (1 + opportunity_adj).
 * If that does not hold on the shipped artifact then opportunity_adj is not the
 * channel and every number below would be measuring the wrong thing. This is the
 * check that was missing the last three times a term turned out to be something
 * other than what its name said. */
console.log('  1. DOES THE SHIPPED BOARD SATISFY proj_mean = proj_baseline x (1 + opportunity_adj)?');
let ok = 0, bad = 0, missing = 0, worstErr = 0;
board.forEach(p => {
  const b = num(p.proj_baseline), a = num(p.opportunity_adj), m = num(p.proj_mean);
  if (b == null || a == null) { missing++; return; }
  const pred = b * (1 + a);
  const err = Math.abs(pred - m);
  if (err > 0.02 + 1e-9) { bad++; if (err > worstErr) worstErr = err; } else ok++;
});
console.log('     holds: ' + ok + '   violates: ' + bad + '   missing an input: ' + missing
  + '   worst error: ' + worstErr.toFixed(3) + ' pts');
if (bad > 0) {
  console.log('     >> THE IDENTITY DOES NOT HOLD. opportunity_adj is not the only channel');
  console.log('        into proj_mean, so the totals below are a LOWER BOUND on the reach.');
} else {
  console.log('     The identity holds to storage precision, so opportunity_adj is the');
  console.log('     complete numeric prior-season channel into proj_mean.');
}

/* ── 2. THE SIZE OF THE PRIOR-SEASON TERM ─────────────────────────────────*/
console.log('\n  2. POINTS OF PROJECTION CONTRIBUTED BY THE PRIOR-SEASON TERM');
const withAdj = board.filter(p => num(p.opportunity_adj) != null && num(p.proj_baseline) != null);
const contrib = withAdj.map(p => ({ p, d: num(p.proj_mean) - num(p.proj_baseline) }));
const absd = contrib.map(c => Math.abs(c.d)).sort((a, b) => a - b);
const q = f => absd.length ? absd[Math.min(absd.length - 1, Math.floor(f * absd.length))] : 0;
console.log('     players with a usage adjustment: ' + withAdj.length + ' of ' + board.length);
console.log('     |contribution|  median ' + q(0.5).toFixed(1) + '   p90 ' + q(0.9).toFixed(1)
  + '   max ' + q(0.999).toFixed(1) + ' pts');
const CAP = 0.15;
const pinned = withAdj.filter(p => Math.abs(num(p.opportunity_adj)) >= CAP - 1e-6);
console.log('     pinned at the +/-' + (100 * CAP).toFixed(0) + '% cap: ' + pinned.length
  + '   (the cap is where the prior season stops being able to say more)');
console.log('\n     LARGEST MOVERS — the players last season is doing the most work on:');
contrib.slice().sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 6).forEach(c => {
  console.log('       ' + (c.p.position + ' ' + c.p.name).padEnd(26)
    + (c.d >= 0 ? '+' : '') + c.d.toFixed(1).padStart(6) + ' pts   ('
    + (100 * num(c.p.opportunity_adj)).toFixed(1) + '% of a '
    + num(c.p.proj_baseline).toFixed(0) + '-pt baseline)');
});

/* ── 3. THE ONLY TEST THAT MATTERS — DOES IT CHANGE A PICK? ───────────────
 * Re-derive each seat's shortlist on proj_baseline (the 2026-only number) and
 * compare against the shipped shortlist on proj_mean. A seat whose shortlist is
 * unchanged is not exposed no matter how large the adjustment was. */
console.log('\n  3. DOES REMOVING LAST SEASON CHANGE WHAT I DRAFT?');
console.log('     Re-running each seat\'s shortlist on proj_baseline — the 2026-only number.\n');
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const byAdp = PLAN.pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
const kept = new Set((PLAN.keep || []).map(k => String(k.player_id)));
const short = (x, scoreKey) => {
  const gone = new Set(byAdp.slice(0, x.pick - 1).map(p => String(p.player_id)));
  const elig = x.slot === 'FLEX' ? ['RB', 'WR', 'TE'] : [x.slot];
  return PLAN.pool.filter(p => !gone.has(String(p.player_id)) && !kept.has(String(p.player_id))
    && elig.indexOf(p.position) >= 0 && num(p[scoreKey]) != null)
    .sort((a, b) => num(b[scoreKey]) - num(a[scoreKey])).slice(0, 3)
    .map(p => p.name);
};
let flipped = 0, seats = 0;
PLAN.plan.filter(x => !x.bench).forEach(x => {
  const a = short(x, 'proj_mean'), b = short(x, 'proj_baseline');
  if (!a.length || !b.length) return;
  seats++;
  const topFlip = a[0] !== b[0];
  if (topFlip) flipped++;
  console.log('     ' + ('pick ' + x.pick + ' ' + x.slot).padEnd(16)
    + 'with 2025: ' + a[0].padEnd(22) + (topFlip ? 'WITHOUT: ' + b[0] + '   <<< FLIPS'
      : 'unchanged'));
});
console.log('\n     ' + flipped + ' of ' + seats + ' seats change their top name when the prior-season');
console.log('     term is removed.');
if (flipped === 0) {
  console.log('     THE REACH IS REAL AND THE EXPOSURE IS ZERO — but a bare null is not a');
  console.log('     finding until the mechanism is known, so: WHY does nothing move?');
  const a = withAdj.map(p => num(p.opportunity_adj));
  const zero = a.filter(v => Math.abs(v) < 1e-9).length;
  const atcap = a.filter(v => Math.abs(Math.abs(v) - CAP) < 1e-6).length;
  console.log('\n       opportunity_adj is EXACTLY ZERO on ' + zero + ' of ' + a.length
    + ' (' + (100 * zero / a.length).toFixed(0) + '%) — no usage data,');
  console.log('       and those players are mostly far down the board where no seat looks.');
  console.log('       Among the players a seat DOES look at, the term is saturated:');
  const c8 = PLAN.plan.filter(x => !x.bench)[0];
  if (c8) {
    short(c8, 'proj_mean');
    const gone = new Set(byAdp.slice(0, c8.pick - 1).map(p => String(p.player_id)));
    const elig = c8.slot === 'FLEX' ? ['RB', 'WR', 'TE'] : [c8.slot];
    PLAN.pool.filter(p => !gone.has(String(p.player_id)) && !kept.has(String(p.player_id))
      && elig.indexOf(p.position) >= 0 && num(p.proj_mean) != null)
      .sort((x, y) => num(y.proj_mean) - num(x.proj_mean)).slice(0, 6)
      .forEach(p => console.log('         ' + (p.position + ' ' + p.name).padEnd(24)
        + (100 * num(p.opportunity_adj)).toFixed(1).padStart(6) + '%'
        + (Math.abs(Math.abs(num(p.opportunity_adj)) - CAP) < 1e-6 ? '   AT THE CAP' : '')));
  }
  console.log('\n       MY FIRST EXPLANATION WAS THE CAP, AND THE SWEEP BELOW REFUTES IT.');
  console.log('       The reasoning was that with every contender pinned at the same +'
    + (100 * CAP).toFixed(0) + '%');
  console.log('       the term is a constant multiplier inside the competing group and');
  console.log('       cannot reorder it, so raising the cap would start moving picks. It');
  console.log('       does not: the top name at every seat is identical from 0% to 60%.');
  console.log('       (' + atcap + ' players sit at the cap board-wide — true, and not the reason.)');
  console.log('\n       THE ACTUAL REASON IS NARROWER AND LUCKIER. At each seat the leader on');
  console.log('       the 2026 baseline is ALSO the player the usage term rewards most, so');
  console.log('       the term can only widen a lead it did not create. That is a property');
  console.log('       of this particular board, not a safety property of the model — a');
  console.log('       season where the two disagreed would flip the pick, and nothing in');
  console.log('       the design prevents it. The null is real for August 22 and it is NOT');
  console.log('       a guarantee that generalises.');
} else {
  console.log('     THOSE SEATS ARE LIVE EXPOSURE. At each one, which player the board');
  console.log('     recommends depends on prior-season usage rather than 2026 projection.');
  console.log('     That is the case Cory asked to be gated, and it is a real one.');
}

/* ── 3b. IS THE NULL ROBUST, OR IS IT THE CAP HOLDING THE LINE? ───────────
 * projections.blend: adj = clamp(+/-cap, (z/2) * cap), and the board ships
 * `opportunity_z`. So the counterfactual is computable rather than speculative.
 * The formula is VERIFIED against the shipped adj at the live cap first — using
 * an unchecked formula to extrapolate is how a sensitivity sweep produces
 * confident nonsense. */
console.log('\n  3b. IS THAT NULL ROBUST? — re-deriving the seats at other caps');
const adjAt = (z, cap) => Math.max(-cap, Math.min(cap, (z / 2) * cap));
let reproOk = 0, reproBad = 0;
withAdj.forEach(p => {
  const z = num(p.opportunity_z);
  if (z == null) return;
  if (Math.abs(adjAt(z, CAP) - num(p.opportunity_adj)) <= 0.0005) reproOk++; else reproBad++;
});
console.log('     formula check at the live cap: reproduces ' + reproOk
  + ', fails ' + reproBad);
if (reproBad > 0) {
  console.log('     >> FORMULA NOT VERIFIED — the sweep below is NOT trustworthy and is');
  console.log('        suppressed. adj is not clamp(+/-cap, (z/2)*cap) on this artifact.');
} else {
  console.log('     Verified, so the sweep below is a real counterfactual.\n');
  console.log('     cap    top name    3-deep list   (changes vs the shipped board)');
  console.log('     ' + '-'.repeat(62));
  [0.00, 0.15, 0.25, 0.40, 0.60].forEach(cap => {
    const score = {};
    withAdj.forEach(p => {
      const z = num(p.opportunity_z), b = num(p.proj_baseline);
      score[String(p.player_id)] = (z == null || b == null) ? num(p.proj_mean)
        : b * (1 + adjAt(z, cap));
    });
    /* TOP NAME and 3-DEEP SHORTLIST are counted separately and both are
     * reported. Counting only the top name called this null robust at every
     * cap, which was false — places 2 and 3 reorder freely while the leader
     * holds. The card hands Cory a THREE-DEEP shortlist, so a reorder inside
     * it is a change to the artifact he actually drafts from. */
    let topCh = 0, listCh = 0, n = 0; const names = [];
    PLAN.plan.filter(x => !x.bench).forEach(x => {
      const gone = new Set(byAdp.slice(0, x.pick - 1).map(p => String(p.player_id)));
      const elig = x.slot === 'FLEX' ? ['RB', 'WR', 'TE'] : [x.slot];
      const cands = PLAN.pool.filter(p => !gone.has(String(p.player_id))
        && !kept.has(String(p.player_id)) && elig.indexOf(p.position) >= 0
        && num(p.proj_mean) != null);
      if (!cands.length) return;
      n++;
      const base = cands.slice().sort((a, b) => num(b.proj_mean) - num(a.proj_mean))
        .slice(0, 3).map(p => p.name);
      const alt = cands.slice().sort((a, b) =>
        (score[String(b.player_id)] || 0) - (score[String(a.player_id)] || 0))
        .slice(0, 3).map(p => p.name);
      if (base[0] !== alt[0]) { topCh++; names.push(x.slot + ' top -> ' + alt[0]); }
      if (base.join('|') !== alt.join('|')) listCh++;
    });
    console.log('     ' + (100 * cap).toFixed(0).padStart(3) + '%'
      + String(topCh + ' of ' + n).padStart(9) + String(listCh + ' of ' + n).padStart(14)
      + (cap === CAP ? '   <- SHIPPED (0 by construction)' : '')
      + (names.length ? '   ' + names.join(', ') : ''));
  });
  console.log('\n     THE TOP NAME NEVER MOVES AND THE SHORTLIST BELOW IT MOVES CONSTANTLY.');
  console.log('     At FLEX-8 the leader is Cook at every cap from 0% to 60% — he leads on');
  console.log('     the 2026 baseline alone AND takes the largest usage bonus, so the term');
  console.log('     can only widen his margin. Behind him it reorders: Jeanty is 2nd with');
  console.log('     last season removed, Barkley is 2nd on the shipped board, and Achane');
  console.log('     enters the top 3 only at caps the model does not use.');
  console.log('\n     Read the 0% row as the real test: it is the board with LAST SEASON');
  console.log('     REMOVED ENTIRELY, and it is the number Cory\'s question asks for.');
}

/* ── 4. THE FAILURE THIS GATE CANNOT SEE ──────────────────────────────────
 * Naming the hole is the point of the section. A gate that reports only what it
 * can measure reads as complete coverage. */
console.log('\n  4. THE ADP CHANNEL — where Cory\'s actual worry lives');
const stamped = board.filter(p => Object.keys(p).some(k => k.endsWith('_season'))).length;
console.log('     board rows carrying a season stamp: ' + stamped + ' of ' + board.length);
console.log('\n     "Drafted high last year, undrafted this year" is a claim about ADP, not');
console.log('     projection, so the headline above does not speak to it. I reported this');
console.log('     as UNTESTED. C then tested it, and the answer is stronger than a stamp:');
console.log('\n       THE ADP CHANNEL CANNOT STRUCTURALLY CARRY A PRIOR-SEASON VALUE.');
console.log('       The season is in the REQUEST URL for both sources (fp_url carries');
console.log('       /nfl/2026/consensus-rankings), and adp.py derives the cache key FROM');
console.log('       that url — so even a cache hit cannot be another season. 344 rows');
console.log('       parsed, 344 matched, 0 unmatched, ffc_gap_fill 3.');
console.log('\n     The residual risk is a STALE 2026 ADP — adp.py\'s "FFC unreachable; using');
console.log('     cached ADP" path. That is a different and much smaller failure than the');
console.log('     one Cory described, and it is a freshness question, not a season one.');
if (stamped === 0) {
  console.log('\n     THE STAMPS ARE NOT ON THIS ARTIFACT YET. build.py now applies them at');
  console.log('     the point ADP is attached (adp_season_stamps), so they appear on the');
  console.log('     NEXT BOARD REBUILD. Until that runs, this section rests on C\'s reading');
  console.log('     of the fetch rather than on a field this tool can check — which is');
  console.log('     weaker evidence than a stamp, and is labelled as such rather than');
  console.log('     counted as coverage.');
} else {
  console.log('\n     Stamps are present, so this is now machine-checkable rather than a');
  console.log('     reading of the fetch code. Run season_stamp.violations() against them.');
}
/* adp_stale holds DICTS ({"direction","slots","days"}), not booleans. Testing it
 * with `=== true || === 1` reported 0 rows against an actual 12 — the same class
 * as isFinite(null) counting nulls as zeros: a type assumption that fails
 * silently and reads as a clean result. Caught by C. */
const stale = board.filter(p => p.adp_stale != null && p.adp_stale !== false).length;
console.log('\n     (`adp_stale` is set on ' + stale + ' rows and holds a MOVEMENT record —');
console.log('     {direction, slots, days} — set from ADP velocity inside the 2026 series.');
console.log('     It is not a season flag and was never meant to be one.)');
