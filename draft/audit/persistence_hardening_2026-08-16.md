# PERSISTENCE HARDENING — external whole-repo audit, 2026-08-16

**Commissioned by Cory. Executed by the relay session line, house disciplines:
every defect proven RED before its fix, then GREEN by the same test; the red
runs below are the unedited evidence artifacts.** Six findings — three HIGH
app-persistence defects, three MEDIUMs. All six are fixed on this branch with
tests. Draft is 2026-08-22; finding 2 was the pre-draft-critical one.

---

## The findings, verbatim-condensed from the audit

> 🔴 **1 — LOST UPDATES ON WHOLE-DOCUMENT BLOB WRITES** (`src/store.js` + every
> read-modify-write caller: ledger, owners, config, alerts). Two concurrent
> requests: A reads [1,2], B reads [1,2], A writes [1,2,3], B writes [1,2,4] →
> entry 3 gone. The ledger is authoritative money state; owners has 4+
> independent writers (member password change vs commissioner Sleeper sync can
> eat the password change).
>
> 🔴 **2 — STANDINGS/DRAFT-ORDER EDITOR ACCEPTS INCOMPLETE RANKINGS**
> (`src/routes/admin.js`, the `/standings` POST). It checks duplicate ranks
> only. Required server-side: submitted owners == active owners exactly once
> each, ranks exactly the contiguous 1..N, reject the whole save otherwise
> with a message naming who's missing. This feeds draft order — pre-draft
> critical.
>
> 🔴 **3 — LEDGER update/remove/replace NON-TRANSACTIONAL** (same seam as 1);
> settle-vs-concurrent-append specifically.
>
> 🟠 **4 — CRON SECRETS IN QUERY STRINGS** (`src/routes/member.js`
> weekly-recap + sunday-alert `?key=`).
>
> 🟠 **5 — SEEDING RACE** (`src/data.js` ensureSeeded).
>
> 🟠 **6 — STARTER-PASSWORD census** — a commissioner-only operational line
> Cory can read before draft day.

---

## 🔴 1 + 🔴 3 — lost updates, fixed at the store seam

### The red run (pre-fix, `draft/tests/store_mutate_concurrency.test.js`)

```
FAIL two concurrent ledger appends BOTH survive -> {"before":11,"after":12,"haveA":false,"haveB":true}
FAIL   and the count grew by exactly two -> {"before":11,"after":12}
FAIL settleAll settled both open entries -> {"n":3,"s1":false,"s2":false}
PASS   AND the concurrent append survived the settle
FAIL updateEntry racing an append: both effects persist -> {"updated":-1,"appended":true}
FAIL removeEntry racing an append: the removal took AND the append survived -> {"removed":false,"appended":true}
FAIL store.mutate exists (the atomic read-modify-write primitive)
...
6 passed, 6 failed
```

Read that first line closely: two appends, `haveA:false` — **a real money
entry silently vanished**, deterministically, on the first try, with the
plain `Promise.all` of two `addEntry` calls. `settleAll` racing an append
lost the ENTIRE settlement (`s1:false, s2:false` — `n:3` says settleAll
*reported* settling three entries whose settled flags then read false: the
racing append's whole-doc write reverted them). `updateEntry` and
`removeEntry` lost the same way. This was not a theoretical window.

### The fix — `store.mutate(key, fn)`, and why it is shaped this way

The fix is at the seam, not per-route: `src/store.js` gains
`mutate(key, fn)` — the whole read → `fn(current)` → write serialized
**per key** through an in-process promise chain (`fn` returning `undefined`
is a deliberate no-write; a throwing `fn` rejects its own caller without
poisoning the chain; independent keys never serialize against each other —
all pinned in the test). `src/data.js` wraps it as
`mutateDoc(key, fallback, fn)`.

**The installed `@netlify/blobs` was INSPECTED, not assumed** (the audit's
explicit instruction): version **8.2.0** (`package-lock.json`;
`node_modules/@netlify/blobs/dist/main.d.cts`). Its `set()`/`setJSON()`
accept **only `{ metadata }`** — there is no `onlyIfMatch`/If-Match
conditional write in this version. Etags exist solely on the **read** side
(`getWithMetadata`, if-none-match/304 caching). With no conditional write,
optimistic-concurrency retry cannot be built against this backend, so
per-key in-process serialization is the strongest primitive actually
available, and that is what shipped.

### The honest residual risk, stated exactly (also in `src/store.js`'s header)

- **GUARANTEED:** two racing writers of one key **inside one function
  instance** can never lose each other's update. This closes the common case
  — Netlify routes one function's requests through few warm instances, the
  same fact the store's read-after-write overlay already leans on.
- **NOT GUARANTEED:** two writes of the same key from two **simultaneous
  instances** (a cold-start burst) can still last-writer-win at the Blobs
  layer; nothing in @netlify/blobs 8.2.0 can detect it. For a 10-person
  league the window is minutes-per-year small, **but it is a window.** If a
  future @netlify/blobs grows conditional writes, add etag-retry inside
  `mutate()` — every caller is already shaped for it.

### The migrated writers (every whole-doc writer of a multi-writer doc)

| doc | writers migrated to mutateDoc |
|---|---|
| `ledger` | `src/ledger.js` addEntry / updateEntry / removeEntry / setSettled (via updateEntry) / settleAll; the two buy-in re-syncs in `src/routes/admin.js` (`/season`, `/votes/:id/enact`); `src/helpers.js` carryover migration |
| `owners` | `src/routes/member.js` `/reset`, `/profile`, `/password`, `/profile/pay`, `/profile/contact`; `src/routes/admin.js` `/owners`, `/owners/:id/reset-password`, `/owners/:id/toggle-active`, `/owners/:id/record`, `/sync-records`, `/unsync-records`; `src/helpers.js` email-default + starter-pw migrations |
| `config` | `src/routes/admin.js` `/settings`, `/draft-day`, `/punishments-lock`, `/sleeper`, `/sleeper/map`; `src/routes/member.js` sleeper auto-map; `src/helpers.js` migration flags |
| `alerts` | `src/routes/admin.js` `/alerts` add/toggle/delete + the `/draft-day` re-pin; `src/routes/member.js` draft-alert self-heal; `src/helpers.js` draft-day-alert migration |

Not migrated, deliberately: `seasons` and `draft:<year>` writes stay on
`setDoc` where they are single-writer by the layout contract in `data.js`'s
header (per-owner keeper/ballot docs already never shared a key — that
design was right and is untouched).

The audit's two named scenarios are pinned as tests over the REAL routes:
ledger replacement cannot erase unrelated entries (section 1-3 of the test),
and **commissioner owner-sync cannot clobber a concurrent password change**
(real HTTP: `POST /password` racing `POST /admin/sync-records`, then
`verifyPassword` on the stored hash AND `record_baseline` both asserted).

### The green run (same test, post-fix)

```
18 passed, 0 failed
```

---

## 🔴 2 — standings editor: complete rankings or nothing saves

### Red (pre-fix, `draft/tests/standings_complete_rankings.test.js`)

```
FAIL a partial submission is REJECTED (this was the silent-save defect) -> "Standings saved."
FAIL   and the message NAMES who is missing -> "Standings saved."
FAIL   and nothing was written
PASS a duplicate rank is rejected
FAIL   and nothing was written
FAIL a gapped (non-contiguous) ranking is REJECTED -> "Standings saved."
FAIL   and the message states the 1..N rule -> "Standings saved."
FAIL   and nothing was written
...
6 passed, 7 failed
```

`"Standings saved."` on a nine-of-ten submission — the exact silent partial
save the audit called, on the form that **sets next year's draft pick order**
(`/draft/open` reads these standings).

### Fix

`POST /admin/standings` now enforces, server-side, in order: (a) every
ACTIVE owner has a rank — rejection **names the missing owners**; (b) no
duplicate ranks; (c) no rank above N — rejection names the stray rank and
states the 1..N rule. N pairs + distinct + all within 1..N ⇒ exactly the
permutation 1..N, so the three checks are complete, not a sample. Rejection
writes NOTHING. Green: **13 passed, 0 failed** — partial rejected by name,
duplicate rejected, gap rejected, complete permutation accepted (stored in
rank order), inactive owners neither required nor counted.

---

## 🟠 4 — cron secrets out of the query string

### Red (pre-fix, `draft/tests/cron_auth_header.test.js`)

```
FAIL /api/weekly-recap: Bearer header ALONE authenticates (the preferred path) -> {"status":403,...}
FAIL /api/sunday-alert: Bearer header ALONE authenticates (the preferred path) -> {"status":403,...}
FAIL sunday-alert.yml sends the Authorization: Bearer header -> "no header found"
FAIL weekly-recap.yml sends the Authorization: Bearer header -> "no header found"
...
13 passed, 6 failed
```

### Fix

`cronAuthorized(req, secret)` in `src/routes/member.js`: `Authorization:
Bearer <secret>` is **checked first** (the preferred path); the `?key=`
query param **keeps working** — live callers exist. Both in-repo callers
(`.github/workflows/sunday-alert.yml`, `weekly-recap.yml`) now send the
header — and during the transition they send **both** header and query,
deliberately: the workflow hits the DEPLOYED site, which can lag this repo
by one deploy, and a header-only caller against a query-only deploy would
silently kill the Sunday alert. The workflow comment says when to drop the
query half (once the header path is verified live). The `netlify.toml`
scheduled functions use a different key (`GRADE_CRON_KEY` on the
netlify/functions cron endpoints, not these two member routes) and were out
of this finding's scope. Green: **19 passed, 0 failed** — header-only works
on both routes, query-only still works, wrong-everything refused, malformed
header refused, cross-secret refused, both workflows carry the header.

---

## 🟠 5 — seeding race

### Red (pre-fix, `draft/tests/seed_race.test.js`)

```
League data seeded (2016-2026 history + 2026 ledger).
League data seeded (2016-2026 history + 2026 ledger).      ← seeded TWICE
FAIL the seeded votes exist exactly once (not doubled by the race) -> {"got":6,"want":3}
6 passed, 1 failed
```

Two concurrent `ensureSeeded()` calls both saw no `config` (it was written
LAST) and both seeded — every vote doc minted twice (unique random ids, so
nothing overwrote the duplicates).

### Fix

The whole seed now runs inside `store.mutate('seed-lock', …)` — the audit's
prescribed shape — re-checking `config` inside the lock, so the second
caller finds the first one's work and no-ops. Same in-process scope as every
mutate (two simultaneous cold *instances* could still race; same residual
statement as finding 1). Green: **7 passed, 0 failed**, one seed log line.

---

## 🟠 6 — starter-password census

A row in the existing `/admin` automation panel (no new page, no view edit —
the panel renders rows generically): **"Starter passwords — N accounts still
on the starter password: <names>"**, or the all-clear line. Commissioner-only
via the router's own `requireCommissioner` gate. It is `ok: true` always — a
CENSUS, not an alarm: members not having logged in yet is not a broken job,
and the red banner crying wolf daily until week 1 would train Cory to ignore
it (the panel's own stated principle). Inactive accounts excluded. Pinned by
`draft/tests/starter_password_census.test.js` (**8 passed** — names must
appear IN the census line, not merely anywhere on a page full of owner
names, and the line must never enter the red banner).

---

## Suites at tip

- The five new suites: 18 + 7 + 13 + 19 + 8 = **65 checks, all green**.
- Full JS sweep (`scripts/js-sweep.sh`): all green.
- Full Python suite (`pytest draft/tests`): all green.
- `scripts/verify-relay-session.sh`: 7/7 with the refusal set repinned at
  **45 files** (+3: `src/ledger.js`, `.github/workflows/sunday-alert.yml`,
  `.github/workflows/weekly-recap.yml` — each documented in TERRITORY.md
  Override #5's persistence-hardening appendix).

## What this pass did NOT touch

`draft/backtest` (roster agent), `draft/tools/playoff*` (playoff agent),
scoring CFG (verify gate section 2 still pins zero movement), member-facing
UX beyond the fixes above. The one member-visible change outside /admin is
the standings form now refusing bad saves with a named reason — which is the
fix itself.
