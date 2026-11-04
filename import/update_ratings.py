"""Set every player's rating to their most recent Pickleheads DUPR rating."""
import json, sys, urllib.request
sys.path.insert(0, 'import')
from import_pickleheads import ALIAS, SKIP, req  # noqa: E402

def precise(r):
    # Pickleheads shows round placeholders (2.5, 3.0, 3.5...) for players without a real DUPR.
    return abs(r * 2 - round(r * 2)) > 1e-9

def better(old, new):
    # new = (date, rating). A real DUPR beats a placeholder; otherwise the newer one wins.
    if old is None: return True
    if precise(new[1]) != precise(old[1]): return precise(new[1])
    return new[0] >= old[0]

def main(history_path, *fresh_paths):
    latest = {}  # name -> (date, rating)
    date = None
    for line in open(history_path):
        line = line.rstrip('\n')
        if not line or line.startswith('#'): continue
        if line.startswith('@'): date = line[1:].split('|')[0]; continue
        n, w, l, pf, pa, rating, wp = line.rsplit(',', 6)
        canon = ALIAS.get(n.strip().lower(), n.strip())
        if float(rating) > 0 and better(latest.get(canon), (date, float(rating))):
            latest[canon] = (date, float(rating))
    for fp in fresh_paths:
        d = fp.split('ratings-')[-1].split('.')[0]
        for line in open(fp):
            if not line.strip() or line.startswith('#'): continue
            n, r = line.strip().rsplit(',', 1)
            canon = ALIAS.get(n.lower(), n)
            if float(r) > 0 and better(latest.get(canon), (d, float(r))): latest[canon] = (d, float(r))
    roster = req('GET', 'players') or {}
    changed = []
    for pid, p in roster.items():
        hit = latest.get(p['name'])
        if hit and p.get('rating') != hit[1]:
            req('PUT', f'players/{pid}/rating', hit[1]); changed.append(f"{p['name']} {p.get('rating')}→{hit[1]}")
    print(len(changed), 'ratings updated:'); print('\n'.join(changed))

if __name__ == '__main__':
    main(*sys.argv[1:])
