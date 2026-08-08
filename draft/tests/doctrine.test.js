/* THE DOCTRINE BANNER — state machine + hysteresis (war-room-v2-doctrine-banner.md §5).
 * Run: node draft/tests/doctrine.test.js
 */
'use strict';
const D = require('../../public/js/draft/doctrine.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// --- ranking + enrollment ----------------------------------------------------
{
  const ranked = D.rankDoctrines({ wr_anchor: 120, early_qb: 111, hero_rb: 100 });
  check('rankDoctrines sorts high→low with names', ranked[0].key === 'wr_anchor'
    && ranked[0].name === 'WR Feast' && ranked[2].key === 'hero_rb', JSON.stringify(ranked.map(r => r.key)));
}

// --- banner renders the enrolled plan ---------------------------------------
{
  const s = new D.DoctrineState('wr_anchor', { noiseBand: 4, minPicks: 2 });
  const out = s.update({ wr_anchor: 120, early_qb: 111 }, 1);
  check('banner renders enrolled plan name + creed', out.doctrine === 'WR Feast'
    && /value fall/.test(out.creed), JSON.stringify(out));
  check('banner shows the live alternative + dollar gap', out.alternative === 'Early-QB Strike'
    && out.gap === 9, 'gap=' + out.gap);
  check('no switch when the plan leads', out.switched === false);
  check('confidence reads on-script when clear of the band', /on script/.test(out.confidence), out.confidence);
}

// --- a real QB run triggers EXACTLY ONE switch, correct framing --------------
{
  const s = new D.DoctrineState('wr_anchor', { noiseBand: 4, minPicks: 2 });
  s.update({ wr_anchor: 120, early_qb: 111 }, 1);                 // plan leads
  const p2 = s.update({ wr_anchor: 108, early_qb: 122 }, 2,       // challenger takes a material lead (pick 1 of streak)
    { cause: 'the QB run erased WR Feast\'s edge', projected: 14 });
  check('a material lead does NOT switch on its first pick (hysteresis)', p2.switched === false, JSON.stringify(p2));
  const p3 = s.update({ wr_anchor: 108, early_qb: 122 }, 3,       // held for a 2nd pick → switch
    { cause: 'the QB run held', projected: 14 });
  check('the switch fires only after minPicks of a material lead', p3.switched === true, JSON.stringify(p3));
  check('exactly one switch (pick 3), not pick 2', p2.switched === false && p3.switched === true);
  check('the switch sentence names the doctrine and the dollars',
    /SWITCHING TO EARLY-QB STRIKE/.test(p3.sentence) && /\+\$14/.test(p3.sentence), p3.sentence);
  check('after switching, current doctrine is the challenger', p3.doctrine === 'Early-QB Strike');
  // A second consecutive lead does not re-announce.
  const p4 = s.update({ early_qb: 122, wr_anchor: 108 }, 4);
  check('no repeat switch announcement once switched', p4.switched === false);
}

// --- hysteresis suppresses a noise-band flap --------------------------------
{
  const s = new D.DoctrineState('wr_anchor', { noiseBand: 4, minPicks: 2 });
  // Alternative leads, but only by 2 (< band 4) for several picks.
  const a = s.update({ wr_anchor: 100, early_qb: 102 }, 1);
  const b = s.update({ wr_anchor: 100, early_qb: 102 }, 2);
  const c = s.update({ wr_anchor: 100, early_qb: 102 }, 3);
  check('a within-band lead never switches, however long it persists',
    !a.switched && !b.switched && !c.switched && s.current === 'wr_anchor', s.current);
  check('confidence flags the contest when the alt is within the band', /within the band/.test(c.confidence), c.confidence);

  // A single-pick spike above the band, then it recedes → no switch.
  const s2 = new D.DoctrineState('wr_anchor', { noiseBand: 4, minPicks: 2 });
  s2.update({ wr_anchor: 100, early_qb: 110 }, 1);               // 1 pick over band
  const back = s2.update({ wr_anchor: 100, early_qb: 101 }, 2);  // recedes within band
  check('a one-pick spike over the band does not flip the plan', back.switched === false && s2.current === 'wr_anchor');
}

// --- decline preserves the prior doctrine and logs --------------------------
{
  const s = new D.DoctrineState('wr_anchor', { noiseBand: 4, minPicks: 1 });
  const sw = s.update({ wr_anchor: 100, early_qb: 120 }, 1);      // minPicks:1 → switch immediately
  check('setup: switched to Early-QB', sw.switched && s.current === 'early_qb');
  const rec = s.decline('wr_anchor', 1);
  check('decline restores the prior doctrine', s.current === 'wr_anchor');
  check('decline returns a ledger record naming what was kept',
    rec.kind === 'doctrine_decline' && rec.kept === 'wr_anchor', JSON.stringify(rec));
  check('the decline is in the per-pick log', s.log.some(l => l.kind === 'doctrine_decline'));
}

// --- vocabulary is the LAB's vocabulary --------------------------------------
{
  // The banner, the ledger and cory_conditional.py must name the same things.
  // If these keys drift, an enrolled verdict silently renders as a raw key.
  const LAB_KEYS = ['balanced', 'zero_rb', 'hero_rb', 'robust_rb', 'wr_anchor',
                    'elite_te', 'early_qb', 'late_qb'];
  check('every Lab archetype has a doctrine name + creed',
    LAB_KEYS.every(k => D.DOCTRINES[k] && D.DOCTRINES[k].name && D.DOCTRINES[k].creed),
    LAB_KEYS.filter(k => !D.DOCTRINES[k]).join(','));
  check('every Lab archetype has a live constraint mirror',
    LAB_KEYS.every(k => typeof D.LIVE_CONSTRAINTS[k] === 'function'),
    LAB_KEYS.filter(k => !D.LIVE_CONSTRAINTS[k]).join(','));
  check('the retired wr_feast key still resolves (old ledger rows)',
    D.doctrineMeta('wr_feast').key === 'wr_anchor' && D.doctrineMeta('wr_feast').name === 'WR Feast');
}

// --- live scoring: a doctrine's score is the best board player it ALLOWS -----
{
  const board = [
    { player: { position: 'RB', proj_mean: 200, proj_ceiling: 260 } },   // best overall
    { player: { position: 'WR', proj_mean: 180, proj_ceiling: 230 } },
    { player: { position: 'QB', proj_mean: 170, proj_ceiling: 200 } },
    { player: { position: 'TE', proj_mean: 120, proj_ceiling: 150 } },
  ];
  // The engine's playerDollars model (DG_HIGH_K/ENTRY_K/RS_K), inlined so this
  // suite stays a pure unit test of the doctrine layer.
  const dollarsOf = p => 0.22 * ((p.proj_ceiling || p.proj_mean) - p.proj_mean)
                       + 0.08 * p.proj_mean + 0.05 * p.proj_mean;
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  const at = (liveIndex, roster) => D.scoreBoard(board, { liveIndex, roster: roster || [], dollarsOf });
  // scoreBoard rounds to cents; compare against the same rounding.
  const $of = i => Math.round(dollarsOf(board[i].player) * 100) / 100;

  const s1 = at(1, []);
  check('balanced takes the best player on the board', near(s1.balanced, $of(0)), String(s1.balanced));
  check('zero_rb is priced off the best NON-RB early', near(s1.zero_rb, $of(1)), 'zero_rb=' + s1.zero_rb);
  check('zero_rb costs real dollars vs balanced at pick 1', s1.balanced - s1.zero_rb > 1,
    'gap=' + (s1.balanced - s1.zero_rb));
  check('zero_rb stops constraining from live pick 6', near(at(6, []).zero_rb, at(6, []).balanced));
  // wr_anchor's window binds only when picks-remaining-in-the-first-4 equals
  // WRs-still-needed. At live pick 1 there are 4 picks for 3 WRs — slack, so it
  // does NOT force. At live pick 2 there are 3 for 3, and it does. Asserting
  // both directions is the point: a constraint that always binds is not this
  // doctrine, it is Best-WR-Available wearing its name.
  check('wr_anchor does NOT force while there is slack in the 3-in-4 window',
    near(s1.wr_anchor, s1.balanced), 'wr_anchor=' + s1.wr_anchor);
  check('wr_anchor forces WR the moment the window is exactly tight',
    near(at(2, []).wr_anchor, $of(1)), 'wr_anchor@2=' + at(2, []).wr_anchor);
  check('wr_anchor releases once three WRs are already rostered',
    near(at(2, [{ position: 'WR' }, { position: 'WR' }, { position: 'WR' }]).wr_anchor, s1.balanced));
  check('early_qb binds only at live pick 3, and only with no QB rostered',
    near(at(3, []).early_qb, $of(2)) && near(at(3, [{ position: 'QB' }]).early_qb, s1.balanced),
    at(3, []).early_qb + '/' + at(3, [{ position: 'QB' }]).early_qb);
  check('late_qb never prices a QB before live pick 8', near(at(2, []).late_qb, $of(0)));

  // An unsatisfiable constraint must read as "no cost", not a fake $0 cliff.
  const teOnly = [{ player: { position: 'TE', proj_mean: 100, proj_ceiling: 130 } }];
  const s2 = D.scoreBoard(teOnly, { liveIndex: 3, roster: [], dollarsOf });
  check('an unsatisfiable doctrine falls back to unconstrained, never $0',
    near(s2.early_qb, s2.balanced) && s2.early_qb > 0, JSON.stringify(s2));
  check('an empty board scores every doctrine at zero without throwing',
    D.scoreBoard([], { liveIndex: 1, dollarsOf }).balanced === 0);
}

// --- a tie is not a contest -------------------------------------------------
{
  // Most picks early in a draft are doctrine-neutral: nothing is binding, so
  // every doctrine takes the same player. The banner used to render that as
  // "Balanced Value trails by $0 — contested", which reads as a live argument
  // when there is none. A tie must say so.
  const s = new D.DoctrineState('wr_anchor', { noiseBand: 4, minPicks: 2 });
  const out = s.update({ wr_anchor: 120, balanced: 120, zero_rb: 120 }, 1);
  check('an all-tie board is reported NEUTRAL, not contested',
    out.neutral === true && /not binding/.test(out.confidence), out.confidence);
  check('a neutral pick never switches the plan', out.switched === false && s.current === 'wr_anchor');

  // With one real difference present, the banner must surface THAT one rather
  // than a tied doctrine that happens to sort first.
  const s2 = new D.DoctrineState('wr_anchor', { noiseBand: 4, minPicks: 2 });
  const out2 = s2.update({ wr_anchor: 120, balanced: 120, zero_rb: 111 }, 1);
  check('the live alternative is the doctrine that would take a DIFFERENT player',
    out2.alternative_key === 'zero_rb' && out2.gap === 9 && out2.neutral === false,
    JSON.stringify({ alt: out2.alternative_key, gap: out2.gap }));
  check('a real difference is no longer flagged neutral', /on script/.test(out2.confidence), out2.confidence);
}

// --- enrollment reads the Lab verdict, and refuses to invent one -------------
{
  const e = D.enrollment({ enrolled: 'wr_anchor', edge: 91.5, ci95: [73.88, 108.88],
                           runner_up: 'early_qb', runner_up_edge: 67.62, rooms: 200, control: 'balanced' });
  check('enrollment resolves the winner to its name + edge',
    e.enrolled === true && e.key === 'wr_anchor' && e.meta.name === 'WR Feast' && e.edge === 91.5);
  check('enrollment carries the runner-up for the banner alternative',
    !!e.runner_up && e.runner_up.name === 'Early-QB Strike');
  const none = D.enrollment(null);
  check('no verdict = the CONTROL, flagged unenrolled (never a fabricated plan)',
    none.enrolled === false && none.key === 'balanced' && /no doctrine enrolled/.test(none.note),
    JSON.stringify(none));
}

console.log(`\n${pass}/${pass + fail} doctrine checks passed`);
process.exit(fail ? 1 : 0);
