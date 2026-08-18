'use strict';
// TERRITORY: A
// THE REHEARSALS MUST OPEN A BROWSER THAT EXISTS ON THE MACHINE RUNNING THEM.
//
// Found 2026-08-17, minutes after rehearsals.yml put the three browser
// rehearsals into CI for the first time. All eight browser scripts in this
// directory launched with a hardcoded `executablePath:
// '/opt/pw-browsers/chromium'` — a symlink that exists only in the research
// sandbox. On a GitHub runner, `npx playwright install` puts chromium in
// ~/.cache/ms-playwright and that path is simply absent, so every rehearsal
// would have thrown on launch() AFTER a green install step. The workflow's own
// commit message had flagged the install line as "the untested line"; the
// install line was fine and the launch line was broken.
//
// The failure was silent for as long as the rehearsals only ever ran here,
// which is exactly the shape of defect a test has to hold down: this file makes
// the sandbox path structurally unable to come back, and pins the resolver's
// two branches so that neither environment can be broken in service of the
// other.
//
// Run: node draft/tests/rehearsal_browser_portability.test.js
const fs = require('fs');
const path = require('path');

const TESTS = __dirname;
const B = require(path.join(TESTS, 'rehearsal-browser.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

// ---------------------------------------------------------------- the resolver
// Both branches, on one machine, by injecting the existence check. Without the
// injection only whichever branch this machine happens to be on gets tested —
// which is how the bug survived in the first place.
ck('resolver uses the sandbox symlink when it is present',
  B.resolveExecutablePath(p => p === B.SANDBOX_CHROMIUM) === B.SANDBOX_CHROMIUM);

ck('resolver defers to playwright when the sandbox symlink is absent',
  B.resolveExecutablePath(() => false) === undefined);

// undefined, not null and not '' — launchChromium() tests truthiness, and an
// empty string handed to playwright as executablePath is a spawn failure, not a
// fallback.
ck('absent resolves to undefined rather than a falsy path string',
  B.resolveExecutablePath(() => false) === undefined
  && B.resolveExecutablePath(() => false) !== null, B.resolveExecutablePath(() => false));

ck('the sandbox path is the container one, not a playwright convention',
  B.SANDBOX_CHROMIUM === '/opt/pw-browsers/chromium', B.SANDBOX_CHROMIUM);

// ------------------------------------------------------------------- the sweep
// Every browser script must go through the helper. Two ways to get this wrong:
// hardcode the path again, or call chromium.launch() directly (which defaults to
// playwright's cache and so breaks HERE instead of in CI).
const HARDCODED = '/opt/pw-browsers';
const DIRECT_LAUNCH = 'chromium.launch(';

function scan(src) {
  return { hardcoded: src.indexOf(HARDCODED) !== -1, direct: src.indexOf(DIRECT_LAUNCH) !== -1 };
}

// KNOWN-POSITIVE CONTROL. A sweep that cannot fail is not evidence. Prove the
// scanner flags the exact line this test exists to prevent, before trusting it
// to report zero.
const control = scan("const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });");
ck('CONTROL: the scanner flags the original defective line', control.hardcoded && control.direct, control);
ck('CONTROL: the scanner passes a helper-based launch',
  (() => { const c = scan('const b = await launchChromium();'); return !c.hardcoded && !c.direct; })());

const offenders = [];
for (const f of fs.readdirSync(TESTS)) {
  if (!f.endsWith('.js')) continue;
  if (f === 'rehearsal-browser.js') continue;                  // the helper owns the path
  if (f === path.basename(__filename)) continue;               // and this file quotes it
  const s = fs.readFileSync(path.join(TESTS, f), 'utf8');
  const r = scan(s);
  if (r.hardcoded || r.direct) offenders.push({ file: f, ...r });
}
ck('no browser script hardcodes a sandbox path or launches chromium directly',
  offenders.length === 0, offenders);

// The scripts rehearsals.yml actually runs — named explicitly, so deleting or
// renaming one cannot quietly shrink what the sweep above covers.
for (const f of ['rehearsal-mock3.js', 'rehearsal-keepers.js', 'rehearsal-config-screen.js']) {
  const s = fs.readFileSync(path.join(TESTS, f), 'utf8');
  ck(f + ' launches through the helper',
    s.indexOf("require('./rehearsal-browser')") !== -1 && s.indexOf('launchChromium(') !== -1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
