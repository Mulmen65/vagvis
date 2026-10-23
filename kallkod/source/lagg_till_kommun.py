#!/usr/bin/env python3
"""Vägvis 2.0.8 – lägger till en kommun i modell A (startprojektet source/geodata_project.json).

    python source/lagg_till_kommun.py --kod 2180 --namn Gävle --deso underlag/DeSO_2025_2180.geojson \\
        --osm underlag/osm/vagnat_2180_gavle.json --land underlag/Land_Gavle_earth-lands-100m.geojson
    python source/berakna_ytor.py
    node bygg_appen.cjs            (från kallkod/: node ../kallkod/bygg_appen.cjs i arkivet)

DeSO: SCB:s DeSO 2025 som GeoJSON (WFS-svar eller egen export) eller GeoPackage. Bara DeSO vars kod börjar med
kommunkoden läses in. Koordinatsystemet läses ur filen (GeoPackage: gpkg_contents; GeoJSON: crs, annars WGS84).

Stadsdelsområden: kommunens stadsdelsområden i Bilmodell v7 (modell B). Varje DeSO 2025 knyts till det
stadsdelsområde vars DeSO 2018-ytor den överlappar mest (närmast om ingen överlappar). Stadsdelsområdets yta i
A blir unionen av dess DeSO 2025, så att hela kommunen täcks utan luckor.

Landmask (bara kartvisning och landyta för måttet per hektar): varje DeSO klippt mot land (--land, till exempel
ett utsnitt ur geo-maps earth-lands-100m). Utan --land används DeSO-ytorna som de är.

Vägnät: Overpass-svar, GeoJSON-export från Overpass Turbo eller OSM-fil (.osm.pbf), som lagg_in_osm.py.
Kalibrering: --referens med en kommunreferens (som Malmö); utan den räknas trafiken direkt på nätet (som Helsingborg).

Slumptal: kommunen får en egen slumpström (separateStream), så att de andra kommunernas osäkerhetsdragningar
blir exakt desamma som innan kommunen lades till. Kräver shapely och pyproj."""
import argparse
import json
import pathlib
import sqlite3
import sys

import numpy as np
import shapely
from pyproj import CRS, Transformer
from shapely import wkb
from shapely.geometry import mapping, shape

import lagg_in_osm

SRC = pathlib.Path(__file__).resolve().parent
PROJEKT, HUSHALL, MASKER = SRC / 'geodata_project.json', SRC / 'household_project.json', SRC / 'land_masks.json'
TILL_M = Transformer.from_crs(4326, 3006, always_xy=True)
TILL_G = Transformer.from_crs(3006, 4326, always_xy=True)


def proj(g, t):
    return shapely.transform(g, lambda c: np.column_stack(t.transform(c[:, 0], c[:, 1])))


def runda(g):
    """GeoJSON-geometri i WGS84 med 6 decimaler (cirka 0,1 m)."""
    def r(x):
        return [r(y) for y in x] if isinstance(x[0], (list, tuple)) else [round(x[0], 6), round(x[1], 6)]
    m = mapping(g)
    return {'type': m['type'], 'coordinates': r(m['coordinates'])}


def poly(g):
    g = shapely.make_valid(g)
    if g.geom_type in ('Polygon', 'MultiPolygon'):
        return g
    return shapely.union_all([x for x in getattr(g, 'geoms', [g]) if x.geom_type in ('Polygon', 'MultiPolygon')])


def las_deso(fil, kod):
    """[(desokod, egenskaper, geometri i SWEREF 99 TM)] för kommunen."""
    fil = pathlib.Path(fil)
    ut = []
    if fil.suffix.lower() == '.gpkg':
        c = sqlite3.connect(fil)
        tab, srs = c.execute("select table_name, srs_id from gpkg_contents where data_type='features'").fetchone()
        geomkol = c.execute("select column_name from gpkg_geometry_columns where table_name=?", (tab,)).fetchone()[0]
        kol = [r[1] for r in c.execute(f"pragma table_info('{tab}')")]
        t = Transformer.from_crs(srs, 3006, always_xy=True) if srs != 3006 else None
        for rad in c.execute(f"select * from '{tab}'"):
            e = dict(zip(kol, rad))
            b = e.pop(geomkol)
            env = (b[3] >> 1) & 7
            g = wkb.loads(bytes(b[8 + {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[env]:]))
            ut.append((e, proj(g, t) if t else g))
    else:
        d = json.loads(fil.read_text(encoding='utf-8'))
        crs = ((d.get('crs') or {}).get('properties') or {}).get('name')
        epsg = CRS.from_user_input(crs).to_epsg() if crs else 4326
        t = Transformer.from_crs(epsg, 3006, always_xy=True) if epsg != 3006 else None
        for f in d['features']:
            g = shape(f['geometry'])
            ut.append((f.get('properties') or {}, proj(g, t) if t else g))
    def kodfalt(e):
        for k in ('desokod', 'deso', 'DeSO', 'DESO', 'Deso', 'id', 'kod'):
            if isinstance(e.get(k), str) and len(e[k]) >= 9:
                return e[k]
        raise SystemExit('DeSO-koden hittades inte i ' + str(sorted(e)))
    res = [(kodfalt(e), e, poly(g)) for e, g in ut]
    res = [x for x in res if x[0].startswith(kod)]
    if not res:
        raise SystemExit(f'Inga DeSO för kommun {kod} i {fil.name}.')
    if len({x[0] for x in res}) != len(res):
        raise SystemExit('Dubbla DeSO-koder i filen.')
    return sorted(res), fil.name


def stadsdelar(kod, deso, B):
    """Knyter varje DeSO 2025 till ett stadsdelsområde i Bilmodell v7 (största överlapp med v7:s DeSO 2018)."""
    sd = {r['kod']: r['sd'] for r in B['households'] if r['kk'] == kod}
    v7 = [(sd[a['id']], poly(proj(shape(a['geometry']), TILL_M))) for a in B['areas'] if a['city'] == kod and a['level'] == 'deso' and a['id'] in sd]
    if not v7:
        raise SystemExit(f'Bilmodell v7 saknar stadsdelsområden för {kod}.')
    val = {}
    for k, _, g in deso:
        ov = {}
        for namn, h in v7:
            a = g.intersection(h).area
            if a > 0:
                ov[namn] = ov.get(namn, 0) + a
        val[k] = max(ov, key=ov.get) if ov else min(v7, key=lambda x: x[1].distance(g))[0]
    return val


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--kod', required=True)
    ap.add_argument('--namn', required=True)
    ap.add_argument('--deso', required=True)
    ap.add_argument('--osm', required=True, nargs='+')
    ap.add_argument('--land')
    ap.add_argument('--referens', help='JSON-fil med {"reference": {...}} för kalibrering (valfri)')
    ap.add_argument('--version', default='2025')
    a = ap.parse_args()
    p = json.loads(PROJEKT.read_text(encoding='utf-8'))
    B = json.loads(HUSHALL.read_text(encoding='utf-8'))
    masker = json.loads(MASKER.read_text(encoding='utf-8'))
    if any(c['id'] == a.kod for c in p['cities']):
        p['cities'] = [c for c in p['cities'] if c['id'] != a.kod]
        p['areas'] = [x for x in p['areas'] if x['city'] != a.kod]
        p['roads'] = [x for x in p['roads'] if x['city'] != a.kod]
        print(f'{a.namn} fanns redan och ersätts.')
    deso, filnamn = las_deso(a.deso, a.kod)
    val = stadsdelar(a.kod, deso, B)
    ref = json.loads(pathlib.Path(a.referens).read_text(encoding='utf-8'))['reference'] if a.referens else None
    p['cities'].append({'id': a.kod, 'name': a.namn, 'reference': ref, 'separateStream': True})
    for k, e, g in deso:
        p['areas'].append({'id': k, 'name': k, 'city': a.kod, 'version': a.version,
                           'sourceVersion': str(e.get('version') or e.get('sourceVersion') or a.version),
                           'regso': e.get('regsokod') or e.get('regso'), 'referenceDate': str(e.get('referensdatum') or e.get('referenceDate') or ''),
                           'sourceFile': filnamn, 'level': 'deso', 'geometry': runda(proj(g, TILL_G))})
    namn = sorted(set(val.values()), key=lambda x: x.lower())
    for i, n in enumerate(namn, 1):
        g = shapely.union_all([g for k, _, g in deso if val[k] == n]).buffer(0)
        p['areas'].append({'id': f'MODEL-v7-{a.kod}-{i:02d}', 'name': n, 'city': a.kod,
                           'version': 'bilmodell v7, DeSO 2025 grupperade efter v7:s stadsdelsområden',
                           'sourceFile': 'Bilmodell_v7 + ' + filnamn, 'officialMunicipalSubdivision': False,
                           'level': 'district', 'geometry': runda(proj(g, TILL_G))})
    # Landmask för visning och landyta
    if a.land:
        ld = json.loads(pathlib.Path(a.land).read_text(encoding='utf-8'))
        fs = ld['features'] if ld.get('type') == 'FeatureCollection' else [ld]
        land = poly(shapely.union_all([proj(shape(f['geometry']), TILL_M) for f in fs]))
    feats = []
    for k, _, g in deso:
        h = poly(g.intersection(land)) if a.land else g
        if not h.is_empty and h.area > 1:
            feats.append({'type': 'Feature', 'properties': {'kod': k}, 'geometry': runda(proj(h.simplify(5), TILL_G))})
    masker[a.kod] = {'type': 'FeatureCollection', 'features': feats}
    # Vägnät
    lagg_in_osm.las_in_vagnat(p, a.osm, kommuner={a.kod})
    m = p['metadata']
    m['notes'] = [n for n in m.get('notes', []) if not n.startswith(a.namn + ': DeSO')] + [
        f'{a.namn}: DeSO {a.version} ({len(deso)} st, {filnamn}) och {len(namn)} stadsdelsområden grupperade som i Bilmodell v7. '
        + (('Kalibreras mot ' + ref['description']) if ref else 'Ingen kommunreferens: trafiken räknas direkt på vägnätet.')
        + ' Egen slumpström, så att övriga kommuners dragningar är oförändrade.']
    dg = '; '.join(x.strip() for x in m.get('districtGrouping', '').split(';') if x.strip() and not x.strip().startswith(a.namn + ':'))
    m['districtGrouping'] = (dg + '; ' if dg else '') + f'{a.namn}: {len(namn)} stadsdelsområden ur Bilmodell v7 (DeSO 2025 grupperade efter största överlapp)'
    PROJEKT.write_text(json.dumps(p, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    MASKER.write_text(json.dumps(masker, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    for n in namn:
        print(f'  {n}: {sum(1 for v in val.values() if v == n)} DeSO')
    print(f'{a.namn}: {len(deso)} DeSO, {len(namn)} stadsdelsområden, {sum(1 for r in p["roads"] if r["city"] == a.kod)} vägar, '
          f'landmask {len(feats)} ytor. Skrev {PROJEKT.name} ({PROJEKT.stat().st_size / 1e6:.1f} MB) och {MASKER.name}.')


if __name__ == '__main__':
    sys.exit(main())
