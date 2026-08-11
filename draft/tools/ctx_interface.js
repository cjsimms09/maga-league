'use strict';
/* THE CONTEXT INTERFACE, EXTRACTED ONCE.
 *
 * Two suites need to know the same two facts — what the scoring side READS off
 * `ctx`, and what app.js's `context()` SUPPLIES. They had two different scrapers,
 * and the two disagreed the moment a key was written in ES6 shorthand:
 * app-wiring's regex requires a colon, so `totalPicks,` was invisible to it and
 * it raised a false gap on a field that was supplied. A guard that misreads valid
 * JavaScript generates false alarms, and false alarms are how a guard gets muted.
 *
 * Dual maintenance of the GUARD is the same disease as dual maintenance of the
 * value, so the derivation lives here and both suites read it.
 *
 * Not a test. A tool the tests share.
 */
const fs = require('fs');
const path = require('path');

const JS = path.join(__dirname, '..', '..', 'public', 'js', 'draft');

/* Comments stripped before ANY matching. A source guard once passed against
 * deliberately re-broken code because the regex matched the comment explaining
 * the fix rather than the code implementing it. */
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const readSrc = f => strip(fs.readFileSync(path.join(JS, f), 'utf8'));

/* The modules the app feeds. Scoping this to engine.js alone leaves a hole the
 * exact size of every other consumer — the seam sweep found ctx fields read by
 * survival.js and composite.js that engine.js never mentions. */
const CONSUMERS = ['engine.js', 'survival.js', 'composite.js', 'needrule.js']
  .filter(f => fs.existsSync(path.join(JS, f)));

/* Fields a consumer sets on ctx itself or derives internally — not the caller's
 * job. Each names WHY, so the exemption list cannot quietly become a place to
 * hide real gaps. */
const INTERNAL = {
  bestByPos: 'survival.js supplies it in the internal options object it passes to '
    + 'positionProbabilities, whose parameter is also called ctx',
  progress: 'same internal object — survival DERIVES it from ctx.totalPicks per '
    + 'intervening team (team.pick_no / ctx.totalPicks)',
};
/* Underscore-prefixed reads are memos and sort caches the modules ATTACH to
 * whatever context they were handed. Outputs of a scoring pass, never inputs. */
const isInternalName = k => k.startsWith('_') || k in INTERNAL;

/** Every `ctx.<field>` the scoring side reads, mapped to where it was first seen. */
function ctxReads(files) {
  const reads = new Map();
  (files || CONSUMERS).forEach(f => {
    const s = readSrc(f);
    const re = /\b(?:ctx|rawCtx|survivalCtx)\.([A-Za-z_$][\w$]*)/g;
    let m;
    while ((m = re.exec(s))) if (!reads.has(m[1])) reads.set(m[1], f);
  });
  return reads;
}

/* A KEY-POSITION STATE MACHINE, not a pattern match on lines.
 *
 * Two scrapers got this wrong in two different ways on the same afternoon. One
 * required a colon and so could not see ES6 shorthand. The other accepted any
 * depth-1 identifier followed by `:` `,` or newline, which read `null` out of
 * `... || null,` as a duplicate KEY and dropped `myPickIndex` entirely.
 *
 * The grammar is exact: inside an object literal a property name appears only
 * immediately after the opening brace, or after a comma AT THAT DEPTH. Anything
 * else at depth 1 belongs to a value expression. Keys are returned IN ORDER and
 * WITH duplicates, because a repeated key is itself a defect worth reporting —
 * JavaScript keeps the last, so the earlier expression is dead code that reads
 * as live.
 */
function objectLiteralKeys(src, from) {
  const open = src.indexOf('return {', from);
  if (open < 0) return null;
  let i = open + 'return '.length, depth = 0, keys = [], expectKey = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{' || c === '(' || c === '[') {
      depth++;
      if (depth === 1) expectKey = true;
      continue;
    }
    if (c === '}' || c === ')' || c === ']') { depth--; if (depth === 0) break; continue; }
    if (c === "'" || c === '"' || c === '`') {          // skip string bodies whole
      const q = c; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      continue;
    }
    if (depth !== 1) continue;
    if (c === ',') { expectKey = true; continue; }
    if (/\s/.test(c)) continue;
    if (!expectKey) continue;
    const m = /^([A-Za-z_$][\w$]*)/.exec(src.slice(i));
    if (m) { keys.push(m[1]); i += m[1].length - 1; }
    expectKey = false;
  }
  return keys;
}

/** Keys supplied by app.js's live `context()`. In order, duplicates included. */
function suppliedKeys(appSrc) {
  const src = appSrc || readSrc('app.js');
  const at = src.indexOf('function context()');
  if (at < 0) return null;
  return objectLiteralKeys(src, at);
}

module.exports = { JS, CONSUMERS, INTERNAL, isInternalName, strip, readSrc,
                   ctxReads, suppliedKeys, objectLiteralKeys };
