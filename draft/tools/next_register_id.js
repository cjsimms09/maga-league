/* TERRITORY: D. A structural fix for the defect draft/audit/register_dedup_2026-08-18.md
 * found and patched by hand: three register rows existed twice, each half under
 * a DIFFERENT id, because two branches independently computed "the next free id"
 * against their own stale copy of DEFECT-REGISTER.md, both filed a row, and a
 * later merge's "id taken, renumber" step treated the collision as two different
 * findings competing for one number instead of recognising it as the SAME
 * finding filed twice. test_no_two_rows_share_an_id could never have caught
 * this -- the ids genuinely differed by the time anyone looked.
 *
 * A content-comparison guard (test_no_two_DIFFERENT_ids_carry_the_same_finding,
 * same date) catches the symptom after the fact. This is the other half: remove
 * the RACE that produces it, so there is nothing left for that guard to find.
 *
 * THE MECHANISM: a small git-tracked watermark file
 * (draft/data/register_id_watermark.json) remembers the highest id ever
 * claimed, INCLUDING ids whose row was later deleted or renumbered away --
 * which is exactly the gap that let id 37 (deleted, folded into DS3) get
 * reused as 43 for something else three merges later. Claiming an id both
 * reads the live register's current max AND advances the watermark past it,
 * then WRITES the watermark back as part of the same commit that adds the new
 * row. Two branches that each claim an id independently will each write a
 * DIFFERENT value into their own copy of this one-line JSON file -- so a later
 * merge shows a CONFLICT on next_numeric_id, not a silent duplicate. A
 * one-field numeric conflict ("take the higher value") is a mechanical,
 * five-second resolution; reconciling two divergent prose rows after the fact
 * is what took an hour tonight.
 *
 * THIS DOES NOT REPLACE THE CONTENT-COMPARISON GUARD. A row filed by hand,
 * without running this tool, is not covered by the watermark at all -- the
 * guard is still the backstop for that case, and remains in the test suite.
 *
 * Run: node draft/tools/next_register_id.js
 *   Prints the claimed id to stdout and exits 0. Advances the watermark file
 *   as a side effect -- COMMIT the watermark change together with the new row,
 *   in the same commit, or the reservation is worthless.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REGISTER = path.join(__dirname, '..', '..', 'DEFECT-REGISTER.md');
const WATERMARK = path.join(__dirname, '..', 'data', 'register_id_watermark.json');

function currentMaxIdInFile(registerPath) {
  const text = fs.readFileSync(registerPath || REGISTER, 'utf8');
  let max = 0;
  for (const line of text.split('\n')) {
    if (!line.startsWith('|') || line.startsWith('|---')) continue;
    const cells = line.slice(1, line.endsWith('|') ? -1 : undefined).split('|');
    const rid = (cells[0] || '').replace(/[*`]/g, '').trim();
    const m = /^(\d+)[a-z]?$/.exec(rid);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

function loadWatermark(watermarkPath) {
  const p = watermarkPath || WATERMARK;
  if (!fs.existsSync(p)) {
    return { next_numeric_id: 1, history: [] };
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function claimNextId(todayIso, registerPath, watermarkPath) {
  const wm = loadWatermark(watermarkPath);
  const fileMax = currentMaxIdInFile(registerPath);
  // The watermark's own memory is authoritative for ids that no longer appear
  // in the live file (deleted or renumbered away) -- that IS the gap this
  // tool closes. The file's current max only matters the FIRST time this
  // tool runs, before any watermark exists.
  const claim = Math.max(wm.next_numeric_id, fileMax + 1);
  wm.next_numeric_id = claim + 1;
  wm.history = wm.history || [];
  wm.history.push({ id: claim, claimed_at: todayIso });
  const outPath = watermarkPath || WATERMARK;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(wm, null, 1) + '\n');
  return claim;
}

if (require.main === module) {
  const today = new Date().toISOString().slice(0, 10);
  const id = claimNextId(today);
  process.stdout.write(String(id) + '\n');
  process.exit(0);
}

module.exports = { currentMaxIdInFile, loadWatermark, claimNextId, REGISTER, WATERMARK };
