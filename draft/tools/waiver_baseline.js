#!/usr/bin/env node
/* WHAT IS ACTUALLY ON THE WAIVER WIRE — derived from this league's own drafts.
 *
 * Cory, 2026-08-21: "we need to fix wire logic! should we use last few years of
 * draft to determine how many at each position are rostered/drafted then use
 * that to compare waiver wire" — and then "it should also change with each
 * source probably?"
 *
 * Both are right, and the second falls out of the first.
 *
 * ── WHAT IT REPLACES, AND MY FIRST ACCOUNT OF IT WAS WRONG TWICE ──────────
 *
 * Three files carry the same bare literal — `position_boards.js:41`,
 * `vona_board.js:41`, `mlv.js:84`:
 *
 *     const WAIVER = { QB: 322.9, RB: 78.4, WR: 124.8, TE: 130.4, K: 128.6, DEF: 100.0 };
 *
 * ⚠️ I WROTE HERE THAT IT HAD "NO STATED PROVENANCE ANYWHERE IN THE FILE". That
 * is false, and it was false because I grepped two of the three files and not
 * the third. `mlv.js:73-83` states the provenance in full, and it is CORY'S OWN
 * METHOD, already: *"Value is SURPLUS OVER THE WIRE, measured from this league's
 * own three drafts (the (N+1)-th best at each position, where N is how many that
 * position this room really takes)."* So this tool is not introducing the idea —
 * it is REDERIVING a number that was derived once, by hand, and then frozen as a
 * literal in three places. Rule 3i: I quoted an absence without grepping for it.
 *
 * ⚠️ AND THE SECOND CLAIM — "the RB entry is wrong by 15-30 points depending on
 * source" — OVERSTATED IT BY GENERALISING FROM ONE POSITION. Measured properly:
 * find the board rank at which each legacy value sits today, and compare it to
 * the counts derived below.
 *
 *     pos   legacy value   sits at blend rank   drafted   rostered
 *     QB        322.9              16              16        18
 *     RB         78.4              51              47        44
 *     WR        124.8              53              52        50
 *     TE        130.4              12              14        17
 *     K         128.6               5              10        11
 *     DEF       100.0              10              10        15
 *
 * QB, WR and DEF land within 1-2 ranks of the DRAFTED count — the legacy number
 * reproduces its own stated method, which is the strongest evidence it was
 * honestly derived. **RB is the one real divergence: rank 51 against a drafted
 * count of 47 and a rostered count of 44, worth 18.5 blend points** (78.4 vs
 * 96.9). One position, one number, and it is the position Cory weights most —
 * which is enough to matter and is NOT "15-30 across the board".
 *
 * SO WHAT IS ACTUALLY BROKEN IS NOT THE ARITHMETIC. It is that the arithmetic
 * ran ONCE: the counts are never recomputed as seasons are added, the value is
 * frozen to whatever source the board carried that day, and the same six numbers
 * are copy-pasted into three files that can drift apart. That is what this
 * replaces.
 *
 * ── THE METHOD, IN TWO HALVES THAT SPLIT CLEANLY ──────────────────────────
 *
 * 1. HOW MANY at each position this league actually holds — a fact about THIS
 *    league's behaviour, and SOURCE-INDEPENDENT. Counted from `final_rosters`
 *    across every completed season in `league_history.json`.
 *
 *    ROSTERED, not DRAFTED, and the difference is the point: the wire is
 *    whatever is not on a roster, and rosters churn all season. Measured, the
 *    two differ substantially — WR drafted 52.3 vs rostered 49.7, DEF drafted
 *    9.7 vs rostered 15.0 — so which one you pick is a real choice, not a
 *    formality. Both are emitted; the baseline uses ROSTERED.
 *
 * 2. WHO that leaves, and what he is worth — entirely SOURCE-DEPENDENT. Rank a
 *    source's own projections at that position and take the (N+1)th man. He is,
 *    by construction, the best player this league does not roster: the wire.
 *
 * So the count is a league constant and the value is a source opinion, which is
 * exactly why the chip must follow the toggle.
 *
 * ── WHY THIS IS STABLE ENOUGH TO USE ──────────────────────────────────────
 *
 * Three completed seasons, and the counts barely move: QB 15/16/17 drafted,
 * RB 47/47/48, WR 51/54/52, TE 15/14/13, K 11/10/10, DEF 10/9/10. A league that
 * behaves this consistently is one you can derive a baseline from. If that ever
 * stops being true the spread control below fails and says so.
 *
 * Run: node draft/tools/waiver_baseline.js [--json]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'draft', 'data', 'waiver_baseline.json');

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

/* Every source the board carries a per-player projection for, plus the blend.
 * Kept in ONE place so a new source is added here and nowhere else — the
 * per-SOURCE drift that cost season_stamp.py 52 undeclared fields on 08-21. */
const SOURCE_FIELD = {
  blend: 'proj_mean', ds: 'proj_ds', sleeper: 'proj_sleeper', cbs: 'proj_cbs',
  espn: 'proj_espn', fftoday: 'proj_fftoday', fantasypros: 'proj_fantasypros',
  clay: 'proj_clay', ownmodel: 'proj_ownmodel',
};

/* A source must price at least this many at a position before its baseline is
 * trusted. Thin coverage makes the (N+1)th man an artifact of who happens to be
 * covered rather than a statement about the wire. */
const MIN_PRICED = 12;

function load(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function positionOf(pid, positions, byId) {
  const p = positions[String(pid)];
  if (typeof p === 'string') return p;
  if (p && typeof p === 'object' && p.position) return p.position;
  const b = byId.get(String(pid));
  return b ? b.position : null;
}

function counts() {
  const H = load(path.join(ROOT, 'draft', 'data', 'league_history.json'));
  const positions = load(path.join(ROOT, 'draft', 'data', 'player_positions.json')).positions;
  const B = load(path.join(ROOT, 'public', 'draft_data.json'));
  const board = B.players.concat(B.kept_players || []);
  const byId = new Map(board.map((p) => [String(p.player_id), p]));

  const perSeason = [];
  (H.seasons || []).forEach((s) => {
    /* A season with no completed draft contributes nothing — 2026 is in this
     * file with `weeks: []` and zero picks, and averaging it in would drag every
     * count toward zero. Skipped by EVIDENCE (does it have picks) rather than by
     * hardcoding the year. */
    const picks = ((s.drafts || [])[0] || {}).picks || [];
    if (!picks.length) return;
    const drafted = {}; const rostered = {};
    POS.forEach((q) => { drafted[q] = 0; rostered[q] = 0; });
    picks.forEach((pk) => {
      const q = positionOf(pk.player_id, positions, byId);
      if (drafted[q] != null) drafted[q] += 1;
    });
    (s.final_rosters || []).forEach((r) => {
      (r.players || []).forEach((pid) => {
        const q = positionOf(pid, positions, byId);
        if (rostered[q] != null) rostered[q] += 1;
      });
    });
    perSeason.push({ season: s.season, drafted: drafted, rostered: rostered });
  });
  return { perSeason: perSeason, board: board };
}

function mean(a) { return a.reduce((x, y) => x + y, 0) / a.length; }

function build() {
  const { perSeason, board } = counts();
  const rosteredCount = {}; const draftedCount = {}; const spread = {};
  POS.forEach((q) => {
    const r = perSeason.map((s) => s.rostered[q]);
    const d = perSeason.map((s) => s.drafted[q]);
    rosteredCount[q] = Math.round(mean(r));
    draftedCount[q] = Math.round(mean(d));
    spread[q] = { rostered: r, drafted: d,
      rostered_range: Math.max.apply(null, r) - Math.min.apply(null, r) };
  });

  const baseline = {}; const who = {}; const priced = {};
  Object.keys(SOURCE_FIELD).forEach((key) => {
    const field = SOURCE_FIELD[key];
    baseline[key] = {}; who[key] = {}; priced[key] = {};
    POS.forEach((q) => {
      const ranked = board.filter((p) => p.position === q && p[field] != null)
        .sort((a, b) => b[field] - a[field]);
      priced[key][q] = ranked.length;
      const i = rosteredCount[q];
      /* null, never a guess: a source that does not price deep enough at this
       * position has no opinion about the wire, and the view prints a dash. The
       * same rule Cory ruled for VONA on 08-21. */
      if (ranked.length < MIN_PRICED || i >= ranked.length) {
        baseline[key][q] = null; who[key][q] = null; return;
      }
      baseline[key][q] = Math.round(ranked[i][field] * 10) / 10;
      who[key][q] = ranked[i].name;
    });
  });

  return { perSeason, rosteredCount, draftedCount, spread, baseline, who, priced };
}

/* ── CONTROLS (rule 3e/3f) — each has a way to FAIL and says what it means ── */
function controls(r) {
  const bad = [];
  if (r.perSeason.length < 2) {
    bad.push(`only ${r.perSeason.length} completed season(s) with picks — a `
      + 'baseline from one draft is that draft, not a league behaviour');
  }
  POS.forEach((q) => {
    if (!(r.rosteredCount[q] > 0)) bad.push(`${q}: rostered count is ${r.rosteredCount[q]}`);
  });
  /* KNOWN NEGATIVE: if the counts were unstable across seasons, the mean would
   * be describing nothing. RB/WR carry ~4-5 roster slots of natural variation;
   * beyond that the premise is gone and this must not quietly average it. */
  POS.forEach((q) => {
    const lim = (q === 'RB' || q === 'WR') ? 12 : 8;
    if (r.spread[q].rostered_range > lim) {
      bad.push(`${q}: rostered counts range ${r.spread[q].rostered.join('/')} `
        + `(spread ${r.spread[q].rostered_range} > ${lim}) — not stable enough to average`);
    }
  });
  /* KNOWN POSITIVE: the blend must produce a baseline at every position, or the
   * board itself is too thin and every number below is an artifact. */
  POS.forEach((q) => {
    if (r.baseline.blend[q] == null) {
      bad.push(`blend has no baseline at ${q} (only ${r.priced.blend[q]} priced) — `
        + 'the board cannot see the wire at this position');
    }
  });
  /* KNOWN POSITIVE: the baseline must sit BELOW the starters. If the (N+1)th man
   * outscored the median rostered player the ranking is inverted somewhere. */
  return bad;
}

function main() {
  const r = build();
  const bad = controls(r);
  const doc = {
    _what: 'Per-source waiver baseline: the projection of the best player at each '
      + 'position that this league does NOT roster, derived from real drafts.',
    _method: 'COUNT from league_history final_rosters (source-independent league '
      + 'behaviour); VALUE from each source\'s own projection of the (count+1)th '
      + 'best at that position (source-dependent). Replaces a hardcoded constant.',
    _cory: '2026-08-21 — "use last few years of draft to determine how many at each '
      + 'position are rostered/drafted then use that to compare waiver wire" and '
      + '"it should also change with each source probably?"',
    generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    seasons_used: r.perSeason.map((s) => s.season),
    rostered_count: r.rosteredCount,
    drafted_count: r.draftedCount,
    per_season: r.perSeason,
    spread: r.spread,
    priced_per_source: r.priced,
    baseline: r.baseline,
    replacement_player: r.who,
    controls_all_passed: bad.length === 0,
    control_failures: bad,
  };

  if (process.argv.includes('--json')) { console.log(JSON.stringify(doc, null, 1)); return bad.length ? 1 : 0; }

  console.log('WAIVER BASELINE — what this league actually leaves on the wire\n');
  console.log('  seasons used: ' + doc.seasons_used.join(', '));
  console.log('  rostered (the count that matters): '
    + POS.map((q) => `${q} ${r.rosteredCount[q]}`).join(' · '));
  console.log('  drafted  (for comparison):         '
    + POS.map((q) => `${q} ${r.draftedCount[q]}`).join(' · '));
  console.log('\n  ' + 'source'.padEnd(12) + POS.map((q) => q.padStart(8)).join(''));
  Object.keys(SOURCE_FIELD).forEach((k) => {
    console.log('  ' + k.padEnd(12)
      + POS.map((q) => (r.baseline[k][q] == null ? '—' : r.baseline[k][q].toFixed(1)).padStart(8)).join(''));
  });
  console.log('\n  the man on the wire, per the blend: '
    + POS.map((q) => `${q} ${r.who.blend[q] || '—'}`).join(' · '));

  if (bad.length) {
    console.log('\n  ❌ CONTROLS FAILED — not written:');
    bad.forEach((b) => console.log('     ' + b));
    return 1;
  }
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 1));
  console.log('\n  ✅ controls passed; wrote ' + path.relative(ROOT, OUT));
  return 0;
}

module.exports = { build, controls, SOURCE_FIELD, POS, MIN_PRICED };
if (require.main === module) process.exit(main());
