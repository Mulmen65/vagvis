"""Läs Vägvis packade projektfiler (vagvis-pack-1) i Python. Speglar unpackProject i core.js."""
from __future__ import annotations

import gzip
import json
from pathlib import Path

PACK = 'vagvis-pack-1'
SCALE = 1e6
ROOT = Path(__file__).resolve().parents[1]


def read_json(path):
    """Läs JSON eller gzip-komprimerad JSON (.gz)."""
    path = Path(path)
    raw = path.read_bytes()
    if path.suffix == '.gz':
        raw = gzip.decompress(raw)
    return json.loads(raw.decode('utf-8'))


def _line(a):
    out, x, y = [], 0, 0
    for i in range(0, len(a), 2):
        x += a[i]
        y += a[i+1]
        out.append([x/SCALE, y/SCALE])
    return out


def unpack_geometry(g):
    t, c = g
    if t == 'L':
        return {'type': 'LineString', 'coordinates': _line(c)}
    if t == 'ML':
        return {'type': 'MultiLineString', 'coordinates': [_line(x) for x in c]}
    if t == 'P':
        return {'type': 'Polygon', 'coordinates': [_line(x) for x in c]}
    if t == 'MP':
        return {'type': 'MultiPolygon', 'coordinates': [[_line(r) for r in p] for p in c]}
    raise ValueError('Okänd packad geometri: '+str(t))


def _polys(g):
    return [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']


def unpack_areas(o):
    if not isinstance(o, dict) or o.get('packing') != PACK:
        return o
    deso = [{**props, 'geometry': unpack_geometry(g)} for props, g in o['deso']]
    by_id = {a['city']+'|'+a['id']: a for a in deso}
    districts = []
    for props, g in o['districts']:
        if g:
            geometry = unpack_geometry(g)
        else:
            coords = []
            for member in props.get('members', []):
                coords.extend(_polys(by_id[props['city']+'|'+member]['geometry']))
            geometry = {'type': 'MultiPolygon', 'coordinates': coords}
        districts.append({**props, 'geometry': geometry})
    return deso + districts


def unpack_roads(o):
    if not isinstance(o, dict) or o.get('packing') != PACK:
        return o
    d = o['dictionaries']
    roads = []
    for rid, ci, ki, oneway, si, year, g, extra in o['items']:
        r = {'id': rid, 'city': d['city'][ci], 'roadClass': d['roadClass'][ki], 'aadt': None, 'oneway': bool(oneway),
             'year': year, 'quality': 'assumed', 'source': d['source'][si], 'countBasis': 'geometry'}
        if extra:
            r.update(extra)
        r['geometry'] = unpack_geometry(g)
        roads.append(r)
    return roads


def unpack_project(p, shared=None):
    out = dict(p)
    areas = out.get('areas')
    if isinstance(areas, dict):
        if areas.get('ref'):
            if shared is None:
                shared = read_json(ROOT/'kallkod/data'/(areas['ref']+'.json'))
            out['areas'] = unpack_areas(shared)
        else:
            out['areas'] = unpack_areas(areas)
    if isinstance(out.get('roads'), dict):
        out['roads'] = unpack_roads(out['roads'])
    return out


def load_project(name):
    """Läs kallkod/data/<name> och packa upp delad geometri."""
    return unpack_project(read_json(ROOT/'kallkod/data'/name))
