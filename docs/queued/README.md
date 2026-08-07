# Queued work — not started, gated on a date or an event

Nothing in this directory is in progress. Each item names the gate that has to
open before it begins. They live in the repo rather than in a conversation
because sessions are ephemeral and a container that gets reclaimed takes any
"remember this for later" with it.

| item | gate | status |
|---|---|---|
| `in-season-rankings.md` | **do not start before 23 Aug 2026** — first post-draft, post-freeze item; build window 23 Aug – 9 Sep, done before Week 1 kickoff | queued, untouched |

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
