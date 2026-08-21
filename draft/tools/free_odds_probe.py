#!/usr/bin/env python3
# TERRITORY: relay probe (Cory 08-21: "Explore free Vegas odds we can get");
# results land in draft/backtest/free_odds_probe_2026.json; C consumes.
"""FREE NFL ODDS — which no-key sources actually serve lines, probed for real.

Rule 3e: a probe that has never returned a positive has only been run, not
tested. The known-positive here: NFL games exist RIGHT NOW (late-August
preseason + week 1 lines are posted league-wide), so a live odds source must
yield >=1 upcoming game with a NUMERIC spread or total attached to two real
team names. A source returning 200 with no such game is recorded as
NO-POSITIVE, never as "works".

Candidates (all keyless):
  espn      site.api.espn.com scoreboard — odds[] per competition
  bovada    bovada.lv public event JSON
  polymkt   Polymarket gamma API (prediction-market prices, not book lines)
  dk_pub    DraftKings public sportsbook JSON (unofficial; geo/CDN may block)
  yahoo     Yahoo sports odds-adjacent scoreboard
"""
import json
import re
import urllib.request
import datetime

UA = {'User-Agent': 'Mozilla/5.0 (research probe; league data project)'}

def get(url, timeout=25):
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except Exception as e:
        code = getattr(e, 'code', None)
        return (code if code else str(type(e).__name__ + ': ' + str(e)[:120])), b''

def espn():
    st, body = get('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard')
    out = {'status': st, 'bytes': len(body)}
    if st != 200:
        return out
    d = json.loads(body)
    evs = d.get('events', [])
    out['events'] = len(evs)
    pos = []
    for e in evs:
        comp = (e.get('competitions') or [{}])[0]
        for o in comp.get('odds', []) or []:
            if o.get('spread') is not None or o.get('overUnder') is not None:
                pos.append({'game': e.get('shortName'),
                            'provider': (o.get('provider') or {}).get('name'),
                            'spread': o.get('spread'), 'total': o.get('overUnder')})
    out['known_positive'] = pos[:3]
    out['games_with_lines'] = len(pos)
    return out

def bovada():
    st, body = get('https://www.bovada.lv/services/sports/event/v2/events/A/description/football/nfl')
    out = {'status': st, 'bytes': len(body)}
    if st != 200:
        return out
    txt = body.decode('utf-8', 'ignore')
    d = json.loads(txt)
    pos = []
    def walk(x):
        if isinstance(x, dict):
            if x.get('description') and x.get('displayGroups'):
                for g in x['displayGroups']:
                    for m in g.get('markets', []):
                        if m.get('description') in ('Point Spread', 'Total', 'Moneyline'):
                            for oc in m.get('outcomes', [])[:1]:
                                pr = oc.get('price', {})
                                pos.append({'game': x['description'][:60],
                                            'market': m['description'],
                                            'handicap': pr.get('handicap')})
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
    walk(d)
    out['known_positive'] = pos[:3]
    out['markets_seen'] = len(pos)
    # player props presence — the census question
    out['prop_mentions'] = len(re.findall(r'(Passing|Receiving|Rushing) (Yards|Touchdowns)', txt))
    return out

def bovada_event():
    """Per-EVENT detail: does Bovada serve player props there? Self-discovers
    the first upcoming event's link from the main payload (no hardcoded id)."""
    st, body = get('https://www.bovada.lv/services/sports/event/v2/events/A/description/football/nfl')
    out = {'status': st, 'bytes': len(body)}
    if st != 200:
        return out
    txt = body.decode('utf-8', 'ignore')
    m = re.search(r'"link":"(/football/nfl/[^"]+)"', txt)
    if not m:
        out['note'] = 'no event link found in main payload'
        return out
    link = m.group(1)
    st2, body2 = get('https://www.bovada.lv/services/sports/event/v2/events/A/description' + link)
    out['event_link'] = link
    out['event_status'] = st2
    out['event_bytes'] = len(body2)
    if st2 == 200:
        t2 = body2.decode('utf-8', 'ignore')
        props = re.findall(r'"description":"(Total (?:Passing|Receiving|Rushing) (?:Yards|Touchdowns)[^"]*)"', t2)
        anytd = t2.count('Anytime Touchdown')
        out['prop_markets'] = len(props)
        out['anytime_td_mentions'] = anytd
        out['known_positive'] = [{'prop': p} for p in props[:3]] or ([{'prop': 'Anytime Touchdown'}] if anytd else [])
    return out

def polymkt():
    st, body = get('https://gamma-api.polymarket.com/events?tag_slug=nfl&closed=false&limit=20')
    out = {'status': st, 'bytes': len(body)}
    if st != 200:
        return out
    d = json.loads(body)
    out['events'] = len(d) if isinstance(d, list) else 0
    pos = []
    for e in (d if isinstance(d, list) else [])[:20]:
        for mk in e.get('markets', [])[:1]:
            pos.append({'event': e.get('title', '')[:60],
                        'price_yes': mk.get('lastTradePrice')})
    out['known_positive'] = [p for p in pos if p.get('price_yes') is not None][:3]
    return out

def dk_pub():
    st, body = get('https://sportsbook.draftkings.com/sites/US-SB/api/v5/eventgroups/88808?format=json')
    out = {'status': st, 'bytes': len(body)}
    if st == 200:
        txt = body.decode('utf-8', 'ignore')
        out['has_offers'] = '"offerCategories"' in txt
        out['spread_mentions'] = txt.count('Spread')
    return out

def yahoo():
    st, body = get('https://sports.yahoo.com/site/api/resource/sports.league.scoreboard;league=nfl')
    return {'status': st, 'bytes': len(body)}

def main():
    res = {
        '_territory': 'relay probe; C consumes; results are the free-odds census',
        '_ask': 'Cory 2026-08-21: Explore free Vegas odds we can get',
        'captured_at': datetime.datetime.utcnow().isoformat() + 'Z',
        'sources': {},
    }
    for name, fn in [('espn', espn), ('bovada', bovada), ('bovada_event_props', bovada_event), ('polymarket', polymkt),
                     ('draftkings_public', dk_pub), ('yahoo', yahoo)]:
        try:
            res['sources'][name] = fn()
        except Exception as e:
            res['sources'][name] = {'error': type(e).__name__ + ': ' + str(e)[:200]}
    # verdicts, honest: POSITIVE only with a real line on a real game
    for name, s in res['sources'].items():
        kp = s.get('known_positive') or []
        s['verdict'] = ('POSITIVE — real lines on real games' if kp
                        else ('REACHABLE-NO-POSITIVE (status %s) — treat as untested, not as no' % s.get('status')
                              if s.get('status') == 200 else 'UNREACHABLE (status %s)' % s.get('status')))
    with open('draft/backtest/free_odds_probe_2026.json', 'w') as f:
        json.dump(res, f, indent=1)
    print(json.dumps({k: v.get('verdict') for k, v in res['sources'].items()}, indent=1))

if __name__ == '__main__':
    main()
