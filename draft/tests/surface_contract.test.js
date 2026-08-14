// TERRITORY: A
// THE WAR-ROOM CONTRACT, ASSERTED AGAINST THE LIVE CODE.
//
// `draft/backtest/WAR-ROOM-SURFACE-CONTRACT.md` states what each pick-driving
// number IS, what it EXCLUDES, and the sentence a reader could wrongly take
// away. Cory: "make 100% sure what B is showing me matches what model actually
// says. This could ruin whole draft."
//
// ── WHY THE DOCUMENT IS TESTED AND NOT JUST WRITTEN ───────────────────────
//
// Two of the three defects that audit has found so far were DOCUMENTS AND
// LABELS THAT HAD STOPPED BEING TRUE — a caveat naming a sampler the run did not
// use, and a "+$353 season edge" whose experiment was void. A contract that can
// drift is the same failure one level up, and it would be the most damaging
// version of it: the thing everyone checks against.
//
// So every load-bearing claim in that file is re-derived here from the shipped
// engine. If the model changes and the document does not, this goes red.
//
// Run: node draft/tests/surface_contract.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const DOC = path.join(ROOT, 'draft', 'backtest', 'WAR-ROOM-SURFACE-CONTRACT.md');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};
const docRaw = fs.readFileSync(DOC, 'utf8');
// WHITESPACE-NORMALISED. Three of my first assertions failed on prose that says
// exactly what they claimed — the sentences simply wrapped across lines. A regex
// that fails on line width is testing the formatter, not the content.
const doc = docRaw.replace(/\s+/g, ' ');
const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

// ── 1. THE SHIPPED WEIGHTS ARE THE ONES THE DOC DESCRIBES ───────────────
{
  ck('the app initialises from MEASURED_WEIGHTS, which is what makes the '
    + '"five of eight are zero" claim true of PRODUCTION and not of a default',
  /weights: Object\.assign\(\{\}, E\.MEASURED_WEIGHTS/.test(app));

  const zeroed = Object.keys(E.MEASURED_WEIGHTS).filter(k => E.MEASURED_WEIGHTS[k] === 0);
  ck('exactly five terms are zeroed', zeroed.length === 5, zeroed);
  ck('and they are the five the document names',
    JSON.stringify(zeroed.slice().sort())
      === JSON.stringify(['bye', 'ceiling', 'need', 'risk', 'tier']), zeroed);
  const live = Object.keys(E.MEASURED_WEIGHTS).filter(k => E.MEASURED_WEIGHTS[k] !== 0);
  ck('the three that survive are value, keeper and stack — the whole composite',
    JSON.stringify(live.slice().sort()) === JSON.stringify(['keeper', 'stack', 'value']), live);
  ck('the document says so', /`value \+ keeper \+ stack`/.test(doc));
}

// ── 2. THE ZEROS ARE HONEST, AND THE DOC SAYS WHICH KIND ────────────────
// "measured inert" and "could not be measured" are different states, and only
// one of them is a finding. Collapsing them would be the same defect as a null
// reading as a zero.
{
  const prov = E.WEIGHT_PROVENANCE || {};
  ck('the engine records provenance per weight, so the distinction exists in '
    + 'code rather than only in prose', Object.keys(prov).length >= 8, Object.keys(prov).length);
  ck('`ceiling` is recorded as UNMEASURED, not as measured-zero',
    /UNMEASURED/.test(String(prov.ceiling)), prov.ceiling);
  ck('`risk` likewise', /UNMEASURED/.test(String(prov.risk)), prov.risk);
  ck('while `tier` and `need` are recorded as MEASURED',
    /measured/i.test(String(prov.tier)) && !/UNMEASURED/.test(String(prov.tier))
      && /measured/i.test(String(prov.need)) && !/UNMEASURED/.test(String(prov.need)),
    { tier: prov.tier, need: prov.need });
  ck('and the document keeps the two apart rather than calling them all "zero"',
    /measured inert/.test(doc) && /UNMEASURED/.test(doc));
  ck('the unsignable ceiling interval is quoted with its sign ambiguity, which '
    + 'is the reason the weight is 0',
  /−4\.8/.test(doc) && /\[−26, \+17\] interval\*\*: unsignable/.test(doc));
}

// ── 2b. THE COMPOSITE IS NOT ONLY THE WEIGHT VECTOR ─────────────────────
/* THE DOCUMENT SAID THE SCORE IS "`value + keeper + stack` AND NOTHING ELSE".
 * It is that sum PLUS two post-assembly deltas — `onesie` (the duplicate-position
 * discount) and `doctrine` (the plan tilt) — which are in no weight vector and
 * which `engine.js` publishes into `components.weighted` precisely so a consumer
 * cannot silently disagree with the score. Measured with a real roster, `onesie`
 * is the THIRD-LARGEST driver of what separates the top five.
 *
 * IT WAS INVISIBLE BECAUSE EVERY HARNESS RAN `roster: []`. Both `onesie` and
 * `stack` score a relationship to players already held, so on an empty roster
 * they are structurally 0.0% — two of the four live terms vanish and VONA's
 * measured share inflates from 59% to 78%. That is why the assertion below scores
 * with an ACCUMULATING roster: a decomposition on an empty one is a measurement
 * of a state that never occurs after the first pick. */
{
  const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'), 'utf8');
  ck('the engine publishes the post-assembly deltas alongside the weighted terms, '
    + 'so components can sum to the score', /onesie: onesieDelta, doctrine: doctrineDelta/.test(src));
  ck('the document no longer claims the composite is the weight vector and '
    + 'nothing else', !/`value \+ keeper \+ stack`\*\* and nothing else/.test(doc));
  ck('and it NAMES onesie as a driver rather than leaving it off the list',
    /`onesie`/.test(doc) && /third-largest driver/.test(doc));
  ck('it states the empty-roster caveat, which is what hid this',
    /unmeasured, not inert/.test(doc) && /structurally zero/.test(doc));

  /* THE SHARES, RE-DERIVED. A table of percentages in a document is exactly the
   * kind of claim that goes stale silently — this one already did, at 62%. */
  const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const MY = D.pick_order.my_picks;
  const keepers = (D.kept_players || []).slice();
  const priced = D.players.filter(x => x.adp != null).slice().sort((a, b) => a.adp - b.adp);
  const roster = keepers.slice(), taken = keepers.slice(), tot = {};
  MY.forEach(p => {
    const gone = new Set(priced.slice(0, p - 1).map(x => String(x.player_id)));
    taken.forEach(t => gone.add(String(t.player_id)));
    const next = MY.find(q => q > p) || null;
    const sc = (E.onTheClock({
      board: D.players.filter(x => !gone.has(String(x.player_id))), nextPick: next,
      totalPicks: 150, myPicksLeft: MY.filter(q => q >= p).length, roster: roster.slice(),
      doctrine: null, myPickIndex: Math.max(0, MY.indexOf(p)), totalMyPicks: MY.length,
      currentKeepers: keepers.slice(), league: D.league, weights: E.MEASURED_WEIGHTS,
      runMultipliers: {}, ceilingAllStages: false, drift: null, currentPick: p,
      intervening: next ? next - p : 0,
      roundsLeft: Math.max(0, Math.ceil((150 - p) / (D.league.teams || 10))),
    }, { avoid: [], target: [] }) || {}).scored || [];
    const top = sc.slice(0, 5);
    if (top.length > 1) {
      const wc = top.map(x => (x.components || {}).weighted || {});
      Object.keys(wc[0]).filter(k => typeof wc[0][k] === 'number').forEach(k => {
        const v = wc.map(x => x[k] || 0);
        const m = v.reduce((a, b) => a + b, 0) / v.length;
        tot[k] = (tot[k] || 0) + v.reduce((a, b) => a + Math.abs(b - m), 0) / v.length;
      });
    }
    if (sc[0]) { roster.push(sc[0].player); taken.push(sc[0].player); }
  });
  const sum = Object.keys(tot).reduce((a, k) => a + tot[k], 0);
  const pct = k => 100 * (tot[k] || 0) / sum;
  console.log('      re-derived term shares: ' + Object.keys(tot)
    .sort((a, b) => tot[b] - tot[a]).filter(k => pct(k) >= 0.05)
    .map(k => k + ' ' + pct(k).toFixed(1) + '%').join(' · '));

  ck('VONA really is the largest term, which is the claim the whole VONA section '
    + 'rests on', Object.keys(tot).every(k => k === 'value' || tot[k] <= tot.value),
  Object.keys(tot).map(k => k + ':' + pct(k).toFixed(1)));
  /* BANDED, NOT PINNED. The board rebuilds nightly and these shares move with it;
   * a hard 59.3 would go red on a projection refresh, which is the model being
   * punished for the data changing. The band is wide enough to survive a rebuild
   * and narrow enough that 78% — the empty-roster artifact — fails it. */
  ck('and its share matches the ~59% the document states, on a band that the '
    + 'empty-roster artifact (78%) would fail',
  pct('value') >= 50 && pct('value') <= 70, pct('value').toFixed(1));
  ck('onesie is live and material rather than a rounding term — the reason it had '
    + 'to be named', pct('onesie') >= 5, pct('onesie').toFixed(1));
  ck('and stack is NOT zero once a roster exists, so the old empty-roster reading '
    + 'of 0.0% was an artifact and not a measurement', pct('stack') > 0,
  pct('stack').toFixed(1));
  ck('the document\'s table is in the right ORDER, which is the part a reader '
    + 'acts on', pct('value') > pct('keeper') && pct('keeper') > pct('onesie')
    && pct('onesie') > pct('stack'),
  ['value', 'keeper', 'onesie', 'stack'].map(k => k + ':' + pct(k).toFixed(1)));
}

// ── 3. A ZERO-WEIGHT TERM REPORTS ZERO, NOT A NUMBER ────────────────────
// The claim that stops a breakdown listing eight terms as if eight were used.
{
  const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'), 'utf8');
  ck('components are multiplied by their weight before being reported, so a '
    + 'zero-weight term cannot show a contribution it did not make',
  /tier: w\.tier \* tier, need: w\.need \* need\.value/.test(src));
  ck('and a reason for a zero-weight term is suppressed rather than printed',
    /if \(w\.need \* need\.value > 0\) reasons\.push/.test(src));
}

// ── 4. THE DOLLAR TERMS ─────────────────────────────────────────────────
{
  const d = E.playerDollars({ proj_mean: 200, proj_ceiling: 260 });
  ck('the dollar figure is a linear rescaling of the projection, exactly as the '
    + 'document states', Math.abs(d.total - (0.22 * 60 + 0.08 * 200 + 0.05 * 200)) < 1e-9,
  d.total);
  ck('the coefficients in the document are the coefficients in the engine',
    /0\.22 × \(ceiling − mean\) \+ 0\.08 × mean \+ 0\.05 × mean/.test(doc)
      && E.CFG.DG_HIGH_K === 0.22 && E.CFG.DG_ENTRY_K === 0.08 && E.CFG.DG_RS_K === 0.05);
  ck('and the collinearity claim holds — entry over rs is the ratio of their '
    + 'constants, for any player',
  Math.abs(d.entry / d.rs - E.CFG.DG_ENTRY_K / E.CFG.DG_RS_K) < 1e-9, d.entry / d.rs);
  ck('the document states it is NOT a simulation of the pot',
    /IS NOT:\*\* a simulation of the pot/.test(doc));
}

// ── 5. VONA IS WHAT THE DOC SAYS, INCLUDING ITS WEAKNESS ────────────────
{
  ck('the document defines VONA over the next player AT THAT POSITION rather '
    + 'than over a starter or replacement',
  /next player at that position/i.test(doc) && /not.*over a \*starter\*/i.test(doc));
  ck('and names the live weakness — survival reads market ADP while our room '
    + 'takes QBs earlier at every slot',
  /market ADP/.test(doc) && /18 of 18/.test(doc));
  ck('and says no correction is fitted, which is the standing decision',
    /No correction is fitted/.test(doc));
  ck('the survival resolver the document points at actually exists',
    typeof require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js')).resolveSurvival
      === 'function');
}

// ── 6. THE PATHS CLAIM ──────────────────────────────────────────────────
{
  ck('the document claims one row per position', /one per position/.test(doc));
  /* THE TRIO IS TE/RB/RB, NOT WR/RB/RB, AND THE CORRECTION IS ASSERTED TOO.
   * This regex read `/WR \/ RB \/ RB/` and passed, because it was checking the
   * document against the same wrong measurement that produced the document. Both
   * came from a suite scoring under DEFAULT_WEIGHTS while the app runs
   * MEASURED_WEIGHTS. A guard derived from the same bad source as the thing it
   * guards is not a guard — so the retraction is pinned alongside the fact. */
  ck('and records the pick-33 TE/RB/RB defect it was written after',
    /TE \/ RB \/ RB/.test(doc));
  ck('and keeps the retracted WR/RB/RB figure visible as a correction rather '
    + 'than silently restating it — the wrong number is how the next reader '
    + 'learns the weights fallback existed',
  /Corrected 2026-08-14/.test(doc) && /D\.defaults/.test(doc)
    && /DEFAULT_WEIGHTS/.test(doc) && /MEASURED_WEIGHTS/.test(doc));
  ck('PATHS_MAX still bounds the panel at four, as stated',
    E.CFG.PATHS_MAX === 4 && /up to four \*directions\*/.test(doc), E.CFG.PATHS_MAX);
}

// ── 6b. THE TWO SURFACES ADDED TODAY, RE-DERIVED ────────────────────────
{
  const L = require(path.join(ROOT, 'public', 'js', 'draft', 'legality.js'));
  const S = { DEF: 1, FLEX: 1, K: 1, QB: 1, RB: 2, TE: 1, WR: 2 };
  const mk = (pos, i) => ({ player_id: 'x' + pos + i, name: pos + i, position: pos });
  const onesiesOpen = [mk('QB', 1), mk('RB', 1), mk('RB', 2), mk('WR', 1), mk('WR', 2),
    mk('TE', 1), mk('RB', 3)];

  ck('the document\'s claim that an open onesie never reads ILLEGAL is TRUE of '
    + 'the shipped module, at zero picks left',
  L.assess(onesiesOpen, S, 0).status === 'streamable',
  L.assess(onesiesOpen, S, 0).status);
  ck('and the picks-left clock the document says was missing is now on the '
    + 'streamable line', /0 picks left/.test(L.assess(onesiesOpen, S, 0).line),
  L.assess(onesiesOpen, S, 0).line);
  ck('the squeeze flag the document names actually exists and is signed correctly',
    L.assess(onesiesOpen, S, 8).onesieSqueeze === false
      && L.assess(onesiesOpen, S, 2).onesieSqueeze === true);
  ck('the document states the draft is not the lineup deadline, which is the '
    + 'mechanism that makes the rule right rather than merely chosen',
  /draft is not the lineup deadline/i.test(doc));
  ck('and prices the cost it does carry rather than calling it free',
    /costs two\s*drops/.test(doc) || /costs two drops/.test(doc));

  /* THE GAP CHART. The claim is that two of its terms cannot disagree — asserted
   * against the engine, not against the sentence in the document. */
  const pool = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'))
    .players.filter(p => p.proj_mean != null && p.adp != null)
    .sort((a, b) => a.adp - b.adp).slice(0, 60);
  let pairs = 0, sameDir = 0, worst = 0;
  for (let i = 0; i + 8 < pool.length && i < 40; i++) {
    const da = E.playerDollars(pool[i]), db = E.playerDollars(pool[i + 8]);
    const e = da.entry - db.entry, r = da.rs - db.rs;
    if (Math.abs(r) < 1e-12) continue;
    pairs++;
    if (Math.sign(e) === Math.sign(r)) sameDir++;
    worst = Math.max(worst, Math.abs(e / r - E.CFG.DG_ENTRY_K / E.CFG.DG_RS_K));
  }
  ck('CONTROL — real pairs measured for the gap claim', pairs >= 20, pairs);
  ck('the document\'s "39 of 39 same direction" claim holds — the two bars cannot '
    + 'disagree', sameDir === pairs && /39 of 39/.test(doc), { same: sameDir, of: pairs });
  ck('and its 1.7e-14 deviation claim is the right order of magnitude',
    worst < 1e-9 && /1\.7e-14/.test(doc), worst);
  ck('the document records that the chart was the half left unfixed, which is the '
    + 'lesson rather than the fix', /half you have to click/i.test(doc));
}

// ── 7. IT DOES NOT CLAIM TO BE A COMPLETE SWEEP ─────────────────────────
// A partial audit that reads as finished is worse than no audit: it retires the
// question. This is the assertion that keeps it honest.
{
  ck('the document names what it has NOT audited', /What I have NOT audited yet/.test(doc));
  ck('and says roughly how much is left, so the covered set cannot read as "all '
    + 'of them"', /20 more surfaces/.test(doc));
  ck('it states WHY the covered ones were covered — four because they decide a '
    + 'pick, the rest because the audit reached them',
  /four because they decide a pick/.test(doc));
  /* THE UNAUDITED LIST MUST SHRINK AS SURFACES ARE COVERED, or it becomes a
   * decoration that makes the document look honest while going stale — which is
   * this document's own defect class. The two audited today must be OFF it. */
  const notYet = (docRaw.split('What I have NOT audited yet')[1] || '').replace(/\s+/g, ' ');
  ck('CONTROL — the unaudited section is locatable and non-empty', notYet.length > 40,
    notYet.length);
  /* NAMED SURFACES, NOT A HARD-CODED EXAMPLE. My first version asserted "LRM
   * strip" was still outstanding — and went red the moment I audited it, which is
   * the assertion aging into a lie about its own subject. The invariant is that
   * the two lists are DISJOINT and the outstanding one is non-empty; which names
   * sit on which side is exactly what is supposed to change. */
  const AUDITED = ['legality strip', 'dollar-gap hero line', 'LRM strip', 'stack card',
    'movement line'];
  const stillListed = AUDITED.filter(n => new RegExp(n, 'i').test(notYet));
  ck('every surface with its own section has moved OFF the unaudited list — a '
    + 'list that never shortens is a decoration that makes the document look '
    + 'honest', stillListed.length === 0, stillListed);
  ck('and each of them really does have a section, so "removed from the list" '
    + 'never means "quietly dropped"',
  AUDITED.every(n => new RegExp(n.split(' ')[0], 'i').test(docRaw.split('What I have NOT audited yet')[0])),
  AUDITED.filter(n => !new RegExp(n.split(' ')[0], 'i')
    .test(docRaw.split('What I have NOT audited yet')[0])));
  ck('the outstanding list is still NON-EMPTY and named — the sweep is not '
    + 'finished and must not read as if it were',
  /manager panel/.test(notYet) && /shadow projection/.test(notYet), notYet.slice(0, 200));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the contract document is re-derived from the shipped');
console.log('engine — the weights, which zeros are measured versus unmeasured, the TERM');
console.log('SHARES (scored on an accumulating roster, because an empty one zeroes two of');
console.log('the four live terms), the dollar coefficients and their collinearity, and the');
console.log('paths bound. If the model moves');
console.log('and the document does not, this goes red rather than the document going quietly');
console.log('stale — which is how two of the three defects it describes came to exist.');
console.log('WHAT IT DOES NOT: check what B renders. That half is B\'s and is routed. A');
console.log('contract both sides agree with is the point; this only pins my side of it.');
