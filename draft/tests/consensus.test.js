'use strict';
// TERRITORY: A
// CONTRACT C3, TESTED DIRECTLY — found 2026-08-15 with zero dedicated test file.
//
// public/js/draft/consensus.js is the ONE shared derivation Cory asked for so the
// draft board, waiver tool, and lineup optimizer can never label or value the same
// player differently. It had real but only INDIRECT coverage (waivers.test.js
// exercises the 1-source and 2-source paths through src/routes/waivers.js's
// delegation) — nothing tested the module directly, and nothing at all tested the
// THIRD source (proj_ownmodel, added the same day this file was written) or
// higherProjectionAlt(). Same class of gap as attach_own_model() and the four
// capture routes: real code, verified by hand or by accident, never pinned down.
//
// Run: node draft/tests/consensus.test.js
const path = require('path');
const C = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'consensus.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

// ── rawProjection: source counting and honest labelling ────────────────────
{
  const zero = C.rawProjection(null);
  ck('no player -> null value, never a fabricated number', zero.value === null && zero.sources.length === 0, zero);

  const empty = C.rawProjection({});
  ck('a player with no projection field at all -> null, not 0', empty.value === null, empty);

  const one = C.rawProjection({ proj_sleeper: 220 });
  ck('exactly 1 source -> named by that source, isConsensus:false',
    one.label === 'Sleeper proj' && one.isConsensus === false && one.value === 220, one);

  const two = C.rawProjection({ proj_sleeper: 220, proj_fantasypros: 232 });
  ck('exactly 2 sources -> "Consensus (2 src)", averaged',
    two.label === 'Consensus (2 src)' && two.isConsensus === true && two.value === 226, two);

  // OWN_V6 WITHDRAWN FROM DISPLAY, 2026-08-17 (Cory: "don't show v6 but keep
  // improving it and grading"). These three checks previously asserted the
  // OPPOSITE — that proj_ownmodel joined the average as a third source — so they
  // are the tests that must flip, and they are inverted rather than deleted so
  // the withdrawal stays pinned and a silent re-entry fails here.
  ck('the display flag is off — v6 is computed and graded, not shown',
    C.DISPLAY_OWNMODEL === false, C.DISPLAY_OWNMODEL);

  const three = C.rawProjection({ proj_sleeper: 200, proj_fantasypros: 210, proj_ownmodel: 190 });
  ck('our own model does NOT enter the displayed average: 2 src, not 3',
    three.label === 'Consensus (2 src)' && three.isConsensus === true && three.value === 205, three);
  ck('  ownmodel is absent from sources[]', three.sources.indexOf('ownmodel') === -1, three.sources);

  // A player carrying ONLY proj_ownmodel must not become invisible — the honest
  // answer is the artifact's own proj_mean, labelled by provenance, exactly as
  // for any player with no per-source columns at all.
  const onlyOwn = C.rawProjection({ proj_ownmodel: 150, proj_mean: 148 });
  ck('proj_ownmodel ALONE falls through to proj_mean rather than showing v6 or nothing',
    onlyOwn.value === 148 && onlyOwn.sources.indexOf('ownmodel') === -1 && onlyOwn.isConsensus === false, onlyOwn);
  const onlyOwnNoMean = C.rawProjection({ proj_ownmodel: 150 });
  ck('  and with no proj_mean either -> null, never the v6 number in disguise',
    onlyOwnNoMean.value === null, onlyOwnNoMean);

  const withFfc = C.rawProjection({ proj_sleeper: 100, proj_ffc: 120 });
  ck('proj_ffc participates in the average like any other source',
    withFfc.value === 110 && withFfc.sources.indexOf('ffc') !== -1, withFfc);
}

// ── rawProjection: the proj_mean fallback, and its provenance-derived label ─
{
  const noProv = C.rawProjection({ proj_mean: 180 });
  ck('proj_mean with no provenance falls back to "Sleeper proj" (today\'s only blended source)',
    noProv.label === 'Sleeper proj' && noProv.value === 180 && noProv.isConsensus === false, noProv);

  const withProv = C.rawProjection({ proj_mean: 180 }, { projections: { source: 'sleeper_projections' } });
  ck('provenance names the true source even when it is the raw artifact key, not the clean one',
    withProv.sources[0] === 'sleeper_projections' && withProv.label === 'Sleeper proj', withProv);

  const perSourceWins = C.rawProjection({ proj_mean: 999, proj_sleeper: 200 }, { projections: { source: 'fantasypros' } });
  ck('a per-source field always wins over proj_mean, even a stale/wrong proj_mean',
    perSourceWins.value === 200 && perSourceWins.sources[0] === 'sleeper', perSourceWins);
}

// ── cleanSource: labels are honest, not a guess ─────────────────────────────
{
  ck('cleanSource maps the raw artifact key to the clean label', C.cleanSource('sleeper_projections') === 'Sleeper');
  ck('cleanSource maps ownmodel to "Our model"', C.cleanSource('ownmodel') === 'Our model');
  ck('cleanSource passes an unknown source through rather than hiding it', C.cleanSource('some_new_feed') === 'some_new_feed');
  ck('cleanSource on nothing falls back to the generic "proj"', C.cleanSource(null) === 'proj' && C.cleanSource('') === 'proj');
}

// ── higherProjectionAlt: the disagreement moment ─────────────────────────────
{
  const rec = { player: { player_id: '1', position: 'WR', proj_sleeper: 150 } };
  const higherSamePos = { player: { player_id: '2', position: 'WR', proj_sleeper: 180 } };
  const lowerSamePos = { player: { player_id: '3', position: 'WR', proj_sleeper: 100 } };
  const higherDiffPos = { player: { player_id: '4', position: 'RB', proj_sleeper: 300 } };

  const found = C.higherProjectionAlt(rec, [higherSamePos, lowerSamePos, higherDiffPos]);
  ck('finds the same-position alternative that projects higher than the recommendation',
    found && found.alt.player_id === '2' && found.rec_proj === 150 && found.alt_proj === 180, found);
  ck('  delta is the rounded gap between them', found && found.delta === 30, found);

  const crossPosOnly = C.higherProjectionAlt(rec, [higherDiffPos]);
  ck('a higher-projection CROSS-position player is never flagged (RB > WR is scoring units, not a disagreement)',
    crossPosOnly === null, crossPosOnly);

  const noneHigher = C.higherProjectionAlt(rec, [lowerSamePos]);
  ck('no candidate projects higher -> null, not a false alarm', noneHigher === null, noneHigher);

  ck('a recommendation with no player -> null, never throws', C.higherProjectionAlt({}, [higherSamePos]) === null);
  ck('a recommendation with no resolvable projection -> null, never throws',
    C.higherProjectionAlt({ player: { player_id: '9', position: 'WR' } }, [higherSamePos]) === null);

  // Candidate pool can legitimately contain the recommended player itself
  // (e.g. the full ranked list, not a pre-filtered "everyone else" list) —
  // must never be flagged as its own better alternative.
  const poolWithSelf = [{ player: { player_id: '1', position: 'WR', proj_sleeper: 150 } }, higherSamePos];
  const selfExcluded = C.higherProjectionAlt(rec, poolWithSelf);
  ck('the recommended player is excluded from its own candidate pool by id, even projecting identically',
    selfExcluded && selfExcluded.alt.player_id === '2', selfExcluded);

  const top1 = C.higherProjectionAlt(rec, [higherSamePos], null, 1);
  const beyondWindow = [lowerSamePos, higherSamePos]; // higher one is 2nd, outside a withinTop:1 window
  const clipped = C.higherProjectionAlt(rec, beyondWindow, null, 1);
  ck('withinTop clips the candidate pool before comparing (default is 5, this checks it is honored, not ignored)',
    top1 !== null && clipped === null, { top1, clipped });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
