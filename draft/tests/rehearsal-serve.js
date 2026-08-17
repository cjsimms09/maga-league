/* WAR-ROOM REHEARSAL SERVER — the missing half of rehearsal-mock3.js.
 *
 * rehearsal-mock3.js is the closest thing this repo has to a draft-night dress
 * rehearsal: it drives the real war room in a real browser and checks nineteen
 * things Cory depends on (the clock advancing in manual mode, "➕ Me" landing on
 * the roster, the legality strip being present rather than present-but-invisible,
 * the exit warning with no DEF and no K, the deviation badge staying silent
 * inside the noise band and speaking outside it).
 *
 * IT WAS UNRUNNABLE OUTSIDE A CONFIGURED MACHINE, and that is why: its header
 * says `PORT=8925 node dev-server.js &`, and the war room sits behind auth —
 * /admin/warroom returns 302 unauthenticated. A research sandbox has no
 * credentials, so on 2026-08-17 the single most draft-relevant check in the repo
 * was recorded as "only Cory can run this".
 *
 * IT NEVER NEEDED REAL CREDENTIALS. `rehearsal-keepers.js` had the pattern all
 * along: point DATA_DIR at a temp directory, seed the store, set a known
 * password, and serve in-process. This is that pattern applied to the war room,
 * so the rehearsal runs anywhere Chromium does.
 *
 * NOTHING REAL IS TOUCHED. DATA_DIR is a fresh mkdtemp, so the seeded owner and
 * the password below exist only inside a throwaway directory — the live store is
 * never opened, let alone written. The board comes from the REAL
 * public/draft_data.json, which is the point: this rehearses the war room
 * against the board that actually ships.
 *
 * Run:
 *     node draft/tests/rehearsal-serve.js &
 *     WR_USER=cory WR_PASS=pw node draft/tests/rehearsal-mock3.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.PORT || 8925);

/* BEFORE anything from src/ is required: the store reads DATA_DIR at load. */
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-rehearsal-'));

const store = require(path.join(ROOT, 'src', 'store'));
store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  if (!cory) {
    console.error('SEED FAILED: no owner named cory. The rehearsal logs in as '
      + 'that user; without it every check below would fail for the wrong '
      + 'reason.');
    process.exit(1);
  }
  cory.password_hash = hashPassword(process.env.WR_PASS || 'pw');
  cory.must_change_password = false;
  cory.is_commissioner = true;
  await store.set('owners', owners);

  createApp().listen(PORT, () => {
    console.log(`war-room rehearsal server on ${PORT} (DATA_DIR=${process.env.DATA_DIR})`);
    console.log('  now run:  WR_USER=cory WR_PASS=pw node draft/tests/rehearsal-mock3.js');
  });
})();
