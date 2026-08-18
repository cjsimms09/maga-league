// TERRITORY: A
/* WHAT ACTUALLY WORKED IN THIS LEAGUE — draft shape against finish.
 *
 * Cory: "Is it worth reviewing last 3 league winners and teams that won most
 * money and look for clues in what worked in this league? Trends? ... Did they
 * have WR or RB in flex most often, did they draft QB or TE early, did they
 * draft WR vs RB early."
 *
 * Yes — and the way it is asked is the trap. THREE WINNERS IS NOT A SAMPLE. Any
 * six variables measured on three teams will produce a pattern, and it will be
 * noise. This tool exists to answer the question without that.
 *
 * ── THREE THINGS MAKE IT USABLE ───────────────────────────────────────────
 *
 * 1. ALL 30 TEAM-SEASONS, NOT THE 3 WINNERS. Finish is a rank, so every team
 *    carries information — the teams that came 8th tell you as much as the ones
 *    that won.
 *
 * 2. THE WITHIN-MANAGER DESIGN, WHICH IS THE WHOLE POINT. The same ten managers
 *    recur every season, so 30 rows are not 30 independent observations — they
 *    are ~10 managers observed 3 times. If one good manager happens to like
 *    early quarterbacks, he manufactures the entire correlation by himself.
 *    So the headline number compares each manager to HIS OWN average: in the
 *    seasons he drafted a position earlier than he usually does, did he finish
 *    better than he usually does? That removes "who is good at fantasy"
 *    completely, and it is the only comparison here that survives the objection.
 *
 * 3. THE MULTIPLE-COMPARISON COUNT IS PRINTED. Testing k metrics on a sample
 *    this size will produce roughly k/6 spurious "findings" at the sizes people
 *    normally call interesting. The tool says how many it tested so a reader can
 *    discount accordingly, rather than being shown only the one that worked.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ──────────────────────────────────────
 *
 * It does not rank strategies, recommend a draft plan, or feed any live
 * surface. It reports effects with their n and their direction and stops. With
 * 10 managers and 3 seasons the honest output is "worth testing", never "do
 * this" — and a tool that phrased it as advice would be read as advice.
 *
 * Run: node draft/tools/winners.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const H = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
const PM = require(path.join(ROOT, 'draft', 'tools', 'position_map.js'));
const POS = PM.positionMap();

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

/* ONE ROW PER TEAM-SEASON: the draft that team made, and where it finished.
 * Seasons with no completed record are excluded rather than counted as zeros —
 * the 2026 standings exist and are all 0-0. */
/* WEEKLY-HIGH COUNTS — the second outcome, and a genuinely different one.
 *
 * Cory: "maybe also test teams that won weekly pot the most". He is right that it
 * deserves its own column, and the payout table says why: weekly high is
 * $100 x 15 weeks = $1,500 of a $4,000 pot — 37.5% of the money, second only to
 * the playoffs. It is also won by a DIFFERENT property. Season rank rewards a
 * high total; the weekly pot rewards a high CEILING, and a roster built for one
 * is not automatically built for the other. A draft shape could plausibly win
 * this pot while finishing mid-table, and nothing we have measured so far would
 * have seen it.
 *
 * WEEKS 1-15 ONLY, because that is what the payout pays. Counting 16-18 would
 * hand the money to whoever survived into a playoff week.
 */
function weeklyHighs(season) {
  const w = season.weeks || {};
  const wins = {};
  for (let k = 1; k <= WEEKLY_HIGH_WEEKS; k++) {
    const rowsW = w[String(k)] || [];
    if (rowsW.length < 2) continue;
    let best = null;
    rowsW.forEach(r => {
      const pts = Number(r.points);
      if (!Number.isFinite(pts)) return;
      if (!best || pts > best.points) best = { roster_id: r.roster_id, points: pts };
    });
    if (best) wins[best.roster_id] = (wins[best.roster_id] || 0) + 1;
  }
  return wins;
}

const WEEKLY_HIGH_WEEKS = 15;

function rows() {
  const out = [];
  (H.seasons || []).forEach(s => {
    const standings = (s.standings || []).filter(r => (r.wins || 0) + (r.losses || 0) > 0);
    const draft = (s.drafts || []).find(d => (d.picks || []).length >= 150);
    if (!standings.length || !draft) return;
    const highs = weeklyHighs(s);
    const byRoster = {};
    draft.picks.forEach(p => {
      if (p.roster_id == null) return;
      (byRoster[p.roster_id] = byRoster[p.roster_id] || []).push(p);
    });
    standings.forEach(r => {
      const pk = (byRoster[r.roster_id] || []).slice()
        .sort((a, b) => (a.pick_no || 0) - (b.pick_no || 0));
      if (pk.length < 10) return;
      const posOf = z => PM.posOf(POS, z.player_id);
      const firstAt = want => {
        const hit = pk.find(z => posOf(z) === want);
        return hit ? hit.pick_no : null;      // null, never a sentinel that averages
      };
      const countIn = (want, n) => pk.slice(0, n).filter(z => posOf(z) === want).length;
      out.push({
        season: s.season, owner: String(r.owner_id), rank: r.rank,
        points_for: r.points_for,
        // NEGATED so that, like `rank`, LOWER IS BETTER. Every effect in this
        // file then reads in one direction and a sign cannot mean two things
        // depending on which outcome column you happen to be looking at.
        weekly_highs_neg: -(highs[r.roster_id] || 0),
        weekly_highs: (highs[r.roster_id] || 0),
        qb_first: firstAt('QB'), te_first: firstAt('TE'),
        rb_first6: countIn('RB', 6), wr_first6: countIn('WR', 6),
        rb_total: pk.filter(z => posOf(z) === 'RB').length,
        wr_total: pk.filter(z => posOf(z) === 'WR').length,
      });
    });
  });
  return out;
}

/* THE HEADLINE TEST. For each manager, centre both the metric and the finish on
 * HIS OWN average across seasons, then ask whether the deviations move together.
 * A manager seen once contributes nothing and is dropped — he has no "own
 * average" to deviate from, and including him would smuggle between-manager
 * variation back in through the door this design exists to close. */
function withinManager(data, key, outcome) {
  outcome = outcome || 'rank';
  const byOwner = {};
  data.forEach(r => {
    if (r[key] != null && r[outcome] != null) (byOwner[r.owner] = byOwner[r.owner] || []).push(r);
  });
  const early = [], late = [];
  let managers = 0;
  Object.values(byOwner).forEach(v => {
    if (v.length < 2) return;
    managers++;
    const mk = mean(v.map(r => r[key])), mr = mean(v.map(r => r[outcome]));
    v.forEach(r => {
      const d = r[key] - mk, dr = r[outcome] - mr;
      if (d < 0) early.push(dr); else if (d > 0) late.push(dr);
    });
  });
  return { early: mean(early), late: mean(late), nEarly: early.length,
    nLate: late.length, managers: managers,
    spread: (mean(late) - mean(early)) };
}

/* ── "TEST THE LEAGUE WORST TOO" — AND WHY IT IS NOT A SEPARATE TEST ──────
 *
 * Cory: "Maybe also test league worst and see what not to do." Worth saying
 * plainly: cutting the bottom three and testing them is NOT new evidence. Rank
 * is a continuum and the within-manager regression above already uses its whole
 * range — the bottom teams are in it, pulling on the same line. Re-testing them
 * as their own group is the same data a second time, and reporting the two
 * together would look like corroboration while being one measurement.
 *
 * WHAT IS GENUINELY DIFFERENT is whether the effect is ASYMMETRIC: does taking a
 * position early hurt a lot when things go badly and help only a little when
 * they go well? A single spread cannot see that, and it is the shape that
 * matters for "what not to do" — a move that is mildly good on average and
 * catastrophic in its bad tail is a move to avoid.
 *
 * So: split each manager's own seasons into HIS better half and HIS worse half,
 * and measure the effect separately in each. Still within-manager, still no
 * "who is good", and it answers the question actually being asked.
 */
function asymmetry(data, key, outcome) {
  outcome = outcome || 'rank';
  const byOwner = {};
  data.forEach(r => {
    if (r[key] != null && r[outcome] != null) (byOwner[r.owner] = byOwner[r.owner] || []).push(r);
  });
  const good = [], bad = [];
  Object.values(byOwner).forEach(v => {
    if (v.length < 2) return;
    const mk = mean(v.map(r => r[key])), mr = mean(v.map(r => r[outcome]));
    v.forEach(r => {
      const d = r[key] - mk, dr = r[outcome] - mr;
      // dr < 0 is a BETTER-than-his-own-average season (lower is better).
      (dr <= 0 ? good : bad).push({ d: d, dr: dr });
    });
  });
  // Effect measured as "does deviating LATER go with a worse outcome", inside
  // each half. Same sign convention as `spread`.
  const eff = arr => {
    const e = arr.filter(x => x.d < 0).map(x => x.dr);
    const l = arr.filter(x => x.d > 0).map(x => x.dr);
    return (e.length && l.length) ? mean(l) - mean(e) : NaN;
  };
  return { goodHalf: eff(good), badHalf: eff(bad), nGood: good.length, nBad: bad.length };
}

/* HOW MUCH DO THE TWO OUTCOMES ALREADY AGREE, BEFORE ANY METRIC IS INVOLVED?
 *
 * Reporting "this effect shows up in BOTH the rank column and the weekly-pot
 * column" invites the reader to count two witnesses. They are not two witnesses
 * if the columns are the same thing twice. Measured within manager (the same
 * centring the tests use, so it is the relevant correlation and not the raw one
 * that "who is good" inflates) it is about -0.44 — related, far from identical.
 * So agreement is a real filter, worth less than double. Printed, not assumed. */
function outcomeCorrelation(data) {
  const byOwner = {};
  data.forEach(r => (byOwner[r.owner] = byOwner[r.owner] || []).push(r));
  const dr = [], dw = [];
  Object.values(byOwner).forEach(v => {
    if (v.length < 2) return;
    const mr = mean(v.map(r => r.rank)), mw = mean(v.map(r => r.weekly_highs));
    v.forEach(r => { dr.push(r.rank - mr); dw.push(r.weekly_highs - mw); });
  });
  const c = (a, b) => {
    const ma = mean(a), mb = mean(b);
    const num = a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0);
    const da = Math.sqrt(a.reduce((s, x) => s + (x - ma) * (x - ma), 0));
    const db = Math.sqrt(b.reduce((s, x) => s + (x - mb) * (x - mb), 0));
    return (da && db) ? num / (da * db) : NaN;
  };
  return { within: c(dr, dw), n: dr.length,
    meanWins: mean(data.map(r => r.weekly_highs)),
    maxWins: Math.max.apply(null, data.map(r => r.weekly_highs)) };
}

const METRICS = [
  ['qb_first', 'first QB taken', 'earlier'],
  ['te_first', 'first TE taken', 'earlier'],
  ['rb_first6', 'RB among first 6 picks', 'more'],
  ['wr_first6', 'WR among first 6 picks', 'more'],
  ['rb_total', 'total RB drafted', 'more'],
  ['wr_total', 'total WR drafted', 'more'],
];

const DATA = rows();

if (require.main === module) {
  console.log('WHAT WORKED IN THIS LEAGUE — draft shape against finish\n');
  const seasons = [...new Set(DATA.map(r => r.season))];
  const owners = [...new Set(DATA.map(r => r.owner))];
  console.log('  ' + DATA.length + ' team-seasons · ' + seasons.length + ' completed seasons ('
    + seasons.join(', ') + ') · ' + owners.length + ' managers');
  console.log('  RANK IS THE OUTCOME. Lower is better, so a NEGATIVE effect below means');
  console.log('  the team finished HIGHER.\n');

  console.log('  1. THE NAIVE CUT — top 3 vs bottom 3, which is what "look at the winners"');
  console.log('     asks for. Shown because it is the comparison that misleads.\n');
  console.log('     metric                    top-3    bottom-3       gap');
  METRICS.forEach(([k, label]) => {
    const top = DATA.filter(r => r.rank <= 3 && r[k] != null).map(r => r[k]);
    const bot = DATA.filter(r => r.rank >= 8 && r[k] != null).map(r => r[k]);
    console.log('     ' + label.padEnd(24) + mean(top).toFixed(1).padStart(6)
      + mean(bot).toFixed(1).padStart(12) + (mean(top) - mean(bot)).toFixed(1).padStart(10));
  });
  console.log('\n     n = 9 and 9. THE SAME MANAGERS RECUR, so these are not 18 independent');
  console.log('     observations and a single strong manager can produce every gap above.\n');

  console.log('  2. WITHIN EACH MANAGER — the test that removes who-is-good entirely.');
  console.log('     "did HE finish better in the seasons HE drafted differently than usual"\n');
  console.log('     metric                    when LOWER   when HIGHER   spread   n');
  const found = [];
  METRICS.forEach(([k, label]) => {
    const w = withinManager(DATA, k);
    if (!isFinite(w.spread)) return;
    console.log('     ' + label.padEnd(24)
      + (w.early >= 0 ? '+' : '') + w.early.toFixed(2).padStart(8)
      + (w.late >= 0 ? '   +' : '   ') + w.late.toFixed(2).padStart(8)
      + w.spread.toFixed(2).padStart(9) + ('  ' + (w.nEarly + w.nLate)).padStart(5));
    if (Math.abs(w.spread) >= 0.75) found.push([label, w]);
  });

  /* ── OUTCOME 2: THE WEEKLY POT ─────────────────────────────────────────
   * $1,500 of $4,000. Won by ceiling, not by season total, so a shape that
   * wins it need not be the shape that finishes first. */
  const wkTotal = DATA.reduce((n, r) => n + (r.weekly_highs || 0), 0);
  console.log('\n  3. THE WEEKLY POT — a DIFFERENT outcome, and 37.5% of the money');
  console.log('     ($100 x 15 weeks = $1,500 of $4,000; playoffs are $2,125, rank $375.)');
  console.log('     Won by weekly CEILING rather than season total, so it can reward a');
  console.log('     different draft shape. ' + wkTotal + ' weekly-high wins across the sample.\n');
  console.log('     metric                    when LOWER   when HIGHER   spread   n');
  METRICS.forEach(([k, label]) => {
    const w = withinManager(DATA, k, 'weekly_highs_neg');
    if (!isFinite(w.spread)) return;
    console.log('     ' + label.padEnd(24)
      + (w.early >= 0 ? '+' : '') + w.early.toFixed(2).padStart(8)
      + (w.late >= 0 ? '   +' : '   ') + w.late.toFixed(2).padStart(8)
      + w.spread.toFixed(2).padStart(9) + ('  ' + (w.nEarly + w.nLate)).padStart(5));
  });
  console.log('\n     Sign convention matches rank: NEGATIVE = more weekly-high wins.');

  /* ⚠ HOW MUCH IS "AGREEMENT" WORTH? Not as much as it looks, and the number
   * has to be printed or a reader will treat two columns as two witnesses. */
  const oc = outcomeCorrelation(DATA);
  console.log('\n     ⚠ THESE TWO OUTCOMES ARE NOT INDEPENDENT. Within-manager correlation');
  console.log('     between rank and weekly-high wins is ' + oc.within.toFixed(3) + ' (n=' + oc.n + ') — a good');
  console.log('     season tends to produce both. So a metric agreeing across the two');
  console.log('     columns is PARTLY automatic and is weaker corroboration than it looks.');
  console.log('     It is still the best filter available here: an effect that appears in');
  console.log('     one column and reverses in the other is noise or tension, never both.');
  console.log('\n     AND THE RESOLUTION IS COARSE: weekly-high wins run 0 to 4 per');
  console.log('     team-season (mean ' + oc.meanWins.toFixed(2) + '). Every spread above is a FRACTION OF ONE');
  console.log('     WIN. Only an effect near 1.0 is worth a second look here.');

  /* ── OUTCOME 3: THE BAD TAIL ───────────────────────────────────────────── */
  console.log('\n  4. "WHAT NOT TO DO" — asymmetry, NOT a separate bottom-three cut\n');
  console.log('     Cutting the worst teams and testing them is the SAME data again: rank');
  console.log('     is a continuum and the test above already uses all of it. What is');
  console.log('     genuinely different is whether an effect is asymmetric — mild when a');
  console.log('     season goes well, severe when it goes badly. That is the shape that');
  console.log('     makes a move worth avoiding.\n');
  console.log('     metric                   his GOOD half  his BAD half   ratio');
  METRICS.forEach(([k, label]) => {
    const a = asymmetry(DATA, k, 'rank');
    if (!isFinite(a.goodHalf) || !isFinite(a.badHalf)) return;
    /* THE DENOMINATOR GUARD. My first version used 0.01 and duly printed a
     * ratio of -23.75 for TE, off a good-half effect of +0.03 — a number
     * manufactured entirely by dividing by ~nothing, and the largest figure in
     * the table. A ratio is only meaningful when its denominator is meaningful,
     * so below a tenth of a rank position it is not reported at all. */
    const ratio = Math.abs(a.goodHalf) >= 0.10
      ? (a.badHalf / a.goodHalf).toFixed(2) : 'flat';
    console.log('     ' + label.padEnd(24)
      + (a.goodHalf >= 0 ? '+' : '') + a.goodHalf.toFixed(2).padStart(10)
      + (a.badHalf >= 0 ? '   +' : '   ') + a.badHalf.toFixed(2).padStart(9)
      + String(ratio).padStart(9));
  });
  console.log('\n     A large ratio means the downside is worse than the upside is good.');
  console.log('     With ' + owners.length + ' managers over ' + seasons.length + ' seasons each half holds ~15 rows, so');
  console.log('     read these as DIRECTION ONLY — no half of this table has the n to');
  console.log('     support a magnitude.');

  /* ── THE FILTER, APPLIED — because three tables invite cherry-picking ──── */
  console.log('\n  5. WHAT SURVIVES BOTH OUTCOMES\n');
  console.log('     The only defensible filter here: an effect must point the SAME WAY');
  console.log('     for season rank and for the weekly pot. One column alone is one');
  console.log('     comparison out of ' + (METRICS.length * 3) + ' and cheap to find by accident.\n');
  const agreed = [], tension = [];
  METRICS.forEach(([k, label]) => {
    const a = withinManager(DATA, k, 'rank');
    const b = withinManager(DATA, k, 'weekly_highs_neg');
    if (!isFinite(a.spread) || !isFinite(b.spread)) return;
    if (Math.abs(a.spread) < 0.75) return;          // below the rank noise floor
    if (Math.sign(a.spread) === Math.sign(b.spread)) agreed.push([label, a, b]);
    else tension.push([label, a, b]);
  });
  if (agreed.length) {
    console.log('     AGREE across both pots (carry forward as hypotheses):');
    agreed.forEach(([label, a, b]) => console.log('       · ' + label.padEnd(24)
      + ' rank ' + (a.spread > 0 ? '+' : '') + a.spread.toFixed(2)
      + '   weekly ' + (b.spread > 0 ? '+' : '') + b.spread.toFixed(2)));
  }
  if (tension.length) {
    console.log('\n     IN TENSION — the two pots want OPPOSITE things here. Do NOT act on');
    console.log('     these from one column; the disagreement is the finding:');
    tension.forEach(([label, a, b]) => console.log('       · ' + label.padEnd(24)
      + ' rank ' + (a.spread > 0 ? '+' : '') + a.spread.toFixed(2)
      + '   weekly ' + (b.spread > 0 ? '+' : '') + b.spread.toFixed(2)));
  }
  console.log('\n     NOTHING HERE IS WIRED, and nothing should be on this sample. The');
  console.log('     value of this table is that it names what to COMMIT A PREDICTION ON');
  console.log('     before the season, which is the only thing that can settle any of it.');

  console.log('\n  6. WHAT TO DO WITH IT\n');
  const COMPARISONS = METRICS.length * 3;
  console.log('     ⚠ COMPARISONS RUN: ' + COMPARISONS + ' (' + METRICS.length + ' metrics x 3 views:');
  console.log('     rank, weekly pot, asymmetry). Adding outcomes multiplies the chances');
  console.log('     of a spurious standout — at this count roughly THREE results of');
  console.log('     "interesting" size are expected from noise alone. A finding that');
  console.log('     appears in ONE view and not the others is almost certainly one of them.');
  console.log('     THE ONLY ONES WORTH CARRYING are those that agree across views.\n');
  console.log('     metrics tested: ' + METRICS.length + '. At this sample size roughly one');
  console.log('     spurious result of "interesting" size is expected by chance, so a single');
  console.log('     standout among six is NOT evidence — it is the expected noise.');
  if (found.length) {
    console.log('\n     effects at or above 0.75 rank positions:');
    found.forEach(([label, w]) => console.log('       · ' + label + '  spread '
      + w.spread.toFixed(2) + ' over ' + w.managers + ' managers, n=' + (w.nEarly + w.nLate)));
    console.log('\n     TREAT AS HYPOTHESES. Each is ~1 rank position in a ten-team league,');
    console.log('     measured on ' + owners.length + ' managers over ' + seasons.length + ' seasons. That is enough to');
    console.log('     justify testing them forward, and nowhere near enough to draft on.');
  } else {
    console.log('\n     nothing clears 0.75 rank positions. That is a real answer: the draft');
    console.log('     shapes measured here do not separate this league\'s finishers.');
  }
  console.log('\n     THE WAY TO SETTLE ANY OF THEM is forward prediction, not more slicing');
  console.log('     of the same 30 rows — commit the claim before the season, grade it after.');
}

module.exports = { rows, withinManager, asymmetry, weeklyHighs, outcomeCorrelation,
  METRICS, DATA,
  WEEKLY_HIGH_WEEKS };
