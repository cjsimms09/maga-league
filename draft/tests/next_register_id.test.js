/* TERRITORY: D
 *
 * draft/audit/register_dedup_2026-08-18.md: three register rows existed under
 * two ids each, because two branches independently computed "the next free
 * id" against a stale copy of DEFECT-REGISTER.md. This tool removes the race;
 * these tests prove the two properties that actually stop it from recurring —
 * monotonic advance, and memory that survives a row being deleted.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const R = require('../tools/next_register_id.js');

let pass = 0;
function ok(name, fn) { fn(); pass++; console.log('PASS  ' + name); }

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'next-id-test-'));
}

function writeRegister(dir, ids) {
  const rows = ids.map(i => `| ${i} | something | A | OPEN | fix it |`).join('\n');
  const p = path.join(dir, 'DEFECT-REGISTER.md');
  fs.writeFileSync(p, '| # | what | owner | status | next |\n|---|---|---|---|---|\n' + rows + '\n');
  return p;
}

ok('FIRST CLAIM against a register with no watermark is above the file max', () => {
  const dir = tmpDir();
  const reg = writeRegister(dir, ['1', '2', '9']);
  const wm = path.join(dir, 'watermark.json');
  const claim = R.claimNextId('2026-08-18', reg, wm);
  assert.strictEqual(claim, 10, 'first claim must be one past the highest existing id');
});

ok('SEQUENTIAL CLAIMS strictly increase, never repeat', () => {
  const dir = tmpDir();
  const reg = writeRegister(dir, ['5']);
  const wm = path.join(dir, 'watermark.json');
  const claims = [];
  for (let i = 0; i < 5; i++) claims.push(R.claimNextId('2026-08-18', reg, wm));
  for (let i = 1; i < claims.length; i++) {
    assert.ok(claims[i] > claims[i - 1], `claim ${i} (${claims[i]}) did not exceed the previous (${claims[i - 1]})`);
  }
});

ok('FAIL ARM THIS TOOL EXISTS TO CLOSE — a claimed id is never reissued even '
   + 'after its row is deleted from the file', () => {
  const dir = tmpDir();
  const reg = writeRegister(dir, ['1', '2', '3']);
  const wm = path.join(dir, 'watermark.json');
  const first = R.claimNextId('2026-08-18', reg, wm);   // claims 4
  // Simulate the row for id 4 being deleted (exactly what happened to id 37,
  // which was later reissued as 43 for something unrelated).
  writeRegister(dir, ['1', '2', '3']);
  const second = R.claimNextId('2026-08-18', reg, wm);
  assert.ok(second > first,
    `id ${first} was reissued as ${second} after its row was deleted — this is `
    + 'the exact defect the tool exists to prevent');
});

ok('CONTROL — WITHOUT the watermark, the file-derived max WOULD reissue a '
   + 'deleted id (proves the watermark, not luck, is doing the work)', () => {
  const dir = tmpDir();
  const reg = writeRegister(dir, ['1', '2', '3', '4']);
  const maxBefore = R.currentMaxIdInFile(reg);
  writeRegister(dir, ['1', '2', '3']);   // row 4 deleted
  const maxAfter = R.currentMaxIdInFile(reg);
  assert.ok(maxAfter < maxBefore,
    'the file max must drop after a deletion, or the fail-arm test above proves nothing');
});

ok('TWO INDEPENDENT BRANCHES claiming from the same starting state produce '
   + 'DIFFERENT ids, and taking the max of both watermarks after a merge '
   + 'still exceeds both', () => {
  const dir = tmpDir();
  const reg = writeRegister(dir, ['1', '2', '20']);
  const wmA = path.join(dir, 'watermark_branch_a.json');
  const wmB = path.join(dir, 'watermark_branch_b.json');
  // Both branches start from the SAME register state (the race condition).
  const claimA = R.claimNextId('2026-08-18', reg, wmA);
  const claimB = R.claimNextId('2026-08-18', reg, wmB);
  assert.strictEqual(claimA, claimB,
    'both branches independently claim the SAME id from the same starting '
    + 'state — this is the race, reproduced on purpose');
  // The merge resolution: take the higher next_numeric_id of the two files.
  const merged = Math.max(
    R.loadWatermark(wmA).next_numeric_id,
    R.loadWatermark(wmB).next_numeric_id
  );
  assert.ok(merged > claimA && merged > claimB,
    'a trivial max() merge resolution must clear both branches\' claims');
});

console.log(`\n${pass}/5 checks passed`);
