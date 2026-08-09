/* THE DEVIATION BADGE — market delta, evidence-derived tier, honest silence.
 * Run: node draft/tests/deviation.test.js
 */
'use strict';
const D = require('../../public/js/draft/deviation.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const player = (over) => Object.assign({
  player_id: '1', name: 'Quinshon Judkins', position: 'RB',
  adjusted_adp: 78, raw_adp: 78, adp_sd: 6, adp_source: 'ffc',
}, over || {});

const entry = (weighted, over) => ({
  player: player(over), score: 100,
  components: { weighted: weighted },
});

// --- SILENCE INSIDE THE BAND -------------------------------------------------
{
  const e = entry({ tier: 9 });
  check('a deviation INSIDE the noise band renders nothing at all',
    D.badge(e, 76, 4) === null, JSON.stringify(D.badge(e, 76, 4)));
  check('exactly at the band it speaks (the band is the floor, not a gap)',
    D.badge(e, 74, 4) !== null);
  check('no ADP at all = nothing to deviate from = silence',
    D.badge(entry({ tier: 9 }, { adjusted_adp: null, raw_adp: null }), 60, 4) === null);
}

// --- THE DELTA, BOTH DIRECTIONS ---------------------------------------------
{
  const early = D.badge(entry({ tier: 9 }), 64, 4);
  check('taking him EARLY reads as a reach we are choosing to pay for',
    early.delta === 14 && early.early === true
    && /ADP 78 · we say now, 14 early/.test(early.line), early.line);

  const fell = D.badge(entry({ tier: 9 }), 92, 4);
  check('a player who FELL reads as a fall, not a reach',
    fell.delta === -14 && fell.early === false
    && /fell 14 past his market price/.test(fell.line), fell.line);
  check('the ⚡ override marker is set on any real deviation',
    early.override === true && fell.override === true);
}

// --- THE TIER COMES FROM EVIDENCE, NEVER FROM MAGNITUDE ---------------------
{
  // A HUGE deviation bought entirely by an UNTESTED term. This is the case the
  // badge exists to expose: big bet, unproven belief.
  const huge = D.badge(entry({ value: 40 }), 38, 4);
  check('a 40-pick deviation on an UNTESTED term is still only a LEAN',
    huge.tier === 'LEAN' && Math.abs(huge.delta) === 40,
    huge.tier + ' at ' + huge.delta);

  // A SMALL deviation bought by the best-evidenced term available.
  const small = D.badge(entry({ ceiling: 9 }), 72, 4);
  check('a 6-pick deviation on a MODERATE term outranks the 40-pick one',
    small.tier === 'LIKELY', small.tier);
  check('magnitude does not appear in the tier at all',
    huge.tier === 'LEAN' && small.tier === 'LIKELY'
    && Math.abs(huge.delta) > Math.abs(small.delta));

  // A weak term dragging a moderate one down: the chain is as strong as its
  // weakest load-bearing link.
  const mixed = D.badge(entry({ ceiling: 9, value: 8 }), 64, 4);
  check('an untested term doing material work caps the tier at LEAN',
    mixed.tier === 'LEAN', mixed.tier + ' ' + JSON.stringify(mixed.drivers.map(d => d.term)));

  // CERTIFIED demands VALIDATED evidence (rank 4), which nothing has. Granting
  // it to merely-moderate terms would print our strongest word over a model
  // whose central term is untested.
  check('CERTIFIED requires VALIDATED drivers, not merely moderate ones',
    D.tierFor([{ term: 'x', rank: 4 }, { term: 'y', rank: 4 }]) === 'CERTIFIED'
    && D.tierFor([{ term: 'ceiling', rank: 3 }, { term: 'survival', rank: 3 }]) === 'LIKELY'
    && D.tierFor([{ term: 'ceiling', rank: 3 }, { term: 'tier', rank: 1 }]) === 'LEAN');
  check('NO term is validated today — CERTIFIED is unreachable until 33/36 report',
    !Object.keys(D.EVIDENCE).some(t => D.EVIDENCE[t].rank >= 4),
    Object.keys(D.EVIDENCE).map(t => t + ':' + D.EVIDENCE[t].rank).join(' '));
}

// --- DRIVERS: what bought the distance, with its evidence class -------------
{
  const b = D.badge(entry({ tier: 9, ceiling: 3, need: 2, stack: 0.4 }), 64, 4);
  check('drivers are ordered by how much they moved him',
    b.drivers.map(d => d.term).join(',') === 'tier,ceiling,need',
    b.drivers.map(d => d.term + ':' + d.points).join(' '));
  check('an immaterial term is not named — rounding is not a reason',
    !b.drivers.some(d => d.term === 'stack'));
  check('every driver carries its EVIDENCE CLASS, not just a number',
    b.drivers.every(d => ['untested', 'weak', 'structural', 'moderate'].includes(d.klass)),
    JSON.stringify(b.drivers.map(d => [d.term, d.klass])));
  check('need is STRUCTURAL — arithmetic, not a belief that can be wrong',
    b.drivers.find(d => d.term === 'need').klass === 'structural');
  check('the tier model is WEAK and says why (no calibration instrument)',
    /no calibration instrument/.test(b.drivers.find(d => d.term === 'tier').note));
}

// --- THE COUNTER-LINE, always with the case ---------------------------------
{
  const reach = D.badge(entry({ tier: 12 }), 60, 4);
  check('a reach names what you would have to disbelieve for it to be one',
    /if you do not believe the tier cliff, this is a reach/.test(reach.counter),
    reach.counter);
  const fell = D.badge(entry({ ceiling: 12 }), 96, 4);
  check('a faller gets the mirror-image counter-line',
    /he fell for a reason/.test(fell.counter), fell.counter);
  const flat = D.badge(entry({ tier: 0.5, ceiling: 0.5 }), 60, 4);
  check('with no material driver it says so rather than inventing one',
    /no single term carries this/.test(flat.counter), flat.counter);
}

// --- MARKET DISPERSION, only where it is a MEASUREMENT ----------------------
{
  const tight = D.badge(entry({ tier: 9 }, { adp_sd: 2 }), 64, 4);
  check('a tight market reads settled', tight.dispersion.contested === false
    && /settled/.test(tight.dispersion.text), JSON.stringify(tight.dispersion));

  const wide = D.badge(entry({ tier: 9 }, { adp_sd: 14 }), 64, 4);
  check('a wide market reads contested — evidence is cheap where the crowd is confused',
    wide.dispersion.contested === true && /contested/.test(wide.dispersion.text));

  // THE TRAP: adp_sd exists on all 1764 players but is a real spread only for
  // the ~205 with matched FFC ADP. The deep pool carries a fallback near 30
  // that would render as "wildly contested" when it means "no market read".
  const fallback = D.badge(entry({ tier: 9 }, { adp_sd: 30, adp_source: 'search_rank' }), 64, 4);
  check('a FALLBACK sd is not rendered as dispersion — a missing measurement is not a signal',
    fallback.dispersion === null, JSON.stringify(fallback.dispersion));
  check('...and the badge still renders; only the dispersion line is withheld',
    fallback.delta === 14 && fallback.tier === 'LEAN');
}

// --- the evidence table is the install point for 33/36 ----------------------
{
  check('value (our projections) is UNTESTED and names experiment 33',
    D.EVIDENCE.value.klass === 'untested' && /exp 33/.test(D.EVIDENCE.value.note));
  check('survival is MODERATE because its calibration is actually measured',
    D.EVIDENCE.survival.klass === 'moderate' && /calibration/.test(D.EVIDENCE.survival.note));
  check('stack is WEAK and says it is a LEAN, not an install',
    D.EVIDENCE.stack.klass === 'weak' && /not installed/.test(D.EVIDENCE.stack.note));
}


// --- THE TIER MUST SPEAK, NOT JUST GRADE ------------------------------------
// Measured 2026-08-08: 100% of this model's deviations are LEAN across 300
// simulated decisions. A uniform grade reads as no grade at all, so the tier
// carries its meaning as a sentence — and a recommendation that departs from
// consensus must not speak in the same voice as a validated call.
{
  const b = D.badge(entry({ tier: 9 }), 64, 4);
  // The default is now 34's reported lean_ordering sentence (not 'unvalidated vs
  // market'), so assert INTENT: LEAN renders as a sentence that names the market
  // and still marks the deviation unvalidated — never a bare grade.
  check('the tier renders as a SENTENCE, not a bare grade',
    b.tierLine.indexOf('LEAN — ') === 0 && b.tierLine.length > 'LEAN — '.length + 8, b.tierLine);
  check('LEAN still says it is unvalidated AGAINST THE MARKET',
    /unvalidated/.test(D.tierLine('LEAN')) && /market/.test(D.tierLine('LEAN')));
  check('LIKELY and CERTIFIED do not borrow LEAN\'s disclaimer',
    !/unvalidated/.test(D.tierLine('LIKELY'))
    && !/unvalidated/.test(D.tierLine('CERTIFIED')),
    D.tierLine('LIKELY') + ' | ' + D.tierLine('CERTIFIED'));
  check('every tier in the ladder has a voice (none falls through silently)',
    ['LEAN', 'LIKELY', 'CERTIFIED'].every(t => D.tierVoices()[t]),
    JSON.stringify(D.tierVoices()));
}

// --- THE SENTENCE MUST EXPIRE WITH ITS EXPERIMENT ---------------------------
//
// A confidence sentence that outlives the experiment which should have updated
// it is WORSE THAN THE BARE WORD: "unvalidated vs market" is honest today and
// becomes a lie the moment 34 reports, in either direction, because the market
// race will have happened.
//
// So the sentence is DERIVED from EVIDENCE_STATE, and these checks prove the
// derivation actually fires rather than the constant merely existing.
{
  const restore = JSON.parse(JSON.stringify(D.EVIDENCE_STATE[34]));

  D.recordEvidence(34, 'inconclusive', 'raced against market at n=36, inconclusive');
  check('when 34 reports INCONCLUSIVE the sentence stops saying "unvalidated"',
    !/unvalidated/.test(D.tierLine('LEAN')) && /inconclusive/.test(D.tierLine('LEAN')),
    D.tierLine('LEAN'));

  D.recordEvidence(34, 'lost', 'lost to market by $41/season at n=36');
  check('when 34 reports a LOSS the sentence says so, with the number',
    /lost to market/.test(D.tierLine('LEAN')) && /\$41/.test(D.tierLine('LEAN')),
    D.tierLine('LEAN'));

  D.recordEvidence(34, 'won', null);
  check('a WIN still produces a measured sentence, not the pre-experiment one',
    !/unvalidated/.test(D.tierLine('LEAN')), D.tierLine('LEAN'));

  // And the badge — the thing actually rendered — must follow, not cache.
  const live = D.badge(entry({ tier: 9 }), 64, 4);
  check('the BADGE follows the evidence state (it does not snapshot the wording)',
    !/unvalidated/.test(live.tierLine), live.tierLine);

  // The pre-experiment sentence must still be reachable — set 'unrun' explicitly
  // (the DEFAULT is no longer unrun: 34 reported as 'lean_ordering', 2026-08-09).
  D.recordEvidence(34, 'unrun', null);
  check('the pre-experiment sentence returns when 34 is set unrun again',
    /unvalidated vs market/.test(D.tierLine('LEAN')), D.tierLine('LEAN'));

  // 34's real result: an ORDERING lean that must NOT read as a per-deviation
  // license. The sentence records the edge AND that this deviation is unvalidated.
  D.recordEvidence(34, 'lean_ordering', 'our ranking edges the market (LEAN, n=19) — this deviation still unvalidated');
  const s = D.tierLine('LEAN');
  check('lean_ordering says our ranking edges the market', /ranking edges the market/.test(s), s);
  check('lean_ordering does NOT read as this-deviation-validated (still a LEAN, not a license)',
    /unvalidated/.test(s) && !/beat market when measured/.test(s), s);

  D.recordEvidence(34, restore.status, restore.finding);
  check('restored: the default is now the lean_ordering sentence (34 has reported)',
    /ranking edges the market/.test(D.tierLine('LEAN')), D.tierLine('LEAN'));
}

// --- SSOT: NO SECOND COPY OF THIS SENTENCE ANYWHERE -------------------------
//
// The failure this prevents is documented and real: "Sleeper-confirmed" drifted
// to "Sleeper-verified" inside a single session. A second copy of a confidence
// sentence drifts the same way, and nobody notices which surface is telling the
// older story. Same rule as the PlayerRef resolver, applied to language.
{
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', '..', 'public', 'js', 'draft');
  const offenders = [];
  fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'deviation.js')
    .forEach(f => {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      src.split('\n').forEach((line, i) => {
        const code = line.replace(/^\s*(\/\/|\*).*$/, '');   // ignore comment lines
        if (/unvalidated vs market|moderate evidence|validated vs held-out/.test(code)) {
          offenders.push(f + ':' + (i + 1));
        }
      });
    });
  check('the tier sentence exists in exactly ONE module (no drift copies)',
    !offenders.length,
    'found the phrasing outside deviation.js at: ' + offenders.join(', '));

  // Non-vacuity: the scan must be capable of finding something.
  const selfCheck = fs.readFileSync(path.join(dir, 'deviation.js'), 'utf8');
  check('...and the scan can actually detect the phrasing (non-vacuity)',
    /unvalidated vs market/.test(selfCheck));
}


// EXP 36 market-quality line — the deviation card says whether we deviate where the
// market ranks well or poorly, from the measured surface (the anchor inversion, actionable).
check('R1-3 RB reads WEAK (freer to deviate)', /WEAKLY|BACKWARDS/.test(D.marketQualityLine(3, 'RB')));
check('late WR (R12+) reads WELL (respect it)', /WELL/.test(D.marketQualityLine(115, 'WR')));
check('mid TE (R4-7) reads WELL', /WELL/.test(D.marketQualityLine(45, 'TE')));
check('K is unmeasured -> anchor conservative', /unmeasured/.test(D.marketQualityLine(150, 'K')));
check('a thin cell falls back to the pooled position average',
  D.marketEfficiency(3, 'QB').source === 'pooled' && Math.abs(D.marketEfficiency(3,'QB').value - 0.381) < 1e-9);

// EXP 36 -> PER-REGION NOISE BAND — the silence band derives from measured
// reliability instead of one flat 4.0: tight where the market ranks well (flag
// even small deviations), wide where it ranks weakly/backwards (deviate freely).
{
  const wellRanked = D.noiseBandFor(115, 'WR');   // r12+ WR, rho 0.718 — market nails it
  const backwards  = D.noiseBandFor(115, 'RB');   // r12+ RB, rho -0.147 — market is backwards
  const midRB      = D.noiseBandFor(45, 'RB');    // r4-7 RB, rho 0.13 — near the mean
  check('a well-ranked region gets a TIGHT band', wellRanked <= 2.0, String(wellRanked));
  check('a backwards region gets a WIDE band', backwards >= 5.0, String(backwards));
  check('the band is monotone: tighter where the market ranks better',
    wellRanked < midRB && midRB < backwards, `${wellRanked} < ${midRB} < ${backwards}`);
  check('the band is clamped to its guardrails', wellRanked >= 1.5 && backwards <= 6.0);
  check('an unmeasured region falls back to the conservative BASE band',
    D.noiseBandFor(150, 'K') === 4.0, String(D.noiseBandFor(150, 'K')));
  check('rho_bar is the mean of the ranked cells (derived, not hand-set)',
    Math.abs(D.RHO_BAR - 0.228) < 0.01, String(D.RHO_BAR));
}

// badge DERIVES the band when none is passed — a deviation that would be silenced
// by a flat 4.0 in a well-ranked region should now SPEAK (its band is tighter).
{
  // r12+ WR at pick 115, ADP 118 -> delta -3. Flat band 4 -> silent; derived ~1.5 -> speaks.
  const wr = entry({ ceiling: 9 }, { position: 'WR', adjusted_adp: 118, raw_adp: 118 });
  check('a small deviation in a well-ranked region is SILENT under the flat band',
    D.badge(wr, 115, 4) === null);
  check('the SAME deviation SPEAKS under the derived per-region band',
    D.badge(wr, 115) !== null && D.badge(wr, 115).noiseBand <= 2.0,
    JSON.stringify(D.badge(wr, 115)));
}

// EXP 25 DEAD-ZONE marker — informational labeled prior on the card.
check('an RB INSIDE the dead zone (pick 61+) is flagged, prefer WR',
  /INSIDE the RB dead zone/.test(D.deadZoneLine(65, 'RB') || '') && /prefer WR/.test(D.deadZoneLine(65, 'RB') || ''));
check('an RB ENTERING the zone (51-60) gets the early warning',
  /ENTERING the RB dead zone/.test(D.deadZoneLine(55, 'RB') || ''));
check('an early RB (before pick 51) gets NO dead-zone flag',
  D.deadZoneLine(20, 'RB') === null);
check('a WR inside the region reads as HOLDS (the mid-round lean)',
  /WR HOLDS/.test(D.deadZoneLine(65, 'WR') || ''));
check('a QB in the region gets no dead-zone line (RB/WR only)',
  D.deadZoneLine(65, 'QB') === null);
check('the dead-zone cites the evidence (exp 25 + BBM), not a bare claim',
  /exp 25/.test(D.deadZoneLine(65, 'RB') || '') && /BBM/.test(D.deadZoneLine(65, 'RB') || ''));
check('the badge carries a deadZone line for an RB deep on the board',
  (function () { var b = D.badge(entry({ tier: 9 }, { position: 'RB', adjusted_adp: 40, raw_adp: 40 }), 65);
    return b && /RB dead zone/.test(b.deadZone || ''); })());

// The weak/well band edges are DERIVED tertiles of the measured efficiency
// distribution, not the hand-set 0.2/0.5 (DERIVED-VS-DECLARED audit).
check('market-quality cuts are derived from the surface, not the old 0.2/0.5 constants',
  D.EFF_CUTS && D.EFF_CUTS.weak !== 0.2 && D.EFF_CUTS.well !== 0.5
  && D.EFF_CUTS.weak > 0 && D.EFF_CUTS.weak < D.EFF_CUTS.well, JSON.stringify(D.EFF_CUTS));
check('a region below the derived weak cut reads WEAKLY',
  /WEAKLY/.test(D.marketQualityLine(3, 'RB')));   // r1-3 RB 0.121 < weak tertile
check('a region above the derived well cut reads WELL',
  /WELL/.test(D.marketQualityLine(115, 'WR')));    // r12+ WR 0.718 > well tertile

console.log(`\n${pass}/${pass + fail} deviation checks passed`);
process.exit(fail ? 1 : 0);
