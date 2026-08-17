#!/usr/bin/env node
/**
 * DECISIONS-DRIFT CHECK — a mechanical first pass on DECISIONS-NEEDED.md's OPEN
 * section, built 2026-08-15 after four "open" items in one afternoon turned out
 * to already be resolved in code (a heading-collision reorg problem, a cron the
 * doc still quoted as broken, and two weight values the doc recommended that had
 * already been explicitly overruled by later decisions).
 *
 * THREE OF THOSE FOUR were literal values quoted in prose (a cron string, two
 * weight numbers) that had simply drifted from the code. That class is
 * mechanically checkable — this script checks it. It does NOT catch the fourth
 * class (an entry superseded by a ruling recorded elsewhere with no shared
 * literal to diff, like the F4 heading-collision) — that still needs a human
 * read. This is a FIRST PASS, not a replacement for verification, and says so in
 * its own output.
 *
 * WHAT IT CHECKS, for every `## ` entry between "# OPEN" and "# RESOLVED":
 *   1. Cron-shaped spans (`'NN NN * * N'`) — does this exact string still exist
 *      in any .github/workflows/*.yml? If a quoted "the bug is X" cron is GONE
 *      and a quoted "recommend Y" cron IS live, that is a strong resolved signal.
 *   2. Weight-key numeric claims (`ceiling: 0.65`, `stack ~0.5`, etc., for the
 *      composite's known weight keys) — does this match the CURRENT
 *      MEASURED_WEIGHTS / DEFAULT_WEIGHTS constant in engine.js?
 *
 * Output is advisory ("candidate drift, verify by hand"), never a silent verdict
 * — this project's own culture (rule 12, "document value eleven, do not sweep")
 * says a mechanical check that oversells its own certainty is worse than none.
 *
 * Run: node draft/tools/decisions_drift_check.js [path/to/DECISIONS-NEEDED.md]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const DOC_PATH = process.argv[2] || path.join(REPO, 'DECISIONS-NEEDED.md');
const ENGINE_PATH = path.join(REPO, 'public', 'js', 'draft', 'engine.js');
const WORKFLOWS_DIR = path.join(REPO, '.github', 'workflows');

const WEIGHT_KEYS = ['value', 'tier', 'need', 'risk', 'ceiling', 'keeper', 'bye', 'stack'];
const CRON_RE = /\b\d{1,2}\s+\d{1,2}\s+\*\s+\*\s+\d\b/g;

function readSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } }

function extractOpenEntries(doc) {
  const openStart = doc.indexOf('\n# OPEN');
  const closedStart = doc.indexOf('\n# RESOLVED');
  if (openStart === -1) return [];
  const body = doc.slice(openStart, closedStart === -1 ? undefined : closedStart);
  const parts = body.split(/\n(?=## )/).slice(1); // drop the "# OPEN" line itself
  return parts.map(block => {
    const heading = (block.match(/^## (.+)$/m) || [, block.slice(0, 60)])[1];
    return { heading, text: block };
  });
}

function liveCronsIn(dir) {
  const found = new Set();
  if (!fs.existsSync(dir)) return found;
  for (const f of fs.readdirSync(dir)) {
    if (!/\.ya?ml$/.test(f)) continue;
    const src = readSafe(path.join(dir, f)) || '';
    (src.match(CRON_RE) || []).forEach(c => found.add(c.trim()));
  }
  return found;
}

function currentWeights(engineSrc) {
  const out = {};
  for (const name of ['MEASURED_WEIGHTS', 'DEFAULT_WEIGHTS']) {
    const m = engineSrc.match(new RegExp(name + '\\s*=\\s*\\{([^}]*)\\}', 's'));
    if (!m) continue;
    const obj = {};
    WEIGHT_KEYS.forEach(k => {
      const km = m[1].match(new RegExp('\\b' + k + '\\s*:\\s*(-?\\d+\\.?\\d*)'));
      if (km) obj[k] = parseFloat(km[1]);
    });
    out[name] = obj;
  }
  return out;
}

function checkCrons(entry, live) {
  const spans = new Set((entry.text.match(CRON_RE) || []).map(s => s.trim()));
  if (!spans.size) return [];
  return [...spans].map(cron => ({
    kind: 'cron', quoted: cron, liveNow: live.has(cron),
  }));
}

function checkWeightClaims(entry, weights) {
  const results = [];
  // "key: number", "key ~number", "key = number", "key at number", within ~20 chars
  const re = new RegExp('\\b(' + WEIGHT_KEYS.join('|') + ')\\b[^a-zA-Z0-9\\n]{0,15}(-?\\d\\.\\d+|-?\\d+)', 'gi');
  let m;
  while ((m = re.exec(entry.text))) {
    const key = m[1].toLowerCase();
    const claimed = parseFloat(m[2]);
    if (claimed > 3 || claimed < -3) continue; // out of weight range -> false hit (a year, a pick number, etc.)
    const measured = weights.MEASURED_WEIGHTS && weights.MEASURED_WEIGHTS[key];
    const dflt = weights.DEFAULT_WEIGHTS && weights.DEFAULT_WEIGHTS[key];
    results.push({ kind: 'weight', key, claimed, measured, dflt,
      matchesMeasured: measured != null && Math.abs(measured - claimed) < 1e-9,
      matchesDefault: dflt != null && Math.abs(dflt - claimed) < 1e-9 });
  }
  return results;
}

function main() {
  const doc = readSafe(DOC_PATH);
  const engineSrc = readSafe(ENGINE_PATH);
  if (!doc) { console.error('Could not read', DOC_PATH); process.exit(1); }
  if (!engineSrc) console.error('WARNING: could not read engine.js — weight checks skipped');

  const entries = extractOpenEntries(doc);
  const liveCrons = liveCronsIn(WORKFLOWS_DIR);
  const weights = engineSrc ? currentWeights(engineSrc) : {};

  console.log(`decisions_drift_check: ${entries.length} OPEN entries in ${path.relative(REPO, DOC_PATH)}\n`);
  console.log('ADVISORY ONLY — flags candidates for a human to verify. A clean report does not');
  console.log('mean an entry is current; it means this narrow check found nothing to flag.\n');

  let flagged = 0;
  for (const entry of entries) {
    const crons = checkCrons(entry, liveCrons);
    const weightClaims = checkWeightClaims(entry, weights);
    const notes = [];

    crons.forEach(c => {
      if (!c.liveNow) notes.push(`  cron \`${c.quoted}\` quoted in this entry is NOT found in any current workflow — if this was described as "the bug," it may already be fixed.`);
    });
    weightClaims.forEach(w => {
      if (w.measured != null && !w.matchesMeasured) {
        notes.push(`  "${w.key}" claimed ~${w.claimed} — current MEASURED_WEIGHTS.${w.key} is ${w.measured}. Mismatch: verify whether this entry predates a later ruling.`);
      }
    });

    if (notes.length) {
      flagged++;
      console.log(`⚠ ${entry.heading}`);
      notes.forEach(n => console.log(n));
      console.log();
    }
  }

  console.log(`${flagged} of ${entries.length} entries flagged for manual re-check.`);
  if (!flagged) console.log('(No cron or weight-value drift detected by this narrow check — other kinds of staleness, like a decision recorded elsewhere with no shared literal, are NOT covered.)');
}

main();
