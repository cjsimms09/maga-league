# MFGA League — Interface Audit Brief

**For:** an independent reviewer (another model or a human) asked to audit the
site's information architecture, interaction design, and mobile experience.

**Companion document:** `draft/AUDIT.md` covers the commissioner-only draft
engine's *logic*. This document covers the *interface* — the ten pages ten
people actually use. There is no overlap; you do not need to read that one.

**What I want from you:** attack §8. That's my own ranked list of what I think
is still wrong. Tell me which ones I've mis-ranked, which ones aren't real, and
— most valuably — what I've missed entirely because I built it and can no
longer see it. Section 7 documents changes I *just* made; if a change made
things worse, say so.

**Constraint that shapes everything:** this is a 10-person private fantasy
football league for friends. It is not a product. There is no onboarding
budget, no support channel, no analytics, and no second chance to explain
something — if a page isn't self-evident, the user texts the commissioner
instead, which is exactly the outcome the site exists to prevent.

---

## 1. Who uses this and on what

Ten people. Nine are members; one (Cory) is the commissioner and sees a
superset. Age range roughly 30–45, all technically ordinary, none of them will
read instructions.

The stated primary context, in the owner's words: *"most people will probably
view this site on their phone most the time."* Every measurement in this
document is therefore taken at **390 × 844 CSS px, DPR 1** (iPhone 14-class
viewport), logged in, with realistic seeded data. Desktop is a secondary
target that gets a two-column grid at ≥880px and is not the subject of this
audit.

Two of the ten (David, Marian) live in Germany. This matters for one feature:
money settles between them and the commissioner across *years*, in both
directions, and the site's core promise is that the running tab is always one
unambiguous number.

Frequency of use is wildly uneven:

| Page | Realistic visit frequency |
|---|---|
| League Office (`/`) | weekly during season |
| Locker Room (`/chat`) | daily during season |
| The Tab (`/bank`) | a few times a year, at high stakes |
| Draft Order (`/draft`) | once a year, ~10 minutes, high stakes |
| Voting Booth (`/votes`) | a handful of times a year |
| Record Book / History / Owners | idle browsing, never urgent |
| Commissioner Console (`/admin`) | weekly, one person |

That skew is the crux of most of my design decisions and probably where I've
made mistakes: I've optimised for the weekly visitor and may have made the
once-a-year, high-stakes pages worse by comparison.

---

## 2. Technology, and what it rules out

- Server-rendered **EJS** templates, no client framework, no build step.
- Runs as a **Netlify Function** (Express via `serverless-http`), state in
  **Netlify Blobs**. Cold starts are real; every page is a full round trip.
- Vanilla JS only, and only on three pages (chat auto-refresh, draft-order
  auto-refresh, and the War Room, which is a genuine client-side app).
- One stylesheet: `public/css/style.css`, 680 lines, hand-written, no
  preprocessor, no utility framework.

**Consequences you should hold me to:**

1. Every member interaction is a **form POST + full page reload**. There is no
   optimistic UI anywhere. On a cold Netlify function that is a visible pause
   with no spinner.
2. There is no client-side routing, so **page weight is the whole cost** — a
   3,600px page is 3,600px the user scrolls past every visit.
3. Progressive disclosure has to be done with `<details>` or with separate
   pages. I use `<details>` in three places. Judge whether that's the right
   tool or whether I'm hiding things people need.

---

## 3. Page inventory and measured shape

All numbers measured at 390×844 with the seeded league (10 owners, mid-season
Sleeper data present, 3 active alerts, commissioner logged in).

| Route | Page | Height (px) | ≈ screens | Cards | Tables | Inputs |
|---|---|---|---|---|---|---|
| `/` | League Office (dashboard) | 2,800 | 3.3 | 9 | 5 | 0 |
| `/team` | My Team | 1,545 | 1.8 | 1 | 1 | 1 |
| `/bank` | The Tab | 3,614 | 4.3 | 4 | 13 | 39 |
| `/owners` | Owners | 3,786 | 4.5 | 10 | 0 | 0 |
| `/history` | History | 2,613 | 3.1 | 2 | 22 | 0 |
| `/draft` | Draft Order | 3,509 | 4.2 | 6 | 1 | 3 |
| `/votes` | Voting Booth | 2,309 | 2.7 | 6 | 1 | 12 |
| `/chat` | Locker Room | 875 | 1.0 | 1 | 0 | 1 |
| `/records` | Record Book | 2,547 | 3.0 | 6 | 6 | 0 |
| `/rules` | Rules | 3,057 | 3.6 | 4 | 3 | 0 |
| `/admin` | Commissioner Console | 1,344 | 1.6 | 2 | 1 | 2 |

The `/admin` figure is small because the console is **tabbed** — eleven tool
groups, one visible at a time. That is the only page in the site that uses
tabs, and it's the page that most needed them.

Global chrome, identical on every page:

```
masthead        138 px   (branding: eagle, wordmark, star rule)
nav              48 px   (12 links, horizontally scrolling)
alert banners   120 px   (2 shown + a "1 more announcement" disclosure)
────────────────────────
content starts  306 px   = 36% of the 844px viewport, before any page content
```

On the dashboard specifically, an auto-generated roast banner adds ~100px more,
so the first real content sits at roughly **406px — 48% of the first screen.**
I consider this the single most important open number in this document.

---

## 4. Information architecture

### 4.1 Navigation

One flat, horizontally-scrolling bar. No hierarchy, no menu, no hamburger.

```
League Office · My Team · The Tab · Owners · History · Draft Order ·
Voting Booth · Locker Room⁽ⁿ⁾ · Record Book · Rules · [⭐ Commish] · [🧠 War Room]
```

Measured: the nav's scroll width exceeds its client width by **1,053px** on a
390px screen. Roughly 70% of the navigation is off-screen at rest. A CSS mask
fades the right edge as a scroll affordance; that is the entire mitigation.

The last two links are commissioner-only and render for exactly one user.

The Locker Room link carries an unread-count badge. It is the only badge in the
nav, and the only place in the site where state is surfaced without visiting
the page.

### 4.2 The three information registers

Everything on the site is one of three things, and I have tried — with
incomplete success — to keep them visually distinct:

1. **Yours** — your tab, your turn, your unvoted ballots. Gold accents.
2. **The league's** — standings, scoreboard, everyone's buy-in status, payout
   table. Neutral panels.
3. **The commissioner's** — anything that mutates money or league state. Red
   or gold bordered, and gated server-side by `requireCommissioner`.

Register 3 is enforced, not merely styled: `src/routes/admin.js` applies
`router.use(requireCommissioner)` to the entire router, and the money-mutating
controls that appear inline on `/bank` post to `/admin/ledger/...`. A member
who forges the request gets a 403. The owner's requirement was explicit — *"no
one else should be able to edit this"* — so if you find any path where a
non-commissioner can reach a mutation, that is a **P0 finding**, more important
than anything else in this document.

### 4.3 Dashboard order (post-change)

```
1  roast banner (auto-generated, last place, only when Sleeper is connected)
2  HERO — Your Tab · Buy-In · Total Pot · Weekly Payout
3  "NEEDS YOU" strip — only renders if you have an action pending
4  Live Standings (Sleeper)
5  Week scoreboard (Sleeper) — hidden entirely if all scores are 0
6  Week in Review (Sleeper)
7  The League Wire — transactions (Sleeper)
8  Weekly High Point payouts
9  Draft Room status → link
10 Voting Booth status → link
11 Locker Room preview → link
12 Season Awards / Final Standings (when they exist)
13 <details> "League reference" — everyone's buy-in status + full payout table
```

The rule I applied: **your state, then your actions, then the league's state,
then reference material.** Items 4–7 are all Sleeper-derived and every one of
them self-hides when its data is missing or empty, so a preseason dashboard is
substantially shorter than an in-season one.

---

## 5. Page-by-page notes

**League Office (`/`)** — described above. The hero's first tile is deliberately
your own money, coloured green when the league owes you and red when you owe.

**My Team (`/team`)** — live Sleeper roster with recent production. Has an owner
`<select>` that scouts anyone else's team, which auto-submits on change. This is
the only place in the member site where a control mutates the page without a
button press.

**The Tab (`/bank`)** — the money page, and the one the owner cares most about.
Members see a card per owner with a single signed balance and the open entries
behind it. The commissioner additionally sees a **"Money Moves"** block at the
top: every outstanding entry across the whole league with an optional free-text
note field and a one-click settle button. Settling is reversible, supports
partial amounts, and writes an audit trail. 39 inputs on this page is the
commissioner view; a member sees far fewer.

**Owners (`/owners`)** — ten cards, career winnings, trophies, toilet-bowl
emoji, auto-updating records. Pure browsing, 4.5 screens tall.

**History (`/history`)** — a year-by-year winnings matrix (22 tables' worth of
rows) plus the Wall of Shame. The matrix scrolls horizontally inside its card.

**Draft Order (`/draft`)** — the highest-stakes ten minutes of the year. Members
claim a *draft position* (the actual draft happens in Sleeper) strictly in
reverse standings order. A turn banner states whose turn it is; the page
self-refreshes every 30s when it isn't your turn, and deliberately does *not*
refresh when it is, so it can't yank the UI while you're deciding. A keeper
cheat sheet shows where your first real pick lands given 0–3 keepers. No timer,
by explicit instruction.

**Voting Booth (`/votes`)** — propose a measure, cast a changeable yes/no
ballot, comment on measures. A tally bar shows the split against the passing
threshold.

**Locker Room (`/chat`)** — the only page that is exactly one screen tall, and
the only one with a chat-style layout (avatars, own-message alignment).
Auto-refreshes every 25s, but skips the refresh if an input is focused so it
can't eat what you're typing.

**Record Book (`/records`)** — all-time highs and lows computed by walking the
`previous_league_id` chain through Sleeper.

**Rules (`/rules`)** — the constitution, scoring table, roster composition.
Static reference, 3.6 screens.

**Commissioner Console (`/admin`)** — eleven tabbed tool groups: alerts, ledger,
weekly winner, awards, standings, draft controls, votes, owners, season
settings, Sleeper connection, export. Tabbed, so only ~1.6 screens render at a
time.

**War Room (`/admin/warroom`)** — a genuine client-side application, one user,
one day a year. Explicitly **out of scope for this audit**; see `draft/AUDIT.md`.

---

## 6. Recurring UI patterns

| Pattern | Where | Notes |
|---|---|---|
| `.hero` tile row | 6 pages | 2–4 big numbers, colour-coded good/bad |
| `.card` + `h2` + `.body` | everywhere | the only container primitive |
| `.roll` table | 13 pages | `.scroll-x` wrapper for horizontal overflow |
| `.turn-banner` | draft | states whose turn it is, large type |
| `.todo-strip` | dashboard | new; the only "do this now" surface |
| `<details>` | header, dashboard, records | progressive disclosure |
| `.badge` | many | paid/owes/open/closed states |
| Emoji as iconography | everywhere | no icon font, no SVG sprite |

Emoji-as-icons is a deliberate cost saving (zero bytes, renders everywhere) and
a deliberate tonal choice — the league's register is crude and jokey. But it
means **icon meaning is unlabelled**: 🚽 is last place, 👑 is first, ⚡ means
"this number updates itself from Sleeper", ✅/⏳ is paid/unpaid. Only ⚡ has a
legend, and it's at the bottom of `/owners`.

---

## 7. What I changed immediately before writing this

The owner asked me to evaluate whether the interface is "good, easy to
understand and use." I audited the member-on-phone path — the one I'd
screenshotted least, and the one nine of ten users live in — found six
problems, and fixed five. Before/after, same viewport, same data:

| Problem found | Fix | Result |
|---|---|---|
| Dashboard 8,408px — ten screen-heights | Demoted league-wide reference tables into a collapsed `<details>`; hid the all-zero scoreboard | **8,408 → 2,800px** |
| **Duplicate draft-day alert** (real bug: both `src/data.js` seed and the `src/helpers.js` migration inserted it) | Dedupe alerts by message text, not just by the migration flag | 2 → 1 occurrence |
| Four alert banners stacked above every page | Sort urgent-first, show top 2, collapse the rest into `<details class="alert-more">` | chrome 306px, capped regardless of alert count |
| Wrong priority: everyone's buy-in table and the static payout table came *before* the member's own status | Reordered so **Your Tab** is the first hero tile | Your Tab at y≈427px, above the fold |
| No single place telling a member what to do | New `.todo-strip` — renders only when you have a pending turn, an uncast vote, or a debt | 1 strip, self-hiding |
| Masthead 195px of pure branding | Mobile density pass: hide tagline, shrink eagle and star rule | **195 → 138px** (16% of viewport) |

Files touched: `src/helpers.js`, `views/partials/header.ejs`,
`views/dashboard.ejs`, `public/css/style.css`.

**Please check these specifically.** Collapsing things into `<details>` trades
scroll length for discoverability, and I made that trade three times in one
sitting. The payout table in particular is now two taps from the dashboard; the
owner originally asked for it to be prominent. I think demoting it is right —
it's static reference that changes once a year — but it's the change I'm least
sure about.

---

## 8. Where I think this is still weakest — start here

Ranked by how much damage I think each does. Argue with the ranking.

**8.1 — Navigation is 70% invisible on a phone.**
1,053px of horizontal overflow, mitigated only by a fade mask. The Rules page
and the Record Book are effectively undiscoverable to anyone who doesn't think
to swipe a nav bar — a gesture many people don't try on a bar that looks like a
bar. Twelve destinations is too many for a flat list at 390px. Candidates: a
bottom tab bar for the 4–5 real destinations with the rest behind "More"; or
grouping (Money / League / Fun); or accepting the scroll but adding a visible
chevron. I have not fixed this and it is my top concern.

**8.2 — 306px of chrome before any content, on every page, forever.**
36% of the first screen is branding and announcements. On the dashboard with a
roast banner it's 48%. The masthead is the league's identity and the owner
likes it, so deleting it isn't on the table — but it does not need to be
sticky-equivalent dead weight on the *tenth* page view of a session. A shrink-
on-scroll masthead, or a compact masthead on non-dashboard pages, would buy
back a third of a screen everywhere.

**8.3 — Zero accessibility affordances.**
Measured, not estimated: **0** `aria-*` attributes across all 17 views. **1**
`:focus` rule in 680 lines of CSS. No `prefers-reduced-motion` block. No skip
link. No explicit minimum tap-target size anywhere. Alert banners are not
`aria-live`. The `<details>` disclosures have their markers removed with no
replacement affordance beyond the label text. None of the ten users has
disclosed a need here, which is why it's ranked third and not first — but it's
a genuine gap and it's cheap to close.

**8.4 — No feedback on any submission.**
Every member action is a synchronous form POST on a cold-startable serverless
function. There is no spinner, no disabled-button state, no optimistic render.
The highest-stakes action in the year — claiming your draft spot — gives you
nothing between tap and reload. Double-submits are plausible. I'd want at
minimum a disabled + "Working…" state on submit buttons.

**8.5 — `/owners` and `/bank` are 4.5 and 4.3 screens with no in-page
navigation.** Ten stacked cards each. No jump list, no search, no collapse. On
`/bank` the commissioner's Money Moves block is at the top, which is right, but
a member looking up one specific person's tab scrolls blind.

**8.6 — Icon meaning is unlabelled.**
🚽 👑 ⚡ ✅ ⏳ 🔥 🥶 🔨 😅 all carry meaning; one has a legend. A first-time
visitor decodes them from context or doesn't.

**8.7 — The `<details>` disclosures may be too well hidden.**
Three of them now: overflow alerts, dashboard reference block, and records
sections. A collapsed `<details>` with a muted uppercase summary reads as a
section divider, not a control. If people don't open them, I've deleted content
rather than demoted it. This is the direct risk created by §7 and I'd like a
second opinion on it specifically.

**8.8 — One breakpoint, in the wrong place.**
Six `@media` blocks, effectively two breakpoints (640 / 880). Nothing between
390 and 640 gets tuned, so a 360px Android and a 430px Pro Max get identical
treatment. Tablet portrait (768px) falls into the mobile bucket and wastes half
its width.

**8.9 — No empty-state design system.**
Empty states are ad-hoc one-liners in muted grey ("Silence in the locker room.
Suspicious.", "The republic rests."). They're on-tone and I like them, but they
render at the same visual weight as an error, and in at least one place —
Sleeper unreachable on `/records` — a *failure* and an *empty* look nearly
identical. A user cannot tell "nothing happened yet" from "something is
broken."

**8.10 — The site never tells you it's out of date.**
Sleeper data is fetched server-side and cached. Nothing on any page carries a
"as of" timestamp. If Sleeper is down, standings silently render stale. Given
the site's entire credibility rests on its numbers being right, a freshness
indicator on Sleeper-derived cards is probably a bigger deal than its position
in this list suggests — I may have under-ranked this one.

---

## 9. Things I believe are working, so you can disagree

State them wrong if they are wrong; I'd rather find out here.

- **Tabbing the commissioner console.** Eleven tool groups would be a 10,000px
  page. Tabs make it 1,344px. This is the highest-leverage structural decision
  in the site.
- **One signed number per person for money.** No "owed" and "owing" columns to
  reconcile; negative means they owe the league, positive means the league owes
  them, and it survives year boundaries. This was the owner's central
  requirement and I think the model is right.
- **Self-hiding Sleeper cards.** Preseason, the dashboard simply doesn't render
  standings/scoreboard/wire, rather than rendering five empty boxes.
- **Not refreshing the draft page on your own turn.** Auto-refresh everywhere
  else, frozen while you're deciding.
- **Not putting a timer on the draft.** Explicit owner instruction, and right:
  this is a friendly league picking seats, not a live auction.
- **The tone.** Crude, jokey copy throughout, plus deliberately hidden jokes.
  It is not neutral product voice and it is not supposed to be.

---

## 10. How to reproduce the measurements

```bash
cd league
npm install
PORT=3010 node dev-server.js          # seeds a full fake league on first run
# log in: cory / imabitch  (forced password change on first login)
```

Measurement harness (Playwright, 390×844, DPR 1) walks every route logged in
and reports scroll height, chrome height, card/table/input counts, nav
overflow, and body overflow. The numbers in §3 come from a single run against
seeded data.

Note for reproduction: **this sandbox has no outbound network to Sleeper.**
Every Sleeper-derived surface in the measurements is rendering from seeded or
mocked data, not live API responses. Real-data layouts — a 14-team scoreboard,
long team names, a 60-row transaction wire — have **not** been measured, and
that is a real gap in this audit. If you have a way to reason about text
overflow in those cards without running them, do.

---

## 11. Out of scope

- The War Room draft engine's logic and UI — see `draft/AUDIT.md`.
- Backend correctness, ledger arithmetic, auth implementation.
- Visual design taste (colour palette, typography choice). The owner asked for
  "new age techy, keep the USA theme" and signed off. Comment on *legibility*
  and *contrast* if you see problems; don't relitigate the palette.
