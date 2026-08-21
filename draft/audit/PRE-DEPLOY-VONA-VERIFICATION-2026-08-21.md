# Pre-deploy audit: is VONA changing correctly, and is each source pulling right?

**E (red team), 2026-08-21. Cory, before the deploy: *"Everything needs to
correct, accurate and working!! VONA is changing correctly with each sources
each source is correct and pulling right into…"***

**Answer: YES, verified at every link of the chain, with zero mismatches.**
**Three presentation items remain open and none of them is VONA.**

---

## The chain, and how each link was tested

The question is not *"does the number move"* — I established that yesterday. It
is *"is the ESPN number really ESPN's, and does it reach the screen intact."*
Three independent links, each checked separately.

### Link 1 · Arithmetic — does VONA equal what it claims to be?

`VONA = best_now − expected_best_at_next_pick`, at pick 33 → 48, RB:

```
ds          234.0 − 198.9 = 35.10   vs VONA 35.1   OK
sleeper     192.5 − 184.4 =  8.10   vs VONA  8.1   OK
cbs         228.4 − 209.0 = 19.40   vs VONA 19.4   OK
espn        252.5 − 195.9 = 56.60   vs VONA 56.6   OK
fftoday     231.9 − 207.3 = 24.60   vs VONA 24.6   OK
fantasypros 230.9 − 201.3 = 29.60   vs VONA 29.6   OK
clay        252.5 − 196.0 = 56.50   vs VONA 56.5   OK
ownmodel    223.4 − 157.1 = 66.30   vs VONA 66.3   OK
```

**8 of 8 exact.**

### Link 2 · Source fidelity — is each source's number that source's own?

For every source × position, I took the source's own projection column off the
board (`proj_espn`, `proj_cbs`, `proj_sleeper`, `proj_fantasypros`,
`proj_ownmodel`, `proj_ds`, `proj_fftoday`, `proj_clay`) and checked that
`best_now_by_source[src]` is the maximum of that column among available players.

**32 of 32 source × position pairs verify.** And the players it resolves to are
football-sensible per source: ESPN's and Clay's best RB is Breece Hall (252.5,
identical — they are one source); FFToday's is Jeremiyah Love; our own model's is
Kyren Williams; CBS's best WR is Rashee Rice at 251.1 against Sleeper's DeVonta
Smith at 189.2. **The sources genuinely disagree, in the direction their own
numbers say they should.**

### Link 3 · Artifact → screen — does the page render what the artifact holds?

Real Chromium, logged in as Cory, all nine buttons clicked, VONA read off the
rendered page and compared to `position_boards.json`:

| source | page (RB WR QB TE) | artifact | |
|---|---|---|---|
| Blend | 35.1 29.8 1.3 31.6 | 35.1 29.8 1.3 31.6 | OK |
| Sleeper | 8.1 2.2 6.6 40.8 | 8.1 2.2 6.6 40.8 | OK |
| ESPN | 56.6 24.9 3.4 31.9 | 56.6 24.9 3.4 31.9 | OK |
| CBS | 19.4 59.1 3.8 34 | 19.4 59.1 3.8 34 | OK |
| Draft Sharks | 35.1 29.8 1.3 31.6 | 35.1 29.8 1.3 31.6 | OK |
| FFToday | 24.6 13.3 6 50.2 | 24.6 13.3 6 50.2 | OK |
| FantasyPros | 29.6 36.2 4.5 38.9 | 29.6 36.2 4.5 38.9 | OK |
| Mike Clay | 56.5 24.9 3.4 31.9 | 56.5 24.9 3.4 31.9 | OK |
| Our model | 66.3 4.7 0 68.2 | 66.3 4.7 0 68.2 | OK |

**9 of 9 exact.**

## My probe was wrong once, and the board was right — recorded per Rule 3f

Link 2 first reported **1 mismatch**: QB / own model claimed `best_now 333.1`
while the maximum `proj_ownmodel` among the six QBs on the card was 325.5.

**That was my probe, not the board.** `best_now` is computed over the whole
available pool; the card displays a short list in the *displayed* ordering. The
333.1 is **Jared Goff, ADP 112.2** — available at pick 33, correctly the best
own-model QB on the board, and simply not among the six shown. **31 of 32 pairs
"matched" only because those maxima happened to fall inside the displayed slice.**

**One presentational note falls out of it, and it is small:** with **Our model**
selected, QB reads **VONA 0** — correct, and it means *our model says waiting on
QB costs nothing* — but the man that number is about (Goff) is not on the card.
**One pair in 32. Not worth a change before the draft; worth knowing if he asks
why a VONA does not match the names under it.**

## What is still open, and none of it is VONA

* **Register 214 — the `gone?` column is still blank for all ten top RBs.**
  Unchanged: `1 J. Gibbs 1 — · 2 B. Robinson 1 — · 3 C. McCaffrey 2 — …`. One
  line of code, on the position he opens with.
* **Register 216 — the strike strip still does not follow the source, and the
  gap is now bigger than the numbers themselves.** `RB pick 33 costs 35` under
  all nine, while VONA ranges **8.1 (Sleeper) to 66.3 (Our model)**. On ESPN the
  chip says 56.6 and the strip beside it says 35; on Sleeper the chip says 8.1
  and the strip still says 35. **Same question, same units, up to 27 points
  apart.**
* **Register 226 — the banner still promises `tiers`.** The cliff drops are
  `10 / 16 / 3 / 21` under all nine sources, and the banner still reads *"VONA,
  **tiers** and the recommended player on THIS ENTIRE PAGE now reflect only this
  source."* **The VONA clause is now TRUE. The tiers clause is still false.**
  One word.

## Bottom line for the deploy

**VONA is correct, per-source, end to end — arithmetic, fidelity and rendering,
49 separate checks with zero real mismatches.** That is the thing Cory asked
about and it is sound.

**What ships alongside it that I would still fix:** two frozen panels (the strike
strip and the cliff lines) sitting beside a VONA that now moves, and a banner
sentence that promises one of them followed. **All three are display, none is
the model, and the two register rows are with B.**

## Method

Chromium via Playwright against `draft/tests/rehearsal-serve.js` (throwaway
`mkdtemp` DATA_DIR, seeded owner — never a live auth path), `/admin/warroom` at
pick 33, next 48, seat 8. Board columns and artifact read directly; the page read
after clicking each of the nine buttons and verifying the active button changed.
Board vintage `built_at 2026-08-21T00:29:00Z`. **I changed nothing.**
