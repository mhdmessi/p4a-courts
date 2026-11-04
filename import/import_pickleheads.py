"""Load Pickleheads round robin history into the group database (meta/history)."""
import json, sys, urllib.request

DB = 'https://p4a-courts-87196-default-rtdb.firebaseio.com/p4a'
ALIAS = {'mohammad salam': 'Mohammad Abdul Salam', 'sahl a': 'Sahl Ali', 'syed saleem': 'Syed Saleem',
         'moiz lakhani': 'MoiZ Lakhani', 'wasim c': 'Wasim Chowdhury', 'yusuf aadam': 'Yusuf Aadam'}
SKIP = {'raz guest', 'roz  guest', "asim's guest", 'mas mas', 'm m'}

def req(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    r = urllib.request.Request(f'{DB}/{path}.json', data=data, method=method, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(r) as resp:
        return json.loads(resp.read() or 'null')

sessions, cur = [], None
for line in open(sys.argv[1]):
    line = line.rstrip('\n')
    if not line or line.startswith('#'): continue
    if line.startswith('@'):
        date, slug, name = line[1:].split('|'); cur = {'date': date, 'slug': slug, 'name': name, 'rows': []}; sessions.append(cur); continue
    n, w, l, pf, pa, rating, wp = line.rsplit(',', 6)
    cur['rows'].append((n.strip(), int(w), int(l), int(pf), int(pa), float(rating), int(wp)))

roster = req('GET', 'players') or {}
by_name = {p['name'].lower(): pid for pid, p in roster.items()}
latest = {}
for s in sorted(sessions, key=lambda s: s['date']):
    for n, *_r in s['rows']:
        canon = ALIAS.get(n.lower(), n)
        if _r[4] > 0: latest[canon] = _r[4]

added, skipped = [], set()
for s in sessions:
    stats = {}
    for n, w, l, pf, pa, rating, wp in s['rows']:
        if n.lower() in SKIP or w + l == 0:
            skipped.add(n); continue
        canon = ALIAS.get(n.lower(), n)
        pid = by_name.get(canon.lower())
        if not pid:
            pid = req('POST', 'players', {'name': canon, 'rating': latest.get(canon), 'dupr': ''})['name']
            by_name[canon.lower()] = pid; added.append(canon)
        stats[pid] = {'wins': w, 'games': w + l, 'pf': pf, 'pa': pa, 'sg': w + l, 'points': round(wp / 10), 'sits': 0}
    req('PUT', f"meta/history/{s['slug']}", {'date': s['date'], 'name': s['name'], 'source': 'pickleheads', 'stats': stats})
    print(f"{s['date']} {s['name']}: {len(stats)} players")
print('new players added:', ', '.join(sorted(added)))
print('left out (guests):', ', '.join(sorted(skipped)))
