// TERRITORY: A
/* ROSTER-CONSTRUCTION ARCHETYPES — a policy OVERLAY on the engine's own
 * candidate list, never a reimplementation of the draft room.
 *
 * Cory, 2026-08-16, verbatim: "If edge for this year isn't going to come from
 * using own projections this year. It's going to come from our roster
 * building. Have we ran enough test on roster building in draft to make sure
 * we have best methods possible?"
 *
 * The pick-value engine is deeply tested pick-by-pick; what has never been
 * measured is whether a roster-construction CONSTRAINT laid over it (zero-RB,
 * robust-RB, early/late QB, TE-early, pure BPA, pure market) produces better
 * SEASON outcomes from Cory's actual seat. Each archetype here is a
 * constraint/preference function applied to E.recommend()'s own ranked list:
 *
 *   - the engine still scores every pick; the archetype only chooses WHICH of
 *     the engine's top candidates to take;
 *   - a FORCED pick (legality rails: applyRosterLegality restricted the list
 *     to positions that keep the lineup legal) is NEVER overridden;
 *   - a legality WARNING ("next pick you will be forced") defers to the
 *     engine's own top pick, so no overlay can walk a roster into a corner
 *     the rails were about to prevent;
 *   - K/DEF are never chosen BY an overlay preference and never banned by
 *     one — their timing belongs to the engine's measured rails
 *     (roster_room_audit: +2.04 pts vs latest-legal, 0 illegal rooms in 200);
 *   - a constraint that cannot be satisfied inside the engine's top
 *     candidates DEFERS to the engine (recs[0]) rather than reaching deep
 *     into the tail — the overlay expresses a preference over players the
 *     engine already endorses, which is the "express its domain and defer
 *     outside it" rule applied to construction shapes.
 *
 * PREREGISTERED PARAMETERS — fixed a priori from standard construction
 * doctrine adapted to Cory's REAL seat (keepers Chase WR / Henry RB /
 * Walker RB occupy rounds 1-3; live picks are rounds 4-15). NO parameter was
 * tuned against any simulation output, on any seed pool, before or after
 * ranking (stated here so the no-tuning claim is checkable against git
 * history: this file's first commit carries the same numbers the audit
 * ranks). Seeds 9000+ are reserved for mechanics smoke tests and are
 * excluded from any ranking.
 *
 * Pure module: no I/O, no engine import, no globals. The driver
 * (archetype_rooms.js) supplies the engine's recs and the roster state.
 */
'use strict';

/* Only the engine's top candidates are eligible for an overlay choice — the
 * overlay picks among engine-endorsed players, it does not rescue the tail. */
const TOP_N = 25;

const ONESIE = { K: true, DEF: true };

function posCount(state, pos) {
  return (state.posCounts && state.posCounts[pos]) || 0;
}

/** Engine-endorsed candidate slice: scored, real player, respect TOP_N. */
function candidates(recs) {
  return recs.slice(0, TOP_N).filter(r => r && r.player && r.score != null);
}

/* An overlay may not act when the engine's legality machinery is speaking:
 * forced lists are already position-restricted, and a warning means the very
 * next pick will be. Returns the entry the overlay MUST take, or null. */
function legalityOwns(recs) {
  if (!recs || !recs.length) return null;
  if (recs[0].forced) return recs[0];
  if (recs[0].legality_warning != null) return recs[0];
  return null;
}

/** Highest-engine-ranked candidate whose position is in `wanted` (skill
 *  positions only — K/DEF are never sought by an overlay). Null if none. */
function seek(recs, wanted) {
  const cand = candidates(recs);
  for (const r of cand) {
    const pos = r.player.position;
    if (ONESIE[pos]) continue;
    if (wanted[pos]) return r;
  }
  return null;
}

/** Highest-engine-ranked candidate whose position is NOT banned. K/DEF are
 *  exempt from bans (their timing is the engine's). Null if the ban empties
 *  the candidate slice (caller then defers to recs[0]). */
function ban(recs, banned) {
  const cand = candidates(recs);
  for (const r of cand) {
    const pos = r.player.position;
    if (ONESIE[pos]) return r; // engine put a onesie on top un-forced: its call
    if (!banned[pos]) return r;
  }
  return null;
}

/** Best candidate by an external key (skill positions only). `dir` is +1 for
 *  max, -1 for min. Null when no skill candidate exists. */
function rerank(recs, key, dir) {
  const cand = candidates(recs).filter(r => !ONESIE[r.player.position]);
  if (!cand.length) return null;
  let best = null, bestV = null;
  for (const r of cand) {
    const v = key(r.player);
    if (v == null) continue;
    if (best === null || dir * (v - bestV) > 0) { best = r; bestV = v; }
  }
  return best;
}

const adpOf = p => (p.adjusted_adp != null ? Number(p.adjusted_adp)
  : (p.raw_adp != null ? Number(p.raw_adp) : 9999));

/* ── THE ARCHETYPES ──────────────────────────────────────────────────────────
 * Each: choose(recs, state) -> the chosen rec (never null for non-empty recs).
 * state: { round, picksLeft, posCounts } — posCounts INCLUDES keepers, so
 * "RB" starts at 2 (Henry, Walker) and "WR" at 1 (Chase) from Cory's seat. */
const ARCHETYPES = {
  /* The control: the engine's live recommendation policy, exactly what the
   * war room tells Cory at each pick. */
  shipped: {
    doc: 'engine recs[0] every pick — the live composite policy (control arm)',
    choose(recs) { return recs[0]; },
  },

  /* Zero-RB adapted to the seat: the keepers already hold RB1/RB2, so the
   * archetype is "no MORE RB until round 10" — load WR/TE/QB through the
   * mid rounds, backfill RB depth late. */
  zero_rb: {
    doc: 'no RB before round 10 (keepers already start 2 RBs); WR/TE/QB load',
    choose(recs, state) {
      const owned = legalityOwns(recs); if (owned) return owned;
      if (state.round >= 10) return recs[0];
      return ban(recs, { RB: true }) || recs[0];
    },
  },

  /* Robust-RB: take RB volume whenever the engine endorses an RB, until 5
   * total RBs or round 10, whichever first. */
  robust_rb: {
    doc: 'seek RB while total RBs < 5 and round <= 10 (RB-volume construction)',
    choose(recs, state) {
      const owned = legalityOwns(recs); if (owned) return owned;
      if (state.round > 10 || posCount(state, 'RB') >= 5) return recs[0];
      return seek(recs, { RB: true }) || recs[0];
    },
  },

  /* Early QB: this league scores pass TDs at 6 — take the QB room's premium
   * early (rounds 4-6 are Cory's first three live picks). */
  early_qb: {
    doc: 'seek QB in rounds 4-6 until QB1 rostered (6-pt-pass-TD premium)',
    choose(recs, state) {
      const owned = legalityOwns(recs); if (owned) return owned;
      if (state.round > 6 || posCount(state, 'QB') >= 1) return recs[0];
      return seek(recs, { QB: true }) || recs[0];
    },
  },

  /* Late-round QB: the classic construction — no QB before round 11. */
  late_qb: {
    doc: 'no QB before round 11 (late-round-QB construction)',
    choose(recs, state) {
      const owned = legalityOwns(recs); if (owned) return owned;
      if (state.round >= 11) return recs[0];
      return ban(recs, { QB: true }) || recs[0];
    },
  },

  /* TE-early: secure a TE1 inside rounds 4-7 rather than waiting. */
  te_early: {
    doc: 'seek TE in rounds 4-7 until TE1 rostered',
    choose(recs, state) {
      const owned = legalityOwns(recs); if (owned) return owned;
      if (state.round > 7 || posCount(state, 'TE') >= 1) return recs[0];
      return seek(recs, { TE: true }) || recs[0];
    },
  },

  /* The war room's OTHER half: the pre-draft seat plan (draft_plan.js DP,
   * shipped as public/seat_plan.json). The engine's greedy #1 plus this
   * positional schedule is the full shipped surface Cory actually sees, so
   * "follow the plan's seat" is its own arm: seek the plan's scheduled
   * position for this pick among the engine's candidates; defer to the
   * engine wherever the plan is silent (bench seats) or the position is gone
   * from the candidate slice. The driver supplies state.planSlot from the
   * committed artifact. */
  seat_plan: {
    doc: 'seek the seat plan\'s scheduled position (public/seat_plan.json) among engine candidates; engine order elsewhere',
    choose(recs, state) {
      const owned = legalityOwns(recs); if (owned) return owned;
      const slot = state.planSlot;
      if (!slot || slot === 'BENCH') return recs[0];
      // FLEX is a seat, not a position: any flex-eligible skill player fills
      // it, so the plan's constraint is "best engine candidate among RB/WR/TE".
      const wanted = {};
      if (slot === 'FLEX') { wanted.RB = wanted.WR = wanted.TE = true; }
      else wanted[slot] = true;
      // The plan may schedule K/DEF earlier than the engine's rails would —
      // that timing is the plan's own shipped claim, so an explicitly
      // scheduled onesie IS sought here (the one archetype allowed to)…
      if (ONESIE[slot]) {
        const cand = candidates(recs);
        for (const r of cand) if (r.player.position === slot) return r;
        return recs[0];   // …but only inside the engine's candidate slice.
      }
      return seek(recs, wanted) || recs[0];
    },
  },

  /* Pure best-player-available by raw VORP — the composite's adjusters
   * (VONA, survival, KOV, stack…) stripped back to the value column. */
  bpa_vorp: {
    doc: 'highest raw vorp among engine top candidates (pure BPA, no adjusters)',
    choose(recs) {
      const owned = legalityOwns(recs); if (owned) return owned;
      return rerank(recs, p => (p.vorp == null ? null : Number(p.vorp)), +1)
        || recs[0];
    },
  },

  /* Pure market: take the room's own next guy (lowest ADP) — what a
   * follow-the-market drafter at seat 8 would do. */
  market_adp: {
    doc: 'lowest ADP among engine top candidates (follow-the-market arm)',
    choose(recs) {
      const owned = legalityOwns(recs); if (owned) return owned;
      return rerank(recs, adpOf, -1) || recs[0];
    },
  },
};

/** Apply an archetype to the engine's ranked list. Throws on an unknown name
 *  (a silent default here would rank the control under another arm's label). */
function choosePick(name, recs, state) {
  const arch = ARCHETYPES[name];
  if (!arch) throw new Error('unknown archetype: ' + name);
  if (!recs || !recs.length) return null;
  const pick = arch.choose(recs, state || {});
  return pick || recs[0];
}

module.exports = { ARCHETYPES, choosePick, TOP_N, candidates, legalityOwns,
  seek, ban, rerank, adpOf };
