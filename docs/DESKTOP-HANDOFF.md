# Desktop handoff — what to run where the network works

Paste the block below into a Claude Code session started **on the desktop**.
That session has your machine's internet: no proxy, no egress policy, nothing
to debug. Everything here is blocked in the cloud container and only in the
cloud container.

## Step 0 — one command that decides everything

```bash
curl -sI https://api.sleeper.app/v1/state/nfl
```

Headers back → continue. Anything else → stop and say so; nothing below will
work and no amount of retrying changes it.

## Step 1 — clone and set up

```bash
git clone https://github.com/cjsimms09/maga-league.git
cd maga-league
python -m venv .venv && . .venv/Scripts/activate      # Git Bash on Windows
                                                      # WSL/mac: . .venv/bin/activate
pip install -r draft/requirements.txt
npm ci                                                # only if running the site
```

## Step 2 — the real build and the eight blocked evidence items

```bash
bash draft/evidence/regen.sh 1374848328470102016 4
```

One command. It runs the acceptance curl, the full real pipeline build, then
regenerates items 5-7, 9, 13, 15, 25 and 26 and prints them. It **refuses to
run if the build comes back as fixture data** — that guard is deliberate and
should not be worked around; a fixture artifact and a real one differ by one
provenance field and produce equally confident numbers.

Substitute your real draft slot for `4` if it has changed.

## Step 3 — the two things the real artifact unlocks that nothing else does

Once `public/draft_data.json` is a real build, these become meaningful for the
first time. Neither needs network.

```bash
# Does the round-2 finding survive a real board?
node draft/tournament/round2.js 100 400
```

**Read the position mix before the cost.** On the fixture board MCTS deviated
from greedy in 100 of 100 states, always deferring a QB. Total behavioural
consistency like that is nearly always a property of the board, not the
strategy — this fixture prices QBs 120 points above every other position. If
100/100 breaks on the real board, the fixture finding described a quirk of the
inputs and its numbers predict nothing about draft day.

```bash
# Re-run the ship decision on a real board
node draft/tournament/run.js --drafts 1000 --iterations 400 --out draft/tournament/results-real.json
```

The verdict on the fixture board was branch 2 — present-but-off. Every number
behind that verdict came from a board labelled `DISABLED - do not draft off it`.

## What is NOT worth your desktop time

The dress rehearsal. It is still the highest-value item before 22 August and a
desktop changes nothing about it: one evening, your phone, a Sleeper mock,
three rounds minimum. If only one thing survives schedule pressure between now
and draft day, make it that one — not any of the above.
