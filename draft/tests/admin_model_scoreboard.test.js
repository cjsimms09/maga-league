'use strict';
// TERRITORY: A
// THE MODEL SCOREBOARD + CONTROL PANEL (/admin/model-scoreboard) — Cory's
// 2026-08-16 asks: a Cory-only scoreboard of the models (ours + Sleeper + FP),
// a way to switch the site's projection source, and hover info so every number
// explains itself. Claims under test:
//   1. Cory sees it; a plain member is refused on the page AND the control;
//   2. pre-season empty state is honest ("no grades yet"), never fake rows;
//   3. with a synthetic grades ledger the table numbers ARE the ledger's
//      numbers (no recomputation drift), champion + formula named, promotion
//      history and top misses rendered;
//   4. the source control round-trips: POST writes model_controls, the page
//      shows the new state with a confirmation naming the consumer, and
//      src/proj_feed.js — the consuming seam — provably changes behavior;
//   5. an invalid source is refused, not half-applied;
//   6. every control/column carries a plain-language tooltip.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'msb-'));
// Point the page at a scratch weekly_own dir BEFORE the app loads.
const OWN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'msb-own-'));
process.env.OWN_WEEKLY_DIR = OWN_DIR;
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const PF = require(path.join(ROOT, 'src', 'proj_feed'));
const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

const LEDGER = {
  _territory: 'TERRITORY: A',
  season: 2026,
  champion: { version: 'own_weekly_v1', arm: 'v1', since_week: null },
  active_arms: [
    { name: 'v1', divisor: 17, tilt_scale: 1.0, formula: 'proj_ownmodel/17 * (1 + vg[pos]*(implied_team-mean_implied)/mean_implied), vg from V5_CONFIG' },
    { name: 'v1_notilt', divisor: 17, tilt_scale: 0.0, formula: 'proj_ownmodel/17 (no vegas tilt)' },
  ],
  promotions: [{
    type: 'promotion',
    from: { version: 'own_weekly_v1', arm: 'v1' },
    to: { version: 'own_weekly_v2', arm: 'v1_notilt' },
    promoted_at: '2026-10-06',
    evidence: { recent_wins: '3 of last 3', cum_mae: 4.417, champion_cum_mae: 5.211, weeks_used: [1, 2, 3], per_week: {} },
  }],
  weeks: {
    1: {
      graded_at: '2026-09-15', snapshot: 'own_weekly_2026_w1.json',
      formula: 'own_weekly_v1', champion_arm: 'v1',
      population: { projected: 364, with_actual: 351, no_stat_row: { count: 13, player_ids: [] } },
      own_arms: {
        v1: { n: 351, mae: 5.211, spearman: 0.4321, per_pos: {} },
        v1_notilt: { n: 351, mae: 4.417, spearman: 0.4444, per_pos: {} },
      },
      providers: {
        sleeper: {
          own_population: { n: 460, mae: 4.9, spearman: 0.51, per_pos: {} },
          shared_with_ours: { n: 351, note: 'identical players; comparable cells',
            sleeper: { n: 351, mae: 4.777, spearman: 0.52, per_pos: {} },
            own_champion: { n: 351, mae: 5.211, spearman: 0.4321, per_pos: {} } },
          population_note: 'provider archive ∩ actuals n=460; ours n=351; shared n=351 — different populations are labeled, never mixed',
        },
      },
      top_misses: [{ player_id: '9221', name: 'Jahmyr Gibbs', pos: 'RB', proj: 14.14, actual: 31.2, err: -17.06 }],
      miss_pattern: '1 of 1 top misses were UNDER (real blow-ups we missed)',
      rows: {},
    },
  },
};

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  const member = owners.find(o => o.username !== 'cory' && o.active);
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  member.password_hash = hashPassword('pw'); member.must_change_password = false; member.is_commissioner = false;
  await store.set('owners', owners);
  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const login = async u => cookieFrom(await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `username=${u}&password=pw`, redirect: 'manual' }));
  const cc = await login('cory');

  // ── 2. the honest empty state (no ledger file yet) ────────────────────────
  let res = await fetch(b + '/admin/model-scoreboard', { headers: { Cookie: cc } });
  let html = await res.text();
  ck('renders 200 for Cory before any grades exist', res.status === 200);
  ck('no template error', !/ReferenceError|is not defined|Cannot read/.test(html));
  ck('empty state says no grades yet and dates the first real grade',
    /No grades yet/.test(html) && /~Sep 15/.test(html));
  ck('empty state fakes no scoreboard rows', !/Cumulative scoreboard/.test(html));
  ck('the absent proj_mean knob is explained (REC-2, January 2027)',
    /REC-2/.test(html) && /January 2027/.test(html));
  ck('tooltips present for header, adaptation, source control (WHAT/READ/DO contract)',
    (html.match(/class="tip"/g) || []).length >= 4 && /WHAT:/.test(html) && /READ:/.test(html) && /DO:/.test(html));
  ck('champion named with default version', /own_weekly_v1/.test(html));
  ck('adaptation shown ON by default with the verbatim thresholds',
    /Auto-adaptation:\s*[\s\S]*<b>ON<\/b>/.test(html) && /3 of the last 4/.test(html));

  // ── 3. with a synthetic ledger, the numbers ARE the ledger's ─────────────
  fs.writeFileSync(path.join(OWN_DIR, 'grades_2026.json'), JSON.stringify(LEDGER));
  res = await fetch(b + '/admin/model-scoreboard', { headers: { Cookie: cc } });
  html = await res.text();
  ck('week table carries the ledger MAEs verbatim',
    html.includes('>5.211<') && html.includes('>4.417<'), 'expected 5.211 and 4.417');
  ck('provider arm shown on the shared population (4.777), not its own-population number in the shared column',
    html.includes('>4.777<'));
  ck('cumulative table labels providers as study arms, never auto-promoted',
    /study \(never auto-promoted\)/.test(html));
  ck('population column is graded/projected with the no-stat-row note in a tooltip',
    html.includes('351 / 364') && /no stat row/.test(html));
  ck('promotion history renders the mechanical switch with its evidence',
    /mechanical promotion/.test(html) && /own_weekly_v2/.test(html) && /3 of last 3/.test(html));
  ck('top misses render by name with signed error',
    /Jahmyr Gibbs/.test(html) && html.includes('-17.06'));
  ck('miss pattern sentence is on the page', /real blow-ups we missed/.test(html));
  ck('champion formula quoted from the ledger, not re-derived',
    /vg from V5_CONFIG/.test(html));

  // ── 4. the source switch round-trips into the consuming seam ────────────
  ck('default state shows blend as current', /now: <b>blend<\/b>/.test(html));
  let post = await fetch(b + '/admin/model-scoreboard/source', {
    method: 'POST', redirect: 'manual',
    headers: { Cookie: cc, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'source=sleeper' });
  ck('POST redirects back with the saved confirmation', post.status === 302
    && /saved=sleeper/.test(post.headers.get('location') || ''));
  const mc = await (async () => {
    const { getDoc } = require(path.join(ROOT, 'src', 'data'));
    return getDoc('model_controls', {});
  })();
  ck('model_controls doc now carries the source', mc.projection_source === 'sleeper');
  ck('the switch is in the doc history (who/when/what)',
    Array.isArray(mc.history) && mc.history.length === 1
    && mc.history[0].set.projection_source === 'sleeper' && !!mc.history[0].at);
  // THE SEAM: proj_feed — the one consumer — derives differently under the doc.
  const player = { player_id: '1', proj_mean: 170, proj_sleeper: 187, proj_fantasypros: 153 };
  const before = PF.weekly(player, { source: 'blend' });
  const after = PF.weekly(player, { source: PF.sourceFromControls(mc) });
  ck('the consuming seam provably changes behavior under the stored setting',
    before.proj === 10 && after.proj === 11
    && after.basis === 'season_rate:proj_sleeper/17',
    JSON.stringify({ before, after }));
  res = await fetch(b + '/admin/model-scoreboard?saved=sleeper', { headers: { Cookie: cc } });
  html = await res.text();
  ck('page shows the new current state and names the consumer in the confirmation',
    /now: <b>sleeper<\/b>/.test(html) && /proj_feed\.js/.test(html));

  // ── 5. invalid source refused, not half-applied ──────────────────────────
  post = await fetch(b + '/admin/model-scoreboard/source', {
    method: 'POST', redirect: 'manual',
    headers: { Cookie: cc, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'source=coinflip' });
  ck('invalid source -> saved=invalid, doc untouched',
    /saved=invalid/.test(post.headers.get('location') || ''));
  const mc2 = await (async () => {
    const { getDoc } = require(path.join(ROOT, 'src', 'data'));
    return getDoc('model_controls', {});
  })();
  ck('doc still carries the last valid source', mc2.projection_source === 'sleeper'
    && mc2.history.length === 1);

  // ── manual override + paused adaptation surface honestly ────────────────
  fs.writeFileSync(path.join(OWN_DIR, 'controls.json'),
    JSON.stringify({ auto_adapt: false, champion_override: 'v1_notilt' }));
  res = await fetch(b + '/admin/model-scoreboard', { headers: { Cookie: cc } });
  html = await res.text();
  ck('manual override state is shown, with the honest path to change it',
    /PAUSED by manual override/.test(html) && /v1_notilt/.test(html)
    && /controls\.json/.test(html));

  // ── 1. the refusal arm ───────────────────────────────────────────────────
  const mck = await login(member.username);
  const mres = await fetch(b + '/admin/model-scoreboard', { headers: { Cookie: mck }, redirect: 'manual' });
  ck('a plain member is refused the page', mres.status === 403 || mres.status === 302);
  const mpost = await fetch(b + '/admin/model-scoreboard/source', {
    method: 'POST', redirect: 'manual',
    headers: { Cookie: mck, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'source=fantasypros' });
  ck('a plain member is refused the control', mpost.status === 403 || mpost.status === 302);
  const mc3 = await (async () => {
    const { getDoc } = require(path.join(ROOT, 'src', 'data'));
    return getDoc('model_controls', {});
  })();
  ck('and the doc did not move', mc3.projection_source === 'sleeper');

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
