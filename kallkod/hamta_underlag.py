#!/usr/bin/env python3
"""Vägvis 2.0 — optional public-data downloader; Python standard library only.

Run from the supplied Windows launcher or: python hamta_underlag.py
Creates Vagvis_underlag.json next to this script. Does not invent traffic counts.
External services were identified from official documentation, but their live
downloads could not be verified in the authoring environment (network restriction).
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
SCB = 'https://geodata.scb.se/geoserver/stat/ows'
DOWNLOADS = []


def get_json(url, body=None, timeout=240):
    headers = {'User-Agent': 'Vagvis/2.0 (public geographic data for municipal climate screening)'}
    if body is not None:
        body = urllib.parse.urlencode(body).encode('utf-8')
        headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8'
    req = urllib.request.Request(url, data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read()
    data = json.loads(raw)
    if data.get('error') or data.get('success') is False:
        raise ValueError(str(data.get('error', data))[:300])
    DOWNLOADS.append({'url': url, 'retrieved': dt.datetime.now(dt.timezone.utc).isoformat(),
                      'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)})
    return data


def wfs(**params):
    args = dict(service='WFS', version='1.0.0', request='GetFeature',
                outputFormat='application/json', srsName='EPSG:4326')
    args.update(params)
    return SCB + '?' + urllib.parse.urlencode(args)


def area_feature(feature, city, level, version, fallback_id):
    p = feature.get('properties') or {}
    deso = next((str(v) for v in p.values() if re.fullmatch(r'\d{4}[ABCabc]\d{4}', str(v))), None)
    def field(pattern):
        return next((v for k, v in p.items() if re.search(pattern, k, re.I)), None)
    identifier = p.get('id', p.get('area_id'))
    if identifier is None:
        identifier = deso if level == 'deso' else field(r'omr.*kod|nyko|^kod$|^code$')
    if identifier is None:
        identifier = feature.get('id', fallback_id)
    name = p.get('name', p.get('namn', field(r'namn|name')))
    return dict(id=str(identifier), name=str(name if name is not None else identifier),
                city=str(deso[:4] if deso else city), level=level, version=str(version),
                geometry=feature.get('geometry'))


def deso(codes, version):
    typename = 'stat:DeSO_' + version
    probe = get_json(wfs(typeName=typename, maxFeatures=1))
    properties = probe['features'][0]['properties']
    field = next((k for k in properties if re.search(r'deso', k, re.I)
                  and not re.search(r'version|typ|area', k, re.I)), None)
    if not field:
        raise ValueError('Kunde inte identifiera DeSO-kodfältet.')
    areas = []
    for code in codes:
        fc = get_json(wfs(typeName=typename, maxFeatures=5000,
                         CQL_FILTER=f"{field} LIKE '{code}%'"))
        total = fc.get('totalFeatures', fc.get('numberMatched', 0))
        if isinstance(total, (int, float)) and total > 5000:
            raise ValueError('Svaret är paginerat; ofullständigt underlag används inte.')
        selected = [area_feature(f, code, 'deso', version, i)
                    for i, f in enumerate(fc.get('features', []))]
        selected = [a for a in selected if a['id'].startswith(code)]
        if not selected:
            raise ValueError('Inga DeSO hämtades för ' + code)
        areas.extend(selected)
    return areas


def malmo_districts():
    package = get_json('https://opendata-api.malmo.se/api/3/action/package_show?id=delomraden')
    resources = package['result']['resources']
    choices = [r for r in resources if re.search('geojson', str(r.get('name')) + str(r.get('format')), re.I)]
    resource = next((r for r in choices if '4326' in r.get('name', '')), None) or (choices[0] if choices else None)
    if not resource:
        raise ValueError('Resursen Delområden GeoJSON 4326 kunde inte identifieras.')
    fc = get_json(resource['url'])
    return [area_feature(f, '1280', 'district', 'kommunal leverans ' + dt.date.today().isoformat(), i)
            for i, f in enumerate(fc['features'])]


def malmo_raw_counts(output_directory, traffic_year):
    """Download observed raw traffic records; do not silently equate MVD to AADT.

    The official dataset has historical records and may provide line or point
    geometry. Keep raw properties for subsequent verified link matching.
    Downloading measurements is distinct from applying them to every road.
    """
    package = get_json('https://opendata-api.malmo.se/api/3/action/package_show?id=trafikmatning-for-biltrafik')
    candidates = [r for r in package['result']['resources']
                  if re.search('geojson', str(r.get('format')) + str(r.get('name')), re.I)]
    if not candidates:
        raise ValueError('Ingen GeoJSON-resurs för biltrafikmätningar hittades.')
    saved = []
    for i, resource in enumerate(candidates):
        raw = get_json(resource['url'])
        if raw.get('type') != 'FeatureCollection':
            raise ValueError('Biltrafikresursen returnerade inte en GeoJSON FeatureCollection.')
        if raw.get('exceededTransferLimit') or raw.get('numberMatched', 0) > len(raw.get('features', [])):
            raise ValueError('Mätdata är avkortade och får inte behandlas som ett komplett uttag.')
        filename = output_directory / f'Malmo_trafikmatningar_radata_{i+1}.geojson'
        filename.write_text(json.dumps(raw, ensure_ascii=False), encoding='utf-8')
        selected = []
        for feature in raw.get('features', []):
            props = feature.get('properties') or {}
            year = props.get('year', props.get('ar', props.get('år')))
            if str(year) == str(traffic_year):
                selected.append(feature)
        selected_file = output_directory / f'Malmo_trafikmatningar_{traffic_year}_{i+1}.geojson'
        selected_file.write_text(json.dumps(dict(type='FeatureCollection', features=selected), ensure_ascii=False), encoding='utf-8')
        saved.append(dict(resource=resource.get('name'), raw_file=filename.name,
                          rows=len(raw.get('features', [])), year_rows=len(selected), year_file=selected_file.name))
    return saved


def find_objects(obj, predicate):
    if isinstance(obj, dict):
        if predicate(obj):
            yield obj
        for value in obj.values():
            yield from find_objects(value, predicate)
    elif isinstance(obj, list):
        for value in obj:
            yield from find_objects(value, predicate)


def hbg_districts():
    base = 'https://kartportal.helsingborg.se/portal/sharing/rest/content/items/'
    app = get_json(base + '833b07427dea4aee88a04acb7f0dbde0/data?f=json')
    candidates = []
    for obj in find_objects(app, lambda x: bool(x.get('webmap') or x.get('webmapId') or x.get('itemId'))):
        candidates.extend(obj.get(k) for k in ['webmap', 'webmapId', 'itemId'])
    seen = set()
    for item in candidates:
        if not isinstance(item, str) or not re.fullmatch(r'[a-f0-9]{32}', item, re.I) or item in seen:
            continue
        seen.add(item)
        try:
            wm = get_json(base + item + '/data?f=json')
            for layer in find_objects(wm, lambda x: isinstance(x.get('url'), str)
                                      and re.search(r'B.?omr|stadsdel', str(x.get('title')) + str(x.get('name')), re.I)):
                url = layer['url']
                if not re.search(r'/(MapServer|FeatureServer)/\d+$', url):
                    service = get_json(url + '?f=json')
                    child = next((x for x in service.get('layers', []) if re.search(r'B.?omr|stadsdel', x.get('name', ''), re.I)), None)
                    if child is None:
                        continue
                    url += '/' + str(child['id'])
                fc = get_json(url + '/query?' + urllib.parse.urlencode(dict(where='1=1', outFields='*', outSR='4326', f='geojson', resultRecordCount=2000)))
                if fc.get('exceededTransferLimit'):
                    raise ValueError('Helsingborgs områdessvar är avkortat.')
                if fc.get('features'):
                    return [area_feature(f, '1283', 'district', 'kommunal leverans ' + dt.date.today().isoformat(), i)
                            for i, f in enumerate(fc['features'])]
        except (ValueError, KeyError, OSError) as exc:
            print('  Karttjänst:', str(exc)[:160], flush=True)
    raise ValueError('B-områden kunde inte identifieras automatiskt. Importera kommunens GeoJSON WGS84 separat.')


def points(coords):
    if coords and isinstance(coords[0], (int, float)):
        yield coords
    else:
        for child in coords:
            yield from points(child)


OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter',
            'https://overpass.private.coffee/api/interpreter']
OSM_MAIN = '^(motorway|trunk|primary|secondary|tertiary|residential|living_street|unclassified)(_link)?$'
OSM_SERVICE = '^service$'


def osm_query(box, pattern, timeout=120):
    west, south, east, north = box
    return (f'[out:json][timeout:{timeout}];way["highway"~"{pattern}"]'
            f'({south:.5f},{west:.5f},{north:.5f},{east:.5f});out tags geom qt;')


def city_boxes(city, areas):
    boxes = []
    for a in areas:
        if a['city'] == city and a['level'] == 'deso':
            pts = list(points(a['geometry']['coordinates']))
            if pts:
                boxes.append((min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)))
    if not boxes:
        raise ValueError('DeSO-gränser saknas; kan inte hämta och avgränsa ett kommunnät.')
    return boxes


def tiles(box, boxes, size=0.16):
    west, south, east, north = box
    nx, ny = max(1, -(-(east - west) // size)), max(1, -(-(north - south) // (size * 0.6)))
    nx, ny = int(nx), int(ny)
    dx, dy = (east - west) / nx, (north - south) / ny
    out = []
    for i in range(nx):
        for j in range(ny):
            t = (west + i * dx, south + j * dy, west + (i + 1) * dx, south + (j + 1) * dy)
            if any(b[0] <= t[2] and b[2] >= t[0] and b[1] <= t[3] and b[3] >= t[1] for b in boxes):
                out.append(t)
    return out


def overpass(query, label, pause=time.sleep):
    """Provar flera Overpass-servrar och försöker igen vid tillfälliga fel (429, 50x, avbruten anslutning)."""
    last = None
    for round_ in range(2):
        for url in OVERPASS:
            host = url.split('/')[2]
            try:
                print(f'   {label} · {host}', flush=True)
                data = get_json(url, dict(data=query))
                remark = str(data.get('remark') or '')
                if re.search(r'error|time ?out|timed out|out of memory', remark, re.I):
                    raise ValueError('ofullständigt svar: ' + remark)
                return data
            except Exception as exc:          # noqa: BLE001 – nätverksfel av alla slag ska ge nytt försök
                last = f'{host}: {exc}'
                print(f'   {last} – försöker igen', flush=True)
                pause(12 if round_ else 3)
    raise ValueError(last or 'okänt fel')


def roads_from_overpass(data, city, source=None):
    seen, roads = set(), []
    for item in data.get('elements', []):
        if item.get('type') != 'way' or len(item.get('geometry', [])) < 2 or item.get('id') in seen:
            continue
        tags = item.get('tags') or {}
        if 'highway' not in tags:
            continue
        seen.add(item.get('id'))
        roads.append(dict(id='OSM-' + str(item['id']), city=city,
                          geometry=dict(type='LineString', coordinates=[[p['lon'], p['lat']] for p in item['geometry']]),
                          roadClass=tags['highway'], aadt=None,
                          oneway=tags.get('oneway') in ['yes', '-1', '1'] or tags['highway'] == 'motorway',
                          year=dt.date.today().year, quality='assumed',
                          source=source or ('OSM · hämtat ' + dt.date.today().isoformat()), countBasis='geometry'))
    return roads


def osm_roads(city, areas, pause=time.sleep):
    boxes = city_boxes(city, areas)
    box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    rutor = tiles(box, boxes)
    elements, notes = [], []
    for kind, pattern, name in [('main', OSM_MAIN, 'gator och vägar'), ('service', OSM_SERVICE, 'servicevägar')]:
        for k, ruta in enumerate(rutor, 1):
            label = f'{name}, ruta {k} av {len(rutor)}'
            try:
                elements.extend(overpass(osm_query(ruta, pattern), label, pause).get('elements', []))
            except ValueError as exc:
                if kind == 'main':
                    raise ValueError(f'{label}: {exc}')
                notes.append(f'{name} i ruta {k} saknas ({exc})')
            pause(1)
    roads = roads_from_overpass(dict(elements=elements), city)
    if not roads:
        raise ValueError('Inga OSM-vägar returnerades.')
    osm_roads.notes = notes
    return roads


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--deso-version', choices=['2018', '2025'], default=None)
    parser.add_argument('--output', type=pathlib.Path, default=ROOT / 'Vagvis_underlag.json')
    args = parser.parse_args(argv)
    project = json.loads((ROOT / 'startprojekt.json').read_text(encoding='utf-8'))
    args.deso_version = args.deso_version or project.get('config', {}).get('desoVersion', '2025')
    project['title'] = 'Malmö och Helsingborg · öppna geografiska underlag'
    project['areas'] = project.get('areas', [])
    project['roads'], project['isDemo'] = [], False
    notes = []
    print('Vägvis 2.0 — hämtar underlag. Inga schabloner beskrivs som mätdata.', flush=True)
    try:
        print('1. SCB:s DeSO-gränser ...', flush=True)
        existing = [a for a in project['areas'] if a['level'] == 'deso' and a.get('version') == args.deso_version]
        if existing:
            notes.append(f'{len(existing)} inlästa DeSO-gränser behölls; ingen ny hämtning behövdes.')
        else:
            new_areas = deso(['1280', '1283'], args.deso_version)
            project['areas'] = [a for a in project['areas'] if a['level'] != 'deso'] + new_areas
            notes.append(f'{len(new_areas)} DeSO-gränser hämtade.')
    except Exception as exc:
        notes.append('DeSO misslyckades: ' + str(exc))
    for city, name, district_loader in [('1280', 'Malmö', malmo_districts), ('1283', 'Helsingborg', hbg_districts)]:
        print('2. Kommunala områden i ' + name + ' ...', flush=True)
        try:
            existing = [a for a in project['areas'] if a['city'] == city and a['level'] == 'district']
            if existing:
                notes.append(f'{len(existing)} befintliga områdesgrupperingar i {name} behölls.')
            else:
                ar = district_loader()
                project['areas'].extend(ar)
                notes.append(f'{len(ar)} kommunala områden i {name}. Granska namn, ID och täckning.')
        except Exception as exc:
            notes.append(name + ' områden misslyckades: ' + str(exc))
        print('3. Aktuellt vägnät i ' + name + ' ...', flush=True)
        try:
            roads = osm_roads(city, project['areas'])
            project['roads'].extend(roads)
            notes.append(f'{len(roads)} OSM-länkar i {name}. Inga observerade ÅDT hämtade; modellen använder schabloner.'
                         + (' Saknas: ' + '; '.join(osm_roads.notes) + '.' if getattr(osm_roads, 'notes', None) else ''))
        except Exception as exc:
            notes.append(name + ' vägnät misslyckades: ' + str(exc))
    raw_directory = ROOT / 'hamtade_radata'
    raw_directory.mkdir(exist_ok=True)
    print('4. Malmös observerade biltrafikmätningar, rådata ...', flush=True)
    try:
        raw_counts = malmo_raw_counts(raw_directory, project.get('config', {}).get('year', 2024))
        notes.append('Malmös trafikmätningar hämtade: ' + json.dumps(raw_counts, ensure_ascii=False))
        notes.append('Råmätningar sparas separat. MVD är inte ÅDT; ingen ogrundad omräkning eller automatisk spridning till hela vägnätet görs.')
    except Exception as exc:
        notes.append('Malmös råmätningar misslyckades: ' + str(exc))
    project['metadata'] = dict(**{k:v for k,v in project.get('metadata',{}).items() if k not in ['created','desoVersion','networkYear','notes','downloads','verifiedTrafficCoverage']},
                               created=dt.datetime.now(dt.timezone.utc).isoformat(),
                               desoVersion=args.deso_version, networkYear=dt.date.today().year,
                               notes=notes, downloads=DOWNLOADS,
                               verifiedTrafficCoverage=False)
    project['config']['desoVersion'] = args.deso_version
    args.output.write_text(json.dumps(project, ensure_ascii=False, indent=2), encoding='utf-8')
    print('\n'.join(notes), flush=True)
    print('\nSparat:', args.output, flush=True)
    print('Öppna Vägvis och välj Trafik & geodata > Öppna sparat projekt.', flush=True)
    print('Kontrollera loggen. Saknade områden eller vägar betyder inte nollutsläpp.', flush=True)
    return 0 if project['roads'] and project['areas'] else 2


if __name__ == '__main__':
    sys.exit(main())
