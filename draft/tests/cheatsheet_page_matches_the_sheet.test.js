/* TERRITORY: A
 *
 * THE CHEAT SHEET CORY TAPS IS THE CHEAT SHEET THE RELAY WROTE.
 *
 * `public/cheatsheet.html` is generated from `draft/DRAFT-NIGHT-CHEATSHEET.md`
 * by draft/tools/cheatsheet_page.js, and is linked from the war room's top nav
 * so it is one tap from the board on draft night.
 *
 * Two files holding the same draft advice is precisely the shape this repo
 * keeps paying for — register 148 is two replacement tables disagreeing by 2x,
 * register 5h is a weight ruling shipping while the prose quoting it never
 * updates, and register 154 is Cory's keepers priced on a table nobody else
 * used. So the page is never hand-edited, and this suite fails the moment the
 * markdown changes without the page being regenerated.
 *
 * WHY WORD-FOR-WORD AND NOT A HASH. A hash would tell you the two differ and
 * nothing else. Mid-draft the question is "is a TIP missing", so this compares
 * the actual words, in order, and names the first one that fell out.
 *
 * Run: node draft/tests/cheatsheet_page_matches_the_sheet.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const MD_PATH = path.join(ROOT, 'draft', 'DRAFT-NIGHT-CHEATSHEET.md');
const PAGE_PATH = path.join(ROOT, 'public', 'cheatsheet.html');

let pass = 0;
const fails = [];
const check = (n, ok, d) => {
  if (ok) { pass++; return; }
  fails.push(n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 300) : ''));
};

check('the sheet exists', fs.existsSync(MD_PATH));
check('the generated page exists — the war-room link is not a dead tap',
  fs.existsSync(PAGE_PATH));
if (fails.length) { fails.forEach(f => console.log('  FAILED  ' + f)); process.exit(1); }

const MD = fs.readFileSync(MD_PATH, 'utf8');
const PAGE = fs.readFileSync(PAGE_PATH, 'utf8');

/* ── 1. EVERY WORD OF THE SHEET REACHES THE PAGE, IN ORDER ──────────────── */

const unescape = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"');
const wordsOf = s => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\*\*/g, '')
  .match(/[A-Za-z0-9%./+−-]+/g) || [];

const mdBody = MD.replace(/<!--[\s\S]*?-->/g, '');   // territory/provenance comments
let pageBody = PAGE.split('</style>')[1] || '';
pageBody = pageBody.split('<p class=gen>')[0]
  .replace(/<nav class=toc>[\s\S]*?<\/nav>/, '')
  .replace(/<a class=back[\s\S]*?<\/a>/, '');

const mdWords = wordsOf(mdBody).filter(w => !/^#+$/.test(w));
const pageWords = wordsOf(pageBody);

/* Ordered-list markers ("1.", "2.") become <ol><li> and the browser draws the
 * numbers, so they legitimately do not appear as text. Nothing else may vanish. */
const EXPECTED_ABSENT = new Set(['1.', '2.', '3.', '4.', '5.', '6.', '7.', '8.', '9.']);

let cursor = 0;
const lost = [];
mdWords.forEach(w => {
  if (EXPECTED_ABSENT.has(w)) return;
  const at = pageWords.indexOf(w, cursor);
  if (at < 0) lost.push(w); else cursor = at + 1;
});

check('every word of the sheet reaches the page, in order — a tip cannot go '
  + 'missing between the file and the screen', lost.length === 0,
{ lost: lost.slice(0, 8), mdWords: mdWords.length, pageWords: pageWords.length });

check('CONTROL — there are enough words to make that meaningful',
  mdWords.length > 400, mdWords.length);

/* ── 2. REGENERATING IS A NO-OP — the page is CURRENT, not merely similar ── */

{
  const before = PAGE;
  execFileSync('node', [path.join(ROOT, 'draft', 'tools', 'cheatsheet_page.js')],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
  const after = fs.readFileSync(PAGE_PATH, 'utf8');
  check('re-running the generator changes NOTHING — the committed page is built '
    + 'from the committed sheet, not from an older one',
    before === after,
    before === after ? null
      : { hint: 'run: node draft/tools/cheatsheet_page.js and commit the result',
        beforeLen: before.length, afterLen: after.length });
  if (before !== after) fs.writeFileSync(PAGE_PATH, before);  // leave the tree as found
}

/* ── 3. IT IS ACTUALLY REACHABLE, AND SELF-CONTAINED ────────────────────── */

const WARROOM = fs.readFileSync(
  path.join(ROOT, 'views', 'admin', 'warroom.ejs'), 'utf8');
check('the war room links to it', /href="\/cheatsheet\.html"/.test(WARROOM));
check('and opens it in a new tab, so tapping it never takes the board off screen '
  + 'mid-draft',
/href="\/cheatsheet\.html"[^>]*target="_blank"/.test(WARROOM));

/* netlify.toml publishes `public` as the site root, which is what makes
 * /cheatsheet.html resolve. Asserted rather than assumed — if that ever changes
 * the link becomes a 404 and nobody would find out until draft night. */
const NETLIFY = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
check('public/ is still the published site root, so /cheatsheet.html resolves',
  /publish\s*=\s*"public"/.test(NETLIFY));

/* No external fetches: it has to open on a phone on bad wifi. */
check('the page pulls in NOTHING external — no CDN, no font, no script',
  !/<script/i.test(PAGE) && !/https?:\/\//i.test(PAGE.replace(/<!--[\s\S]*?-->/g, '')),
  (PAGE.match(/https?:\/\/[^\s"'<]+/g) || []).slice(0, 3));

check('it carries a way back to the war room',
  /href="\/admin\/warroom"/.test(PAGE));

/* ── 4. THE FAIL ARM — the comparison can actually SEE a lost tip ────────── */

/* ⚠️ THE ARM DOCTORS THE EXTRACTED WORDS, NOT THE HTML — and the first version
 * doctored the HTML and silently did nothing. `pageBody.replace(/agonize/i,'')`
 * matched inside the heading's `id="...-don-t-agonize"` attribute, which is the
 * FIRST occurrence in the file; the visible text was untouched, and since
 * wordsOf() strips tags the doctored page came out identical. The arm reported
 * "no words lost" and read as a pass, which would have left the real comparison
 * above it unproven. Removing a word from the word list cannot miss. */
{
  const dw = pageWords.slice();
  const victim = dw.indexOf('agonize');
  check('CONTROL — the arm has a real word to remove', victim >= 0, victim);
  dw.splice(victim, 1);
  let c = 0; const missed = [];
  mdWords.forEach(w => {
    if (EXPECTED_ABSENT.has(w)) return;
    const at = dw.indexOf(w, c);
    if (at < 0) missed.push(w); else c = at + 1;
  });
  check('FAIL ARM — deleting one word from the page IS detected',
    missed.length > 0, missed.slice(0, 3));
}

console.log('\n  THE CHEAT SHEET ON SCREEN IS THE CHEAT SHEET ON DISK\n');
console.log('    sheet   ' + mdWords.length + ' words');
console.log('    page    ' + pageWords.length + ' words, '
  + (PAGE.length / 1024).toFixed(1) + 'KB, self-contained\n');
if (fails.length) {
  fails.forEach(f => console.log('  FAILED  ' + f));
  console.log('\n  ' + pass + ' passed, ' + fails.length + ' FAILED\n');
  process.exit(1);
}
console.log('  ' + pass + ' checks passed\n');
