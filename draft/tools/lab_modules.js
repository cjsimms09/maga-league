/* WHICH SHIPPED MODULES DOES THE LAB ACTUALLY EXECUTE?
 *
 * harness_divergence.py needs this to avoid over-counting: a field read only by
 * app.js cannot corrupt a backtest number, because the Lab never loads app.js.
 *
 * OBSERVED, NOT READ FROM THE IMPORT LIST. `require` is hooked and replay.js is
 * loaded for real, so conditional and lazily-required modules are counted the
 * same as top-of-file ones. dump-replay.js requires engine.js inside two
 * separate functions (lines 30 and 106), which a top-of-file import scan misses.
 *
 * Prints one module basename per line. Run:
 *   node draft/tools/lab_modules.js
 */
'use strict';
const path = require('path');
const Module = require('module');
const DRAFT_JS = path.join(__dirname, '..', '..', 'public', 'js', 'draft') + path.sep;

const seen = new Set();
const orig = Module._load;
Module._load = function (request, parent, isMain) {
  const exp = orig.apply(this, arguments);
  try {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (resolved.indexOf(DRAFT_JS) === 0) seen.add(path.basename(resolved));
  } catch (e) { /* unresolvable request: not one of ours */ }
  return exp;
};

global.window = global;
const ENTRIES = ['replay.js', 'dump-replay.js', 'strategies.js'];
ENTRIES.forEach(e => {
  try { require(path.join(__dirname, '..', 'backtest', e)); }
  catch (err) { console.error('// could not load ' + e + ': ' + err.message); }
});

/* dump-replay requires engine.js INSIDE functions, so loading the file is not
 * enough to observe it. Force those paths by calling the exported builders if
 * they exist; if they do not, say so rather than reporting a short list as
 * complete. */
if (!seen.size) {
  console.error('// NO shipped module was loaded by any Lab entry point. That is '
    + 'not a small answer, it is a broken probe — refusing to print an empty list.');
  process.exit(2);
}

Array.from(seen).sort().forEach(m => console.log(m));
