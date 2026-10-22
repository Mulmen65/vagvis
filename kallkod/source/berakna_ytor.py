#!/usr/bin/env python3
"""Vägvis 2.0.7 – räknar ytan för varje område, för måttet CO₂ per hektar.

    python source/berakna_ytor.py        (därefter node source/build.cjs)

Skriver source/omradesytor.json:
  A (geodata_project.json, DeSO 2025 och stadsdelsområden): hela ytan och landytan i hektar.
    Beräkningsgränserna i modell A behåller kommunens vatten, så att broar räknas. Landytan är
    snittet med landmasken från Bilmodell v7 (source/land_masks.json).
  B (household_project.json, DeSO 2018 ur Bilmodell v7): ytan i hektar. Ytorna är redan klippta mot land.
Ytorna räknas i SWEREF 99 TM (EPSG:3006). Kräver shapely och pyproj."""
import json
import pathlib

import numpy as np
import shapely
from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import unary_union

SRC = pathlib.Path(__file__).resolve().parent
T = Transformer.from_crs(4326, 3006, always_xy=True)


def proj(g):
    return shapely.transform(g, lambda c: np.column_stack(T.transform(c[:, 0], c[:, 1])))


def geom(g):
    s = shape(g)
    return proj(s if s.is_valid else s.buffer(0))


def main():
    A = json.loads((SRC / 'geodata_project.json').read_text(encoding='utf-8'))
    B = json.loads((SRC / 'household_project.json').read_text(encoding='utf-8'))
    masks = json.loads((SRC / 'land_masks.json').read_text(encoding='utf-8'))
    land = {k: unary_union([geom(f['geometry']) for f in v['features']]) for k, v in masks.items()}
    out = {'meta': {'enhet': 'hektar', 'projektion': 'EPSG:3006',
                    'A': 'ha = hela beräkningsytan (med vatten), landHa = snittet med landmasken ur Bilmodell v7',
                    'B': 'ha = ytan ur Bilmodell v7 (klippt mot land)'}, 'A': {}, 'B': {}}
    for a in A['areas']:
        g = geom(a['geometry'])
        ha = g.area / 1e4
        lm = land.get(a['city'])
        out['A'][a['level'] + '|' + a['city'] + '|' + a['id']] = {
            'ha': round(ha, 2), 'landHa': round(g.intersection(lm).area / 1e4, 2) if lm is not None else round(ha, 2)}
    for c in {a['city'] for a in A['areas']}:
        d = [v for k, v in out['A'].items() if k.startswith('deso|' + c + '|')]
        out['A']['city|' + c] = {'ha': round(sum(x['ha'] for x in d), 2), 'landHa': round(sum(x['landHa'] for x in d), 2)}
    for a in B['areas']:
        g = geom(a['geometry'])
        out['B'][a['level'] + '|' + a['city'] + '|' + a['id']] = {'ha': round(g.area / 1e4, 2)}
    for c in {a['city'] for a in B['areas']}:
        d = [v for k, v in out['B'].items() if k.startswith('deso|' + c + '|')]
        out['B']['city|' + c] = {'ha': round(sum(x['ha'] for x in d), 2)}
    (SRC / 'omradesytor.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    for m in ('A', 'B'):
        cs = {k: v for k, v in out[m].items() if k.startswith('city|')}
        print(m, len(out[m]), 'områden;', cs)


if __name__ == '__main__':
    main()
