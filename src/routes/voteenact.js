// ─────────────────────────────────────────────────────────────────────────────
// VOTE → CONFIG — the missing link.
//
// Everything money reads (pot, weekly-high, payout table, finances, money-board
// column, the DERIVED amendment ledger) already flows from the per-season config.
// The one gap: a passed vote never wrote its result there — it sat as tallies on
// a page, so raising the buy-in meant a human editing the season form, and the
// failure mode was "January and the pot still says 4,000 because nobody moved it."
//
// This applies a passed vote's structured EFFECT to the target season's config.
// Once the config changes, every downstream number follows with no further step.
// Pure so it's testable and callable both from the commissioner's "enact" button
// and headless from the Annual's rollover.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// A vote's effect is one of:
//   { type:'buy_in',        value:500 }                      // → buy_in (+ pot rederives)
//   { type:'weekly_payout', value:120 }
//   { type:'payouts',       reg:[...], playoff:[...] }       // full structure (any length)
//   { type:'config',        key:'keeper_count', value:2 }    // a league-config key
// `season` (a year) is optional; defaults to the target year the caller passes.

/** Clone the most recent season's shape as the skeleton for a new season. */
function skeletonFrom(seasons, year) {
  const prior = Object.values(seasons)
    .filter(s => s.year < year).sort((a, b) => b.year - a.year)[0];
  return prior
    ? { ...prior, year, status: 'upcoming', standings: [], draft_open: false, keepers_locked: false }
    : { year, status: 'upcoming', buy_in: 0, total_pot: 0, weeks: 0, weekly_payout: 0,
        payouts: { reg: [], playoff: [] }, standings: [], draft_open: false, keepers_locked: false };
}

/**
 * Apply a vote effect to the seasons config. Returns { seasons, changed } — a NEW
 * seasons object (does not mutate the input) and a human line describing the
 * change (for the audit / amendment note). Throws on an unknown effect type so a
 * bad effect fails LOUDLY rather than silently no-op'ing.
 * @param targetYear the season the change applies to (buy-in changes → the upcoming season)
 * @param activeCount active owners, to rederive total_pot from buy_in when pot isn't pinned
 */
function applyVoteEffect(seasons, effect, targetYear, activeCount) {
  if (!effect || !effect.type) throw new Error('vote effect missing a type');
  const year = Number(effect.season || targetYear);
  if (!Number.isFinite(year)) throw new Error('vote effect has no target season');
  const next = { ...seasons };
  const s = { ...(next[year] || skeletonFrom(seasons, year)) };
  let changed;

  switch (effect.type) {
    case 'buy_in': {
      const v = Number(effect.value);
      if (!Number.isFinite(v)) throw new Error('buy_in effect needs a numeric value');
      const old = s.buy_in;
      s.buy_in = v;
      // Pot rederives from buy-in × active owners (same rule the admin form uses),
      // so the weekly-high share and every payout amount follow automatically.
      s.total_pot = v * (Number(activeCount) || 0);
      changed = `Buy-in ${old != null ? '$' + old + ' → ' : 'set to '}$${v} for ${year} (pot → $${s.total_pot}).`;
      break;
    }
    case 'weekly_payout': {
      const v = Number(effect.value);
      if (!Number.isFinite(v)) throw new Error('weekly_payout effect needs a numeric value');
      const old = s.weekly_payout; s.weekly_payout = v;
      changed = `Weekly-high payout ${old != null ? '$' + old + ' → ' : 'set to '}$${v} for ${year}.`;
      break;
    }
    case 'payouts': {
      if (!Array.isArray(effect.reg) || !Array.isArray(effect.playoff)) throw new Error('payouts effect needs reg[] and playoff[]');
      s.payouts = { reg: effect.reg.map(Number), playoff: effect.playoff.map(Number) };
      changed = `Payout structure updated for ${year} (${s.payouts.reg.length} regular + ${s.payouts.playoff.length} playoff places).`;
      break;
    }
    case 'config': {
      if (!effect.key) throw new Error('config effect needs a key');
      s[effect.key] = effect.value;
      changed = `${effect.key} → ${JSON.stringify(effect.value)} for ${year}.`;
      break;
    }
    default:
      throw new Error(`unknown vote effect type: ${effect.type}`);
  }
  next[year] = s;
  return { seasons: next, changed };
}

/** The season a change applies to by default: the first upcoming/future season, else active+1. */
function defaultTargetYear(seasons) {
  const vals = Object.values(seasons);
  const upcoming = vals.filter(s => s.status === 'upcoming').sort((a, b) => a.year - b.year)[0];
  if (upcoming) return upcoming.year;
  const active = vals.find(s => s.status === 'active');
  if (active) return active.year + 1;
  const latest = vals.sort((a, b) => b.year - a.year)[0];
  return latest ? latest.year + 1 : new Date().getUTCFullYear();
}

module.exports = { applyVoteEffect, defaultTargetYear, skeletonFrom };
