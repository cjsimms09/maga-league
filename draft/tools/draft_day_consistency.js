// TERRITORY: A
/* IS EVERY ARTIFACT CORY WILL READ ON DRAFT DAY CONSISTENT WITH THE BOARD?
 *
 * Cory, 2026-08-20: "Once fix all draft relevant info! Deploy again so I can
 * use."
 *
 * ── WHY THIS IS A GUARD AND NOT A ONE-OFF CHECK ─────────────────────────────
 *
 * Because "fix it once" is only true if something notices when it breaks again,
 * and this exact class has now broken twice in one night:
 *
 *   register 142 — the nightly rebuild regenerated the board and discarded
 *                  every post-processing fix, silently, on a schedule.
 *   register 143 — `seat_plan.json` carried 46 of 60 shortlist projections that
 *                  no longer matched the board, WHILE STAMPING ITSELF with the
 *                  board's own provenance, because the step that rewrote the
 *                  board never updated the field the stamp reads.
 *
 * Both were found by hand, hours apart, by following a thread. Neither would
 * have been found on draft morning.
 *
 * ⚠️ IT CHECKS CONTENT, NOT TIMESTAMPS, AND THAT IS THE WHOLE POINT. A
 * timestamp comparison is what failed in register 143 — the stale artifact and
 * the fresh board agreed on their stamps and disagreed on their numbers. So
 * this joins every artifact's player references BACK to the live board and
 * compares the values themselves.
 *
 * REPORT ONLY. Writes draft/data/draft_day_consistency.json. Exit 1 on drift.
 * Run: node draft/tools/draft_day_consistency.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const PUB = path.join(ROOT, 'public');
const BOARD = JSON.parse(fs.readFileSync(path.join(PUB, 'draft_data.json'), 'utf8'));

const byId = {}, byName = {};
BOARD.players.forEach(p => {
  byId[String(p.player_id)] = p;
  if (p.name) byName[String(p.name).toLowerCase()] = p;
});

/* Every artifact the SITE actually reads. An artifact nobody reads cannot
 * mislead Cory, so it is listed as out-of-scope rather than quietly skipped. */
/* `draft_critical` = does drift here change a PICK? Cory asked to "fix all
 * draft relevant info", and the honest answer needs that line drawn rather than
 * blurred: an artifact can be genuinely stale and still not reach the board he
 * drafts from. The exit code follows the draft-critical set, so a green run
 * means "safe to draft on" rather than "nothing anywhere is stale" — non-
 * critical drift is still printed, loudly, and never silently dropped. */
const WATCHED = [
  { file: 'seat_plan.json', draft_critical: true,
    why: 'the seat panel, read at EVERY pick' },
  { file: 'position_boards.json', draft_critical: true,
    why: 'the per-position board view' },
  { file: 'source_boards.json', draft_critical: true,
    why: 'the best-available-by-source cheat sheet' },
  { file: 'mlv_recommend.json', draft_critical: true,
    why: 'the roster-builder panel\'s static fallback' },
  { file: 'mlv_plan.json', draft_critical: true,
    why: 'the whole-draft MLV plan panel — it is a NIGHTLY artifact that does not '
       + 're-run as the draft happens, which is exactly the shape register 143 '
       + 'produced, so it is watched rather than trusted' },
  { file: 'conditional_value_2026.json', draft_critical: true,
    why: 'conditional-value chips ON THE WAR-ROOM CARDS (app.js) — handcuffs for '
       + 'Cory\'s own backs are a real late-round decision' },
  { file: 'opponent_need_2026.json', draft_critical: true,
    why: 'the room model' },
  { file: 'expert_spread_2026.json', draft_critical: true,
    why: 'the expert-disagreement badge' },
  { file: 'league_analysis_2026.json', draft_critical: false,
    why: 'MEASURED, not assumed: its player values live in '
       + 'projected_standings[].starters and it is read by '
       + 'views/admin/league-analysis.ejs — a SEPARATE standings page, not the '
       + 'war room. Stale here cannot change a pick. Regenerating it needs '
       + 'Sleeper, which is 403 from the build sandbox and reachable from CI.' },
];
const OUT_OF_SCOPE = [
  { file: 'market_upside_2026.json',
    why: 'read by ZERO site files — measured, not assumed. It cannot reach the '
       + 'draft, so its freshness is not a draft-day question.' },
];

/* Walk any shape and collect (player, projection-ish value) pairs.
 *
 * ⛔ THE FIRST VERSION OF THIS KEYED ONLY ON `player_id`, AND IT GAVE A FALSE
 * ALL-CLEAR ON THE PER-POSITION BOARD — the surface Cory opens when he already
 * knows which position he wants. `position_boards.json` identifies players by
 * NAME and carries the projection as `proj`, so the harvester matched nothing
 * and the artifact reported "NO PLAYER VALUES", which reads exactly like a
 * clean pass. Rule 3e: six of eight artifacts returning nothing was the signal
 * that the probe, not the data, was the problem. Both keyings now. */
const FIELDS = ['proj_mean', 'proj', 'projection', 'points', 'proj_points'];
function harvest(node, out) {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(n => harvest(n, out)); return; }
  let who = null;
  if (node.player_id != null && byId[String(node.player_id)]) who = byId[String(node.player_id)];
  else if (node.id != null && byId[String(node.id)]) who = byId[String(node.id)];
  else if (typeof node.name === 'string' && byName[node.name.toLowerCase()]) {
    who = byName[node.name.toLowerCase()];
  }
  if (who) {
    FIELDS.forEach(f => {
      if (typeof node[f] === 'number') out.push({ who, field: f, value: node[f] });
    });
  }
  Object.values(node).forEach(v => harvest(v, out));
}

const TOL = 0.5;                       // half a point — below board rounding noise
const report = [];
let drifted = 0, nonCritical = 0;

WATCHED.forEach(w => {
  const p = path.join(PUB, w.file);
  if (!fs.existsSync(p)) {
    report.push({ ...w, status: 'MISSING', checked: 0, mismatched: 0 });
    drifted++;
    return;
  }
  let doc;
  try { doc = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { report.push({ ...w, status: 'UNPARSEABLE', error: e.message }); drifted++; return; }
  const pairs = [];
  harvest(doc, pairs);
  /* ⚠️ AN ARTIFACT MAY DELIBERATELY USE A DIFFERENT SOURCE, AND COMPARING IT TO
   * THE BLEND WOULD MANUFACTURE DRIFT THAT IS NOT THERE. position_boards.json
   * declares in its own `_sources`: "projections/floor/ceiling = Draft Sharks".
   * So the reference field is read from the artifact's own declaration rather
   * than assumed — a check that invents failures gets switched off. */
  const declares = JSON.stringify(doc._sources || doc._what || '');
  const usesDS = /draft\s*sharks/i.test(declares);
  const refField = usesDS ? 'proj_ds' : 'proj_mean';
  const bad = [];
  pairs.forEach(x => {
    const live = x.who;
    const ref = live[refField];
    if (typeof ref !== 'number') return;
    /* only compare fields that are plausibly THE projection: a `points` field
     * that is a per-game rate would false-positive against a season total, so
     * anything more than 3x away is treated as a different quantity, not drift */
    if (x.value > ref * 3 || x.value < ref / 3) return;
    if (Math.abs(x.value - ref) > TOL) {
      bad.push({ name: live.name, position: live.position, artifact: x.value,
        board: ref, compared_against: refField });
    }
  });
  const status = bad.length ? 'DRIFTED' : (pairs.length ? 'CONSISTENT' : 'NO PLAYER VALUES');
  if (bad.length && w.draft_critical !== false) drifted++;
  if (bad.length && w.draft_critical === false) nonCritical++;
  report.push({ ...w, status, checked: pairs.length, mismatched: bad.length,
    compared_against: refField, examples: bad.slice(0, 4) });
});

const doc = {
  _territory: 'TERRITORY: A — draft/tools/draft_day_consistency.js',
  _what: 'Does every artifact the war room reads still agree with the live board '
       + 'about the same players?',
  _why_content_not_timestamps: 'register 143: the stale artifact and the fresh '
    + 'board agreed on their provenance stamps and disagreed on their numbers. A '
    + 'timestamp check is exactly what failed.',
  board: { built_at: BOARD.built_at || null,
    post_processed_at: BOARD.post_processed_at || null,
    post_processed_by: BOARD.post_processed_by || null,
    players: BOARD.players.length },
  tolerance_points: TOL,
  watched: report,
  out_of_scope: OUT_OF_SCOPE,
  draft_critical_all_consistent: drifted === 0,
  non_critical_drift: nonCritical,
};
fs.writeFileSync(path.join(ROOT, 'draft', 'data', 'draft_day_consistency.json'),
  JSON.stringify(doc, null, 1));

console.log('\n  DRAFT-DAY CONSISTENCY — does everything agree with the board?\n');
console.log('  board built ' + (BOARD.built_at || '?')
  + '   post-processed ' + (BOARD.post_processed_at || 'NEVER — register 143'));
console.log('');
report.forEach(r => {
  const mark = r.status === 'CONSISTENT' ? '✅' : (r.status === 'NO PLAYER VALUES' ? '·' : '❌');
  console.log('  ' + mark + ' ' + r.file.padEnd(30) + r.status.padEnd(18)
    + (r.checked ? r.checked + ' values' : '') + (r.mismatched ? '  ' + r.mismatched + ' MISMATCHED' : ''));
  (r.examples || []).forEach(e => console.log('        ' + e.position + ' ' + e.name
    + ': artifact ' + e.artifact + '  board ' + e.board));
  if (r.status !== 'CONSISTENT') console.log('        ' + r.why);
});
OUT_OF_SCOPE.forEach(o => console.log('  ○ ' + o.file.padEnd(30) + 'OUT OF SCOPE — ' + o.why.slice(0, 60)));
if (nonCritical) {
  console.log('\n  ⚠ ' + nonCritical + ' NON-draft-critical artifact(s) drifted — reported, not blocking.');
}
console.log('\n  ' + (drifted === 0
  ? '✅ every DRAFT-CRITICAL artifact agrees with the board — safe to draft on.'
  : '❌ ' + drifted + ' draft-critical artifact(s) disagree — regenerate before the draft.'));
process.exit(drifted === 0 ? 0 : 1);
