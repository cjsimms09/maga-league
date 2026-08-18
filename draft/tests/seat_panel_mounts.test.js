// TERRITORY: A
// THE SEAT PANEL HAS NEVER ONCE APPEARED ON THE BOARD.
//
// `renderSeatPlan` reads `#seat-plan` and returns early when it is absent. It
// was always absent: the one-line view change was routed to B days ago and never
// landed, so the panel that names WHICH CHAIR Cory is filling at the pick on the
// clock has not rendered a single time.
//
// IT FAILED SAFELY, WHICH IS EXACTLY WHY NOBODY NOTICED. No error, no gap, no
// red — an absent panel and a panel with nothing to say render identically. The
// same shape as an empty `slot_to_roster_id` reading as "this league has no
// seats", and as a caption emitted into markup nobody styles.
//
// ── THE FIX IS IN A's FILE, AND THAT IS THE POINT ─────────────────────────
//
// `views/admin/warroom.ejs` is B's, and WHERE a panel sits is a layout decision
// that belongs to whoever owns layout. Editing it would have been a fourth
// boundary override in one day, to make a placement call that is not A's.
//
// So the panel mounts itself AND STANDS DOWN the moment B gives it a home: if
// `#seat-plan` exists in the view, that element is used and nothing is created.
// B's placement wins automatically, with no coordination — they add the div,
// this code stops firing, and neither side has to remember. Both halves are
// asserted below, because "it defers" is the half that makes it safe.
//
// ── AND THE RACE IT SURFACED, WHICH WAS THE BIGGER FIND ───────────────────
//
// With the panel finally mounting, the console showed
// `[seat-plan] Cannot read properties of null (reading 'pick_order')`.
// `myNextPicks()` read `state.data.pick_order` unguarded while `pickCoordinate`
// twenty lines away guarded the identical expression. `loadSeatPlan()` fires its
// own fetch in `init()` BEFORE the board's, so whenever seat_plan.json won the
// race the panel rendered against a board that had not arrived.
//
// TWELVE FUNCTIONS CALL `myNextPicks()`. The panel is simply the one that ran
// early enough to prove it.
//
// Run: node draft/tests/seat_panel_mounts.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const VIEW = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'warroom.ejs'), 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

// ── 1. THE MOUNTER EXISTS AND THE RENDERER USES IT ──────────────────────
const mounter = (function () {
  const i = SRC.indexOf('function seatPlanHost()');
  return i < 0 ? '' : SRC.slice(i, SRC.indexOf('\n  }', i) + 4);
})();
ck('there is a mounter', mounter.length > 200);
ck('and renderSeatPlan goes through it rather than reading the id directly',
  /const host = seatPlanHost\(\);/.test(SRC));
ck('it still bails when there is no plan to show — mounting an empty panel '
  + 'would be worse than none', /if \(!host \|\| !d\) return;/.test(SRC));

// ── 2. IT DEFERS TO B, WHICH IS WHAT MAKES IT SAFE ──────────────────────
// Drive the real function both ways against a DOM stub. Source-reading cannot
// tell "prefers the view's element" from "always creates one".
function drive(hasSeatDiv) {
  const made = [];
  const mk = id => ({ id: id, className: '', attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
    parentNode: null, nextSibling: null });
  const seat = hasSeatDiv ? mk('seat-plan') : null;
  const strip = mk('legality-strip');
  const room = mk('warroom');
  strip.parentNode = { insertBefore(el) { made.push({ where: 'after legality-strip', el: el }); } };
  room.insertBefore = function (el) { made.push({ where: 'top of warroom', el: el }); };
  const doc = {
    getElementById(id) {
      if (id === 'seat-plan') return seat;
      if (id === 'legality-strip') return strip;
      if (id === 'warroom') return room;
      return null;
    },
    createElement() { return mk(''); },
  };
  // eslint-disable-next-line no-new-func
  const fn = new Function('$', 'document', mounter + '; return seatPlanHost;')(
    id => (id === '#seat-plan' ? seat : null), doc);
  return { host: fn(), made: made };
}
{
  const withDiv = drive(true);
  ck('WHEN B PLACES THE DIV, it is used and NOTHING is created — their layout '
    + 'call wins with no coordination',
    withDiv.host && withDiv.host.id === 'seat-plan' && withDiv.made.length === 0,
    withDiv.made.map(m => m.where));
  ck('and the element it returns is the view\'s own, not a copy',
    withDiv.host && !withDiv.host.getAttribute('data-mounted-by'));

  const without = drive(false);
  ck('WHEN IT IS ABSENT, the panel mounts itself rather than vanishing',
    !!without.host && without.made.length === 1, without.made.length);
  ck('it anchors after the legality strip — seat AFTER "is my lineup legal", '
    + 'BEFORE "with whom"', without.made[0] && without.made[0].where === 'after legality-strip',
    without.made[0] && without.made[0].where);
  ck('and it LABELS itself as self-mounted, so nobody later reads it as a '
    + 'layout decision somebody made',
    without.host && /no #seat-plan in the view/.test(without.host.getAttribute('data-mounted-by') || ''),
    without.host && without.host.getAttribute('data-mounted-by'));
  ck('it carries the class the stylesheet targets, or it mounts unstyled',
    without.host && /seat-plan/.test(without.host.className), without.host && without.host.className);
}

// ── 3. THE STATE OF THE VIEW, RECORDED RATHER THAN ASSUMED ──────────────
// Not a failure either way — it is the fact that decides which branch runs on
// draft day, and it should be visible when B lands their half.
{
  const present = /id="seat-plan"/.test(VIEW);
  console.log('      view currently ' + (present ? 'HAS' : 'does NOT have')
    + ' #seat-plan — the ' + (present ? 'defer' : 'self-mount') + ' branch is live');
  ck('either branch leaves a usable host, so the panel appears on 08-22 '
    + 'regardless of which one it is', drive(present).host !== null);
}

// ── 4. THE RACE THE MOUNT SURFACED ──────────────────────────────────────
{
  const fn = (function () {
    const i = SRC.indexOf('function myNextPicks()');
    return i < 0 ? '' : SRC.slice(i, SRC.indexOf('\n  }', i) + 4);
  })();
  ck('myNextPicks is locatable', fn.length > 100);
  ck('it guards `state.data` before reaching into it',
    /state\.data && state\.data\.pick_order/.test(fn), fn.slice(-160));
  ck('CONTROL — pickCoordinate guarded the identical expression all along, '
    + 'which is what made the omission a slip rather than a policy',
    /var mine = \(state\.data && state\.data\.pick_order/.test(SRC));
  /* THE BLAST RADIUS, COUNTED. The seat panel is not special — it is just the
   * caller that runs early enough to lose the race. */
  const callers = (SRC.match(/myNextPicks\(\)/g) || []).length;
  ck('and it has many callers, so this was never a seat-panel bug', callers >= 8, callers);
  // FAIL ARM — the unguarded form, driven.
  const bad = () => { const state = { data: null };
    return (state.data.pick_order && state.data.pick_order.my_picks) || []; };
  let threw = null;
  try { bad(); } catch (e) { threw = e.message; }
  ck('FAIL ARM — the unguarded read really does throw on a board that has not '
    + 'loaded', /null|undefined/.test(threw || ''), threw);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the seat panel reaches the board whether or not the');
console.log('view carries its container, it hands placement straight back to B the moment');
console.log('they add one, and the unguarded board read it exposed is closed for all');
console.log('twelve callers rather than for the panel alone.');
console.log('WHAT IT DOES NOT: make JS-created layout a good idea. It is a stopgap so the');
console.log('panel is on the board for 08-22, labelled as one in the code, and it deletes');
console.log('itself in effect the moment the markup catches up.');
