#!/usr/bin/env python3
"""Build optional DeSO distance indicators from inspectable cached sources.

Standard library + Node only. Does not change either existing model project.
Missing observations are null, never invented, interpolated or zero-filled.
Distances are straight-line proxies, NOT network distance, travel time or frequency.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
STORE = ROOT / 'underlag/korstracka'
DATA = ROOT / 'kallkod/data'
SCHEMA = 'vagvis-distance-indicators-1'
VERSION = '2.3.0'
YEAR = 2024
CENTRES = {
    '1280': {'name': 'Malmö, Stortorget', 'lon': 13.0000, 'lat': 55.6052},
    '1283': {'name': 'Helsingborg, Stortorget', 'lon': 12.6948, 'lat': 56.0467},
    '2180': {'name': 'Gävle, Stortorget', 'lon': 17.1417, 'lat': 60.6745},
}


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def atomic_json(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n'
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent, delete=False) as f:
        f.write(raw)
        temp = Path(f.name)
    temp.replace(path)


def sha(path):
    path = Path(path)
    return {'file': str(path.relative_to(ROOT)), 'bytes': path.stat().st_size,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def km(a, b):
    """Great circle distance of WGS84 (lon, lat) pairs, in kilometres."""
    x1, y1, x2, y2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((y2-y1)/2)**2 + math.cos(y1)*math.cos(y2)*math.sin((x2-x1)/2)**2
    return 2*6371.0088*math.asin(min(1, math.sqrt(max(0, h))))


def origins():
    """Exact DeSO clipping, followed by deterministic road-length quadrature.

    Each residential/living-street segment is clipped using the existing engine's
    geometry primitives. Thirty length quantiles per DeSO approximate a uniform
    sample of residential-road length. This is not population/building weighting.
    Unclassified roads are only a recorded fallback where residential roads are absent.
    No polygon-centroid or polygon-corner average is used as a hidden fallback.
    """
    script = r'''
const fs=require('fs'),V=require('./kallkod/source/core.js');
const p=V.unpackProject(JSON.parse(fs.readFileSync('kallkod/data/project.json','utf8')),JSON.parse(fs.readFileSync('kallkod/data/omraden.json','utf8')));
const areas=p.areas.filter(a=>a.level==='deso').sort((a,b)=>a.id.localeCompare(b.id));
for(const a of areas)a.bbox=V.bbox(a.geometry);
const byCity={};for(const a of areas)(byCity[a.city]??=[]).push(a);
const out={};for(const a of areas)out[a.id]={primary:[],fallback:[]};
const polygons=g=>g.type==='Polygon'?[g.coordinates]:g.coordinates;
for(const r of p.roads){
 const primary=['residential','living_street'].includes(r.roadClass);
 if(!primary&&r.roadClass!=='unclassified')continue;
 const arr=byCity[r.city]||[],lines=r.geometry.type==='LineString'?[r.geometry.coordinates]:r.geometry.coordinates;
 for(const line of lines)for(let i=1;i<line.length;i++){
  const a=line[i-1],b=line[i],bb=[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];
  if(a[0]===b[0]&&a[1]===b[1])continue;
  const cand=arr.filter(x=>x.bbox[0]<=bb[2]+1e-10&&x.bbox[2]>=bb[0]-1e-10&&x.bbox[1]<=bb[3]+1e-10&&x.bbox[3]>=bb[1]-1e-10);
  const ts=[0,1];for(const z of cand)for(const poly of polygons(z.geometry))for(const ring of poly)for(let k=1;k<ring.length;k++)ts.push(...V.intersectT(a,b,ring[k-1],ring[k]));
  ts.sort((x,y)=>x-y);const cuts=ts.filter((t,k)=>!k||t-ts[k-1]>1e-9),at=t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  for(let k=1;k<cuts.length;k++){
   const mid=at((cuts[k-1]+cuts[k])/2),area=cand.find(z=>V.contains(z.geometry,mid));if(!area)continue;
   const len=V.distance(at(cuts[k-1]),at(cuts[k]));if(len>0)out[area.id][primary?'primary':'fallback'].push({lon:mid[0],lat:mid[1],weightKm:len});
  }
 }
}
const results={};for(const [id,obj]of Object.entries(out)){
 const fragments=obj.primary.length?obj.primary:obj.fallback,total=fragments.reduce((s,q)=>s+q.weightKm,0),selected=[];
 if(total){let index=0,cum=fragments[0].weightKm;for(let k=0;k<30;k++){const target=(k+.5)*total/30;while(cum<target&&index<fragments.length-1)cum+=fragments[++index].weightKm;selected.push({lon:fragments[index].lon,lat:fragments[index].lat,weightKm:total/30});}}
 results[id]={method:obj.primary.length?'residential_road_length_quantiles':obj.fallback.length?'unclassified_road_length_fallback':'missing',fragmentCount:fragments.length,roadLengthKm:total,points:selected};
}
process.stdout.write(JSON.stringify(results));
'''
    proc = subprocess.run(['node', '-e', script], cwd=ROOT, text=True, capture_output=True, check=True)
    return json.loads(proc.stdout)


def validate_income(obj, expected):
    if obj.get('schema') != 'vagvis-income-1' or obj.get('dataYear') != YEAR or str(obj.get('desoVersion')) != '2025':
        raise ValueError('Inkomstfilen ska avse TAB6684, år 2024 och DeSO 2025.')
    if obj.get('measure') != 'median_ekonomisk_standard':
        raise ValueError('Inkomstfilens mått måste vara median_ekonomisk_standard.')
    if obj.get('unit') != 'tkr_2024_prices':
        raise ValueError('Inkomstfilens enhet måste vara tkr_2024_prices.')
    rows = obj.get('rows')
    if not isinstance(rows, list):
        raise ValueError('Inkomstfilen saknar rows.')
    out = {}
    for r in rows:
        code = r.get('kod')
        if code not in expected or code in out:
            raise ValueError('Okänd eller dubbel inkomstkod: '+str(code))
        value = r.get('income')
        if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0):
            raise ValueError('Inkomst ska vara positiv eller null: '+code)
        out[code] = value
    if set(out) != set(expected):
        raise ValueError('Inkomstfilen ska täcka exakt samtliga 348 DeSO, inklusive null för skyddade celler.')
    return out


def validate_pois(obj):
    if obj.get('schema') != 'vagvis-osm-access-points-1':
        raise ValueError('Fel schema för OSM-punkter.')
    points = {c: {'transit': [], 'service': []} for c in CENTRES}
    seen = set()
    for p in obj.get('points', []):
        city, kind, pid = str(p.get('kk')), p.get('kind'), p.get('id')
        if city not in points or kind not in points[city] or not isinstance(pid, str) or not pid:
            raise ValueError('OSM-punkt har okänd kommun, typ eller identitet.')
        key = (city, kind, pid)
        if key in seen:
            raise ValueError('Dubbel OSM-punkt: '+str(key))
        seen.add(key)
        lon, lat = p.get('lon'), p.get('lat')
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in (lon, lat)) or not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise ValueError('Fel koordinater för OSM-punkt.')
        points[city][kind].append((lon, lat))
    # A missing city/kind means unknown, never measured zero access.
    return points


def weighted_dist(sample, destinations):
    if not sample['points'] or not destinations:
        return None
    total = sum(p['weightKm'] for p in sample['points'])
    return sum(p['weightKm']*min(km((p['lon'], p['lat']), q) for q in destinations) for p in sample['points'])/total


def build():
    households = read(DATA/'household-project.json')['d']
    expected = {r['kod'] for r in households}
    if len(households) != 348 or len(expected) != 348:
        raise ValueError('Förväntade exakt 348 unika DeSO i underlaget.')
    centres_path = STORE/'centrumreferenser.json'
    centres = read(centres_path) if centres_path.exists() else CENTRES
    if set(centres) != set(CENTRES):
        raise ValueError('Centrumreferenser måste avse samma tre kommuner.')
    for c in centres.values():
        if not (-180 <= c['lon'] <= 180 and -90 <= c['lat'] <= 90):
            raise ValueError('Fel centrumkoordinat.')
    samples = origins()
    income_path, pois_path = STORE/'inkomst_2024.json', STORE/'osm_access_points.json'
    income = validate_income(read(income_path), expected) if income_path.exists() else {}
    pois = validate_pois(read(pois_path)) if pois_path.exists() else {c: {'transit': [], 'service': []} for c in CENTRES}
    rows = []
    for h in sorted(households, key=lambda q: q['kod']):
        code, city = h['kod'], h['kk']
        sample = samples[code]
        values = {'centreKm': weighted_dist(sample, [(centres[city]['lon'], centres[city]['lat'])]),
                  'transitKm': weighted_dist(sample, pois[city]['transit']),
                  'serviceKm': weighted_dist(sample, pois[city]['service']), 'income': income.get(code),
                  'bph': h['bil']/h['hh'] if h['hh'] > 0 else None}
        quality = {k: ('missing' if v is None else 'derived_register' if k == 'bph' else
                       'observed_area_statistic' if k == 'income' else 'spatial_proxy_transferred_2026') for k, v in values.items()}
        rows.append({'kod': code, 'kk': city, **{k: round(v, 8) if v is not None else None for k, v in values.items()},
                     'quality': quality, 'originMethod': sample['method'], 'originPointCount': len(sample['points']),
                     'originFragmentCount': sample['fragmentCount'], 'originRoadLengthKm': round(sample['roadLengthKm'], 8)})
    coverage = {key: {'available': sum(r[key] is not None for r in rows), 'total': len(rows)}
                for key in ['centreKm', 'transitKm', 'serviceKm', 'income', 'bph']}
    by_city = {city: {key: {'available': sum(r[key] is not None for r in rows if r['kk'] == city),
                           'total': sum(r['kk'] == city for r in rows)} for key in coverage} for city in CENTRES}
    inputs = [DATA/'household-project.json', DATA/'project.json', DATA/'omraden.json']
    inputs += [p for p in (income_path, pois_path, centres_path) if p.exists()]
    obj = {'schema': SCHEMA, 'version': VERSION, 'dataYear': YEAR, 'desoVersion': '2025', 'rows': rows,
           'metadata': {
               'status': 'partial_observations_with_spatial_proxies', 'coverage': coverage, 'coverageByCity': by_city,
               'sourceYears': {'households': 2024, 'cars': 2024, 'income': 2024 if income else None, 'roads': 2026,
                               'pois': read(pois_path).get('osmTimestamp') if pois_path.exists() else None},
               'centres': centres,
               'definitions': {
                   'centreKm': 'Längdviktad fågelvägsdistans från bostadsgator till vald centrumreferens, km.',
                   'transitKm': 'Längdviktad fågelvägsdistans till närmaste fysisk kollektivtrafiknod i OSM: station, tåghållplats, spårvagnshållplats eller busstation. Ingen turtäthet eller restid.',
                   'serviceKm': 'Längdviktad fågelvägsdistans till närmaste OSM-dagligvarubutik (supermarket eller convenience). Inte all service.',
                   'income': 'SCB TAB6684: median ekonomisk standard, tusentals kronor i 2024 års priser. Områdesstatistik; inte specifikt bilägarnas inkomst.',
                   'bph': 'SCB-registrerade personbilar i trafik dividerat med samtliga registrerade hushåll 31 december 2024. Inte fördelning av 0/1/2+ bilar per hushåll.'},
               'sources': [
                   {'id': 'SCB_TAB6684', 'title': 'SCB (2026). Ekonomisk standard, andel av befolkningen per inkomstklass efter region. TAB6684.',
                    'url': 'https://www.statistikdatabasen.scb.se/pxweb/sv/ssd/START__HE__HE0110__HE0110I/Tab3InkDesoRegso/',
                    'dataYear': 2024, 'status': 'cached_observations' if income else 'not_downloaded'},
                   {'id': 'OSM_ACCESS', 'title': 'OpenStreetMap contributors. Geografiska punkter för dagligvaruhandel och kollektivtrafiknoder.',
                    'url': 'https://wiki.openstreetmap.org/wiki/Overpass_API', 'dataYear': None,
                    'status': 'cached_observations' if pois_path.exists() else 'not_downloaded', 'license': 'ODbL 1.0'},
                   {'id': 'OSM_ROADS', 'title': 'OpenStreetMap contributors (2026). Paketets bostadsgatunät, hämtat i oktober 2026.',
                    'url': 'https://www.openstreetmap.org/copyright', 'dataYear': 2026, 'status': 'spatial_proxy', 'license': 'ODbL 1.0'},
                   {'id': 'SCB_TAB6589_6568', 'title': 'SCB och Trafikanalys. Registerbilar och hushåll 2024 per DeSO 2025.',
                    'url': 'https://www.scb.se/deso', 'dataYear': 2024, 'status': 'bundled_register'},
                   {'id': 'CENTRE_CHOICE', 'title': 'Vägvis: valda centrumreferenser vid Stortorget i varje stad, avrundade koordinater.',
                    'url': None, 'dataYear': None, 'status': 'model_choice'}],
               'caveats': [
                   'Saknade värden är null och ska ge neutralt bidrag, inte antagen inkomst eller ett påhittat avstånd.',
                   'Bostadsgatulängd används som rumslig fördelningsproxy. Trettio längdkvantiler per DeSO; ingen faktisk befolknings- eller byggnadsviktning.',
                   'Där bostadsgator saknas används unclassified-vägar endast om sådana finns, med uttrycklig originMethod. Saknas båda lämnas geografiska indikatorer tomma.',
                   'Fågelväg tar inte hänsyn till barriärer, gångpassager, restider, turtäthet eller destinationernas kvalitet.',
                   'OSM-geometri från 2026 överförs till beräkningsåret 2024. Ingen automatisk historisk rekonstruktion har gjorts.',
                   'OSM-täckning är inte verifierad fullständig. En kartpunkt bevisar varken öppethållande 2024 eller fungerande kollektivtrafikutbud.',
                   'Centrumreferenserna är dokumenterade modellval; de är inte officiella centrumgränser.',
                   'Inkomstdefinition i SCB måste harmoniseras med eventuell RVU innan koefficienter skattas.',
                   'Indikatorerna innehåller inga empiriskt skattade koefficienter för årssträcka per bil.'],
               'inputFiles': [sha(p) for p in inputs]}}
    # Validate every output before replacing the last usable file.
    assert len(rows) == len(expected) and {r['kod'] for r in rows} == expected
    for r in rows:
        for key in coverage:
            assert r[key] is None or (math.isfinite(r[key]) and r[key] >= 0)
    atomic_json(STORE/'originpunkter.json', {'schema': 'vagvis-origin-samples-1', 'sourceYear': 2026, 'rows': samples})
    atomic_json(DATA/'distance-indicators.json', obj)
    print(json.dumps({'output': str(DATA/'distance-indicators.json'), 'coverage': coverage, 'coverageByCity': by_city}, ensure_ascii=False))
    return obj


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    build()
