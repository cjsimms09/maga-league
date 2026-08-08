# THE CHRONICLE — governing voice & content spec

_Consolidates every amendment through 2026-08-08 into one authoritative
document. Where this and `league-history-page.md` disagree, **this wins on voice
and content**; that one keeps structure, navigation and machinery._

**Gate: NONE.** Re-audited 2026-08-08 — needs no draft data, no final roster, no
2026 season. See `docs/POST-DRAFT-LABEL-AUDIT.md`. Build order position **#7**.

---

## ⚠️ READ FIRST: what the data can and cannot support

The instruction that "the whole decade is already harvested" is **half true, and
the half that isn't shapes the whole page.**

| era | what exists | what that permits |
|---|---|---|
| **2016–2022** | buy-in, pot, payout %, and the **named winner of every money category** (`master_sheet_archive.json`, 12 seasons) | The Founding · The Amendments · The Rolls · champions · money |
| **2023–2025** | all the above **plus** full box scores — `points`, `starters`, `players_points`, `starters_points`, standings, 1,091 transactions, brackets, drafts | everything above **plus** the fraud, the robbed, the collapse, and every miracle and absurdity |

For 2016–2022 the season records are literally `standings: []`, `draft_order:
[]`, `trades: []`. Those seasons **pre-date Sleeper and exist nowhere else** —
the archive says so itself.

**Therefore:** the requirement that *every* season name the fraud, the robbed
and the absurdities is **satisfiable for 2023, 2024 and 2025.** The early decade
gets a *different kind of chapter* — shorter, ceremonial, money-and-amendments
— and the chronicle should own that openly rather than fake detail it does not
have. The gap is itself good material: an age before records, known only by who
took the money.

**Never invent a detail to fill an early season.** The stat-traceable rule has
no exception for atmosphere.

---

## 1. VOICE — chronicle FORM, tavern LANGUAGE

Ceremonial cadence and institutional structure, crude and cussing throughout.
**The contrast is the joke:** institutional gravity applied to Dixie Wrecked
benching thirty-four points.

> *In the Year of Our League Two Thousand Sixteen, ten men did assemble…*

It must read like **a real story of the league**, not a stats page with jokes
stapled on: narrative arcs across seasons, recurring characters, running gags
that develop year over year.

Generated at build time and **committed as content** — no runtime LLM calls.

## 2. EVERY SEASON MUST NAME (2023+)

1. **The champion** — with his one paragraph of *genuine* respect. No hedging, no
   joke inside it.
2. **The worst collapse.**
3. **The outrageously lucky.**
4. **THE FRAUD** — won games while scoring badly.
5. **THE ROBBED** — scored huge while losing.

### The instrument for fraud/robbed

Do **not** use "bottom-3 scorer with the best record" — a naive rank comparison
gets this wrong. Verified against the data: in 2025 that heuristic names
MarianSaar as robbed, when the correct answer is obvious and far better.

Use **all-play record**: score every team against every other team each week.
The gap between all-play win% and actual win% *is* fraud (positive) or robbery
(negative). It is the honest instrument and it produces the right answer.

> **Richard2121, 2025 — the league's greatest tragedy, and VERIFIED:**
> **1,711.20 points, 4–11, finished DEAD LAST (rank 10).** Third-highest scorer
> in the league. He outscored the 5th-place finisher by 55 points and the
> eventual 3rd-place finisher by 69. Write it as tragedy, in full ceremonial
> register. It is the single best piece of material in the archive.

## 3. MINE THE BOX SCORES FOR MIRACLES AND ABSURDITIES (2023+)

**The season summary is the frame; the absurdities are the content.** Auto-detect
and narrate:

- near-impossible comebacks · wins by under a point · ties
- a **kicker outscoring a starting QB**
- a **defense outscoring the entire WR corps**
- sub-70-point disasters
- **benched players who outscored the whole starting lineup**
- weekly highs lost by fractions
- **any week where last place beat first**

### Verified so far

| moment | status |
|---|---|
| **Jreis misses the weekly high by 0.12** — 2024 wk 1, 125.96 to Richard2121's 126.08 | ✅ exact |
| **Cory misses by 1.06** — 2024 wk 15, 130.34 to ds7mmet's 131.40 | ✅ exact |
| mhagen beats ds7mmet by 0.52 — 2023 wk 2 | ✅ exact (bonus find) |

## 4. RIB CORY, EVERY SEASON, UNPROMPTED

The commissioner's own history page cannot go easy on the commissioner or the
whole thing reads as propaganda. Material is abundant: 297 bench points in 2024,
the 8.2-point tiebreak, 85.9% efficiency three years running, four weekly highs
won and three donated, "Herbert the Pervert" as a team name.

**But the roast budget is measured per owner and Cory gets no more than anyone
else.** Unbiased means unbiased in both directions. Enforce with a counter.

## 5. THE LINES THAT DO NOT MOVE

- Every roast **stat-traceable**.
- **Fantasy incompetence and cursed luck only** — never anyone's real life,
  family, job, or anything genuinely sensitive. No slurs.
- The champion gets **one paragraph of real respect**.
- Equal-opportunity counter **enforced**, not intended.

## 6. RUNNING-GAG CONTINUITY

Track callbacks across chapters so the chronicle reads as **one continuous
story**, not ten disconnected recaps: ds7mmet's 0-for-eternity in playoff
openers, mhagen's dynasty, Sadbru's early defenses.

---

## 7. STRUCTURE — an evolving institutional record

1. **THE FOUNDING** — 2016, the original name (*Whiny Little Bitch League*), the
   founding ten, the first buy-in ($100).
2. **THE CHRONICLE OF AMENDMENTS** — every structural change as a dated entry
   with what it changed and what it cost:
   - buy-in escalation **100 → 125 → 150 → 200 → 250 → 300 → 350 → 400**
     (all in the master sheet)
   - payout-structure revisions per season
   - adoption of three keepers
   - the rebrand to **Make Football Great Again**
   - the founding of this website
   - **matters presently before the league** — the pending 2027 votes:
     *"Increase Buyin to $500?"*, *"Keep Keeper rules the same?"*,
     *"Change Payout percentages?"* (verbatim from the master sheet)
3. **THE SEASONS** — chapters in chronicle voice (see the era table above).
4. **THE ROLLS** — champions in order, the Money Board, all-time records, and
   owner changes: **none in league history. The same ten men, a decade.** Note
   that as remarkable, because it is.
5. **AUTO-APPENDING** — the January Annual adds each season's chapter *and* any
   amendments enacted that year, so the constitution grows itself.

---

## 8. LEAGUE LORE — verified context

### 8.1 Nationality

**David (ds7mmet) and Marian are German; the other eight American.** Small
country flags beside owner names in the home standings and franchise pages. The
chronicle may use it for texture — the German contingent, transatlantic rivalry
— **only where the data supports the specific claim.**

### 8.2 Running character beats

| beat | status |
|---|---|
| **David goes apoplectic at every buy-in increase** | the amendment ledger gives 100→400 across a decade; each escalation is a callback — *"and the German objected, as is tradition"* |
| **Jeremy is a doctor and the league mocks him for it** | social fact, no data needed |
| **Dylan can't get over the hump** | 2023 runner-up + league-worst 84.3% lineup efficiency — writes itself |
| **Bates is a Chiefs homer who overpays for KC players** | ❌ **REFUTED — see below** |

### 8.3 🔍 THE BATES CLAIM — verified, and it does not hold

Instruction was: *verify his picks vs ADP for KC players across three seasons; if
the reach is measurable cite the number, and if it isn't, say so and rib him for
the reputation anyway.*

**The reach magnitude is not computable.** Historical ADP for 2023/24/25 does not
exist in the repo — only the 2026 board. Without a market baseline there is no
"overpay" to measure. *(What would make it computable: archived FFC/consensus
ADP for those seasons. Filed, not fabricated.)*

**What IS computable — team loyalty — refutes the reputation.** Non-keeper picks
only (a keeper is not a draft decision), 400 of 407 matched:

| owner | KC picks | share | vs league rate |
|---|---|---|---|
| **ds7mmet** | 4 / 39 | 10.26% | 2.56× |
| **MarianSaar** | 4 / 37 | 10.81% | 2.70× |
| **B8T3S (Bates)** | **3 / 40** | **7.50%** | **1.88×** |
| Sadbru | 2 / 42 | 4.76% | 1.19× |
| Richard2121 / mhagen / Schmelley | 0 | 0% | 0× |

League-wide KC rate: 16/400 = 4.00%.

**Bates is the THIRD-biggest Chiefs drafter in his own league.** And none of it
is statistically distinguishable from chance — one-sided binomial: ds7mmet
p=0.069, MarianSaar p=0.059, **Bates p=0.214.** At three picks in three years
there is no signature here for anyone.

> **The joke writes itself, and it is better than the original:** the league's
> most notorious Chiefs homer is out-Chiefed by *the German*, who has never been
> accused of caring about Kansas City in his life. Rib Bates for the reputation —
> explicitly for having the reputation *without the receipts* — and give ds7mmet
> the crown he never asked for.

*Caveat to carry: player→NFL team comes from the 2026 board, so anyone who has
changed clubs is attributed to his current one. Noise in both directions, favours
no one. "FA" concentrations are a stale-team artifact and are not a loyalty
signal — do not narrate them.*

### 8.4 ⚠️ THE ASTERISK — the league's defining controversy

**Handle with care. This is the one place the register drops.**

State plainly, respectfully, **once**, with **no joke attached to the incident
itself**: the Marian/Sam championship "tie" resulted from the cancellation of the
Bills–Bengals game after **Damar Hamlin's on-field cardiac arrest.**

**THE JOKE IS THE TROPHY, NEVER THE EVENT.** Marian was losing; the game
vanished; the two agreed to split first and second; the league has disputed the
legitimacy ever since.

Requirements:

1. **An asterisk beside every listing of that Marian title** — standings, Money
   Board, franchise page, champions roll — linking to a footnote that explains
   it.
2. The chronicle chapter narrates it as **the league's LeBron-bubble-ring
   argument**.
3. It becomes a **permanent running gag** in later chapters — the disputed ring,
   never the reason it was disputed.

### 8.5 Mine for more

Scan three seasons of drafts, rosters and transactions for other true-and-funny
owner signatures: positional obsessions, chronic reachers, people who never
trade, people who churn the wire. **Only assert what the data supports** — and
where a beloved reputation turns out to be false, *that* is the better joke, as
§8.3 demonstrates.
