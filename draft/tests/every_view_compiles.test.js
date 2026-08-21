// TERRITORY: A
/* EVERY .ejs IN views/ MUST COMPILE. No server, no seeding, no network.
 *
 * ── WHY THIS EXISTS, WRITTEN THE DAY IT WAS NEEDED ──────────────────────────
 *
 * 2026-08-21, the night before the draft, editing one slider's help text in
 * `warroom.ejs`, I broke the template TWICE in a row and both breaks returned a
 * 500 for /admin/warroom — the entire war room dark:
 *
 *   1. I wrote the explanatory comment as an EJS comment, nested inside the JS
 *      block that builds the slider array. EJS tags do not nest.
 *   2. I rewrote it as a JS comment but kept QUOTING the tag syntax in order to
 *      explain mistake 1. EJS scans the raw file for its delimiters and has no
 *      idea it is inside a JS comment, so the quoted open tag opened a real one.
 *
 * Both were caught, by `route_smoke` — which seeds a database, boots express,
 * and renders all 31 commissioner routes to discover that one file has a syntax
 * error. That works, and it is why this project still has a war room. But it is
 * a 30-second, network-touching, order-dependent way to learn a fact the EJS
 * compiler will state in 200ms, and its failure message is a stack trace inside
 * express with the offending FILE never named — I had to guess which view.
 *
 * So this is not redundant with route_smoke. route_smoke answers "does the app
 * serve"; this answers "which file is broken", instantly, with no dependencies.
 * Both matter, and the cheap one should fail first.
 *
 * ⚠️ THE LIMIT, STATED RATHER THAN IMPLIED: compiling is not rendering. A
 * template that compiles can still throw on a missing local at render time, and
 * this cannot see that — route_smoke can. This narrows the gap, it does not
 * close it.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const ROOT = path.join(__dirname, '..', '..');
const VIEWS = path.join(ROOT, 'views');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + String(d).slice(0, 400) : '')); }
};

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.ejs')) out.push(p);
  });
  return out;
}

const files = walk(VIEWS, []);

/* RULE 3e: a probe that has never returned a positive has not been tested. A
 * zero-file sweep would report a clean bill of health for an empty directory. */
ck('CONTROL: views were actually found — an empty list would make this file '
  + 'green forever while every template rotted',
  files.length >= 10, { found: files.length, dir: 'views/' });

const broken = [];
files.forEach(f => {
  const src = fs.readFileSync(f, 'utf8');
  try {
    /* `compile` only — never `render`. Rendering needs every local a view
     * expects and would turn a missing variable into a false alarm about
     * syntax, which is the opposite of what this file is for. */
    ejs.compile(src, { filename: f, client: false });
  } catch (e) {
    broken.push(path.relative(ROOT, f) + ': ' + e.message.split('\n')[0]);
  }
});

ck('every .ejs under views/ compiles — a template error here is a 500 on that '
  + 'whole page, and on draft night that page is the war room',
  broken.length === 0, broken.join(' | '));

/* ── CONTROL FOR THIS FILE (rule 3f) ──────────────────────────────────────── */
/* The check above passes on the shipped tree, which is also what a check that
 * silently swallows its own errors does. Compile the two real breaks from
 * 2026-08-21 and confirm each is rejected — if either compiles, this file
 * cannot see the bug it was written for. */
{
  const nested = "<% const a = [ <%# a nested comment %> 1 ]; %>";
  let threw = false;
  try { ejs.compile(nested, { filename: 'control-nested.ejs' }); } catch (e) { threw = true; }
  ck('CONTROL (rule 3f) — a nested EJS comment inside a JS block is REJECTED. '
    + 'This is break #1, verbatim',
    threw, { source: nested });

  /* Break #2, reconstructed without writing a literal open tag in this file's
   * own source — assembled from parts, because a quoted delimiter in a .js file
   * is harmless but the habit of typing one is what caused break #2. */
  const OPEN = '<' + '%';
  const quoted = OPEN + ' /* explaining ' + OPEN + '# %> to the reader */ const b = 1; %>';
  let threw2 = false;
  try { ejs.compile(quoted, { filename: 'control-quoted.ejs' }); } catch (e) { threw2 = true; }
  ck('CONTROL (rule 3f) — an EJS open tag QUOTED inside a JS comment is also '
    + 'rejected, because the scanner never sees the comment. This is break #2, '
    + 'and it is the one that is genuinely surprising',
    threw2, { source: quoted });

  /* and the positive direction: a normal template must still compile, or the
   * two controls above would pass on a compiler that rejects everything. */
  let ok = true;
  try { ejs.compile('<h1><%= title %></h1><% if (x) { %>y<% } %>', { filename: 'control-ok.ejs' }); }
  catch (e) { ok = false; }
  ck('CONTROL (rule 3f) — an ORDINARY template still compiles, so the two '
    + 'rejections above are the compiler discriminating rather than refusing '
    + 'everything handed to it',
    ok);
}

console.log('\n' + files.length + ' views compiled');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
