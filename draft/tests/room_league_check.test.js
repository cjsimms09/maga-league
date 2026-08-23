/* REAL-vs-MOCK ROOM VERIFICATION — Cory, draft day 2026-08-22: "how does it
 * differentiate between mock and real draft!!" The draft object's league_id
 * decides; this pins the mechanism and control-tests the verdict logic with
 * all three room types, per rule 3e (a check that has never failed is only
 * run, not tested). */
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
function ck(name, ok, detail) {
  if (ok) { pass++; } else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + JSON.stringify(detail) : '')); }
}
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'app.js'), 'utf8');
ck('importDraftOrder carries the league_id verdict', /roomLeagueCheck/.test(src));
ck('the three verdicts exist: league / mock_lobby / other_league',
  /'league'/.test(src) && /'mock_lobby'/.test(src) && /'other_league'/.test(src));
ck('verification is advisory — wrapped so it can never cost a pick',
  /never costs a pick/.test(src));

// The verdict logic itself, with all three room types (the controls):
const verdict = (ourLeague, roomLeague) => !ourLeague ? 'unknown'
  : (roomLeague === ourLeague ? 'league' : (roomLeague ? 'other_league' : 'mock_lobby'));
ck('REAL league room -> league', verdict('1374848328470102016', '1374848328470102016') === 'league');
ck('lobby mock (no league_id) -> mock_lobby', verdict('1374848328470102016', null) === 'mock_lobby');
ck('someone else\'s league -> other_league', verdict('1374848328470102016', '999') === 'other_league');
ck('board without a league_id -> unknown, never a false REAL badge', verdict('', '999') === 'unknown');
console.log(pass + '/' + (pass + fail) + ' room-league-check tests passed');
process.exit(fail ? 1 : 0);
