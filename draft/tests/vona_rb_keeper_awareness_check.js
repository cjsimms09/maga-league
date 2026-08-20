// E, 2026-08-20: Cory asked live, urgently, whether VONA is dynamically
// correct pick-to-pick, and whether the board is over-valuing RB or
// correctly pricing early RB value -- he has 2 RB keepers (Henry, Walker)
// + 1 WR keeper (Chase) already, and the board recommends RB at his first
// real pick (round 4, pick 33). This checks the actual mechanism: does
// starterSlotMarginal() see his keepers and correctly treat a 3rd RB as
// competing for FLEX (discounted, priced against the best available WR/TE
// alternative) rather than as filling an empty "starter" slot -- and if it
// does, is RB still winning on legitimate flex-marginal value, not on a
// roster-awareness bug.
const { launchChromium } = require('./rehearsal-browser');
const BASE = process.env.WR_BASE || 'http://localhost:8925';

(async () => {
  const b = await launchChromium();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name=username]', process.env.WR_USER || 'cory');
  await page.fill('input[name=password]', process.env.WR_PASS || 'pw');
  await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
  await page.goto(`${BASE}/admin/warroom`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);

  const keeperCheck = await page.evaluate(() => {
    const st = window.__warroom.state;
    return {
      myRosterCount: (st.myRoster || []).length,
      myRoster: (st.myRoster || []).map(p => ({ name: p.name, position: p.position })),
      keptPlayersOnBoard: (st.data.kept_players || []).map(p => p.name),
    };
  });
  console.log('KEEPER SEED CHECK (at boot, before any picks):');
  console.log(JSON.stringify(keeperCheck, null, 2));

  // Now check what recommend()/context() actually returns for the top
  // available RB and top available WR RIGHT NOW (pre-draft state, keepers
  // already on roster via populateKeepers at boot) -- reading the engine's
  // OWN internal fills/marginal classification, not re-deriving it.
  // Advance the mock to Cory's actual first real pick via the REAL pick-
  // ingestion path (pushPicks == onSyncPicks, exactly what a live Sleeper
  // sync calls) -- not a direct state mutation, so this also tests whether
  // the recommendation genuinely reacts to picks landing one at a time, per
  // Cory's first question. His draft slot is 8 of 10, snake, rounds 1-3 are
  // his 3 keeper slots (occupied, not synced) -- so 29 real opponent picks
  // land before his first live selection at overall pick 33.
  const advance = await page.evaluate(() => {
    const st = window.__warroom.state;
    const mySlot = st.data.league.my_draft_slot;
    const order = st.data.pick_order.picks; // [{overall, round, slot, keeper_slot}]
    const myKeeperSlots = new Set(
      order.filter(p => p.slot === mySlot && p.overall <= 32).map(p => p.overall));
    const oppPickSlots = order.filter(p => p.overall <= 32 && !myKeeperSlots.has(p.overall));
    const pool = (st.board || [])
      .filter(p => p.position !== 'K' && p.position !== 'DEF')
      .sort((a, b) => (b.vorp || 0) - (a.vorp || 0));
    const fakePicks = oppPickSlots.map((slotInfo, i) => ({
      player_id: pool[i].player_id,
      pick_no: slotInfo.overall,
      draft_slot: slotInfo.slot,
      roster_id: slotInfo.slot,
      metadata: { first_name: pool[i].name.split(' ')[0], last_name: pool[i].name.split(' ').slice(1).join(' '), position: pool[i].position },
    }));
    window.__warroom.pushPicks(fakePicks);
    return { pushedCount: fakePicks.length, myKeeperSlots: [...myKeeperSlots],
             draftedAfter: st.drafted.size, boardLenAfter: st.board.length,
             mySlot: mySlot };
  });
  console.log('\nADVANCED via real pick-ingestion path:', JSON.stringify(advance, null, 2));
  await page.waitForTimeout(800);

  const rec = await page.evaluate(() => {
    const st = window.__warroom.state;
    const lc = st.lastClock;
    if (!lc || !lc.scored) {
      return { error: 'state.lastClock.scored not populated yet', lastClockKeys: lc ? Object.keys(lc) : null };
    }
    const detail = lc.scored.slice(0, 20).map(s => ({
      name: s.player ? s.player.name : s.name,
      position: s.player ? s.player.position : s.position,
      score: s.score,
      vona: s.components ? s.components.vona : undefined,
      vorp: s.player ? s.player.vorp : undefined,
      need_fills: s.components ? s.components.need_fills : undefined,
    }));
    // Rank-by-score (what the board actually shows) vs rank-by-vorp (what a
    // VBD-inclusive ranking would show) on the same candidate pool, to see
    // if adding VORP back in would visibly reorder the top of the board --
    // a quick, honest check before reporting a hypothesis as a finding.
    const byScore = detail.map(d => d.name);
    const byVorp = detail.slice().sort((a, b) => (b.vorp || 0) - (a.vorp || 0)).map(d => d.name);
    return { top20: detail, byScore, byVorp };
  });
  console.log('\nRECOMMENDATION CHECK (pre-draft, keepers seeded):');
  console.log(JSON.stringify(rec, null, 2));

  await b.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
