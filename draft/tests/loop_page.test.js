'use strict';
// TERRITORY: relay built /admin/loop (Cory's "show me the model's inner
// workings" page); A merges; B owns the surface after. Claims under test:
//   1. Cory sees it; a plain member is refused (known-negative);
//   2. every headline number IS the ledger's number, independently recomputed
//      here — the page's contract is that nothing on it is hand-typed;
//   3. the skill section renders R* WITH its null band (the honesty rule);
//   4. the full trackable table carries every ledger row.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-'));
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
  const login = async u => cookieFrom(await fetch(b + '/login', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${u}&password=pw`, redirect: 'manual' }));

  const cc = await login('cory');
  const res = await fetch(b + '/admin/loop', { headers: { Cookie: cc } });
  ck('Cory sees the page (200)', res.status === 200, 'got ' + res.status);
  const html = await res.text();
  ck('no template error', !/ReferenceError|is not defined|Cannot read/.test(html));
  ck('all sections present', ['Needs your eyes', 'Are we learning?', 'Open bets',
    'Skill or luck?', 'Are we getting better?', 'Every prediction, trackable']
    .every(s => html.includes(s)));

  // headline numbers ARE the ledger's, independently recomputed
  const checker = require(path.join(ROOT, 'draft', 'tools', 'prediction_ledger_check.js'));
  const rows = [...checker.rows(fs.readFileSync(path.join(ROOT, 'PREDICTION-LEDGER.md'), 'utf8'))];
  ck('filed count is the real ledger count', html.includes('<b>' + rows.length + '</b>'), 'expected ' + rows.length);
  const graded = rows.filter(c => /GRADED/.test(c[5])).length;
  ck('graded count matches', html.includes('<b>' + graded + '</b>'), 'expected ' + graded);
  const idsInTable = (html.match(/<td>P\d+<\/td>/g) || []).length;
  ck('trackable table carries every ledger row', idsInTable >= rows.length,
    `table has ${idsInTable}, ledger has ${rows.length}`);

  // the skill section renders the artifact's number WITH its band
  const skill = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'skill_luck_league.json'), 'utf8'));
  ck('R* rendered from the artifact', html.includes(String(skill.R_star)));
  ck('null band rendered beside it (the honesty rule)', html.includes(String(skill.null['null_97.5'])));

  // known-negative: a plain member is refused
  const mc = await login(member.username);
  const r2 = await fetch(b + '/admin/loop', { headers: { Cookie: mc } });
  ck('member refused (403)', r2.status === 403, 'got ' + r2.status);

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
