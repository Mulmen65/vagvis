#!/usr/bin/env python3
"""Bygg landmasker för kartvisning och landareal per DeSO och RegSO.

  python -m pip install shapely
  python verktyg/bygg_landmask.py earth-lands-10m.geo.json

Källa: OpenStreetMap-bidragsgivare via geo-maps, earth-lands-10m (ODbL),
https://github.com/simonepri/geo-maps/releases/download/v0.6.0/earth-lands-10m.geo.json

Masken används bara för att visa områdena utan havsyta i kartan och för nyckeltalet
"t CO₂e per hektar land". Beräkningen använder alltid SCB:s fullständiga DeSO-geometri,
så trafik på broar och i hamnar räknas med.

Skriver underlag/raw/coast_display_2026.json (masker per kommun), underlag/raw/land_area_2026.json
(landareal per område i hektar) och underlag/raw/coast_receipt.json (källa och kontrollsumma).
"""
from __future__ import annotations

import argparse
from datetime import date
import hashlib
import json
import math
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from paket import read_json  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT/'underlag/raw'
SOURCE = 'https://github.com/simonepri/geo-maps/releases/download/v0.6.0/earth-lands-10m.geo.json'
CITIES = {'1280': 'Malmö', '1283': 'Helsingborg', '2180': 'Gävle'}
SIMPLIFY_DEG = 0.00004  # cirka 3–4 m; påverkar bara visningen


def area_ha(geom):
    """Sfärisk area (R = 6 371 008,8 m) i hektar, samma formel som i bygg_underlag.py."""
    from shapely.geometry import mapping
    g = mapping(geom)
    polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates'] if g['type'] == 'MultiPolygon' else []
    total = 0.0
    for polygon in polys:
        for ri, ring in enumerate(polygon):
            a = 0.0
            for p, q in zip(ring, ring[1:]):
                a += math.radians(q[0]-p[0])*(2+math.sin(math.radians(p[1]))+math.sin(math.radians(q[1])))
            total += (1 if ri == 0 else -1)*abs(a)*6371008.8**2/2
    return total/10000


def rounded(geom, digits=5):
    from shapely.geometry import mapping, shape
    def walk(x):
        if isinstance(x[0], (int, float)):
            return [round(x[0], digits), round(x[1], digits)]
        return [walk(y) for y in x]
    g = mapping(geom)
    return shape({'type': g['type'], 'coordinates': walk(g['coordinates'])}).buffer(0)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('land', type=Path, help='earth-lands-10m.geo.json')
    a = p.parse_args(argv)
    try:
        from shapely.geometry import box, mapping, shape
        from shapely.ops import unary_union
        from shapely import clip_by_rect
    except ImportError:
        raise SystemExit('Verktyget kräver shapely: python -m pip install shapely')
    digest = hashlib.sha256(a.land.read_bytes()).hexdigest()
    deso = read_json(RAW/'scb_deso_2025.geojson.gz')['features']
    areas = {f['properties']['id']: (f['properties']['city'], f['properties']['regso'], shape(f['geometry']).buffer(0)) for f in deso}
    bounds = {}
    for city in CITIES:
        geoms = [g for c, _, g in areas.values() if c == city]
        u = unary_union(geoms)
        x0, y0, x1, y1 = u.bounds
        bounds[city] = (box(x0-0.02, y0-0.02, x1+0.02, y1+0.02), u)
    world = json.loads(a.land.read_text(encoding='utf-8'))
    parts = {city: [] for city in CITIES}
    for g in world['geometries']:
        polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        for poly in polys:
            xs = [pt[0] for pt in poly[0]]
            ys = [pt[1] for pt in poly[0]]
            for city, (bbox, _) in bounds.items():
                x0, y0, x1, y1 = bbox.bounds
                if max(xs) < x0 or min(xs) > x1 or max(ys) < y0 or min(ys) > y1:
                    continue
                # Klipp först mot rektangeln (snabbt även för stora landmassor), laga sedan geometrin.
                clipped = clip_by_rect(shape({'type': 'Polygon', 'coordinates': poly}), x0, y0, x1, y1)
                if not clipped.is_empty:
                    parts[city].append(clipped.buffer(0))
    del world
    masks, land_area, receipt_cities = {}, {}, {}
    for city, (bbox, u) in bounds.items():
        land = unary_union(parts[city]).intersection(bbox)
        # Exakt land för arealen; förenklad och avrundad mask för visningen.
        for kod, (c, regso, geom) in areas.items():
            if c == city:
                land_area[kod] = round(area_ha(geom.intersection(land)), 2)
        regsos = {}
        for kod, (c, regso, _) in areas.items():
            if c == city:
                regsos[regso] = regsos.get(regso, 0)+land_area[kod]
        land_area.update({k: round(v, 2) for k, v in regsos.items()})
        land_area['city|'+city] = round(sum(land_area[k] for k, (c, _, _) in areas.items() if c == city), 2)
        display = rounded(land.intersection(u.buffer(0.01)).simplify(SIMPLIFY_DEG, preserve_topology=True))
        masks[city] = {'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'properties': {
            'kalla': 'OpenStreetMap-bidragsgivare via geo-maps earth-lands-10m (ODbL), utsnitt '+CITIES[city]},
            'geometry': mapping(display)}]}
        receipt_cities[city] = {'status': 'primary_osm_generalised', 'source': SOURCE, 'nominalResolutionMetres': 10,
                                'displaySimplificationDegrees': SIMPLIFY_DEG, 'landHa': land_area['city|'+city],
                                'totalHa': round(area_ha(u), 2)}
    (RAW/'coast_display_2026.json').write_text(json.dumps(masks, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
    (RAW/'land_area_2026.json').write_text(json.dumps({'schema': 'vagvis-land-area-1', 'unit': 'hektar', 'source': SOURCE,
        'sha256': digest, 'method': 'Area av SCB:s DeSO 2025 snittad med OSM-landpolygoner (earth-lands-10m), sfärisk areaintegral.',
        'areas': land_area}, ensure_ascii=False, indent=0)+'\n', encoding='utf-8')
    (RAW/'coast_receipt.json').write_text(json.dumps({'schemaVersion': 2, 'accessed': date.today().isoformat(), 'use': 'display_and_land_area',
        'source': SOURCE, 'sha256': digest, 'licence': 'ODbL, © OpenStreetMap-bidragsgivare', 'cities': receipt_cities,
        'note': 'Beräkningen använder alltid SCB:s fullständiga DeSO-geometri. Masken påverkar bara kartvisningen och nyckeltalet per hektar land.'},
        ensure_ascii=False, indent=1)+'\n', encoding='utf-8')
    for city, r in receipt_cities.items():
        print(f"{CITIES[city]}: land {r['landHa']:.0f} ha av {r['totalHa']:.0f} ha; mask {len(json.dumps(masks[city]))/1000:.0f} kB")


if __name__ == '__main__':
    main()
