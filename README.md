# 🦅 Make Football Great Again — the Fantasy Football League

The official league office. Est. 2016. Scorekeeping stays on Sleeper — this site handles
**the money, the draft order, the votes, and the trash talk.**

Live architecture: static assets + one serverless function (Express) + Netlify Blobs for
storage. **No database to set up, no environment variables, $0/month.** Deploys automatically
on every push to this repo.

## What's inside

| Page | What it does |
|---|---|
| **League Office** (dashboard) | Buy-in banner, everyone's payment status, payout structure, weekly winners, live Sleeper standings & scoreboard, auto-roast of whoever's in last |
| **The Tab** | The money system. Every buy-in, weekly win, award, and side bet lands on an owner's tab as one net number — "owes the league $400" / "league owes $375" — carried across seasons until the commissioner settles it. Full settled history preserved forever |
| **Owners** | Career records, win %, championships 🏆, toilet bowls 🚽, career winnings |
| **History** | Every season since 2016, all-time money table, Wall of Shame |
| **Draft Room** | Reverse-standings spot selection (last place picks first), enforced turn by turn; 3-keeper declarations (keeper #N costs round N) |
| **Voting Booth** | Any owner can propose a rule change; 6 YES of 10 passes |
| **Commish Console** | Cory only: alerts, ledger, weekly winner (with one-click "Sleeper says…" recording), season awards, standings, draft controls, votes, owners, season setup, Sleeper connection, data export |

## Logins

Usernames are first names, lowercase: `cory` `marian` `david` `michael` `bates` `dylan`
`sam` `jeremy` `richard` `justin`. Starter password: **`imabitch`** — everyone must set
their own on first login. Cory is commissioner. (Hagen = Michael's team; his money lives
under Michael.)

## Sleeper

Commish → Sleeper → paste the league ID from `sleeper.com/leagues/<ID>/...`, then map each
Sleeper team to its owner. Free public API, read-only, no Sleeper password involved.

## The data

Seeds itself on first request with the full 2016–2026 history from the master spreadsheet.
Stored in Netlify Blobs under this site. **Backups:** Commish → Season Setup →
Export League Data (JSON download). Do it once in a while.

## Local development

```bash
npm install
npm start        # http://localhost:3000, data in ./data as JSON files
```
