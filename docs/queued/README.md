# Queued work — not started, gated on a date or an event

Nothing in this directory is in progress. Each item names the gate that has to
open before it begins. They live in the repo rather than in a conversation
because sessions are ephemeral and a container that gets reclaimed takes any
"remember this for later" with it.

| item | gate | status |
|---|---|---|
| `in-season-rankings.md` | **do not start before 23 Aug 2026** — first post-draft, post-freeze item; build window 23 Aug – 9 Sep, done before Week 1 kickoff | queued, untouched |
| `backtest-round-2.md` | launch Phase 1 in CI whenever a natural break comes (background compute); prereq for the strategy hunt's corrected boards | queued — session upload, committed here so it survives container reclaim |
| `strategy-hunt-learning-seed.md` | Phase L1 (ledger) DONE; Phase H (shadows) pre-draft; Phases S/N in CI after Backtest-2's corrected boards; L3–L6 September-class (capture hooks now) | queued — L1 shipped (`f9f6e6d`); rest gated |
| `in-season-master.md` | **do not start before 23 Aug 2026** — becomes the master queue on Aug 23; calendar-gated Sep 8 / 15 / 22 / Oct 6 | queued — session upload, committed here so it survives container reclaim |
| `annual-button.md` | Phase 4 / September-class build, BUT **dry-run acceptance test as soon as L1–L2 are done** (prove the machinery before the January it matters) | queued — dry-run gated on L2 (L1 shipped `f9f6e6d`) |

## ⚠️ Dependency status-check (in-season-master Phase 1) — flagged 2026-08-08

The in-season-master says "re-read the committed spec" for four dependencies. As
of this check, only ONE is committed as a spec; the other three are referenced
but do not exist as documents. The in-season-master itself is the fallback
("where no spec exists, this document is the spec"), so this is a flag, not a
blocker — but it needs resolving before those phases begin:

| dependency | status |
|---|---|
| in-season rankings spec | ✅ **PRESENT** — `in-season-rankings.md`, referenced correctly |
| season-readiness kit | ❌ **MISSING** — no doc holds the Weekly Brief format, waiver-Lite stealth score, bid bands. Referenced throughout as if committed. |
| Part 11 (learning loop) | ❌ **MISSING as a doc** — only a one-line "not built" in EVIDENCE-BUNDLE. Substance overlaps `strategy-hunt-learning-seed.md` L3–L6 (now committed), which can serve as its spec. |
| Part 12 (watchdog) | ❌ **MISSING as a doc** — only EVIDENCE-BUNDLE references ("no ruleset hash exists anywhere"). Needs a spec or built from the in-season-master §4 text. |

## Why the date gate is real and not advisory

Draft day is 22 Aug 2026. Everything before it is either draft-day-critical or
it is a distraction, and the standing instruction on the current queue is that
nothing new gets built after the round-2 investigation closes — remaining work
is testing, not building. The in-season rankings item does not contradict that:
it is explicitly the FIRST thing after the freeze lifts, not a parallel track.

## What the rankings item reuses rather than rebuilds

Worth recording here so nobody re-derives it: the scoring engine (verified
against hand-computed lines), the opportunity-metrics pipeline over nflverse
play-by-play — which already flows through `release-assets.githubusercontent.com`
with no allowlist change needed, see NETWORK.md — the VORP/replacement
machinery, the artifact-plus-provenance pattern with its loud-degradation
rules, and the three existing crons. The crons get wired, not duplicated.
