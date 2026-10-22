#!/usr/bin/env python3
"""Vägvis 2.0.2 – lägger in OSM-vägnätet (Overpass-svar) i startprojektet (source/geodata_project.json).

    python source/lagg_in_osm.py underlag/osm/vagnat_1280_malmo.json underlag/osm/vagnat_1283_helsingborg.json
    node source/build.cjs

Vägar som inte når någon DeSO i kommunen tas bort (filen täcker en rektangel med grannkommuner och hav).
Geometrin förenklas med 2 m tolerans och avrundas till 6 decimaler (cirka 0,1 m). Ingen trafik hittas på:
alla länkar får schablon-ÅDT per vägklass i motorn (aadt = null, quality = assumed).
Kräver shapely och pyproj."""
import datetime as dt
import hashlib
import json
import pathlib
import sys

import numpy as np
import shapely
from pyproj import Transformer
from shapely.geometry import shape
from shapely.strtree import STRtree

ROOT = pathlib.Path(__file__).resolve().parent.parent
PROJEKT = ROOT / 'source' / 'geodata_project.json'
TOL_M = 2.0
T1 = Transformer.from_crs(4326, 3006, always_xy=True)
T2 = Transformer.from_crs(3006, 4326, always_xy=True)


def proj(g, t):
    return shapely.transform(g, lambda c: np.column_stack(t.transform(c[:, 0], c[:, 1])))


def las(fil):
    raw = pathlib.Path(fil).read_bytes()
    data = json.loads(raw)
    if 'error' in str(data.get('remark', '')).lower() or 'timed out' in str(data.get('remark', '')).lower():
        sys.exit(f'{fil}: ofullständigt Overpass-svar ({data["remark"]}). Ladda ner filen igen.')
    return data, hashlib.sha256(raw).hexdigest(), len(raw)


def stad_for(data, ytor_per_stad):
    """Kommunen vars DeSO flest vägar ligger i."""
    antal = {}
    for c, (tr, polys) in ytor_per_stad.items():
        n = 0
        for e in data['elements'][::25]:
            g = e.get('geometry') or []
            if len(g) < 2:
                continue
            p = proj(shapely.Point(g[len(g) // 2]['lon'], g[len(g) // 2]['lat']), T1)
            if any(polys[j].contains(p) for j in tr.query(p)):
                n += 1
        antal[c] = n
    return max(antal, key=antal.get)


def main(filer):
    p = json.loads(PROJEKT.read_text(encoding='utf-8'))
    ytor = {}
    for c in p['cities']:
        polys = [proj(shapely.make_valid(shape(a['geometry'])), T1) for a in p['areas'] if a['city'] == c['id'] and a['level'] == 'deso']
        for q in polys:
            shapely.prepare(q)
        ytor[c['id']] = (STRtree(polys), polys)
    vagar, prov, noter = [], [], []
    for fil in filer:
        data, sha, storlek = las(fil)
        stad = stad_for(data, ytor)
        tr, polys = ytor[stad]
        tid = (data.get('osm3s') or {}).get('timestamp_osm_base', '')
        kalla = f'OSM · Overpass {tid[:10]} (dataläge {tid}) · ODbL'
        sett, n_in, n_ut, l_fore, l_efter = set(), 0, 0, 0.0, 0.0
        for e in data['elements']:
            g = e.get('geometry') or []
            tags = e.get('tags') or {}
            if e.get('type') != 'way' or len(g) < 2 or 'highway' not in tags or e['id'] in sett:
                continue
            sett.add(e['id'])
            linje = proj(shapely.LineString([(q['lon'], q['lat']) for q in g]), T1)
            if not any(polys[j].intersects(linje) for j in tr.query(linje)):
                n_ut += 1
                continue
            enkel = linje.simplify(TOL_M, preserve_topology=False)
            if enkel.length == 0 or len(enkel.coords) < 2:
                enkel = linje
            l_fore += linje.length
            l_efter += enkel.length
            koord = [[round(x, 6), round(y, 6)] for x, y in proj(enkel, T2).coords]
            vagar.append({'id': 'OSM-' + str(e['id']), 'city': stad,
                          'geometry': {'type': 'LineString', 'coordinates': koord},
                          'roadClass': tags['highway'], 'aadt': None,
                          'oneway': tags.get('oneway') in ('yes', '-1', '1') or tags['highway'] == 'motorway',
                          'year': int(tid[:4]) if tid[:4].isdigit() else dt.date.today().year,
                          'quality': 'assumed', 'source': kalla, 'countBasis': 'geometry'})
            n_in += 1
        namn = next(c['name'] for c in p['cities'] if c['id'] == stad)
        prov.append({'source': 'OSM_OVERPASS', 'city': stad, 'file': pathlib.Path(fil).name, 'sha256': sha, 'bytes': storlek,
                     'osmBase': tid, 'ways': n_in, 'waysOutsideDeso': n_ut,
                     'lengthKm': round(l_efter / 1000, 1), 'simplificationLengthChange': round(l_efter / l_fore - 1, 6)})
        noter.append(f'{namn}: {n_in} OSM-länkar från Overpass (dataläge {tid}); {n_ut} länkar utanför kommunens DeSO togs bort. '
                     f'Alla länkar har schablon-ÅDT per vägklass, inte uppmätt trafik.')
        print(f'{namn}: {n_in} vägar inom DeSO ({l_efter / 1000:.0f} km, förenkling {l_efter / l_fore - 1:+.4%}), {n_ut} utanför.')
    stader = {v['city'] for v in vagar}
    p['roads'] = [r for r in p.get('roads', []) if r['city'] not in stader] + vagar
    m = p.setdefault('metadata', {})
    m['networkYear'] = max(v['year'] for v in vagar)
    m['network'] = prov
    m['notes'] = [n for n in m.get('notes', []) if not n.startswith('Vägnät och trafikflöden saknas')
                  and 'OSM-länkar från Overpass' not in n] + noter + [
        'Vägnätet laddades ner av användaren via direktlänkarna i Vägvis 2.0.1 och lades in med source/lagg_in_osm.py. '
        'Trafikflöden (uppmätt ÅDT) saknas fortfarande.']
    PROJEKT.write_text(json.dumps(p, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'Skrev {PROJEKT} ({PROJEKT.stat().st_size / 1e6:.1f} MB, {len(p["roads"])} vägar).')


if __name__ == '__main__':
    main(sys.argv[1:])
