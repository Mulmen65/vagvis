#!/usr/bin/env python3
"""Fetch optional SCB income and OSM access data, retaining usable cached data.

Examples:
  python verktyg/hamta_korstrackeindikatorer.py
  python verktyg/hamta_korstrackeindikatorer.py --income-zip TAB6684_sv.zip --no-network
  python verktyg/hamta_korstrackeindikatorer.py --poi-json osm_access_points.json --no-network

Network failures are recorded per source. No numeric fallback is fabricated.
Imported full-source files are validated before atomic replacement. Build output
is changed only after a complete successful offline indicator build.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import re
import tempfile
import urllib.parse
import urllib.request
import zipfile

try:
    from bygg_korstrackeindikatorer import ROOT, STORE, YEAR, CENTRES, read, atomic_json, validate_income, validate_pois, build
except ImportError:
    from verktyg.bygg_korstrackeindikatorer import ROOT, STORE, YEAR, CENTRES, read, atomic_json, validate_income, validate_pois, build

SCB_URL = 'https://www.statistikdatabasen.scb.se/Resources/PX/bulk/ssd/sv/TAB6684_sv.zip'
OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
# Buffered query rectangles, including destinations outside municipal borders.
# Coordinates are search limits, NOT municipal boundaries.
BBOX = {'1280': (55.35, 12.65, 55.85, 13.45), '1283': (55.80, 12.40, 56.35, 13.40),
        '2180': (60.25, 16.40, 61.25, 17.80)}


def timestamp():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def atomic_bytes(path, raw):
    """Replace a validated original-source file without exposing partial bytes."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('wb', dir=path.parent, delete=False) as f:
        f.write(raw)
        temp = Path(f.name)
    temp.replace(path)


def expected_codes():
    return {r['kod'] for r in read(ROOT/'kallkod/data/household-project.json')['d']}


def text_decode(raw):
    for enc in ('utf-8-sig', 'cp1252'):
        try:
            return raw.decode(enc), enc
        except UnicodeDecodeError:
            pass
    raise ValueError('CSV måste kunna avkodas som UTF-8 eller Windows-1252.')


def fieldkey(text):
    return re.sub(r'[^a-zåäö0-9]', '', str(text).lower())


def parse_income_zip(raw, expected):
    """Select the median measure only, year 2024, exact DeSO set.

    Accepts SCB long-table content-as-dimension and wide-table median-column
    layouts. Ambiguous columns, duplicates, unrecognised units or missing DeSO
    fail rather than silently selecting another income statistic.
    """
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        csv_names = [n for n in archive.namelist() if n.lower().endswith('.csv')]
        if len(csv_names) != 1:
            raise ValueError('Förväntade exakt en CSV i SCB-exporten.')
        member = csv_names[0]
        if archive.getinfo(member).file_size > 250_000_000:
            raise ValueError('CSV-filen är orimligt stor.')
        csv_raw = archive.read(member)
    text, encoding = text_decode(csv_raw)
    try:
        delimiter = csv.Sniffer().sniff(text[:20000], delimiters=',;\t').delimiter
    except csv.Error:
        raise ValueError('Kunde inte identifiera CSV-avgränsare.')
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    fields = reader.fieldnames or []
    normal = {f: fieldkey(f) for f in fields}
    region_fields = [f for f, n in normal.items() if n in ('region', 'deso', 'desokod')]
    year_fields = [f for f, n in normal.items() if n in ('år', 'ar', 'tid', 'year')]
    content_fields = [f for f, n in normal.items() if n in ('tabellinnehåll', 'tabellinnehall', 'contentscode', 'innehåll', 'innehall')]
    median_fields = [f for f, n in normal.items() if 'median' in n and ('tkr' in n or 'tusentalskronor' in n)]
    if len(region_fields) != 1 or len(year_fields) != 1:
        raise ValueError('CSV saknar entydiga region- och årskolumner.')
    if len(median_fields) == 1:
        mode, value_field = 'wide_median_column', median_fields[0]
    elif len(content_fields) == 1:
        mode = 'long_content_dimension'
        candidates = [f for f in fields if f not in region_fields+year_fields+content_fields]
        if len(candidates) != 1:
            raise ValueError('Kunde inte identifiera en entydig värdekolumn för medianinkomst.')
        value_field = candidates[0]
    else:
        raise ValueError('CSV saknar medianvärde i tkr; annan inkomststatistik används inte.')
    selected, count = {}, 0
    for row in reader:
        count += 1
        if str(row[year_fields[0]]).strip() != str(YEAR):
            continue
        if mode == 'long_content_dimension':
            measure = fieldkey(row[content_fields[0]])
            if not ('median' in measure and ('tkr' in measure or 'tusentalskronor' in measure)):
                continue
        region = str(row[region_fields[0]]).strip()
        match = re.match(r'^(\d{4}[ABC]\d{4})(?:\s|$)', region)
        code = match[1] if match else None
        if code not in expected:
            continue
        if code in selected:
            raise ValueError('Dubbelt medianvärde för '+code)
        value = str(row[value_field]).strip()
        if value in ('', '..', '...', '.', ':'):
            number = None
        else:
            try:
                number = float(value.replace('\xa0', '').replace(' ', '').replace(',', '.'))
            except ValueError:
                raise ValueError('Ogiltig inkomstcell för '+code+': '+value)
        selected[code] = number
    obj = {'schema': 'vagvis-income-1', 'dataYear': YEAR, 'desoVersion': '2025',
           'measure': 'median_ekonomisk_standard', 'unit': 'tkr_2024_prices',
           'rows': [{'kod': code, 'income': value} for code, value in sorted(selected.items())],
           'source': {'url': SCB_URL, 'table': 'TAB6684', 'filter': {'year': YEAR, 'content': 'Medianvärde, tkr',
                       'geography': 'Exact 348 DeSO 2025 codes'}, 'zipSha256': digest(raw), 'csvSha256': digest(csv_raw),
                      'member': member, 'encoding': encoding, 'delimiter': delimiter, 'parsedRows': count, 'layout': mode}}
    validate_income(obj, expected)
    return obj


def request(url, timeout, data=None):
    headers = {'User-Agent': 'Vagvis/2.3.0 (+https://www.scb.se/deso; reproducible municipal planning research)',
               'Accept': 'application/json,application/zip,*/*'}
    if data is not None:
        headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'
    req = urllib.request.Request(url, headers=headers, data=data)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read(100_000_001)
        if len(raw) > 100_000_000:
            raise ValueError('Svaret överstiger 100 MB.')
        return raw


def access_query(city):
    box = ','.join(str(x) for x in BBOX[city])
    return ('[out:json][timeout:60];('
            f'nwr["shop"~"^(supermarket|convenience)$"]({box});'
            f'nwr["railway"~"^(station|halt|tram_stop)$"]({box});'
            f'nwr["amenity"="bus_station"]({box});'
            f'nwr["public_transport"="station"]({box});'
            ');out center;')


def parse_osm(raw, city):
    obj = json.loads(raw)
    if obj.get('remark'):
        raise ValueError('Overpass rapporterade problem: '+str(obj['remark']))
    if not isinstance(obj.get('elements'), list):
        raise ValueError('OSM-svaret saknar elements.')
    points, seen = [], set()
    for e in obj['elements']:
        tags = e.get('tags') or {}
        kind = ('service' if tags.get('shop') in ('supermarket', 'convenience') else
                'transit' if tags.get('railway') in ('station', 'halt', 'tram_stop') or
                tags.get('amenity') == 'bus_station' or tags.get('public_transport') == 'station' else None)
        if not kind:
            continue
        # Exclude explicitly abandoned/planned/disused transport infrastructure.
        if any(tags.get(k) in ('yes', 'true', '1') for k in ('disused', 'abandoned', 'proposed', 'construction')):
            continue
        loc = e if e.get('type') == 'node' else e.get('center', {})
        if loc.get('lon') is None or loc.get('lat') is None:
            continue
        ident = str(e.get('type'))+'/'+str(e.get('id'))
        if (kind, ident) in seen:
            raise ValueError('Dubblett i OSM-exporten.')
        seen.add((kind, ident))
        points.append({'id': ident, 'kk': city, 'kind': kind, 'lon': loc['lon'], 'lat': loc['lat'],
                       'name': tags.get('name'), 'tags': {k: tags[k] for k in ('shop', 'railway', 'amenity', 'public_transport') if k in tags}})
    # An empty category can be a truncated/bad query; keep prior cache instead.
    if any(not any(p['kind'] == kind for p in points) for kind in ('service', 'transit')):
        raise ValueError('Ingen komplett uppsättning dagligvaru- och kollektivtrafikpunkter i sökrutan: '+city)
    return points, obj.get('osm3s', {}).get('timestamp_osm_base')


def fetch_city(city, timeout):
    failures, query = [], access_query(city)
    for endpoint in OVERPASS:
        try:
            raw = request(endpoint, timeout, urllib.parse.urlencode({'data': query}).encode('utf-8'))
            points, osm_date = parse_osm(raw, city)
            return {'success': True, 'city': city, 'url': endpoint, 'query': query, 'raw': raw,
                    'sha256': digest(raw), 'points': points, 'osmTimestamp': osm_date, 'failures': failures}
        except Exception as e:
            failures.append({'url': endpoint, 'error': type(e).__name__+': '+str(e)})
    return {'success': False, 'city': city, 'query': query, 'failures': failures}


def run(args):
    STORE.mkdir(parents=True, exist_ok=True)
    expected = expected_codes()
    receipt = {'schema': 'vagvis-distance-acquisition-receipt-1', 'started': timestamp(), 'targetYear': YEAR,
               'desoVersion': '2025', 'sources': [], 'rule': 'Failed source leaves the last usable cache unchanged; missing is null.'}
    # User imports are explicit: invalid files fail before any replacement.
    imported_income = parse_income_zip(args.income_zip.read_bytes(), expected) if args.income_zip else None
    imported_pois = read(args.poi_json) if args.poi_json else None
    if imported_pois is not None:
        validate_pois(imported_pois)
    if imported_income is not None:
        raw = args.income_zip.read_bytes()
        atomic_bytes(STORE/'TAB6684_sv.zip', raw)
        atomic_json(STORE/'inkomst_2024.json', imported_income)
        receipt['sources'].append({'source': 'SCB_TAB6684', 'success': True, 'mode': 'user_file', 'sha256': digest(raw)})
    if imported_pois is not None:
        atomic_json(STORE/'osm_access_points.json', imported_pois)
        receipt['sources'].append({'source': 'OSM_ACCESS', 'success': True, 'mode': 'user_file', 'sha256': digest(args.poi_json.read_bytes())})
    if not args.no_network:
        with ThreadPoolExecutor(max_workers=4) as pool:
            income_future = pool.submit(request, SCB_URL, args.timeout) if not args.income_zip else None
            city_futures = {city: pool.submit(fetch_city, city, args.timeout) for city in CENTRES} if not args.poi_json else {}
            if income_future:
                try:
                    raw = income_future.result()
                    parsed = parse_income_zip(raw, expected)
                    atomic_bytes(STORE/'TAB6684_sv.zip', raw)
                    atomic_json(STORE/'inkomst_2024.json', parsed)
                    receipt['sources'].append({'source': 'SCB_TAB6684', 'url': SCB_URL, 'success': True, 'bytes': len(raw), 'sha256': digest(raw)})
                    print('SCB: median ekonomisk standard 2024 validerad för 348 DeSO.', flush=True)
                except Exception as e:
                    receipt['sources'].append({'source': 'SCB_TAB6684', 'url': SCB_URL, 'success': False, 'error': type(e).__name__+': '+str(e)})
                    print('SCB kunde inte kompletteras; befintlig cache behålls: '+str(e), flush=True)
            cities = [f.result() for f in city_futures.values()]
            if cities:
                if all(c['success'] for c in cities):
                    obj = {'schema': 'vagvis-osm-access-points-1', 'retrieved': timestamp(),
                           'osmTimestamp': sorted({c['osmTimestamp'] for c in cities if c['osmTimestamp']}),
                           'searchBboxes': BBOX, 'points': [p for c in cities for p in c['points']],
                           'sources': [{k: c[k] for k in ('city', 'url', 'query', 'sha256', 'osmTimestamp')} for c in cities]}
                    validate_pois(obj)
                    for c in cities:
                        atomic_bytes(STORE/('osm_'+c['city']+'.json'), c['raw'])
                    atomic_json(STORE/'osm_access_points.json', obj)
                    print('OSM: punkter för samtliga tre kommuners sökrutor validerade.', flush=True)
                else:
                    print('OSM kunde inte kompletteras för alla tre sökrutor; befintlig cache behålls.', flush=True)
                receipt['sources'].append({'source': 'OSM_ACCESS', 'success': all(c['success'] for c in cities),
                                           'cities': [{k: v for k, v in c.items() if k not in ('raw', 'points')} for c in cities]})
    receipt['completed'] = timestamp()
    # Log a failed acquisition honestly even when the remaining offline build works.
    atomic_json(STORE/'senaste_hamtning.json', receipt)
    obj = build()
    print('Indikatorer byggda. Täckning: '+json.dumps(obj['metadata']['coverage'], ensure_ascii=False), flush=True)
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--income-zip', type=Path, help='Originalexport TAB6684_sv.zip från SCB.')
    parser.add_argument('--poi-json', type=Path, help='Validerad JSON enligt underlag/korstracka/README.md.')
    parser.add_argument('--no-network', action='store_true', help='Använd enbart tillhandahållna filer och befintlig cache.')
    parser.add_argument('--timeout', type=float, default=90, help='Timeout per nätförsök, sekunder (standard 90).')
    args = parser.parse_args()
    if args.timeout <= 0 or args.timeout > 300:
        parser.error('--timeout måste vara >0 och högst 300 sekunder.')
    run(args)
