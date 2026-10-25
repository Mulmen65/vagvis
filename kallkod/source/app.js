/* Vägvis 2.2.2 interface. Every displayed result is produced by the current
   independent engines and current project; no historical result is a fallback. */
(function () {
  'use strict';
  const V = window.Vagvis, H = window.VagvisHouseholds, S = window.VagvisScenarios;
  const E = window.VagvisEvidence, M = window.VagvisMaps;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const read = (id, fallback) => { const node = $(id); return node && node.textContent.trim() ? JSON.parse(node.textContent) : fallback; };
  const number = (n, digits = 0) => Number.isFinite(n) ? new Intl.NumberFormat('sv-SE', {maximumFractionDigits:digits}).format(n) : '–';
  const labels = {ttw:'Direkta avgasutsläpp (TTW)',wtt:'Energi i tidigare led',vehicle:'Fordonstillverkning',battery:'Batteritillverkning',maintenance:'Underhåll',endoflife:'Slutbehandling'};
  const titles = {overview:'Översikt',map:'Karta & områden',calc:'Så räknas resultatet',parameters:'Parametrar',measures:'Åtgärder',control:'Kontroll & kvalitet',data:'Data & underlag',method:'Metod & källor'};
  const descriptions = {overview:'Årlig klimatpåverkan, från aktivitet till livscykel.',map:'Utforska DeSO och RegSO med samma beräkningsgräns.',calc:'Följ indata, trafikarbete och utsläppskomponenter för ett område.',parameters:'Redigera värden och granska antagandenas betydelse.',measures:'Pröva öppet redovisade scenarier för hushållens personbilar.',control:'Kontrollera summering, underlag och tolkning.',data:'Projektfiler, källstatus och vägar till bättre indata.',method:'Fristående beräkningsbeskrivning med aktuella parametrar och källor.'};
  if (!V || !H || !S) { $('view').innerHTML = '<article class="card"><h2>Beräkningsmoduler saknas</h2><p>Ladda det kompletta Vägvis-paketet.</p></article>'; return; }
  const omraden = read('embedded-omraden', null);
  const projects = {territorial:V.unpackProject(read('embedded-project', V.emptyProject()),omraden),household:V.unpackProject(read('embedded-household-project', {...V.emptyProject(),model:'household',d:[]}),omraden)};
  const shared = read('embedded-config', {});
  const state = {};
  for (const model of ['territorial','household']) {
    const project = projects[model]; project.model = model;
    const cfg = V.config(project.config || shared);
    if (model === 'household') {
      cfg.household = {...{kmPerCar:12753},...cfg.household,uncertainty:{...H.DEFAULTS.uncertainty,...cfg.household?.uncertainty}};
      cfg.areaScenario = cfg.areaScenario || S.initialState();
    }
    state[model] = {project,cfg,result:null,dirty:true};
  }
  const ytor = read('embedded-ytor',{});
  let model = read('embedded-mode','territorial'); if (!state[model]) model = 'territorial';
  let city = state[model].project.cities?.[0]?.id || '1280';
  let view = 'overview', level = 'deso', selected = null, period = 'base', metric = 'total', search = '';
  let busy = false, cancelled = false, calculationToken = 0, registerController = null;
  const active = () => state[model];
  const rows = () => active().result?.results || [];
  const cityName = () => active().project.cities?.find(x=>x.id===city)?.name || city;
  const householdRows = () => active().project.d || active().project.households || [];
  const kmText = () => { const rs=isB()?householdRows():[], c=active().cfg; if(!rs.length) return 'riksmedelvärdet '+number(c.household?.kmPerCar)+' km'; const lv=new Set(rs.map(r=>H.kmLevel(r,c))); return lv.size===1&&lv.has('deso')?'uppmätt per DeSO (SCB, mätarställningar vid besiktning)':lv.has('deso')?'uppmätt per DeSO (SCB) där värden finns, annars kommunens eller rikets värde':lv.has('kommun')?'kommunens värde enligt SCB:s körsträckedata (RUS), samma för alla DeSO i kommunen':'riksmedelvärdet '+number(c.household.kmPerCar)+' km för alla DeSO'; };
  const statusLabels = {observed_register:'Observerat SCB-register',spatial_model_assumption:'Modellerad områdesfördelning',model_assumption:'Modellantagande',transferred_assumption:'Överfört medelvärde',user_scenario:'Eget användarscenario',mixed:'Blandad källstatus',derived_mixed:'Härlett från olika källstatus',unverified:'Ej verifierat'};
  const statusFor = (row,field,project=active().project) => row?.[field+'Status'] || project.metadata?.fieldStatuses?.[field] || (project.metadata?.dataStatus==='observed_register'?'observed_register':row?.status||'unverified');
  const fieldStatus = (field,rs=householdRows(),project=active().project) => {const statuses=new Set(rs.map(r=>statusFor(r,field,project)));return statuses.size===1?[...statuses][0]:'mixed';};
  const statusLabel = status => statusLabels[status]||status;
  const areaInfo = row => ytor[model==='household'?'B':'A']?.[row.key] || ytor.A?.[row.key] || null;
  const rowFor = key => rows().find(x=>x.key===key);
  const central = row => period === 'scenario' ? row?.scenarioCentral : row?.central;
  const value = row => {
    const c = central(row); if (!c) return null;
    let v = period==='difference' ? (row.scenarioCentral?.total ?? 0) - (row.central?.total ?? 0) : c.total;
    if (metric==='perHa') { const a=areaInfo(row); v = a?.landHa>0 ? v/a.landHa : null; }
    if (metric==='perHousehold') v = c.households>0 ? v/c.households : null;
    if (metric==='perPerson') v = c.population>0 ? v/c.population : null;
    return v;
  };
  const interval = stats => stats ? number(stats.p025,1)+'–'+number(stats.p975,1) : '–';
  const isB = () => model === 'household';
  const notice = text => '<div class="notice info">'+text+'</div>';
  const table = (heads, body, cls='') => '<div class="table-wrap '+cls+'"><table><thead><tr>'+heads.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table></div>';
  const button = (text,attrs='',cls='secondary') => '<button class="'+cls+'" '+attrs+'>'+text+'</button>';
  const option = (value,label,current) => '<option value="'+esc(value)+'"'+(String(value)===String(current)?' selected':'')+'>'+esc(label)+'</option>';
  const field = (label,path,value,{step='any',min='',max='',scale=1,unit='',scope='cfg'}={}) => '<label class="field">'+esc(label)+'<input class="input" type="number" data-edit="'+esc(path)+'" data-scope="'+scope+'" data-scale="'+scale+'" value="'+(Number.isFinite(value)?value*scale:'')+'" step="'+step+'" min="'+min+'" max="'+max+'">'+(unit?'<small>'+esc(unit)+'</small>':'')+'</label>';
  const selectedOptions = () => rows().filter(x=>x.city===city).sort((a,b)=>a.level.localeCompare(b.level)||a.name.localeCompare(b.name,'sv')).map(x=>option(x.key,(x.level==='city'?'Kommun':x.level==='district'?'RegSO':'DeSO')+' · '+x.name,selected)).join('');
  function setMessage(text,error=false) { $('message').textContent=text; $('message').className=error?'notice error':'notice info'; }
  function markDirty() { active().dirty=true; $('dirty-banner').hidden=false; $('data-status').textContent='Ändrade indata'; $('export').disabled=true; }
  function sync() {
    for (const node of document.querySelectorAll('[data-model]')) node.classList.toggle('active',node.dataset.model===model);
    for (const node of document.querySelectorAll('.nav[data-view]')) node.classList.toggle('active',node.dataset.view===view);
    for (const node of document.querySelectorAll('[data-only]')) node.hidden=node.dataset.only!==model;
    $('city').innerHTML=(active().project.cities||[]).map(c=>button(esc(c.name),'data-city="'+esc(c.id)+'"',c.id===city?'active':'')).join('');
    $('active-model-label').textContent=isB()?'Hushållens personbilar':'Vägtrafik inom området';
    $('eyebrow').textContent='VÄGVIS 2.2.2 · '+(isB()?'MODELL B':'MODELL A')+' · '+cityName().toUpperCase();
    $('page-title').textContent=titles[view]; $('page-description').textContent=descriptions[view];
    $('dirty-banner').hidden=!active().dirty; $('run').disabled=busy; $('export').disabled=busy || !active().result || active().dirty;
    $('data-status').textContent=busy?'Beräknar…':active().dirty?'Ändrade indata':active().result?'Beräknat '+active().cfg.year:'Ej beräknat';
    $('scope-footer').textContent=isB()?'B · hushållsanknutna personbilar, även körning utanför hemkommunen.':'A · vägtrafik som sker inom geografisk yta. Alla fordonsklasser.';
  }
  function render() {
    if (M) M.dispose();
    if (!rows().some(x=>x.key===selected)) selected='city|'+city;
    sync();
    const methods={overview:overviewView,map:mapView,calc:calcView,parameters:parametersView,measures:measuresView,control:controlView,data:dataView,method:methodView};
    try { $('view').innerHTML=methods[view](); if(view==='map') drawMap(); }
    catch(error) { $('view').innerHTML='<article class="card"><h2>Vyn kunde inte visas</h2><p>'+esc(error.message)+'</p></article>'; console.error(error); }
  }
  const notCalculated = () => notice('Beräkningen körs med aktuella indata. Om inget resultat finns, välj ”Beräkna med osäkerhet”.');
  function scopeNotice() {
    if(isB()) {
      const status=active().project.metadata?.dataStatus;
      if(status==='observed_register')return notice('<strong>SCB-registerunderlag:</strong> hushåll (TAB6568), folkmängd (TAB6574) och personbilar i trafik (TAB6589) per DeSO, alla för 31 december 2024 och DeSO 2025. Årlig körsträcka: '+esc(kmText())+'. Fordonsmix och LCA-faktorer har egna källor eller antaganden. Registerbilar beskriver inte var körningen sker. A och B ska inte summeras.');
      if(status==='register_cars_partial')return notice('<strong>Bilregistret är inläst:</strong> registrerade personbilar per DeSO för 2024 ingår direkt i paketet och kan användas utan API-hämtning. Hushåll och befolkning per DeSO har fortfarande modellerad områdesfördelning. Årlig körsträcka: '+esc(kmText())+'. Fordonsmix, LCA och åtgärdseffekter har egna källor eller antaganden. Körningen kan ske utanför hemområdet. A och B ska inte summeras.');
      if(status==='user_scenario')return notice('<strong>Eget användarscenario:</strong> ändrade fält är märkta som användarantaganden. Oförändrade registerfält behåller sin källstatus. Bilantal: '+esc(statusLabel(fieldStatus('bil')))+'; hushåll: '+esc(statusLabel(fieldStatus('hh')))+'; befolkning: '+esc(statusLabel(fieldStatus('bef')))+'. Körsträcka och LCA har separata antaganden. A och B ska inte summeras.');
      return notice('<strong>Granska fälten var för sig:</strong> bilantal: '+esc(statusLabel(fieldStatus('bil')))+'; hushåll: '+esc(statusLabel(fieldStatus('hh')))+'; befolkning: '+esc(statusLabel(fieldStatus('bef')))+'. Årlig körsträcka, fordonsmix och LCA har separata antaganden. Körningen kan ske var som helst. A och B ska inte summeras.');
    }
    return notice(active().cfg.mode==='calibrated'?'<strong>Kalibrerat grundfall:</strong> kommunens direktutsläpp motsvarar kommunal eller officiell statistik för 2024. Uppmätt ÅDT används där dokumenterat länkflöde finns (Öresundsbron) och skalas inte. Övriga länkar har vägklassantaganden som skalas per kommun, så fördelningen mellan områden är en screening. OpenStreetMap ger väggeometri och vägklass, inte trafikmängd.':'<strong>Okalibrerad nätschablon:</strong> trafikarbetet bygger på vägklassantaganden utan kommunal förankring. Läget används för validering och känslighetsanalys; för Gävle blir direktutsläppen ungefär dubbelt så höga som officiell statistik.');
  }
  function components(c) {
    if(!c)return '<p>Beräkningsunderlag saknas.</p>';
    const max=Math.max(...V.KEYS.map(k=>c[k]||0),1);
    return V.KEYS.map(k=>'<div class="component-row"><span>'+labels[k]+'</span><div class="track"><div class="fill" style="width:'+Math.max(0,(c[k]||0)/max*100)+'%"></div></div><b>'+number(c[k],1)+' t</b></div>').join('')+'<div class="component-total"><span>Summa livscykel</span><strong>'+number(c.total,1)+' t CO₂e</strong></div><p class="small">Elproduktion är en del av energi i tidigare led. Drift inklusive elproduktion är en överlappande detaljpost och läggs inte till summan. Biogen CO₂ och återvinningspotential redovisas separat.</p>';
  }
  function overviewView() {
    const r=rowFor('city|'+city), b=r?.central, sc=r?.scenarioCentral;
    if(!b)return scopeNotice()+notCalculated();
    const diff=sc?sc.total-b.total:0;
    return scopeNotice()+'<section class="kpis"><article class="card kpi-main"><div class="kpi-label">Livscykel · basfall</div><div class="kpi-value">'+number(b.total/1000,1)+' <small>kt CO₂e</small></div><div class="kpi-foot">Modellintervall 95 %: '+number(r.base?.p025/1000,1)+'–'+number(r.base?.p975/1000,1)+' kt</div></article><article class="card kpi"><div class="kpi-label">Trafikarbete</div><div class="kpi-value">'+number(b.vkm/1e6,1)+' <small>milj. km</small></div><div class="kpi-foot">'+(isB()?number(b.cars)+' bilar · '+statusLabel(fieldStatus('bil',householdRows().filter(x=>x.kk===city))):'Väglängd × ÅDT × '+V.days(active().cfg.year)+' dagar')+'</div></article><article class="card kpi"><div class="kpi-label">Scenario · skillnad</div><div class="kpi-value">'+(diff>0?'+':'')+number(diff/1000,1)+' <small>kt CO₂e</small></div><div class="kpi-foot">'+number(b.total?diff/b.total*100:0,1)+' % · jämfört med basfallet</div></article></section><div class="grid2"><article class="card"><h2>Livscykelns delar</h2>'+components(b)+'</article><article class="card"><h2>Basfall och scenario</h2>'+table(['Storhet','Basfall','Scenario'],[['Livscykel, t CO₂e',b.total,sc?.total],['Direkta avgaser, t CO₂e',b.ttw,sc?.ttw],['Drift inkl. elproduktion, t CO₂e',b.direct,sc?.direct],['Elproduktion, t CO₂e',b.electricity,sc?.electricity],['Fordonskilometer',b.vkm,sc?.vkm],...(isB()?[['Hushåll',b.households,sc?.households],['Bilar',b.cars,sc?.cars]]:[])].map(a=>'<tr><td>'+a[0]+'</td><td class="numeric">'+number(a[1],1)+'</td><td class="numeric">'+number(a[2],1)+'</td></tr>').join(''))+'<p>Modellintervallen beskriver variation under valda antaganden. De är inte heltäckande statistiska konfidensintervall.</p>'+button('Utforska områden →','data-view="map"')+'</article></div>'+evidenceSummary();
  }
  function mapView() {
    return '<article class="card"><div class="table-tools"><div class="toggle">'+button('DeSO','data-level="deso"',level==='deso'?'active':'')+button('RegSO','data-level="district"',level==='district'?'active':'')+'</div><label>Visning <select id="map-period">'+option('base','Basfall',period)+option('scenario','Scenario',period)+option('difference','Scenario − basfall',period)+'</select></label><label>Nyckeltal <select id="map-metric">'+option('total','t CO₂e per år',metric)+option('perHa','t CO₂e per hektar land',metric)+(isB()?option('perHousehold','t CO₂e per hushåll'+(fieldStatus('hh')==='observed_register'?'':' (modell)'),metric)+option('perPerson','t CO₂e per befintlig invånare'+(fieldStatus('bef')==='observed_register'?'':' (modell)'),metric):'')+'</select></label></div><div class="map-layout"><div><div class="button-row map-options"><label><input id="map-osm" type="checkbox" checked> OpenStreetMap</label><label><input id="map-roads" type="checkbox"> Vägar</label>'+button('Hela kommunen','id="map-fit"','ghost')+'</div><div id="map-surface" class="map-surface"></div><p id="map-status" class="small"></p></div><aside id="area-detail" class="area-detail">'+areaDetail(rowFor(selected))+'</aside></div></article><article class="card"><div class="table-tools"><h2>Områdesresultat</h2><input id="area-search" class="input" placeholder="Sök område" value="'+esc(search)+'"></div><div id="area-table">'+areaTable()+'</div></article>';
  }
  function areaTable() {
    const rs=rows().filter(r=>r.city===city&&r.level===level&&(!search||(r.name+' '+r.id).toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>(value(b)??-Infinity)-(value(a)??-Infinity));
    return table(['Område','Basfall t CO₂e','Scenario t CO₂e','95 % modellintervall','Valt nyckeltal'],rs.map(r=>'<tr data-area="'+esc(r.key)+'" tabindex="0"><td>'+button(esc(r.name),'data-area="'+esc(r.key)+'"','ghost')+'<small>'+esc(r.id)+'</small></td><td class="numeric">'+number(r.central?.total,1)+'</td><td class="numeric">'+number(r.scenarioCentral?.total,1)+'</td><td>'+interval(r.base)+'</td><td class="numeric">'+number(value(r),2)+'</td></tr>').join('')||'<tr><td colspan="5">Inga områdesresultat finns.</td></tr>');
  }
  function areaDetail(r) {
    if(!r)return '<h3>Välj ett område</h3><p>Klicka i kartan eller områdestabellen.</p>';
    const c=central(r); const sourceRow=isB()?householdRows().find(x=>x.kod===r.id):null; const zeroProxy=sourceRow&&['spatial_model_assumption','model_assumption'].includes(statusFor(sourceRow,'hh'))&&(sourceRow.proxyWeight===0||sourceRow.hh===0); return '<h3>'+esc(r.name)+'</h3><p class="small">'+esc(r.id)+' · '+(r.level==='district'?'RegSO':r.level==='city'?'Kommun':'DeSO')+'</p><div class="duo"><div><b class="big">'+number(c?.total,1)+'</b><span>t CO₂e per år</span></div><div><b class="big">'+number(c?.vkm/1000)+'</b><span>tusen fordonskilometer</span></div></div>'+(zeroProxy?notice('Proxyvikten för hushåll och befolkning är noll. Detta är inte observerade nolltal. '+number(sourceRow.bil)+' '+(statusFor(sourceRow,'bil')==='observed_register'?'registrerade bilar':'bilar i valt underlag')+' ingår i utsläppsberäkningen. Kvoter per hushåll och invånare beräknas inte när nämnaren saknas.'):'')+'<p>Basfallets modellintervall: '+interval(r.base)+' t CO₂e.</p>'+button('Så räknas området →','data-calc="'+esc(r.key)+'"')+'<p class="small">'+(isB()?'Hushållens samlade bilkörning, oavsett var den sker.':'Trafikarbete inom ytan. Länkar utan mätvärden använder schabloner.')+'</p>';
  }
  function drawMap() {
    if(!M)return;
    const local=rows().filter(r=>r.city===city&&r.level===level), max=Math.max(...local.map(r=>Math.abs(value(r)||0)),1), byId=new Map(local.map(r=>[r.id,r]));
    M.draw({project:active().project,city,level,result:active().result,onSelect:id=>selectArea(level+'|'+city+'|'+id),fill:id=>{const n=value(byId.get(id));return n==null?'#d9dfd9':period==='difference'&&n>0?'#bc6b4e':M.color(Math.abs(n),max);},tooltip:id=>{const r=byId.get(id);return esc(r?.name||id)+' · '+number(value(r),2);},attribution:'© OpenStreetMap contributors · SCB DeSO/RegSO 2025'});
    const r=rowFor(selected); if(r?.level===level)M.select(r.id);
  }
  function selectArea(key) { selected=key; const r=rowFor(key); if($('area-detail'))$('area-detail').innerHTML=areaDetail(r); if(r&&M)M.select(r.id); }
  function calcView() {
    const r=rowFor(selected)||rowFor('city|'+city), c=r?.central, sc=r?.scenarioCentral;
    let html='<article class="card"><div class="table-tools"><label class="calc-pick">Beräkningsområde <select id="calc-area">'+selectedOptions()+'</select></label>'+button('Visa på kartan','data-view="map"')+'</div>';
    if(!c)return html+notCalculated()+'</article>';
    const cells=V.KEYS.map(k=>'<tr><td>'+labels[k]+'</td><td class="numeric">'+number(c[k],2)+'</td><td class="numeric">'+number(c.vkm?c[k]*1e6/c.vkm:null,2)+'</td><td class="numeric">'+number(sc?.[k],2)+'</td></tr>').join('');
    html+='<h2>'+esc(r.name)+'</h2><div class="calc-tiles"><div><b>'+number(c.total,1)+'</b><span>t CO₂e, basfall</span></div><div><b>'+number(c.vkm)+'</b><span>fordonskilometer</span></div><div><b>'+number(c.vkm?c.total*1e6/c.vkm:null,1)+'</b><span>g CO₂e / fordonskm</span></div><div><b>'+number(sc?.total,1)+'</b><span>t CO₂e, scenario</span></div></div>';
    if(isB()) {
      const rs=householdRows().filter(x=>x.kk===city&&(r.level==='city'||(r.level==='deso'?x.kod===r.id:x.sd===r.id)));
      html+='<div class="calc-step"><span class="calc-n">1</span><div class="calc-body"><h3>Antal bilar och årlig körsträcka</h3><p>Basfallet beräknas som summan av bilar i det valda hushållsunderlaget gånger körsträckan per bil. Bilantalet kommer från SCB:s registeruttag för 2024. Körsträckan är '+esc(kmText())+'. Inget avstånd till centrum eller annan schablon för läge används. Efter egna ändringar visar tabellen status för varje fält.</p><p class="calc-formula">V = Σ (Pᵢ × Kᵢ) = '+number(c.vkm)+' fordonskm/år</p>'+table(['DeSO','Hushåll','Hushållens källstatus','Bilar','Bilarnas källstatus','Bilar/hushåll','km per bil och år'],rs.slice(0,100).map(x=>'<tr><td>'+esc(x.kod)+'</td><td class="numeric">'+number(x.hh)+'</td><td>'+esc(statusLabel(statusFor(x,'hh')))+'</td><td class="numeric">'+number(x.bil,1)+'</td><td>'+esc(statusLabel(statusFor(x,'bil')))+'</td><td class="numeric">'+number(x.hh>0?x.bil/x.hh:null,3)+'</td><td class="numeric">'+number(H.kmOf(x,active().cfg))+'<small>'+({deso:'Uppmätt i DeSO (SCB)',kommun:'Kommunvärde (SCB/RUS)',riket:'Riksmedelvärde'})[H.kmLevel(x,active().cfg)]+'</small></td></tr>').join(''))+(rs.length>100?'<p class="small">De första 100 raderna visas. Fullständiga indata finns i projektfilen.</p>':'')+'</div></div>';
      const fx=S.effects(active().cfg.areaScenario||{});
      html+='<div class="calc-step"><span class="calc-n">2</span><div class="calc-body"><h3>Scenariot beräknas separat</h3><p>Åtgärdernas faktor för hela trafikarbetet är '+number(fx.fVkm,4)+'. Bilfaktorn '+number(fx.fCars,4)+' redovisar bilinnehav och multipliceras inte en andra gång med trafikarbetet. Energifaktorn '+number(fx.fEnergy,4)+' påverkar driftens energikedja. Åtgärderna tillämpas på alla hushåll i projektet. Omfattning avser den andel som berörs i varje kommun, inte en markering av ett enskilt DeSO.</p></div></div>';
    } else {
      let detail; try { detail=V.explain(active().result,r.key); } catch(_) { detail=null; }
      html+='<div class="calc-step"><span class="calc-n">1</span><div class="calc-body"><h3>Trafikarbete på vägavsnitten</h3><p class="calc-formula">V = Σ (länklängd i km × ÅDT × '+V.days(active().cfg.year)+' dagar × fordonsandel)</p><p>Vägens del inom området används. Mätår, körriktning, ÅDT-omräkning och källstatus måste följa vägposten. En vägklasschablon innebär en uppskattad trafikvolym.</p>'+(detail?(Object.keys(detail.calibration||{}).length?'<p>Kalibrering: '+Object.entries(detail.calibration).map(([k,v])=>'antagen trafik × '+number(v.scale,3)+' så att kommunens direktutsläpp blir '+number(v.target/1000,1)+' kt CO₂e (uppmätt '+number(v.measured/1000,1)+' kt skalas inte)').join('; ')+'.</p>':'<p>Okalibrerat läge: schablonflödena används utan kommunal förankring.</p>')+table(['Vägklass','Trafikmiljö','Källstatus','km i området','Fordonskm före kalibrering','Fordonskm i resultatet'],detail.roads.map(x=>'<tr><td>'+esc(x.roadClass)+'</td><td>'+(x.environment==='r'?'Landsbygd/motorväg':'Tätort')+'</td><td>'+esc(x.quality==='measured'?'uppmätt':x.quality==='assumed'?'schablon':x.quality)+'</td><td class="numeric">'+number(x.km,2)+'</td><td class="numeric">'+number(x.vkm)+'</td><td class="numeric">'+number(x.vkmCalibrated)+'</td></tr>').join('')):'')+'</div></div>';
    }
    html+='<div class="calc-step"><span class="calc-n">'+(isB()?'3':'2')+'</span><div class="calc-body"><h3>Livscykel per fordonskilometer</h3><p>Komponenternas gram CO₂e per fordonskilometer multipliceras med trafikarbetet och divideras med 1 000 000 för ton. Tillverkning och slutbehandling fördelas över antagen livstidskörsträcka. Det är en årlig allokering, inte en kalenderbaserad fordonsomsättningsmodell.</p>'+table(['Komponent','Basfall t CO₂e','Basfall g/km','Scenario t CO₂e'],cells+'<tr class="sum"><td>Summa</td><td class="numeric">'+number(c.total,2)+'</td><td class="numeric">'+number(c.vkm?c.total*1e6/c.vkm:null,2)+'</td><td class="numeric">'+number(sc?.total,2)+'</td></tr>')+'<p>Biogen CO₂: '+number(c.biogenic,2)+' ton, separat. Potentiell återvinningskredit: '+number(c.credit,2)+' t CO₂e, separat; den ingår inte som negativ post i totalsumman.</p></div></div></article>'+evidenceSummary(); return html;
  }
  function parametersView() {
    const c=active().cfg;
    let html='<article class="card"><h2>År och scenario</h2><p>Ändringar börjar gälla efter en ny beräkning. Ett ändrat beräkningsår hämtar inte nya trafikdata eller registeruppgifter.</p><div class="controls">'+field('Beräkningsår','year',c.year,{step:1,min:1900,max:2200})+field('Simuleringar','iterations',c.iterations,{step:100,min:100,max:30000})+field('Slumptalsfrö','seed',c.seed,{step:1,min:0})+field('Ändrat trafikarbete','trafficChange',c.trafficChange,{scale:100,min:-99,max:500,unit:'procent, endast scenario'})+field('Ökad elbilsandel','electrify',c.electrify,{scale:100,min:0,max:100,unit:'procentenheter, endast scenario'})+(isB()?field(householdRows().some(r=>H.kmLevel(r,{household:{...c.household,kmMode:'local'}})!=='riket')?'Körsträcka där lokala värden saknas':'Årlig körsträcka per bil','household.kmPerCar',c.household.kmPerCar,{min:0,max:100000,unit:'km / bil · år, riksmedelvärde 12 753'})+(householdRows().some(r=>H.kmLevel(r,{household:{...c.household,kmMode:'local'}})!=='riket')?'<label class="field">Körsträcka per område<select class="input" data-path="household.kmMode"><option value="local"'+(c.household.kmMode!=='national'?' selected':'')+'>Uppmätt per DeSO eller kommun</option><option value="national"'+(c.household.kmMode==='national'?' selected':'')+'>Samma riksmedelvärde för alla</option></select></label>':''):'')+'</div></article>';
    if(!isB()){const refs=(active().project.cities||[]).filter(x=>x.reference);html+='<article class="card"><h2>Beräkningsläge för modell A</h2><p>I <strong>kalibrerat läge</strong> (grundfall) skalas antagen trafik per kommun så att direktutsläppen motsvarar referensen för '+esc(c.year)+'. Uppmätta länkar skalas inte. I <strong>okalibrerat läge</strong> används vägklassernas schablonflöden direkt; det läget är till för validering och känslighetsanalys.</p><div class="controls"><label class="field">Läge<select class="input" data-path="mode"><option value="calibrated"'+(c.mode==='calibrated'?' selected':'')+'>Kalibrerat mot kommunreferens</option><option value="network"'+(c.mode==='network'?' selected':'')+'>Okalibrerad nätschablon</option></select></label></div>'+(refs.length?table(['Kommun','Referens TTW t CO₂e','År','CV','Källa'],refs.map(x=>'<tr><td>'+esc(x.name)+'</td><td class="numeric">'+number(x.reference.groups?.all??Object.values(x.reference.groups||{}).reduce((a,b)=>a+b,0))+'</td><td>'+esc(x.reference.year)+'</td><td class="numeric">'+number((x.reference.cv??c.uncertainty.reference)*100)+' %</td><td>'+esc(x.reference.source||'')+'</td></tr>').join(''),'ref-wrap'):'<p>Inga kommunreferenser finns i projektet.</p>')+'</article>';}
    html+='<article class="card"><h2>Gemensam livscykelmodell</h2><p>Numeriska värden är redigerbara modellval om det inte finns ett uttryckligt verifierat datauttag. Källor och exakt evidensstatus finns under Metod &amp; källor.</p><div class="controls">'+field('Elens klimatfaktor','electricity',c.electricity,{min:0,max:2000,unit:'g CO₂e/kWh'})+field('Batteriproduktion','batteryEF',c.batteryEF,{min:0,max:1000,unit:'kg CO₂e/kWh batteri'})+field('Laddverkningsgrad','chargeEfficiency',c.chargeEfficiency,{scale:100,min:10,max:100,unit:'procent'})+field('Laddhybridens elandel','phevElectric',c.phevElectric,{scale:100,min:0,max:100,unit:'procent av körningen'})+field('Energimultiplikator','energyScale',c.energyScale,{min:.01,max:10})+field('Produktionsmultiplikator','productionScale',c.productionScale,{min:.01,max:10})+field('Livslängdsmultiplikator','lifeScale',c.lifeScale,{min:.01,max:10})+'</div></article>';
    html+='<article class="card"><h2>Fordonsprofiler</h2>'+table(['Klass','Livstids-km','Kaross kg CO₂e','Batteri kWh','Bränsle MJ/km','El kWh/km','Underhåll g/km','Slut kg CO₂e'],c.profiles.filter(p=>!isB()||p.id==='car').map(p=>{const i=c.profiles.findIndex(x=>x.id===p.id);return '<tr><td>'+esc(p.name)+'</td>'+['life','body','battery','mj','kwh','maint','eol'].map(k=>'<td>'+field('',`profiles.${i}.${k}`,p[k],{min:k==='life'?1:0})+'</td>').join('')+'</tr>';}).join(''))+'<h3>Drivlineandelar · summera till 100 % per klass</h3>'+table(['Klass','Bensin %','Diesel %','Elhybrid %','El %','Laddhybrid %','Biogas %','HVO %'],c.profiles.filter(p=>!isB()||p.id==='car').map(p=>{const i=c.profiles.findIndex(x=>x.id===p.id);return '<tr><td>'+esc(p.name)+'</td>'+['petrol','diesel','hev','bev','phev','biogas','hvo'].map(k=>'<td>'+field('',`profiles.${i}.mix.${k}`,p.mix[k]||0,{min:0,max:100,scale:100})+'</td>').join('')+'</tr>';}).join(''))+'</article>';
    html+=exploitationView();
    html+='<article class="card"><h2>Antagen osäkerhet</h2><p>Variationskoefficienterna är öppna modellantaganden. De är inte empiriskt skattade standardfel för varje DeSO. Korrelation och kommunvis summering hanteras i simuleringsmotorn.</p><div class="controls">'+Object.entries(c.uncertainty).map(([k,v])=>field(k,'uncertainty.'+k,v,{min:0,max:k==='mixConcentration'?100000:3})).join('')+(isB()?Object.entries(c.household.uncertainty||{}).map(([k,v])=>field(({distance:'Körsträcka, riksmedelvärde · CV',carStock:'Antal registrerade bilar · CV',allocation:'Lokal körsträckevariation utan områdesdata · CV',distanceLocal:'Körsträcka, kommun- eller DeSO-data · CV',allocationLocal:'Körsträcka uppmätt per DeSO · CV'})[k]||k,'household.uncertainty.'+k,v,{min:0,max:3,unit:k==='carStock'?'0 = registertal hålls fasta':k==='allocation'?'Modellerad lokal variation i km per bil; bilantalet flyttas inte':'Antagen variation i kommunens gemensamma km per bil'})).join(''):'')+'</div></article>';return html;
  }
  function exploitationView() {
    if(!isB())return '';
    const a=active().cfg.exploitation||{};
    return '<article class="card"><h2>Exploateringsscenario · nya hushåll</h2><p>Nya hushåll läggs till i det valda DeSO-området i scenariot. Bilar per hushåll och årlig körsträcka är egna antaganden. Åtgärderna tillämpas på både befintliga och nya hushåll. Ingen automatisk andel flyttas över till territoriell modell A.</p><label class="check"><input type="checkbox" id="exploitation-enabled"'+(a.enabled?' checked':'')+'> Aktivera nya hushåll</label><div class="controls"><label class="field">DeSO i '+esc(cityName())+'<select id="exploitation-deso">'+option('','Välj DeSO',a.deso)+active().project.areas.filter(x=>x.city===city&&x.level==='deso').map(x=>option(x.id,x.name,a.deso)).join('')+'</select></label>'+field('Nya hushåll','exploitation.newHouseholds',a.newHouseholds||0,{min:0,step:1})+field('Bilar per nytt hushåll','exploitation.carsPerHousehold',a.carsPerHousehold??1,{min:0,max:5})+field('km per ny bil och år','exploitation.kmPerCar',a.kmPerCar??active().cfg.household.kmPerCar,{min:0,max:150000})+'</div><p class="small">Vald kommun för scenariot: '+esc(a.city||city)+'. Om du byter kommun, välj målområdet på nytt. Nytt trafikarbete före åtgärder = nya hushåll × bilar per hushåll × km per bil.</p></article>';
  }
  function measuresView() {
    if(!isB())return notice('Åtgärderna avser hushållens personbilar. Välj modell B för att ange deltagande och scenarioeffekter. För territoriella förändringar finns trafikförändring under Parametrar.');
    const st=active().cfg.areaScenario||{}, fx=S.effects(st);
    return '<article class="card"><h2>Fjorton valbara åtgärder</h2><p>Åtgärderna gäller samtliga kommuner i projektet. Varje effekt är en relativ förändring vid full nivå för den berörda målgruppen. Negativa tal betyder minskning. Alla förval är neutrala: noll anger att någon kvantifierad effekt ännu inte valts. Noll är inte ett belägg för att en verklig åtgärd saknar effekt.</p>'+notice('Trafikarbete avser hela förändringen i fordonskilometer. Bilinnehav multipliceras inte med trafikarbetet en gång till. Kvarvarande andelar multipliceras mellan åtgärder; överlapp kan fortfarande ge för stor sammanlagd effekt.')+'<p><strong>Aktuella faktorer:</strong> bilar '+number(fx.fCars,4)+' · fordonskm '+number(fx.fVkm,4)+' · energi per km '+number(fx.fEnergy,4)+'.</p>'+table(['Aktiv','Åtgärd','Omfattning %','Intensitet %','Bilar %','Fordonskm %','Energi/km %'],S.actions.map(a=>{const x=st[a.id]||{}, ef=S.effects({[a.id]:x}).contributions[0]?.effects||a.defaultEffects;return '<tr><td><input type="checkbox" data-action="'+a.id+'" data-action-key="enabled"'+(x.enabled?' checked':'')+' aria-label="Aktivera '+esc(a.name)+'"></td><td>'+esc(a.name)+'<small>'+esc(a.description)+'</small></td>'+[['coverage',x.coverage??1],['intensity',x.intensity??1],['cars',ef.cars],['vkm',ef.vkm],['energy',ef.energy]].map(([k,v])=>'<td><input class="input scenario-number" type="number" data-action="'+a.id+'" data-action-key="'+k+'" value="'+numberInput(v*100)+'" min="'+(['coverage','intensity'].includes(k)?0:-100)+'" max="'+(['coverage','intensity'].includes(k)?100:500)+'" step="1" aria-label="'+esc(a.name+' '+k)+'"></td>').join('')+'</tr>';}).join(''))+'<h3>Dokumenterat litteraturexempel</h3><p>PBL:s nederländska studie beskriver valda bilpooldeltagare. Förvalet väljer −30 % bilar och −17,5 % bilkilometer som överförda scenarioantaganden. Det är inte en kausal effekt skattad för svenska DeSO.</p>'+button('Välj PBL-exempel för bilpool','data-preset="carsharing_pbl2015"')+' '+button('Nollställ alla åtgärder','id="reset-actions"','ghost')+'<p><a href="https://www.pbl.nl/en/publications/impact-of-car-sharing-on-mobility-and-co2-emissions" target="_blank" rel="noopener noreferrer">Nijland, van Meerkerk och Hoen (2015), PBL ↗</a></p><label class="field">Egen motivering och underlag<textarea id="scenario-note" rows="3">'+esc(active().cfg.scenarioNote||'')+'</textarea></label>'+fx.warnings.map(w=>notice(esc(w))).join('')+'</article>';
  }
  const numberInput = value => Number.isFinite(value)?String(Math.round(value*1e8)/1e8):'';
  function controlView() {
    const result=active().result;
    const totals=['deso','district'].map(l=>{const subset=rows().filter(r=>r.city===city&&r.level===l&&r.central);return {level:l,n:subset.length,sum:subset.reduce((s,r)=>s+r.central.total,0)};});
    const cityTotal=rowFor('city|'+city)?.central?.total;
    return '<article class="card"><h2>Summeringskontroll</h2><p>Summor kontrolleras för centralvärden. Intervall för kommunen beräknas efter summering i varje dragning; områdenas marginalintervall får inte adderas.</p>'+table(['Nivå','Antal områden','Summa t CO₂e','Skillnad mot kommun'],totals.map(x=>'<tr><td>'+x.level+'</td><td>'+x.n+'</td><td>'+number(x.sum,5)+'</td><td>'+number(cityTotal==null?null:x.sum-cityTotal,8)+'</td></tr>').join(''))+'<p>Motorns största summeringsavvikelse: '+esc(result?.maxClosureError??'Ej beräknat')+'. Ej tilldelade vägdelar ska granskas om skillnaden är större än avrundningsnivå.</p></article><article class="card"><h2>Underlag och begränsningar</h2>'+scopeNotice()+'<ul>'+(result?.warnings||[]).map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul><h3>Beräkningsmått</h3><pre class="schema-example">'+esc(JSON.stringify(result?.metrics||{},null,2))+'</pre></article>'+evidenceSummary();
  }
  function dataView() {
    const p=active().project, c=active().cfg;
    return (isB()?registerView():'')+'<article class="card"><h2>'+esc(p.title||'Vägvis projekt')+'</h2><div class="coverage"><div><b>'+number(p.areas.filter(a=>a.level==='deso').length)+'</b><span> DeSO</span></div><div><b>'+number(p.areas.filter(a=>a.level==='district').length)+'</b><span> RegSO</span></div><div><b>'+number(p.roads?.length||0)+'</b><span> vägposter</span></div><div><b>'+number((p.d||p.households||[]).length)+'</b><span> hushållsrader</span></div></div><p>Beräkningsår '+esc(c.year)+'. DeSO-version '+esc(p.metadata?.desoVersion||c.desoVersion)+'. Indata uppdateras inte automatiskt när årtalet ändras.</p><div class="button-row">'+button('Öppna projekt eller väg-GeoJSON','id="import-project"')+button('Spara projekt','data-save-project')+button('Exportera spårbarhetskvitto','id="data-audit"')+'</div><p class="small">Projektfiler innehåller både indata och konfiguration. Ett importerat väg-GeoJSON ersätter vägunderlaget för vald kommun efter validering. MVD kräver dokumenterade omräkningsparametrar; någon allmän konstant antas inte.</p></article>'+cityInputsView()+'<article class="card"><h2>Metadata och dokumentation</h2><pre class="schema-example">'+esc(JSON.stringify(p.metadata||{},null,2))+'</pre></article><article class="card"><h2>Vad behövs för starkare belägg?</h2><p>Begär länkgeometri, trafikmängd, mätår, körriktning, mätperiod, fordonsfördelning och dokumenterad omräkning från medelvardagsdygn till ÅDT från kommun och väghållare. Ange särskilt E6, E20, E22 och anslutningen till Öresundsbron. Spara råsvar, API-fråga, källdatum och kontrollsumma.</p><p>För hushållsmodellen behövs registerbilar, hushåll och befolkning med samma år och geografi. RVU kan ge viktade resmönster och prövbara skillnader mellan grupper. Personkilometer ska inte blandas med fordonskilometer. Lokala åtgärdseffekter behöver separat uppföljning.</p></article>'+evidenceSummary();
  }
  function registerView() {
    const status=active().project.metadata?.dataStatus;
    const partial=status==='register_cars_partial';
    return '<article class="card"><h2>'+(status==='observed_register'?'Kontrollera registerdata':'Komplettera registerdata')+'</h2><p>'+(status==='observed_register'?'Hushåll, folkmängd och bilantal för alla 348 DeSO är redan inlästa från SCB:s registertabeller för 2024. Ingen hämtning behövs. Det valfria API-anropet nedan hämtar samma uppgifter på nytt för kontroll.':'Bilantal för alla 348 DeSO är redan inlästa från SCB:s originalexport för 2024. Ingen ytterligare hämtning behövs för att använda dessa bilar. Det valfria API-anropet nedan kan komplettera hushåll och befolkning samt hämta motsvarande bilregister på nytt för samma år och geografi.')+'</p>'+button('Hämta SCB-register 2024','id="fetch-scb-register"')+'<p id="register-status" class="small">'+(status==='observed_register'?'Hushåll, befolkning och bilar har registerstatus. Se sparade frågor och källsvar i metadata.':partial?'Bilregister: inläst. Hushåll och befolkning per DeSO: modellerade värden.':'Aktuell fältstatus visas i metadata och beräkningsvyn. Egna ändringar är märkta separat.')+'</p><p class="small">Kompletteringen kräver internet och att SCB accepterar anrop från webbläsaren. Alla områden valideras före aktivering; befintligt underlag behålls vid fel. Körsträcka, fordonsmix, LCA och åtgärdseffekter ersätts inte av registerdata.</p></article>';
  }
  async function fetchRegister() {
    if(busy||!isB())return;
    const R=window.VagvisRegister;if(!R?.fetch){setMessage('Modulen för SCB-register saknas i paketet.',true);return;}
    const data=active();if(data.cfg.year!==2024){setMessage('Välj beräkningsår 2024 innan du hämtar 2024 års register.',true);return;}
    busy=true;cancelled=false;registerController=typeof AbortController!=='undefined'?new AbortController():null;
    $('progress-box').hidden=false;$('progress-bar').style.width='0%';$('fetch-scb-register').disabled=true;sync();setMessage('Hämtar SCB-register. Befintligt underlag används tills alla kontroller är klara.');
    let accepted=false;
    try {
      const next=await R.fetch(data.project,{year:2024,signal:registerController?.signal,onProgress:p=>{const fraction=p.total>0?p.completed/p.total:0;$('progress-bar').style.width=(Math.min(1,fraction)*100)+'%';$('progress-label').textContent=p.message||'Hämtar SCB-register…';if($('register-status'))$('register-status').textContent=p.message||p.phase||'Hämtar…';}});
      if(cancelled)throw new Error('Registerhämtningen avbröts.');
      const validated=H.validate(next,data.cfg);
      data.project=validated;data.result=null;markDirty();accepted=true;selected='city|'+city;
      setMessage('Alla SCB-rader är validerade. Beräknar med registerunderlaget.');
    } catch(error) {setMessage((cancelled?'Registerhämtningen avbröts.':'SCB-underlaget kunde inte aktiveras: '+error.message)+' Befintligt underlag är kvar.',!cancelled);}
    finally {busy=false;registerController=null;$('progress-box').hidden=true;render();}
    if(accepted)await run();
  }
  function cityInputsView() {
    if(!isB())return '';
    const rs=householdRows().filter(r=>r.kk===city), totals=Object.fromEntries(['hh','bil','bef'].map(k=>[k,rs.reduce((sum,r)=>sum+(Number(r[k])||0),0)]));
    return '<article class="card"><h2>Egna kommunala totaler · '+esc(cityName())+'</h2><p>Ändra bara de fält du vill ersätta med egna dokumenterade totaler. Ett ändrat fält skalas proportionellt inom kommunen och märks som användarscenario. Oförändrade registertal bevaras exakt. Hushålls- och befolkningsproxies blir inte registerstatistik genom denna ändring.</p><div class="controls">'+[['hh','Hushåll'],['bil','Hushållens bilar'],['bef','Befolkning']].map(([k,label])=>'<label class="field">'+label+' · '+esc(statusLabel(fieldStatus(k,rs)))+'<input id="city-total-'+k+'" class="input" type="number" min="0" step="any" value="'+numberInput(totals[k])+'"></label>').join('')+'</div><label class="field">Källa eller motivering<textarea id="city-input-note" rows="2">'+esc(active().project.metadata?.userInputNote||'')+'</textarea></label>'+button('Tillämpa kommunens totaler','id="apply-city-totals"')+'</article>';
  }
  function applyCityTotals() {
    if(!isB())return;
    const p=clone(active().project),rs=p.d.filter(r=>r.kk===city),targets={},changedFields=[];
    const differs=(a,b)=>Math.abs(a-b)>Math.max(1e-7,Math.abs(b)*1e-12);
    for(const k of ['hh','bil','bef']){const input=$('city-total-'+k).value,n=Number(input);if(input.trim()===''||!Number.isFinite(n)||n<0)throw new Error('Kommunens totaler måste vara icke-negativa ändliga tal.');targets[k]=n;}
    if(targets.hh===0&&targets.bil>0)throw new Error('Ett kommunalt scenario med bilar behöver ett positivt totalt antal hushåll. Enskilda områden kan sakna hushållsproxy.');
    for(const k of ['hh','bil','bef']) {
      const old=rs.reduce((sum,r)=>sum+r[k],0);if(!differs(targets[k],old))continue;
      changedFields.push(k);const weights=old>0?rs.map(r=>r[k]/old):rs.map(()=>1/rs.length);
      rs.forEach((r,i)=>{const next=targets[k]*weights[i];if(!differs(next,r[k]))return;
        if(k==='bil'&&statusFor(r,'bil',p)==='observed_register'&&r.registeredBil==null)r.registeredBil=r.bil;
        r[k]=next;r[k+'Status']='user_scenario';r.sources={...r.sources,[k]:'USER_MUNICIPAL_TOTAL'};r.status='user_scenario';
      });
    }
    for(const r of rs){r.bph=r.hh>0?r.bil/r.hh:null;r.bphR=r.bph;r.bphStatus='derived_mixed';}
    if(Array.isArray(p.households))p.households=p.d;
    const fieldStatuses={...p.metadata?.fieldStatuses};for(const k of ['hh','bil','bef'])fieldStatuses[k]=fieldStatus(k,p.d,p);
    p.metadata={...p.metadata,fieldStatuses,...(changedFields.length?{dataStatus:'user_scenario'}:{}),userInputNote:$('city-input-note').value,userEdits:{...p.metadata?.userEdits,[city]:{...targets,changedFields,note:$('city-input-note').value,date:new Date().toISOString()}}};
    H.validate(p,active().cfg);active().project=p;markDirty();setMessage(changedFields.length?'Ändrade totaler är sparade som användarscenario. Oförändrade registerfält är bevarade. Beräkna på nytt.':'Totalerna är oförändrade. Registervärden och källstatus har bevarats.');render();
  }
  function evidenceSummary() { return E?.summary?E.summary(active().cfg,active().project):''; }
  function methodView() {
    const own='<article class="card"><h2>Fristående Vägvis 2.2.2</h2><p>Syftet är en spårbar screening av vägtrafikens årliga klimatpåverkan med två kompletterande systemgränser. Modell A räknar körning inom en yta. Modell B räknar hushållsanknutna personbilars körning oavsett var den sker. Resultaten besvarar olika frågor och ska inte summeras.</p><h3>Aktivitet och livscykel</h3><p>A: fordonskm = Σ (väglängd × ÅDT × dagar × fordonsandel). B: fordonskm = Σ (bilar i hushållsunderlaget × km per bil och år). Det medföljande paketet innehåller SCB:s registrerade personbilar per DeSO för 2024. Hushåll (TAB6568) och folkmängd (TAB6574) per DeSO är också SCB-registerdata för 2024. Registerkällan omfattar folkbokförda personers bilar, inklusive privatleasing och enskilda firmor; förmånsbilar ingår inte. Körsträckan per bil tas i första hand från SCB:s uppmätta körsträcka per DeSO (mätarställningar vid besiktning), i andra hand från SCB:s körsträckedata per kommun (RUS) och annars från riksmedelvärdet 12 753 km, härlett ur Trafikanalys statistik så att det gäller bilar i trafik vid årets slut. Ingen schablon för avstånd till centrum används. Antagen lokal variation utan områdesdata är en modellbedömning och flyttar inte registrerade bilar mellan områden. Båda modellerna använder samma komponentvisa LCA-faktorer. I A kalibreras schablonflödena per kommun så att direktutsläppen motsvarar statistik för 2024; uppmätta länkar skalas inte. Direktutsläppen per km är olika i tätort och på landsbygd enligt Trafikverkets HBEFA-kvoter.</p><p>Årligt utsläpp = Σ (fordonskm × gram CO₂e per fordonskm) / 1 000 000. Sex komponenter ingår: direkta avgaser, energi i tidigare led, fordon, batteri, underhåll och slutbehandling. Biogen CO₂ och potentiell återvinningskredit visas separat. Fullständig cirkularitet eller en fullständigt verifierad cradle to cradle-analys påstås inte.</p><h3>Scenario och modellintervall</h3><p>För en åtgärd j är vikten omfattning × intensitet. Faktor för en storhet x är produkten av (1 + vikt × relativ effekt). Åtgärdens förändring av hela trafikarbetet innefattar dess bilinnehavseffekt. Energifaktorn tillämpas på driftens energikedja. Neutrala förval betyder att en kvantifierad effekt inte valts. Multiplikativ kombination är ett öppet modellval; verklig överlapp behöver undersökas.</p><p>Monte Carlo använder angivna osäkerhetsantaganden och gemensamma dragningar för basfall och scenario. Kommunen summeras inom varje dragning. Percentil 2,5–97,5 är ett villkorat modellintervall. I kalibrerat läge styrs kommuntotalens osäkerhet av referensens CV; i okalibrerat läge av kommunnivåfelet 0,45 som motsvarar den observerade avvikelsen mot kommunstatistik. Varken fullständig täckning av all osäkerhet eller kausala åtgärdseffekter garanteras.</p><h3>Arbetsgång</h3><ol><li>Välj systemgräns och kommun.</li><li>Granska källstatus, år, geografi och saknade data.</li><li>Dokumentera egna schabloner och scenarier under Parametrar och Åtgärder.</li><li>Beräkna, granska summering och undersök områden.</li><li>Exportera resultat, projekt och spårbarhetskvitto tillsammans.</li></ol></article>';
    return own+(E?.render?E.render(active().cfg,active().project):'<article class="card"><p>Källregistret är inte laddat.</p></article>');
  }
  async function run() {
    if(busy)return; const current=model, token=++calculationToken, data=state[current];
    busy=true;cancelled=false;$('progress-box').hidden=false;$('progress-bar').style.width='0%';setMessage('Beräknar aktuella indata…');sync();
    const progress=(done,total)=>{if(token!==calculationToken)return;let f=typeof total==='number'&&total>0?done/total:typeof done==='number'?done:done?.fraction||0;if(f>1)f=f/100;f=Math.max(0,Math.min(1,f));$('progress-bar').style.width=(f*100)+'%';$('progress-label').textContent='Beräknar '+number(f*100)+' %';};
    try {
      V.validateConfig(data.cfg); if(current==='household')S.effects(data.cfg.areaScenario||{});
      const result=await (current==='household'?H.simulate(data.project,data.cfg,progress,()=>cancelled):V.simulate(data.project,data.cfg,progress,()=>cancelled));
      if(cancelled){setMessage('Beräkningen avbröts. Tidigare resultat är kvar.');return;}
      data.result=result;data.dirty=false;setMessage('Beräkningen är klar. Modellintervallen gäller de valda antagandena.');
    } catch(error) { setMessage(error.message||String(error),!cancelled); if(!cancelled)console.error(error); }
    finally {busy=false;$('progress-box').hidden=true;render();}
    return data.result;
  }
  function setPath(object,path,value) { const bits=path.split('.');let target=object;for(let i=0;i<bits.length-1;i++){if(target[bits[i]]==null)target[bits[i]]={};target=target[bits[i]];}target[bits.at(-1)]=value; }
  function editInput(node) {
    if(busy)return;
    const n=Number(node.value);if(node.value.trim()===''||!Number.isFinite(n)){setMessage('Ange ett ändligt numeriskt värde.',true);return;}
    const scale=Number(node.dataset.scale||1);setPath(active().cfg,node.dataset.edit,n/scale);
    if(node.dataset.edit.startsWith('exploitation.'))active().cfg.exploitation.city=city;
    markDirty();
  }
  function editAction(node) {
    const id=node.dataset.action,k=node.dataset.actionKey;const st=clone(active().cfg.areaScenario||S.initialState());
    const item=st[id]||(st[id]={enabled:false,coverage:1,intensity:1,effects:{cars:0,vkm:0,energy:0}});
    if(k==='enabled')item.enabled=node.checked;
    else if(['coverage','intensity'].includes(k))item[k]=Number(node.value)/100;
    else {const ef=S.effects({[id]:item}).contributions[0]?.effects||{cars:0,vkm:0,energy:0};item.effects={...ef,[k]:Number(node.value)/100};delete item.preset;}
    S.effects(st);active().cfg.areaScenario=st;markDirty();
  }
  function projectFile() {const data=active();return {schema:'vagvis-project-2.1',model,project:{...data.project,config:clone(data.cfg)},config:clone(data.cfg),saved:new Date().toISOString()};}
  function auditFile() {
    const data=active(), receipt=E?.receipt?E.receipt(data.cfg,data.project):null;
    return {schema:'vagvis-audit-2.1',version:V.VERSION,created:new Date().toISOString(),model,systemBoundary:isB()?'household-linked passenger-car activity anywhere':'road traffic within geographic area',projectTitle:data.project.title,metadata:data.project.metadata,config:clone(data.cfg),fingerprint:V.fingerprint(data.project,data.cfg),dirty:data.dirty,evidence:receipt,scenarioMethod:isB()?S.effects(data.cfg.areaScenario||{}):null,scenarioSources:S.sources,result:!data.dirty&&data.result?{...data.result,draws:undefined,cells:undefined}:null};
  }
  function download(name,content,type) {const a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type}));a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function saveProject() {download('vagvis-2.2.2-'+model+'-projekt.json',JSON.stringify(projectFile(),null,2),'application/json');}
  function saveAudit() {if(active().dirty||!active().result){setMessage('Beräkna aktuella indata innan du exporterar ett resultatkvitto.',true);return;}download('vagvis-2.2.2-'+model+'-kvitto.json',JSON.stringify(auditFile(),null,2),'application/json');}
  function saveCSV() {if(active().dirty||!active().result){setMessage('Beräkna aktuella indata innan du exporterar resultat.',true);return;}download('vagvis-2.2.2-'+model+'-resultat.csv',V.resultCSV(active().result,undefined,undefined,areaInfo),'text/csv;charset=utf-8');}
  function saveOffline() {
    if(active().dirty||!active().result){setMessage('Beräkna aktuella indata innan du exporterar en resultatvy.',true);return;}
    const doc=document.documentElement.cloneNode(true), inject=(id,data)=>{const node=doc.querySelector('#'+id);if(node)node.textContent=JSON.stringify(data).replace(/</g,'\\u003c');};
    inject('embedded-omraden',V.packAreas(state.territorial.project.areas||[]));inject('embedded-project',V.packProject({...state.territorial.project,config:state.territorial.cfg},{areasRef:'omraden'}));const sameAreas=JSON.stringify(state.territorial.project.areas||[])===JSON.stringify(state.household.project.areas||[]);inject('embedded-household-project',V.packProject({...state.household.project,config:state.household.cfg},{areasRef:sameAreas?'omraden':null}));inject('embedded-config',active().cfg);inject('embedded-mode',model);inject('embedded-result',null);
    doc.querySelector('#export-dialog')?.removeAttribute('open');doc.querySelector('#progress-box')?.setAttribute('hidden','');
    download('vagvis-2.2.2-offline.html','<!doctype html>\n'+doc.outerHTML,'text/html;charset=utf-8');
  }
  async function importFile(file) {
    if(!file)return;
    try {
      const obj=JSON.parse(await file.text());let p,c;
      if(obj.type==='FeatureCollection') {
        if(isB())throw new Error('Väg-GeoJSON importeras i modell A.');
        const roads=V.normalizeRoads(obj,city,active().cfg.year);p=clone(active().project);p.roads=p.roads.filter(r=>r.city!==city).concat(roads);V.validateProject(p);c=clone(active().cfg);
      } else {
        p=V.unpackProject(obj.project||obj,omraden);c=V.config(obj.config||p.config||shared);
        if(p.model!==model)throw new Error('Projektets modell är '+esc(p.model||'inte angiven')+'. Välj motsvarande modell innan import.');
        if(isB()&&!Array.isArray(p.d))throw new Error('Hushållsprojektet behöver det fristående underlaget p.d med aktuella SCB-rader.');
        V.validateProject(p);if(isB()){c.areaScenario=c.areaScenario||S.initialState();c.household={kmPerCar:12753,...c.household};H.deterministic(p,c);}
      }
      active().project=p;active().cfg=c;active().result=null;markDirty();city=p.cities.some(x=>x.id===city)?city:p.cities[0]?.id;selected='city|'+city;setMessage('Projektet är inläst. Beräkna med de importerade indata.');render();
    } catch(error) {setMessage('Import kunde inte genomföras: '+error.message,true);}
    $('import-input').value='';
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('button,[data-go],[data-area]');if(!target)return;
    if(busy&&!['cancel','close-export'].includes(target.id))return;
    if(target.dataset.model){if(busy)return;model=target.dataset.model;if(!active().project.cities.some(c=>c.id===city))city=active().project.cities[0]?.id;selected='city|'+city;if(!isB()&&view==='measures')view='overview';render();return;}
    if(target.dataset.city){if(busy)return;city=target.dataset.city;selected='city|'+city;render();return;}
    if(target.dataset.view||target.dataset.go){view=target.dataset.view||target.dataset.go;render();return;}
    if(target.dataset.level){level=target.dataset.level;selected=null;render();return;}
    if(target.dataset.calc){selected=target.dataset.calc;view='calc';render();return;}
    if(target.dataset.area){selectArea(target.dataset.area);return;}
    if(target.hasAttribute('data-save-project')||target.id==='save-project-side'){saveProject();return;}
    if(target.dataset.preset){const preset=S.presets.find(p=>p.id===target.dataset.preset);if(preset){active().cfg.areaScenario[preset.actionId]={enabled:true,coverage:1,intensity:1,preset:preset.id};markDirty();render();}return;}
    const handlers={run,export:()=>{if(!active().dirty&&active().result)$('export-dialog').showModal();},cancel:()=>{cancelled=true;registerController?.abort();$('progress-label').textContent='Avbryter…';},'close-export':()=>{$('export-dialog').close();},'download-csv':saveCSV,'download-audit':saveAudit,'download-offline':saveOffline,print:()=>window.print(),'import-project':()=>$('import-input').click(),'data-audit':saveAudit,'fetch-scb-register':fetchRegister,'apply-city-totals':()=>{try{applyCityTotals();}catch(error){setMessage(error.message,true);}},'reset-actions':()=>{active().cfg.areaScenario=S.initialState();markDirty();render();}};
    if(handlers[target.id])handlers[target.id]();
  });
  document.addEventListener('change',event=>{
    const node=event.target;if(busy)return;
    if(node.dataset.path==='mode'&&!isB()){active().cfg.mode=node.value==='network'?'network':'calibrated';markDirty();render();return;}
    if(node.dataset.path==='household.kmMode'&&isB()){active().cfg.household.kmMode=node.value==='national'?'national':'local';markDirty();render();return;}
    if(node.dataset.edit){editInput(node);return;}
    if(node.dataset.action){try{editAction(node);render();}catch(error){setMessage(error.message,true);}return;}
    if(node.id==='exploitation-enabled'){active().cfg.exploitation={newHouseholds:0,carsPerHousehold:1,kmPerCar:active().cfg.household.kmPerCar,...active().cfg.exploitation,city,enabled:node.checked};markDirty();return;}
    if(node.id==='exploitation-deso'){active().cfg.exploitation={newHouseholds:0,carsPerHousehold:1,kmPerCar:active().cfg.household.kmPerCar,...active().cfg.exploitation,city,deso:node.value};markDirty();return;}
    if(node.id==='map-period'){period=node.value;render();return;}
    if(node.id==='map-metric'){metric=node.value;render();return;}
    if(node.id==='calc-area'){selected=node.value;render();return;}
    if(node.id==='scenario-note'){active().cfg.scenarioNote=node.value;markDirty();return;}
    if(node.id==='import-input')importFile(node.files?.[0]);
  });
  document.addEventListener('input',event=>{if(event.target.id==='area-search'){search=event.target.value;$('area-table').innerHTML=areaTable();}});
  document.addEventListener('keydown',event=>{const row=event.target.closest('[data-area]');if(row&&event.key==='Enter')selectArea(row.dataset.area);});
  window.VagvisApp={run,fetchRegister,setModel:next=>{if(state[next]&&!busy){model=next;selected='city|'+city;render();}},setView:next=>{if(titles[next]){view=next;render();}},getModel:()=>model,getProject:()=>active().project,getConfig:()=>active().cfg,getResult:()=>active().result,getAudit:auditFile,render};
  const packaged = read('embedded-result',null);
  // Reuse only a freshly built result with an exact version and input fingerprint.
  const a=state.territorial;
  if(packaged?.version===V.VERSION && packaged.fingerprint===V.fingerprint(a.project,a.cfg)) { a.result=packaged;a.dirty=false; }
  render();
  window.VagvisApp.ready=active().result?Promise.resolve(active().result):run();
})();
