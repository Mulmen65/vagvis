"""Offline fixture checks; deliberately makes no external network requests."""
import importlib.util
import pathlib
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('downloader', pathlib.Path(__file__).resolve().parents[1] / 'hamta_underlag.py')
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)


class DownloaderChecks(unittest.TestCase):
    def test_official_deso_id(self):
        f = dict(properties=dict(deso='1280C1010'), geometry=dict(type='Polygon', coordinates=[]))
        a = d.area_feature(f, '1283', 'deso', '2018', 0)
        self.assertEqual(a['id'], '1280C1010')
        self.assertEqual(a['city'], '1280')

    def test_district_code_and_name(self):
        f = dict(properties=dict(delomradeskod='101', namn='Exempel'), geometry={})
        a = d.area_feature(f, '1280', 'district', '2024', 0)
        self.assertEqual(a['id'], '101')
        self.assertEqual(a['name'], 'Exempel')

    def test_deso_filter_and_version(self):
        calls = []
        def mock(url, *args, **kwargs):
            calls.append(url)
            return dict(features=[dict(properties=dict(deso='1280C1010'), geometry={})], totalFeatures=1)
        with patch.object(d, 'get_json', mock):
            a = d.deso(['1280'], '2018')
        self.assertEqual(len(a), 1)
        self.assertIn('DeSO_2018', calls[0])
        self.assertIn('CQL_FILTER', calls[1])

    def test_truncated_deso_rejected(self):
        with patch.object(d, 'get_json', side_effect=[dict(features=[dict(properties=dict(deso='1280C1010'))]), dict(features=[], totalFeatures=6000)]):
            with self.assertRaises(ValueError):
                d.deso(['1280'], '2018')

    def test_osm_has_no_fabricated_observed_counts(self):
        area = dict(city='1280', level='deso', geometry=dict(coordinates=[[[13,55],[14,55],[14,56],[13,55]]]))
        payload = dict(elements=[dict(type='way', id=123, tags=dict(highway='motorway', oneway='yes'), geometry=[dict(lon=13,lat=55),dict(lon=13.1,lat=55.1)])])
        with patch.object(d, 'get_json', return_value=payload):
            roads = d.osm_roads('1280', [area], pause=lambda s: None)
        self.assertIsNone(roads[0]['aadt'])
        self.assertEqual(roads[0]['quality'], 'assumed')
        self.assertTrue(roads[0]['oneway'])

    def test_overpass_partial_result_rejected(self):
        area = dict(city='1280', level='deso', geometry=dict(coordinates=[[[13,55],[14,55],[14,56],[13,55]]]))
        with patch.object(d, 'get_json', return_value=dict(remark='timeout', elements=[])):
            with self.assertRaises(ValueError):
                d.osm_roads('1280', [area], pause=lambda s: None)

    def test_overpass_mirror_fallback_and_retry(self):
        calls = []
        def mock(url, body=None, timeout=240):
            calls.append(url)
            if len(calls) < 3:
                raise OSError('HTTP Error 504: Gateway Timeout')
            return dict(elements=[])
        with patch.object(d, 'get_json', mock):
            d.overpass('q', 'test', pause=lambda s: None)
        self.assertEqual([c.split('/')[2] for c in calls], ['overpass-api.de', 'overpass.kumi.systems', 'overpass.private.coffee'])

    def test_tiles_dedupe_and_service_optional(self):
        area = dict(city='1280', level='deso', geometry=dict(coordinates=[[[12.9,55.5],[13.2,55.5],[13.2,55.7],[12.9,55.5]]]))
        way = dict(type='way', id=7, tags=dict(highway='primary'), geometry=[dict(lon=13,lat=55.6),dict(lon=13.01,lat=55.61)])
        def mock(url, body=None, timeout=240):
            if 'service' in body['data']:
                raise OSError('HTTP Error 429: Too Many Requests')
            return dict(elements=[way])
        with patch.object(d, 'get_json', mock):
            roads = d.osm_roads('1280', [area], pause=lambda s: None)
        self.assertEqual(len(roads), 1)            # samma väg i flera rutor räknas en gång
        self.assertTrue(d.osm_roads.notes)          # servicevägar saknas men huvudnätet levereras
        self.assertIn('out tags geom qt', d.osm_query((12.9, 55.5, 13.0, 55.6), d.OSM_MAIN))


if __name__ == '__main__':
    unittest.main()
