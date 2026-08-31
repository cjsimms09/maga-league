// TERRITORY: A
/* IS THIS WEEK'S DECISION MOMENT ACTUALLY NEAR? — register 438.
 *
 * ── WHAT WENT WRONG, MEASURED FROM PRODUCTION ─────────────────────────────
 *
 * The reco crons gate on Sleeper's `state`: if it names a season and a week
 * and `season_type === 'regular'`, they capture. Sleeper flips to
 * `regular` / week 1 as soon as the preseason ends — which in 2026 was
 * ELEVEN DAYS before week 1's first game.
 *
 * Read off the live probe's own logs, not inferred:
 *   2026-08-26 02:26Z  {"ok":true,"skipped":"preseason"}
 *   2026-08-30 17:42Z  {"ok":true,"week":1,"captured":1,
 *                       "key":"lineup_auto|2026|w1|1"}
 *
 * Week 1's first game is 2026-09-10T00:20Z. So the season's week-1 LINEUP
 * recommendation was computed and recorded on **August 30th**, before a
 * single week-1 injury report, inactive list or start/sit question existed.
 *
 * And the capture is marker-idempotent — ONE per week, ever. So on 09-13,
 * the real Sunday, the cron would answer `already captured` and the weekly
 * probe would print the most reassuring line in its whole vocabulary:
 * "OK (verified): the SCHEDULED run already fired and wrote this week's
 * marker — the probe found the row it came for." A green run over a row
 * taken a fortnight early. That is Cory's "a green run and an empty store
 * look identical" with the store not even empty, which is worse.
 *
 * ── THE PREDICATE ─────────────────────────────────────────────────────────
 *
 * A week's capture window opens LEAD_DAYS before that week's first kickoff
 * and closes a day after its last game, both read from the captured schedule
 * rather than hardcoded. Outside it, the crons skip with a named reason.
 *
 * WHY 4 DAYS, and it was measured rather than chosen: for every week 1-17 the
 * waiver cron's real firing (Wednesday 00:10 UTC) and the lineup cron's real
 * firing (Sunday 12:50 UTC) must both fall INSIDE the window, or the fix
 * would silently stop the captures it exists to protect. Checked against all
 * eighteen weeks of `draft/data/nfl_schedule_2026.json`: at 4 days every
 * week 1-17 passes both, and both dates that motivated this — the 08-30
 * capture that already happened and the 09-02 waiver probe that would have
 * burned the next marker — fall outside.
 *
 * ⚠️ KNOWN LIMIT, STATED NOT HIDDEN: week 18's row in that schedule is
 * degenerate — `first === last === 2027-01-10T05:00Z`, one timestamp for
 * sixteen games — so its Wednesday firing lands outside the window. Left
 * alone deliberately: this league's fantasy season ends at week 17 (the
 * playoff weeks are 15-17), so there is no week-18 decision to capture, and
 * widening the window to satisfy a bad schedule row would be tuning the
 * predicate to the data's defect.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const LEAD_DAYS = 4;
const TRAIL_DAYS = 1;
const SCHEDULE = path.join(__dirname, '..', 'draft', 'data', 'nfl_schedule_2026.json');

/* Returns { opens, closes } as ms epoch, or null when the schedule cannot
 * answer for this week.
 *
 * ⚠️ NULL MEANS "CANNOT SAY", AND EVERY CALLER MUST TREAT IT AS SUCH rather
 * than as "no, it is not live" — a missing schedule must never become a
 * silent season-long refusal to capture. `weekIsLive` below returns `null`
 * in that case and the crons capture, exactly as they did before this file
 * existed, so the worst a broken schedule can do is restore the old
 * behaviour instead of inventing a new failure. (Rule 3e: "could not check"
 * and "checked and it is not live" must never look the same.)
 */
function windowFor(season, week, schedulePath = SCHEDULE) {
  let doc;
  try { doc = JSON.parse(fs.readFileSync(schedulePath, 'utf8')); } catch (e) { return null; }
  if (Number(doc.season) !== Number(season)) return null;
  const wk = (doc.weeks || {})[String(week)];
  if (!wk || !wk.first || !wk.last) return null;
  const first = Date.parse(wk.first), last = Date.parse(wk.last);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  return { opens: first - LEAD_DAYS * 86400000, closes: last + TRAIL_DAYS * 86400000 };
}

/* true / false / null (cannot say). `now` is injectable so both arms are
 * testable today rather than only in December. */
function weekIsLive(season, week, now = Date.now(), schedulePath = SCHEDULE) {
  const w = windowFor(season, week, schedulePath);
  if (!w) return null;
  const t = typeof now === 'number' ? now : Date.parse(now);
  return t >= w.opens && t <= w.closes;
}

/* Was a marker written BEFORE its own week's window opened? Then it is not a
 * record of that week's decision and must not suppress the real capture.
 *
 * This is the self-heal for the marker already burned on 2026-08-30: without
 * it the fix would prevent the NEXT premature capture while leaving week 1's
 * lineup row permanently wrong, and nothing in the store can be edited from
 * a pull request. A marker with no `at` is treated as VALID — old markers
 * predate this field and refusing them would re-capture history. */
function markerIsPremature(marker, season, week, schedulePath = SCHEDULE) {
  if (!marker || !marker.at) return false;
  const w = windowFor(season, week, schedulePath);
  if (!w) return false;
  const at = Date.parse(marker.at);
  return Number.isFinite(at) && at < w.opens;
}

const SKIP_REASON = 'week not live yet';

module.exports = { LEAD_DAYS, TRAIL_DAYS, SCHEDULE, windowFor, weekIsLive,
                   markerIsPremature, SKIP_REASON };
