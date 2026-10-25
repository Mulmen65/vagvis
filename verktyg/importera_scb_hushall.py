#!/usr/bin/env python3
"""Läs in SCB:s hushåll (TAB6568) och befolkning (TAB6574) per DeSO 2024 från bulkfiler.

  python verktyg/importera_scb_hushall.py TAB6568_sv.zip TAB6574_sv.zip
  python verktyg/bygg_underlag.py

Både ZIP-filerna och de uppackade CSV-filerna (TAB6568_sv.csv, TAB6574_sv.csv) går att ange.
  node kallkod/bygg_appen.cjs

Bulkfilerna laddas ned från
  https://www.statistikdatabasen.scb.se/Resources/PX/bulk/ssd/sv/TAB6568_sv.zip
  https://www.statistikdatabasen.scb.se/Resources/PX/bulk/ssd/sv/TAB6574_sv.zip

Verktyget validerar allt innan något skrivs:
* år 2024 och exakt de 348 DeSO 2025 som modellen använder,
* totalkategori används om den finns (t.ex. "totalt"); annars summeras kategorierna,
* DeSO-summan per kommun jämförs med filens egen kommunrad (högst 0,5 % avvikelse, eftersom
  SCB kan justera små celler) och befolkningen med kommunens verifierade folkmängd 2024,
* registrerade bilar hämtas från den redan inlästa TAB6589.
Resultatet skrivs till underlag/raw/active_scb_2024.json (schema vagvis-observed-deso-2024-1),
som verktyg/bygg_underlag.py använder i stället för väglängdsproxyn.
"""
from __future__ import annotations

import argparse
import csv
from datetime import date
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
from paket import read_json  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT/'underlag/raw'
SCB_DIR = RAW/'scb'
ACTIVE = RAW/'active_scb_2024.json'
CITIES = {'1280': 'Malmö', '1283': 'Helsingborg', '2180': 'Gävle'}
TOTAL_WORDS = ('totalt', 'samtliga', 'alla', 'total')
TABLES = {'hh': 'TAB6568', 'bef': 'TAB6574'}
BULK = 'https://www.statistikdatabasen.scb.se/Resources/PX/bulk/ssd/sv/{}_sv.zip'


def expected_codes():
    geo = read_json(RAW/'scb_deso_2025.geojson.gz')
    return {f['properties']['id'] for f in geo['features']}


def _encoding(head):
    """UTF-8 om början av filen är giltig UTF-8 (ett avklippt tecken sist godtas), annars cp1252."""
    try:
        head.decode('utf-8-sig')
        return 'utf-8-sig'
    except UnicodeDecodeError as e:
        return 'utf-8-sig' if e.start >= len(head)-3 and e.reason == 'unexpected end of data' else 'cp1252'


def _csv_entries(z):
    return [i for i in z.infolist() if not i.is_dir() and i.filename.lower().endswith('.csv')
            and not i.filename.startswith('__MACOSX/') and not Path(i.filename).name.startswith('._')]


class _Source:
    """Öppna en SCB-bulkfil som text, oavsett om den är ZIP eller uppackad CSV."""

    def __init__(self, path, table):
        self.path, self.table, self.zip = Path(path), table, None
        if zipfile.is_zipfile(self.path):
            self.zip = zipfile.ZipFile(self.path)
            entries = _csv_entries(self.zip)
            if len(entries) != 1:
                raise ValueError(f'{table}: ZIP ska innehålla exakt en CSV-fil.')
            self.info = entries[0]
            self.name = Path(self.info.filename).name
        else:
            self.info, self.name = None, self.path.name
        if not self.name.upper().startswith(table):
            raise ValueError(f'{table}: fel tabell ({self.name}).')

    def _raw(self):
        return self.zip.open(self.info) if self.zip else self.path.open('rb')

    def __enter__(self):
        with self._raw() as f:
            enc = _encoding(f.read(4096))
        self.text = io.TextIOWrapper(self._raw(), encoding=enc, newline='')
        return self.text

    def __exit__(self, *exc):
        self.text.close()
        if self.zip:
            self.zip.close()


def read_table(source, table, year=2024, expected=None):
    """Returnera ({deso: värde}, {kommun: kommunrad}, kvitto) för en SCB-bulkfil.

    Filen läses strömmande; endast rader för de 348 DeSO och de tre kommunraderna behålls,
    så även mycket stora bulkfiler (hundratals MB) kan läsas utan att packas upp på disk.
    """
    expected = set(expected or expected_codes())
    source = Path(source)
    digest = hashlib.sha256()
    with source.open('rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            digest.update(chunk)
    with _Source(source, table) as text:
        reader = csv.reader(text)
        header = next(reader)
        norm = [h.strip().lower() for h in header]
        if norm[0] != 'region' or 'år' not in norm:
            raise ValueError(f'{table}: oväntade rubriker {header}.')
        i_year, i_value = norm.index('år'), len(header)-1
        dims = [i for i in range(1, len(header)-1) if i != i_year]
        wanted = expected | set(CITIES) | {k+' '+v for k, v in CITIES.items()}
        rows, total_rows = [], 0
        categories = {i: set() for i in dims}
        for line, row in enumerate(reader, start=2):
            total_rows += 1
            if len(row) != len(header):
                raise ValueError(f'{table}: fel kolumnantal på rad {line}.')
            if row[i_year].strip() != str(year) or row[0].strip() not in wanted:
                continue
            for i in dims:
                categories[i].add(row[i].strip())
            rows.append(row)
    if not rows:
        raise ValueError(f'{table}: inga rader för {year} i de valda områdena.')
    # Använd totalkategori om den finns, annars summera alla kategorier i dimensionen.
    keep = {}
    for i, cats in categories.items():
        totals = [c for c in cats if c.lower().startswith(TOTAL_WORDS)]
        keep[i] = totals[0] if len(totals) == 1 else None
    deso, municipal = {}, {}
    for row in rows:
        if any(keep[i] is not None and row[i].strip() != keep[i] for i in dims):
            continue
        raw_value = row[i_value].strip().replace(' ', '').replace(',', '.')
        if raw_value in ('', '..', '.', '-'):
            raise ValueError(f'{table}: saknat värde för {row[0]}.')
        value = float(raw_value)
        region = row[0].strip()
        code = region.split()[0]
        if code in expected:
            deso[code] = deso.get(code, 0)+value
        elif code in CITIES:
            municipal[code] = municipal.get(code, 0)+value
    missing = expected-set(deso)
    if missing:
        raise ValueError(f'{table}: {len(missing)} DeSO saknas, t.ex. {sorted(missing)[:3]}.')
    receipt = {'table': table, 'bulkSource': BULK.format(table),
               'zip': {'file': source.name, 'format': 'zip' if zipfile.is_zipfile(source) else 'csv', 'bytes': source.stat().st_size, 'sha256': digest.hexdigest(), 'stored': False,
                       'note': 'Originalfilen lagras inte i repot på grund av storleken; kontrollsumman identifierar exakt fil.'},
               'year': year, 'filters': {header[i]: (keep[i] or 'summa av samtliga kategorier') for i in dims},
               'csvRows': total_rows, 'selectedRows': len(rows)}
    return deso, municipal, receipt


def reconcile(field, deso, municipal, tolerance=0.005, reference=None):
    checks = {}
    for city in CITIES:
        total = sum(v for k, v in deso.items() if k.startswith(city))
        row = municipal.get(city)
        if row is None:
            raise ValueError(f'{field}: kommunraden för {city} saknas i filen; DeSO-summan kan inte stämmas av.')
        rel = abs(total-row)/row if row else 1
        if rel > tolerance:
            raise ValueError(f'{field}: DeSO-summan för {city} ({total:.0f}) avviker {rel:.2%} från kommunraden ({row:.0f}).')
        checks[city] = {'desoSum': round(total, 6), 'municipalRow': row, 'relativeDifference': rel}
        if reference and city in reference:
            ref = reference[city]
            if abs(row-ref)/ref > 0.02:
                raise ValueError(f'{field}: kommunraden för {city} ({row:.0f}) avviker mer än 2 % från verifierad uppgift ({ref}).')
            checks[city]['verifiedReference'] = ref
    return checks


def import_files(hh_zip, bef_zip, write=True):
    expected = expected_codes()
    baseline = read_json(RAW/'municipal_baseline_2024.json')
    population_ref = {c: baseline['cities'][c]['bef'] for c in CITIES}
    hh, hh_mun, hh_receipt = read_table(hh_zip, 'TAB6568', expected=expected)
    bef, bef_mun, bef_receipt = read_table(bef_zip, 'TAB6574', expected=expected)
    checks = {'hh': reconcile('Hushåll', hh, hh_mun), 'bef': reconcile('Befolkning', bef, bef_mun, reference=population_ref)}
    cars = read_json(SCB_DIR/'active_cars_2024.json')
    rows = []
    for code in sorted(expected):
        bil = cars['byDeSO'][code]
        if hh[code] == 0 and bil > 0:
            raise ValueError(f'{code}: {bil} registrerade bilar men noll hushåll i SCB:s tabell; kräver separat bedömning.')
        whole = lambda x: int(x) if float(x).is_integer() else x  # noqa: E731
        rows.append({'kod': code, 'hh': whole(hh[code]), 'bef': whole(bef[code]), 'bil': bil})
    value = {'schema': 'vagvis-observed-deso-2024-1', 'dataYear': 2024, 'desoVersion': '2025', 'status': 'validated_official_data',
             'rows': rows, 'checks': checks, 'imported': date.today().isoformat(),
             'sourceReceipts': [hh_receipt, bef_receipt, cars['sourceReceipt'] if 'sourceReceipt' in cars else {'table': 'TAB6589', 'file': 'underlag/raw/scb/active_cars_2024.json'}]}
    if write:
        tmp = ACTIVE.with_suffix('.tmp')
        tmp.write_text(json.dumps(value, ensure_ascii=False, indent=1)+'\n', encoding='utf-8')
        tmp.replace(ACTIVE)
    return value


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('hushall', type=Path, help='TAB6568_sv.zip eller TAB6568_sv.csv')
    p.add_argument('befolkning', type=Path, help='TAB6574_sv.zip eller TAB6574_sv.csv')
    a = p.parse_args(argv)
    value = import_files(a.hushall, a.befolkning)
    for city, name in CITIES.items():
        hh = sum(r['hh'] for r in value['rows'] if r['kod'].startswith(city))
        bef = sum(r['bef'] for r in value['rows'] if r['kod'].startswith(city))
        print(f'{name}: {hh:.0f} hushåll, {bef:.0f} invånare i 2024 års register per DeSO.')
    print('Skrev', ACTIVE.relative_to(ROOT), '– kör nu python verktyg/bygg_underlag.py och node kallkod/bygg_appen.cjs.')


if __name__ == '__main__':
    main()
