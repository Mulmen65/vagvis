#!/usr/bin/env python3
"""Läs in Trafikverkets ÅDT (NVDB) och koppla flödena till Vägvis vägnät.

Hämta NVDB-lagret med trafikflöden från Lastkajen (kräver inloggning) som GeoPackage eller
GeoJSON för respektive kommun. Kör sedan, exempelvis:

  python verktyg/importera_nvdb_adt.py nvdb_malmo.gpkg --kommun 1280 \
      --falt-adt "ADT_fordon" --falt-tunga "ADT_tunga" --falt-matar "Matar"

Utdata: underlag/trafik/nvdb_adt_2024.json (schema vagvis-measured-roads-1). Kör därefter
python verktyg/bygg_underlag.py och node kallkod/bygg_appen.cjs.

Principer:
* ÅDT i NVDB avser normalt båda körriktningarna. När OSM har separata enkelriktade körbanor
  fördelas flödet med riktningsandel 0,5 (CV 0,05), annars används hela flödet.
* Tunga fordon i NVDB omfattar även bussar. Andelen lastbilar beräknas som tunga/samtliga
  minus vägklassens antagna bussandel (aldrig under noll).
* Mätår som avviker från 2024 får årsfaktor 1,0 och en osäkerhet som växer med 3 % per år.
* Endast OSM-vägar där minst 60 % av längden har en NVDB-länk inom 20 m med liknande riktning
  får uppmätt flöde. Övriga vägar behåller schablonen.
"""
from __future__ import annotations

import argparse
from datetime import date
import hashlib
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from vagdata import load_roads, match_lines, read_lines, write_measured  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'underlag/trafik/nvdb_adt_2024.json'
BUS_DEFAULT = {'motorway': .004, 'trunk': .006, 'primary': .012, 'secondary': .018, 'tertiary': .02}


def number(value):
    try:
        x = float(str(value).replace(',', '.').replace(' ', ''))
    except (TypeError, ValueError):
        return None
    return x if x >= 0 else None


def build_records(roads, features, field_adt, field_heavy=None, field_year=None, source='Trafikverket NVDB', year_cv=0.03,
                  base_cv=0.10, max_dist=20.0):
    def adt(props):
        v = number(props.get(field_adt))
        return v if v and v > 0 else None
    matches = match_lines(roads, features, adt, max_dist=max_dist)
    by_id = {r['id']: r for r in roads}
    records = []
    for oid, (value, cover, props) in sorted(matches.items()):
        r = by_id[oid]
        rec = {'osmId': oid, 'flowMetric': 'AADT', 'flowBothDirections': round(value, 1),
               'directionShare': 0.5 if r.get('oneway') else 1.0, 'directionCV': 0.05 if r.get('oneway') else 0.0,
               'aadtCV': base_cv, 'matchCoverage': round(cover, 3), 'source': source}
        measured_year = int(number(props.get(field_year))) if field_year and number(props.get(field_year)) else None
        rec['measurementYear'] = measured_year or 2024
        if rec['measurementYear'] != 2024:
            rec['yearFactor'] = 1.0
            rec['yearFactorCV'] = round(year_cv*abs(rec['measurementYear']-2024), 4)
            rec['yearFactorSource'] = 'Ingen trendjustering; nationellt trafikarbete 2019–2024 i stort sett oförändrat. Osäkerheten ökar med 3 % per år.'
        if field_heavy:
            heavy = number(props.get(field_heavy))
            if heavy is not None and value > 0:
                cls = r['roadClass'].replace('_link', '')
                rec['heavyShare'] = round(max(0.0, min(1.0, heavy/value)-BUS_DEFAULT.get(cls, .005)), 4)
        records.append(rec)
    return records


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('fil', type=Path, help='NVDB-export (.gpkg eller .geojson)')
    p.add_argument('--kommun', required=True, choices=['1280', '1283', '2180'])
    p.add_argument('--falt-adt', required=True, help='Fältnamn för ÅDT samtliga fordon')
    p.add_argument('--falt-tunga', help='Fältnamn för ÅDT tunga fordon')
    p.add_argument('--falt-matar', help='Fältnamn för mätår')
    p.add_argument('--epsg', type=int, help='Koordinatsystem om filen saknar uppgift (3006 = SWEREF 99 TM)')
    p.add_argument('--lager', help='Lager i GeoPackage')
    p.add_argument('--ut', type=Path, default=OUT)
    a = p.parse_args(argv)
    features = read_lines(a.fil, a.epsg, a.lager)
    if not features:
        raise SystemExit('Filen innehåller inga linjeobjekt.')
    if a.falt_adt not in features[0]['properties']:
        raise SystemExit('Fältet '+a.falt_adt+' saknas. Tillgängliga fält: '+', '.join(features[0]['properties']))
    roads = load_roads(a.kommun)
    records = build_records(roads, features, a.falt_adt, a.falt_tunga, a.falt_matar,
                            source='Trafikverket NVDB, '+a.fil.name)
    existing = {}
    if a.ut.exists():
        import json
        old = json.loads(a.ut.read_text(encoding='utf-8'))
        existing = {r['osmId']: r for r in old.get('roads', []) if not r['osmId'] in {x['osmId'] for x in records}}
    raw = a.fil.read_bytes()
    doc = write_measured(a.ut, list(existing.values())+records, {
        'source': 'Trafikverket NVDB (Lastkajen)', 'imported': date.today().isoformat(),
        'files': [{'file': a.fil.name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'kommun': a.kommun}],
        'method': 'Längdviktat ÅDT från NVDB-länkar inom 20 m och 25° riktningsskillnad; minst 60 % täckning per OSM-väg.'})
    print(f'{len(records)} OSM-vägar i kommun {a.kommun} fick uppmätt ÅDT. Totalt {len(doc["roads"])} poster i {a.ut}.')


if __name__ == '__main__':
    main()
