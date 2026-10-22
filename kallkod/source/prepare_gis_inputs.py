"""Read the supplied zipped polygon shapefiles without third-party packages.

SWEREF99 TM / local TM -> geographic SWEREF99 using inverse Transverse Mercator
series (GRS80), then geographic lon/lat for municipal screening. No epoch-based
SWEREF99 to dynamic WGS84 deformation is applied; sub-metre datum differences
are below the intended screening resolution. Original PRJ strings are retained.
Projection parameters are parsed from each file, never inferred from filename.
Lantmäteriet projection documentation:
https://www.lantmateriet.se/sv/geodata/gps-geodesi-och-swepos/Referenssystem/Tvadimensionella-system/SWEREF-99-projektioner/
"""
from __future__ import annotations
import argparse,collections,hashlib,json,math,pathlib,re,struct,zipfile


def parameters(wkt):
    if 'Transverse_Mercator' not in wkt or 'GRS_1980' not in wkt:
        raise ValueError('Only documented GRS80 Transverse Mercator files are supported.')
    p={k:float(v) for k,v in re.findall(r'PARAMETER\["([^"]+)",([\d.\-eE+]+)\]',wkt)}
    for k in ['False_Easting','False_Northing','Central_Meridian','Scale_Factor','Latitude_Of_Origin']:
        if k not in p:raise ValueError('Projection parameter missing: '+k)
    if p['Latitude_Of_Origin']!=0:raise ValueError('Nonzero latitude of origin not supported.')
    return p


def inverse(east,north,p):
    a=6378137.;f=1/298.257222101;e2=f*(2-f);ep2=e2/(1-e2);k=p['Scale_Factor']
    x=east-p['False_Easting'];m=(north-p['False_Northing'])/k
    mu=m/(a*(1-e2/4-3*e2**2/64-5*e2**3/256))
    e1=(1-math.sqrt(1-e2))/(1+math.sqrt(1-e2))
    fp=mu+(3*e1/2-27*e1**3/32)*math.sin(2*mu)+(21*e1**2/16-55*e1**4/32)*math.sin(4*mu)+151*e1**3/96*math.sin(6*mu)+1097*e1**4/512*math.sin(8*mu)
    n=a/math.sqrt(1-e2*math.sin(fp)**2);r=a*(1-e2)/(1-e2*math.sin(fp)**2)**1.5
    t=math.tan(fp)**2;c=ep2*math.cos(fp)**2;d=x/(n*k)
    lat=fp-n*math.tan(fp)/r*(d*d/2-(5+3*t+10*c-4*c*c-9*ep2)*d**4/24+(61+90*t+298*c+45*t*t-252*ep2-3*c*c)*d**6/720)
    lon=math.radians(p['Central_Meridian'])+(d-(1+2*t+c)*d**3/6+(5-2*c+28*t-3*c*c+8*ep2+24*t*t)*d**5/120)/math.cos(fp)
    return [math.degrees(lon),math.degrees(lat)]


def forward(lon,lat,p):
    a=6378137.;f=1/298.257222101;e2=f*(2-f);ep2=e2/(1-e2);k=p['Scale_Factor']
    phi=math.radians(lat);lam=math.radians(lon);n=a/math.sqrt(1-e2*math.sin(phi)**2)
    t=math.tan(phi)**2;c=ep2*math.cos(phi)**2;aa=math.cos(phi)*(lam-math.radians(p['Central_Meridian']))
    m=a*((1-e2/4-3*e2**2/64-5*e2**3/256)*phi-(3*e2/8+3*e2**2/32+45*e2**3/1024)*math.sin(2*phi)+(15*e2**2/256+45*e2**3/1024)*math.sin(4*phi)-35*e2**3/3072*math.sin(6*phi))
    east=p['False_Easting']+k*n*(aa+(1-t+c)*aa**3/6+(5-18*t+t*t+72*c-58*ep2)*aa**5/120)
    north=p['False_Northing']+k*(m+n*math.tan(phi)*(aa*aa/2+(5-t+9*c+4*c*c)*aa**4/24+(61-58*t+t*t+600*c-330*ep2)*aa**6/720))
    return east,north


def dbf(data,encoding):
    n=struct.unpack_from('<I',data,4)[0];head,width=struct.unpack_from('<HH',data,8)
    fields=[]
    for pos in range(32,head-1,32):
        if data[pos]==13:break
        b=data[pos:pos+32];fields.append((b[:11].split(b'\0')[0].decode('ascii'),chr(b[11]),b[16],b[17]))
    if 1+sum(f[2] for f in fields)!=width:raise ValueError('DBF record width inconsistent.')
    rows=[]
    for i in range(n):
        b=data[head+i*width:head+(i+1)*width]
        if len(b)!=width or b[:1]==b'*':raise ValueError('Missing or deleted DBF record; explicit repair needed.')
        offset=1;row={}
        for name,typ,size,dec in fields:
            value=b[offset:offset+size].decode(encoding).strip();offset+=size;row[name]=value
        rows.append(row)
    return rows,fields


def shp(data):
    if struct.unpack_from('>i',data,0)[0]!=9994 or struct.unpack_from('>i',data,24)[0]*2!=len(data):raise ValueError('Invalid shapefile header/size.')
    records=[];offset=100
    while offset<len(data):
        number,words=struct.unpack_from('>ii',data,offset);offset+=8;b=data[offset:offset+words*2];offset+=words*2
        typ=struct.unpack_from('<i',b,0)[0]
        if typ not in [5,15,25]:raise ValueError('Expected polygon, got shape '+str(typ))
        nr,np=struct.unpack_from('<ii',b,36);parts=struct.unpack_from('<'+str(nr)+'i',b,44);coords=[struct.unpack_from('<dd',b,44+4*nr+16*i) for i in range(np)]
        rings=[coords[start:(parts[i+1] if i+1<nr else np)] for i,start in enumerate(parts)]
        if any(len(r)<4 or r[0]!=r[-1] for r in rings):raise ValueError('Unclosed or degenerate polygon ring.')
        records.append(rings)
    return records


def area(r):return sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(r,r[1:]))/2
def inside(point,ring):
    x,y=point;yes=False
    for a,b in zip(ring,ring[1:]):
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:yes=not yes
    return yes


def group_rings(rings):
    order=sorted(range(len(rings)),key=lambda i:abs(area(rings[i])),reverse=True);parent={};depth={};poly={}
    for index,i in enumerate(order):
        candidates=[j for j in order[:index] if inside(rings[i][0],rings[j])]
        par=min(candidates,key=lambda j:abs(area(rings[j]))) if candidates else None
        parent[i]=par;depth[i]=0 if par is None else depth[par]+1
        if depth[i]%2==0:poly[i]=[rings[i]]
        else:poly[par].append(rings[i])
    return list(poly.values())


def load_file(path,city):
    with zipfile.ZipFile(path) as z:
        names=z.namelist()
        member=lambda ext:next(n for n in names if n.lower().endswith('.'+ext))
        wkt=z.read(member('prj')).decode('utf-8');p=parameters(wkt)
        cpg=z.read(member('cpg')).decode('ascii').strip();encoding='utf-8' if cpg.upper() in ['UTF-8','UTF8','65001'] else cpg
        rows,fields=dbf(z.read(member('dbf')),encoding);geometries=shp(z.read(member('shp')))
    if len(rows)!=len(geometries):raise ValueError('DBF and SHP counts differ.')
    features=[];roundtrip=0;projected_area=0;points=[];raw_ids=[]
    for row,rings in zip(rows,geometries):
        lower={k.lower():v for k,v in row.items()};code=lower['desokod']
        if not code.startswith(city) or lower['kommunkod']!=city:raise ValueError('Wrong municipality.')
        raw_ids.append(code);polys=group_rings(rings);converted=[]
        for polygon in polys:
            converted_polygon=[]
            for j,ring in enumerate(polygon):
                projected_area+=abs(area(ring))*(1 if j==0 else -1)
                cr=[]
                for x,y in ring:
                    lon,lat=inverse(x,y,p)
                    if not (12<lon<14.5 and 55<lat<57):raise ValueError('Transformed coordinate outside expected southern Sweden.')
                    xx,yy=forward(lon,lat,p);roundtrip=max(roundtrip,math.hypot(xx-x,yy-y));cr.append([round(lon,8),round(lat,8)]);points.append([lon,lat])
                converted_polygon.append(cr)
            converted.append(converted_polygon)
        geom={'type':'Polygon','coordinates':converted[0]} if len(converted)==1 else {'type':'MultiPolygon','coordinates':converted}
        features.append({'type':'Feature','properties':{'id':code,'name':code,'city':city,'version':'2025','sourceVersion':lower.get('version'),'regso':lower.get('regsokod'),'referenceDate':lower.get('referensda'),'sourceFile':path.name},'geometry':geom})
    if len(raw_ids)!=len(set(raw_ids)):raise ValueError('Duplicate DeSO codes.')
    report={'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'city':city,'count':len(features),'fields':[x[0] for x in fields],'sourceCRS':wkt,'projectionParameters':p,'roundTripMaxMetres':roundtrip,'areaKm2Projected':projected_area/1e6,'coordinateCount':len(points),'versions':dict(collections.Counter(f['properties']['sourceVersion'] for f in features)),'bboxLonLat':[min(x[0] for x in points),min(x[1] for x in points),max(x[0] for x in points),max(x[1] for x in points)]}
    return {'type':'FeatureCollection','features':features},report


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--input',type=pathlib.Path,required=True);parser.add_argument('--output',type=pathlib.Path,required=True);args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    reports=[];all_features=[]
    for file,city in [('DESO_2025_Malmo.zip','1280'),('Deso2025HelsingborgsKommun.zip','1283')]:
        fc,report=load_file(args.input/file,city);reports.append(report);all_features.extend(fc['features']);(args.output/('DeSO_2025_'+city+'.geojson')).write_text(json.dumps(fc,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (args.output/'DeSO_2025_bada_kommunerna.geojson').write_text(json.dumps({'type':'FeatureCollection','features':all_features},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    with zipfile.ZipFile(args.input/'bilmodell_netlify_v6_intern.zip') as z:
        raw=z.read('geo.js').decode('utf-8');old=json.loads(raw[raw.index('{'):].strip().rstrip(';'))
        oldmeta=z.read('data.js').decode('utf-8').split('window.MODELL_META = ',1)[1].split(';',1)[0];meta=json.loads(oldmeta)
    districts=[];old_comparison={}
    for city,value in old['kommuner'].items():
        for i,f in enumerate(value['sd']['features']):
            districts.append({'type':'Feature','geometry':f['geometry'],'properties':{'id':'MODEL-v6-'+city+'-'+str(i+1).zfill(2),'name':f['properties']['sd'],'city':city,'version':'bilmodell v6, harledd fran DeSO 2018','sourceFile':'bilmodell_netlify_v6_intern.zip','officialMunicipalSubdivision':False}})
        old_comparison[city]={'oldDeSOCount':len(value['deso']['features']),'districtCount':len(value['sd']['features']),'sourceClaim':value.get('kalla'),'residentDataYear':meta['referensar'],'residentDataGeography':meta['geografi']}
    (args.output/'Stadsdelsomraden_bilmodell_v6.geojson').write_text(json.dumps({'type':'FeatureCollection','features':districts},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    report={'files':reports,'previousModel':old_comparison,'interpretation':['Raw DeSO 2025 boundaries are used as supplied; no reconstruction to 2018.','Districts are the 12 Malmö and 10 Helsingborg groupings from the supplied v6 model. They are NOT confirmed municipal current administrative areas.','Resident household kilometre estimates from v6 are not imported as territorial road traffic.','No road-link geometry or observed flow fields in these two DeSO shapefiles.']}
    (args.output/'GIS_kontroll.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=='__main__':main()
