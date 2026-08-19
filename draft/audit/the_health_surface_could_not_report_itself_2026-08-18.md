# E's twenty-fifth sweep — the one failure the health strip could not report was its own

**Session E (red team), 2026-08-18.** Draft-day robustness: what happens when
something in the war room breaks *while Cory is drafting*.

---

## THE FINDING

`renderAll` runs sixteen panels through `safeRender(name, fn)`. When one throws,
it lands in `state.renderFailures` and the block above announces it **by name**:

> *"PANEL(S) NOT UPDATING: … — those panels are showing an EARLIER pick. Do not
> draft off them; the rest of the board is current."*

**Six renders were not wired into that.** They were wrapped in bare
`catch (e) { /* never blocks the clock */ }` — isolation without announcement:
`assertPickState`, `renderAccountingNote`, **`renderSystemStrip`**,
`renderUnrecordedPicks`, `renderPickControls`, `renderLegality`.

**One of the six is structural rather than incidental.**

## WHY THE SYSTEM STRIP IS THE ONE THAT MATTERS

`renderSystemStrip` **is the health surface.** It is what tells Cory a
recommendation cannot be trusted — `SYNC STALE`, `SEAT UNKNOWN`, `thin
projections`, `board … h old — STALE`, `keeper slate mismatch`, `slate
unconfirmed`.

And its write order makes a silent failure worse than a visible one: it computes
the entire red/amber verdict first — reading `refreshSeat()`, `boardFreshness()`,
`state.sync.syncAgeMs()`, `provenance` — and assigns `host.className` and
`host.innerHTML` **only at the end**.

**So a throw anywhere in that computation left the PREVIOUS strip on screen.**
Not blank — a stale verdict, possibly an all-clear from a state that no longer
exists. And because the 1-second sync-age ticker re-calls it, a persistent throw
would freeze that stale all-clear for the rest of the draft.

**Every failure the strip reports is one it can see. Its own was the one it could
not.** That is precisely the shape the comment above `state.renderFailures`
already names:

> *"…turns a frozen panel from a visible crash into an invisible lie — strictly
> worse than the bug being fixed, and the exact `|| true` shape this repo keeps
> removing."*

**The mechanism for this existed. These six were simply not wired into it.**

## THE FIX — the repo's own mechanism, not a second one

```js
safeRender('pickState',       assertPickState);
safeRender('accountingNote',  renderAccountingNote);
safeRender('systemStrip',     renderSystemStrip);
safeRender('unrecordedPicks', renderUnrecordedPicks);
safeRender('pickControls',    renderPickControls);
safeRender('legality',        renderLegality);
```

The 1s ticker calls the strip from **outside** `renderAll`, where `safeRender` is
out of scope, so that path records into the same store under the same name — a
strip that throws only on the ticker would otherwise stay silently stale until
some unrelated render happened to run.

**No behaviour changes on the success path.** Isolation is unchanged; what
changes is that a failure is now named instead of swallowed.

## MY FIRST FIX WAS WRONG AND TWO EXISTING GUARDS CAUGHT IT

I first added a bespoke wrapper that painted the strip red itself. **Two suites
went red and both were right:**

- **`render_isolation.test.js`** injects a throw at each render call in
  `renderAll` and requires the others to still run. My wrapper was called bare,
  so a throw *in the wrapper* killed the rest of the pass. **It broke the very
  isolation property I was trying to protect.**
- **`panel_spec.test.js`** requires every painting function to be described in
  `panel_spec.js`. My wrapper painted and was undocumented — *"a panel Cory can
  see and B cannot read about is exactly the gap he reported."*

Both are recorded here rather than quietly fixed, because the lesson is the
useful part: **the repo already had one panel-failure mechanism, and my instinct
was to build a second.** Using `safeRender` satisfies both guards for free.

## FLAGS THAT DIED THIS SWEEP

1. **Module load failure.** 20 module globals are referenced through
   `typeof X !== 'undefined'` guards, which looked like 20 silent degradation
   paths. Measured: most have **bare** uses elsewhere, so a missing module throws
   loudly rather than degrading quietly, and `script_load_order.test.js` already
   enforces that every unguarded global is in the page include and ordered before
   `app.js`. `const E = window.DraftEngine` at line 10 is bare — a missing engine
   fails at first use. **Handled by design.**
2. **`localStorage` silent catches.** 58 silent catches in `app.js`; filtering
   out storage operations leaves 32, and storage is exactly where a silent catch
   is correct (private mode, quota).
3. **My own measurement error, twice.** My first pass at counting guarded-vs-bare
   uses stripped string literals — which destroyed the `'undefined'` inside the
   guard pattern and reported every module as unguarded. A measurement that
   cannot see its own subject reads exactly like a clean result.

## WHAT THIS SWEEP DOES **NOT** COVER

1. **It could not simulate a throw.** There is no DOM harness in this repo;
   suites are source-inspection. The finding rests on two source facts — the
   write order, and the swallowing call sites — not on an observed stale strip.
2. **It does not audit what could throw inside the strip.** Reachability is
   argued from its callees, not demonstrated.
3. **The `layoutPinned` block keeps its silent catch**, correctly — its own
   comment says cosmetic, and a frozen layout offset is not a lie about the board.

### ASK / EVIDENCE / REC / DEFAULT → **A**

```
ASK:      None. The fix uses your existing mechanism and adds no new surface.
EVIDENCE: renderSystemStrip -- the health surface -- was one of six renders
          whose failure was neither recorded nor named, and it writes to the
          DOM only after computing the verdict, so a throw left a stale
          all-clear rather than a blank.
REC:      Worth knowing that render_isolation and panel_spec both caught my
          first attempt. They are doing real work and are cheap to run.
DEFAULT:  Shipped. Success path unchanged; only the catch arm moved.
```
