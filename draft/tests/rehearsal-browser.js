/* WHERE CHROMIUM IS — the one line that made every browser rehearsal
 * runnable ONLY inside this research sandbox.
 *
 * Until 2026-08-17 all eight browser scripts in this directory opened the
 * browser the same way:
 *
 *     chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
 *
 * That path is a symlink this CONTAINER ships (PLAYWRIGHT_BROWSERS_PATH=
 * /opt/pw-browsers, chromium -> chromium-1194/chrome-linux/chrome). It is not a
 * Playwright convention and it exists nowhere else — not on a GitHub runner, not
 * on Cory's laptop. Hardcoding it was invisible for as long as the rehearsals
 * only ever ran here.
 *
 * IT STOPPED BEING INVISIBLE THE MOMENT THEY WENT INTO CI. rehearsals.yml
 * (added the same day) does `npx playwright install --with-deps chromium`, which
 * puts the browser in Playwright's OWN cache — ~/.cache/ms-playwright — and
 * leaves /opt/pw-browsers non-existent. Every one of the three rehearsal steps
 * would have thrown on launch(), AFTER a green install step, on the first
 * scheduled run. The install line was the one flagged as unverifiable; it was
 * never the problem.
 *
 * THE RULE. Use the sandbox symlink when it is actually there, otherwise say
 * nothing and let Playwright resolve the browser it installed for itself. Both
 * halves matter: dropping the override entirely would break the rehearsals HERE,
 * because this container's browser is chromium-1194 while the pinned playwright
 * 1.62.1 looks for chromium-1234 and would refuse with "please run npx
 * playwright install".
 *
 * `chromium` is required lazily so that resolveExecutablePath() — the part with
 * the branch worth testing — can be exercised without playwright installed.
 */
'use strict';
const fs = require('fs');

/* This container's pre-installed browser. Not a Playwright path. */
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';

/* Returns the executablePath to override with, or undefined to let Playwright
 * pick. `exists` is injectable so both branches are testable on one machine. */
function resolveExecutablePath(exists) {
  const e = exists || fs.existsSync;
  return e(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined;
}

/* Drop-in for chromium.launch(opts). An explicit opts.executablePath wins, so a
 * caller that genuinely knows better is never overridden. */
function launchChromium(opts) {
  const { chromium } = require('playwright');
  const o = Object.assign({}, opts);
  if (!o.executablePath) {
    const exe = resolveExecutablePath();
    if (exe) o.executablePath = exe;      // absent, not undefined — see header
  }
  return chromium.launch(o);
}

module.exports = { launchChromium, resolveExecutablePath, SANDBOX_CHROMIUM };
