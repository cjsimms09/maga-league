/* ROOM-SWITCH DRESS REHEARSAL — the defect Cory hit live on 2026-08-17.
 *
 * Mock #1 ends, Sleeper garbage-collects it, the page auto-resumes its 150
 * picks, and connecting mock #2's id used to do NOTHING about either: the
 * orphaned poller kept the dead room's 404 banner on the status line, and the
 * old room's 150 drafted ids kept pricing the new room's board — every
 * top-of-board surface showed scrubs ("it's not showing any players").
 *
 * NOT IN THE DEFAULT SUITE (needs the rehearsal server + Chromium), same as
 * rehearsal-mock3.js. Run:
 *     node draft/tests/rehearsal-serve.js &
 *     node draft/tests/room-switch-rehearsal.js
 * Green = after the confirm click, the rail shows the real top of the board
 * and sync-status tracks the NEW room.
 */
'use strict';
const path = require('path');
const { launchChromium } = require('./rehearsal-browser');
const fs = require('fs');

const BASE = process.env.WR_BASE || 'http://localhost:8925';
const ART = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', '..', 'public', 'draft_data.json'), 'utf8'));

// board sorted by overall rank = a plausible ADP-follower room
const byRank = ART.players.filter(p => p.proj_mean > 0)
  .sort((a, b) => (a.overall_rank || 1e9) - (b.overall_rank || 1e9));

const TEAMS = 10, ROUNDS = 15;
const DRAFT_ID = '987654321012345678';

function slotForPick(no) { // snake
  const r = Math.floor((no - 1) / TEAMS), i = (no - 1) % TEAMS;
  return r % 2 === 0 ? i + 1 : TEAMS - i;
}

let served = 0; // number of picks the fake room has made
const takenIds = [];
function makePicks(n) {
  // room drafts straight down the rank list, skipping nothing (mock bots
  // draft keepers too — that is the scenario). Seat 8's picks are ALSO bot
  // picks unless the harness "takes" for him; sleeper mock bots autopick.
  const picks = [];
  let idx = 0;
  for (let no = 1; no <= n; no++) {
    const p = byRank[idx++];
    picks.push({
      pick_no: no,
      round: Math.floor((no - 1) / TEAMS) + 1,
      draft_slot: slotForPick(no),
      player_id: String(p.player_id),
      metadata: { first_name: (p.name || '').split(' ')[0], last_name: (p.name || '').split(' ').slice(1).join(' '), position: p.position },
    });
  }
  return picks;
}

const draftMeta = () => ({
  draft_id: DRAFT_ID, type: 'snake', status: 'drafting',
  settings: { teams: TEAMS, rounds: ROUNDS, slots_qb:1 },
  draft_order: null, // mock lobby: often null / partial
  season: '2026', sport: 'nfl',
});

(async () => {
  const b = await launchChromium();
  const ctx = await b.newContext({ viewport: { width: 1000, height: 950 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  const serve = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  const handler = (route) => {
    const u = route.request().url();
    const dec = decodeURIComponent(u);
    if (dec.includes('/draft/' + DRAFT_ID + '/picks')) return serve(route, makePicks(served));
    if (dec.includes('/draft/' + DRAFT_ID)) return serve(route, draftMeta());
    return route.continue();
  };
  await page.route('**/api.sleeper.app/**', handler);
  await page.route('**/admin/sleeper-proxy**', handler);

  // login
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[name=username]', 'cory');
  await page.fill('input[name=password]', 'pw');
  await page.click('button[type=submit], input[type=submit]');
  await page.waitForLoadState('domcontentloaded');

  await page.goto(BASE + '/admin/warroom#tab=draft', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // set seat 8, connect sync at pick 31 synced (like his screenshot)
  served = 31;
  await page.goto(BASE + '/admin/warroom#tab=intel', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach(d => { d.open = true; });
    const t = document.querySelector('[data-tab=intel], #wr-tabbtn-intel, a[href="#tab=intel"], button[data-wrtab=intel]');
    if (t) t.click();
  });
  await page.waitForTimeout(800);
  await page.fill('#slot-input', '8');
  await page.click('#slot-apply');
  await page.fill('#draft-id', DRAFT_ID);
  await page.click('#start-sync');
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    const t = document.querySelector('[data-tab=draft], a[href="#tab=draft"], button[data-wrtab=draft]');
    if (t) t.click(); else location.hash = '#tab=draft';
  });
  await page.waitForTimeout(1500);

  const snap = async (label) => {
    const s = await page.evaluate(() => {
      const q = (sel) => document.querySelectorAll(sel).length;
      const txt = (sel) => { const e = document.querySelector(sel); return e ? e.textContent.trim().slice(0, 140) : null; };
      return {
        recRows: q('.rec-row, .rec-card, [class*="rec-row"]'),
        shortlistText: txt('#recs-card') || txt('#recommendations'),
        pickState: txt('#pick-state, .pick-state, [id*=pickstate]'),
        syncStatus: txt('#sync-status'),
        boardCount: (window.__wrDebug && window.__wrDebug.boardCount) || null,
        emptyMsgs: [...document.querySelectorAll('p.muted')].map(e => e.textContent.trim()).filter(t => /empty/i.test(t)),
      };
    });
    console.log('--- ' + label + ' ---');
    console.log(JSON.stringify(s, null, 1));
  };

  await snap('pick 31 synced (his screenshot state)');
  await page.screenshot({ path: path.join(__dirname, 'repro-p31.png'), fullPage: false });

  // advance: room reaches his pick 33 and he does nothing; sleeper autopicks him; go to 60
  served = 60;
  await page.waitForTimeout(6000);
  await snap('pick 60 synced');
  await page.screenshot({ path: path.join(__dirname, 'repro-p60.png'), fullPage: false });

  // deep: 100
  served = 100;
  await page.waitForTimeout(6000);
  await snap('pick 100 synced');

  // mock COMPLETES: all 150 picks in
  served = 150;
  await page.waitForTimeout(6000);
  await snap('pick 150 — mock complete');

  // he reloads the page (auto-resume fires), old draft now 404s at Sleeper,
  // then connects a NEW mock at pick 3
  await page.unroute('**/api.sleeper.app/**');
  await page.unroute('**/admin/sleeper-proxy**');
  const DRAFT2 = '111222333444555666';
  let served2 = 3;
  const handler2 = (route) => {
    const dec = decodeURIComponent(route.request().url());
    if (dec.includes('/draft/' + DRAFT2 + '/picks')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makePicks(served2)) });
    if (dec.includes('/draft/' + DRAFT2)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.assign(draftMeta(), { draft_id: DRAFT2 })) });
    if (dec.includes('/draft/' + DRAFT_ID)) return route.fulfill({ status: 404, contentType: 'application/json', body: 'null' });
    return route.continue();
  };
  await page.route('**/api.sleeper.app/**', handler2);
  await page.route('**/admin/sleeper-proxy**', handler2);

  await page.goto(BASE + '/admin/warroom#tab=draft', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await snap('after reload — auto-resume state');
  await page.screenshot({ path: path.join(__dirname, 'repro-resume.png'), fullPage: true });

  await page.goto(BASE + '/admin/warroom#tab=intel', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
  await page.fill('#draft-id', DRAFT2);
  await page.click('#start-sync');
  await page.waitForTimeout(1000);
  console.log('after 1st click:', await page.evaluate(() => (document.querySelector('#sync-status') || {}).textContent));
  await page.click('#start-sync');   // confirm the room switch
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    const t = document.querySelector('[data-tab=draft], a[href="#tab=draft"]');
    if (t) t.click(); else location.hash = '#tab=draft';
  });
  await page.waitForTimeout(2000);
  await snap('NEW mock connected at pick 3');
  const names = await page.evaluate(() => {
    const rail = [...document.querySelectorAll('#wr-rail li, .wr-rail li, [class*=rail] li')].slice(0, 6).map(e => e.textContent.trim().slice(0, 30));
    const short = [...document.querySelectorAll('.rec-name, [class*=rec] b, [class*=rec] strong')].slice(0, 6).map(e => e.textContent.trim().slice(0, 30));
    return { rail, short, syncStatus: (document.querySelector('#sync-status') || {}).textContent };
  });
  console.log('post-switch names:', JSON.stringify(names, null, 1));
  await page.screenshot({ path: path.join(__dirname, 'repro-newmock.png'), fullPage: true });

  console.log('page errors:', JSON.stringify(errs.slice(0, 20), null, 1));
  await b.close();
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(2); });
