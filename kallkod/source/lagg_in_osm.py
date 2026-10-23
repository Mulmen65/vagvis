#!/usr/bin/env python3
"""Vägvis 2.0.2 (2.0.8: per kommun) – lägger in OSM-vägnätet (Overpass-svar) i startprojektet (source/geodata_project.json).

    python source/lagg_in_osm.py underlag/osm/vagnat_1280_malmo.json underlag/osm/vagnat_1283_helsingborg.json
    node source/build.cjs

Vägar som inte når någon DeSO i kommunen tas bort (filen täcker en rektangel med grannkommuner och hav).
Geometrin förenklas med 2 m tolerans och avrundas till 6 decimaler (cirka 0,1 m). Ingen trafik hittas på:
alla länkar får schablon-ÅDT per vägklass i motorn (aadt = null, quality = assumed).
Från 2.0.8 ersätts bara vägnätet för de kommuner som filerna gäller; övriga kommuners vägar, proveniens och
anteckningar behålls. Funktionen las_in_vagnat används också av lagg_till_kommun.py.
Kräver shapely och pyproj."""
import datetime as dt
import gzip  # noqa: F401  (komprimerade Overpass-filer)
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


VAGKLASSER = r'^(motorway|trunk|primary|secondary|tertiary|residential|living_street|unclassified|service)(_link)?$'


def las_osm_fil(fil):
    """OSM-fil (.osm.pbf, .osm, .osm.gz, .osm.bz2), till exempel från extract.bbbike.org eller Geofabrik, till samma
    form som ett Overpass-svar med 'out tags geom'. Kräver pyosmium (pip install osmium)."""
    import re
    import osmium
    reg, el, senast = re.compile(VAGKLASSER), [], ''
    for o in osmium.FileProcessor(str(fil)).with_locations():
        if not o.is_way() or not reg.match(o.tags.get('highway', '')):
            continue
        g = [{'lat': round(n.lat, 7), 'lon': round(n.lon, 7)} for n in o.nodes if n.location.valid()]
        if len(g) >= 2:
            el.append({'type': 'way', 'id': o.id, 'tags': {t.k: t.v for t in o.tags}, 'geometry': g})
            try:
                senast = max(senast, o.timestamp.strftime('%Y-%m-%dT%H:%M:%SZ'))
            except Exception:
                pass
    h = osmium.io.Reader(str(fil), osmium.osm.osm_entity_bits.NOTHING)
    tid = h.header().get('osmosis_replication_timestamp') or h.header().get('timestamp') or senast
    h.close()
    if not tid or tid.startswith('1970'):
        tid = dt.datetime.fromtimestamp(pathlib.Path(fil).stat().st_mtime, dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    return {'version': 0.6, 'generator': 'Vägvis lagg_in_osm.py från ' + pathlib.Path(fil).name,
            'osm3s': {'timestamp_osm_base': tid, 'copyright': 'OpenStreetMap contributors, ODbL'}, 'elements': el}


def fran_geojson(fc):
    """GeoJSON-export från Overpass Turbo (egenskapen @id = way/…) till samma form som ett Overpass-svar.
    Slutna vägar som Turbo gjort till polygoner (till exempel area=yes) blir linjer längs ytterkanten,
    som i Overpass-svaret."""
    el = []
    for f in fc.get('features', []):
        pr, g = f.get('properties') or {}, f.get('geometry') or {}
        typ, _, nr = str(pr.get('@id', '')).partition('/')
        if typ != 'way' or not nr.isdigit():
            continue
        if g.get('type') == 'LineString':
            k = g['coordinates']
        elif g.get('type') == 'Polygon':
            k = g['coordinates'][0]
        else:
            continue
        el.append({'type': 'way', 'id': int(nr), 'tags': {a: b for a, b in pr.items() if not a.startswith('@')},
                   'geometry': [{'lat': y, 'lon': x} for x, y, *_ in k]})
    return {'version': 0.6, 'generator': str(fc.get('generator', 'GeoJSON')) + ' (GeoJSON-export)',
            'osm3s': {'timestamp_osm_base': fc.get('timestamp', ''), 'copyright': fc.get('copyright', 'OpenStreetMap contributors, ODbL')},
            'elements': el}


def las(fil):
    namn = str(fil).lower()
    if namn.endswith(('.pbf', '.osm', '.osm.gz', '.osm.bz2')):
        raw = pathlib.Path(fil).read_bytes()
        return las_osm_fil(fil), hashlib.sha256(raw).hexdigest(), len(raw)
    raw = pathlib.Path(fil).read_bytes()
    if str(fil).endswith('.gz'):  # komprimerad fil (stora vägnät, under GitHubs gräns på 25 MB)
        import gzip
        raw = gzip.decompress(raw)
    data = json.loads(raw)
    if data.get('type') == 'FeatureCollection':  # GeoJSON-export från Overpass Turbo
        data = fran_geojson(data)
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


def las_in_vagnat(p, filer, kommuner=None):
    """Läser Overpass-filer in i projektet p (ändras på plats). kommuner: tillåtna kommunkoder (None = alla)."""
    ytor = {}
    for c in p['cities']:
        if kommuner and c['id'] not in kommuner:
            continue
        polys = [proj(shapely.make_valid(shape(a['geometry'])), T1) for a in p['areas'] if a['city'] == c['id'] and a['level'] == 'deso']
        for q in polys:
            shapely.prepare(q)
        ytor[c['id']] = (STRtree(polys), polys)
    vagar, prov, noter = [], [], []
    sett = set()  # samma väg i flera filer (till exempel ett vägnät nedladdat i två delar) läses bara en gång
    for fil in filer:
        data, sha, storlek = las(fil)
        stad = stad_for(data, ytor)
        tr, polys = ytor[stad]
        tid = (data.get('osm3s') or {}).get('timestamp_osm_base', '')
        kalla = f'OSM · Overpass {tid[:10]} (dataläge {tid}) · ODbL'
        n_in, n_ut, l_fore, l_efter = 0, 0, 0.0, 0.0
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
                     'lengthKm': round(l_efter / 1000, 1), 'simplificationLengthChange': round((l_efter / l_fore - 1 if l_fore else 0), 6)})
        noter.append(f'{namn}: {n_in} OSM-länkar från Overpass (dataläge {tid}); {n_ut} länkar utanför kommunens DeSO togs bort. '
                     f'Alla länkar har schablon-ÅDT per vägklass, inte uppmätt trafik.')
        print(f'{namn}: {n_in} vägar inom DeSO ({l_efter / 1000:.0f} km, förenkling {(l_efter / l_fore - 1 if l_fore else 0):+.4%}), {n_ut} utanför.')
    stader = {v['city'] for v in vagar}
    namn = {c['id']: c['name'] for c in p['cities'] if c['id'] in stader}
    p['roads'] = [r for r in p.get('roads', []) if r['city'] not in stader] + vagar
    m = p.setdefault('metadata', {})
    m['networkYear'] = max([v['year'] for v in vagar] + ([m['networkYear']] if m.get('networkYear') else []))
    m['network'] = [x for x in m.get('network', []) if x.get('city') not in stader] + prov
    slut = ('Vägnätet laddades ner av användaren via direktlänkarna i Vägvis och lades in med source/lagg_in_osm.py. '
            'Trafikflöden (uppmätt ÅDT) saknas fortfarande.')
    m['notes'] = [n for n in m.get('notes', []) if not n.startswith('Vägnät och trafikflöden saknas')
                  and not (any(n.startswith(x + ': ') for x in namn.values()) and 'OSM-länkar från Overpass' in n)
                  and not n.startswith('Vägnätet laddades ner av användaren')] + noter + [slut]
    return p


def main(filer):
    p = las_in_vagnat(json.loads(PROJEKT.read_text(encoding='utf-8')), filer)
    PROJEKT.write_text(json.dumps(p, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'Skrev {PROJEKT} ({PROJEKT.stat().st_size / 1e6:.1f} MB, {len(p["roads"])} vägar).')


if __name__ == '__main__':
    main(sys.argv[1:])
