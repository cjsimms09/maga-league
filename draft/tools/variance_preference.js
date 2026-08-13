// TERRITORY: A
/* DOES WEEK-TO-WEEK VARIANCE HELP OR HURT IN *THIS* LEAGUE? — measured, small n.
 *
 * Cory: *"a player who is more boom or bust might be more desirable than in
 * other leagues because of our weekly payout... nothing I say about strategy
 * should be taken as a rule but more something to be studied."*
 *
 * Taken exactly that way. This measures and does not rule.
 *
 * ── FIRST, A GOVERNANCE FLAG THAT HAS TO COME BEFORE THE ANALYSIS ──────────
 *
 * THERE IS NO WEEKLY-PAYOUT FIELD IN THIS LEAGUE'S SETTINGS. Sleeper records
 * playoff_week_start 16 and playoff_teams 4 and nothing about money. The only
 * per-week stakes on disk are the 546 side-bet artifacts in data/, and those are
 * THE MARKET LAYER, which rule 15 makes read-only and invisible to any live
 * draft, waiver or lineup decision.
 *
 * So if "our weekly payout" means the side-bet market, then building it into the
 * draft objective is precisely what rule 15 forbids, and the fact that the
 * resulting advice would be sensible does not make it permitted. If it means an
 * out-of-band league rule, it is not in any artifact I can see and I cannot
 * model its shape without being told it. EITHER WAY THE PAYOUT ARM IS NOT BUILT
 * HERE. What IS built is the part that is pure league structure and needs no
 * payout at all: head-to-head weekly matchups with four playoff slots.
 *
 * ── WHY THE STRUCTURE ALONE ALREADY IMPLIES A VARIANCE PREFERENCE ──────────
 *
 * The objective document says: MAXIMISE EXPECTED POINTS SCORED BY MY STARTING
 * LINEUP OVER THE SEASON. That sentence is VARIANCE-NEUTRAL -- it is linear in
 * points, so it cannot express a preference between two players with the same
 * mean and different spread. But the league does not pay out on total points. It
 * pays out on WINS, and a win is a threshold event. Any threshold makes the
 * objective nonlinear, and nonlinearity is exactly where a variance preference
 * comes from.
 *
 * The textbook direction: variance helps an UNDERDOG and hurts a FAVOURITE.
 * P(you beat a stronger opponent) rises with your spread; P(you beat a weaker
 * one) falls. So the preference is not a constant of the league, it is a
 * function of how good your team is -- which is measurable here.
 *
 * ── WHAT THIS CANNOT SUPPORT, SAID BEFORE THE NUMBERS ──────────────────────
 *
 * n = 30 team-seasons. That is enough to see a large effect and nowhere near
 * enough to see a real one of plausible size. Every result below is reported
 * with its n and NONE of them should move a weight. The honest use of this file
 * is to say whether the question is worth instrumenting in September, not to
 * answer it today.
 *
 * Run: node draft/tools/variance_preference.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const HIST = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));

const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) * (v - m)))); };
function corr(a, b) {
  const ma = mean(a), mb = mean(b);
  let c = 0, va = 0, vb = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; c += x * y; va += x * x; vb += y * y; }
  return (va > 0 && vb > 0) ? c / Math.sqrt(va * vb) : NaN;
}
/* Partial correlation of a and b controlling for c. I justified this in an
 * earlier draft by asserting that better teams score more AND swing more, so the
 * raw sd-vs-wins correlation would mostly be re-measuring the mean. THAT
 * ASSERTION IS FALSE IN THIS LEAGUE: corr(mean, sd) is 0.045, level and spread
 * are near-independent, and the control moves the answer from 0.162 to 0.192.
 * The partial is still the correct statistic to report — it just is not doing
 * the work I claimed for it, and the claim was written before it was checked. */
function partial(a, b, c) {
  const rab = corr(a, b), rac = corr(a, c), rbc = corr(b, c);
  const d = Math.sqrt((1 - rac * rac) * (1 - rbc * rbc));
  return d > 0 ? (rab - rac * rbc) / d : NaN;
}

console.log('VARIANCE PREFERENCE IN THIS LEAGUE — measured on 3 seasons, n=30 team-seasons\n');
console.log('  GOVERNANCE FLAG FIRST: there is no weekly-payout field in this league\'s');
console.log('  settings. The only per-week stakes on disk are the side-bet artifacts, and');
console.log('  rule 15 makes the market layer invisible to draft decisions. The payout arm');
console.log('  is therefore NOT modelled here. What follows uses league STRUCTURE only:');
console.log('  head-to-head weekly matchups, 4 playoff slots.\n');

/* ── 1. BUILD THE TEAM-SEASON TABLE ────────────────────────────────────────
 * Regular season only. playoff_week_start is 16, so weeks 1-15 are the games
 * that decide seeding; 16-18 are the bracket and belong to a different question. */
const rows = [];
HIST.seasons.filter(s => s.status === 'complete').forEach(s => {
  const PW = (s.settings || {}).playoff_week_start || 16;
  const weeks = Object.keys(s.weeks).map(Number).filter(w => w < PW).sort((a, b) => a - b);
  const byRoster = {};
  const weeklyAll = {};                     // week -> [{roster, points}]
  weeks.forEach(w => {
    const rowsW = s.weeks[String(w)] || [];
    weeklyAll[w] = rowsW.map(r => ({ roster: r.roster_id, pts: Number(r.points) || 0 }));
    rowsW.forEach(r => {
      (byRoster[r.roster_id] = byRoster[r.roster_id] || []).push({
        w, pts: Number(r.points) || 0, mid: r.matchup_id });
    });
  });
  const stand = {};
  (s.standings || []).forEach(t => { stand[t.roster_id] = t; });
  Object.keys(byRoster).forEach(rid => {
    const g = byRoster[rid];
    const pts = g.map(x => x.pts);
    /* head-to-head wins recomputed from the weekly rows rather than trusting the
     * standings field, so wins and the score series are guaranteed to describe
     * the same games. */
    let wins = 0, highs = 0;
    g.forEach(x => {
      const opp = (weeklyAll[x.w] || []).find(o => {
        const rec = (s.weeks[String(x.w)] || []).find(r => r.roster_id === o.roster);
        return rec && rec.matchup_id === x.mid && String(o.roster) !== String(rid);
      });
      if (opp && x.pts > opp.pts) wins++;
      const top = Math.max(...(weeklyAll[x.w] || []).map(o => o.pts));
      if (x.pts >= top) highs++;
    });
    const st = stand[rid] || {};
    rows.push({ season: s.season, rid: +rid, n: g.length,
      mu: mean(pts), sd: sd(pts), cv: sd(pts) / mean(pts),
      wins, highs, rank: st.rank || 99, playoff: (st.rank || 99) <= ((s.settings || {}).playoff_teams || 4) });
  });
});

console.log('  THE TABLE (regular season, weeks 1-15)');
console.log('    season  team   games   mean/wk     sd    cv     wins   weekly highs   seed');
console.log('    ' + '-'.repeat(82));
rows.slice().sort((a, b) => (a.season === b.season ? a.rank - b.rank : a.season.localeCompare(b.season)))
  .forEach(r => console.log('    ' + r.season + '   ' + String(r.rid).padStart(3)
    + String(r.n).padStart(8) + r.mu.toFixed(1).padStart(10) + r.sd.toFixed(1).padStart(8)
    + r.cv.toFixed(3).padStart(7) + String(r.wins).padStart(7) + String(r.highs).padStart(13)
    + String(r.rank).padStart(8) + (r.playoff ? '  *' : '')));

/* ── 2. THE CORRELATIONS, WITH THE MEAN CONTROLLED ────────────────────────
 * The raw sd-vs-wins correlation is nearly uninterpretable because good teams
 * both score more and swing more. The partial is the quantity of interest. */
const mu = rows.map(r => r.mu), s_ = rows.map(r => r.sd);
const wins = rows.map(r => r.wins), highs = rows.map(r => r.highs);
const seed = rows.map(r => -r.rank);           // higher is better
console.log('\n  DOES SPREAD PREDICT ANYTHING, ONCE SCORING LEVEL IS CONTROLLED FOR?');
console.log('    n = ' + rows.length + ' team-seasons');
console.log('    ' + '-'.repeat(70));
console.log('    corr(mean, wins)                        ' + corr(mu, wins).toFixed(3)
  + '   <- the sanity check: scoring more must win more');
console.log('    corr(sd, wins)          raw             ' + corr(s_, wins).toFixed(3));
console.log('    corr(sd, wins)          mean controlled ' + partial(s_, wins, mu).toFixed(3));
console.log('    corr(sd, weekly highs)  mean controlled ' + partial(s_, highs, mu).toFixed(3)
  + '   <- the ceiling channel');
console.log('    corr(sd, seed)          mean controlled ' + partial(s_, seed, mu).toFixed(3));
/* I WROTE THE CONTROL'S JUSTIFICATION BEFORE MEASURING IT AND THE MEASUREMENT
 * DISAGREED. The header says the partial is needed because "better teams score
 * more AND swing more". In this league they do not: corr(mean, sd) is 0.045, so
 * level and spread are near-independent and the control barely moves anything
 * (raw 0.162 -> partial 0.192). The partial is still the RIGHT statistic, but
 * the stated reason for it was an assumption, not a fact about this league. */
console.log('    corr(mean, sd)                          ' + corr(mu, s_).toFixed(3)
  + '   <- NEAR ZERO: level and spread are independent here, so the');
console.log('                                                  control changes little. My stated');
console.log('                                                  reason for it was wrong, the');
console.log('                                                  statistic is still right.');

/* ── 3. THE SPLIT THE THEORY ACTUALLY PREDICTS ────────────────────────────
 * "Variance helps" is the wrong shape of claim. The prediction is that variance
 * helps the WEAK and hurts the STRONG, so a pooled correlation can be near zero
 * while the effect is real and opposite in the two halves. */
const med = rows.map(r => r.mu).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
console.log('\n  THE SPLIT THAT THEORY PREDICTS — variance should help the UNDERDOG');
console.log('    (a pooled correlation can be ~0 while both halves are real and opposite)');
console.log('    half                 n    corr(sd, wins)   mean wins');
console.log('    ' + '-'.repeat(60));
[['above median scoring', r => r.mu >= med], ['below median scoring', r => r.mu < med]].forEach(([lbl, f]) => {
  const g = rows.filter(f);
  console.log('    ' + lbl.padEnd(22) + String(g.length).padStart(3)
    + partial(g.map(r => r.sd), g.map(r => r.wins), g.map(r => r.mu)).toFixed(3).padStart(14)
    + mean(g.map(r => r.wins)).toFixed(1).padStart(12));
});

/* ── 4. HOW BIG AN EFFECT COULD THIS DESIGN EVEN SEE? ─────────────────────
 * Reporting a correlation without its detectable size is how "no effect" gets
 * confused with "no power". At n=30 the 95% threshold for a correlation is
 * roughly 2/sqrt(n).*/
const crit = 2 / Math.sqrt(rows.length);
/* ── 3b. WHERE CORY'S OWN TEAM SITS, WHICH IS WHAT MAKES THE SPLIT ACTIONABLE ─
 * The split says the preference depends on whether you are the favourite. That
 * is useless without knowing which he is. League data only -- standings and
 * weekly scores -- never the side-bet artifacts. */
{
  const OWNER = '434915673219526656';        // holds the Chase/Henry/Walker keeper base
  console.log('\n  AND WHICH HALF IS CORY IN? (league standings only, not the market layer)');
  console.log('    season   ppg    league median   sd     seed   record');
  console.log('    ' + '-'.repeat(62));
  HIST.seasons.filter(s => s.status === 'complete').forEach(s => {
    const r = (s.final_rosters || []).find(x => String(x.owner_id) === OWNER);
    if (!r) return;
    const st = (s.standings || []).find(x => x.roster_id === r.roster_id) || {};
    const row = rows.find(x => x.season === s.season && x.rid === r.roster_id) || {};
    const meds = (s.standings || []).map(x => x.points_for / 15).sort((a, b) => a - b);
    const medp = meds[Math.floor(meds.length / 2)];
    console.log('    ' + s.season + '  ' + (row.mu || 0).toFixed(1).padStart(6)
      + medp.toFixed(1).padStart(14) + (row.sd || 0).toFixed(1).padStart(8)
      + String(st.rank).padStart(7) + '   ' + st.wins + '-' + st.losses
      + ((row.mu || 0) < medp ? '   below median' : '   above median'));
  });
  console.log('\n    TWO SEASONS AT OR BELOW MEDIAN SCORING, ONE ABOVE. And the two extremes');
  console.log('    line up with the mechanism: 2023 made the playoffs at seed 4 on');
  console.log('    BELOW-median scoring with the 2nd-highest spread in the league; 2025');
  console.log('    finished 7th at 5-10 on below-median scoring with the LOWEST spread.');
  console.log('    THAT IS n = 2 AND IT IS AN ANECDOTE, NOT EVIDENCE. It is included because');
  console.log('    it is the same direction as the n=15 half-sample above, and because a');
  console.log('    reader would find it anyway and should find it labelled.');
  console.log('    It also does NOT forecast this year: the keeper base is Chase, Henry and');
  console.log('    Walker plus pick 8, which is a stronger start than any of those seasons.');
  console.log('    Which half he lands in for 2026 is a projection nobody has made.');
}

console.log('\n  POWER — what this design could and could not have found');
console.log('    ' + '-'.repeat(70));
console.log('    n = ' + rows.length + ', so a correlation must exceed roughly ' + crit.toFixed(2)
  + ' to be distinguishable from zero.');
console.log('    An effect of realistic size for a strategy tweak is FAR below that.');
console.log('    THEREFORE: any near-zero result here is a statement about the SAMPLE,');
console.log('    not about football. It cannot license "variance does not matter", and it');
console.log('    must not be cited as if it did — that is how the tier and bye nulls got');
console.log('    over-read.');

/* ── 5. WHAT THE MODEL CURRENTLY DOES ABOUT VARIANCE, WHICH IS INCOHERENT ─
 * Independent of whether variance is good, the model should at least be
 * CONSISTENT about it. It is not. */
console.log('\n  WHAT THE MODEL DOES ABOUT VARIANCE TODAY — three answers to one question');
console.log('    ' + '-'.repeat(70));
console.log('    STARTERS   priced at proj_mean.  VARIANCE-NEUTRAL: two players with the');
console.log('               same mean are interchangeable however different their spread.');
console.log('    BENCH      priced at E[max(0, X - waiver)].  VARIANCE-LOVING by');
console.log('               construction — the option pays for spread, which is correct for');
console.log('               a bench seat and is why it rewards youth with no age term.');
console.log('    ENGINE     `ceiling` weight measured "unsignable" and shipped at 0 — but');
console.log('               proj_ceiling = proj_mean + 1.036 x proj_sd, so that measurement');
console.log('               could never have been anything else (independence_screen.js).');
console.log('\n    So the stack is variance-neutral where the payout is nonlinear (starters,');
console.log('    who decide the weekly matchup) and variance-loving where it is closest to');
console.log('    linear (the bench). If either is right it is by accident. THAT');
console.log('    INCOHERENCE IS A FINDING AVAILABLE TODAY and does not depend on the n=30');
console.log('    result above, on the payout structure, or on rule 15.');

console.log('\n  WHAT WOULD ACTUALLY SETTLE IT — and it is cheap in September');
console.log('    The quantity is P(my lineup outscores my opponent this week), which needs');
console.log('    a weekly score DISTRIBUTION per team, not a season total. Every input');
console.log('    exists: weekly_sd is on all 576 players, and the weekly grading cron is');
console.log('    already live. This is one component spec away from being gradeable, and');
console.log('    it should be pre-registered BEFORE week 1 like the others — with its');
console.log('    implications written in advance, so a small n cannot be read as a null.');
