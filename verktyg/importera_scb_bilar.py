#!/usr/bin/env python3
"""Import SCB TAB6589 bulk ZIP without mixing years, statuses or area levels.

python verktyg/importera_scb_bilar.py TAB6589_sv.zip --year 2024

Only the exact DeSO codes in the primary 2025 geometry are selected. Original
ZIP bytes, hashes, filters and municipality reconciliation are retained. This
imports car counts only; it never presents proxy household/population counts
as register observations.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import shutil
import zipfile
try:
    from paket import read_json
except ImportError:  # importerad som paket
    from verktyg.paket import read_json

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT/'underlag/raw'
SCB_DIR = RAW/'scb'
ACTIVE_NAME = 'active_cars_2024.json'
TABLE_URL = 'https://www.statistikdatabasen.scb.se/pxweb/sv/ssd/START__TK__TK1001__TK1001Z/PersBilarDesoN/'
VALUE_COLUMN = 'Personbilar i trafik registrerade på folkbokförda personer 31 december, antal'
HEADERS = ['region', 'status', 'år', VALUE_COLUMN]
STATUSES = ('i trafik', 'avställda', 'totalt')
CITIES = {'1280': 'Malmö', '1283': 'Helsingborg', '2180': 'Gävle'}


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def expected_codes():
    geo = read_json(RAW/'scb_deso_2025.geojson.gz')
    return {f['properties']['id'] for f in geo['features']}


def parse_zip(source, year=2024, expected=None):
    """Validate completely before any files are changed; return plain JSON data."""
    if year != 2024:
        raise ValueError('Denna baslinje avser 2024. Andra år kräver ett separat modell- och geografibeslut.')
    expected = set(expected if expected is not None else expected_codes())
    if len(expected) != 348 or any(not re.fullmatch(r'(1280|1283|2180)[ABC]\d{4}', k) for k in expected):
        raise ValueError('Primärgeografin måste innehålla exakt de 348 DeSO 2025 i de tre kommunerna.')
    archive = Path(source).read_bytes()
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        entries = [i for i in z.infolist() if not i.is_dir()]
        if len(entries) != 1 or entries[0].filename != 'TAB6589_sv.csv':
            raise ValueError('ZIP ska innehålla en enda fil TAB6589_sv.csv; inga filer extraheras till filsystemet.')
        if entries[0].file_size > 50*1024*1024:
            raise ValueError('CSV-filen är större än tillåtet granskningsuttag på 50 MiB.')
        raw_csv = z.read(entries[0])
    text = raw_csv.decode('cp1252')
    reader = csv.DictReader(io.StringIO(text, newline=''))
    if reader.fieldnames != HEADERS:
        raise ValueError('CSV-rubriker/schema avviker från SCB TAB6589: '+str(reader.fieldnames))
    by_status = {s: {} for s in STATUSES}
    municipal = {s: {} for s in STATUSES}
    years, statuses = set(), set()
    total_rows = selected_year_rows = 0
    for line, row in enumerate(reader, start=2):
        total_rows += 1
        if None in row or any(row[k] is None for k in HEADERS):
            raise ValueError(f'Fel kolumnantal på CSV-rad {line}.')
        region, status, row_year = row['region'], row['status'], row['år']
        years.add(row_year)
        statuses.add(status)
        if row_year != str(year):
            continue
        selected_year_rows += 1
        municipality = next((k for k, name in CITIES.items() if region == k+' '+name or region == k), None)
        is_deso = region in expected
        # An unexpected DeSO in these municipalities is a geography mismatch,
        # not a reason to silently discard a newly changed boundary/code.
        if not is_deso and re.fullmatch(r'(1280|1283|2180)[ABC]\d{4}', region):
            raise ValueError('SCB-uttaget innehåller en DeSO-kod utanför primärgeografin: '+region)
        if not is_deso and municipality is None:
            continue  # RegSO names and other municipalities are never summed.
        if status not in STATUSES:
            raise ValueError('Okänd fordonsstatus i valt område/år: '+status)
        raw_value = row[VALUE_COLUMN]
        if not re.fullmatch(r'\d+', raw_value):
            raise ValueError(f'Bilantal ska vara ett icke-negativt heltal, rad {line}: {raw_value!r}')
        value = int(raw_value)
        target = by_status[status] if is_deso else municipal[status]
        key = region if is_deso else municipality
        if key in target:
            raise ValueError('Dubblerad kombination område/år/status: '+key+'/'+str(year)+'/'+status)
        target[key] = value
    for status in STATUSES:
        if set(by_status[status]) != expected:
            missing = sorted(expected-set(by_status[status]))
            raise ValueError('DeSO saknas för '+status+': '+','.join(missing))
        if set(municipal[status]) != set(CITIES):
            raise ValueError('Kommunrader saknas för '+status+'. Kommunavstämning krävs före import.')
    for kod in expected:
        if by_status['totalt'][kod] != by_status['i trafik'][kod]+by_status['avställda'][kod]:
            raise ValueError('Statusavstämning misslyckas för '+kod+': totalt ≠ i trafik + avställda.')
    reconciliation = {}
    for city, name in CITIES.items():
        selected = [kod for kod in expected if kod.startswith(city)]
        city_sums = {s: sum(by_status[s][kod] for kod in selected) for s in STATUSES}
        if any(city_sums[s] != municipal[s][city] for s in STATUSES):
            raise ValueError('Summan av valda DeSO stämmer inte med SCB:s kommunrad: '+city)
        if municipal['totalt'][city] != municipal['i trafik'][city]+municipal['avställda'][city]:
            raise ValueError('Kommunens statusavstämning misslyckas: '+city)
        reconciliation[city] = {'name': name, 'deso': len(selected), 'desoSum': city_sums['i trafik'],
            'municipalRow': municipal['i trafik'][city], 'difference': 0,
            'statusSums': city_sums, 'municipalStatusRows': {s: municipal[s][city] for s in STATUSES}}
    selected_codes = sorted(expected)
    receipt = {'id': 'SCB_TAB6589_2024', 'table': 'TAB6589', 'source': TABLE_URL,
        'bulkSource': 'https://www.statistikdatabasen.scb.se/Resources/PX/bulk/ssd/sv/TAB6589_sv.zip',
        'delivery': 'Användarlevererad originalexport från SCB:s Statistikdatabas.',
        'dataYear': year, 'desoVersion': '2025', 'referenceDate': '2024-12-31',
        'definition': 'Personbilar i trafik registrerade på folkbokförda personer den 31 december. Privatleasing och enskilda firmor ingår; förmånsbilar ingår inte.',
        'zip': {'file': 'underlag/raw/scb/TAB6589_sv.zip', 'bytes': len(archive), 'sha256': sha256(archive)},
        'csv': {'member': 'TAB6589_sv.csv', 'bytes': len(raw_csv), 'sha256': sha256(raw_csv), 'encoding': 'cp1252', 'delimiter': ','},
        'filters': {'year': str(year), 'status': 'i trafik', 'geography': 'Exact match against primary DeSO 2025 codes', 'matchedCodes': selected_codes},
        'csvRows': total_rows, 'selectedYearRowsAllGeographies': selected_year_rows,
        'availableYears': sorted(years), 'availableStatuses': sorted(statuses),
        'selectedRows': len(selected_codes), 'municipalReconciliation': reconciliation,
        'validation': {'uniqueAreaYearStatus': True, 'nonNegativeIntegers': True, 'all348CodesPresent': True,
            'eachDesoTotalEqualsTrafficPlusOffRoad': True, 'eachCityAllStatusSumsReconciled': True},
        'excludedFromCarTotal': ['2025', 'avställda', 'totalt', 'RegSO-rader', 'kommunrader', 'övriga kommuner']}
    return {'schema': 'vagvis-register-cars-2024-1', 'status': 'observed_register', 'dataYear': year,
        'desoVersion': '2025', 'byDeSO': {k: by_status['i trafik'][k] for k in selected_codes},
        'cityTotals': {k: reconciliation[k]['desoSum'] for k in CITIES}, 'sourceReceipt': receipt}


def import_zip(source, year=2024, destination=SCB_DIR):
    """Save only after validation, retaining the original archive byte for byte."""
    data = parse_zip(source, year)
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    source = Path(source)
    target = destination/'TAB6589_sv.zip'
    if source.resolve() != target.resolve():
        temp = destination/'TAB6589_sv.zip.tmp'
        shutil.copyfile(source, temp)
        temp.replace(target)
    for name, value in ((ACTIVE_NAME, data), ('car_import_receipt_2024.json', data['sourceReceipt'])):
        temp = destination/(name+'.tmp')
        temp.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
        temp.replace(destination/name)
    return data


def bundled_cars():
    """A default offline build revalidates the bundled original ZIP every time."""
    source = SCB_DIR/'TAB6589_sv.zip'
    if source.exists():
        return import_zip(source)
    active = SCB_DIR/ACTIVE_NAME
    if active.exists():
        raise ValueError('Aktivt bilunderlag finns men original-ZIP saknas; återställ källfilen före ombyggnad.')
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('zipfile', type=Path)
    parser.add_argument('--year', type=int, choices=(2024,), default=2024)
    args = parser.parse_args()
    data = import_zip(args.zipfile, args.year)
    print(json.dumps({'status': data['status'], 'rows': len(data['byDeSO']), 'cityTotals': data['cityTotals'],
        'zipSha256': data['sourceReceipt']['zip']['sha256']}, ensure_ascii=False, indent=2))
    print('Bilregister importerat. Aktivera i modellens indata med: python verktyg/bygg_underlag.py')


if __name__ == '__main__':
    main()
