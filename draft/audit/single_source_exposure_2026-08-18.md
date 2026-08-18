# SINGLE-SOURCE EXPOSURE — where the board is most likely to be wrong on Saturday

**Not a model change. A list to know before you pick.** Generated 2026-08-18 from the
published board.

`proj_mean` is **100% Sleeper** — verified element-wise, 608 of 608 players exactly equal
`proj_sleeper` (board provenance `sources: ["sleeper"]`, `blended: false`). That is a
documented decision, not a bug (`proj_mean_blend_2026-08-16.md`), and it is NOT being
changed before the draft: `proj_mean` → `vorp` → board ORDER is the widest blast radius
in the model.

**But it means every disagreement between the board and ADP is SLEEPER disagreeing with
the market** — the board has no model reason of its own to offer, because our own model
(`proj_ownmodel`) reaches the value term not at all.

Across 200 players inside ADP 220, FantasyPros runs **+5.5%** above Sleeper at the
median. The players below are where that gap is **≥ +40%** — i.e. the other source thinks
Sleeper is badly low, and the board can only hear Sleeper.

| ADP | player | pos | Sleeper | FantasyPros | gap |
|---|---|---|---|---|---|
| 130.9 | **Theo Wease** | WR | 6.9 | 37.1 | **+438%** |
| 137.7 | **Zach Charbonnet** | RB | 61.7 | 113.2 | **+83%** |
| 139.3 | **Alvin Kamara** | RB | 53.0 | 113.9 | **+115%** |
| 147.7 | **Brian Robinson** | RB | 63.4 | 89.7 | **+41%** |
| 153.3 | **Isiah Pacheco** | RB | 48.6 | 105.5 | **+117%** |
| 154.3 | **Woody Marks** | RB | 74.3 | 112.2 | **+51%** |
| 176.7 | **David Njoku** | TE | 46.5 | 80.9 | **+74%** |
| 186.5 | **Tank Dell** | WR | 57.4 | 116.1 | **+102%** |
| 192.0 | **Braelon Allen** | RB | 47.2 | 89.5 | **+90%** |
| 201.0 | **Cooper Kupp** | WR | 70.4 | 101.5 | **+44%** |
| 203.0 | **Calvin Ridley** | WR | 63.8 | 124.7 | **+95%** |
| 208.5 | **Dontayvion Wicks** | WR | 57.4 | 88.3 | **+54%** |
| 210.5 | **Justice Hill** | RB | 55.7 | 95.8 | **+72%** |
| 210.5 | **Jacoby Brissett** | QB | 183.0 | 261.4 | **+43%** |
| 211.5 | **Kaelon Black** | RB | 39.3 | 68.7 | **+75%** |
| 214.0 | **George Holani** | RB | 23.2 | 37.1 | **+60%** |
| 218.0 | **Ty Johnson** | RB | 47.3 | 84.0 | **+78%** |

**17 players.** Mostly running backs in ambiguous backfields — the situation a
single projection source resolves one way and another resolves the opposite way.

**How to use it at the table:** on these names the board's ranking carries less information
than usual, because it reflects one source's read of a split job rather than a consensus.
Treat the board's opinion on them as weakly held. **It is not a buy list** — FantasyPros
could be the wrong one — it is a list of picks where the board should not be the tiebreaker.

**Follow-up:** ledger **P39** / route **D14** re-open per-position source selection after
08-22, gated on the shared-population run (**P37**).

---

## THE REVERSE DIRECTION — checked, and it is NOT a live risk

The obvious follow-up: where is **Sleeper HIGHER** than FantasyPros? Those would be
players the board might **over**-rank — arguably more dangerous, because Cory would
actually draft them, where an under-ranked player he simply never sees.

**Only 9 players inside ADP 220 have Sleeper ≥25% above FantasyPros, and EVERY ONE
already carries negative `vorp`** (−22.6 to −218.3):

| ADP | player | pos | Sleeper | FP | gap | vorp |
|---|---|---|---|---|---|---|
| 152.0 | Oronde Gadsden | TE | 113.8 | 88.9 | +28% | −22.6 |
| 156.3 | Chris Rodriguez | RB | 125.0 | 92.8 | +35% | −54.3 |
| 182.3 | Omar Cooper | WR | 104.6 | 75.9 | +38% | −58.0 |
| 196.5 | Nicholas Singleton | RB | 57.7 | 17.6 | +229% | −121.6 |
| 210.0 | Ray Davis | RB | 60.6 | 32.0 | +90% | −118.7 |
| 216.0 | Michael Penix | QB | 123.4 | 94.3 | +31% | −218.3 |

**They are all below replacement, so the board never recommends them regardless.**

**THE EXPOSURE IS ONE-DIRECTIONAL IN PRACTICE, and that is the useful part.** Where
Sleeper is LOW, real players with genuine market value get buried — Kamara at ADP 139,
Pacheco at 153, Tank Dell at 187 — because a halved projection drops them under
replacement. Where Sleeper is HIGH, the player was already under replacement and the
inflation changes nothing Cory sees.

**So the risk is missing players, not drafting bad ones.** That is the cheaper error to
carry into a draft, and it is why the table above is a *"don't let the board be the
tiebreaker"* list rather than a *"the board is dangerous"* warning.


---

## ⭐ THE SHARPEST CUT — buried by the board AND rising in the market

Two independent signals, and where they overlap is where you are most likely to miss a
player entirely: **the board under-rates him because it hears only Sleeper, AND the room
is moving toward him so he will not last to his listed ADP.**

`adp_stale` is not "our data is old" — it flags a player whose ADP is **moving fast
enough that the listed number is already behind the market** (positive velocity = rising
= going earlier).

| ADP (listed) | player | pos | FP over Sleeper | ADP velocity |
|---|---|---|---|---|
| 201.0 | **Cooper Kupp** | WR | +44% | **rising +60.0** |
| 208.5 | **Dontayvion Wicks** | WR | +54% | **rising +23.5** |
| 186.5 | **Tank Dell** | WR | +102% | **rising +22.5** |
| 139.3 | **Alvin Kamara** | RB | +115% | **rising +10.0** |
| 153.3 | **Isiah Pacheco** | RB | +117% | **rising +8.7** |

**Take the listed ADP as a ceiling on where these go, not an estimate.** Both signals say
the board is late on them for different reasons, which is why the overlap is worth more
than either list alone.

### The other direction, for completeness — falling fast, may last longer than listed

| ADP | player | pos | velocity |
|---|---|---|---|
| 181.0 | Aaron Rodgers | QB | -34.5 |
| 210.5 | Justice Hill | RB | -33.5 |
| 208.0 | Emmett Johnson | RB | -30.3 |
| 201.0 | Pat Freiermuth | TE | -28.0 |
| 191.7 | James Conner | RB | -16.7 |
| 199.0 | Kayshon Boutte | WR | -16.5 |
| 157.3 | Malik Willis | QB | -15.7 |
| 186.7 | Dalton Schultz | TE | -15.0 |

**44 skill players inside ADP 220 are moving at all — 17 rising, 27 falling.**
