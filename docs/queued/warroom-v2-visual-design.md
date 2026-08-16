# WAR ROOM v2 — VISUAL DESIGN DIRECTIVE (how it FEELS)

Filed 2026-08-08 (Cory). The information architecture is specced (`war-room-final-pass.md` Part 2 + the B7 dollar-gap addendum); this governs the *feel* of the Part 2 layout pass. **Apply the `frontend-design` skill to this pass explicitly.**

1. **HIERARCHY — one dominant number per card.** Every card has exactly one dominant figure: in comparisons it's the **dollar gap**, on paths it's the **ΔE[$]**, on the Money Meter it's the **gauge position**. One glance → one takeaway. Everything else is visually subordinate — smaller, muted, expandable.
2. **MONEY IS A COLOR.** Dollar figures get ONE reserved accent — the site's **gold** — used for nothing else. Cory's eye should learn *gold = money* in the first minute.
3. **IDENTITY.** This is the command-center expression of the site's existing americana-banter identity (navy / gold / eagle / stars / "Est. 1776") — **not a generic SaaS dashboard.** Keep the voice in microcopy ("even money — pick your guy", the bench-lottery lines).
4. **MOTION MEANS SOMETHING.** The Money Meter animates when it moves; sniper warnings slide in; receipts tick into the feed. Motion is **reserved for state changes only** — zero decorative animation.
5. **DENSITY GRADIENT.** Zone 1 breathes (generous space, large type); Zone 2 is compact; Zone 3 is dense. The eye learns **depth = detail**.
6. **Apply the `frontend-design` skill explicitly** to this pass.

## Acceptance gate (order matters)
**Visual review PRECEDES mechanical verification.** After the design pass, **screenshot the full page at desktop width** for Cory and chat-Claude's ergonomics review **BEFORE** the robot acceptance run. Only after visual sign-off does the robot mechanical verification run.

## 7. DESKTOP IS CORY'S PRIMARY SURFACE (filed 2026-08-16, Cory verbatim:
"fyi I will be using this site from my desktop, so that site is more
important. Also allows more room for the war room design to have more tools
if useful.")

What this changes for every future design pass on COMMISSIONER surfaces (war
room, analyzer, edge report, pool advisor): design desktop-FIRST — the
density gradient may run deeper, side-by-side tool panels are allowed where
phone would have forced tabs, and a desktop-only extra lens is legitimate
when it earns its space. Phone stays a first-class REVIEW surface for these
pages (390px must still render without horizontal overflow — the fidelity
suites keep asserting it) but is no longer the constraint that decides what
ships.

What this does NOT change: MEMBER surfaces (side-bet cards, pick'em,
matchup tracking, dashboard) stay phone-first — the other nine owners are
the Sleeper-app audience the member-site review targets, and they live on
their phones.
