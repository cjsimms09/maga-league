'use strict';
/*
 * PLAYOFF-ODDS / RISK-POSTURE WIDGET — pure model builder over A's
 * season_forward_inseason feed (public/season_forward_live.json, per_seat
 * keyed by Sleeper roster_id: {p_playoffs, E_total, p5, p95}). The feed is
 * fetched/read by the route; this only shapes it into what the view
 * renders, so a fixture can drive the whole logic without a real file —
 * same "no fs, no network" split as dashboard.js's announcement builders.
 *
 * A dispatch, 2026-08-19: P103 graded TRUE — the forward simulator beats
 * the constant-odds baseline on all three hindcast seasons. The feed itself
 * does not exist until week 1 has a realized result (write_live() refuses
 * loudly pre-season, on purpose), so `feed` is null through the draft and
 * this module's job is to degrade to `available: false` rather than throw.
 */

const POSTURE = { COMFORTABLE: 'comfortable', BUBBLE: 'bubble', CHASING: 'chasing' };

/* A's ruled thresholds (ROUTES.md, A 08-19 same-hour reply to B's 08-18
 * ask: "someone has to first say which state a seat is in"): >=0.70
 * comfortable / <=0.30 chasing / bubble between. The feed itself also
 * carries `posture` per seat now, computed with these same constants —
 * this function exists so the widget still classifies correctly against
 * hindcast/fixture data that predates the feed's own field. */
function posture(pPlayoffs) {
  if (pPlayoffs == null) return null;
  if (pPlayoffs >= 0.70) return POSTURE.COMFORTABLE;
  if (pPlayoffs <= 0.30) return POSTURE.CHASING;
  return POSTURE.BUBBLE;
}

const POSTURE_COPY = {
  comfortable: 'Comfortable — floor plays. You can afford to sit a boom/bust option for a safer floor.',
  bubble: 'On the bubble — every point matters. Play for points, not for safety.',
  chasing: 'Chasing — ceiling plays. A safe floor does not change your odds; upside might.',
};

/**
 * @param {object|null} feed        parsed season_forward_live.json, or null
 *                                   if the file does not exist yet.
 * @param {string|number|null} myRosterId  the viewer's Sleeper roster_id.
 */
function playoffOddsWidget(feed, myRosterId) {
  if (!feed || !feed.per_seat || myRosterId == null) return { available: false };
  const cell = feed.per_seat[String(myRosterId)];
  if (!cell || cell.p_playoffs == null) return { available: false };
  const p = posture(cell.p_playoffs);
  return {
    available: true,
    asOfWeek: feed.as_of_week,
    pPlayoffs: cell.p_playoffs,
    pPlayoffsPct: Math.round(cell.p_playoffs * 100),
    eTotal: cell.E_total,
    p5: cell.p5,
    p95: cell.p95,
    posture: p,
    postureCopy: p ? POSTURE_COPY[p] : null,
    // Week-over-week move is not yet computable: the feed overwrites the
    // same file each week rather than appending a series (flagged B -> A,
    // ROUTES.md 2026-08-18). Stays null until the feed carries history.
    weekOverWeek: null,
  };
}

/** Find the viewer's Sleeper roster_id from world.config.sleeper_map
 * (roster_id -> owner_id) and their owner id. Null if unmapped. */
function myRosterId(sleeperMap, ownerId) {
  if (!sleeperMap || ownerId == null) return null;
  for (const [rid, oid] of Object.entries(sleeperMap)) {
    if (Number(oid) === Number(ownerId)) return rid;
  }
  return null;
}

module.exports = { playoffOddsWidget, posture, myRosterId, POSTURE, POSTURE_COPY };
