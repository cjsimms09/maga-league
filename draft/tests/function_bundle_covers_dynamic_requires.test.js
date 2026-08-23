/* THE PRODUCTION-ONLY ENOENT CLASS, CLOSED — found live 2026-08-23, first real
 * in-season page load: /waivers 500'd on `Cannot find module .../valuation.js`
 * because server code requires shared browser modules via path.join (a dynamic
 * require esbuild cannot trace) and public/js was not in the app function's
 * included_files. Every dev machine and every test had the full repo on disk,
 * so only production could fail. /history hit the same class earlier via fs
 * reads; /admin/slot-picker's catch converted the same absence into a message
 * blaming a module that loads fine.
 *
 * This walks src/ + netlify/functions for require(path.join(...'<repo path>'))
 * patterns, resolves each to a real file, and asserts the app function's
 * included_files covers it. Control: a planted uncovered require FAILS. */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '  -> ' + JSON.stringify(d) : ''))); };

const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
const appBlock = toml.split(/\[functions\."app"\]/)[1] || '';
const filesMatch = appBlock.match(/included_files\s*=\s*\[([^\]]*)\]/);
const globs = (filesMatch ? filesMatch[1] : '').match(/"([^"]+)"/g)
  ? filesMatch[1].match(/"([^"]+)"/g).map(s => s.slice(1, -1)) : [];
ck('the app function declares included_files', globs.length > 0, globs);

const covered = f => globs.some(g => {
  if (g.endsWith('/**')) return f.startsWith(g.slice(0, -3) + '/') || f === g.slice(0, -3);
  if (g.includes('*')) return new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.*').replace(/(?<!\.)\*/g, '[^/]*') + '$').test(f);
  return f === g;
});

function* jsFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* jsFiles(p);
    else if (e.name.endsWith('.js')) yield p;
  }
}
// require(path.join(__dirname, 'a', 'b', 'c.js')) -> repo-relative target
const RX = /require\(\s*path\.join\(\s*__dirname\s*((?:,\s*'[^']*')+)\s*\)\s*\)/g;
const found = [];
for (const dir of ['src', path.join('netlify', 'functions')]) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const f of jsFiles(abs)) {
    const src = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = RX.exec(src)) !== null) {
      const parts = m[1].match(/'([^']*)'/g).map(s => s.slice(1, -1));
      const target = path.relative(ROOT, path.resolve(path.dirname(f), ...parts));
      found.push({ from: path.relative(ROOT, f), target: target.split(path.sep).join('/') });
    }
  }
}
ck('the sweep finds the three known dynamic requires (non-vacuous)',
  found.filter(x => /public\/js\/draft\//.test(x.target)).length >= 3,
  found.map(x => x.target));
for (const x of found) {
  ck('bundled: ' + x.target + '  (required by ' + x.from + ')',
    fs.existsSync(path.join(ROOT, x.target)) && covered(x.target), x);
}
// CONTROL — an uncovered target must FAIL this check, or the guard is decoration.
ck('CONTROL — a require outside included_files would be caught',
  !covered('draft/tools/never_bundled_example.js'));

console.log(pass + '/' + (pass + fail) + ' bundle-coverage checks passed');
process.exit(fail ? 1 : 0);
