# ROUTED TO B — `h2h_agreement` is the single suite holding main red

**Not a flaky test. The test is right and CI is the only place telling the truth.**
Diagnosis only — `src/routes/h2h.js` and `src/routes/member.js` are B's lane and
the territory check refuses A on both (verified, not assumed).

---

## THE FAILURE

```
FAILED SUITES: h2h_agreement
FAIL offline, the two pages still agree
  -> {"matchup":["Marian","3","2"],"rivalry":["Marian","4","1"]}
```

One assertion. CI ran **152 suites / 1,714 assertions; 1,713 pass.** Red since
2026-08-11, 30+ consecutive runs.

## WHY IT PASSES LOCALLY AND FAILS IN CI

A local run prints `sleeper fetch failed: Sleeper 403 for /v1/state/nfl` and
**passes**. The arm sets up its precondition like this:

```js
await store.del('sleeper-cache');          // intending "now we are offline"
```

**Deleting the cache does not prevent a live REFETCH.** In a sandbox the refetch
403s, so the path really is offline. In CI it succeeds, so *the test named
"offline" is not offline there* — it asserts a precondition it never establishes.
That is rule 17 applied to a test: the boundary was inferred, not tested.

## THE REAL DEFECT THE TEST IS EXPOSING

The two pages resolve the same owner to a Sleeper `user_id` by **different
rules**, so when the live bundle is reachable they can pick different ids and
report different records for the same pair.

`/matchup` — `src/routes/member.js:2069`
```js
const uidOf = (o) => {
  const live = invUserMap && invUserMap[o.id];
  if (live && archiveIds.has(live)) return live;      // 1. live, if the archive knows it
  return H2H.userIdForName(o.name, o.alias) || live || null;   // 2. name OR ALIAS  3. live anyway
};
```

`/rivalry` — `src/routes/member.js:1101`
```js
const rec = H2H.headToHead(H2H.userIdForName(aName), H2H.userIdForName(bName));
//                                            ^ no alias, no live map, no fallback
```

**Three divergences, any one of which can pick a different id:**

| | `/matchup` | `/rivalry` |
|---|---|---|
| live bundle id | preferred when the archive knows it | **never consulted** |
| alias | **passed** (`o.name, o.alias`) | **not passed** (name only) |
| fallback when the name map misses | falls back to `live` | returns `null` |

The suite's FIRST arm — both pages with the live bundle — **passes**. It is the
second arm that breaks, which is consistent with the refetch handing `/matchup` a
real-Sleeper id path while `/rivalry` stays on the name map.

## WHAT WOULD ACTUALLY CLOSE IT

Two separate things, and only the first is the defect:

1. **ONE RESOLVER.** Both pages should call the same `uidOf`. This is the
   two-places disease — the identical class as six copies of the flex map and
   four copies of the keeper lookup. The fix is not to make `/rivalry` match
   `/matchup`'s current behaviour by hand; it is that there is one function.
2. **THE TEST SHOULD ESTABLISH ITS OWN PRECONDITION.** `store.del(...)` is not
   "offline". The arm needs to block the fetch and then ASSERT it is offline, or
   it will keep meaning different things on different machines. Note this half
   is not urgent for correctness — it is urgent for the suite meaning the same
   thing everywhere.

**MAKING IT PASS IS NOT THE FIX.** If the offline arm is loosened, main goes
green and two pages still disagree about a head-to-head record in production.

## AND THE ANSWER TO CORY'S QUESTION

**Nothing that shipped on 08-12 is covered by this suite.** It landed 08-11 18:39
with B's h2h work; no 08-12 commit touches the h2h/rivalry/matchup path. The JS
step deliberately runs every suite and collects failures rather than aborting, so
**every other suite ran in CI and passed** — today's work was verified by the
gate; one unrelated suite made the gate report red the whole time.
