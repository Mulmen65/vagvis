#!/usr/bin/env python3
"""Hämta granskningsunderlag med enbart Python-standardbiblioteket.

Rådata sparas i en ny katalog. Verktyget aktiverar aldrig nya data i appen.
Kör: python verktyg/hamta_underlag.py --output underlag/hamtningar
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CITIES = ('1280', '1283', '2180')
SCB = 'https://api.scb.se/OV0104/v1/doris/sv/ssd/START/'
TABLES = [
    ('scb_bilar_2023_deso2018', SCB+'TK/TK1001/TK1001Z/PersBilarDeso', ['2023']),
    ('scb_bilar_2024_deso2025', SCB+'TK/TK1001/TK1001Z/PersBilarDesoN', ['2024']),
    ('scb_hushall_2023_2024', SCB+'BE/BE0101/BE0101Y/HushallDesoTyp', ['2023', '2024']),
]


def slug(text):
    return ''.join(c for c in unicodedata.normalize('NFKD', text).lower() if not unicodedata.combining(c))


def request_json(url, payload=None):
    headers = {'User-Agent':'Vagvis/2.0.9 public statistics research', 'Accept':'application/json'}
    body = None
    if payload is not None:
        body = json.dumps(payload).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=body, headers=headers)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                raw = r.read(50*1024*1024 + 1)
            if len(raw)>50*1024*1024:
                raise ValueError('Svaret överstiger 50 MiB; gör ett mindre urval.')
            data = json.loads(raw.decode('utf-8-sig'))
            if isinstance(data, dict) and data.get('success') is False:
                raise ValueError('API rapporterar fel: '+json.dumps(data.get('error'), ensure_ascii=False))
            return data, raw
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or attempt==2:
                raise
            # Short bounded backoff. A 403 is never retried or bypassed.
            time.sleep(1+attempt)


def px_query(metadata, years):
    variables = metadata.get('variables')
    if not variables:
        raise ValueError('SCB-metadata saknar variabler; API/schema kan ha ändrats.')
    query=[]
    found_region=found_year=False
    for v in variables:
        code=v['code']; values=v['values']
        if slug(code) in ('region','deso') or 'region' in slug(v.get('text','')):
            selected=[x for x in values if len(x)==9 and x[:4] in CITIES]
            if not selected:
                raise ValueError('Inga DeSO-koder för de tre kommunerna finns i tabellen.')
            found_region=True
        elif slug(code) in ('tid','time','ar'):
            selected=[y for y in years if y in values]
            if len(selected)!=len(years):
                raise ValueError('Begärt referensår saknas: '+str(years))
            found_year=True
        else:
            # Fetch categories separately; never add totals and their parts.
            selected=values
        query.append({'code':code,'selection':{'filter':'item','values':selected}})
    if not (found_region and found_year):
        raise ValueError('SCB:s region- eller tidsdimension kunde inte identifieras.')
    cells=1
    for q in query:
        cells*=len(q['selection']['values'])
    if cells>150000:
        raise ValueError('För stort uttag; dela upp tabellen.')
    return {'query':query,'response':{'format':'json-stat2'}}


def validate_px(data, payload):
    sizes=data.get('size')
    if data.get('class')!='dataset' or not sizes or 'value' not in data:
        raise ValueError('Svaret är inte en JSON-stat2-datamängd.')
    expected=1
    for q in payload['query']:
        expected*=len(q['selection']['values'])
    actual=1
    for n in sizes:
        actual*=n
    if actual!=expected:
        raise ValueError(f'Uttagets dimensioner avviker: {actual} mot {expected}.')
    if isinstance(data['value'], list) and len(data['value'])!=actual:
        raise ValueError('Antalet dataceller stämmer inte med dimensionerna.')


class Run:
    def __init__(self, output, fetch=request_json):
        stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        self.directory=Path(output)/stamp
        self.directory.mkdir(parents=True, exist_ok=False)
        self.fetch=fetch
        self.entries=[]

    def save(self, name, raw):
        p=self.directory/name
        p.write_bytes(raw)
        return {'file':p.name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}

    def collect(self, name, url, payload=None, validator=None):
        entry={'id':name,'url':url,'method':'POST' if payload is not None else 'GET','request':payload,'fetchedAt':datetime.now(timezone.utc).isoformat(),'activatedInApp':False}
        try:
            data,raw=self.fetch(url,payload)
            if validator:
                validator(data)
            entry.update(self.save(name+'.json',raw),status='downloaded_for_review')
            self.entries.append(entry)
            return data
        except (OSError, ValueError, KeyError, TypeError) as e:
            entry.update(status='failed',error=type(e).__name__+': '+str(e))
            self.entries.append(entry)
            return None

    def finish(self):
        failed=sum(x['status']=='failed' for x in self.entries)
        report={'schemaVersion':1,'modelVersion':'2.0.9','createdAt':datetime.now(timezone.utc).isoformat(),'complete':failed==0,'failed':failed,'activatedInApp':False,'note':'Rådata för granskning. Inga saknade värden har ersatts med noll. Källor med skilda år eller områdesindelningar har inte slagits samman.','entries':self.entries}
        (self.directory/'hamtningskvitto.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        return report


def collect_scb(run):
    for name,url,years in TABLES:
        meta=run.collect(name+'_metadata',url)
        if meta is None:
            continue
        try:
            payload=px_query(meta,years)
        except (KeyError, ValueError, TypeError) as e:
            run.entries.append({'id':name,'status':'failed','error':str(e),'activatedInApp':False})
            continue
        run.collect(name+'_data',url,payload,lambda d: validate_px(d,payload))


def ckan_url(action, **params):
    return 'https://opendata-api.malmo.se/api/3/action/'+action+'?'+urllib.parse.urlencode(params)


def collect_malmo(run):
    url=ckan_url('resource_search',query='description:malmö statistik',limit=1000,offset=0)
    listing=run.collect('malmo_resurskatalog',url)
    if listing is None:
        return
    result=listing.get('result',{})
    resources=result.get('results',[])
    if result.get('count',len(resources))>len(resources):
        run.entries.append({'id':'malmo_resurskatalog','status':'failed','error':'Resurskatalogen är paginerad; urvalet behöver delas upp innan användning.','activatedInApp':False})
        return
    wanted=[r for r in resources if any(w in slug(str(r.get('name',''))+' '+str(r.get('description',''))) for w in ['bilar','korkort','hushall','folkmangd','befolkning'])]
    if not wanted:
        run.entries.append({'id':'malmo_resursurval','status':'failed','error':'Inga efterfrågade resurser kunde identifieras. Kontrollera metadata; inga värden ersätts.','activatedInApp':False})
    for i,res in enumerate(wanted):
        rid=res.get('id')
        if not rid:
            continue
        records=[];offset=0;fields=None
        while True:
            page=run.collect(f'malmo_{i:03d}_sida_{offset}',ckan_url('datastore_search',resource_id=rid,limit=1000,offset=offset))
            if page is None:
                break
            info=page.get('result',{});chunk=info.get('records')
            if not isinstance(chunk,list):
                run.entries.append({'id':rid,'status':'failed','error':'Malmös datalager saknar förväntade records.','activatedInApp':False});break
            fields=info.get('fields');records.extend(chunk)
            total=info.get('total')
            if total is None:
                run.entries.append({'id':rid,'status':'failed','error':'Totalantal saknas; fullständighet kan inte verifieras.','activatedInApp':False});break
            if len(records)>=total:
                data={'resource':res,'fields':fields,'records':records,'total':total,'activatedInApp':False}
                raw=json.dumps(data,ensure_ascii=False).encode()
                run.entries.append({'id':rid,'status':'downloaded_for_review',**run.save(f'malmo_{i:03d}_komplett.json',raw),'activatedInApp':False})
                break
            if not chunk or len(records)>100000:
                run.entries.append({'id':rid,'status':'failed','error':'Avbruten sidindelning; sammanställning får inte användas som fullständig.','activatedInApp':False});break
            offset+=len(chunk)


def collect_trafa(run):
    run.collect('trafa_korstrackor_metadata','https://api.trafa.se/api/structure?query=t10094')
    query='t10094|ar:2024|korstr|anttrf|Mkorstr|gdkor|fordalder'
    run.collect('trafa_korstrackor_2024','https://api.trafa.se/api/data?'+urllib.parse.urlencode({'query':query}))


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output',type=Path,default=ROOT/'underlag/hamtningar')
    p.add_argument('--source',choices=['all','scb','malmo','trafa'],default='all')
    args=p.parse_args(argv)
    run=Run(args.output)
    for key,func in [('scb',collect_scb),('malmo',collect_malmo),('trafa',collect_trafa)]:
        if args.source in ('all',key):
            func(run)
    report=run.finish()
    print('Sparat:',run.directory)
    print('Misslyckade uttag:',report['failed'])
    print('Appens befintliga data har bevarats. Rådata kräver granskning före aktivering.')
    return 0 if report['complete'] else 1


if __name__=='__main__':
    sys.exit(main())
