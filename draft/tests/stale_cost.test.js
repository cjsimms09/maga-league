// TERRITORY: A
// A STALE ROOM IS PRICED, NOT ANNOUNCED.
//
// The board already knew about this and only ever said so. `renderSystemStrip`
// pushes "SYNC STALE 62s — picks may be missing" into its red channel, and
// `renderSyncAge` appends "verify against Sleeper before you draft". The comment
// beside the first states the danger exactly:
//
//     "A STALE SYNC INVALIDATES EVERY RECOMMENDATION... the board still
//      confidently recommends players who are already gone."
//
// BOTH OF THOSE ARE INSTRUCTIONS, and Cory's standing rule is mechanism rather
// than instruction. An instruction is weakest precisely where this one fires: on
// the clock, with nine other managers waiting, when the cost of stopping to check
// is highest and the appetite for reading a red strip is lowest.
//
// ── WHAT IS ACTUALLY KNOWABLE, AND WHAT IS NOT ────────────────────────────
//
// NOT KNOWABLE: how many picks were missed. Our capture strips per-pick
// timestamps and this draft carries `pick_timer: 0` — no timer at all — so there
// is no honest picks-per-second to divide a stall by. A line reading "≈2 picks
// missed" would be a plausible number with nothing behind it, which is the exact
// defect class this repo has spent the week removing. It is refused.
//
// KNOWABLE, and already computed: what it costs if the top name is gone. That is
// `gap_to_second`, in the seat's own units, with a measured tossup band beside
// it. So the panel prices the decision instead of delegating it:
//
//   inside the band  -> the next name is as good; do not stop the clock
//   outside the band -> here is what you lose; worth ten seconds to check
//
// Run: node draft/tests/stale_cost.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const PLAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'seat_plan.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 260) : '')); }
};

// ── 1. THE BLOCK EXISTS AND IS WIRED INTO THE PANEL ──────────────────────
const block = (function () {
  const i = SRC.indexOf('const staleLine = (function () {');
  if (i < 0) return '';
  return SRC.slice(i, SRC.indexOf('})();', i) + 4);   // no trailing `;` — it is re-wrapped below
})();
ck('the seat panel computes a staleness line', block.length > 200);
ck('and actually renders it — a computed string nobody prints is not a mechanism',
  /\+ staleLine/.test(SRC));
ck('it reads the live sync age rather than a cached flag',
  /state\.sync\.syncAgeMs\(\)/.test(block));

// ── 2. IT PRICES, RATHER THAN INSTRUCTS ──────────────────────────────────
ck('the line quotes the seat\'s own gap as the COST of the top name being gone',
  /gap_to_second/.test(block) && /Costs/.test(block), block.slice(0, 80));
ck('and compares it against that seat\'s MEASURED tossup band, not a constant',
  /tossup_threshold/.test(block));
ck('a gap inside the band tells him NOT to stop the clock',
  /do not stop the clock/i.test(block));
ck('and a gap outside it is the only case that asks for a check',
  /worth checking against Sleeper/i.test(block));

// ── 3. IT REFUSES TO INVENT A PICK RATE ──────────────────────────────────
// The tempting, plausible, unfounded number. Our capture has no per-pick
// timestamps and the draft has no pick timer, so any "N picks missed" would be
// manufactured. This asserts the refusal, because a future edit that "improves"
// the line by estimating one would look like an upgrade.
ck('the line does NOT claim how many picks were missed',
  !/picks missed|picks behind|missed \+|estimated picks/i.test(block), block.match(/picks[^<]{0,30}/g));
{
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data',
    'sleeper_league_settings.json'), 'utf8'));
  const st = settings.settings || settings;
  ck('CONTROL — this draft really has no pick timer to derive a rate from',
    Number(st.pick_timer || 0) === 0, st.pick_timer);
  const hist = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data',
    'league_history.json'), 'utf8'));
  const d = (hist.seasons || []).map(s => (Array.isArray(s.drafts) ? s.drafts[0] : s.drafts))
    .find(x => x && (x.picks || []).length);
  ck('CONTROL — and no completed draft carries per-pick timestamps either',
    !!d && !Object.keys(d.picks[0]).some(k => /time|created|ts$/i.test(k)),
    Object.keys((d || { picks: [{}] }).picks[0]));
}

// ── 4. THE THRESHOLDS ARE THE ONES THE REST OF THE PAGE USES ────────────
// A second opinion about what "stale" means would let the strip and the panel
// disagree on the same screen — which this repo has already shipped once, with
// "value" meaning two things.
ck('it uses the SHARED warn/bad constants, not its own numbers',
  /SYNC_AGE_WARN_MS/.test(block) && /SYNC_AGE_BAD_MS/.test(block));
ck('CONTROL — those constants are defined once in the file',
  (SRC.match(/const SYNC_AGE_WARN_MS =/g) || []).length === 1
  && (SRC.match(/const SYNC_AGE_BAD_MS =/g) || []).length === 1);
ck('and it is SILENT below the warn threshold — a line that always shows is '
  + 'wallpaper', /age < SYNC_AGE_WARN_MS\) return ''/.test(block));

// ── 5. THE FALLBACK IS ON SCREEN, WHICH IS WHAT MAKES IT SAFE ───────────
// Pricing the loss only helps if the replacement is visible without a fetch.
ck('every seat ships more than one name, so the next one is already rendered',
  (PLAN.seats || []).every(s => (s.shortlist || []).length >= 2),
  (PLAN.seats || []).map(s => (s.shortlist || []).length));
ck('and every seat prices its gap, or the line has nothing to quote',
  (PLAN.seats || []).every(s => s.gap_to_second != null),
  (PLAN.seats || []).filter(s => s.gap_to_second == null).map(s => s.pick));
ck('the no-second-name case is still handled rather than crashing',
  /No second name priced/.test(block));

// ── 6. FAIL ARM — the branch must be reachable and must differ ──────────
// Every check above is about source text. This drives the actual logic on both
// sides of the band so "it prices the decision" is executed, not grepped.
{
  const mk = (ageMs, gap, thresh) => {
    const seat = { gap_to_second: gap, tossup_threshold: thresh, gap_units: 'season points' };
    const state = { sync: { syncAgeMs: () => ageMs } };
    const SYNC_AGE_WARN_MS = 15000, SYNC_AGE_BAD_MS = 40000;
    const escapeHtml = x => String(x);
    const gapU = seat.gap_units;
    // eslint-disable-next-line no-new-func
    return new Function('seat', 'state', 'SYNC_AGE_WARN_MS', 'SYNC_AGE_BAD_MS',
      'escapeHtml', 'gapU', 'return (' + block.replace(/^const staleLine = /, '') + ');')(
      seat, state, SYNC_AGE_WARN_MS, SYNC_AGE_BAD_MS, escapeHtml, gapU);
  };
  ck('FRESH sync renders nothing at all', mk(3000, 13.8, 8) === '');
  const inside = mk(62000, 4.0, 8);
  const outside = mk(62000, 13.8, 8);
  ck('a stale room with a SMALL gap says do not stop the clock',
    /do not stop the clock/i.test(inside) && !/worth checking/i.test(inside), inside);
  ck('a stale room with a LARGE gap says it is worth checking',
    /worth checking/i.test(outside) && !/do not stop the clock/i.test(outside), outside);
  ck('CONTROL — the two branches genuinely produce different text',
    inside !== outside);
  ck('both quote the actual cost, so neither is a bare warning',
    /4/.test(inside) && /13.8/.test(outside));
  ck('the age is reported in seconds, from the real clock', /62s OLD/.test(outside), outside);
  ck('past the BAD threshold it carries an extra class for the stylesheet',
    /sp-stale-bad/.test(mk(62000, 13.8, 8)) && !/sp-stale-bad/.test(mk(20000, 13.8, 8)));
  ck('and a seat with no second name says so rather than throwing',
    /No second name priced/.test(mk(62000, null, 8)));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: when the room goes stale the panel states what the');
console.log('staleness COSTS — the seat\'s own gap, against its own measured tossup band —');
console.log('instead of telling Cory to go and verify, and it refuses to invent a');
console.log('picks-missed estimate it has no timestamps or pick timer to support.');
console.log('WHAT IT DOES NOT: detect that a specific player is gone. Only a fresh sync');
console.log('does that. This prices the risk of acting on a stale board; it does not');
console.log('remove it, and the shortlist below it is the recovery.');
