#!/usr/bin/env python3
"""Bygg landmask (yta utan hav) för kartan och ytan utan hav per DeSO och RegSO.

  python -m pip install shapely==2.2.0 pyshp==2.3.1
  python verktyg/bygg_landmask.py land-polygons-split-4326.zip

Källa: OpenStreetMap-bidragsgivare, landpolygoner från osmdata.openstreetmap.de (ODbL):
https://osmdata.openstreetmap.de/download/land-polygons-split-4326.zip
GitHub-flödet "Bygg landmask" hämtar filen, kör verktyget och lägger resultatet i en pull request.
Det går också att ange en GeoJSON-fil med landpolygoner i WGS84.

Masken används bara för att visa områdena utan hav i kartan och för nyckeltalet
"t CO₂e per hektar utan hav". Utsläppen beräknas alltid med SCB:s fullständiga DeSO-geometri,
så trafik på broar och i hamnar räknas med. Sjöar räknas som land (OSM:s landpolygoner skiljer
bara land från hav).

Kontroll: masken jämförs med OSM-vägnätet i paketet. Högst 1 % av vägpunkterna i en kommun får
ligga mer än 15 m utanför landytan (broar). Grövre eller inaktuella kustlinjer avvisas. I 2.2.5
prövades geo-maps earth-lands-10m; där låg 2,8 % (Malmö) och 4,7 % (Gävle) av vägpunkterna i
"havet", eftersom hamnar och öar saknades.

Skriver underlag/raw/coast_display_2026.json (masker per kommun), underlag/raw/land_area_2026.json
(yta utan hav per område i hektar) och underlag/raw/coast_receipt.json (källa, kontrollsumma och
kontrollresultat).
"""
from __future__ import annotations

import argparse
from datetime import date
import hashlib
import json
import math
from pathlib import Path
import shutil
import sys
import tempfile
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
from paket import read_json  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT/'underlag/raw'
OSMDATA = 'https://osmdata.openstreetmap.de/download/land-polygons-split-4326.zip'
CITIES = {'1280': 'Malmö', '1283': 'Helsingborg', '2180': 'Gävle'}
SIMPLIFY_DEG = 0.00002   # cirka 1–2 m; påverkar bara visningen
ROAD_TOLERANCE_M = 15    # vägar längs strandkanten
MAX_OUTSIDE_PERCENT = 1.0


def area_ha(geom):
    """Sfärisk area (R = 6 371 008,8 m) i hektar, samma formel som i bygg_underlag.py."""
    from shapely.geometry import mapping
    g = mapping(geom)
    polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates'] if g['type'] == 'MultiPolygon' else \
        [p['coordinates'] for p in g.get('geometries', []) if p['type'] == 'Polygon'] + \
        [q for p in g.get('geometries', []) if p['type'] == 'MultiPolygon' for q in p['coordinates']]
    total = 0.0
    for polygon in polys:
        for ri, ring in enumerate(polygon):
            a = 0.0
            for p, q in zip(ring, ring[1:]):
                a += math.radians(q[0]-p[0])*(2+math.sin(math.radians(p[1]))+math.sin(math.radians(q[1])))
            total += (1 if ri == 0 else -1)*abs(a)*6371008.8**2/2
    return total/10000


def polygonal(geom):
    """Behåll bara ytor (klippning kan ge linjer och punkter)."""
    from shapely.geometry import MultiPolygon
    if geom.is_empty:
        return MultiPolygon()
    if geom.geom_type in ('Polygon', 'MultiPolygon'):
        return geom
    parts = [g for g in getattr(geom, 'geoms', []) if g.geom_type in ('Polygon', 'MultiPolygon')]
    from shapely.ops import unary_union
    return unary_union(parts) if parts else MultiPolygon()


def rounded(geom, digits=6):
    from shapely.geometry import mapping, shape
    def walk(x):
        if isinstance(x[0], (int, float)):
            return [round(x[0], digits), round(x[1], digits)]
        return [walk(y) for y in x]
    g = mapping(polygonal(geom))
    if not g.get('coordinates'):
        return polygonal(geom)
    return polygonal(shape({'type': g['type'], 'coordinates': walk(g['coordinates'])}).buffer(0))


def land_parts_from_shapefile(shp, shx, boxes):
    """Läs landpolygoner inom varje kommuns rektangel (pyshp läser bara poster som överlappar)."""
    try:
        import shapefile
    except ImportError:
        raise SystemExit('Verktyget kräver pyshp: python -m pip install pyshp==2.3.1')
    from shapely import clip_by_rect
    from shapely.geometry import shape
    parts = {city: [] for city in boxes}
    with open(shp, 'rb') as fs, open(shx, 'rb') as fx:
        reader = shapefile.Reader(shp=fs, shx=fx)
        for city, (x0, y0, x1, y1) in boxes.items():
            for s in reader.iterShapes(bbox=[x0, y0, x1, y1]):
                if not s.points:
                    continue
                g = clip_by_rect(shape(s.__geo_interface__).buffer(0), x0, y0, x1, y1)
                if not g.is_empty:
                    parts[city].append(g)
    return parts


def land_parts_from_geojson(path, boxes):
    from shapely import clip_by_rect
    from shapely.geometry import shape
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    if data.get('type') == 'FeatureCollection':
        geoms = [f['geometry'] for f in data['features'] if f.get('geometry')]
    elif data.get('type') == 'GeometryCollection':
        geoms = data['geometries']
    elif data.get('type') == 'Feature':
        geoms = [data['geometry']]
    else:
        geoms = [data]
    parts = {city: [] for city in boxes}
    for gj in geoms:
        if gj['type'] not in ('Polygon', 'MultiPolygon'):
            continue
        for poly in ([gj['coordinates']] if gj['type'] == 'Polygon' else gj['coordinates']):
            xs = [pt[0] for pt in poly[0]]
            ys = [pt[1] for pt in poly[0]]
            for city, (x0, y0, x1, y1) in boxes.items():
                if max(xs) < x0 or min(xs) > x1 or max(ys) < y0 or min(ys) > y1:
                    continue
                g = clip_by_rect(shape({'type': 'Polygon', 'coordinates': poly}), x0, y0, x1, y1)
                if not g.is_empty:
                    parts[city].append(g.buffer(0))
    return parts


def read_land(path, boxes):
    path = Path(path)
    if path.suffix.lower() == '.zip':
        with zipfile.ZipFile(path) as z:
            shps = [n for n in z.namelist() if n.lower().endswith('.shp') and not n.startswith('__MACOSX')]
            if len(shps) != 1:
                raise SystemExit(f'Hittade {len(shps)} .shp-filer i {path.name}; förväntade en (land_polygons.shp).')
            stem = shps[0][:-4]
            shx = next((n for n in z.namelist() if n.lower() == (stem+'.shx').lower()), None)
            if not shx:
                raise SystemExit(f'{stem}.shx saknas i {path.name}.')
            with tempfile.TemporaryDirectory() as tmp:
                out = {}
                for name in (shps[0], shx):
                    target = Path(tmp)/Path(name).name
                    with z.open(name) as src, open(target, 'wb') as dst:
                        shutil.copyfileobj(src, dst, 1 << 20)
                    out[target.suffix.lower()] = target
                return land_parts_from_shapefile(out['.shp'], out['.shx'], boxes)
    if path.suffix.lower() == '.shp':
        return land_parts_from_shapefile(path, path.with_suffix('.shx'), boxes)
    return land_parts_from_geojson(path, boxes)


def road_check(city, land, area):
    """Andel vägpunkter (OSM) inom kommunens DeSO som ligger mer än ROAD_TOLERANCE_M utanför landytan."""
    import numpy as np
    import shapely
    roads = read_json(RAW/'osm_roads_2026.geojson.gz')['features']
    pts = []
    for f in roads:
        if f['properties'].get('city') != city:
            continue
        g = f['geometry']
        lines = [g['coordinates']] if g['type'] == 'LineString' else g['coordinates']
        for line in lines:
            pts.extend(line)
    if not pts:
        return {'roadVertices': 0, 'outsidePercent': None}
    lat = sum(p[1] for p in pts)/len(pts)
    tol = ROAD_TOLERANCE_M/(111320*math.cos(math.radians(lat)))
    zone = land.buffer(tol)
    shapely.prepare(zone)
    xy = np.asarray(pts, dtype=float)
    shapely.prepare(area)
    xy = xy[shapely.contains_xy(area, xy[:, 0], xy[:, 1])]
    if not len(xy):
        return {'roadVertices': 0, 'outsidePercent': None}
    inside = shapely.contains_xy(zone, xy[:, 0], xy[:, 1])
    outside = int((~inside).sum())
    return {'roadVertices': len(xy), 'outsideVertices': outside, 'outsidePercent': round(100*outside/len(xy), 3),
            'toleranceMetres': ROAD_TOLERANCE_M}


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main(argv=None, out_dir=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('land', type=Path, help='land-polygons-split-4326.zip (osmdata), .shp eller GeoJSON med landpolygoner')
    p.add_argument('--kalla', default=None, help='källa (URL) som skrivs i kvittot; standard är osmdata för .zip/.shp')
    p.add_argument('--max-utanfor', type=float, default=MAX_OUTSIDE_PERCENT,
                   help='högsta andel vägpunkter utanför landytan per kommun, procent (standard 1)')
    a = p.parse_args(argv)
    out_dir = Path(out_dir) if out_dir else RAW
    try:
        from shapely.geometry import box, mapping, shape
        from shapely.ops import unary_union
    except ImportError:
        raise SystemExit('Verktyget kräver shapely: python -m pip install shapely==2.2.0')
    if not a.land.exists():
        raise SystemExit(f'Filen finns inte: {a.land}')
    source = a.kalla or (OSMDATA if a.land.suffix.lower() in ('.zip', '.shp') else a.land.name)
    digest = sha256(a.land)
    deso = read_json(RAW/'scb_deso_2025.geojson.gz')['features']
    areas = {f['properties']['id']: (f['properties']['city'], f['properties']['regso'], shape(f['geometry']).buffer(0)) for f in deso}
    unions, boxes = {}, {}
    for city in CITIES:
        u = unary_union([g for c, _, g in areas.values() if c == city])
        x0, y0, x1, y1 = u.bounds
        unions[city] = u
        boxes[city] = (x0-0.02, y0-0.02, x1+0.02, y1+0.02)
    parts = read_land(a.land, boxes)
    masks, land_area, cities, failures = {}, {}, {}, []
    for city, bb in boxes.items():
        if not parts[city]:
            failures.append(f'{CITIES[city]}: inga landpolygoner inom kommunens område.')
            continue
        land = polygonal(unary_union(parts[city]).intersection(box(*bb)))
        check = road_check(city, land, unions[city])
        if check['outsidePercent'] is not None and check['outsidePercent'] > a.max_utanfor:
            failures.append(f"{CITIES[city]}: {check['outsidePercent']:.2f} % av vägpunkterna ligger utanför landytan "
                            f"(högst {a.max_utanfor:.2f} % tillåts). Kustlinjen är för grov eller inaktuell.")
        for kod, (c, regso, geom) in areas.items():
            if c == city:
                land_area[kod] = round(area_ha(geom.intersection(land)), 2)
        regsos = {}
        for kod, (c, regso, _) in areas.items():
            if c == city:
                regsos[regso] = regsos.get(regso, 0)+land_area[kod]
        land_area.update({k: round(v, 2) for k, v in regsos.items()})
        land_area['city|'+city] = round(sum(land_area[k] for k, (c, _, _) in areas.items() if c == city), 2)
        display = rounded(land.intersection(unions[city].buffer(0.005)).simplify(SIMPLIFY_DEG, preserve_topology=True))
        masks[city] = {'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'properties': {
            'kalla': 'OpenStreetMap-bidragsgivare (ODbL), landpolygoner, utsnitt '+CITIES[city]},
            'geometry': mapping(display)}]}
        vertices = sum(len(r.coords) for g in getattr(display, 'geoms', [display]) for r in [g.exterior, *g.interiors])
        cities[city] = {'status': 'osm_land_polygons', 'landHa': land_area['city|'+city], 'totalHa': round(area_ha(unions[city]), 2),
                        'displaySimplificationDegrees': SIMPLIFY_DEG, 'maskVertices': vertices, 'roadCheck': check}
    if failures:
        raise SystemExit('Landmasken avvisades:\n  '+'\n  '.join(failures)+'\nInga filer har ändrats.')
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir/'coast_display_2026.json').write_text(json.dumps(masks, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
    (out_dir/'land_area_2026.json').write_text(json.dumps({'schema': 'vagvis-land-area-2', 'unit': 'hektar',
        'definition': 'Yta utan hav: SCB:s DeSO 2025 snittad med OpenStreetMaps landpolygoner. Sjöar räknas som land.',
        'source': source, 'sha256': digest, 'method': 'Sfärisk areaintegral (R = 6 371 008,8 m).', 'areas': land_area},
        ensure_ascii=False, indent=0)+'\n', encoding='utf-8')
    (out_dir/'coast_receipt.json').write_text(json.dumps({'schemaVersion': 3, 'accessed': date.today().isoformat(),
        'use': 'display_and_area_without_sea', 'source': source, 'file': a.land.name, 'sha256': digest,
        'licence': 'ODbL, © OpenStreetMap-bidragsgivare', 'cities': cities,
        'note': 'Utsläppen beräknas alltid med SCB:s fullständiga DeSO-geometri. Masken påverkar bara kartvisningen och nyckeltalet per hektar utan hav.'},
        ensure_ascii=False, indent=1)+'\n', encoding='utf-8')
    for city, r in cities.items():
        print(f"{CITIES[city]}: {r['landHa']:.0f} ha utan hav av {r['totalHa']:.0f} ha; "
              f"{r['roadCheck']['outsidePercent']:.2f} % av vägpunkterna utanför; mask {r['maskVertices']} punkter")
    return cities


if __name__ == '__main__':
    main()
