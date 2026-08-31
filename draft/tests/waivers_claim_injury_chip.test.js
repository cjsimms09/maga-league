// TERRITORY: B — register 321's B-ask, closing the verification gap
/* "B: the field is now in the payload (`injury_status`, `inactive`) and the
 * claims block should render it; today a claim and an IR claim look
 * identical on screen."
 *
 * The code for this already exists in views/waivers.ejs (found while
 * checking this row) -- it reuses matchup.js's injuryFlag(), the same
 * ladder team.ejs and the matchup card use. draft/tests/injury_chips.test.js
 * proves the DATA layer carries injury_status onto a claim (evaluateClaims)
 * and proves the CHIP renders on /team -- but nothing had actually driven
 * the /waivers CLAIMS BLOCK itself end to end, so the one thing register
 * 321 explicitly asked for was unverified. This closes that gap.
 *
 * A single-claim fixture is not enough: `top = claims[0]` (waivers.ejs:5)
 * and the "What the wire would add" list (claims.forEach, line 131) both
 * render EVERY entry including claims[0] -- so the single top claim shows
 * TWICE on the page. The forEach list already had the injuryFlag() chip;
 * the "BEST CLAIM" verdict card (top, the first and most prominent thing
 * on the page) did NOT -- a genuine second instance of register 321's
 * exact complaint, discovered by this test, now fixed in waivers.ejs. A
 * >=2-claim fixture is required so the verdict card (claims[0]) and the
 * list (claims[1]) can be asserted on independently.
 *
 * Direct ejs.renderFile() with hand-built locals -- same technique
 * sleeper_deep_links.test.js already established for this exact template,
 * cheaper and more deterministic than seeding a full live board.
 *
 * Run: node draft/tests/waivers_claim_injury_chip.test.js
 */
'use strict';
const path = require('path');
const ejs = require('ejs');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

(async () => {
  const tplPath = path.join(ROOT, 'views', 'waivers.ejs');
  const render = locals => new Promise((resolve, reject) => {
    ejs.renderFile(tplPath, locals, (err, html) => err ? reject(err) : resolve(html));
  });

  const LID = 'CHIPTEST';
  const baseLocals = {
    title: 'x', owner: { id: 1, name: 'Cory', is_commissioner: true },
    currentPath: '/waivers', alerts: [], quip: '', chatUnread: 0, betsWaiting: 0, votesWaiting: 0,
    money: n => '$' + n, humanTime: () => ({ text: '', title: '' }), venmoLink: () => null,
    injuryFlag: require(path.join(ROOT, 'src', 'matchup.js')).injuryFlag,
    sleeperLink: suffix => `https://sleeper.com/leagues/${LID}` + (suffix ? '/' + suffix : ''),
    viewerIsChamp: false,
    me: { id: 1, name: 'Cory' }, season: '2026', weekNo: 3, live: true, err: null,
    drop: { name: 'Bench Guy' }, perPoint: 1, streamClaims: [], currentKD: [], blockWatch: [],
    liveStale: { stale: false }, captureError: false, guide: {},
  };

  const irClaim = { name: 'On Ice', position: 'RB', net_value: 12, dollars: 8,
    injury_status: 'IR', consensus_projection: null, consensus_label: '', drop: null, why: '', rivals: [], contested: false };
  const healthyClaim = { name: 'Fresh Legs', position: 'WR', net_value: 9, dollars: 6,
    injury_status: '', consensus_projection: null, consensus_label: '', drop: null, why: '', rivals: [], contested: false };
  const questionableClaim = { name: 'Iffy Guy', position: 'TE', net_value: 5, dollars: 3,
    injury_status: 'QUESTIONABLE', consensus_projection: null, consensus_label: '', drop: null, why: '', rivals: [], contested: false };

  // top = claims[0] (waivers.ejs:5) and claims.forEach (line 131) both walk
  // the FULL claims array, so claims[0] renders TWICE: once in the "BEST
  // CLAIM" verdict card, once again in the "What the wire would add" list.
  // A >=2-claim fixture lets the two regions be checked independently by
  // splitting on the list's own header text.
  const splitCard = html => {
    const i = html.indexOf('What the wire would add');
    return { card: html.slice(0, i), list: html.slice(i) };
  };
  const mu = (level, text) => new RegExp(`class="mu-flag ${level}"[^>]*>${text}<`);

  const htmlIR = await render({ ...baseLocals, claims: [irClaim, healthyClaim] });
  const irParts = splitCard(htmlIR);
  ck('the BEST CLAIM verdict card (the top, most prominent claim on the page) '
     + 'carries the red cannot-score chip when it is an IR claim, same ladder as /team',
    mu('out', 'IR').test(irParts.card), (irParts.card.match(/On Ice[\s\S]{0,200}/) || [])[0]);
  ck('the secondary list ALSO shows the IR chip on that same claim (register 321\'s '
     + 'originally-fixed spot, still working)',
    mu('out', 'IR').test(irParts.list), (irParts.list.match(/On Ice[\s\S]{0,200}/) || [])[0]);
  ck('CONTROL — the healthy second claim wears no chip anywhere on the page',
    !/mu-flag/.test((htmlIR.match(/Fresh Legs[\s\S]{0,200}/) || [''])[0]));

  const htmlHealthyTop = await render({ ...baseLocals, claims: [healthyClaim, questionableClaim] });
  const healthyTopParts = splitCard(htmlHealthyTop);
  ck('CONTROL — a healthy top claim wears no chip in the verdict card at all '
     + '(a claim and an IR claim no longer "look identical" only because the '
     + 'healthy one is silent, not styled)',
    !/mu-flag/.test(healthyTopParts.card), (healthyTopParts.card.match(/Fresh Legs[\s\S]{0,200}/) || [])[0]);
  ck('a Questionable claim further down the list carries the amber maybe chip, distinct from IR',
    mu('q', 'Q').test(healthyTopParts.list), (healthyTopParts.list.match(/Iffy Guy[\s\S]{0,200}/) || [])[0]);

  ck('CONTROL — the IR chip and the Questionable chip really are visually distinct '
     + '(different level class), not the same styling reused',
    mu('out', 'IR').test(irParts.card) && !mu('out', 'IR').test(healthyTopParts.list));

  console.log(`\n${pass}/${pass + fail} waivers-claim-injury-chip checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
