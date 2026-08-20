# We are not short of projection sources. We are short of sources that RETURN.

**A, 2026-08-19.** Cory: *"I think we need to work on our mean proj points. Can
you go find more sources for proj points for 2026"*.

**Answer: twelve are already being asked every night. Three come back usable.
Seven return zero rows while reporting success, and nobody has established that
the zeros are real.**

---

## 1. WHAT THE NIGHTLY PROBE ACTUALLY GETS

`draft/data/ffanalytics_probe.json`, scraped 2026-08-19T03:51:23Z:

| source | rows | verdict |
|---|---|---|
| CBS | 442 | ✅ used |
| ESPN | 416 | ✅ used |
| FFToday | 390 | ✅ used |
| FantasyPros | 60 | ❌ **exactly 10 per position** — a leaderboard page, not a projection set |
| Walterfootball | 50 | ❌ same truncation, and no DST at all |
| **FantasySharks** | **0** | ⚠️ `ok: true`, `error: {}` |
| **FleaFlicker** | **0** | ⚠️ `ok: true`, `error: {}` |
| **NumberFire** | **0** | ⚠️ `ok: true`, `error: {}` |
| **FantasyFootballNerd** | **0** | ⚠️ `ok: true`, `error: {}` |
| **NFL** | **0** | ⚠️ `ok: true`, `error: {}` |
| **RTSports** | **0** | ⚠️ `ok: true`, `error: {}` |
| **FantasyData** | **0** | ⚠️ `ok: true`, `error: {}` |

**Seven sources are being asked, answering "fine, nothing", and being believed.**

## 2. THAT IS RULE 3e, AND THE PROBE'S OWN HEADER SAYS SO

`ffanalytics_probe.R` opens with it: *"A scraper that returns nothing and a
scraper that was asked wrong are indistinguishable from the outside, and only
one of them is a finding."* It exits non-zero only if the **total** is zero —
so three working sources mask seven silent ones, and the run goes green.

**A per-source zero has never had to justify itself.** That is exactly the
false-negative shape `CLAUDE.md` records five instances of in one evening.

**And C's own reachability census contradicts "the data is not there":** it found
**numberfire, fantasysharks, fantasyfootballnerd, rtsports and fantasydata all
serving plausible content** (bodies ≥ 2000 bytes). The sites are up. The
extraction returns nothing.

## 3. ONE CAUSE IS IDENTIFIED AND CHEAP

**No API key is configured for any source.** The workflow's env block sets
exactly two variables — `FFA_SOURCES` and `FFA_SEASON` — and nothing else.

**FantasyFootballNerd's API requires a key** (they issue a free one).
Un-keyed, ffanalytics' FFN scraper returns empty **without erroring**, which is
precisely the `ok: true, rows: 0` signature above.

**That is the cheapest testable hypothesis on the board: one free key, one
re-run, and either a fourth source appears or a specific cause is eliminated.**

Of the rest: **FantasyData is a paid API** (a cost decision, not a bug);
NumberFire was absorbed into FanDuel and restructured; NFL's projections
endpoint has changed; FleaFlicker, RTSports and FantasySharks are site-shape
questions. **I am NOT claiming to know which of those are dead — that is the
per-source diagnosis nobody has done, and asserting it is what this file exists
to stop.**

## 4. WHAT A FOURTH SOURCE IS ACTUALLY WORTH — measured, not asserted

The blend needs three opinions. Today **311 of 613 board players (50.7%)** get a
blended mean; the rest are Sleeper alone.

**86 board players sit on exactly ONE external source**, so with Sleeper they
have two — one short of the bar. Every one of the 86 is on the board.

| position | players one source short |
|---|---|
| **TE** | **28** |
| WR | 23 |
| QB | 19 |
| RB | 14 |
| K / DEF | 1 / 1 |

**A single additional source covering these would lift up to 86 players into
blend eligibility — and the largest block is TIGHT END.**

⭐ **That joins two things that were separate.** The roster-shape lab found TE is
the one position separating this league's top-3 teams (1.83 vs 1.29), the seat
replay found the engine draws **exactly one TE in 30 of 30 rosters**, and now the
projection layer turns out to be **thinnest at exactly that position.** A tight
end priced by one vendor is a tight end the blend cannot correct.

**This does not prove the TE gap is a projection problem** — it is one plausible
contributor alongside the composite's missing roster-awareness, and separating
them needs the grade, not this file.

## 5. WHAT I AM NOT DOING, AND WHY

**Not adding a scraper before Saturday.** Ingest changes what `proj_mean` is,
two days before a draft Cory has been studying, and the blend's own grade (P113)
is not due until January. **Getting rows is step one of a longer road** — the
probe's header says that too.

**Not claiming the seven zeros are fixable.** One has a named cheap cause. The
others have hypotheses and no evidence, and the difference matters.

## 6. THE ASK

**One free FantasyFootballNerd API key**, set as a repo secret, and re-run the
probe. If FFN returns rows it is a fourth source and the 86 one-short players
get a real second opinion; if it still returns zero with a key present, that
eliminates the credential hypothesis and the remaining causes are all site-shape.

**Either outcome is worth more than the current state, which is seven sources
answering "fine, nothing" and being taken at their word.**
