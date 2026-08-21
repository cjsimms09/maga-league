# WHAT DOES A 3-DAY-STALE BOARD ACTUALLY COST CORY ON SATURDAY?

<!-- TERRITORY: E (red team). Measured 2026-08-21. Routed to A. -->

> ## ⚠️ SUPERSEDED IN PART, BY ME, WITHIN THE HOUR — 2026-08-21
>
> **The board rebuilt successfully at `2026-08-21T00:29:00Z` (post-processed
> 00:34:49Z) while this document was being written.** So §2's *situation* is
> gone: Cory does **not** draft off a 3-day-stale board. What survives, and
> why this file is not deleted:
>
> * **§1 (zero flat bands) is now VERIFIED TWICE** — clean on the old 08-19
>   board *and* on the fresh 08-21 one (flat 0, missing 0, inside ADP ≤ 200).
>   Register 169's regression did **not** recur on the successful rebuild.
> * **§2's measurement stands as a general result** (what N days of ADP drift
>   costs) and is simply no longer the Saturday question.
> * **§3's null (P291) is untouched** — it is a property of the market, not of
>   any one board, and it was computed series-vs-series in consistent units.
> * **Register 174's hole is real and now permanent:** the series spans
>   08-09 → 08-21 with **12 entries over 13 calendar days — `2026-08-20` is
>   missing**, exactly as 174 predicted. That cost is banked and unbackfillable.
>
> **⚠️ AND A NEAR-MISS ON MY OWN SIDE, RECORDED BECAUSE IT IS THE POINT:** my
> first freshness check compared the board's `adjusted_adp` against the
> series and read a mean gap of 3.61 with only 2 of 200 identical — which
> looks exactly like "the rebuild pulled new data." It is not that. The series
> stores **`raw_adp`**, and against `raw_adp` the board is **198 of 198
> identical, max delta 0.00**. The 3.61 was the keeper adjustment, i.e. two
> different quantities compared. The board *is* fresh — the 08-21 series entry
> proves it — but I proved it with the wrong instrument first and would have
> written down a true conclusion supported by a false measurement. Rule 3f.

**Why this exists.** Register 174 says Cory's live board is two days stale
(`built_at` 2026-08-19T08:52:22Z, post-processed 08-20T02:00:28Z, draft 08-22
— a **3-day** gap by draft morning). Register 169's DEFAULT says: *"draft
Saturday off the CURRENT committed board, which has zero flat bands and is
2026-08-19 fresh."* **Two premises are load-bearing in that sentence and
neither had been checked against the artifact.** Rule 3f: verify the premise
before it becomes the plan.

---

## 1 · PREMISE ONE — "zero flat bands" — ✅ VERIFIED TRUE

Read off `public/draft_data.json` with register 169's own predicate, inside
ADP ≤ 200 (200 players):

| check | result |
|---|---|
| `proj_ceiling == proj_floor` (flat band) | **0** |
| `proj_ceiling == proj_mean` | **0** |
| band missing entirely (`None`) | **0** |

**A's fallback is safe on the dimension it names.** The flat-band defect is a
rebuild regression, exactly as register 169 says; the committed board does not
carry it.

## 2 · PREMISE TWO — "stale" as a COST — measured, and it is small

`draft/data/adp_series.json`, 11 daily snapshots 08-09 → 08-19. Movement of
players inside the top 200 by ADP, by gap size:

| gap | mean ΔADP | median ΔADP | max ΔADP | mean Δrank | median Δrank | max Δrank |
|---|---|---|---|---|---|---|
| 1d | 0.78 | 0.33 | 63 | 1.00 | 0.4 | 77 |
| 2d | 1.54 | 0.68 | 63 | 1.88 | 0.9 | 77 |
| **3d** | **2.23** | **0.89** | **67** | **2.64** | **1.1** | **81** |
| 5d | 3.45 | 1.40 | 71 | 3.91 | 1.6 | 84 |
| 10d | 5.37 | 2.33 | 87 | 5.93 | 2.0 | 100 |

**CONTROL (Rule 3e):** the same instrument at a 0-day gap returns exactly
`0.000` on every statistic — it is reading real changes, not manufacturing
them. Second independent check: the ladder is **monotone in gap size on all
six statistics**, which a broken probe does not produce.

**At the 3-day gap Cory actually faces, the median top-200 player moves 0.89
ADP slots and 1.1 rank positions.** That is immaterial to a pick.

**But the mean (2.23) is 2.5× the median and the max is 67** — the cost is not
spread evenly, it is a thin tail. Rule 3i: the mean alone would have been the
wrong number to quote in either direction.

## 3 · SO WHO IS IN THE TAIL? — the obvious patch, and why it FAILS

The tempting move: name the players who were still moving when the board froze
and treat their ADP as suspect. As of the board's own last data (08-16 → 08-19),
five sit inside Cory's draft range:

| Δ 3d | 08-16 → 08-19 | player | |
|---|---|---|---|
| −11.7 | 155.7 → 144.0 | De'Zhaun Stribling | WR SF |
| −11.3 | 138.7 → 127.4 | Theo Wease | WR MIA |
| +6.7 | 122.0 → 128.7 | Jakobi Meyers | WR JAX |
| −6.3 | 121.0 → 114.7 | Stefon Diggs | WR WAS |
| +6.0 | 148.3 → 154.3 | Oronde Gadsden | TE LAC |

**⛔ DO NOT ACT ON THAT LIST. ADP momentum does not persist.**

Does a player's move over `[t−3, t]` predict his move over `[t, t+3]`?

| window | n | corr |
|---|---|---|
| 08-09→08-12→08-15 | 227 | +0.192 |
| 08-10→08-13→08-16 | 231 | +0.133 |
| 08-11→08-14→08-17 | 230 | +0.040 |
| 08-12→08-15→08-18 | 232 | +0.129 |
| 08-13→08-16→08-19 | 232 | +0.266 |
| **POOLED** | **1152** | **+0.094** |

And of the 219 moves ≥5 slots, **128 (58%) continued the same direction** —
against a 50% coin flip.

**CONTROLS (Rule 3e), both exact:** `corr(x, x) = +1.000`;
`corr(x, shuffled y) = +0.001`. The null is a reading, not a dead probe.

**r = +0.094 and 58%-vs-50% is not enough to reprice anybody.** Extrapolating
the movers would have been a costume — it looks like a correction and carries
no information. I nearly filed the five names as "players to watch" and the
persistence check is the only reason this document does not say that.

## 4 · WHAT THIS MEANS FOR SATURDAY

1. **A's DEFAULT is well-founded, not merely expedient.** Zero flat bands in
   range (verified), and the typical staleness cost is ~0.9 ADP slots. Drafting
   off the 08-19 board is a sound plan on the evidence, and register 169 can be
   ruled on that basis rather than on time pressure.
2. **No staleness patch should ship.** There is no measurable momentum signal
   to correct with. The right response to the tail is Cory's own eyes on news,
   not an extrapolation the data does not support.
3. **The staleness that DOES matter is register 174's actual point** — the
   unbackfillable daily series losing days — which is a 2027-experiment cost,
   not a Saturday cost. **The two should not be quoted as one problem.** They
   have been running together in conversation and they have different owners,
   different deadlines and different severities.

## 5 · FOLLOW-UP QUESTIONS (Rule 3g)

* **Does this imply another failure we have not looked for?** One overlap worth
  naming: **Ja'Kobi Lane is both one of the ten flat-band players register 169
  names AND the #2 fastest ADP mover in this window (−15.5).** If the flat-band
  branch preferentially hits players whose inputs are in motion, register 169's
  cause may be *coverage arriving mid-flight* rather than a static branch bug.
  Stated as a hypothesis for A, **not** a claim — I cannot test it, because the
  flat bands exist only on the candidate board, which by definition does not
  survive.
* **Does it invalidate something we already trust?** It removes the implied
  severity from "the board is two days stale" as a *draft* concern. It does not
  touch register 174's data-series argument, which stands unchanged.
* **Is it routed to the lane that can act?** Yes — A owns both registers and
  the Saturday ruling. Nothing here is mine to ship.

**ASK: none — this is evidence for a ruling A already holds.**
**REC:** rule register 169 on the verified premise and let the current board
draft Saturday. **DEFAULT:** if A does nothing, the same outcome obtains, which
is the point of measuring it.

---

# ADDENDUM, 2026-08-21 — CORY ASKED "WHY THE TE TILT??", AND THE ANSWER CAME WITH A FALSE ALARM I STOPPED AT THE LAST STEP

## A · WHY THE TE TILT — measured on the fresh 08-21 board

Board rank vs market (ADP) rank, market top 200, positive = board takes him EARLIER:

| pos | n | mean tilt | median |
|---|---|---|---|
| QB | 28 | +7.5 | +10.5 |
| RB | 58 | −18.8 | −8.5 |
| WR | 69 | −10.4 | −4.0 |
| **TE** | **26** | **+28.0** | **+20.0** |

**Two causes, measured separately.**

**(1) ~a third of it is our replacement level.** Ours sits at TE10; the published
reference model (`DUPLICATE-A-REAL-MODEL`, ffanalytics) uses **TE13**. Re-ranking
the whole board on the reference levels (QB13/RB35/WR36/TE13):

| pos | tilt now | tilt on reference levels |
|---|---|---|
| QB | +7.5 | −11.6 |
| **RB** | **−18.8** | **−4.1** |
| WR | −10.4 | −7.7 |
| **TE** | **+28.0** | **+19.1** |

**CONTROL:** the same re-ranker fed the board's OWN levels reproduces the board's
`overall_rank` at **95.6% exact, mean |diff| 0.07, max 5** (residual is tie-break
order inside identical VORP). The instrument is faithful.

Note what else that table says: **the reference levels would nearly erase the RB
fade (−18.8 → −4.1)** — which matters because register 133 measured RBs
*appreciating* and the board pricing that shift only halfway. Register 151's
"two replacement tables disagree by 2×" is the same finding from the other side.

**(2) ~two thirds is NOT ours at all — every projection source does it.**

| source | QB | RB | WR | TE |
|---|---|---|---|---|
| BLEND (shipped) | +10.5 | −8.5 | −4.0 | **+20.0** |
| Draft Sharks | +8.5 | −9.0 | −1.0 | **+19.5** |
| Sleeper | +10.0 | −37.0 | +4.0 | **+26.5** |
| FantasyPros | +11.0 | −5.0 | −6.0 | **+19.5** |
| own_v6 | −13.5 | −12.0 | −5.0 | **+29.0** |

**Every source, +19.5 to +29.0.** So the TE tilt is not our blend, not our bug,
and only partly our replacement level. **It is the gap between projected points
and what drafters pay for tight ends** — a property of the market, which is
exactly what P248 was filed to grade on 2025 outcomes.

**A theory I had and MEASURED AWAY rather than shipped:** I expected TE to be
*flat* near replacement (many interchangeable TEs → small VORP magnitudes →
they float up a cross-position sort). **False.** TE drops **13.1 pts per 5 slots**
past replacement against RB's 8.9 and QB's 6.2 — TE is the *steepest* of the
four. The crowding explanation is dead.

## B · THE FALSE ALARM — stopped one step before I escalated it

Drafting **board order** (top available by `overall_rank`) at Cory's twelve real
picks returns **RB 1 · QB 4 · WR 1 · TE 6**. Running the bare engine
`E.recommend()` in a loop returns **RB 8 · WR 2 · QB 1 · TE 1 — with zero K and
zero DEF**, i.e. an unfieldable roster. Against his ruled target (RB 4.78 /
WR 5.00 / TE 1.67) both look catastrophic, and the second one looks like
register 59 alive again despite `need: 1.0`.

**⛔ NEITHER IS WHAT SHIPS, AND I CHECKED BEFORE ALERTING ANYONE.** The
artifacts the war room actually serves, both built from this same 08-21 board:

* `mlv_plan.json` → **RB 3 · WR 4 · QB 1 · TE 2 · DEF 1 · K 1** — every starting
  slot filled, K and DEF taken, and the six picks it has no opinion about are
  **stamped "MLV IS INDIFFERENT"** rather than dressed up as confident picks
  (register 149's fix, working).
* `seat_plan.json` → slot-aware by construction (`FLEX / QB / WR / TE / DEF / K`
  named per pick), K and DEF both seated.

**So the failure was in MY harness, not the product:** calling `recommend()` bare
skips the roster rails the war room applies around it. **The 8-RB roster is an
artifact of the instrument, and the honest report is that the shipped planning
surfaces are roster-aware and legal.** Not routed to A as a defect, because it
is not one.

**What survives as a real (small) note:** a raw cross-position VORP sort is not a
draft order — board-order top-available really does give 6 TEs — which is
*why* the seat and MLV plans exist. It only becomes a hazard if some surface
invites reading `overall_rank` as "take this one". Worth B's eye post-draft, not
a Saturday change.

## C · WHAT THIS COST ME, RECORDED

**Second near-miss in one session from my own instrument** (the first: comparing
`adjusted_adp` to a series that stores `raw_adp`). Both would have produced a
confident, wrong escalation the day before the draft. Both were caught by the
same move — **check the claim against the shipped artifact before writing it
down.** Rule 3d says an implausible result is a bug report until proven
otherwise; "the tool drafts 8 RBs and no kicker" was implausible, and it was my
bug, not the tool's.
