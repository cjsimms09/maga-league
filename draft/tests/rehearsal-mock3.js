/* MOCK #3 DRESS REHEARSAL — drive the war room in a browser and check the
 * things that actually broke mocks #1 and #2.
 *
 * THIS IS NOT A UNIT TEST AND IT IS NOT IN THE DEFAULT SUITE. It needs a dev
 * server and a real Chromium, and it drives the page the way a person does. Its
 * value is that every unit suite was GREEN while three live defects sat in the
 * console — it exists to catch what module tests structurally cannot.
 *
 * Run:
 *   PORT=8925 node dev-server.js &
 *   WR_USER=<owner> WR_PASS=<password> node draft/tests/rehearsal-mock3.js
 *
 * WHAT IT FOUND ON ITS FIRST RUN (all three now fixed, each with a unit test):
 *   1. attribution.markLocal discarded a SEATLESS mark entirely, so tapping
 *      "✕ he is gone" never entered state.drafted and any board rebuild
 *      resurrected the player. Caught by the shared-state audit's INVARIANT 2
 *      firing live: "3 off the board != 1 picks + 3 keepers".
 *   2. FOUR ledger kinds were emitted by the client and registered nowhere
 *      (shadow_pick, shadow_freeze, pick_reconciled, correction), so every one
 *      of those decision-time records 400'd and was lost.
 *   3. Marking one opponent pick blocked the main thread for ~6 SECONDS. See
 *      survival-memo.test.js; now ~1.9s, with the remainder in PARKED.md #11.
 *
 * A NOTE ON CLASSIFYING NOISE. Defects 1 and 2 were invisible until the fonts
 * CDN failure was classified by URL instead of by console text. Two real errors
 * were hiding behind noise that "everybody knew about". Classify precisely, or
 * the filter you add to quiet a known problem silences the unknown one too.
 */
const { launchChromium } = require('./rehearsal-browser');
const BASE = process.env.WR_BASE || 'http://localhost:8925';

const R = [];
const check = (name, cond, detail) => R.push({ name, ok: !!cond, detail });

(async () => {
  const b = await launchChromium();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  // A console "Failed to load resource" carries no URL, so it cannot be told
  // apart from a real fault. requestfailed does carry one — classify there.
  const netFail = [];
  // A navigation ABORTS in-flight favicon fetches (login → warroom), and the
  // abort is reported as requestfailed on the same-origin /icons/ URL — the
  // asset itself serves 200 (verified by hand). Classify the abort, keep every
  // other failed request loud.
  page.on('requestfailed', r => {
    if (/\/icons\/[a-z0-9-]+\.png/.test(r.url())
        && /aborted|ABORTED/i.test((r.failure() || {}).errorText || '')) return;
    netFail.push(r.url());
  });
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(m.text())) return;   // classified via netFail
    // A dev store has no ledger endpoint: predledger PARKS its records for
    // replay and announces that via console.error. Designed offline behavior
    // (red at the merge baseline too), classified by its exact prefix so any
    // OTHER console error still fails the rehearsal.
    if (/^\[predledger\] \d+ record\(s\) UNSENT and parked for replay/.test(m.text())) return;
    // THE SHARED-STATE AUDIT CATCHING THIS REHEARSAL'S OWN OUT-OF-TURN PICK.
    // The roster-path scenario below deliberately takes a player as "me" while
    // the room clock is not on my seat; the pick-state audit flags exactly
    // that ("[roster marked] N picks != [my_picks < clock] M made") — the
    // audit WORKING, triggered by the test's own action. Classified by its
    // exact shape; any other pick-state message still fails.
    if (/^\[pick-state\] \[roster marked\] \d+ picks != \[my_picks < clock\] \d+ made/.test(m.text())) return;
    errs.push('console: ' + m.text());
  });

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name=username]', process.env.WR_USER || 'cory');
  await page.fill('input[name=password]', process.env.WR_PASS || '');
  await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
  await page.goto(`${BASE}/admin/warroom`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);

  // ---- LAYERS + LRM ABOVE THE FOLD ----------------------------------------
  const layout = await page.evaluate(() => {
    const top = s => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top) : null; };
    return { l2: document.getElementById('layer-2').open,
             l3: document.getElementById('layer-3').open,
             lrmInL1: !!document.querySelector('.wr-zone1 #lrm-strip'),
             lrmTop: top('#lrm-card'), recsTop: top('#recs-card'),
             cards: document.querySelectorAll('.card').length };
  });
  /* EXPECTATION UPDATED TO THE SHELL'S CURRENT DOCTRINE (2026-08-15, red at
   * the merge baseline too): Cory's directive moved THE RECOMMENDATION to the
   * top of the fold ("the recommendation + Take buttons come first") and CSS
   * `order` deliberately places #lrm-card BELOW #recs-card (style.css zone-1
   * order table). What must hold now: the deadline strip lives IN the decide
   * surface (zone 1), not in a fold-away — above-the-recs was the OLD layout. */
  check('LRM deadline lives in the decide surface (zone 1, per the current fold doctrine)',
        layout.lrmInL1 && layout.lrmTop != null && layout.recsTop != null, JSON.stringify(layout));
  // Layer 3's depth FOLLOWS THE MODE: a reference under live sync, an input
  // device in manual/rehearsal where every opponent pick is typed on it.
  const mode = await page.evaluate(() => (document.querySelector('.ss-mode')||{}).textContent);
  check('Layer 3 depth follows the mode (input device in manual, reference in live)',
        layout.l2 === true && layout.l3 === (mode !== 'LIVE'), 'mode=' + mode + ' l3open=' + layout.l3);
  /* 17 → 18 (2026-08-15): the census was already 18 at today's merge baseline
   * (measured by running this rehearsal at 37b1a307 before the design pass —
   * the shell gained a card in the merged work, not in the redesign). The
   * design pass itself added ZERO cards: the verdict block, tier-cliff chart
   * and help view are deliberately not .card so this census stays meaningful.
   * 18 → 19 (2026-08-16): the ADP-movers card (Cory: "a small screen on war
   * room showing the top 10 ADP movers up and top 10 down") joined the Zone-2
   * rail — one real card added by warroom.ejs, counted the day it landed.
   * 19 → 18 (2026-08-17, B): NOT a deletion. Cory's "easily see the last 5-8
   * picks" ask moved the Recent Picks card from ROSTERS (a plain .card) to
   * the top of the DRAFT tab's right rail — restyled as a .wr-railcard to
   * match the other rail cards it now sits beside (Running Out, Tier Cliffs,
   * Survival), so it no longer matches this census's own selector. The
   * content and the element both still exist; only the class changed, on
   * purpose, per the design language already governing that rail. */
  check('nothing was deleted — 18 .card elements survive the restructure (+1 .wr-railcard the census does not count, see above)', layout.cards === 18, 'cards=' + layout.cards);

  // ---- SEAT IDENTITY (mock #1 severity-1) ---------------------------------
  const seat = await page.evaluate(() => window.__wrDiag());
  check('seat resolves and audits clean', seat.seat && seat.audit && seat.audit.ok !== false,
        JSON.stringify(seat.audit || seat.seat));
  check('seat identity names its SOURCE (never a silent guess)', !!(seat.seat && seat.seat.source), JSON.stringify(seat.seat));

  // ---- DRIVE THE DRAFT IN MANUAL MODE -------------------------------------
  // Mark other teams' picks off the board, and take mine when it is my turn.
  // #hdr-pick, NOT a body regex: the page says "pick 41" in survival prose and
  // "pick 34" in the branch header, and the first match is neither the clock.
  const clockAt = () => page.evaluate(() => {
    const m = (document.getElementById('hdr-pick').textContent || '').match(/(\d+)/);
    return m ? Number(m[1]) : null;
  });

  const before = await clockAt();
  const takeOther = async (n) => {
    let done = 0;
    for (let i = 0; i < n; i++) {
      const ok = await page.evaluate(() => {
        const b = document.querySelector('#board-body button[data-draft-other]');
        if (!b) return false;
        b.click();
        return true;
      });
      if (!ok) break;
      done++;
      await page.waitForTimeout(150);
    }
    return done;
  };
  const marked = await takeOther(6);
  await page.waitForTimeout(400);
  const after = await clockAt();
  /* THE EXPECTATION FOLLOWED currentPick()'s OWN CONTRACT (2026-08-15). The
   * old assertion (`after - before === marked`) predates the prep-anchor fix:
   * with NO sync and NO recorded pick the clock anchors to MY FIRST PICK
   * (before = 33, the prep board), and "the moment a pick lands anywhere …
   * the room's clock takes over" (currentPick's doc, verbatim) — so after six
   * recorded events the room clock reads events+1 = 7, NOT 39. Measured red
   * at the merge baseline too, so this was a stale expectation, not a
   * redesign regression. What must hold: the clock MOVES off the anchor and
   * counts the marks. */
  // B's 2026-08-17 rehearsal find: the fallback clock broke on the FIRST take
  // when ONLY my own pick is marked (no opponent marks) — pickEvents=1 read
  // "pick 2" while the pick landed at overall 33. The fix bounds the manual
  // clock below by my last recorded slot + 1. Reproduced here in the real UI:
  // hard-reset, take mine with zero opponent marks, read the clock.
  await page.evaluate(() => { const b = document.getElementById('end-draft'); if (b) b.click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const i = document.getElementById('ec-input');
    if (i) { i.value = 'END'; i.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const g = document.getElementById('ec-go');
    if (g && !g.disabled) g.click();
  });
  await page.waitForTimeout(1200);
  const firstTakeClock = await page.evaluate(() => {
    const before = (window.__wrDiag && window.__wrDiag().clock) || null;
    const take = document.querySelector('#verdict-block .btn.gold')
      || document.querySelector('.wrv-take, #clock-take');
    if (take) take.click();
    return new Promise(r => setTimeout(() => {
      const d = window.__wrDiag ? window.__wrDiag() : {};
      r({ before: before, after: d.clock || null, myFirst: (d.myPicks || [])[0] || null });
    }, 600));
  });
  check('FALLBACK CLOCK: first solo take moves the clock PAST my slot, not to pick 2',
    firstTakeClock.after == null || firstTakeClock.myFirst == null
      || firstTakeClock.after > firstTakeClock.myFirst,
    JSON.stringify(firstTakeClock));

  check('THE CLOCK ADVANCES in manual mode (mock #2 froze at 34)',
        before != null && after != null && after !== before && after === marked + 1,
        `before=${before} after=${after} marked=${marked}`);

  // Internal pick-state invariants — the single source of truth.
  const ps = await page.evaluate(() => (window.__pickState ? window.__pickState() : null));

  // ---- TAKE A PLAYER MYSELF (the roster path) -----------------------------
  const mine0 = (await page.evaluate(() => window.__wrDiag().myRoster.length));
  await page.evaluate(() => {
    const b = document.querySelector('#board-body button[data-draft-me]');
    if (b) b.click();
  });
  await page.waitForTimeout(1200);
  const mine1 = (await page.evaluate(() => window.__wrDiag().myRoster.length));
  check('"➕ Me" from the BOARD lands on my roster (mock #2: only recs had it)',
        mine1 === mine0 + 1, `${mine0} -> ${mine1}`);

  // ---- LEGALITY (mock #2 severity-1: exited with no DEF) -------------------
  /* ⚠️ `e.style.display` READS THE INLINE STYLE ONLY, and that is the trap B
   * surfaced from its own sweep: it flagged twenty unlabelled buttons on this
   * markup and correctly did NOT report them, because they were
   * visibility-hidden — elements that keep their layout box and return an EMPTY
   * innerText.
   *
   * The class generalises past B's sweep to any harness reading rendered output,
   * including this one. A hidden element is PRESENT in the DOM and ABSENT from
   * every text-based check, so:
   *   · a check asserting text is PRESENT fails loudly (safe),
   *   · a check asserting text is ABSENT passes wrongly (silent), and
   *   · a `shown` flag read off the inline style calls a class-hidden element
   *     visible.
   *
   * So visibility is read from getComputedStyle and reported as its own field
   * rather than inferred from empty text. */
  const leg = await page.evaluate(() => {
    const e = document.getElementById('legality-strip');
    if (!e) return null;
    const cs = window.getComputedStyle(e);
    return {
      shown: cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0',
      hidden_but_present: cs.display !== 'none'
        && (cs.visibility === 'hidden' || cs.opacity === '0'),
      text: (e.innerText || '').slice(0, 240),
    };
  });
  check('the legality strip is not PRESENT-BUT-INVISIBLE (empty text would read as absent)',
        leg === null || !leg.hidden_but_present, JSON.stringify(leg));
  check('the legality strip exists and is wired', leg !== null, JSON.stringify(leg));

  const exitWarn = await page.evaluate(() => {
    if (typeof DraftLegality === 'undefined') return null;
    // 13 skill players, no K, no DEF — the exact mock-#2 exit.
    const roster = Array.from({ length: 13 }, (_, i) => ({ position: ['RB','WR','QB','TE'][i % 4] }));
    const starters = (window.__starters) || { QB:1, RB:2, WR:2, TE:1, FLEX:1, K:1, DEF:1 };
    return DraftLegality.exitSummary(roster, starters, 0);
  });
  check('exiting with NO DEF and NO K produces an explicit exit warning',
        exitWarn && JSON.stringify(exitWarn).includes('DEF'), JSON.stringify(exitWarn));

  // ---- THE DEVIATION BADGE ------------------------------------------------
  const badge = await page.evaluate(() => {
    if (typeof DraftDeviation === 'undefined') return { missing: true };
    const p = { player_id: '1', name: 'X', position: 'RB', adjusted_adp: 78, adp_sd: 6, adp_source: 'ffc' };
    const mk = (w, at) => DraftDeviation.badge({ player: p, score: 100, components: { weighted: w } }, at, 4);
    const el = document.querySelector('.dv') || document.querySelector('.dv-sum');
    return {
      silentOnMarketPick: mk({ tier: 9 }, 76) === null,
      loudOnDeviation: !!mk({ tier: 9 }, 64),
      tierFromEvidence: mk({ value: 40 }, 38).tier === 'LEAN' && mk({ ceiling: 9 }, 72).tier === 'LIKELY',
      mounted: !!el,
      liveText: el ? (el.innerText || '').slice(0, 160) : null,
    };
  });
  check('the badge is SILENT inside the noise band', badge.silentOnMarketPick, JSON.stringify(badge));
  check('the badge speaks on a real deviation, with ⚡ override', badge.loudOnDeviation);
  check('tier comes from EVIDENCE: a 40-pick untested reach < a 6-pick moderate one', badge.tierFromEvidence);
  // The badge is silent on market picks BY DESIGN, so its absence is only a
  // defect if the render path is missing — check the path, not the presence.
  const wired = await page.evaluate(() => ({
    fnPresent: typeof DraftDeviation !== 'undefined',
    styled: !!Array.from(document.styleSheets).some(ss => { try {
      return Array.from(ss.cssRules).some(r => (r.selectorText||'').includes('.dv-tier'));
    } catch (e) { return false; } }),
    rendered: document.querySelectorAll('.dv').length,
  }));
  check('the badge render path is wired and styled (silence is a valid render)',
        wired.fnPresent && wired.styled, JSON.stringify(wired));

  // ---- SESSION LIFECYCLE + HARD RESET (mock #1: hang with no number) -------
  const sess = await page.evaluate(() => ({
    hasReset: !!document.getElementById('hard-reset'),
    hasEnd: !!document.getElementById('end-draft'),
    lib: typeof DraftSession !== 'undefined',
    report: window.__wrDiag().session,
  }));
  check('hard reset + end-draft are reachable, session lib loaded',
        sess.hasReset && sess.hasEnd && sess.lib, JSON.stringify(sess));

  // ---- PATH LABELS BY MECHANISM (mock #2) ---------------------------------
  const paths = await page.evaluate(() => {
    const e = document.getElementById('paths') || document.querySelector('#recs-card');
    return e ? (e.innerText || '').slice(0, 400) : null;
  });
  check('paths render text (labels are mechanism-named, verified in engine.test.js)',
        !!paths && paths.length > 20, (paths || '').slice(0, 120));

  // ---- NO CONSOLE ERRORS THROUGH THE WHOLE RUN ----------------------------
  const realNet = [...new Set(netFail)].filter(u => !/fonts\.googleapis|fonts\.gstatic/.test(u));
  check('no page errors across the entire rehearsal', errs.length === 0, errs.slice(0, 3).join(' | '));
  check('no failed requests except the fonts CDN (sandbox egress — PARKED #13)',
        realNet.length === 0, realNet.slice(0, 3).join(' | '));
  check('the ONLY blocked host is the fonts CDN (proves the classification above)',
        netFail.length > 0 ? [...new Set(netFail)].every(u => /fonts\.g/.test(u)) : true,
        [...new Set(netFail)].join(' | '));

  console.log('\nMOCK #3 DRESS REHEARSAL');
  console.log('='.repeat(72));
  let bad = 0;
  for (const r of R) {
    if (!r.ok) bad++;
    console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok || !r.detail ? '' : '\n        -> ' + r.detail));
  }
  console.log('='.repeat(72));
  console.log(`${R.length - bad}/${R.length} rehearsal checks passed`);
  if (ps) console.log('pickState: ' + JSON.stringify(ps));
  await b.close();
  process.exit(bad ? 1 : 0);
})();
