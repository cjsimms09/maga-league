#!/usr/bin/env python3
# TERRITORY: capture (C's family; built by the relay on Cory's "Make sure we
# get these!!" 08-21 — C amends freely). Graduated from free_odds_probe run
# e7b81242: Bovada POSITIVE, keyless, real spread on a real game.
"""BOVADA FREE GAME LINES — snapshot capture, appended as JSONL.

Each run appends one snapshot of every NFL game's Moneyline / Point Spread /
Total to draft/data/bovada_lines_2026.jsonl (extracted rows, not the 626KB
raw). Thursday + Sunday crons give a movement pair and a closing-ish line for
every game, free.

RULE-3e GATE, in-run: the capture REFUSES to write anything unless it
extracted >= 4 games each carrying a NUMERIC spread or total — a 200 with an
empty or reshaped payload must fail loudly, never append junk. (Preseason
weeks can be thin; 4 is the floor that still catches a dead feed.)
"""
import json
import sys
import datetime
import urllib.request

URL = 'https://www.bovada.lv/services/sports/event/v2/events/A/description/football/nfl'
OUT = 'draft/data/bovada_lines_2026.jsonl'
UA = {'User-Agent': 'Mozilla/5.0 (league data project; lines snapshot)'}

def main():
    req = urllib.request.Request(URL, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.loads(r.read())
    ts = datetime.datetime.utcnow().isoformat() + 'Z'
    rows = []
    def walk(x):
        if isinstance(x, dict):
            if x.get('description') and x.get('displayGroups') and x.get('startTime'):
                game = {'ts': ts, 'game': x['description'], 'start': x.get('startTime'),
                        'link': x.get('link'), 'markets': {}}
                for g in x['displayGroups']:
                    for m in g.get('markets', []):
                        name = m.get('description')
                        if name in ('Point Spread', 'Total', 'Moneyline'):
                            game['markets'][name] = [
                                {'o': oc.get('description'),
                                 'h': (oc.get('price') or {}).get('handicap'),
                                 'p': (oc.get('price') or {}).get('american')}
                                for oc in m.get('outcomes', [])]
                if game['markets']:
                    rows.append(game)
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
    walk(d)
    def numeric(g):
        for mk in ('Point Spread', 'Total'):
            for oc in g['markets'].get(mk, []):
                try:
                    float(oc.get('h'))
                    return True
                except (TypeError, ValueError):
                    pass
        return False
    with_lines = [g for g in rows if numeric(g)]
    if len(with_lines) < 4:
        print(f'REFUSING TO WRITE: only {len(with_lines)} games with numeric lines '
              f'({len(rows)} games total) — feed dead or reshaped. Nothing appended.')
        sys.exit(1)
    with open(OUT, 'a') as f:
        for g in rows:
            f.write(json.dumps(g) + '\n')
    print(f'appended {len(rows)} games ({len(with_lines)} with numeric lines) at {ts}')

if __name__ == '__main__':
    main()
