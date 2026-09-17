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

// COMMENTS ARE STRIPPED BEFORE SCANNING, and the reason is a real false positive
// (2026-09-17). A new browser script documented this very defect in its header —
// naming the sandbox path and the direct-launch call so the next reader would
// reach for the helper — and the sweep flagged the FILE for the COMMENT while
// its actual launch went through launchChromium(). A guard that fails a script
// for explaining the rule teaches people to stop explaining it.
//
// Conservative on purpose: only whole-line comments and block comments come out.
// A trailing `// ...` on a line of code is left in and would still be flagged,
// which errs toward catching a real occurrence rather than missing one. Stripped
// by line so that a `https://` in a string is never mistaken for a comment.
function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
}
function scan(src) {
  const s = strip(src);
  return { hardcoded: s.indexOf(HARDCODED) !== -1, direct: s.indexOf(DIRECT_LAUNCH) !== -1 };
}

// KNOWN-POSITIVE CONTROL. A sweep that cannot fail is not evidence. Prove the
// scanner flags the exact line this test exists to prevent, before trusting it
// to report zero.
const control = scan("const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });");
ck('CONTROL: the scanner flags the original defective line', control.hardcoded && control.direct, control);
ck('CONTROL: the scanner passes a helper-based launch',
  (() => { const c = scan('const b = await launchChromium();'); return !c.hardcoded && !c.direct; })());

// The comment-stripping added 2026-09-17 needs its own pair: it must stop
// flagging prose, and it must NOT have gone soft on code.
ck('CONTROL: a comment NAMING the defect is not itself the defect',
  (() => {
    const c = scan("// never write chromium.launch({executablePath:'/opt/pw-browsers/chromium'})\n"
                 + '/* nor /opt/pw-browsers in a block comment */\n'
                 + 'const b = await launchChromium();');
    return !c.hardcoded && !c.direct;
  })());
ck('CONTROL: stripping comments does NOT hide a real offence beside them',
  (() => {
    const c = scan("// this file explains chromium.launch( and /opt/pw-browsers\n"
                 + "const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });");
    return c.hardcoded && c.direct;
  })());

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
