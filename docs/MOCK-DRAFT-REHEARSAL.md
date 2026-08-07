# Rehearsing the War Room against a Sleeper mock

Do this **twice** before 22 August. Once to find what's broken, once to prove
it isn't. Nothing else in this repo substitutes for it — every other check runs
against data I control, and draft day will not.

Budget 25 minutes. A Sleeper mock takes about 15.

---

## Before you start: get the checklist green

Open **⭐ Commish → 🧠 War Room** and expand **✅ Pre-draft checklist** at the top.
It checks live state, so whatever it says is true right now.

The three that matter most:

| Line | If it's not ticked |
|---|---|
| **Real ADP, not fixtures** | The board is placeholder data. Run the GitHub Action (below). |
| **Projections cover the board** | Same fix. Under 90% means VORP and VONA are near-zero and the board is re-printing ADP rather than analysing it. |
| **Snap / target data joined** | Same fix. This one has silently matched *nobody* before, so the % matters. |

**Do you need to rebuild?** Usually no — it rebuilds itself **every night at
3am Central**, plus Tuesday mornings and Sunday mornings. The checklist tells you
its actual age. Rebuild by hand only when you've changed something you want
reflected now: your draft slot, the league config, or keepers.

**To rebuild by hand:** GitHub → `cjsimms09/maga-league` → **Actions** →
**Build draft board** → **Run workflow**. A few minutes, commits the new board,
Netlify redeploys on its own. Reload the War Room and the banners should clear.

---

## 1. Start the mock

On Sleeper: **Draft → Mock Draft**, and match your real league as closely as it
lets you — **10 teams, half-PPR**, same roster slots. Sleeper's mock lobbies
won't let you set keepers, which is fine; that's what step 4 is for.

Once it starts, look at the browser address bar:

```
sleeper.com/draft/nfl/1234567890123456789
                     └──────────────────┘
                        the draft ID
```

Copy that number.

## 2. Connect it

War Room → **Live Sync** → paste the ID → **Connect**.

The status line under the box should change to *"Synced via … — N picks in"*
within a few seconds.

> **If it says "Sleeper unreachable":** the sync tries a direct call first and
> falls back to a proxy, so this usually means the ID is wrong rather than that
> anything is down. Re-copy it. Manual entry still works either way — that's
> what step 5 covers.
>
> **Want to know before you start?** Run the **Check Sleeper** action with the
> mock's draft ID — GitHub → Actions → *Check Sleeper* → *Run workflow* → paste
> the ID. It probes every endpoint the site uses and prints a verdict on whether
> a mock is publicly readable. It commits nothing and cannot break anything.
>
> That question is genuinely open: the sandbox this was built in blocks
> Sleeper's API entirely, so I have never seen a real response from this
> endpoint. Real drafts are readable; mocks *should* behave the same way. **If
> it fails, that's not a reason to skip the rehearsal — it's the single most
> valuable thing the rehearsal could find.**

## 3. Set your slot

The mock assigns you a slot. Put that number in **My Draft Slot** → **Set**.

**Check:** "picks 7, 14, 27, 34…" underneath updates to the snake order for that
slot. If it shows the wrong numbers, stop — everything downstream is wrong.

## 4. Check keepers reconcile

The board was built assuming your three keepers are off the board. A mock has no
keepers, so the site will notice a mismatch and say so.

**Expected:** a reconciliation note appears. That's correct behaviour, not a bug
— it's the same check that protects you on draft day if somebody's keeper
changes at the last minute. Confirm it *names the players* it's confused about.

## 5. Draft, and watch four things

Let the mock run and take your picks from the War Room.

1. **Picks appear** in *Recent Picks* within a few seconds of happening on
   Sleeper, and drafted players **leave** the board.
2. **One answer** — tap **⏱ One answer** when you're on the clock. One name, one
   reason. Does it feel usable at speed, or are you scrolling anyway?
3. **If You Take…** — before a pick, read the branch forecast. When it says
   *"take the TE and RB drops 20 by your next pick"*, does that match what
   actually happens two picks later? **This is the highest-value thing you can
   check.** The forecast is the piece I most want falsified.
4. **The plan and the byes** update as you draft. By your last two picks the
   plan should be saying *"every remaining pick is spoken for"* if you still
   need a K and a DEF.

## 6. Break it on purpose

Do these deliberately — draft day will do them to you accidentally.

- **Take somebody the board didn't recommend.** Use **I took him** on a player
  ranked 4th. Everything should recompute cleanly.
- **Star a player, then a rival takes him.** He should vanish without a fuss.
- **Block someone with 🚫.** He must never appear in a recommendation again.
- **Close the tab mid-draft and reopen it.** Your targets, blocks and weights
  should survive; picks re-sync from Sleeper.
- **Turn off wifi for thirty seconds.** The sync should say it's retrying and
  tell you manual entry still works. Turn it back on; it should catch up.

---

## What to tell me afterwards

Four questions, and "it was fine" is a useless answer to all of them:

1. **What did you look at that wasn't there?**
2. **Did the branch forecast ever turn out to be wrong?** Which pick?
3. **Was one-answer mode actually usable on the clock**, or did you go back to
   the board every time?
4. **What made you distrust it?** Any number that looked wrong, even if you
   couldn't say why. That instinct is worth more than a bug report.

---

## Known limits, so you don't report them as bugs

- **Mocks have no keepers**, so keeper reconciliation will always flag. On draft
  day it should be silent.
- **Manager profiles** ("🕵️ Know Your League") come from your real league's
  history. In a mock the other nine seats are strangers, so that panel is noise.
- **The site never auto-drafts.** It tells you who to take; you still tap the
  button in Sleeper. That is deliberate and will not change.
