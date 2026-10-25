#!/usr/bin/env python3
"""Reproducible independent Vägvis input build (Python standard library + Node).

The bundled baseline uses independently verified municipal observations, where
available, and explicitly modelled DeSO allocation. A complete validated SCB
download replaces the allocation; partial downloads never alter the baseline.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import subprocess
import tempfile

try:
    from paket import read_json
except ImportError:  # importerad som verktyg.bygg_underlag
    from verktyg.paket import read_json

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'underlag/raw'
DATA = ROOT / 'kallkod/data'
CITIES = {'1280': 'Malmö', '1283': 'Helsingborg', '2180': 'Gävle'}
COUNTS = {'1280': 209, '1283': 84, '2180': 55}
# Körsträcka per privat bil i trafik vid årets slut, populationskonsistent (se KM_DEFINITION).
KM = 12753
KM_SOURCE = 'https://prod.trafa.se/globalassets/statistik/vagtrafik/korstrackor/2024/korstrackor-2024.pdf'
KM_DEFINITION = ('Härledd: privatägda personbilar körde i snitt 10 950 km 2024 bland bilar i trafik minst en dag (Trafikanalys 2025a). '
    'Alla personbilars 66,15 miljarder km fördelade på 5,80 miljoner bilar i trafik under året, men 4 977 791 bilar i trafik den 31 december (Trafikanalys 2025b). '
    'Körning per bil i årsslutsbeståndet = 10 950 × 5,7975/4,9778 = 12 753 km. Samma kvot antas gälla privatägda bilar.')
MEASURED_LINKS = ROOT/'underlag/trafik/matta_lankar_2024.json'
# Importerade uppmätta flöden per OSM-väg (prioritetsordning efter kurerade länkar).
MEASURED_ROADS = [ROOT/'underlag/trafik/nvdb_adt_2024.json', ROOT/'underlag/trafik/kommunala_matningar_2024.json']


def read(path):
    return read_json(path)


def write(path, value):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')


def digest(path):
    raw = Path(path).read_bytes()
    return {'file': str(Path(path).relative_to(ROOT)), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}


def polys(g):
    return [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']


def area_ha(g):
    # Spherical longitude/sine-latitude integral, R=6371008.8m.
    # This is an approximate full polygon area, including water, never land area.
    total = 0
    for polygon in polys(g):
        for ri, ring in enumerate(polygon):
            a = 0
            for p, q in zip(ring, ring[1:]):
                a += math.radians(q[0]-p[0])*(2+math.sin(math.radians(p[1]))+math.sin(math.radians(q[1])))
            total += (1 if ri == 0 else -1)*abs(a)*6371008.8**2/2
    return total/10000


def regso_names(deso2reg):
    """Officiella RegSO-namn ur SCB TAB6589 (som finns i paketet).

    Tabellens RegSO-rader har bara namn ("Malmö (RegSO-Västra hamnen sydöst)"), inte kod. Koden
    kopplas genom att summera DeSO-raderna per RegSO för varje år och status (sex värden) och
    jämföra med namnraderna. Endast entydiga träffar används; övriga behåller koden som namn.
    """
    import csv
    import io
    import re
    import zipfile
    from collections import Counter, defaultdict
    path = RAW/'scb/TAB6589_sv.zip'
    if not path.exists():
        return {}
    with zipfile.ZipFile(path) as z:
        rows = list(csv.DictReader(io.StringIO(z.read('TAB6589_sv.csv').decode('cp1252'), newline='')))
    value = list(rows[0])[-1]
    by_code, by_name = defaultdict(Counter), defaultdict(Counter)
    pattern = re.compile(r'^(%s) \((.+)\)$' % '|'.join(CITIES.values()))
    for r in rows:
        key = (r['år'], r['status'])
        if r['region'] in deso2reg:
            by_code[deso2reg[r['region']]][key] += int(r[value])
        else:
            m = pattern.match(r['region'])
            if m:
                by_name[(m.group(1), m.group(2))][key] += int(r[value])
    names = {}
    for code, signature in by_code.items():
        hits = [n for (city, n), s in by_name.items() if city == CITIES[code[:4]] and s == signature]
        if len(hits) == 1:
            names[code] = re.sub(r'^RegSO-', '', hits[0])
    return names


def geography():
    fc = read(RAW/'scb_deso_2025.geojson.gz')
    areas = [{**f['properties'], 'geometry': f['geometry']} for f in fc['features']]
    assert len(areas) == sum(COUNTS.values())
    assert len({a['id'] for a in areas}) == len(areas)
    groups = {}
    for a in areas:
        assert a['city'] in CITIES and a['level'] == 'deso' and a['version'] == '2025'
        assert a['regso'].startswith(a['city']+'R')
        a['name'] = a['id']
        a['district'] = a['regso']
        g = groups.setdefault(a['regso'], {'id': a['regso'], 'name': 'RegSO '+a['regso'], 'city': a['city'],
            'level': 'district', 'version': '2025', 'classification': 'RegSO 2025',
            'source': 'SCB: RegSO-attribut i primär DeSO 2025-geometri', 'members': [],
            'geometry': {'type': 'MultiPolygon', 'coordinates': []}})
        g['members'].append(a['id'])
        g['geometry']['coordinates'].extend(copy.deepcopy(polys(a['geometry'])))
    for city, n in COUNTS.items():
        assert sum(a['city'] == city for a in areas) == n
    names = regso_names({a['id']: a['regso'] for a in areas})
    for a in areas:
        if a['regso'] in names:
            a['regsoName'] = names[a['regso']]
            a['name'] = a['id']+' ('+names[a['regso']]+')'
    for code, g in groups.items():
        if code in names:
            g['name'] = names[code]
            g['source'] = 'SCB: RegSO-kod i DeSO 2025-geometri; namn ur SCB TAB6589 (kopplat via summor per RegSO)'
    # Geometrin sist och koordinater med 6 decimaler (≈0,1 m) så att paketfilerna kan packas förlustfritt.
    out = []
    for a in sorted(areas, key=lambda a: a['id']) + sorted(groups.values(), key=lambda a: a['id']):
        g = a.pop('geometry')
        a['geometry'] = round_geometry(g)
        out.append(a)
    return out


def round_geometry(g, digits=6):
    def walk(x):
        if isinstance(x[0], (int, float)):
            return [round(x[0], digits), round(x[1], digits)]
        return [walk(y) for y in x]
    return {'type': g['type'], 'coordinates': walk(g['coordinates'])}


def residential_lengths(areas, roads):
    """Use the independently defined A geometry clipping, with NO flow weights.

    A length on a boundary goes to the lowest DeSO code. The sum is residential
    road geometry length, not traffic volume, built floor area or households.
    """
    p = {'schema': 'vagvis-1', 'title': 'Residential road length allocation', 'isDemo': False,
         'cities': [{'id': k, 'name': v, 'reference': None} for k, v in CITIES.items()],
         'metadata': {}, 'areas': [a for a in areas if a['level'] == 'deso'],
         'roads': [r for r in roads if r['roadClass'] == 'residential']}
    code = "const fs=require('fs'),V=require('./kallkod/source/core.js');const p=JSON.parse(fs.readFileSync(0,'utf8'));const d=V.buildRows(p,V.config());const o={};for(const r of d.rows)if(r.deso!=='UNALLOCATED')o[r.deso]=(o[r.deso]||0)+r.km;process.stdout.write(JSON.stringify(o));"
    out = subprocess.run(['node', '-e', code], input=json.dumps(p), text=True, cwd=ROOT,
                         capture_output=True, check=True)
    lengths = json.loads(out.stdout)
    missing = [a['id'] for a in p['areas'] if not lengths.get(a['id'])]
    # A zero-road area cannot silently receive an invented positive road length.
    # Such an area gets zero allocation; the limitation is recorded explicitly.
    return lengths, missing


def validate_observations(value, expected):
    if value.get('schema') != 'vagvis-observed-deso-2024-1' or value.get('dataYear') != 2024:
        raise ValueError('SCB-underlaget saknar rätt schema eller referensår 2024.')
    if str(value.get('desoVersion')) != '2025' or value.get('status') != 'validated_official_data':
        raise ValueError('SCB-underlaget måste vara validerat och avse DeSO 2025.')
    rows = value.get('rows', [])
    if len(rows) != len(expected) or {r.get('kod') for r in rows} != expected:
        raise ValueError('SCB-underlaget måste innehålla exakt de 348 begärda DeSO-koderna utan dubletter.')
    for r in rows:
        for field in ('hh', 'bef', 'bil'):
            x = r.get(field)
            if isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) or x < 0:
                raise ValueError('Saknat eller ogiltigt SCB-värde: '+r['kod']+'/'+field)
        if r['hh'] == 0 and r['bil'] > 0:
            raise ValueError('Bilar med noll hushåll kräver separat metodbedömning: '+r['kod'])
    if not value.get('sourceReceipts'):
        raise ValueError('Aktivering kräver käll- och hämtningskvitton.')
    return {r['kod']: r for r in rows}


def local_mileage(year=2024):
    """Uppmätt körsträcka per kommun och DeSO, om den lästs in med verktyg/importera_korstracka.py."""
    kommun_file, deso_file = RAW/f'korstracka_kommun_{year}.json', RAW/f'korstracka_deso_{year}.json'
    kommun = read(kommun_file) if kommun_file.exists() else None
    deso = read(deso_file) if deso_file.exists() else None
    for value, schema in ((kommun, 'vagvis-korstracka-kommun-1'), (deso, 'vagvis-korstracka-deso-1')):
        if value and (value.get('schema') != schema or value.get('dataYear') != year or value.get('status') != 'validated_official_data'):
            raise ValueError('Körsträckeunderlaget har fel schema, år eller status: '+schema)
    if kommun and set(kommun['cities']) != set(CITIES):
        raise ValueError('Körsträcka per kommun saknas för någon kommun.')
    return kommun, ({r['kod']: r for r in deso['rows']} if deso else {}), [f for f in (kommun_file, deso_file) if f.exists()]


def municipal_references():
    """Kommunala TTW-referenser definieras på ett ställe: MUNICIPAL_REFERENCES i core.js."""
    out = subprocess.run(['node', '-e', "process.stdout.write(JSON.stringify(require('./kallkod/source/core.js').MUNICIPAL_REFERENCES))"],
                         cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def apply_measured_links(roads):
    """Ersätt schablon-ÅDT med kurerade uppmätta flöden. Saknade OSM-id ger fel, aldrig tyst nolltrafik."""
    if not MEASURED_LINKS.exists():
        return []
    doc = read(MEASURED_LINKS)
    if doc.get('schema') != 'vagvis-measured-links-1' or doc.get('targetYear') != 2024:
        raise ValueError('Fel schema eller målår i '+str(MEASURED_LINKS))
    by_id = {r['id']: r for r in roads}
    used = []
    for link in doc['links']:
        if link['flowMetric'] != 'AADT' or link['measurementYear'] != 2024:
            raise ValueError('Endast ÅDT för 2024 kan läggas in direkt: '+link['id'])
        shares = link['classShares']
        if abs(sum(shares.values())-1) > 1e-6:
            raise ValueError('Klassandelar summerar inte till 1: '+link['id'])
        share = link['directionShare'] if link['flowDirection'] == 'both' and link['geometryDirection'] != 'both' else 1
        for oid in link['osmIds']:
            if oid not in by_id:
                raise ValueError('OSM-id saknas i vägnätet: '+oid)
            r = by_id[oid]
            r['aadt'] = link['flowBothDirections']*share
            r['quality'] = 'measured'
            r['year'] = link['measurementYear']
            r['source'] = link['source']
            r['measurementId'] = link['id']
            r['classShares'] = shares
            r['aadtCV'] = link['aadtCV']
            r['flowUncertainty'] = {'Riktningsandel': {'cv': link['directionCV'], 'group': link['id']}} if share != 1 else {}
            r['flowAudit'] = {'metric': 'AADT', 'raw': link['flowBothDirections'], 'measurementYear': link['measurementYear'], 'targetYear': 2024,
                              'flowDirection': link['flowDirection'], 'geometryDirection': link['geometryDirection'],
                              'factors': [{'name': 'Riktningsandel', 'value': share, 'source': link['directionSource'], 'cv': link['directionCV'], 'group': link['id']}] if share != 1 else []}
            used.append(oid)
    return used


def apply_measured_roads(roads, already):
    """Tillämpa importerade flöden (schema vagvis-measured-roads-1) på vägar som saknar uppmätt flöde."""
    by_id = {r['id']: r for r in roads}
    used, files = [], []
    for path in MEASURED_ROADS:
        if not path.exists():
            continue
        doc = read(path)
        if doc.get('schema') != 'vagvis-measured-roads-1' or doc.get('targetYear') != 2024:
            raise ValueError('Fel schema eller målår i '+str(path))
        files.append(path)
        for rec in doc['roads']:
            oid = rec['osmId']
            if oid not in by_id:
                raise ValueError('OSM-id saknas i vägnätet: '+oid+' ('+path.name+')')
            if oid in already or oid in used:
                continue
            r = by_id[oid]
            share, year_factor = rec.get('directionShare', 1), rec.get('yearFactor', 1)
            factors, unc = [], {}
            if rec.get('conversion'):
                cv = rec['conversion']
                factors.append({'name': cv['name'], 'value': cv['value'], 'source': cv['source'], 'cv': cv['cv'], 'group': path.stem+'|'+cv['name']})
                unc[cv['name']] = {'cv': cv['cv'], 'group': path.stem+'|'+cv['name']}
            if year_factor != 1 or rec.get('yearFactorCV'):
                factors.append({'name': 'Årskorrigering', 'value': year_factor, 'source': rec.get('yearFactorSource', ''), 'cv': rec.get('yearFactorCV', 0), 'group': path.stem+'|år'})
                unc['Årskorrigering'] = {'cv': rec.get('yearFactorCV', 0), 'group': path.stem+'|år|'+str(rec.get('measurementYear'))}
            if share != 1:
                factors.append({'name': 'Riktningsandel', 'value': share, 'source': 'Symmetrisk fördelning på separata körbanor', 'cv': rec.get('directionCV', 0.05), 'group': oid})
                unc['Riktningsandel'] = {'cv': rec.get('directionCV', 0.05), 'group': oid}
            r['aadt'] = rec['flowBothDirections']*share*year_factor
            r['quality'] = 'measured'
            r['year'] = 2024
            r['source'] = rec['source']
            r['measurementId'] = path.stem+':'+oid
            r['aadtCV'] = rec.get('aadtCV', 0.10)
            if rec.get('heavyShare') is not None:
                r['heavyShare'] = rec['heavyShare']
            r['flowUncertainty'] = unc
            r['flowAudit'] = {'metric': 'AADT', 'raw': rec['flowBothDirections'], 'measurementYear': rec.get('measurementYear', 2024), 'targetYear': 2024,
                              'flowDirection': 'both', 'geometryDirection': 'forward' if share != 1 else 'both', 'factors': factors}
            used.append(oid)
    return used, files


def pack_and_write(project, household):
    """Skriv förlustfritt packade projektfiler och en delad områdesfil via core.js."""
    with tempfile.TemporaryDirectory() as tmp:
        a, b = Path(tmp)/'a.json', Path(tmp)/'b.json'
        a.write_text(json.dumps(project, ensure_ascii=False), encoding='utf-8')
        b.write_text(json.dumps(household, ensure_ascii=False), encoding='utf-8')
        subprocess.run(['node', 'verktyg/packa_projekt.cjs', '--territorial', str(a), '--household', str(b), '--out', 'kallkod/data'],
                       cwd=ROOT, check=True, capture_output=True, text=True)


def build(observed=None):
    areas = geography()
    deso = [a for a in areas if a['level'] == 'deso']
    raw_roads = read(RAW/'osm_roads_2026.geojson.gz')
    roads = [{**f['properties'], 'geometry': f['geometry']} for f in raw_roads['features']]
    # Strip any former flow/calibration results. All bundled road flows are assumptions.
    for r in roads:
        r['aadt'] = None
        r['quality'] = 'assumed'
    measured = apply_measured_links(roads)
    imported, imported_files = apply_measured_roads(roads, set(measured))
    roads = [{**{k: v for k, v in r.items() if k != 'geometry'}, 'geometry': round_geometry(r['geometry'])} for r in roads]
    config = read(DATA/'config.json')
    config['year'] = 2024
    config['desoVersion'] = '2025'
    config['mode'] = 'calibrated'
    references = municipal_references()
    cities = [{'id': k, 'name': v, 'reference': references.get(k)} for k, v in CITIES.items()]
    source_files = [digest(RAW/'scb_deso_2025.geojson.gz'), digest(RAW/'osm_roads_2026.geojson.gz'), digest(MEASURED_LINKS)]+[digest(f) for f in imported_files]
    if (RAW/'gis_source_receipt.json').exists():
        source_files.append(digest(RAW/'gis_source_receipt.json'))
    meta = {'created': '2026-10-25', 'desoVersion': '2025', 'sourceVersion': '2025_v2',
        'trafficYear': 2024, 'networkYear': 2026, 'gisIntegrated': True,
        'verifiedTrafficCoverage': False, 'districtGrouping': 'RegSO 2025 enligt SCB:s primära DeSO-attribut: 91 Malmö, 31 Helsingborg, 22 Gävle.',
        'geographyProvenance': source_files, 'network': raw_roads.get('captureReceipts', []),
        'displayCoast': 'Se separat kustmaskkvitto. Ingen visningsmask påverkar analysgräns eller trafikarbete.',
        'notes': ['348 DeSO 2025 och 144 RegSO 2025. RegSO byggs direkt av medlems-DeSO; inga kommunala stadsdelsnamn antas.',
          'OSM beskriver väggeometri från oktober 2026. ÅDT per vägklass är antaganden där mätning saknas; Öresundsbron har uppmätt ÅDT 2024. Fordonsandelar per vägtyp följer Trafikverkets normalvärden.',
          'Grundfallet är kalibrerat: antagen trafik skalas per kommun så att direktutsläppen motsvarar kommunal referensstatistik för 2024. Uppmätta länkar skalas inte. Fördelningen mellan områden följer vägnätets schabloner.',
          'Historiskt vägnät 2024 har inte verifierats.'],
        'measuredLinks': measured, 'importedMeasuredRoads': len(imported)}
    if (RAW/'coast_receipt.json').exists():
        meta['coast'] = read(RAW/'coast_receipt.json')['cities']
    project = {'schema': 'vagvis-1', 'model': 'territorial', 'title': 'Vägvis 2.2.4 · trafik inom området',
        'isDemo': False, 'metadata': meta, 'cities': cities, 'areas': areas, 'roads': roads, 'config': config}
    active_path = Path(observed) if observed else RAW/'active_scb_2024.json'
    verified = read(active_path) if active_path.exists() else None
    # A complete register refresh wins over any car-only export. Otherwise,
    # revalidate the packaged original ZIP so offline rebuilds cannot silently
    # revert observed car counts to an illustrative ownership scenario.
    from importera_scb_bilar import bundled_cars
    car_data = None if verified else bundled_cars()
    car_register = bundled_cars() if verified else car_data
    if verified:
        values = validate_observations(verified, {a['id'] for a in deso})
        for kod, count in car_register['byDeSO'].items():
            if values[kod]['bil'] != count:
                raise ValueError('Bilantalet i SCB-underlaget avviker från TAB6589 för '+kod)
        data_status = 'observed_register'
        receipts = [r for r in verified['sourceReceipts'] if r.get('table') != 'TAB6589']+[car_register['sourceReceipt']]
        baseline = {'dataYear': 2024, 'status': 'observed_register',
            'label': 'SCB-register per DeSO 2024: hushåll (TAB6568), befolkning (TAB6574) och personbilar i trafik (TAB6589).',
            'cities': {}, 'sourceReceipts': receipts}
        tables = {'hh': 'TAB6568', 'bef': 'TAB6574', 'bil': 'TAB6589'}
        for city, name in CITIES.items():
            rows_c = [r for k, r in values.items() if k.startswith(city)]
            baseline['cities'][city] = {'name': name, 'status': 'observed_register',
                **{f: sum(r[f] for r in rows_c) for f in tables},
                'sources': {f: {'year': 2024, 'status': 'observed_register', 'sourceId': 'SCB_'+t+'_2024',
                    'formula': 'Summa av '+str(len(rows_c))+' DeSO 2025; exakt avstämd mot SCB:s kommunrad.'} for f, t in tables.items()}}
        lengths, zero_length = {}, []
    else:
        baseline = read(RAW/'municipal_baseline_2024.json')
        if baseline.get('dataYear') != 2024:
            raise ValueError('Kommununderlaget måste avse 2024.')
        lengths, zero_length = residential_lengths(areas, roads)
        values = {}
        data_status = 'constructed_scenario'
        if car_data:
            data_status = 'register_cars_partial'
            baseline['status'] = 'mixed_register_and_proxy'
            baseline['label'] = 'Registerbaserade bilantal per DeSO 2024; hushåll och invånare har modellerad områdesfördelning.'
            baseline['sourceReceipts'] = [r for r in baseline.get('sourceReceipts', []) if r.get('id') not in ('CHOSEN_OWNERSHIP_START', 'SCB_TAB6589_2024')]
            baseline['sourceReceipts'].append(car_data['sourceReceipt'])
            for city in CITIES:
                baseline['cities'][city]['bil'] = car_data['cityTotals'][city]
                baseline['cities'][city]['status'] = 'mixed_register_and_proxy'
                baseline['cities'][city]['sources']['bil'] = {'url': car_data['sourceReceipt']['source'], 'year': 2024,
                    'status': 'observed_register', 'sourceId': 'SCB_TAB6589_2024',
                    'file': car_data['sourceReceipt']['zip']['file'], 'sha256': car_data['sourceReceipt']['zip']['sha256'],
                    'formula': 'Summa valda DeSO 2025, i trafik, år 2024; exakt avstämd mot SCB:s kommunrad.'}
            write(RAW/'municipal_baseline_2024.json', baseline)
        for city in CITIES:
            n = baseline['cities'][city]
            # Municipal numbers need their own actual source evidence. No inferred
            # local counts from a predecessor model are accepted here.
            for field in ('hh', 'bef', 'bil'):
                if not isinstance(n.get(field), (int, float)) or n[field] <= 0 or not n.get('sources', {}).get(field):
                    raise ValueError('Redovisat kommununderlag/källstatus saknas för '+city+'/'+field)
            codes = [a['id'] for a in deso if a['city'] == city]
            denom = sum(lengths.get(k, 0) for k in codes)
            if not denom:
                raise ValueError('Bostadsväglängd saknas för kommun '+city)
            for k in codes:
                w = lengths.get(k, 0)/denom
                values[k] = {field: n[field]*w for field in ('hh', 'bef', 'bil')}
        if car_data:
            for kod, count in car_data['byDeSO'].items():
                values[kod]['bil'] = count
    km_kommun, km_deso, km_files = local_mileage()
    rows = []
    for a in deso:
        v = values[a['id']]
        km, km_status, km_source = KM, 'transferred_assumption', KM_SOURCE
        if km_kommun:
            km, km_status, km_source = km_kommun['cities'][a['city']]['kmPerCar'], 'derived_official', 'RUS_KORSTRACKA_2024'
        if km_deso.get(a['id'], {}).get('status') == 'observed_register':
            km, km_status, km_source = km_deso[a['id']]['km'], 'observed_register', 'SCB_KORSTRACKA_DESO_2024'
        flat = [x for polygon in polys(a['geometry']) for x in polygon[0][:-1]]
        x = sum(t[0] for t in flat)/len(flat)
        y = sum(t[1] for t in flat)/len(flat)
        row = {'kod': a['id'], 'kk': a['city'], 'sd': a['regso'], 'rs': a['regso'],
            'hh': v['hh'], 'bef': v['bef'], 'bil': v['bil'], 'bph': v['bil']/v['hh'] if v['hh'] else None,
            'bphR': v['bil']/v['hh'] if v['hh'] else None, 'km': km, 'lat': y, 'lon': x, 'd': None,
            'dataYear': 2024, 'status': data_status,
            'bilStatus': 'observed_register' if verified or car_data else 'spatial_model_assumption',
            'hhStatus': 'observed_register' if verified else 'spatial_model_assumption',
            'befStatus': 'observed_register' if verified else 'spatial_model_assumption',
            'bphStatus': 'derived_register' if verified else 'derived_mixed' if car_data else 'derived_model',
            'kmStatus': km_status,
            'sources': {'bil': 'SCB_TAB6589_2024' if car_register else 'MUNICIPAL_SPATIAL_PROXY',
                'hh': 'SCB_TAB6568_2024' if verified else 'MUNICIPAL_HH_SPATIAL_PROXY',
                'bef': 'SCB_TAB6574_2024' if verified else 'MUNICIPAL_POP_SPATIAL_PROXY', 'km': km_source}}
        if a.get('regsoName'):
            row['name'], row['regsoName'] = a['name'], a['regsoName']
        if not verified:
            row['proxyResidentialKm'] = lengths.get(a['id'], 0)
            row['proxyWeight'] = row['proxyResidentialKm']/sum(lengths.get(z['id'], 0) for z in deso if z['city'] == a['city'])
        rows.append(row)
    km_states = {r['kmStatus'] for r in rows}
    km_level = 'deso' if km_states == {'observed_register'} else 'kommun' if km_states == {'derived_official'} else 'riket' if km_states == {'transferred_assumption'} else 'blandad'
    bmeta = {'created': '2026-10-25', 'dataYear': 2024, 'desoVersion': '2025', 'dataStatus': data_status,
        'label': 'SCB register per DeSO 2025' if verified else 'Registerbaserade bilantal per DeSO 2024; hushåll och invånare har modellerad områdesfördelning.' if car_data else 'Illustrativt startscenario – saknar verifierade registertal för hushållens bilar',
        'fieldStatuses': {'bil': 'observed_register' if verified or car_data else 'spatial_model_assumption',
            'hh': 'observed_register' if verified else 'spatial_model_assumption',
            'bef': 'observed_register' if verified else 'spatial_model_assumption', 'km': km_states.pop() if len(km_states) == 1 else 'mixed'},
        'carRegister': car_register['sourceReceipt'] if car_register else None,
        'districtGrouping': meta['districtGrouping'], 'sourceReceipts': baseline.get('sourceReceipts', []),
        'municipalTotals': baseline.get('cities', {}), 'annualKmSource': KM_SOURCE,
        'distributionMethod': 'SCB register per DeSO 2025' if verified else 'Bilar: SCB-register per DeSO 2025. Hushåll och invånare: modellerad fördelning efter OSM residential-väglängd.' if car_data else 'Modellerad fördelning efter OSM residential-väglängd; inte validerad som hushållsproxy.',
        'cityBaselines': baseline.get('cities', {}), 'geographyProvenance': source_files,
        'annualKm': {'value': KM, 'year': 2024, 'status': 'transferred_assumption', 'source': KM_SOURCE,
            'definition': KM_DEFINITION, 'level': km_level,
            'byCity': {c: sum(r['bil']*r['km'] for r in rows if r['kk'] == c)/max(1, sum(r['bil'] for r in rows if r['kk'] == c)) for c in CITIES},
            'kommun': km_kommun, 'deso': {'rows': len(km_deso), 'observed': sum(r.get('status') == 'observed_register' for r in km_deso.values())} if km_deso else None},
        'spatialProxy': None if verified else {'status': 'spatial_model_assumption', 'variable': 'OSM residential road length',
            'formula': 'w_i=L_residential,i/sum_city(L_residential); H_i=w_i H_city; N_i=w_i N_city. P_i hämtas direkt från SCB TAB6589.' if car_data else 'w_i=L_residential,i/sum_city(L_residential); H_i=w_i H_city; P_i=w_i P_city; N_i=w_i N_city',
            'zeroResidentialLength': zero_length,
            'fields': ['hh', 'bef'] if car_data else ['hh', 'bil', 'bef'],
            'warning': 'Hushåll och invånare på DeSO/RegSO är fördelade modellvärden. Bilantalet är observerat SCB-registertal och fördelas inte efter väggeometri. Proxyvikt noll betyder inte noll bilar eller utsläpp. Bilar per hushåll är en blandad härledning; kvoten saknas när uppskattade hushåll är noll.' if car_data else 'Hushåll, bilar och invånare på DeSO/RegSO är fördelade modellvärden, inte observerad lokal statistik. Samma vikter ger konstant bilinnehav och konstant körsträcka inom varje kommun. Bostadsväglängd har inte validerats som hushållsproxy.'},
        'notes': ['V_i=P_i K_i. Aktivitet och livscykelfaktorer redovisas separat. Bilar per hushåll redovisas endast när nämnaren är positiv.',
            'Bilarnas körning kan ske både inom och utanför hemkommunen. Företagsägda fordon och genomfart ingår inte i hushållsmodellens avsedda bestånd.',
            {'deso': 'Körsträckan per DeSO är SCB:s sammanställning av mätarställningar vid besiktning för bilar på folkbokförda personer i området. Den anger hur långt bilarna kör, inte var.',
             'kommun': 'Körsträckan per kommun bygger på RUS/SCB:s körsträckedata, överförd till privatägda bilar i årsslutsbeståndet med kvoten mot riket. Variation inom kommunen ingår inte.',
             'riket': 'K=12 753 km är ett härlett riksmedelvärde för privatägda bilar per bil i årsslutsbeståndet, inte uppmätt körsträcka i varje DeSO eller kommun. Ingen faktor för avstånd till centrum används.',
             'blandad': 'Körsträckan är uppmätt per DeSO där SCB:s värden finns; skyddade celler har kommunens eller rikets värde.'}[km_level]]}
    bmeta['coast'] = meta.get('coast', {})
    household = {'schema': 'vagvis-1', 'model': 'household', 'title': 'Vägvis 2.2.4 · hushållens bilar',
        'isDemo': False, 'metadata': bmeta, 'cities': copy.deepcopy(cities), 'areas': copy.deepcopy(areas),
        'roads': [], 'd': rows, 'config': copy.deepcopy(config)}
    household['config']['phevElectric'] = 0.47
    household['config']['household'] = {'kmPerCar': KM, 'kmMode': 'local',
        'uncertainty': {'distance': 0.15, 'carStock': 0, 'allocation': 0.5, 'distanceLocal': 0.05, 'allocationLocal': 0.05}}
    if verified or car_data:
        hcfg = household['config'].setdefault('household', {})
        hcfg.setdefault('uncertainty', {})['carStock'] = 0
        bmeta['carStockUncertaintyTreatment'] = 'Registerantalet hålls fast i den villkorade simuleringen (carStock CV=0). Detta är inget påstående om att registerstatistiken saknar mät- eller täckningsfel. Körsträcka och livscykelfaktorer har fortsatt antagandebaserad osäkerhet.'
    # All area denominators are independent geometry calculations. A land-area
    # denominator is unavailable unless an independently documented coast is clipped.
    def ytor(level):
        out = {}
        for city in CITIES:
            subset = [a for a in areas if a['city'] == city]
            for a in subset:
                out[a['level']+'|'+city+'|'+a['id']] = {'ha': area_ha(a['geometry']), 'landHa': None}
            out['city|'+city] = {'ha': sum(area_ha(a['geometry']) for a in subset if a['level'] == 'deso'), 'landHa': None}
        return out
    y = {'meta': {'enhet': 'hektar', 'projektion': 'WGS84; sfärisk areaintegral R=6 371 008,8 m',
        'A': 'Hela analysytan inklusive vatten. landHa saknas; visningsmask är ingen arealstatistik.',
        'B': 'Samma primära DeSO 2025- och RegSO 2025-geometri som modell A; hela ytan inklusive vatten.'}, 'A': ytor('A'), 'B': ytor('B')}
    pack_and_write(project, household)
    write(DATA/'ytor.json', y)
    # Coast is an optional independently prepared primary-data derivative.
    masks = read(RAW/'coast_display_2026.json') if (RAW/'coast_display_2026.json').exists() else {}
    write(DATA/'land.json', masks)
    if observed:
        write(RAW/'active_scb_2024.json', verified)
    summary = {city: {'deso': COUNTS[city], 'regso': sum(a['city'] == city and a['level'] == 'district' for a in areas),
        'hh': sum(r['hh'] for r in rows if r['kk'] == city), 'bef': sum(r['bef'] for r in rows if r['kk'] == city),
        'bil': sum(r['bil'] for r in rows if r['kk'] == city), 'vkm': sum(r['bil']*r['km'] for r in rows if r['kk'] == city)} for city in CITIES}
    receipt = {'schemaVersion': 1, 'modelVersion': '2.2.4', 'dataYear': 2024, 'desoVersion': '2025',
        'status': data_status, 'dataAvailability': 'SCB TAB6589: observerade bilantal i trafik 2024 för samtliga 348 DeSO aktiverade och avstämda mot kommunrader. Hushåll och invånares lokala fördelning är fortfarande proxy.' if car_data else 'Komplett SCB-uttag har ännu inte hämtats i denna leverans.' if not verified else 'SCB-register 2024 för samtliga 348 DeSO: hushåll (TAB6568), befolkning (TAB6574) och personbilar i trafik (TAB6589), avstämda mot kommunraderna.',
        'dataFiles': source_files+[digest(RAW/'municipal_baseline_2024.json')] if not verified else source_files+[digest(active_path)],
        'builtFiles': [digest(DATA/name) for name in ('omraden.json', 'project.json', 'household-project.json', 'ytor.json', 'land.json')],
        'summary': summary, 'annualKm': bmeta['annualKm'], 'spatialProxy': bmeta['spatialProxy'],
        'sourceReceipts': bmeta['sourceReceipts'],
        'fieldStatuses': bmeta['fieldStatuses'], 'carRegister': bmeta['carRegister'],
        'coast': read(RAW/'coast_receipt.json') if (RAW/'coast_receipt.json').exists() else {'status':'unavailable'},
        'refresh': 'python verktyg/hamta_underlag.py --only scb --activate. Endast komplett validerat uttag byter baslinje. Ett misslyckat uttag behåller befintliga data.'}
    receipt['dataFiles'].extend(digest(f) for f in km_files)
    if car_register:
        receipt['dataFiles'].extend([digest(RAW/'scb/TAB6589_sv.zip'), digest(RAW/'scb/active_cars_2024.json'), digest(RAW/'scb/car_import_receipt_2024.json')])
    write(ROOT/'underlag/datakvitto.json', receipt)
    print(json.dumps({'status': data_status, 'summary': summary, 'zeroResidentialLength': zero_length}, ensure_ascii=False, indent=2))
    return receipt


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--scb-run', type=Path, help='Validerad JSON-fil med kompletta SCB-observationer; annars används aktiv officiell baslinje eller namngiven kommunproxy.')
    args = p.parse_args()
    build(args.scb_run)


if __name__ == '__main__':
    main()
