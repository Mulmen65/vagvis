"""Gemensamma funktioner för att läsa in uppmätta trafikflöden och koppla dem till Vägvis vägnät.

Inga externa beroenden. Läser GeoJSON (EPSG:4326 eller SWEREF 99) och GeoPackage (.gpkg) med
linjegeometrier. Resultatet skrivs i schemat ``vagvis-measured-roads-1`` som
verktyg/bygg_underlag.py tillämpar på OSM-vägnätet före kalibreringen.
"""
from __future__ import annotations

import json
import math
import sqlite3
import struct
from pathlib import Path

try:
    from geodesi import meters, to_wgs84
    from paket import read_json
except ImportError:  # importerad som paket
    from verktyg.geodesi import meters, to_wgs84
    from verktyg.paket import read_json

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = 'vagvis-measured-roads-1'
# Vägklasser som kan få uppmätt flöde. Lokalgator matchas inte automatiskt.
ELIGIBLE = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential',
            'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'}


# ---------- Läsning ----------
def _wkb_lines(buf, off=0):
    """Returnera (lista av linjer, ny offset) för WKB LineString/MultiLineString (även Z/M)."""
    order = '<' if buf[off] == 1 else '>'
    gtype = struct.unpack(order+'I', buf[off+1:off+5])[0]
    off += 5
    base, dims = gtype % 1000, 2 + (1 if gtype // 1000 in (1, 2) else 2 if gtype // 1000 == 3 else 0)
    if gtype & 0x80000000:
        base, dims = gtype & 0xFF, 3
    if base == 2:
        n = struct.unpack(order+'I', buf[off:off+4])[0]
        off += 4
        pts = []
        for _ in range(n):
            vals = struct.unpack(order+'d'*dims, buf[off:off+8*dims])
            pts.append((vals[0], vals[1]))
            off += 8*dims
        return [pts], off
    if base == 5:
        n = struct.unpack(order+'I', buf[off:off+4])[0]
        off += 4
        lines = []
        for _ in range(n):
            part, off = _wkb_lines(buf, off)
            lines.extend(part)
        return lines, off
    raise ValueError('Endast linjegeometrier stöds (WKB-typ '+str(gtype)+').')


def _gpkg_geometry(blob):
    if blob[:2] != b'GP':
        raise ValueError('Ogiltig GeoPackage-geometri.')
    flags = blob[3]
    env = (flags >> 1) & 7
    size = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[env]
    return _wkb_lines(blob, 8+size)[0]


def read_lines(path, epsg=None, layer=None):
    """Läs linjeobjekt. Returnerar lista av {'properties': dict, 'lines': [[(lon, lat), ...]]}."""
    path = Path(path)
    out = []
    if path.suffix.lower() == '.gpkg':
        con = sqlite3.connect(str(path))
        try:
            rows = con.execute("select table_name, column_name, srs_id from gpkg_geometry_columns").fetchall()
            if layer:
                rows = [r for r in rows if r[0] == layer]
            if len(rows) != 1:
                raise ValueError('Ange --lager. Tillgängliga lager: '+', '.join(r[0] for r in rows))
            table, geom_col, srs = rows[0]
            epsg = epsg or srs
            cur = con.execute(f'select * from "{table}"')
            names = [d[0] for d in cur.description]
            for rec in cur:
                props = {k: v for k, v in zip(names, rec) if k != geom_col and not isinstance(v, bytes)}
                blob = rec[names.index(geom_col)]
                if blob is None:
                    continue
                lines = [[to_wgs84(x, y, epsg) for x, y in line] for line in _gpkg_geometry(blob)]
                out.append({'properties': props, 'lines': lines})
        finally:
            con.close()
        return out
    data = read_json(path)
    if data.get('type') != 'FeatureCollection':
        raise ValueError('GeoJSON ska vara en FeatureCollection.')
    crs = (data.get('crs') or {}).get('properties', {}).get('name', '')
    if epsg is None and '3006' in crs:
        epsg = 3006
    for f in data['features']:
        g = f.get('geometry') or {}
        if g.get('type') == 'LineString':
            parts = [g['coordinates']]
        elif g.get('type') == 'MultiLineString':
            parts = g['coordinates']
        elif g.get('type') == 'Point':
            parts = [[g['coordinates']]]
        else:
            continue
        out.append({'properties': f.get('properties') or {},
                    'lines': [[to_wgs84(c[0], c[1], epsg or 4326) for c in line] for line in parts]})
    return out


# ---------- Geometri ----------
def bearing(a, b):
    lat = math.radians((a[1]+b[1])/2)
    return math.degrees(math.atan2(math.radians(b[1]-a[1]), math.radians(b[0]-a[0])*math.cos(lat))) % 180


def point_segment(p, a, b):
    """Avstånd i meter från punkt p till segment a–b (lokal plan approximation)."""
    lat = math.radians(p[1])
    k = math.cos(lat)*111320.0
    ax, ay, bx, by, px, py = a[0]*k, a[1]*110574.0, b[0]*k, b[1]*110574.0, p[0]*k, p[1]*110574.0
    dx, dy = bx-ax, by-ay
    t = 0 if dx == dy == 0 else max(0, min(1, ((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy)))
    return math.hypot(px-(ax+t*dx), py-(ay+t*dy))


class SegmentIndex:
    def __init__(self, items, cell=0.002):
        self.cell = cell
        self.grid = {}
        self.items = items  # list of (a, b, payload)
        for i, (a, b, _) in enumerate(items):
            for gx in range(int(min(a[0], b[0])//cell), int(max(a[0], b[0])//cell)+1):
                for gy in range(int(min(a[1], b[1])//cell), int(max(a[1], b[1])//cell)+1):
                    self.grid.setdefault((gx, gy), []).append(i)

    def near(self, p):
        gx, gy = int(p[0]//self.cell), int(p[1]//self.cell)
        seen = set()
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for i in self.grid.get((gx+dx, gy+dy), []):
                    if i not in seen:
                        seen.add(i)
                        yield self.items[i]


def road_segments(road):
    g = road['geometry']
    parts = [g['coordinates']] if g['type'] == 'LineString' else g['coordinates']
    for line in parts:
        for a, b in zip(line, line[1:]):
            if a != b:
                yield a, b


def load_roads(city=None):
    """Vägvis vägnät (OSM) som lista av vägar med id, kommun, klass, enkelriktning och geometri."""
    raw = read_json(ROOT/'underlag/raw/osm_roads_2026.geojson.gz')
    roads = [{**f['properties'], 'geometry': f['geometry']} for f in raw['features']]
    return [r for r in roads if city is None or r['city'] == city]


def match_lines(roads, features, value_of, max_dist=20.0, max_angle=25.0, min_cover=0.6):
    """Koppla linjeobjekt med flöde till OSM-vägar. Returnerar {osm_id: (värde, täckning, egenskaper)}.

    En OSM-väg matchas om minst ``min_cover`` av dess längd har ett linjeobjekt inom ``max_dist`` meter
    med liknande riktning. Värdet är längdviktat medelvärde av objektens flöden.
    """
    items = []
    for f in features:
        v = value_of(f['properties'])
        if v is None:
            continue
        for line in f['lines']:
            for a, b in zip(line, line[1:]):
                if a != b:
                    items.append((a, b, (v, f['properties'])))
    index = SegmentIndex(items)
    out = {}
    for r in roads:
        if r['roadClass'] not in ELIGIBLE:
            continue
        total = covered = weighted = 0.0
        props_used = None
        for a, b in road_segments(r):
            length = meters(a, b)
            total += length
            mid = ((a[0]+b[0])/2, (a[1]+b[1])/2)
            br = bearing(a, b)
            best = None
            for c, d, payload in index.near(mid):
                dist = point_segment(mid, c, d)
                diff = abs(bearing(c, d)-br)
                diff = min(diff, 180-diff)
                if dist <= max_dist and diff <= max_angle and (best is None or dist < best[0]):
                    best = (dist, payload)
            if best:
                covered += length
                weighted += length*best[1][0]
                props_used = props_used or best[1][1]
        if total and covered/total >= min_cover:
            out[r['id']] = (weighted/covered, covered/total, props_used)
    return out


def match_points(roads, points, max_dist=30.0):
    """Koppla mätpunkter till närmaste OSM-väg inom ``max_dist`` meter."""
    items = [(a, b, r['id']) for r in roads if r['roadClass'] in ELIGIBLE for a, b in road_segments(r)]
    index = SegmentIndex(items)
    out = {}
    for p in points:
        best = None
        for a, b, rid in index.near(p['point']):
            dist = point_segment(p['point'], a, b)
            if dist <= max_dist and (best is None or dist < best[0]):
                best = (dist, rid)
        if best:
            out.setdefault(best[1], []).append({**p, 'distance': best[0]})
    return out


def write_measured(path, records, meta):
    doc = {'schema': SCHEMA, 'targetYear': 2024, **meta, 'roads': records}
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(doc, ensure_ascii=False, indent=1)+'\n', encoding='utf-8')
    return doc
