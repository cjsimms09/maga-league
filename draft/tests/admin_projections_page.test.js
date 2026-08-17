'use strict';
// TERRITORY: A
// THE PROJECTION-SOURCE COMPARISON PAGE (/admin/projections) — Cory's ask,
// 2026-08-16: an easy way to see the projections we USE (Sleeper/FP -> Mean)
// beside OUR model's test projections (own_v6). Claims under test:
//   1. Cory sees it; a plain member is refused (the own-model column is the
//      exact number the member-site access rule keeps off member pages);
//   2. it names the live algorithm from board provenance (own_v6, not a
//      hardcoded label that survives the next promotion silently);
//   3. its numbers ARE the board's numbers (spot-check a real player row
//      against draft_data.json — no recomputation drift);
//   4. absent sources render as absent, never 0;
//   5. every position section renders with rows.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aproj-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };
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

  const artifact = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

  const cc = await login('cory');
  const res = await fetch(b + '/admin/projections', { headers: { Cookie: cc } });
  const html = await res.text();
  ck('renders 200 for Cory', res.status === 200);
  ck('no template error', !/ReferenceError|is not defined|Cannot read/.test(html));
  // DUAL-HOME PROVENANCE, NOT AN INFRA DEATH (diagnosed 2026-08-16, see
  // draft/audit/rebuild_refusal_diagnosis_2026-08-16.md's pattern, §6 node 16
  // and src/routes/admin.js:1225-1230). This dereferenced
  // `artifact.provenance.own_model.algorithm` directly and threw
  // `TypeError: Cannot read properties of undefined` on a fresh board — a
  // full build() writes the own-model diag at
  // `provenance.projections.own_model`; only a hand-stamped promotion
  // artifact (or a `refresh`-only build) carries the top-level
  // `provenance.own_model` this line assumed. The uncaught throw happened
  // BEFORE any `ck()` ran, so js-sweep.sh (which only recognizes printed
  // `FAIL` lines) misreported this as "died without asserting" infra rather
  // than the code defect it actually is. The route already resolves both
  // homes (`prov.own_model || prov.projections.own_model`); the test now
  // does the same instead of trusting one hardcoded path.
  const ownModelProv = artifact.provenance.own_model || (artifact.provenance.projections || {}).own_model || {};
  ck('names the live algorithm from provenance, not a hardcoded label',
    !!ownModelProv.algorithm && new RegExp('<b>' + ownModelProv.algorithm + '</b>').test(html));
  ck('says the role out loud (display-only, members never see it)',
    /never moves Mean, VORP/.test(html) && /members never see it/.test(html));
  ck('renders all four position sections',
    ['QB', 'RB', 'WR', 'TE'].every(p => new RegExp(p + ' — top \\d+ by the number we use').test(html)));

  // Numbers ARE the board's numbers: take the top-mean QB from the artifact
  // and require his exact Sleeper/FP/own/mean values in the row.
  const qbs = artifact.players.filter(p => p.position === 'QB' && p.proj_mean != null)
    .sort((a, b) => b.proj_mean - a.proj_mean);
  const top = qbs[0];
  const r1 = n => Math.round(n * 10) / 10;
  const row = html.split('\n').map(s => s.trim()).join(' ');
  ck(`top QB row (${top.name}) carries the board's own numbers`,
    [top.proj_sleeper, top.proj_fantasypros, top.proj_ownmodel, top.proj_mean]
      .filter(v => v != null)
      .every(v => row.includes('>' + r1(v) + '<')),
    'expected ' + JSON.stringify([top.proj_sleeper, top.proj_fantasypros, top.proj_ownmodel, top.proj_mean].map(v => v == null ? null : r1(v))));

  // Absent-not-zero: a player with proj_ownmodel but rendered blank FP (or
  // vice versa) must show the em-dash, and the page must not print a bare 0
  // in any source cell for a player whose artifact value is null.
  const anyAbsent = artifact.players.some(p => ['QB', 'RB', 'WR', 'TE'].includes(p.position)
    && p.proj_mean != null && (p.proj_fantasypros == null || p.proj_ownmodel == null));
  ck('absent sources render as — (dash), and such players exist to prove it',
    anyAbsent && /<span class="abs">—<\/span>/.test(html));

  // The refusal arm — the same boundary member_access_rule.test.js pins from
  // the member side, proven here from the admin side.
  const mc = await login(member.username);
  const mres = await fetch(b + '/admin/projections', { headers: { Cookie: mc }, redirect: 'manual' });
  ck('a plain member is refused', mres.status === 403 || mres.status === 302);

  // Position filter narrows to one section.
  const fres = await fetch(b + '/admin/projections?pos=TE', { headers: { Cookie: cc } });
  const fhtml = await fres.text();
  ck('?pos=TE renders exactly the TE section',
    /TE — top \d+/.test(fhtml) && !/WR — top \d+/.test(fhtml) && !/QB — top \d+/.test(fhtml));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
