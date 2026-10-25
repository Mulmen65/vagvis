#!/usr/bin/env python3
"""SCB PxWebApi v2 GET → exact raw responses → validated complete DeSO baseline.

python verktyg/hamta_underlag.py --only scb --activate
Partial/failed refreshes preserve the active named baseline. No missing value
is replaced with zero. HTML is subsequently rebuilt by kallkod/bygg_appen.cjs.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import itertools
import json
import math
from pathlib import Path
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
try:
    from paket import read_json
except ImportError:  # importerad som paket
    from verktyg.paket import read_json

ROOT = Path(__file__).resolve().parents[1]
CITIES = ('1280', '1283', '2180')
SCB = 'https://statistikdatabasen.scb.se/api/v2'
TABLES = (
    {'id': 'TAB6568', 'field': 'hh', 'path': 'START__BE__BE0101__BE0101Y/HushallDesoTyp', 'status': None},
    {'id': 'TAB6589', 'field': 'bil', 'path': 'START__TK__TK1001__TK1001Z/PersBilarDesoN', 'status': 'i trafik'},
    {'id': 'TAB6574', 'field': 'bef', 'path': 'START__BE__BE0101__BE0101Y/FolkmDesoAldKon', 'status': None},
)


def slug(text):
    return ''.join(c for c in unicodedata.normalize('NFKD', str(text)).lower() if not unicodedata.combining(c)).strip()


def write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


def request_json(url, payload=None):
    if payload is not None:
        raise ValueError('SCB v2 använder dokumenterade GET-anrop.')
    req = urllib.request.Request(url, headers={'User-Agent': 'Vagvis/2.1.1 official-statistics-refresh', 'Accept': 'application/json'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=35) as response:
                raw = response.read(50*1024*1024+1)
            if len(raw) > 50*1024*1024:
                raise ValueError('Svaret överstiger 50 MiB.')
            return json.loads(raw.decode('utf-8-sig')), raw
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise
            time.sleep(attempt+1)


class Run:
    def __init__(self, output, fetch=request_json):
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        self.directory = Path(output)/stamp
        self.directory.mkdir(parents=True, exist_ok=False)
        self.fetch, self.entries = fetch, []

    def collect(self, name, url):
        entry = {'id': name, 'url': url, 'method': 'GET', 'fetchedAt': datetime.now(timezone.utc).isoformat(), 'activatedInApp': False}
        try:
            data, raw = self.fetch(url)
            path = self.directory/(name+'.json')
            path.write_bytes(raw)
            entry.update(status='downloaded', file=path.name, bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
            self.entries.append(entry)
            return data
        except (OSError, ValueError, KeyError, TypeError) as error:
            entry.update(status='failed', error=type(error).__name__+': '+str(error))
            self.entries.append(entry)
            return None

    def fail(self, name, message):
        self.entries.append({'id': name, 'status': 'failed', 'error': str(message), 'activatedInApp': False})

    def finish(self, activated=False, validated=None):
        errors = sum(e['status'] == 'failed' for e in self.entries)
        report = {'schemaVersion': 2, 'modelVersion': '2.1.1', 'dataYear': 2024, 'desoVersion': '2025',
            'createdAt': datetime.now(timezone.utc).isoformat(), 'complete': validated is not None,
            'failed': errors, 'activatedInApp': activated,
            'note': 'Endast komplett validerat SCB-uttag kan ersätta baslinjen. Saknade värden ersätts aldrig med noll. Inga årgångar/geografier blandas.', 'entries': self.entries}
        write(self.directory/'hamtningskvitto.json', report)
        return report


def codes(dimension):
    index = dimension.get('category', {}).get('index')
    if isinstance(index, list):
        return index
    if not isinstance(index, dict):
        raise ValueError('JSON-stat-dimension saknar category.index.')
    return [k for k, v in sorted(index.items(), key=lambda item: item[1])]


def expected_codes():
    fc = read_json(ROOT/'underlag/raw/scb_deso_2025.geojson.gz')
    return sorted(f['properties']['id'] for f in fc['features'])


def total_codes(dimension):
    labels = dimension.get('category', {}).get('label', {})
    totals = ('totalt', 'samtliga', 'totalt antal hushall', 'samtliga hushall', 'alla aldrar',
              'samtliga aldrar', 'totalt, alla aldrar', 'kvinnor och man', 'bada konen', 'total')
    selected = [k for k in codes(dimension) if slug(labels.get(k, '')) in totals]
    if len(selected) == 1:
        return selected
    if len(codes(dimension)) == 1:
        return codes(dimension)
    if slug(dimension.get('label', '')) in ('kon', 'sex'):
        part = [k for k in codes(dimension) if slug(labels.get(k, '')) in ('kvinnor', 'man', 'women', 'men')]
        if len(part) == 2:
            return part  # A disjoint partition, never total plus components.
    if dimension.get('extension', {}).get('elimination') is True:
        # PxWeb v2 documents elimination=true as a total/aggregation when the
        # variable is omitted. Null records this deliberate metadata-based
        # choice in the exact selection; no category codes are invented.
        return None
    raise ValueError('Ingen entydig total/disjunkt partition för '+dimension.get('label', '?'))


def selection(metadata, table, regions):
    if metadata.get('class') != 'dataset' or not metadata.get('dimension') or not metadata.get('id'):
        raise ValueError('Metadata följer inte PxWebApi v2 JSON-stat2; inga variabelkoder gissas.')
    result, found_region, found_time = {}, False, False
    for key in metadata['id']:
        dim = metadata['dimension'][key]
        label, keynorm = slug(dim.get('label', key)), slug(key)
        available = set(codes(dim))
        if keynorm in ('region', 'deso') or label == 'region':
            if not set(regions).issubset(available):
                raise ValueError('Alla begärda DeSO 2025 finns inte i regiondimensionen.')
            result[key], found_region = regions, True
        elif key in metadata.get('role', {}).get('time', []) or keynorm in ('tid', 'ar', 'time'):
            if '2024' not in available:
                raise ValueError('Referensår 2024 saknas.')
            result[key], found_time = ['2024'], True
        elif keynorm == 'status' or label == 'status':
            match = [k for k, text in dim.get('category', {}).get('label', {}).items() if slug(text) == table.get('status')]
            if len(match) != 1:
                raise ValueError('Personbilsstatus "i trafik" kan inte väljas entydigt.')
            result[key] = match
        else:
            result[key] = total_codes(dim)
    if not (found_region and found_time) or math.prod(len(v) if v is not None else 1 for v in result.values()) > 150000:
        raise ValueError('Region/tid saknas eller uttaget är för stort.')
    return result


def query_url(table, selected):
    params = [('lang', 'sv'), ('outputFormat', 'json-stat2')]
    params.extend(('valueCodes['+k+']', ','.join(v)) for k, v in selected.items() if v is not None)
    return SCB+'/tables/'+table['id']+'/data?'+urllib.parse.urlencode(params)


def flatten(data, selected):
    if data.get('class') != 'dataset' or not data.get('id') or 'value' not in data:
        raise ValueError('SCB-svaret är inte ett JSON-stat2-dataset.')
    ids, sizes, dimensions = data['id'], data.get('size', []), data.get('dimension', {})
    if len(sizes) != len(ids):
        raise ValueError('SCB-dimensionerna är inkonsekventa.')
    order = []
    for key, size in zip(ids, sizes):
        cc = codes(dimensions[key])
        requested = selected.get(key, [])
        if len(cc) != size or (size != 1 if requested is None else set(cc) != set(requested)):
            raise ValueError('SCB-svaret matchar inte urvalet: '+key)
        order.append(cc)
    if any(k not in ids and v is not None and len(v) != 1 for k, v in selected.items()):
        raise ValueError('En icke-skalär dimension eliminerades.')
    n, values = math.prod(sizes), data['value']
    if not isinstance(values, (list, dict)) or isinstance(values, list) and len(values) != n:
        raise ValueError('SCB-dataceller saknas eller svaret är avkortat.')
    rows = []
    for i, key_values in enumerate(itertools.product(*order)):
        value = values[i] if isinstance(values, list) else values.get(str(i))
        status = data.get('status', {})
        mark = status[i] if isinstance(status, list) and i < len(status) else status.get(str(i)) if isinstance(status, dict) else None
        if value is None or isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            raise ValueError('Saknat/skyddat/ogiltigt SCB-värde ersätts inte med noll.')
        if mark and str(mark).strip().lower() not in ('', 'e', 'p'):
            raise ValueError('SCB-cellstatus kräver metodbedömning: '+str(mark))
        rows.append({**{k: v[0] for k, v in selected.items() if k not in ids and v is not None}, **dict(zip(ids, key_values)), 'value': value})
    return rows


def collect_scb(run):
    expected = expected_codes()
    merged, receipts, complete = {k: {'kod': k} for k in expected}, [], True
    for table in TABLES:
        meta_url = SCB+'/tables/'+table['id']+'/metadata?lang=sv'
        meta = run.collect(table['field']+'_metadata', meta_url)
        if meta is None:
            complete = False
            continue
        try:
            for part, offset in enumerate(range(0, len(expected), 25)):
                region_codes = expected[offset:offset+25]
                selected = selection(meta, table, region_codes)
                url = query_url(table, selected)
                write(run.directory/(table['field']+f'_selection_{part:02d}.json'), {'table':table['id'], 'selection':selected, 'nullMeaning':'Omitted only because official metadata declares elimination=true (aggregate total).', 'url':url})
                data = run.collect(table['field']+f'_data_{part:02d}', url)
                if data is None:
                    raise ValueError('Ett deluttag misslyckades; hela aktiveringen avbryts.')
                rows = flatten(data, selected)
                rk = next(k for k in selected if slug(k) in ('region', 'deso') or slug(meta['dimension'][k].get('label')) == 'region')
                totals = {}
                for row in rows:
                    totals[row[rk]] = totals.get(row[rk], 0)+row['value']
                if set(totals) != set(region_codes):
                    raise ValueError('Saknade/oväntade DeSO-koder i deluttaget.')
                for k, value in totals.items():
                    if table['field'] in merged[k]:
                        raise ValueError('Dubbelt DeSO-värde: '+k)
                    merged[k][table['field']] = value
            receipts.append({'table': table['id'], 'field': table['field'], 'page': 'https://www.statistikdatabasen.scb.se/pxweb/sv/ssd/'+table['path']+'/',
                'metadataUrl': meta_url, 'referenceYear': 2024, 'updated': meta.get('updated'), 'statusSelection': table['status'],
                'definition': 'I trafik registrerade på folkbokförda personer 31 december. Privatleasing/enskilda firmor ingår; förmånsbilar ingår inte.' if table['field'] == 'bil' else 'SCB registerstatistik per 31 december; explicit total/disjunkt könspartition.',
                'files': [e for e in run.entries if e['id'].startswith(table['field']+'_') and e['status'] == 'downloaded']})
        except (ValueError, KeyError, TypeError) as error:
            run.fail(table['field']+'_validation', error)
            complete = False
    if not complete or any(set(r) != {'kod', 'hh', 'bef', 'bil'} for r in merged.values()):
        return None
    value = {'schema': 'vagvis-observed-deso-2024-1', 'status': 'validated_official_data', 'dataYear': 2024, 'desoVersion': '2025', 'rows': list(merged.values()), 'sourceReceipts': receipts}
    from bygg_underlag import validate_observations
    validate_observations(value, set(expected))
    write(run.directory/'validated_deso_2024.json', value)
    return value


def collect_malmo(run):
    """Follow the municipality's documented CKAN discovery and pagination.

    These data are saved for inspection. 'Malmös områden' must not silently be
    equated with DeSO 2025; source-year/geography/definitions need verification
    before a separate activation adapter can be written.
    """
    base = 'https://opendata-api.malmo.se/api/3/action/'
    url = base+'resource_search?'+urllib.parse.urlencode({'query': 'description:malmö statistik', 'limit': 1000, 'offset': 0})
    listing = run.collect('malmo_statistics_resources', url)
    if listing is None:
        return
    result = listing.get('result', {})
    resources = result.get('results')
    if not isinstance(resources, list) or result.get('count') is None or result['count'] > len(resources):
        run.fail('malmo_resource_completeness', 'Ofullständig eller ändrad resurskatalog; ingen data aktiveras.')
        return
    selected = [r for r in resources if any(t in slug(r.get('name', '')+' '+r.get('description', '')) for t in ('bilar', 'hushall', 'befolkning', 'folkmangd'))]
    if not selected:
        run.fail('malmo_resource_selection', 'Inga identifierade bil-/hushålls-/befolkningsresurser.')
    for n, resource in enumerate(selected):
        resource_id = resource.get('id')
        if not resource_id:
            run.fail('malmo_resource_identifier', 'Resurs saknar id.')
            continue
        all_rows, offset = [], 0
        while True:
            query = urllib.parse.urlencode({'resource_id': resource_id, 'limit': 1000, 'offset': offset})
            page = run.collect(f'malmo_{n:03d}_rows_{offset:06d}', base+'datastore_search?'+query)
            if page is None:
                break
            result = page.get('result', {})
            rows, total = result.get('records'), result.get('total')
            if not isinstance(rows, list) or not isinstance(total, int) or total > 2000000:
                run.fail('malmo_page_schema', 'Rader/total saknas eller för stort dataset.')
                break
            all_rows.extend(rows)
            if len(all_rows) == total:
                write(run.directory/f'malmo_{n:03d}_complete.json', {'resource': resource, 'fields': result.get('fields'),
                    'total': total, 'records': all_rows, 'activatedInApp': False,
                    'note': 'Rådata kräver kontroll av år, områdestyp och bildefinition. Ingen DeSO-join antas.'})
                break
            if not rows or len(all_rows) > total:
                run.fail('malmo_page_count', 'Sidantal matchar inte kommunens uppgivna total.')
                break
            offset += len(rows)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out', '--output', dest='output', type=Path, default=ROOT/'underlag/hamtningar')
    p.add_argument('--only', choices=('all', 'scb', 'malmo', 'trafa'), default='scb')
    p.add_argument('--activate', action='store_true', help='Ersätt baslinjen endast efter komplett validerad SCB-hämtning.')
    args = p.parse_args()
    run = Run(args.output)
    observed = collect_scb(run) if args.only in ('all', 'scb') else None
    if args.only in ('all', 'malmo'):
        collect_malmo(run)
    if args.only in ('all', 'trafa'):
        run.collect('trafa_municipal_structure', 'https://api.trafa.se/api/structure?query=t10026')
    activated = False
    if args.activate and observed is not None:
        from bygg_underlag import build
        try:
            build(run.directory/'validated_deso_2024.json')
            activated = True
            for e in run.entries:
                if e['status'] == 'downloaded' and e['id'].split('_')[0] in ('hh', 'bil', 'bef'):
                    e['activatedInApp'] = True
        except (OSError, ValueError, KeyError, TypeError) as error:
            run.fail('activation', error)
    elif args.activate:
        run.fail('activation', 'Ofullständig SCB-baslinje; befintliga modelldata behålls.')
    report = run.finish(activated, observed)
    print(str(run.directory/'hamtningskvitto.json'))
    print('Aktiverat i modelldata; bygg HTML separat.' if activated else 'Befintliga modelldata har behållits.')
    return 0 if not report['failed'] else 2


if __name__ == '__main__':
    sys.exit(main())
