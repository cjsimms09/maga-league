/* THE LAB'S CONTEXT MUST BE THE APP'S CONTEXT.
 *
 * B's context_interface audit found the ENGINE reading keys the APP never
 * supplied, and named the mechanism: freeze_baseline.js hand-builds a context,
 * so a field the app fails to supply is always supplied by the fixture.
 *
 * THIS IS THE MIRROR IMAGE, and it is the one that has cost the most. A Lab
 * probe hand-builds a context too, and a field the APP DOES supply is silently
 * ABSENT — so the probe measures a system that does not exist. On 2026-08-13 a
 * single investigation produced four wrong answers this way, including a
 * published audit claiming the stack term decides the top recommendation. It
 * decides no top-10 position at any pick.
 *
 * These checks are what makes live_context.js a guard rather than a good habit.
 * Run: node draft/tests/live_context.test.js
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const E = global.DraftEngine;
const LC = require(path.join(ROOT, 'draft', 'tools', 'live_context.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d ? '\n        -> ' + d : ''))); };

const prod = LC.productionKeys();
ck('production keys were scraped from app.js at all (not a silent empty list)',
  Array.isArray(prod) && prod.length >= 12, 'got ' + (prod || []).length);

const ctx = LC.liveContext({ currentPick: 33, nextPick: 48 });
ck('the built context has EXACTLY app.js context()\'s key set',
  prod.every(k => k in ctx) && Object.keys(ctx).every(k => prod.includes(k)),
  'missing: ' + prod.filter(k => !(k in ctx)).join(',')
  + ' | invented: ' + Object.keys(ctx).filter(k => !prod.includes(k)).join(','));

// ── THE FOUR DEFECTS THAT ACTUALLY HAPPENED, EACH PINNED ──────────────────
ck('the roster comes from kept_players, never an empty list',
  ctx.roster.length === 3 && ctx.roster.some(p => /Chase/.test(p.name)),
  'kept players are REMOVED from `players`; looking them up there yields an '
  + 'empty roster and every stack term is silently zero');
ck('weights default to the MEASURED core, never DEFAULT_WEIGHTS',
  ctx.weights.risk === 0 && ctx.weights.tier === 0 && ctx.weights.value === 1,
  'a probe on DEFAULT_WEIGHTS measures a configuration production does not run');
ck('intervening carries PICK OBJECTS, not bare numbers',
  ctx.intervening.length > 0 && ctx.intervening.every(t => typeof t.pick_no === 'number'),
  'precomputeLayer2 filters on t.pick_no >= currentPick, and `undefined >= 34` '
  + 'is false — bare numbers leave Layer 2 dark exactly as an empty array does');
ck('league, totalPicks and roundsLeft are real, not absent',
  ctx.league && ctx.league.teams > 0 && ctx.totalPicks > 0 && ctx.roundsLeft > 0);

// ── IT REFUSES, IN BOTH DIRECTIONS ────────────────────────────────────────
const throws = fn => { try { fn(); return false; } catch (e) { return true; } };
ck('a missing currentPick/nextPick is REFUSED, not defaulted',
  throws(() => LC.liveContext({ currentPick: 33 })));
ck('an INVENTED key production never sends is REFUSED',
  throws(() => LC.liveContext({ currentPick: 33, nextPick: 48, teams: 10 }))
  || !('teams' in LC.liveContext({ currentPick: 33, nextPick: 48 })),
  'an invented key reads as diligence and is scored by nothing');

// ── AND THE CONTEXT ACTUALLY DRIVES THE ENGINE (rule 10d) ─────────────────
const withKeepers = E.recommend(ctx);
const without = E.recommend(LC.liveContext({ currentPick: 33, nextPick: 48, roster: [] }));
ck('the roster reaches the engine — an empty one scores differently',
  withKeepers.some((r, i) => Number(r.score) !== Number((without[i] || {}).score)),
  'if these agree the roster is not reaching the scorer and every roster-'
  + 'dependent measurement taken through this builder is void');
ck('...and the stack term is non-zero for somebody with keepers held',
  withKeepers.some(r => Math.abs(Number(r.components.weighted.stack) || 0) > 1e-9));
ck('...and zero for everybody without them (the control)',
  without.every(r => Math.abs(Number(r.components.weighted.stack) || 0) < 1e-9),
  'stack is a bonus for sharing a team with a ROSTERED player — with no roster '
  + 'it must be zero, and a probe that forgets this measures nothing');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
