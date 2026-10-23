"""Meaningful offline checks of source queries, pagination and failure handling."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import urllib.error
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from verktyg import hamta_underlag as h
from vagvis_sidor import page_html


class SourceTests(unittest.TestCase):
    def test_px_selects_only_requested_desos_and_years(self):
        meta={'variables':[{'code':'Region','values':['1280','1280C1030','1283C1010','2180C1010','0180C1010']},{'code':'Status','values':['1','2','3']},{'code':'Tid','values':['2023','2024']}]}
        q=h.px_query(meta,['2023'])
        self.assertEqual(q['query'][0]['selection']['values'],['1280C1030','1283C1010','2180C1010'])
        self.assertEqual(q['query'][1]['selection']['values'],['1','2','3'])
        self.assertEqual(q['query'][2]['selection']['values'],['2023'])
        with self.assertRaises(ValueError):h.px_query(meta,['2025'])

    def test_missing_values_are_retained_and_schema_drift_rejected(self):
        q={'query':[{'selection':{'values':['A','B']}}]}
        d={'class':'dataset','size':[2],'value':[1,None]}
        h.validate_px(d,q)
        self.assertIsNone(d['value'][1])
        with self.assertRaises(ValueError):h.validate_px({'class':'dataset','size':[1],'value':[1]},q)

    def test_failure_is_recorded_without_changing_existing_files(self):
        def fail(url,payload=None):raise urllib.error.HTTPError(url,403,'Forbidden',None,None)
        with tempfile.TemporaryDirectory() as tmp:
            current=Path(tmp)/'existing.json';current.write_text('{"keep":42}')
            run=h.Run(tmp,fetch=fail)
            self.assertIsNone(run.collect('blocked','https://example.org'))
            receipt=run.finish()
            self.assertFalse(receipt['complete'])
            self.assertEqual(receipt['failed'],1)
            self.assertFalse(receipt['activatedInApp'])
            self.assertEqual(current.read_text(),'{"keep":42}')
            self.assertIn('403',receipt['entries'][0]['error'])

    def test_malmo_pagination_fetches_all_records(self):
        calls=[]
        def fetch(url,payload=None):
            calls.append(url)
            if 'resource_search' in url:
                d={'success':True,'result':{'count':1,'results':[{'id':'cars','name':'Bilar i trafik'}]}}
            else:
                offset=int(h.urllib.parse.parse_qs(h.urllib.parse.urlparse(url).query)['offset'][0])
                d={'success':True,'result':{'total':2501,'fields':[{'id':'id'}],'records':[{'id':i,'value':None if i==2500 else i} for i in range(offset,min(offset+1000,2501))]}}
            return d,json.dumps(d).encode()
        with tempfile.TemporaryDirectory() as tmp:
            run=h.Run(tmp,fetch=fetch);h.collect_malmo(run);r=run.finish()
            self.assertTrue(r['complete'])
            complete=json.loads(next(run.directory.glob('*komplett.json')).read_text())
            self.assertEqual(len(complete['records']),2501)
            self.assertIsNone(complete['records'][-1]['value'])
            self.assertEqual(len(calls),4)

    def test_html_routes_are_complete_and_unknown_path_rejected(self):
        for name in ('vagvis','bilmodell_v7','metod','trafikdata'):
            text=page_html(name)
            self.assertIn('<html',text.lower())
        self.assertIn('method-footer',page_html('vagvis'))
        with self.assertRaises(ValueError):page_html('../../etc/passwd')

    def test_package_contains_no_network_at_streamlit_runtime(self):
        for f in ('streamlit_app.py','vagvis_sidor.py'):
            s=(ROOT/f).read_text()
            self.assertNotIn('urlopen',s)
            self.assertNotIn('requests.get',s)


if __name__=='__main__':unittest.main()
