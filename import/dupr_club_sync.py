"""Update app players' DUPR ratings and IDs from a DUPR club member list (read in the owner's browser)."""
import json, sys, urllib.request
DB = 'https://p4a-courts-87196-default-rtdb.firebaseio.com/p4a'

def req(m, path, body=None):
    r = urllib.request.Request(f'{DB}/{path}.json', data=None if body is None else json.dumps(body).encode(), method=m, headers={'Content-Type': 'application/json'})
    return json.loads(urllib.request.urlopen(r).read() or 'null')

def key(first, last):
    return (first.lower(), (last[:1] if last else '').lower())

members, precise = [], {}
for line in open(sys.argv[1]):
    line = line.strip()
    if not line or line.startswith('#'): continue
    if line.startswith('='):
        n, r = line[1:].split('|'); precise[n.lower()] = float(r); continue
    short, did, r = line.split('|'); members.append((short, did, float(r)))

roster = req('GET', 'players') or {}
by_key = {}
for pid, p in roster.items():
    parts = p['name'].split()
    by_key.setdefault(key(parts[0], parts[-1] if len(parts) > 1 else ''), []).append(pid)
prec_by_key = {}
for n, r in precise.items():
    parts = n.split(); prec_by_key.setdefault(key(parts[0], parts[-1]), []).append(r)

updated, unmatched = [], []
for short, did, r in members:
    parts = short.replace('.', '').split()
    if len(parts) < 2: unmatched.append(short); continue
    k = key(parts[0], parts[1]); hits = by_key.get(k, [])
    if len(hits) != 1: unmatched.append(short + (' (ambiguous)' if hits else '')); continue
    pid = hits[0]; p = roster[pid]
    rating = prec_by_key[k][0] if len(prec_by_key.get(k, [])) == 1 else r
    if p.get('rating') != rating: req('PUT', f'players/{pid}/rating', rating)
    if (p.get('dupr') or '') != did: req('PUT', f'players/{pid}/dupr', did)
    updated.append(f"{p['name']} {rating} ({did})")
req('PUT', 'meta/ratingsSync', {'at': sys.argv[1].split('club-')[-1].split('.')[0], 'source': 'DUPR club', 'matched': len(updated)})
print(len(updated), 'players updated:'); print('\n'.join(updated))
print('not matched:', ', '.join(unmatched))
