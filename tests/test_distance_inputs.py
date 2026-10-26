"""Offline source-selection and atomicity checks for optional DeSO indicators.

The tiny synthetic fixtures below are test inputs only. No test values are
written into the packaged observation/indicator files.
"""
from contextlib import redirect_stdout
import copy
import csv
import io
import json
from pathlib import Path
from types import SimpleNamespace
import sys
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from verktyg import hamta_korstrackeindikatorer as fetcher
from verktyg import bygg_korstrackeindikatorer as builder

CODES = {'1280C1000', '1280C1010'}


def zipped_csv(headers, rows, encoding='cp1252', delimiter=';'):
    text = io.StringIO(newline='')
    writer = csv.writer(text, delimiter=delimiter)
    writer.writerow(headers)
    writer.writerows(rows)
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('TAB6684_sv.csv', text.getvalue().encode(encoding))
    return out.getvalue()


def income_fixture():
    return {'schema': 'vagvis-income-1', 'dataYear': 2024, 'desoVersion': '2025',
            'measure': 'median_ekonomisk_standard', 'unit': 'tkr_2024_prices',
            'rows': [{'kod': code, 'income': 250.5} for code in sorted(CODES)]}


class IncomeSelectionTests(unittest.TestCase):
    def test_cp1252_wide_median_only_exact_year_and_codes(self):
        raw = zipped_csv(['region', 'år', 'Medianvärde, tkr', 'Medelvärde, tkr'], [
            ['1280C1000 Malmö väst', 2024, '250,5', '999'],
            ['1280C1010 Öster', 2024, '300,7', '888'],
            ['1280C1000 Malmö väst', 2023, '1', '1'],
            ['1280 Malmö', 2024, '2', '2'],
            ['1280R001 RegSO', 2024, '3', '3'],
        ])
        obj = fetcher.parse_income_zip(raw, CODES)
        self.assertEqual({row['kod']: row['income'] for row in obj['rows']},
                         {'1280C1000': 250.5, '1280C1010': 300.7})
        self.assertEqual(obj['source']['encoding'], 'cp1252')
        self.assertEqual(obj['source']['layout'], 'wide_median_column')
        self.assertEqual(obj['source']['parsedRows'], 5)
        self.assertEqual(obj['measure'], 'median_ekonomisk_standard')

    def test_long_measure_dimension_and_protected_cell(self):
        raw = zipped_csv(['region', 'tabellinnehåll', 'år', 'värde'], [
            ['1280C1000', 'Medelvärde, tkr', 2024, '900'],
            ['1280C1000', 'Medianvärde, tkr', 2024, '245,3'],
            ['1280C1010', 'Medianvärde, tkr', 2024, '..'],
        ], encoding='utf-8-sig')
        obj = fetcher.parse_income_zip(raw, CODES)
        self.assertEqual({row['kod']: row['income'] for row in obj['rows']},
                         {'1280C1000': 245.3, '1280C1010': None})
        self.assertEqual(obj['source']['layout'], 'long_content_dimension')

    def test_missing_duplicate_wrong_measure_and_wrong_unit_rejected(self):
        headers = ['region', 'år', 'Medianvärde, tkr']
        cases = [
            (headers, [['1280C1000', 2024, 250]]),
            (headers, [['1280C1000', 2024, 250], ['1280C1000', 2024, 300], ['1280C1010', 2024, 300]]),
            (['region', 'år', 'Medelvärde, tkr'], [['1280C1000', 2024, 250], ['1280C1010', 2024, 300]]),
            (['region', 'år', 'Medianvärde, kronor'], [['1280C1000', 2024, 250000], ['1280C1010', 2024, 300000]]),
            (headers, [['1280C1000', 2024, -1], ['1280C1010', 2024, 300]]),
        ]
        for columns, rows in cases:
            with self.subTest(columns=columns, rows=rows):
                with self.assertRaises(ValueError):
                    fetcher.parse_income_zip(zipped_csv(columns, rows), CODES)

    def test_cached_income_schema_measure_units_geography_and_values(self):
        obj = income_fixture()
        self.assertEqual(builder.validate_income(obj, CODES)['1280C1000'], 250.5)
        for key, wrong in [('schema', 'other'), ('dataYear', 2025), ('desoVersion', '2018'),
                           ('measure', 'mean_income'), ('unit', 'kr_2024_prices')]:
            bad = copy.deepcopy(obj)
            bad[key] = wrong
            with self.subTest(key=key), self.assertRaises(ValueError):
                builder.validate_income(bad, CODES)
        for value in [True, -1, 0, float('nan'), float('inf')]:
            bad = copy.deepcopy(obj)
            bad['rows'][0]['income'] = value
            with self.subTest(value=value), self.assertRaises(ValueError):
                builder.validate_income(bad, CODES)


class OsmInputTests(unittest.TestCase):
    def test_transport_and_grocery_filters_centres_and_retired_nodes(self):
        raw = json.dumps({'osm3s': {'timestamp_osm_base': '2026-10-26T00:00:00Z'}, 'elements': [
            {'type': 'node', 'id': 1, 'lon': 13, 'lat': 55, 'tags': {'shop': 'supermarket'}},
            {'type': 'way', 'id': 2, 'center': {'lon': 13.1, 'lat': 55.1}, 'tags': {'railway': 'station'}},
            {'type': 'node', 'id': 3, 'lon': 13, 'lat': 55, 'tags': {'railway': 'station', 'disused': 'yes'}},
            {'type': 'node', 'id': 4, 'lon': 13, 'lat': 55, 'tags': {'shop': 'clothes'}},
            {'type': 'node', 'id': 5, 'lon': 13, 'lat': 55, 'tags': {'highway': 'bus_stop'}},
        ]}).encode()
        points, date = fetcher.parse_osm(raw, '1280')
        self.assertEqual([p['id'] for p in points], ['node/1', 'way/2'])
        self.assertEqual([p['kind'] for p in points], ['service', 'transit'])
        self.assertEqual(date, '2026-10-26T00:00:00Z')
        self.assertEqual(len(builder.validate_pois({'schema': 'vagvis-osm-access-points-1', 'points': points})['1280']['transit']), 1)

    def test_partial_errors_duplicates_and_invalid_coordinates_rejected(self):
        service = {'type': 'node', 'id': 1, 'lon': 13, 'lat': 55, 'tags': {'shop': 'supermarket'}}
        transit = {'type': 'node', 'id': 2, 'lon': 13, 'lat': 55, 'tags': {'railway': 'station'}}
        for obj in [{'elements': [service]}, {'elements': [service, transit, service]},
                    {'elements': [service, transit], 'remark': 'runtime error'}, {'other': []}]:
            with self.assertRaises(ValueError):
                fetcher.parse_osm(json.dumps(obj).encode(), '1280')
        good = {'schema': 'vagvis-osm-access-points-1', 'points': [
            {'id': 'node/1', 'kk': '1280', 'kind': 'service', 'lon': 13, 'lat': 55}]}
        self.assertEqual(builder.validate_pois(good)['2180']['transit'], [])
        for patch_row in [{'lon': True}, {'lat': 91}, {'lon': float('nan')}, {'kk': '9999'}, {'kind': 'unknown'}]:
            bad = copy.deepcopy(good)
            bad['points'][0].update(patch_row)
            with self.subTest(patch=patch_row), self.assertRaises(ValueError):
                builder.validate_pois(bad)

    def test_empty_destination_and_origin_are_unknown_not_zero_distance(self):
        sample = {'points': [{'lon': 13, 'lat': 55, 'weightKm': 1}]}
        self.assertIsNone(builder.weighted_dist(sample, []))
        self.assertIsNone(builder.weighted_dist({'points': []}, [(13, 55)]))
        self.assertEqual(builder.weighted_dist(sample, [(13, 55)]), 0)
        self.assertAlmostEqual(builder.km((0, 0), (1, 0)), 111.1950802, places=5)


class AcquisitionAtomicityTests(unittest.TestCase):
    def test_network_failure_keeps_both_existing_caches_and_records_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            store = Path(temp)
            old = {name: ('original '+name).encode() for name in ['inkomst_2024.json', 'TAB6684_sv.zip', 'osm_access_points.json']}
            for name, data in old.items():
                (store/name).write_bytes(data)
            args = SimpleNamespace(income_zip=None, poi_json=None, no_network=False, timeout=.1)
            failed_city = lambda city, timeout: {'success': False, 'city': city, 'failures': [{'error': 'test failure'}]}
            with patch.object(fetcher, 'STORE', store), patch.object(fetcher, 'expected_codes', return_value=CODES), \
                 patch.object(fetcher, 'request', side_effect=urllib.error.URLError('test blocked')), \
                 patch.object(fetcher, 'fetch_city', side_effect=failed_city), \
                 patch.object(fetcher, 'build', return_value={'metadata': {'coverage': {}}}) as build, redirect_stdout(io.StringIO()):
                receipt = fetcher.run(args)
            self.assertEqual(build.call_count, 1)
            for name, data in old.items():
                self.assertEqual((store/name).read_bytes(), data)
            self.assertEqual([s['success'] for s in receipt['sources']], [False, False])
            self.assertEqual(json.loads((store/'senaste_hamtning.json').read_text())['sources'][0]['success'], False)

    def test_invalid_user_file_is_rejected_before_any_source_replacement(self):
        with tempfile.TemporaryDirectory() as temp:
            store = Path(temp)
            raw = zipped_csv(['region', 'år', 'Medelvärde, tkr'], [['1280C1000', 2024, 300]])
            supplied = store/'supplied.zip'
            supplied.write_bytes(raw)
            prior = b'last usable source'
            (store/'inkomst_2024.json').write_bytes(prior)
            args = SimpleNamespace(income_zip=supplied, poi_json=None, no_network=True, timeout=.1)
            with patch.object(fetcher, 'STORE', store), patch.object(fetcher, 'expected_codes', return_value=CODES), \
                 patch.object(fetcher, 'build') as build, self.assertRaises(ValueError):
                fetcher.run(args)
            self.assertEqual((store/'inkomst_2024.json').read_bytes(), prior)
            build.assert_not_called()


if __name__ == '__main__':
    unittest.main()
