# War Room Final Pass — Polish + Layout Redesign (one combined work order)

Two parts, one queue slot, one goal: the surface I mock against and draft on. Insert AFTER the three spec commits, BEFORE shadow rosters — the mocks must rehearse this finished surface.

**Work order inside this document:** Part 1 §A (state correctness) → Part 1 §C (missing-feature verdicts) → Part 2 (layout redesign, which absorbs Part 1 §B's board fixes as it rebuilds those surfaces) → Part 1 §D (flow/safety) → Part 1 §E + Part 2's phone acceptance (one combined phone pass at the end). Every UI change gets a robot scenario. Nothing in "WHAT DOES NOT CHANGE" gets touched.

---

# PART 1 — DRAFT-DAY POLISH (state, board, missing features, flow)


## A. State correctness

### A1. Keepers pre-populate my roster — the biggest defect on the page
My roster panel shows every slot empty ("Nothing yet") and the bye card empty. I START this draft with Chase, Henry, and Walker rostered. Fix: on board load, my confirmed keepers render in their starting slots (locked/badged as KEEPER), "still to fill" and picks-remaining math excludes them, the need term reads the post-keeper roster, and the bye-week card shows their byes from pick one. Robot scenario: draft start state asserts 3 rostered keepers, 12 picks remaining (15-round draft, rounds 1–3 forfeited), and the need term reads the post-keeper roster. **[CORRECTED 2026-08-08]** The original "need excludes RB if both RB slots are keeper-filled" was too simplistic: `starterSlotMarginal` values a flex-fill at full VORP, so with 2 RB + 1 WR keepers an additional RB still "starts in your flex" — need does NOT drop to zero while the FLEX is open. The right assertions (robot R8): (a) participation — the SAME RB reads "fills an empty RB slot" on an empty roster but "starts in your flex" with the keepers (an ignored roster would say the former both times); (b) WR shows one dedicated slot still open (1 of 2 filled by Chase); (c) once dedicated AND flex are consumed, RB need drops to bench value. The flex-discount question is tracked as DECISIONS D3 (quantify before mocks).

### A2. Slot and draft-ID single source of truth
The board shows Slot 9 with live-pick numbering (overall 34 → live 8). Requirements: (1) when the commissioner creates the Sleeper draft room, auto-discover the draft ID via GET /league/{id}/drafts and auto-import slot assignments — no manual paste as the primary path (keep manual as fallback); (2) verify my slot against the Sleeper draft object and show the source ("slot 9 — from Sleeper draft" vs "slot 9 — manually set, unverified") ; (3) display BOTH numbering systems everywhere pick numbers appear — "live pick 8 (overall 34)" — so nothing I've prepped against (the pick-34 dossier, the opening script) mismatches the screen on draft night. One convention, labeled, everywhere.

### A3. Keeper-slate flow through Aug 20
The blocking banner is correct. Add: (1) auto-refresh designations as teams lock them, with a progress line ("6 of 10 teams designated"); (2) a notification/status change when all 10 land; (3) after I confirm the slate, the banner is replaced by a one-line confirmed stamp with timestamp; (4) the morning-of rebuild re-verifies the slate against Sleeper and re-raises the banner if anything changed after confirmation.

### A4. Fallback-pricing warning: reword to what it actually means
"1542 players priced by Sleeper popularity rank instead of real ADP (0% of the board)" reads like a crisis. Reality: the visible top-200 is 100% real FFC ADP; the fallback covers only the deep pool. Reword: "Top 200: real ADP. Deep pool (1,542 beyond FFC's coverage) priced by fallback — fine for late-round fliers." Amber only if fallback penetrates the top 200.

## B. Board quality

### B1. Onesie display ranking — no kicker belongs at #52
K/DST cross-position VORP is misleading in a league where replacement onesies are free all season. Fix the BOARD TABLE (composite already has rails): default "All" view demotes K/DST below all skill players regardless of VORP, with a "show onesies inline" toggle for the endgame; their tier/VORP stay visible in the position-filtered views where they're meaningful. Separately: audit the K replacement baseline — VORP 10 for K1 suggests the baseline is the worst roster-able K rather than the freely-streamable K; recompute against the streaming-available baseline and cite it.

### B2. ADP sentinels
"ADJ ADP 1257 / RAW 783" are sentinel values rendering as data. Display "—" (with a title tooltip "beyond ADP coverage") for any player outside real ADP range. Sentinels never render as numbers anywhere.

### B3. Tier banding on the board
Tier column exists; cliffs don't read. Add subtle row separators/background banding at tier boundaries within position-filtered views, and in the All view a thin marker where a position's tier breaks (the "last of Tier 1 WR" moment is the whole game). 

### B4. Flags column truncation
"QUESTI0" is clipping. Let flags wrap or render as compact badges with full text on tap. Also confirm OPP↑ has a legend/tooltip (opponent-likely-to-take marker?) — every badge needs a one-line explanation on tap.

## C. Missing-feature verdicts — built or not, in STATUS.md

For each: BUILT (where it renders) / PARTIAL / ABSENT (and if absent, it was specced — build or explicitly defer with my sign-off):
1. **LRM countdown strip** (2b.6): "DEF safe until pick X · QB act by Y" — not visible in the capture. This is the highest-value guidance element for a keeper draft that starts at round 4; if absent, build before mocks.
2. **Run-detection banner** home position on this page (Layer 3 exists in the engine — where does it render?)
3. **Global drift readout** ("room drafting N ahead of ADP")
4. **Override reason capture**: when I mark a pick that isn't the top recommendation, the one-tap reason prompt (target/gut/news/plan) must fire — the ledger needs it draft night
5. **Room-conformity readout** (if behavior-ADP shipped; else note pending)
6. **Intel Card / pick-34 dossier placeholder section** — reserve the slot on the page now so Backtest-2's findings have a home when they land

## D. Flow and safety

1. **END DRAFT button** sits next to CONNECT — a misclick catastrophe at live pick 30. Move it away from the primary flow and require a typed/held confirmation.
2. **Rehearse mode banner**: when in rehearsal, a persistent visible "REHEARSAL" watermark so a screenshot or a glance can never confuse sim state with the real draft (the capture's round-1/empty-roster state read ambiguously).
3. **Connection status**: "Not connected — manual entry works fine" is good honest copy; add the auto-discovery from A2 so the normal path is zero-config.

## E. The phone pass
The capture is desktop. Draft night is a phone. Run the full page on an actual phone viewport and fix: table horizontal scroll with sticky player-name column, tap-target sizes on I TOOK HIM / star / never buttons, the adjusters usable with a thumb, One Answer mode readable at arm's length, and the Before Your Next Pick panel not requiring zoom. Add a robot viewport test at 390px asserting no horizontal overflow outside designated scroll containers.

## Sequencing
A1–A4 first (state correctness — mocks are invalid without A1), then C verdicts (missing features decided before mocks), then B, D, E. Then shadows → opening script → mocks proceed as ordered, rehearsing the finished surface.


---

# PART 2 — LAYOUT REDESIGN (decision-first, paths-centered)


## 1. THE PATHS PANEL — the new centerpiece (replaces the flat top-5 as the primary decision surface)

Instead of five ranked cards, render **2–4 coherent DIRECTIONS**, each as a path card. Derivation (deterministic, from existing data):

1. Take the top ~10 candidates by composite score
2. Cluster them into directions by (position × tier-urgency × branch consequence) — e.g., all "elite TE now while the cliff holds" candidates collapse into one path; "best WR value, TE next turn" is another; "RB depth before the run" a third
3. A path qualifies if its best candidate is within a configurable band of the top composite score (default: within 12 pts or within the coin-flip threshold × 4) — beyond that, it's not a "solid direction," don't show it
4. Each path card contains:
   - **Name** (generated, plain language): "Lock the last elite TE" / "Ride the WR value fall" / "RB room now, onesies wait"
   - **The pick**: the path's best player, with score and the one-line Why
   - **The plan**: what your NEXT 1–2 picks look like down this path, from the branch forecast ("then at live 11: best WR ≈ 80 (54% McConkey survives), TE gone")
   - **The price**: composite delta vs. the top path ("costs 4.2 vs. Path A") — paths are priced, never hidden
   - **When it's right**: one generated line tying it to state ("right if you believe the TE cliff — 78% Bowers gone by your next pick" / "right if you trust the room to keep passing on WRs — MarianSaar behind you lets value fall")
5. Tapping a path expands its full candidate list (the other players who fit that direction) and its two-pick branch tree
6. The coin-flip banner integrates: when two paths price within the threshold, the banner says so at path level ("Paths A and B are a coin flip — take the one you believe in")
7. Ledger: the chosen path (which card the pick came from) is logged with the pick — override capture fires when I pick off-path

This converts the board from "a ranking to obey" into "a decision to understand" — which is what makes it trustable at speed.

## 2. ZONED LAYOUT

**Desktop / tablet (the second-screen case):** three zones visible without scrolling:
- **Zone 1 — DECIDE (center, 60%):** Paths panel; beneath it the compare tray (see §3)
- **Zone 2 — CONTEXT (right rail, 40%):** my roster w/ keepers + still-to-fill; LRM countdown strip; survival watchlist (my targets + path players only, not a fixed list); before-your-next-pick opponent strip (condensed: seat, top-2 likely picks, one tendency line each)
- **Zone 3 — DEPTH (below fold):** best-available-by-position strips; adjusters; queue/paper; targets/never; recent picks; Know Your League full cards; the full board table
- A slim **status bar** pinned top: pick clock/state, live+overall pick numbers, connection status, run/drift banners appear HERE (not buried mid-page)

**Phone (the real draft-night case):** sticky top status bar + Paths panel as the default view; Zone 2 becomes horizontally swipeable cards directly under the paths (Roster · LRM · Survival · Next Picks); Zone 3 behind a "Board & Tools" expander. On-the-clock mode collapses to: top path card + "other paths" pill + confirm. Nothing decision-critical may require scrolling past the first screen when on the clock.

## 3. COMPARE TRAY

Tap-to-compare any two players (from paths, board, or search): a two-column overlay with composite breakdown side by side, survival-to-next for each, tier position, bye interaction with MY roster, and the branch consequence of each ("take A → best B-position left ≈ X"). This is the "close call" tool — it exists because coin flips deserve a structured look, not more scrolling. Two taps in, one tap out.

## 4. DENSITY AND GLANCE FIXES (with the polish pass's B-items)

- Best-available-by-position becomes an always-visible **strip** (top 3 per position with survival %), not a dropdown — the dropdown hides exactly the cross-position glance the panel exists for
- Survival watchlist is contextual: my starred targets + all path candidates, auto-pruned as drafted — a fixed list of already-gone round-1 names (per the capture: five 0% rows) is dead weight
- Board table: sticky header + sticky player-name column; tier banding per polish B3; sentinels per B2; onesie demotion per B1
- Recent picks feed shows WHO took him + picks-early/late vs ADP inline — each pick is opponent-model evidence, display it as such

## 5. WHAT DOES NOT CHANGE

The adjusters (auto-mode + explanations) stay exactly as built — best-in-class. Know Your League full cards stay (Zone 3) with the condensed strip in Zone 2. The paper sheet stays. The Why? audit stays on every player everywhere. Tone stays.

## Acceptance
- Robot scenario: paths render at every rehearsal pick; chosen-path logging asserts; path count stays 2–4 and never includes a direction priced beyond the band
- Phone viewport test: on-the-clock state fits one screen at 390px, zero scroll to confirm a pick
- A rehearsal run-through where every decision for 12 picks is made WITHOUT opening Zone 3 — if that fails, Zone 1/2 are missing something; find it and move it up
