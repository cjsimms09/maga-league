// TERRITORY: A
// A 45-SECOND POCKET UNLINKED THE BOARD, AND THAT WAS BY CONSTRUCTION.
//
// Cory's ask, verbatim: *"what is best for me during draft to get back in with
// accurate board as quick as possible"*. Another session drove a real 44-second
// outage against the 08-22 code path and reported the shape of it: a 24s drop
// reconnects by itself in 3s and the picks made while dark arrive, counted once
// — nothing to do. At 45 seconds the board UNLINKED SYNC AND WAITED TO BE ASKED.
//
// IT WAS NOT A TUNING KNOB. `sync.js` BACKOFF_MAX is 30s; `session.js`
// WEDGE_AFTER is a fixed 45s. A retry can therefore always be OUTSTANDING when
// the patience budget expires, so any outage past ~45 seconds wedges no matter
// how healthy the connection is on either side of it. Those two constants are
// asserted below, because the argument for the change rests on their relation
// and a comment stating it is a comment.
//
// ── WHY SURRENDER WAS THE WRONG DEFAULT, STATED AS THE ASYMMETRY ──────────
//
// The old behaviour was not careless — a spinner that hangs forever is worse
// than an honest surrender, and manual entry is a first-class path here, so
// nothing was ever LOST. What it assumed is that somebody is looking at the
// screen. At a draft table Cory is watching the room and the clock.
//
//   RETRYING costs one request per 30s against an endpoint already polled
//            every 4s, and the picks made while dark arrive on the next
//            successful poll, counted once.
//   SURRENDERING costs the whole outage PLUS however long it takes him to
//            notice a button changed its label — during which the board goes on
//            recommending players who are already gone, with full confidence.
//
// ── WHAT THIS DOES NOT CLAIM ──────────────────────────────────────────────
//
// That the room is reachable. If Sleeper is down it is down; retrying does not
// change that. What changes is that the board comes back BY ITSELF the moment it
// is not, instead of waiting for a tap that may never come.
//
// Run: node draft/tests/sync_never_wedges.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const SYNC_SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'sync.js'), 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const S = require(path.join(ROOT, 'public', 'js', 'draft', 'session.js'));

// ── 1. THE TWO CONSTANTS THAT MADE IT STRUCTURAL ────────────────────────
{
  const backoff = +(SYNC_SRC.match(/BACKOFF_MAX\s*=\s*(\d+)/) || [])[1];
  const poll = +(SYNC_SRC.match(/POLL_MS\s*=\s*(\d+)/) || [])[1];
  ck('sync backs off to a cap rather than hammering', backoff > 0 && poll > 0,
    { backoff: backoff, poll: poll });
  ck('and the patience budget is a FIXED window, not derived from the backoff',
    S.WEDGE_AFTER > 0, S.WEDGE_AFTER);
  ck('THE STRUCTURAL FACT: a retry can still be outstanding when patience runs '
    + 'out, so an outage past the budget wedges by construction',
    backoff >= S.WEDGE_AFTER - backoff,
    { backoff_cap_ms: backoff, wedge_after_ms: S.WEDGE_AFTER });
  ck('CONTROL — 45s is genuinely short for a phone at a table, i.e. under a '
    + 'minute', S.WEDGE_AFTER <= 60000, S.WEDGE_AFTER);
}

// ── 2. WEDGED IS REACHABLE, AND RECOVERS WITHOUT A TAP ──────────────────
// The state machine's half, driven rather than read. `sawResponse` must carry a
// wedged session straight back to live — if it did not, keeping the poller alive
// would fix nothing.
{
  const T = 1000000;
  let s = S.connecting(S.create(T), '123456789', T);
  s = S.sawResponse(s, T + 500, true);
  ck('a healthy session is live', s.state === 'live', s.state);
  s = S.tick(s, T + 500 + S.STALL_AFTER);
  ck('quiet for the stall window degrades to stalled, still trying', s.state === 'stalled', s.state);
  s = S.tick(s, T + 500 + S.WEDGE_AFTER);
  ck('and past the patience budget it wedges — the honest signal is KEPT',
    s.state === 'wedged', s.state);
  const back = S.sawResponse(s, T + 500 + S.WEDGE_AFTER + 3000, true);
  ck('THE PROPERTY THAT MAKES RETRYING WORTH ANYTHING: one successful response '
    + 'from wedged returns to LIVE with no reset and no tap',
    back.state === 'live', back.state);
  ck('and the wedge is still RECORDED, so the outage is reportable afterwards',
    S.report(back).wedged_at === T + 500 + S.WEDGE_AFTER, S.report(back).wedged_at);
}

// ── 3. THE HANDLER NO LONGER TEARS THE POLLER DOWN ──────────────────────
/* COMMENTS ARE STRIPPED FIRST, and this test caught itself on that: the block's
 * own comment NAMES `state.sync.stop()` as the thing it stopped doing, so a raw
 * text search reported the fix as absent. Same trap as the gone-set shape guard
 * — a detector that reads prose reads the explanation as the offence. */
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const handlerRaw = (function () {
  const i = SRC.indexOf("if (now === 'wedged') {");
  return i < 0 ? '' : SRC.slice(i, SRC.indexOf('\n      }', i) + 8);
})();
const handler = strip(handlerRaw);
ck('the wedged handler is locatable', handlerRaw.length > 200);
ck('CONTROL — stripping comments leaves executable code, not an empty string',
  handler.replace(/\s/g, '').length > 60, handler.length);
ck('it does NOT stop the sync', !/state\.sync\.stop\s*\(/.test(handler), handler.slice(0, 200));
ck('it does NOT unlink the sync object — a null sync cannot recover',
  !/state\.sync\s*=\s*null/.test(handler));
ck('it does NOT kill the watch that would notice the recovery',
  !/clearInterval\(state\.sessionWatch\)/.test(handler));
ck('CONTROL — every one of those three IS present in the hard reset, which is '
  + 'the control that MUST still surrender, because a human asked it to',
  /state\.sync\.stop/.test(SRC) && /state\.sync = null/.test(SRC));
ck('the button becomes a KICK rather than the only road back',
  /Reconnect now/.test(handler), handler);
ck('FAIL ARM — the detector FIRES on the teardown that shipped, so the three '
  + 'checks above are not passing over a mangled slice',
  /state\.sync\.stop\s*\(/.test(strip('        try { if (state.sync && state.sync.stop) state.sync.stop(); } catch (e) {}')));

// ── 4. AND A SECOND POLLER CANNOT BE STARTED BY PRESSING IT ─────────────
// The cost of keeping the sync alive: the connect button is now reachable while
// a poller runs. Two DraftSync objects on one draft double the request rate and
// interleave their onPicks callbacks.
{
  const click = (function () {
    const i = SRC.indexOf("$('#start-sync').addEventListener('click'");
    if (i < 0) return '';
    /* Slice to a SEMANTIC end, not a byte count. This was `i + 2600`, and the
     * 2026-08-17 room-switch guard (different draft id -> confirm -> reset)
     * grew the handler past that window, so `new window.DraftSync` fell off
     * the end and the ordering check below failed on a slice artifact while
     * the real ordering it protects was intact. Anchor the end just past the
     * construction the checks reason about instead. */
    const j = SRC.indexOf('new window.DraftSync', i);
    return j < 0 ? SRC.slice(i, i + 2600) : SRC.slice(i, j + 200);
  })();
  ck('the click handler is locatable', click.length > 500);
  ck('it detects an already-running sync on the SAME draft and does not build a '
    + 'second one', /state\.sync && state\.sync\.running/.test(click)
    && /state\.sync\.draftId === parsed\.id/.test(click), click.slice(0, 200));
  ck('the kick RESETS the failure count, so the backoff drops from its cap back '
    + 'to the normal poll interval', /state\.sync\.failures = 0/.test(click));
  ck('and clears the pending timer before polling, or the kick would leave two '
    + 'timers chained', /clearTimeout\(state\.sync\.timer\)/.test(click));
  ck('it returns rather than falling through to `new DraftSync`',
    click.indexOf('state.sync.poll();') > 0
    && click.indexOf('return;', click.indexOf('state.sync.poll();')) > 0
    && click.indexOf('return;', click.indexOf('state.sync.poll();'))
       < click.indexOf('new window.DraftSync'), 'ordering');
  ck('and it tells him the tap was never required', /never have to press/.test(click));
}

// ── 5. THE MESSAGE NO LONGER MAKES A FALSE CLAIM ABOUT THE TOOL ────────
{
  const T = 1000000;
  let s = S.connecting(S.create(T), '1', T);
  s = S.tick(s, T + S.CONNECT_TIMEOUT);
  const d = S.describe(s);
  ck('the wedged line does not say the tool has stopped trying',
    !/gave up|switched to manual|stopped/i.test(d.text), d.text);
  ck('it says recovery is unattended', /retrying/i.test(d.text)
    && /on its own|by itself/i.test(d.text), d.text);
  ck('it still offers manual entry, which remains genuinely useful — it puts a '
    + 'pick on screen NOW', /hand|manual/i.test(d.text), d.text);
  ck('and it promises the dark picks are not lost, which is what stops him '
    + 'double-entering', /arrive/i.test(d.text), d.text);
  ck('the tone is still BAD — this is a degraded state and softening it would '
    + 'be the opposite mistake', d.tone === 'bad', d.tone);
  ck('FAIL ARM — the text that shipped until 08-13 fails the honesty check',
    /gave up/i.test('SYNC GAVE UP — switched to manual. Mark picks yourself.'));
}

// ── 6. THE STRIP SAYS IT, RATHER THAN HIDING IT IN A TOOLTIP ───────────
// The other half of the same 44-second drive: the board KNEW it was stale from
// second 12 and the always-visible strip said nothing about it. Two causes,
// both here — the sync warning was outranked by whatever check ran first, and
// the overflow lived in a `title` attribute, which is a hover, on a phone.
{
  const i = SRC.indexOf('const RED_RANK = [');
  const j = SRC.indexOf('const issues = redOrdered.concat(amber);');
  ck('the strip ORDERS its reds rather than showing whichever ran first',
    i > 0 && j > i, { rank_at: i, issues_at: j });
  const block = SRC.slice(i, j);
  // eslint-disable-next-line no-new-func
  const order = new Function('red', 'amber', block + '; return redOrdered;');
  const got = order(['board 19h old — STALE', 'SEAT UNKNOWN — suppressed',
    'SYNC STALE 62s — picks may be missing'], []);
  ck('SYNC outranks a stale board — wrong at the next pick beats wrong slowly',
    got[0].indexOf('SYNC') === 0, got);
  ck('CONTROL — the input was deliberately in the WORST order, so this is not '
    + 'passing on an already-sorted list',
    ['board 19h old — STALE', 'SEAT UNKNOWN — suppressed',
      'SYNC STALE 62s — picks may be missing'][0].indexOf('SYNC') !== 0);
  ck('an UNRECOGNISED red sorts FIRST — a check nobody has ranked is the one '
    + 'most likely to be what just broke',
    order(['board 19h old — STALE', 'BRAND NEW CHECK'], [])[0] === 'BRAND NEW CHECK');
  ck('and the ordering is TOTAL, not a partial that drops entries',
    got.length === 3, got);

  /* THE RENDER RULE, DRIVEN. Reads the shipped template rather than asserting
   * about it, because "every red is rendered" is a claim about output. */
  const t = SRC.slice(SRC.indexOf("+ '<span class=\"ss-dot\"", j));
  const tpl = t.slice(0, t.indexOf('</span>\';') + 10);
  const paint = (redOrdered, amber) => {
    const escapeHtml = x => String(x);
    const issues = redOrdered.concat(amber);
    const dot = redOrdered.length ? 'R' : amber.length ? 'A' : 'G';
    // eslint-disable-next-line no-new-func
    return new Function('redOrdered', 'amber', 'issues', 'dot', 'escapeHtml',
      'return ' + tpl.replace(/^\s*\+\s*/, '').replace(/;\s*$/, ''))(
      redOrdered, amber, issues, dot, escapeHtml);
  };
  const twoReds = paint(['SYNC STALE 62s — picks may be missing', 'PICK STATE: x'], ['board 7h old']);
  ck('EVERY red is rendered, not the first plus a count — this is the defect',
    /SYNC STALE/.test(twoReds) && /PICK STATE/.test(twoReds), twoReds);
  ck('and the ambers still collapse to +N, because several are routine and none '
    + 'invalidates the board', / \+1/.test(twoReds), twoReds);
  ck('FAIL ARM — the template that shipped would have hidden the second red',
    !/PICK STATE/.test('R <span>' + ['SYNC STALE 62s', 'PICK STATE: x'][0] + ' +1</span>'));
  const noRed = paint([], ['sync 15s old', 'board 7h old', '3 ADP guessed']);
  ck('with no red the first AMBER is still shown with a count', /sync 15s old/.test(noRed)
    && / \+2/.test(noRed), noRed);
  ck('CONTROL — an all-clear strip renders no issue text at all',
    !/span class="ss-issues"/.test(paint([], [])), paint([], []));
}

// ── 7. AND THE WARNING IS NO LONGER DELETED AT THE WEDGE ───────────────
// The strip's sync branch is guarded by `if (state.sync && ...)`. When the wedge
// nulled `state.sync` the whole branch was skipped, so at the exact moment the
// board became LEAST trustworthy the strip carried FEWER warnings than it had a
// second earlier. Keeping the sync alive fixes that as a consequence; asserted
// here so the consequence cannot be undone by accident.
{
  ck('the strip reads sync staleness through `state.sync`, so unlinking it '
    + 'would silently remove the warning',
    /if \(state\.sync && typeof state\.sync\.syncAgeMs === 'function'\)/.test(SRC));
  ck('and NOTHING on the wedge path nulls it any more, so the branch survives '
    + 'the moment it matters most', !/state\.sync\s*=\s*null/.test(handler));
}

// ── 8. THE ONE THING THIS CANNOT SEE ────────────────────────────────────
// Whether the retry actually reaches Sleeper. That is a network fact and no
// offline test settles it. What is proved here is that nothing in OUR code
// stops trying — which is the half that was broken.
ck('sync.poll re-arms itself on the FAILURE path too, or "keeps retrying" is '
  + 'a claim about a function that returns',
  // 900 -> 2200 (2026-08-16): the chaos drill widened the catch-branch's status
  // message (mid-draft 4xx vs bad-id, non-JSON bodies), which pushed the re-arm
  // farther from `.catch(` without changing the property this pins.
  // 2200 -> 3600 (2026-08-17): the dead-room classification (404-after-working
  // = a garbage-collected mock, with its counter and onDeadRoom hook) grew the
  // same branch again. The property is unchanged: the failure path ends by
  // re-arming the poll.
  /\.catch\(err => \{[\s\S]{0,3600}?self\.timer = setTimeout\(function \(\) \{ self\.poll\(\); \}, wait\);/
    .test(SYNC_SRC));
ck('CONTROL — and it distinguishes a 4xx, which retrying cannot fix, so this is '
  + 'not blind hammering', /will not fix itself by retrying/.test(SYNC_SRC));

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: a signal drop past the patience budget degrades the');
console.log('board loudly and then RECOVERS BY ITSELF — nothing in our code stops polling,');
console.log('one successful response returns the session to live, and pressing the button');
console.log('while a poller runs kicks it instead of starting a second one.');
console.log('WHAT IT DOES NOT: make the network work, or prove the retry reaches Sleeper.');
console.log('It also does not touch the HARD RESET, which still surrenders completely —');
console.log('that one is a human deciding to stop, which is a different thing entirely.');
