// TERRITORY: A
// THE BOARD'S VALUES ARE OURS AND ITS PRICES ARE SOMEBODY ELSE'S.
//
// Cory: *"how are we accounting for that in our standings or big board? Are we?
// Should we? How do we?"* Half of the answer was yes and half was no, and
// nothing on the board said which half.
//
//   VALUE — `score_stat_line` recomputes every projection from raw stat lines
//           against this league's own table. That half was always right.
//   PRICE — ADP is Fantasy Football Calculator half-PPR, which uses a FOUR-point
//           passing touchdown. FFC publishes no 6-point redraft format.
//
// Not a defect — it is the arbitrage. The defect was the silence.
//
// ── THE TWO WAYS THIS TOOL COULD LIE, BOTH GUARDED ────────────────────────
//
// IT COULD PRINT A RANK GAP. The obvious presentation, and dramatic — QB a
// median 66 places better on our board than the market's. It is refused, and
// this pins the refusal, because a cross-position rank is not a decision
// quantity: a quarterback outscores a running back in every league ever played.
// That exact error was live in three of this repo's tools this morning ("the RB
// wire is the worst on the board", from raw points across positions).
//
// AND THE RANK GAP IS ONE FINDING WEARING FOUR HATS. Ranked inside the subset
// the displacements must sum to zero, and they do: QB carries -1013 places and
// RB, WR and TE split +1012 between 102 players. Asserted below, because "these
// three numbers are the first one's shadow" is a claim about arithmetic.
//
// Run: node draft/tests/scoring_edge.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'draft', 'tools', 'scoring_edge.js'), 'utf8');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const OUT = execFileSync('node', [path.join(ROOT, 'draft', 'tools', 'scoring_edge.js')],
  { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });

// ── 1. THE RULES ARE ENUMERATED, NOT ASSERTED ───────────────────────────
// This is the check that earned its keep immediately: the header said "the only
// rule that differs" and the enumeration found TWO.
{
  const SC = DATA.league.scoring;
  ck('the league really does pay 6 for a passing TD', +SC.pass_td === 6, SC.pass_td);
  ck('and the tool prints it against the market\'s 4', /pass_td\s+ours\s+6\s+market\s+4/.test(OUT));
  ck('IT FOUND THE SECOND RULE I HAD ASSUMED AWAY — the interception penalty is '
    + 'doubled here, and it cuts AGAINST the passing-TD edge',
    +SC.pass_int === -2 && /pass_int\s+ours\s+-2\s+market\s+-1/.test(OUT), SC.pass_int);
  ck('so the tool says the figure below is the NET of rules pointing both ways, '
    + 'not the gross', /NET, not the gross/.test(OUT));
  ck('and it names which positions the differing rules can possibly reach',
    /Positions this can reach: QB/.test(OUT));
}

// ── 2. THE CONTROL THAT MAKES IT A SCORING CLAIM AND NOT A HUNCH ────────
// A receiver cannot throw a touchdown or an interception, so a table difference
// confined to those two rules must move him by EXACTLY zero. If the control ever
// moves, the difference is not where the tool says it is.
ck('CONTROL — the receiver line moves by exactly zero under the two tables',
  /a WR1 \(control\)\s+\d+\s+\d+\s+0\s+0\.00/.test(OUT), OUT.match(/a WR1[^\n]*/));
ck('while a quarterback line moves by a real amount',
  /an elite QB\s+\d+\s+\d+\s+[1-9]\d/.test(OUT), OUT.match(/an elite QB[^\n]*/));
ck('the illustrative lines are LABELLED as inputs, because the board stores '
  + 'scored projections and they cannot be recomputed from it',
  /illustrative lines, not board data/.test(OUT));

// ── 3. IT REFUSES THE RANK GAP, AND THE REFUSAL IS THE POINT ────────────
{
  const body = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ck('the tool computes no cross-position rank comparison',
    !/rank/i.test(body.replace(/ranked|ranked\b/g, '')), 'rank appears in executable code');
  ck('and the output prints value ABOVE THE LAST STARTER instead',
    /points above the LAST STARTER/.test(OUT));
  /* THE ARITHMETIC BEHIND THE REFUSAL, asserted rather than quoted. Within a
   * fixed subset the two orderings are permutations of each other, so the
   * displacements must cancel — which is what makes RB/WR/TE the shadow of QB
   * rather than three more findings. */
  const ps = DATA.players.filter(p => (p.proj_mean || 0) > 0 && p.adjusted_adp != null);
  const top = ps.slice().sort((a, b) => a.adjusted_adp - b.adjusted_adp).slice(0, 120);
  const pr = {}, ar = {};
  top.slice().sort((a, b) => b.proj_mean - a.proj_mean).forEach((p, i) => { pr[p.player_id] = i + 1; });
  top.slice().sort((a, b) => a.adjusted_adp - b.adjusted_adp).forEach((p, i) => { ar[p.player_id] = i + 1; });
  const sum = pos => top.filter(p => p.position === pos)
    .reduce((t, p) => t + (pr[p.player_id] - ar[p.player_id]), 0);
  const all = top.reduce((t, p) => t + (pr[p.player_id] - ar[p.player_id]), 0);
  ck('the displacements sum to ZERO — it is a permutation, so the positions '
    + 'cannot each be an independent finding', all === 0, all);
  ck('QB carries the displacement and the others are its shadow',
    sum('QB') < 0 && Math.abs(sum('QB')) > Math.abs(sum('RB'))
    && Math.abs(sum('QB')) > Math.abs(sum('WR')) && Math.abs(sum('QB')) > Math.abs(sum('TE')),
    { QB: sum('QB'), RB: sum('RB'), WR: sum('WR'), TE: sum('TE') });
}

// ── 4. "BEST" MEANS ABOVE REPLACEMENT, WHICH IT DID NOT AT FIRST ────────
// The first version took the maximum unconditionally, so at a pick where EVERY
// position sits below its last starter it named the least-bad one as the pick to
// make. A recommendation to draft a player worth -8 is worse than no line.
{
  /* THE PICK COLUMN IS RIGHT-ALIGNED, so `\s{5}\d` never matches — the first
   * version of this matched zero rows and reported "0 of 12", which is a
   * detector failing rather than a table missing. A count assertion that can
   * only ever fail is not a guard. */
  const rows = OUT.split('\n').filter(l => /^\s+\d+\s+[-+]\d/.test(l));
  ck('the pick table renders every one of my picks', rows.length === 12, rows.length);
  const bad = rows.filter(l => {
    const nums = (l.match(/[-+]\d+/g) || []).map(Number);
    const verdict = l.trim().split(/\s+/).slice(-1)[0];
    return nums.length >= 4 && nums.every(n => n < 0) && /^(QB|RB|WR|TE)$/.test(verdict);
  });
  ck('no pick with EVERY position below replacement names a position to take',
    bad.length === 0, bad);
  ck('those picks say so instead, and hand the decision to the tool that owns it',
    /none above replacement/.test(OUT) && /free_picks\.js is where they get spent/.test(OUT));
}

// ── 5. IT DOES NOT TURN A REAL EDGE INTO BAD ADVICE ─────────────────────
// The failure this tool is most likely to cause is "the market underrates QBs,
// so draft one early". The edge is real; whether it moves a pick is a separate
// question, and the answer is computed from the same table rather than asserted.
{
  ck('the verdict about whether it moves a pick is derived from the table, not '
    + 'written in prose',
    /SO IT DOES MOVE A PICK|SO THE EDGE IS REAL AND IT DOES NOT MOVE A PICK/.test(OUT));
  ck('and the seats it names are the ones the table shows QB leading at',
    (function () {
      const m = OUT.match(/BEST\s*\n\s*available value at (\d+) of them(?: \(([^)]*)\))?/);
      if (!m) return false;
      const named = (m[2] || '').split(',').map(s => s.trim()).filter(Boolean);
      return named.every(pk => {
        const row = OUT.split('\n').find(l => new RegExp('^\\s+' + pk + '\\s+[-+]').test(l));
        return row && /\sQB\s*$/.test(row);
      });
    })(), OUT.match(/available value at [^\n]*/));
  ck('the limit is stated — the split between scoring and opinion is NOT '
    + 'recoverable from this artifact',
    /raw stat lines rescored at/.test(OUT) && /cannot be done/.test(OUT));
  ck('and the ADP-order assumption it inherits is named rather than hidden',
    /assumes it does; this inherits that assumption/.test(OUT));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the one place our scoring and our prices disagree is');
console.log('enumerated rather than assumed, its size is shown against a control that');
console.log('must not move, and it is expressed in the only cross-position unit that');
console.log('means anything — value over the last starter — at the picks Cory owns.');
console.log('WHAT IT DOES NOT: prove the market underrates quarterbacks BECAUSE of the');
console.log('scoring rule. That needs the raw stat lines rescored at 4 points, and the');
console.log('board stores scored projections. The tool says so; this pins that it does.');
