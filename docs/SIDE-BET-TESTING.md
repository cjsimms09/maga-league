# Side bets — how to test it

Fifteen minutes, two logins. Work top to bottom; each test leaves the state the
next one needs.

**You need two accounts.** Easiest is your phone signed in as `cory` and a
private/incognito window on a laptop signed in as `richard` or `david`. Starter
password is `imabitch`; anyone who has already logged in has their own.

---

## 1. The pool — your actual bet with Richard

*League Finances → Side Bets → ➕ Propose a side bet*

1. Choose **Pool**.
2. Played for: **whoever picked the team that wins the championship**.
3. Your picks: tap four other owners plus yourself.
4. Stake `100`. Settles when: `end of the 2026 season`.
5. Who's in it: **Richard**. → **Put it up**.

**Check:** you did not have to type the terms — the bet wrote its own sentence.

Now as Richard:

6. He should see a **badge on the Finances tab** and a banner at the top of the
   home page. (An email too, if his address is set in the commish console.)
7. *Side Bets → 🤝 Waiting on You.* **Tick his five teams on the accept form**,
   then **Accept** → the handshake dialog → *I'm good for it*.

**Check:**
- The bet moves to **🔥 On the Books**.
- The **pool board** lists all ten teams in standings order with a chip showing
  who took each one. Your rows are gold, his are plain, unpicked are dimmed.
- **↪️ Change my picks** on the card lets either of you fix a mistake.

> This is the one I most want your eyes on. Does the board make it obvious at a
> glance which teams are yours and which are his?

---

## 2. The market — a bet with nobody named

1. *Propose → **Straight bet***. Type something in "the bet, in your words".
2. Stake `25`. Tick **"Or post it to the market"**, takers wanted `1`.
   Notice the "who's in it" checkboxes grey out — you post it OR you name people.
3. **Put it up.**
4. Sign in as a third person → **📢 On the Board** → **Take the other side**.

**Check:** taking it locks the bet immediately. There is no second acceptance —
whoever posted it already agreed by posting.

---

## 3. A bet the site grades for you

Two ways in. Try both.

**From your matchup:** *My Team → this week's game → 🤝 Bet <opponent> on it →
stake → send.* That builds "your team outscores theirs in week N" for you.

**From the builder:** *Propose → Straight bet → ⚙️ Add if/then conditions →
+ Add a condition.* Build a row: `[you] [outscores] [them] [in week N]`.

**Check:** the gold italic line underneath reads your bet back to you in plain
English as you build it. If it doesn't say what you meant, the bet is wrong —
fix it before sending, not after.

Add a second condition and switch **ALL** to **ANY** — watch the sentence change.

Once it's locked, the card carries a verdict box:

- **⏳** — it can't be called yet, and it says *which fact is missing*.
- **⚖️** — it can be called, with every number it used listed, and a
  **"Settle it — X won"** button.

**The site never settles anything on its own.** It works out the answer and one
of you presses the button. Sleeper corrects stats for days after a game; a bet
auto-settled on a number that later moves is exactly the argument this is meant
to prevent.

---

## 4. Settling, and actually getting paid

Settle a bet three ways and make sure each behaves:

| How | Where |
|---|---|
| The engine's verdict | the **Settle it** button in the ⚖️ box |
| By hand | the **Settle by hand…** dropdown on the card |
| Push (nobody won) | the **Push** button beside it |

**Check after settling:**
- **💸 Who Owes Who** appears, one row per person, **netted**. If Richard owes
  you $100 from the pool and you owe him $40 from week 3, it says *Richard owes
  you $60* — not two rows that cancel.
- Tap **✓ Paid** / **✓ Got it** to clear a payment once money changes hands.
- **📲 How to Pay People** has everyone's Venmo/Cash App — tap a handle to copy
  it. Add yours under *Add or change yours*.
- **↺** undoes a result if you settled it wrong.

---

## 5. The one that matters most

**Side bets must never touch league money.**

Before and after settling anything, look at your row in *League Finances →
League Money*. **The balance must be identical.** Same for the all-time
winnings grid in History — side bets have their own book down at
*The Side-Bet Book*, and that is the only place they appear.

If a side bet ever moves a league balance, stop and tell me. That is the one
bug in this feature that actually costs somebody money.

---

## What can't be tested until games are played

Honest limits, so you don't read them as bugs:

- **A weekly condition can't produce a decided verdict yet.** The site
  deliberately refuses to grade the current week — it waits until a week is
  safely finished, because Monday-night scoring and Wednesday stat corrections
  both move numbers. Before then you get ⏳ and the reason.
- **A pool can't settle until the season is closed out** in the commish console.
  Until then it shows ⏳ plus who's currently leading.

Both are worth *looking* at now — the ⏳ text should make sense to somebody who
didn't build it. The decided paths are covered by 65 automated checks, including
the exact Cory/Richard pool resolving correctly, ties refusing to pick a winner,
and an unpicked champion coming out as a push.

---

## Three things I want your opinion on

1. **The pool board** — obvious which teams are yours?
2. **The handshake dialog** — right tone, or too much?
3. **Accepting a pool** — is it clear you're meant to pick your teams *before*
   hitting Accept, or did you nearly accept with none?
