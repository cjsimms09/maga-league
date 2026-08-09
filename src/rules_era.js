// RULES-ERA STAMP — a finding measured under one payout/scoring world must carry that
// world's signature, so a stale citation cannot mislead after the rules change (Cory:
// "half our money-graded verdicts were measured in a world that no longer exists").
//
// The Lab already grades under era-correct per-season payouts and re-runs on new data, so
// a re-run stays current; this closes the residual gap where a verdict is CITED from an
// old committed report without re-running. Cheap: a stable signature over the money-
// bearing rules (payout table + the scoring keys that move dollars + roster shape).

'use strict';

// A tiny stable hash (djb2) over a canonical JSON — deterministic across runs/machines,
// no crypto dependency. Same rules in => same signature; any money-bearing change flips it.
function _hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function _canonical(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(_canonical).join(',') + ']';
  return '{' + Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + _canonical(obj[k])).join(',') + '}';
}

// The money-bearing rules for a season. Only the fields that change what a dollar-graded
// finding means: the payout table, the scoring weights, roster/starter shape, teams.
function eraSignature(rules) {
  const r = rules || {};
  const core = {
    payouts: r.payouts || null,
    scoring: r.scoring || null,
    starters: r.starters || null,
    roster_slots: r.roster_slots || null,
    teams: r.teams != null ? Number(r.teams) : null,
  };
  return _hash(_canonical(core));
}

// Stamp a finding object (mutates a shallow copy) with the era it was measured under.
function stamp(finding, rules, season) {
  return Object.assign({}, finding, {
    rules_era: eraSignature(rules),
    rules_era_season: season != null ? String(season) : null,
    rules_era_stamped_at_season: season != null ? String(season) : null,
  });
}

// Does a finding's stamp still match the CURRENT rules? A mismatch = the finding was
// measured in a world that no longer exists; a citation should re-run before trusting it.
function isCurrent(finding, currentRules) {
  if (!finding || !finding.rules_era) return null;   // unstamped — unknown, not "current"
  return finding.rules_era === eraSignature(currentRules);
}

module.exports = { eraSignature, stamp, isCurrent };
