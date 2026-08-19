# Your model is built and run. The upside term WORKS. The draft policy around it does not — yet.

**A, 2026-08-19.** Cory: *"PLEASE MAKE ME A MODEL THAT USES VONA, AND DRAFTS A
NORMAL ROSTER AND DRAFTS UPSIDE LATE (FIND A WAY TO CALC UPSIDE CORRECTLY!!!!!"*

Prereg `draft/VONA-UPSIDE-LATE-PREREG-2026-08-19.md` and module
`draft/tools/vona_upside_plan.js`, both committed before it ran.
**All five controls pass. Two of three predictions FAILED, and the failures are
the useful part.**

---

## 1. ⭐ UPSIDE, CALCULATED CORRECTLY — this part worked, and it is the first time

```
spread(p) = proj_ceiling(p) − proj_mean(p)          [cross-source players only]
upside(p) = spread(p) − median{ spread(q) : q same position,
                                within ±7 positional ranks of p }
```

**Spearman(upside, proj_mean) = 0.008 on 302 players.** Measured on this board
by the module itself, which refuses to run above 0.25.

| | correlation with value |
|---|---|
| raw `proj_ceiling` | +0.9951 |
| **the spread we ship at weight 0.45** | **+0.70** |
| **residual upside (this)** | **+0.008** |

**That is a genuine upside signal — the first thing in this project that measures
upside instead of measuring value twice.**

## 2. THE PLAN IT PRODUCES, on your real twelve picks

| pick | seat | take | proj | upside | why |
|---|---|---|---|---|---|
| 33 | FLEX | RB Travis Etienne | 206 | −5.1 | VONA, tie → safer |
| 48 | QB | QB Joe Burrow | 367 | −8.7 | VONA, tie → safer |
| 53 | WR | WR Jameson Williams | 184 | −3.2 | VONA, tie → safer |
| 68 | TE | TE Kyle Pitts | 151 | +4.7 | VONA |
| 73 | bench | RB Jonathon Brooks | 143 | **+6.3** | upside |
| 88 | bench | WR Alec Pierce | 164 | **+6.2** | upside |
| 93 | bench | TE Dallas Goedert | 138 | **+15.0** | upside |
| 108 | DEF | DEF LA Rams | 132 | −0.3 | VONA |
| 113 | K | K Brandon Aubrey | 146 | +1.9 | VONA |
| 128 | bench | QB Daniel Jones | 300 | **+24.2** | upside |
| 133 | bench | QB Malik Willis | 301 | **+11.4** | upside |
| 148 | bench | RB Chris Rodriguez | 101 | **+13.6** | upside |

**The structure you asked for is there: starters chosen on VONA and broken
toward the SAFER player, bench chosen on upside. Five of six bench picks
changed** — value would have taken Pollard, Gainwell, Strange, Shough, Shakir.

## 3. ⛔ AND IT DRAFTS THREE QUARTERBACKS IN A ONE-QB LEAGUE

**Full roster: `QB3 · RB5 · WR3 · TE2 · K1 · DEF1`.**

**P137 FALSE.** I predicted ≥2 QB ✅, ≥2 TE ✅, ≤6 RB ✅, 1 K ✅, 1 DEF ✅ — and
**≥4 WR, which it misses at 3.** Worse than the letter of the prediction:
**picks 128 and 133 are both backup quarterbacks.** That is register 60's
degeneracy — *"nothing penalises a pileup, so whatever prices best gets taken
repeatedly"* — **reappearing in the model I built to avoid it.**

**Why it happens:** upside is orthogonal to *value*, which is what I measured
and what I claimed. **It is not orthogonal to positional sanity.** The bench
shortlist is by value, and a backup QB prices positively on value, so nothing in
the chain ever asks "do I already have a quarterback."

**P138 FALSE on the letter, and the letter is what counts.** Five of six bench
picks changed ✅ — but a **starter moved**: QB Joe Burrow where `draft_plan.js`
takes Drake Maye. My FALSE condition said a moving starter means "the shortlist
rule leaked into the seats." **It did not** — the mover was the low-uncertainty
tie-break, which I also declared. **So the prediction is FALSE as written and my
stated diagnosis for that failure is wrong. Both, recorded, rather than
reinterpreting my own prereg after seeing the output.**

**P139 FALSE on ADP, TRUE on projections.** I predicted upside buys *cheaper*
players. Median ADP is **156.3 for both** sets — identical. Median projection
differs by **1.1%**. **Upside is not buying cheaper players; it is buying
different ones at the same price.**

## 4. ⚠️ THE SHARPEST CAVEAT, AND IT IS NOT IN ANY PREDICTION

**Our own projection model is bearish on four of the five upside picks:**

| | `proj_ownmodel` − `proj_mean` |
|---|---|
| Dallas Goedert | −13.0 |
| Chris Rodriguez | −36.9 |
| **Daniel Jones** | **−77.7** |
| **Malik Willis** | **−206.0** — the most bearish disagreement on the entire board |

**This is structural, not bad luck.** Cross-source disagreement is highest
exactly where a player is unproven or his role is contested — and `own_v6`,
built on prior-season production, marks those same players down hardest. **So
"high residual upside" and "our own model hates him" are close to the same
statement.** An upside term selecting Malik Willis is not obviously finding a
sleeper; it may be finding a player nobody can price.

## 5. WHAT I AM NOT DOING

**Not adding a positional cap and re-running until the roster looks right.**
That is fitting on the output, `no_fit_guard` forbids it, and it is exactly how
`need`, `ceiling` and `opportunity_adj` each went wrong. **`SHORTLIST_N = 10`
and the ±7 window stay where the prereg put them.**

**The fix is structural and it is preregistered, not tuned:** a positional
maximum derived from the league's own roster rules — one starting QB means at
most two rostered, one TE means at most three — is a *policy* stated in advance,
not a constant chosen because it improved a number. `draft_plan.js` already has
the mechanism (`PLAN_MAX_POS`). **That is the next preregistered arm, and it is
post-draft.** Register 106.

**Nothing here ships before Saturday.** The model is report-only, writes no board
field and changes no weight. `draft/data/vona_upside_plan.json` is the artifact.
