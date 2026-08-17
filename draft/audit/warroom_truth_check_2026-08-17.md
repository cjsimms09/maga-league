# E's eleventh sweep — the war room's numbers are true; its label is not

**Session E (red team), 2026-08-17.** Board: the working tree's
`public/draft_data.json`, 682 players, artifact `2026-08-16T14:10:12Z`.

**Findability is deliberately not tested here.** B is mid-redesign and layout is
Cory's call; my inbox holds that half until B ships. This is the truth half only:
*does a number on screen match the artifact, and does its label say what it
actually is.*

---

## 1. THE DRESS REHEARSAL REPRODUCES — 19/19, independently

The brief claims the war room *"is rehearsed and passes — 19/19 against today's
board."* After the freeze claim turned out to be stale (sweep 10), I stopped
taking the brief's status claims on trust and ran it:

```
$ npm ci                                        # deps were absent; lockfile restores clean
$ node draft/tests/rehearsal-serve.js &
  League data seeded (2016-2026 history + 2026 ledger).
  war-room rehearsal server on 8925 (DATA_DIR=/tmp/wr-rehearsal-…)
$ WR_USER=cory WR_PASS=pw node draft/tests/rehearsal-mock3.js
  …
  19/19 rehearsal checks passed
```

**The claim holds.** The clock advances, "➕ Me" lands on the roster, the legality
strip is present rather than present-but-invisible, the exit warning fires with
no DEF and no K, the deviation badge is silent inside the noise band and speaks
outside it, no page errors, and the only blocked host is the fonts CDN.

**What this does NOT discharge:** the brief's stated honest limit that
`npx playwright install --with-deps chromium` is *"reasoned and tested, not yet
observed"* on a real runner. Chromium was pre-provisioned in this sandbox, so I
exercised `rehearsal-browser.js`'s sandbox branch, not its install branch. **That
verification is still owed and is still the relay's.**

## 2. THE NUMBERS ON SCREEN ARE TRUE

The 19/19 rehearsal checks **mechanism** — that things move and are wired. It
never compares a rendered figure against the artifact. That comparison is this
lane's assignment and nothing covered it, so I drove the real screen and read the
DOM:

```
WAR-ROOM TRUTH CHECK (numbers on screen vs public/draft_data.json)
PASS  the board table renders rows at all              — 200 rows
PASS  every rendered overall_rank matches the artifact — 188 checked, 0 wrong
PASS  every rendered projection matches the artifact   — 188 checked, 0 wrong
```

**188 players, two fields each, zero discrepancies.** The war room is not lying
about any number it displays. That is worth stating plainly and positively: the
surface Cory drafts on renders the artifact faithfully.

## 3. THE LABEL IS NOT — sweep 4 confirmed on the rendered page

Sweep 4 (`proj_source_mark_inverted_2026-08-17.md`, register **E6**) was read out
of `app.js:642`. It is now observed on screen:

```
PASS  unmarked rows are NOT multi-source
        — 127 of 127 unmarked rows are provably Sleeper-only (proj_baseline == proj_sleeper)
PASS  the caveat is attached to rows that LACK FantasyPros, not rows that lack a second source
        — 65 marked on screen, 0 of them actually carry FP
```

**Read those two as the defect, not as a clean bill.** On the live screen:

- **127 rows render with no single-source caveat, and every one of the 127 is
  single-source.** Their absence of a mark tells Cory they have corroboration.
  None do.
- **65 rows carry the caveat, and all 65 genuinely lack FantasyPros** — so the
  mark is internally consistent with its own condition. The condition is the
  wrong one.

The mark is doing exactly what `app.js:642` says and exactly the opposite of what
a reader takes from it. **E6 moves from "read in the code" to "observed on the
screen Cory drafts from", which is the strongest form this finding can take
without a person in front of it.**

## 4. THE CHECK ITSELF, RECORDED RATHER THAN SHIPPED

`SESSION-E.md` says do not build anything this week, and I have not added
anything to the suite. The script lives in my scratchpad and is reproduced here
so it is not lost, because **it would pin E6 against regression in about forty
lines** and that is B's or A's call to adopt, not mine.

```js
// drive the real screen, read the DOM, compare to public/draft_data.json
const rows = await page.$$eval('#board-body tr', trs => trs.map(tr =>
  [...tr.querySelectorAll('td')].map(x => x.innerText.trim())).filter(td => td.length >= 6));
// column order per app.js: rank, name, pos, team, bye, proj_mean, …
for (const td of rows) {
  const p = byName[td[1].split('\n')[0].trim()];  if (!p) continue;
  assert(parseInt(td[0], 10) === p.overall_rank);
  assert(parseInt(String(td[5]).replace(/[^0-9-]/g, ''), 10) === Math.round(p.proj_mean));
}
// and the caveat: every UNMARKED row must have a genuine second source
const unmarked = rows.filter(td => !/¹/.test(td[5]));
assert(unmarked.every(td => hasRealSecondSource(byName[...])));   // <- fails today, 127/127
```

**The last assertion is the one worth having.** It fails on today's board for
every unmarked row, and it would have caught E6 the day the mark was written.

## 5. ROUTING

- **E6 (→ B)** — register row updated with the live evidence. No new row; same
  defect, stronger form.
- **Nothing new to A.** The numbers are faithful and the rehearsal reproduces.
- **Still owed by the relay:** the runner-side `playwright install` observation,
  which this run could not make.
