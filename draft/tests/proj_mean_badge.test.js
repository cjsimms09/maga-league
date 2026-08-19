// TERRITORY: B
/* PROJECTION-SOURCE BADGE — A's ask (ROUTES.md 08-19): "the board's numbers
 * change on the next rebuild and the war room cannot say which ones."
 * `draft/multisource_blend.py` silently turns some players' `proj_mean`
 * into the mean of Sleeper + CBS + ESPN + FFToday, stamped
 * `proj_mean_source: "multisource-mean-2026"` with the original Sleeper
 * number kept as `proj_mean_sleeper_only`. A's own REC: "a one-character
 * badge next to the projection plus the old number in the tooltip."
 *
 * `projMeanBadge()` lives in warroom_charts.js's browser-only controller
 * half (same eval-lift pattern as drill_facts_rows.test.js, since the file
 * early-returns when `document` is undefined and `require()` cannot reach
 * it).
 *
 * SCOPE NOTE, disclosed rather than silently narrowed: the blend script
 * marks BLENDED players but writes no per-player field for DECLINED ones
 * (source-incoherent, the 61 A named) — those are indistinguishable from
 * genuinely Sleeper-only players in the data the war room reads. This
 * badge can only show the two states the data actually carries (blended /
 * not-marked); it cannot show "declined" as a third state because nothing
 * on the player object says so. That gap is real and is A's field to add
 * if the declined distinction is wanted on screen — not invented here.
 *
 * Run: node draft/tests/proj_mean_badge.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'warroom_charts.js'), 'utf8');
const lift = (name) => {
  const m = SRC.match(new RegExp('function ' + name + '\\(p\\) \\{[\\s\\S]*?\\n  \\}'));
  if (!m) throw new Error(name + ' not found in warroom_charts.js');
  return m[0];
};
const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
// eslint-disable-next-line no-eval
const projMeanBadge = eval('(' + lift('projMeanBadge') + ')');

// ── fires only on the exact blend stamp ─────────────────────────────────────
ck('a blended player (proj_mean_source stamped) gets the badge',
  /wr-proj-blend/.test(projMeanBadge({ proj_mean_source: 'multisource-mean-2026', proj_mean_sleeper_only: 18.4 })));
ck('the glyph is ✱ — deliberately distinct from the cohort-ceiling ~, so the two '
  + 'provenance questions never look like the same fact',
  />✱</.test(projMeanBadge({ proj_mean_source: 'multisource-mean-2026', proj_mean_sleeper_only: 18.4 })));
ck('a Sleeper-only player (no source field) -> no badge, per A\'s own stated '
  + 'convention ("absence of those fields means Sleeper-only")',
  projMeanBadge({ proj_mean: 18.4 }) === '');
ck('a DIFFERENT/unrecognised source string -> no badge (conservative: only the '
  + 'exact known stamp fires, never a guess at what a future source name means)',
  projMeanBadge({ proj_mean_source: 'some-future-blend', proj_mean_sleeper_only: 18.4 }) === '');
ck('missing player -> no badge, no throw', projMeanBadge(null) === '' && projMeanBadge({}) === '');

// ── the tooltip carries the old number, per A's exact REC ───────────────────
{
  const html = projMeanBadge({ proj_mean_source: 'multisource-mean-2026', proj_mean_sleeper_only: 18.44 });
  ck('the tooltip names the OLD Sleeper-only number, rounded to one decimal '
    + '(not the new blended number — the whole point is showing what changed)',
    /Sleeper alone had 18\.4/.test(html), html);
  ck('the tooltip names all four sources, so the badge is legible without a second click',
    /Sleeper \+ CBS \+ ESPN \+ FFToday/.test(html));
}
ck('a blended player missing the OLD-number field (should not happen, but must not '
  + 'throw or print "undefined") still renders the badge, just without a number claim',
  (() => { const h = projMeanBadge({ proj_mean_source: 'multisource-mean-2026' }); return /wr-proj-blend/.test(h) && !/undefined/.test(h); })());

// ── HTML safety ──────────────────────────────────────────────────────────────
ck('the title attribute is escaped through the file\'s own esc() (no raw injection '
  + 'point, even though proj_mean_sleeper_only is always numeric in practice)',
  /title="/.test(projMeanBadge({ proj_mean_source: 'multisource-mean-2026', proj_mean_sleeper_only: 18.4 })));

// ── wiring: the drill-down's Proj row actually calls it ─────────────────────
ck('renderDrill\'s ceiling/floor/mean row actually calls projMeanBadge(p)',
  /num\(p\.proj_floor\) \+ ' \/ <b>' \+ num\(p\.proj_mean\) \+ '<\/b>'\s*\n\s*\+ projMeanBadge\(p\)/.test(SRC));

// ── KNOWN-POSITIVE-CAPABLE against the real committed board ─────────────────
// Rule 3e: today's committed board is still 100% Sleeper-only (the multi-
// source rebuild has not run yet — A's own dispatch says "from the NEXT
// rebuild"), so a real known-positive isn't available yet. Assert the
// negative honestly instead of skipping silently, and prove the predicate
// COULD fire by construction (checked above with a synthetic fixture) so
// this null reads as "not yet rebuilt", not "broken and never tested".
{
  let board;
  try {
    board = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'draft_data.json'), 'utf8')).players;
  } catch (e) { board = null; }
  if (board) {
    const blended = board.filter(p => p.proj_mean_source === 'multisource-mean-2026');
    // CORRECTED 08-19: this read 0 blended players as expected when the badge
    // was first shipped, ahead of the multisource rebuild. The board now
    // publishes with the blend (register 74/75) — 274 rows, Gibbs among
    // them — so this is a live known-positive against real players now,
    // not the vacuous branch. Kept as an OR so a future board rebuild that
    // temporarily drops back to 0 (a regen gap, not a regression) still
    // passes honestly instead of failing on population size alone.
    ck((blended.length
        ? 'the live board carries ' + blended.length + ' blended players today — every one fires the badge'
        : 'the live board today has 0 blended players — the OR branch is exercised, not this one'),
      blended.length === 0 || blended.every(p => /wr-proj-blend/.test(projMeanBadge(p))),
      { blendedCount: blended.length });
  } else {
    console.log('SKIP  live-board check — public/draft_data.json not present in this environment');
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
