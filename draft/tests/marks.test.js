'use strict';
// MARKS — the auto badges: the GOAT that tracks whoever rosters Mahomes, and the
// owner-flag fold. Pure.
const path = require('path');
const M = require(path.join(__dirname, '..', '..', 'src', 'routes', 'marks'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

(function () {
  const map = { '1': 10, '2': 20, '3': 30 };   // roster_id -> owner_id
  const sData = { rosters: [
    { roster_id: 1, players: ['111', '222'] },
    { roster_id: 2, players: [M.MAHOMES_ID, '333'] },   // owner 20 has Mahomes
    { roster_id: 3, players: ['444'] },
  ] };

  ck('goatOwnerId finds the owner rostering Mahomes (by id)', M.goatOwnerId(sData, map) === 20, M.goatOwnerId(sData, map));

  // name fallback when the id has drifted but a players DB is on hand
  const sData2 = { rosters: [{ roster_id: 3, players: ['99999'] }] };
  const db = { players: { '99999': { name: 'Patrick Mahomes', pos: 'QB', team: 'KC' } } };
  ck('goatOwnerId falls back to name match', M.goatOwnerId(sData2, map, db) === 30);

  ck('goatOwnerId null when nobody rosters him', M.goatOwnerId({ rosters: [{ roster_id: 1, players: ['x'] }] }, map) === null);
  ck('goatOwnerId null off-season (no data)', M.goatOwnerId(null, map) === null);

  ck('isKC true for a KC player row', M.isKC({ team: 'KC' }) === true);
  ck('isKC false otherwise', M.isKC({ team: 'BUF' }) === false && M.isKC(null) === false);

  const owners = [{ id: 10, name: 'Cory' }, { id: 20, name: 'David' }, { id: 30, name: 'Sam' }];
  const flagOf = n => (n === 'David' ? '🇩🇪' : '🇺🇸');
  const flags = M.ownerFlags(owners, flagOf, 20);
  ck('ownerFlags folds the GOAT onto Mahomes\' owner', flags[20] === '🇩🇪 🐐', flags[20]);
  ck('ownerFlags keeps nationality for the rest', flags[10] === '🇺🇸' && flags[30] === '🇺🇸');
  ck('ownerFlags no goat when goatId null', M.ownerFlags(owners, flagOf, null)[20] === '🇩🇪');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
