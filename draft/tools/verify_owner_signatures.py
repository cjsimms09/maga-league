"""Team-loyalty signature per owner, 2023-25 drafts.

CAVEAT STATED UP FRONT: player->NFL team comes from the 2026 board, so anyone
who changed teams since is attributed to his CURRENT club. That adds noise in
both directions; it does not systematically favour any one owner. Reported
alongside the raw counts so the number can be discounted honestly.
"""
import json, collections
H = json.load(open('draft/data/league_history.json'))
B = json.load(open('public/draft_data.json'))
pmap = {p['player_id']: p for p in B['players']}
seasons = {s['season']: s for s in H['seasons']}

owner_team = collections.defaultdict(collections.Counter)
owner_total = collections.Counter()
league_team = collections.Counter()
unmatched = 0
total = 0

for yr in ('2023', '2024', '2025'):
    s = seasons[yr]
    for dr in s['drafts']:
        for pk in dr.get('picks') or []:
            if pk.get('is_keeper'):
                continue                      # a keeper is not a draft decision
            nm = s['owners'].get(str(pk['roster_id']), {}).get('display_name')
            p = pmap.get(str(pk['player_id']))
            total += 1
            if not p or not nm:
                unmatched += 1
                continue
            t = p.get('team')
            if not t:
                unmatched += 1
                continue
            owner_team[nm][t] += 1
            owner_total[nm] += 1
            league_team[t] += 1

league_n = sum(league_team.values())
print(f'non-keeper picks 2023-25: {total}   matched to a 2026 NFL team: {total-unmatched}   unmatched: {unmatched}')
print()
print('KC SPECIFICALLY — the Bates claim')
print('-' * 68)
kc_league = league_team['KC'] / league_n
print(f'league-wide KC share: {league_team["KC"]}/{league_n} = {kc_league*100:.2f}%')
rows = []
for nm in sorted(owner_total, key=lambda n: -owner_team[n]['KC']):
    kc = owner_team[nm]['KC']; n = owner_total[nm]
    rows.append((nm, kc, n, kc / n))
for nm, kc, n, sh in rows:
    mark = '  <-- BATES' if nm == 'B8T3S' else ''
    print(f'  {nm:14s} KC {kc:2d}/{n:3d} = {sh*100:5.2f}%   ({sh/kc_league:.2f}x league rate){mark}')
print()
print('MOST-CONCENTRATED SINGLE CLUB PER OWNER (the loyalty signature, any team)')
print('-' * 68)
for nm in sorted(owner_total):
    c = owner_team[nm]
    t, k = c.most_common(1)[0]
    exp = league_team[t] / league_n * owner_total[nm]
    print(f'  {nm:14s} {t:3s} {k:2d}/{owner_total[nm]:3d} = {k/owner_total[nm]*100:5.2f}%'
          f'   (expected {exp:.1f} at league rate -> {k/exp if exp else 0:.2f}x)')
