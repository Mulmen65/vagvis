#!/usr/bin/env python3
"""Läs in kommunala trafikmätningar (punktmätningar) och räkna om dem till ÅDT 2024.

Indata: CSV med en rad per mätpunkt och kolumnerna
  id, lat, lon (eller e, n i SWEREF 99 TM), flode, matt (ADT eller MVD), manad (1–12, valfri),
  ar, riktning (both eller one), tung_andel (valfri, 0–1), kalla
Exempel: Malmö stads öppna data om trafikmätningar exporterade till CSV.

  python verktyg/importera_trafikmatningar.py malmo_matningar.csv --kommun 1280

Omräkning av medelvardagsdygn (MVD, måndag–fredag) till ÅDT görs med Trafikverkets
normalvärden (Trafikvariation och lastbilsandelar, tabell 1–2):
  ÅDT = MVD / (veckodagsindex_mån–fre/100 × månadsindex/100)
Personbil och lastbil räknas om var för sig med tung andel. Närtrafik används för tätortsgator,
genomfart för motorväg och trunk. Saknas månad används endast veckodagsindex. Omräkningen får
CV 0,10 (normalvärden ersätter lokal variation). Varje mätpunkt får gälla den OSM-väg den ligger på.
"""
from __future__ import annotations

import argparse
import csv
from datetime import date
import hashlib
import io
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from geodesi import to_wgs84  # noqa: E402
from vagdata import load_roads, match_points, write_measured  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'underlag/trafik/kommunala_matningar_2024.json'
# Trafikverket (u.å.) Trafikvariation och lastbilsandelar – normalvärden, tabell 1 och 2.
MONTH = {
    'nar': {'pb': [88.5, 84.3, 98.1, 98.3, 106.8, 107.5, 104.7, 111.0, 106.3, 106.4, 96.4, 91.6],
            'lb': [90.0, 87.6, 98.0, 100.1, 107.5, 106.4, 99.1, 106.3, 111.0, 112.0, 97.8, 84.2]},
    'genom': {'pb': [77.8, 76.8, 91.2, 97.4, 105.0, 115.2, 131.5, 123.0, 105.1, 102.3, 89.3, 85.5],
              'lb': [86.2, 88.0, 99.2, 101.9, 107.3, 110.6, 107.1, 104.7, 109.9, 108.8, 93.7, 82.5]},
}
WEEKDAY = {  # måndag–fredag
    'nar': {'pb': [102.3, 103.0, 104.0, 107.2, 112.4], 'lb': [121.0, 128.5, 125.6, 127.3, 116.5]},
    'genom': {'pb': [97.6, 96.3, 97.6, 103.6, 113.5], 'lb': [119.2, 126.9, 123.6, 125.9, 112.2]},
}
SOURCE_TV = 'Trafikverket (u.å.). Trafikvariation och lastbilsandelar – normalvärden, tabell 1–2.'


def mvd_to_aadt_factor(environment, heavy_share, month=None):
    """Multiplikator ÅDT/MVD för given trafikmiljö ('nar' eller 'genom'), tung andel och månad."""
    out = 0.0
    for kind, share in (('pb', 1-heavy_share), ('lb', heavy_share)):
        w = sum(WEEKDAY[environment][kind])/5/100
        m = MONTH[environment][kind][month-1]/100 if month else 1.0
        out += share/(w*m)
    return out


def parse_csv(path, epsg=None):
    text = Path(path).read_bytes().decode('utf-8-sig')
    rows = list(csv.DictReader(io.StringIO(text), delimiter=';' if text.count(';') > text.count(',') else ','))
    points = []
    for i, r in enumerate(rows, start=2):
        r = {k.strip().lower(): (v or '').strip() for k, v in r.items()}
        try:
            if r.get('lat') and r.get('lon'):
                pt = (float(r['lon'].replace(',', '.')), float(r['lat'].replace(',', '.')))
            else:
                pt = to_wgs84(float(r['e'].replace(',', '.')), float(r['n'].replace(',', '.')), epsg or 3006)
            flow = float(r['flode'].replace(',', '.').replace(' ', ''))
            year = int(r['ar'])
        except (KeyError, ValueError) as e:
            raise ValueError(f'Rad {i}: saknat eller ogiltigt värde ({e}).') from e
        metric = r.get('matt', 'MVD').upper().replace('Å', 'A')
        if metric not in ('ADT', 'AADT', 'MVD'):
            raise ValueError(f'Rad {i}: matt ska vara ADT eller MVD.')
        direction = r.get('riktning', 'both').lower()
        if direction not in ('both', 'one'):
            raise ValueError(f'Rad {i}: riktning ska vara both eller one.')
        month = int(r['manad']) if r.get('manad') else None
        if month is not None and not 1 <= month <= 12:
            raise ValueError(f'Rad {i}: manad ska vara 1–12.')
        heavy = float(r['tung_andel'].replace(',', '.')) if r.get('tung_andel') else None
        points.append({'id': r.get('id') or f'rad-{i}', 'point': pt, 'flow': flow, 'metric': 'MVD' if metric == 'MVD' else 'AADT',
                       'month': month, 'year': year, 'direction': direction, 'heavyShare': heavy, 'source': r.get('kalla', '')})
    return points


def build_records(roads, points, max_dist=30.0, conversion_cv=0.10, year_cv=0.03):
    by_id = {r['id']: r for r in roads}
    out = []
    for oid, pts in sorted(match_points(roads, points, max_dist).items()):
        r = by_id[oid]
        env = 'genom' if r['roadClass'].replace('_link', '') in ('motorway', 'trunk') else 'nar'
        values = []
        for p in pts:
            heavy = p['heavyShare'] if p['heavyShare'] is not None else .07
            factor = mvd_to_aadt_factor(env, heavy, p['month']) if p['metric'] == 'MVD' else 1.0
            values.append((p['flow']*factor, factor, p))
        aadt = sum(v for v, _, _ in values)/len(values)
        p0 = values[0][2]
        both = p0['direction'] == 'both'
        rec = {'osmId': oid, 'flowMetric': 'AADT', 'flowBothDirections': round(aadt, 1) if both else round(aadt*2, 1),
               'directionShare': 0.5 if r.get('oneway') else 1.0,
               'directionCV': 0.05 if (r.get('oneway') or not both) else 0.0,
               'aadtCV': 0.05, 'measurementYear': p0['year'], 'points': [p['id'] for _, _, p in values],
               'distanceM': round(max(p['distance'] for _, _, p in values), 1),
               'source': '; '.join(sorted({p['source'] or 'Kommunal mätning' for _, _, p in values}))}
        if not both:
            rec['note'] = 'Mätning i en riktning: flödet i båda riktningar antas vara dubbelt så stort (symmetri, CV 0,05).'
        if any(f != 1.0 for _, f, _ in values):
            rec['conversion'] = {'name': 'MVD→ÅDT', 'value': round(sum(f for _, f, _ in values)/len(values), 4),
                                 'source': SOURCE_TV+(' Närtrafik.' if env == 'nar' else ' Genomfart.'), 'cv': conversion_cv}
        if p0['heavyShare'] is not None:
            rec['heavyShare'] = round(max(0.0, p0['heavyShare']-.01), 4)
        if p0['year'] != 2024:
            rec['yearFactor'] = 1.0
            rec['yearFactorCV'] = round(year_cv*abs(p0['year']-2024), 4)
            rec['yearFactorSource'] = 'Ingen trendjustering; osäkerheten ökar med 3 % per år från mätåret.'
        out.append(rec)
    return out


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('fil', type=Path)
    p.add_argument('--kommun', required=True, choices=['1280', '1283', '2180'])
    p.add_argument('--epsg', type=int, help='Koordinatsystem för e/n-kolumner (standard 3006)')
    p.add_argument('--ut', type=Path, default=OUT)
    a = p.parse_args(argv)
    points = parse_csv(a.fil, a.epsg)
    records = build_records(load_roads(a.kommun), points)
    raw = a.fil.read_bytes()
    write_measured(a.ut, records, {'source': 'Kommunala trafikmätningar', 'imported': date.today().isoformat(),
                   'files': [{'file': a.fil.name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'kommun': a.kommun}],
                   'method': 'Närmaste OSM-väg inom 30 m; MVD räknas om med Trafikverkets normalvärden.'})
    print(f'{len(points)} mätpunkter, {len(records)} OSM-vägar fick uppmätt ÅDT i {a.ut}.')


if __name__ == '__main__':
    main()
