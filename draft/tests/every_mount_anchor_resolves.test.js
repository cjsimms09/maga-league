// TERRITORY: A
/* THREE OF THE FOUR SELF-MOUNTING PANELS WERE ANCHORED TO IDS THAT DO NOT
 * EXIST. That is not three mistakes; it is one missing check, and this is it.
 *
 * app.js has four `*Host()` functions that create their own container when the
 * view has no element for them. Each tries to place that container next to an
 * anchor it names by id. Found 2026-08-20, two days before the draft, by B's
 * live sweep and mine landing on the same code from opposite directions:
 *
 *   · `#source-boards`  → anchored to `#roster-builder`, which has never
 *     existed. It SURVIVED only because its author happened to write
 *     `getElementById('roster-builder') || getElementById('pos-recs-out')`
 *     and the fallback was real. Fixed separately.
 *   · `#mlv-plan`       → anchored to `#roster-builder` too, with NO `||`.
 *     Falls through to `room.appendChild`, landing outside `.wr-zone1` with no
 *     CSS order rule at all — position undefined, not chosen. And the id it
 *     wanted is one word longer: `#roster-builder-mlv` is real, is in
 *     `warroom.ejs`, and already has `.wr-zone1 > #roster-builder-mlv
 *     { order: 6 }` in style.css.
 *   · `#proj-source`    → never mounted at all in B's live drive, for an
 *     unrelated reason (a function-name collision).
 *   · `#seat-plan`      → the one that is correct: `#legality-strip` is real.
 *
 * WHY NOTHING CAUGHT IT. A panel that mounts into a container appended to the
 * wrong parent still renders. The render function runs, the fetch resolves,
 * the surface contract sees a string, every test passes — and Cory does not
 * see the panel, or sees it somewhere arbitrary. `data-mounted-by` was
 * invented to make exactly this visible and nothing reads it.
 *
 * SCOPE, MEASURED, so this stays a specific check and not a style rule: four
 * host functions, four anchors named across them, three of the four ids absent
 * from the view. This asserts every anchor id a `*Host()` function names is an
 * id the war-room template actually contains.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
function ck(what, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + what); }
  else { fail++; console.log('  FAIL ' + what + (detail !== undefined ? '  ->  ' + detail : '')); }
}

const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const VIEW = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'warroom.ejs'), 'utf8');

/* Ids the template declares. `id="x"` and `id='x'`; EJS interpolation is not
 * used for these hosts, and if it ever is, this test going red is correct —
 * an id assembled at render time cannot be verified here. */
const viewIds = new Set(
  [...VIEW.matchAll(/\bid=["']([A-Za-z][\w-]*)["']/g)].map(m => m[1])
);

/* Each self-mounting host: the block from `function xHost()` to its closing
 * brace, and every id it hands to getElementById inside that block. */
function hostBlocks(src) {
  const out = [];
  const re = /^  function (\w*Host)\s*\(\)\s*\{/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    const start = m.index;
    const end = src.indexOf('\n  }\n', start);
    out.push({ name: m[1], body: src.slice(start, end === -1 ? start + 2000 : end) });
  }
  return out;
}

/* ── CONTROLS FIRST. A scanner over source text is the exact shape that
 * returns a clean confident answer while matching nothing (rule 3e). ────── */
{
  const synthetic = [
    '  function fakeHost() {',
    "    const found = $('#fake');",
    "    const anchor = document.getElementById('does-not-exist');",
    '    return anchor;',
    '  }',
    '',
  ].join('\n');
  const blocks = hostBlocks(synthetic);
  ck('CONTROL: the scanner finds a host function and its anchor',
    blocks.length === 1
    && /getElementById\('does-not-exist'\)/.test(blocks[0].body),
    JSON.stringify(blocks.map(b => b.name)));
  ck('CONTROL: the view-id scanner reads real ids out of the template',
    viewIds.has('warroom') || viewIds.size > 20, viewIds.size);
  ck('CONTROL: and it does NOT claim an obviously absent id exists',
    !viewIds.has('definitely-not-an-id-in-this-file'), null);
}

/* KNOWN, OWNED, AND DATED — not forgiven, and currently empty.
 *
 * `mlvPlanHost` → `#roster-builder` was the one row here (B, 2026-08-20/21):
 * fixed same night, anchor repointed at the real `#roster-builder-mlv`
 * (which already carried its own CSS order) and `#mlv-plan` given an order
 * rule of its own — B's placement call, measured live at 1280px, not A's.
 * Row removed rather than left stale, per this file's own rule below.
 *
 * ⚠️ THIS LIST IS NOT A PLACE TO PUT A NEW ONE CASUALLY. Any anchor not
 * named here fails the build, which is the whole point — three of four
 * hosts were written against absent ids and nothing noticed for weeks. */
const KNOWN_DEAD_ANCHORS = new Set([]);

/* ── THE GUARD ─────────────────────────────────────────────────────────── */
const blocks = hostBlocks(APP);
ck('found the self-mounting host functions to check', blocks.length >= 3,
  blocks.map(b => b.name).join(', '));

for (const b of blocks) {
  const ids = [...b.body.matchAll(/getElementById\(\s*['"]([\w-]+)['"]\s*\)/g)]
    .map(m => m[1]);
  //: `warroom` is the room itself and is the legitimate last resort, not an anchor
  const anchors = ids.filter(id => id !== 'warroom');
  if (!anchors.length) continue;
  const allMissing = anchors.filter(id => !viewIds.has(id));
  const known = allMissing.filter(id => KNOWN_DEAD_ANCHORS.has(b.name + ':' + id));
  const missing = allMissing.filter(id => !KNOWN_DEAD_ANCHORS.has(b.name + ':' + id));
  for (const id of known) {
    console.log('  KNOWN ' + b.name + ' anchors to #' + id + ', which does not exist '
      + '— owned by B, Friday 12:00 default, ROUTES 2026-08-21. The real host is '
      + '#roster-builder-mlv.');
  }
  ck(b.name + ': every anchor id it names exists in warroom.ejs (' + anchors.join(', ') + ')',
    missing.length === 0,
    missing.length
      ? missing.join(', ') + ' — the panel will fall through to whatever comes '
        + 'after the `||`, or to room.appendChild if there is no `||`, and land '
        + 'somewhere nobody chose. It will still RENDER, which is why no other '
        + 'test sees this. Point it at a real host and give that host a CSS '
        + 'order rule in the same commit.'
      : undefined);
}

/* ── THE ALLOWLIST MUST NOT BE ABLE TO ROT ──────────────────────────────
 * A known-defect list that outlives its defect turns into a permission slip.
 * If someone fixes mlv-plan and leaves the row here, the guard silently stops
 * checking that host — so the row is required to still describe a real,
 * present defect. */
{
  const stillDead = [];
  for (const b of hostBlocks(APP)) {
    for (const m of b.body.matchAll(/getElementById\(\s*['"]([\w-]+)['"]\s*\)/g)) {
      const key = b.name + ':' + m[1];
      if (KNOWN_DEAD_ANCHORS.has(key) && !viewIds.has(m[1])) stillDead.push(key);
    }
  }
  ck('every KNOWN_DEAD_ANCHORS row still names a live defect (remove it when fixed)',
    stillDead.length === KNOWN_DEAD_ANCHORS.size,
    'listed ' + [...KNOWN_DEAD_ANCHORS].join(', ') + ' but only found '
    + (stillDead.join(', ') || 'none') + ' still broken — delete the stale row, '
    + 'it is suppressing a check on a host that no longer needs suppressing');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
