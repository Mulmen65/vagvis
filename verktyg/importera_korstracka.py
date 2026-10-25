#!/usr/bin/env python3
"""Läs in uppmätt körsträcka för modell B, per kommun eller per DeSO.

Körsträckan för personbilar mäts genom mätarställningar vid kontrollbesiktning och lagras i
Transportstyrelsens vägtrafikregister. SCB sammanställer dem på två sätt som Vägvis kan använda:

1. Per kommun (öppna data). SCB tar årligen fram körsträckedata per kommun åt RUS
   (Regional utveckling och samverkan i miljömålssystemet), www.rus.se, tabell 2.
   Värdet avser alla personbilar registrerade i kommunen (även företagsägda), per bil i
   trafik under året. Vägvis överför det till privatägda bilar i årsslutsbeståndet med
   kvoten mot riket i samma tabell:

       K_kommun = K_riket × (mil per bil i kommunen / mil per bil i riket)

   där K_riket = 12 753 km är modellens riksvärde (Trafikanalys 2025a, 2025b).

     python verktyg/importera_korstracka.py kommun --ar 2024 --riket 1141 1280=1064 1283=<värde> 2180=<värde>
     python verktyg/importera_korstracka.py kommun --ar 2024 --excel Tabell-2-Korstracka-till-ar-2025.xlsx

2. Per DeSO (beställning från SCB, se dokument/Bestallning_korstracka_DeSO_SCB.txt).
   CSV med en rad per DeSO och kolumnerna
       deso, ar, antal_bilar_31dec, korstracka_km
   (valfritt antal_bilar_under_aret, antal_med_matarstallning). Körsträckan per bil blir
   korstracka_km / antal_bilar_31dec, vilket motsvarar modellens definition V = P × K.
   Skyddade celler (tomma eller ..) får kommunens eller rikets värde och redovisas.

     python verktyg/importera_korstracka.py deso korstracka_deso_2024.csv

Därefter: python verktyg/bygg_underlag.py och node kallkod/bygg_appen.cjs.
Inget skrivs om valideringen misslyckas.
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from paket import read_json  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT/'underlag/raw'
CITIES = {'1280': 'Malmö', '1283': 'Helsingborg', '2180': 'Gävle'}
K_RIKET = 12753
RUS_URL = 'https://www.rus.se/statistik-och-indikatorer/korstrackor/'
SUPPRESSED = ('', '..', '.', '-', 'x', 'X')


def kommun_path(year):
    return RAW/f'korstracka_kommun_{year}.json'


def deso_path(year):
    return RAW/f'korstracka_deso_{year}.json'


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def write_atomic(path, value):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=1)+'\n', encoding='utf-8')
    tmp.replace(path)


def number(text):
    t = str(text).strip().replace(' ', '').replace(' ', '').replace(',', '.')
    return float(t)


# ---------------------------------------------------------------- kommun

def rus_from_excel(path, year):
    """Hämta mil per bil för de tre kommunerna och riket ur RUS tabell 2.

    RUS-filen har en rubrikrad med "År 1999" … "År 2025" där varje år har två kolumner
    ("Körsträcka per bil" och "Körsträcka per invånare/person"), och rader med kod och region
    (t.ex. 1280 och "1280MALMÖ"). Även enklare tabeller med årtal som rubrik fungerar.
    """
    try:
        import openpyxl
    except ImportError as e:  # pragma: no cover - beroende saknas lokalt
        raise SystemExit('Excel-läsning kräver openpyxl: python -m pip install openpyxl') from e
    year_re = re.compile(r'(?<!\d)%d(?!\d)' % year)
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheets = [ws for ws in wb.worksheets if 'bil' in ws.title.lower() and 'inv' not in ws.title.lower()] or wb.worksheets
    wanted = {**{c: (c, n.lower()) for c, n in CITIES.items()}, 'riket': ('riket', 'riket')}
    for ws in sheets:
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
        col = head = None
        for i, r in enumerate(rows):
            for j, v in enumerate(r):
                if (isinstance(v, str) and year_re.search(v) and len(v) < 20) or (isinstance(v, (int, float)) and v == year):
                    col, head = j, i
                    break
            if col is not None:
                break
        if col is None:
            continue
        # Välj kolumnen "per bil" om året har flera kolumner.
        for r in rows[head+1:head+3]:
            for j in (col, col+1):
                if j < len(r) and isinstance(r[j], str) and 'per bil' in r[j].lower():
                    col = j
                    break
            else:
                continue
            break
        found = {}
        for r in rows[head+1:]:
            # Etiketter: textceller före årskolumnen samt en heltalskod i första kolumnen (inte datavärden).
            labels = ([str(r[0])] if r and isinstance(r[0], int) else []) + \
                [re.sub(r'\s+', ' ', v.replace('\u00a0', ' ')).strip().lower() for v in r[:col] if isinstance(v, str)]
            for key, (code, name) in wanted.items():
                if key in found:
                    continue
                if any(lbl == code or lbl.startswith(code+' ') or lbl == code+name or lbl == name or lbl.endswith(' '+name) for lbl in labels):
                    try:
                        found[key] = number(r[col])
                    except (TypeError, ValueError):
                        pass
        if len(found) == len(wanted):
            return {k: found[k] for k in CITIES}, found['riket'], ws.title
    raise ValueError(f'Hittade inte {year} för Malmö, Helsingborg, Gävle och riket i {Path(path).name}. Ange värdena direkt i stället.')


def build_kommun(values, riket, year, source):
    if not 500 <= riket <= 2500:
        raise ValueError(f'Rikets värde {riket} mil per bil är orimligt.')
    missing = set(CITIES)-set(values)
    if missing:
        raise ValueError('Värde saknas för '+', '.join(CITIES[c] for c in sorted(missing))+'.')
    cities = {}
    for code, mil in values.items():
        if code not in CITIES:
            raise ValueError(f'Okänd kommunkod {code}.')
        if not 500 <= mil <= 2500:
            raise ValueError(f'{CITIES[code]}: {mil} mil per bil är orimligt.')
        ratio = mil/riket
        cities[code] = {'name': CITIES[code], 'rusMilPerCar': mil, 'ratioToNational': ratio, 'kmPerCar': round(K_RIKET*ratio)}
    return {'schema': 'vagvis-korstracka-kommun-1', 'dataYear': year, 'status': 'validated_official_data',
            'level': 'kommun', 'unit': 'km per privat personbil i årsslutsbeståndet',
            'method': 'K_kommun = 12 753 km × (mil per bil i kommunen / mil per bil i riket), RUS/SCB körsträckedata tabell 2.',
            'national': {'rusMilPerCar': riket, 'kmPerCar': K_RIKET},
            'cities': cities, 'source': source, 'imported': date.today().isoformat(),
            'caveats': ['Kommunvärdet avser bilar registrerade i kommunen, även företagsägda; registreringskommun är inte alltid hemkommun.',
                        'Överföringen till privatägda bilar antar samma kvot mellan kommun och riket för privat- och företagsägda bilar.']}


# ---------------------------------------------------------------- DeSO

def read_deso_csv(path, year, expected, cars, kommun=None):
    raw = Path(path).read_bytes()
    try:
        text = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = raw.decode('cp1252')
    sample = text[:4096]
    delimiter = ';' if sample.count(';') > sample.count(',') else ','
    reader = csv.DictReader(io.StringIO(text, newline=''), delimiter=delimiter)
    head = [h.strip().lower() for h in reader.fieldnames or []]
    need = {'deso', 'ar', 'antal_bilar_31dec', 'korstracka_km'}
    if not need <= set(head):
        raise ValueError('CSV-filen saknar kolumnerna '+', '.join(sorted(need-set(head)))+'.')
    rows, seen = [], set()
    for line, r in enumerate(reader, start=2):
        r = {k.strip().lower(): (v or '').strip() for k, v in r.items()}
        kod = r['deso']
        if kod not in expected or r['ar'] != str(year):
            continue  # andra kommuner och andra år i samma leverans hoppas över
        if kod in seen:
            raise ValueError(f'Dubbel rad för {kod} år {year} (rad {line}).')
        seen.add(kod)
        city = kod[:4]
        if r['korstracka_km'] in SUPPRESSED or r['antal_bilar_31dec'] in SUPPRESSED:
            fallback = (kommun or {}).get(city, {}).get('kmPerCar', K_RIKET)
            rows.append({'kod': kod, 'km': fallback, 'status': 'suppressed', 'cars': cars[kod], 'totalKm': None})
            continue
        n, total = number(r['antal_bilar_31dec']), number(r['korstracka_km'])
        if n <= 0:
            fallback = (kommun or {}).get(city, {}).get('kmPerCar', K_RIKET)
            rows.append({'kod': kod, 'km': fallback, 'status': 'no_cars', 'cars': 0, 'totalKm': total})
            continue
        if cars[kod] and abs(n-cars[kod]) > max(5, 0.02*cars[kod]):
            raise ValueError(f'{kod}: {n:.0f} bilar i leveransen men {cars[kod]} i SCB TAB6589; kontrollera urvalet.')
        km = total/n
        if not 1000 <= km <= 50000:
            raise ValueError(f'{kod}: {km:.0f} km per bil är orimligt.')
        rows.append({'kod': kod, 'km': round(km, 1), 'status': 'observed_register', 'cars': n, 'totalKm': total})
    missing = expected-seen
    if missing:
        raise ValueError(f'{len(missing)} DeSO saknas i leveransen, t.ex. {sorted(missing)[:3]}.')
    return sorted(rows, key=lambda x: x['kod']), delimiter


def build_deso(path, year, kommun=None):
    geo = read_json(RAW/'scb_deso_2025.geojson.gz')
    expected = {f['properties']['id'] for f in geo['features']}
    cars = read_json(RAW/'scb/active_cars_2024.json')['byDeSO']
    rows, delimiter = read_deso_csv(path, year, expected, cars, kommun)
    summary = {}
    for city, name in CITIES.items():
        rs = [r for r in rows if r['kod'].startswith(city)]
        obs = [r for r in rs if r['status'] == 'observed_register']
        n = sum(r['cars'] for r in obs)
        summary[city] = {'name': name, 'deso': len(rs), 'observed': len(obs),
                         'meanKmPerCar': sum(r['totalKm'] for r in obs)/n if n else None,
                         'minKm': min((r['km'] for r in obs), default=None), 'maxKm': max((r['km'] for r in obs), default=None)}
    return {'schema': 'vagvis-korstracka-deso-1', 'dataYear': year, 'desoVersion': '2025', 'status': 'validated_official_data',
            'level': 'deso', 'unit': 'km per privat personbil i årsslutsbeståndet',
            'method': 'K_i = summa körsträcka under året för personbilar på folkbokförda personer i DeSO i / antal sådana bilar i trafik 31 december.',
            'rows': rows, 'summary': summary, 'imported': date.today().isoformat(),
            'source': {'publisher': 'Statistiska centralbyrån (beställning)', 'basis': 'Transportstyrelsens vägtrafikregister, mätarställningar vid besiktning',
                       'file': Path(path).name, 'bytes': Path(path).stat().st_size, 'sha256': sha256(path), 'delimiter': delimiter}}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='niva', required=True)
    k = sub.add_parser('kommun', help='kommunvärden från RUS/SCB körsträckedata (tabell 2)')
    k.add_argument('--ar', type=int, default=2024)
    k.add_argument('--riket', type=float, help='mil per bil i riket samma år (samma tabell)')
    k.add_argument('--excel', type=Path, help='RUS tabell 2 som Excel-fil')
    k.add_argument('varden', nargs='*', help='kommunkod=mil per bil, t.ex. 1280=1064')
    d = sub.add_parser('deso', help='DeSO-värden från SCB-beställning (CSV)')
    d.add_argument('csv', type=Path)
    d.add_argument('--ar', type=int, default=2024)
    a = p.parse_args(argv)
    if a.niva == 'kommun':
        if a.excel:
            values, riket, sheet = rus_from_excel(a.excel, a.ar)
            excel = a.excel.resolve()
            source = {'publisher': 'RUS/SCB', 'table': 'Tabell 2 Körsträcka', 'url': RUS_URL,
                      'file': excel.relative_to(ROOT).as_posix() if ROOT in excel.parents else a.excel.name,
                      'sha256': sha256(a.excel), 'sheet': sheet}
        else:
            if a.riket is None or not a.varden:
                p.error('ange --riket och kommunvärden, eller --excel')
            values = {}
            for item in a.varden:
                code, _, val = item.partition('=')
                values[code.strip()] = number(val)
            riket = a.riket
            source = {'publisher': 'RUS/SCB', 'table': 'Tabell 2 Körsträcka', 'url': RUS_URL, 'entry': 'angivna värden'}
        value = build_kommun(values, riket, a.ar, source)
        write_atomic(kommun_path(a.ar), value)
        for c in value['cities'].values():
            print(f"{c['name']}: {c['rusMilPerCar']:.0f} mil per bil ({c['ratioToNational']:.3f} × riket) → {c['kmPerCar']} km per privat bil.")
        print('Skrev', kommun_path(a.ar).relative_to(ROOT))
    else:
        kommun = read_json(kommun_path(a.ar))['cities'] if kommun_path(a.ar).exists() else None
        value = build_deso(a.csv, a.ar, kommun)
        write_atomic(deso_path(a.ar), value)
        for s in value['summary'].values():
            print(f"{s['name']}: {s['observed']} av {s['deso']} DeSO uppmätta; medel {s['meanKmPerCar'] or 0:.0f} km per bil "
                  f"({s['minKm'] or 0:.0f}–{s['maxKm'] or 0:.0f}).")
        print('Skrev', deso_path(a.ar).relative_to(ROOT))
    print('Kör nu python verktyg/bygg_underlag.py och node kallkod/bygg_appen.cjs.')


if __name__ == '__main__':
    main()
