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
  const ranked = D.rankDoctrines({ wr_feast: 120, early_qb: 111, hero_rb: 100 });
  check('rankDoctrines sorts high→low with names', ranked[0].key === 'wr_feast'
    && ranked[0].name === 'WR Feast' && ranked[2].key === 'hero_rb', JSON.stringify(ranked.map(r => r.key)));
}

// --- banner renders the enrolled plan ---------------------------------------
{
  const s = new D.DoctrineState('wr_feast', { noiseBand: 4, minPicks: 2 });
  const out = s.update({ wr_feast: 120, early_qb: 111 }, 1);
  check('banner renders enrolled plan name + creed', out.doctrine === 'WR Feast'
    && /value fall/.test(out.creed), JSON.stringify(out));
  check('banner shows the live alternative + dollar gap', out.alternative === 'Early-QB Strike'
    && out.gap === 9, 'gap=' + out.gap);
  check('no switch when the plan leads', out.switched === false);
  check('confidence reads on-script when clear of the band', /on script/.test(out.confidence), out.confidence);
}

// --- a real QB run triggers EXACTLY ONE switch, correct framing --------------
{
  const s = new D.DoctrineState('wr_feast', { noiseBand: 4, minPicks: 2 });
  s.update({ wr_feast: 120, early_qb: 111 }, 1);                 // plan leads
  const p2 = s.update({ wr_feast: 108, early_qb: 122 }, 2,       // challenger takes a material lead (pick 1 of streak)
    { cause: 'the QB run erased WR Feast\'s edge', projected: 14 });
  check('a material lead does NOT switch on its first pick (hysteresis)', p2.switched === false, JSON.stringify(p2));
  const p3 = s.update({ wr_feast: 108, early_qb: 122 }, 3,       // held for a 2nd pick → switch
    { cause: 'the QB run held', projected: 14 });
  check('the switch fires only after minPicks of a material lead', p3.switched === true, JSON.stringify(p3));
  check('exactly one switch (pick 3), not pick 2', p2.switched === false && p3.switched === true);
  check('the switch sentence names the doctrine and the dollars',
    /SWITCHING TO EARLY-QB STRIKE/.test(p3.sentence) && /\+\$14/.test(p3.sentence), p3.sentence);
  check('after switching, current doctrine is the challenger', p3.doctrine === 'Early-QB Strike');
  // A second consecutive lead does not re-announce.
  const p4 = s.update({ early_qb: 122, wr_feast: 108 }, 4);
  check('no repeat switch announcement once switched', p4.switched === false);
}

// --- hysteresis suppresses a noise-band flap --------------------------------
{
  const s = new D.DoctrineState('wr_feast', { noiseBand: 4, minPicks: 2 });
  // Alternative leads, but only by 2 (< band 4) for several picks.
  const a = s.update({ wr_feast: 100, early_qb: 102 }, 1);
  const b = s.update({ wr_feast: 100, early_qb: 102 }, 2);
  const c = s.update({ wr_feast: 100, early_qb: 102 }, 3);
  check('a within-band lead never switches, however long it persists',
    !a.switched && !b.switched && !c.switched && s.current === 'wr_feast', s.current);
  check('confidence flags the contest when the alt is within the band', /within the band/.test(c.confidence), c.confidence);

  // A single-pick spike above the band, then it recedes → no switch.
  const s2 = new D.DoctrineState('wr_feast', { noiseBand: 4, minPicks: 2 });
  s2.update({ wr_feast: 100, early_qb: 110 }, 1);               // 1 pick over band
  const back = s2.update({ wr_feast: 100, early_qb: 101 }, 2);  // recedes within band
  check('a one-pick spike over the band does not flip the plan', back.switched === false && s2.current === 'wr_feast');
}

// --- decline preserves the prior doctrine and logs --------------------------
{
  const s = new D.DoctrineState('wr_feast', { noiseBand: 4, minPicks: 1 });
  const sw = s.update({ wr_feast: 100, early_qb: 120 }, 1);      // minPicks:1 → switch immediately
  check('setup: switched to Early-QB', sw.switched && s.current === 'early_qb');
  const rec = s.decline('wr_feast', 1);
  check('decline restores the prior doctrine', s.current === 'wr_feast');
  check('decline returns a ledger record naming what was kept',
    rec.kind === 'doctrine_decline' && rec.kept === 'wr_feast', JSON.stringify(rec));
  check('the decline is in the per-pick log', s.log.some(l => l.kind === 'doctrine_decline'));
}

console.log(`\n${pass}/${pass + fail} doctrine checks passed`);
process.exit(fail ? 1 : 0);
