"""Verify the lore claims against the harvested data. Assert nothing we cannot cite."""
import json, collections
H = json.load(open('draft/data/league_history.json'))
seasons = {s['season']: s for s in H['seasons']}

def owner_name(s, roster_id):
    o = s['owners'].get(str(roster_id)) or {}
    return o.get('display_name') or ('roster ' + str(roster_id))

print('=' * 78)
print('CLAIM 1 — Richard2121 scored ~1,711 points and went 4-11 (the ROBBED)')
print('=' * 78)
for yr in ('2023', '2024', '2025'):
    s = seasons[yr]
    byowner = {}
    for st in s['standings']:
        rid = st['roster_id']
        byowner[owner_name(s, rid)] = (st['wins'], st['losses'], st['ties'], st['points_for'], st['rank'])
    for nm, (w, l, t, pf, rk) in sorted(byowner.items(), key=lambda x: -x[1][3]):
        flag = ''
        if pf > 1650 and w <= 6: flag = '   <-- HIGH POINTS, LOSING RECORD'
        print(f'  {yr}  {nm:16s} {w:2d}-{l:<2d} PF {pf:8.2f} rank {rk:2d}{flag}')
    print()

print('=' * 78)
print('CLAIM 2 — the FRAUD: won games while scoring badly (low PF, good record)')
print('=' * 78)
for yr in ('2023', '2024', '2025'):
    s = seasons[yr]
    rows = []
    for st in s['standings']:
        rows.append((owner_name(s, st['roster_id']), st['wins'], st['losses'], st['points_for'], st['rank']))
    rows.sort(key=lambda r: r[3])
    worst_pf = rows[0]
    # fraud = best record among the bottom three scorers
    bottom3 = rows[:3]
    fraud = max(bottom3, key=lambda r: r[1])
    top3 = sorted(rows, key=lambda r: -r[3])[:3]
    robbed = min(top3, key=lambda r: r[1])
    print(f'  {yr}  FRAUD  {fraud[0]:16s} {fraud[1]}-{fraud[2]}  PF {fraud[3]:8.2f} rank {fraud[4]}')
    print(f'  {yr}  ROBBED {robbed[0]:16s} {robbed[1]}-{robbed[2]}  PF {robbed[3]:8.2f} rank {robbed[4]}')
print()

print('=' * 78)
print('CLAIM 3 — weekly-high near misses (Jreis by 0.12, Cory by 1.06)')
print('=' * 78)
for yr in ('2023', '2024', '2025'):
    s = seasons[yr]
    for wk in sorted(s['weeks'], key=lambda x: int(x)):
        entries = s['weeks'][wk]
        if not entries: continue
        scored = sorted(((e['points'], owner_name(s, e['roster_id'])) for e in entries), reverse=True)
        if len(scored) < 2: continue
        gap = scored[0][0] - scored[1][0]
        if gap <= 1.20:
            print(f'  {yr} wk{wk:>2s}  {scored[0][1]:14s} {scored[0][0]:7.2f}  beat  '
                  f'{scored[1][1]:14s} {scored[1][0]:7.2f}   by {gap:.2f}')
