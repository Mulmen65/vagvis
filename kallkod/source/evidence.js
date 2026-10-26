/* Vägvis evidence and calculation receipt. Reads active inputs without changing them. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root.document){const el=root.document.getElementById('embedded-evidence');if(el)root.VagvisEvidence=api.create(JSON.parse(el.textContent));}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={register_cars_partial:'Registerbilar med skattade hushåll och befolkning',derived_mixed:'Härlett mått med blandade källor',mixed:'Blandad källstatus',user_scenario:'Eget scenarioantagande',transferred_assumption:'Överfört antagande',observed_register:'Validerat SCB-registeruttag',constructed_scenario:'Illustrativt startscenario: verifierat bilregisteruttag saknas',model_assumption:'Valt modellantagande',user_setting:'Aktuell inställning',input_data:'Aktiva indata: kontrollera datastatus',derived_descriptor:'Beräknad beskrivning av indata',spatial_model_assumption:'Geografiskt fördelat modellvärde',source_data:'Källbelagt datauttag',official_value:'Officiellt värde eller rättsakt',derived_official:'Härlett ur officiell statistik',calibrated_to_official:'Kalibrerat mot officiell statistik',literature_value:'Litteraturvärde',scaled_official:'Officiell statistik framskriven till 2024',observed_count:'Uppmätt flöde',missing_data:'Uppgift saknas',user_scenario_required:'Användarens scenarioantagande'};
 const get=(o,path)=>String(path).split('.').reduce((v,k)=>v==null?undefined:v[k],o);
 const copy=x=>JSON.parse(JSON.stringify(x));
 const fmt=x=>typeof x==='number'?new Intl.NumberFormat('sv-SE',{maximumSignificantDigits:8}).format(x):x==null?'Saknas':Array.isArray(x)?x.map(fmt).join('; '):typeof x==='object'?JSON.stringify(x):String(x);
 const safeUrl=s=>/^https?:\/\//.test(s||'')?esc(s):'';
 const rowsOf=(project,city)=>(project.d||[]).filter(r=>String(r.kk??r.city)===String(city));
 const cars=r=>Number.isFinite(r.bil)?r.bil:0;
 const sum=(rows,f)=>rows.reduce((a,r)=>a+(Number(f(r))||0),0);
 function create(registry){
  const sources=registry.sources||[];
  const parameterDefault=id=>(registry.parameters||[]).find(p=>p.id===id)?.defaultValue;
  const annualKm=cfg=>cfg.household?.kmPerCar??parameterDefault('B_ANNUAL_KM');
  const LOCAL_KM={observed_register:'source_data',derived_official:'derived_official'};
  const kmRow=(r,cfg)=>cfg.household?.kmMode!=='national'&&r.km!=null&&LOCAL_KM[r.kmStatus]?r.km:annualKm(cfg);
  const kmState=(r,cfg)=>cfg.household?.kmMode!=='national'&&r.km!=null&&LOCAL_KM[r.kmStatus]||'transferred_assumption';
  function parameters(cfg={},project={}){
   const model=project.model==='household'?'B':'A';
   const out=(registry.parameters||[]).filter(p=>p.model==='both'||p.model===model).map(p=>{
    let value=p.path?(get(cfg,p.path)??p.defaultValue):p.value,status=p.status;
    if(p.binding){
     const [kind,city]=p.binding.split(':'),rs=rowsOf(project,city),n=sum(rs,cars);
     if(kind==='households')value=rs.length?sum(rs,r=>r.hh):null;
     if(kind==='cars')value=rs.length?n:null;
     if(kind==='cars_per_household'){const hh=sum(rs,r=>r.hh);value=hh?n/hh:null;}
     if(kind==='mean_km')value=n?sum(rs,r=>cars(r)*kmRow(r,cfg))/n:null;
     if(!rs.length)status='missing_data';
     else if(['households','cars'].includes(kind)){
      const field=kind==='cars'?'bil':'hh';
      const states=new Set(rs.map(r=>r[field+'Status']||project.metadata?.fieldStatuses?.[field]||(project.metadata?.dataStatus==='observed_register'?'observed_register':r.status||'input_data')));
      status=states.size===1?[...states][0]:'mixed';
      if(status==='observed_register')status='source_data';
     }else if(kind==='cars_per_household'){
      status=rs.every(r=>(r.bilStatus||project.metadata?.fieldStatuses?.bil)==='observed_register'&&(r.hhStatus||project.metadata?.fieldStatuses?.hh)==='observed_register')?'derived_descriptor':'derived_mixed';
     }else if(kind==='mean_km'){const st=new Set(rs.map(r=>kmState(r,cfg)));status=st.size===1?[...st][0]:'mixed';}
    }
    if(value===undefined||value===null)status='missing_data';
    return {...p,activeValue:value,effectiveStatus:status};
   });
   // Imported traffic conversion is part of the active calculation, not a fixed default.
   const seen=new Set();
   if(model==='A')for(const road of project.roads||[])for(const f of road.flowAudit?.factors||[]){
    const id=[road.city,f.name,f.group??f.source,f.value].join('|');if(seen.has(id))continue;seen.add(id);
    out.push({id:'IMPORT_'+id,name:'Trafikomräkning: '+f.name,unit:'multiplikator',model:'A',activeValue:f.value,effectiveStatus:'input_data',rationale:'Importerad faktor. Kommun '+road.city+'. Källa/metod: '+f.source+'. CV '+fmt(f.cv)+'. Gruppen '+(f.group??f.source)+' delar samma simulering.',sources:[]});
   }
   return out;
  }
  function availability(project){if(project.metadata?.dataStatus==='register_cars_partial')return 'Bilantal för samtliga 348 DeSO 2025 är inlästa från SCB:s TAB6589, status i trafik och referensår 2024. DeSO-summorna stämmer med filens kommunrader. Originalfil, urval och kontrollsummor finns i paketets källkvitto. Hushåll och befolkning på områdesnivå är fortfarande skattade tills SCB:s DeSO-tabeller läses in. Körsträckan 12 753 km är härledd ur Trafikanalys riksstatistik och livscykelfaktorerna har egna källor. Ingen API-hämtning behövs för att använda de redan inlagda bilantalen.';return project.metadata?.dataStatus==='observed_register'?'Hushåll (TAB6568), folkmängd (TAB6574) och personbilar i trafik (TAB6589) per DeSO 2025 för 2024 är inlästa från SCB:s originalfiler. DeSO-summorna stämmer exakt med kommunraderna. Filnamn, urval och kontrollsummor finns i projektets källkvitto. Körsträckan är uppmätt per DeSO eller kommun om sådana SCB-uppgifter är inlästa, annars riksmedelvärdet 12 753 km härlett ur Trafikanalys statistik. Livscykelparametrarna har egna källor och statusar i parametertabellen.':registry.apiStatus?.note||'';}
  function receipt(cfg,project){
   return {schemaVersion:2,modelVersion:'2.2.5',evidenceVersion:registry.version,reviewDate:registry.reviewDate,
    calculationYear:cfg.year,activityYear:project.metadata?.dataYear??project.metadata?.networkYear??null,
    geography:project.metadata?.desoVersion??cfg.desoVersion,model:project.model==='household'?'B':'A',
    interpretation:'Villkorad livscykelscreening. Modellintervall styrs av valda fördelningar och är inte empiriskt heltäckande konfidensintervall.',
    boundaries:copy(registry.boundaries||{}),scope:copy(registry.scope||{}),dataMetadata:copy(project.metadata||{}),
    cityInputs:copy((project.cities||[]).map(x=>({id:x.id,name:x.name,reference:x.reference??null,comparison:x.comparison??null}))),
    activeHouseholdSettings:project.model==='household'?{kmPerCar:annualKm(cfg),uncertainty:{distance:cfg.household?.uncertainty?.distance??parameterDefault('B_CV_DISTANCE'),carStock:cfg.household?.uncertainty?.carStock??parameterDefault('B_CV_CARSTOCK'),allocation:cfg.household?.uncertainty?.allocation??parameterDefault('B_CV_ALLOCATION')}}:null,
    areaScenario:copy(cfg.areaScenario||{}),activeConfiguration:copy(cfg),
    calculationContext:{model:project.model==='household'?'B':'A',title:project.title||'',calculationYear:cfg.year,activityYear:project.metadata?.dataYear??project.metadata?.networkYear??null,dataStatus:project.metadata?.dataStatus??null,geography:project.metadata?.desoVersion??cfg.desoVersion},
    parameters:parameters(cfg,project),sources:copy(sources),release:copy(registry.release||{}),apiStatus:{...copy(registry.apiStatus||{}),note:availability(project),activeDataStatus:project.metadata?.dataStatus??null}};
  }
  function sourceLinks(ids){return (ids||[]).map(id=>{
   const s=sources.find(x=>x.id===id);if(!s)return esc(id);
   return safeUrl(s.url)?'<a href="'+safeUrl(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.short||s.title)+'</a>':esc(s.title);
  }).join(' · ');}
  function dataStatus(project){
   const m=project.metadata||{},notes=Array.isArray(m.notes)?m.notes:[];
   return (m.dataStatus==='register_cars_partial'?'<p><strong>Registrerade personbilar är inlagda per DeSO för 2024.</strong> Bilantal hämtas från den inbyggda SCB-exporten. Hushåll och befolkning på områdesnivå är skattade och har separata källstatusar. Bilar per hushåll är därför ett härlett mått med blandade källor. Körsträckan är härledd ur Trafikanalys riksstatistik och livscykelfaktorerna har källor och statusar enligt parametertabellen.</p>':'')+(m.dataStatus==='observed_register'?'<p><strong>Hushåll, folkmängd och personbilar är SCB-registerdata per DeSO för 2024.</strong> Bilar per hushåll är därmed en kvot mellan två registeruppgifter för samma datum och områdesindelning. '+({deso:'Körsträckan är SCB:s uppmätta värde per DeSO.',kommun:'Körsträckan är SCB:s uppmätta värde per kommun (RUS körsträckedata) och varierar inte inom kommunen.',blandad:'Körsträckan är uppmätt per DeSO där SCB:s värden finns, annars kommunens eller rikets värde.'}[m.annualKm?.level]||'Körsträckan är ett härlett riksmedelvärde och varierar inte mellan områden.')+'</p>':'')+(m.dataStatus==='constructed_scenario'?'<p><strong>Illustrativt startscenario – saknar verifierade registertal för hushållens bilar.</strong> Uppgifterna per DeSO är fördelade modellvärden. Använd dem för att pröva modellen och ersätt antagandena med kontrollerade registeruttag före en faktisk inventering.</p>':'')+'<p><strong>Underlag:</strong> '+esc(m.dataYear??m.networkYear??'År ej angivet')+' · DeSO '+esc(m.desoVersion??'version ej angiven')+(m.dataStatus?' · '+esc(labels[m.dataStatus]||m.dataStatus):'')+'.</p>'+(notes.length?'<ul>'+notes.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'');
  }
  function summary(cfg,project){
   const model=project.model==='household'?'B':'A';
   return '<article class="card evidence-summary"><h2>Källstatus och beräkningsgräns</h2><p>'+esc(registry.boundaries?.[model]||'')+'</p>'+dataStatus(project)+'<p>Aktuella schabloner, deras källstöd och importerade omräkningar visas under <strong>Metod &amp; källor</strong>. A och B överlappar och ska inte summeras. Resultaten är modellskattningar.</p><button class="secondary small-btn" data-view="method">Beräkningsbeskrivning och källor →</button></article>';
  }
  function render(cfg,project){
   const model=project.model==='household'?'B':'A',ps=parameters(cfg,project);
   const rows=ps.map(p=>'<tr><td>'+esc(p.name)+'<br><small>'+esc(p.id)+'</small></td><td>'+esc(fmt(p.activeValue))+' '+esc(p.unit||'')+'</td><td>'+esc(labels[p.effectiveStatus]||p.effectiveStatus)+'</td><td>'+esc(p.rationale)+'<br>'+sourceLinks(p.sources)+'</td></tr>').join('');
   const sourceCards=sources.map(s=>'<div class="source"><strong>'+esc(s.title)+'</strong><p>'+esc(s.use)+'</p><p class="small">'+esc(s.verification)+' '+esc(s.locator||'')+'</p>'+(safeUrl(s.url)?'<a href="'+safeUrl(s.url)+'" target="_blank" rel="noopener noreferrer">Öppna originalkälla ↗</a>':'<p class="small">Öppet modellval i paketets parameterregister.</p>')+'</div>').join('');
   return '<article class="card"><h2>Vägvis 2.2.5 · beräkningsbeskrivning</h2><p>Vägvis använder två öppet definierade aktivitetsmodeller och en gemensam livscykelberäkning. Modell A beräknar fordonens körning på vägar inom ett område. Modell B tillskriver hushållens personbilar deras samlade körning, oavsett körplats. Modellerna svarar på olika frågor och ska inte summeras.</p><p><strong>Aktiv modell '+esc(model)+':</strong> '+esc(registry.boundaries?.[model]||'')+'</p>'+dataStatus(project)+'</article>'+
    '<article class="card"><h2>Aktivitet och formler</h2><p><strong>A:</strong> trafikarbete per fordonsklass = Σ(länklängd inom området × ÅDT för den geometrin × antal dagar i året × klassandel). Beräkningsåret '+esc(cfg.year)+' använder '+esc((new Date(Date.UTC(cfg.year+1,0,1))-new Date(Date.UTC(cfg.year,0,1)))/86400000)+' dagar. MVD får endast räknas om med dokumenterad faktor, år och riktning. ÅDT-formeln stöds av Trafikverket (2015). '+sourceLinks(['TV_AADT_METHOD'])+'</p><p><strong>B:</strong> trafikarbete = bilstock i aktiv rad × vald gemensam årlig körsträcka per bil. Bilar per hushåll är en beskrivning av indata: bilstock / hushåll. Det är radens bilstock som används i beräkningen; vald körsträcka ersätter eventuella radvisa körsträckor. Registrerade bilar, årsslutsstock och körsträckestatistik kan avse olika målpopulationer. I det medföljande underlaget är bilstock (TAB6589), hushåll (TAB6568) och folkmängd (TAB6574) registeruppgifter per DeSO för 31 december 2024. Om registeruttag för hushåll eller befolkning saknas används en geografisk proxyfördelning, som då redovisas med egen status. Bilar per hushåll redovisas inte när hushållsunderlaget saknar positiv nämnare; registrerade bilar och deras trafikarbete behålls ändå. Körsträckestatistiken lokaliserar inte körningen (Trafikanalys, u.å.). '+sourceLinks(['SCB_CARS','SCB_HOUSEHOLDS','TRAFANALYS'])+'</p><p><strong>Gemensam livscykel:</strong> utsläpp [ton CO2e] = Σ(fordonskm × klassens faktor [g CO2e/fordonskm]) / 1 000 000. Faktorn summerar fossil direktutsläppspost, bränsleförsörjning, elproduktion, fordonsproduktion, batteriproduktion, underhåll och slutbehandling. Produktionen fördelas på livslängd i kilometer. Fordonsmix viktar varje drivlina.</p><p><strong>Energi:</strong> direktutsläpp = MJ/km × termisk andel × fossil energiandel × fossil förbränningsfaktor + övriga direkta växthusgaser. Bränsleförsörjning = MJ/km × termisk andel × (fossil andel × fossil försörjningsfaktor + biogen andel × biogen försörjningsfaktor). Elproduktion = eldriftsandel × kWh/km / laddverkningsgrad × elens klimatfaktor. Batteri = kapacitet × produktionsfaktor / livslängd.</p><p><strong>Redovisning:</strong> TTW avser avgasposten. Drift inklusive elproduktion = TTW + elproduktion. Posten <code>wtt</code> omfattar både bränsleförsörjning och elproduktion; dessa delar kan särredovisas och ska inte adderas en gång till. Biogen avgas-CO2 och potentiell återvinningskredit visas separat. Krediten dras inte av från huvudresultatet.</p></article>'+
    '<article class="card"><h2>Omfattning och källstöd</h2><p>Detta är en livscykelscreening. Vägbyggnad, vägunderhåll, laddinfrastruktur och parkeringsbyggnader ingår inte. Utsläpp från tillverkning och energiförsörjning behöver inte ske i det redovisade geografiska området. Slutbehandling och separat återvinningspotential innebär inte att en fullständig sluten cradle-to-cradle-cykel är verifierad.</p><p>Sedan version 2.2.0 förankrar Vägvis de viktigaste talen i officiell statistik och en samlad livscykelkälla: energianvändningen per fordonsklass är kalibrerad så att direktutsläppen motsvarar Trafikverkets nationella siffror för 2024; personbilens tillverkning, batteri, underhåll och livslängd följer ICCT (2025); elens klimatfaktor är Naturvårdsverkets värde för nordisk elmix; fordonsandelar per vägtyp följer Trafikverkets normalvärden; fossila bränslens livscykelintensitet följer direktiv (EU) 2015/652. I grundfallet kalibreras modell A per kommun mot officiell eller kommunal statistik för direktutsläpp 2024. Värden markerade <em>Valt modellantagande</em> saknar direkt extern källa och är tillgängliga för granskning och byte. '+sourceLinks(['TV_UTSLAPP_2025','ICCT_LCA_2025','NV_KLIMATKLIVET_2025','TV_NORMALVARDEN','FQD_2015_652'])+'</p><p>Monte Carlo-intervall är villkorade av valda variationskoefficienter och samvariation. De ska inte tolkas som empiriskt heltäckande konfidensintervall. Områden summeras inom varje dragning; marginalintervall mellan områden ska inte adderas.</p></article>'+
    '<article class="card"><h2>Aktuella parametrar och antaganden</h2><p>Värden med konfigurationssökväg läses från aktiva inställningar. Trafikschabloner är fasta reservvärden och används bara när motsvarande vägdata saknas. B använder samma generiska personbilsprofil som klass Personbil i A, inklusive dess aktiva fordonsmix. B:s körsträcka och tre variationskoefficienter visas som separata parametrar. Projektets exporterade källkvitto innehåller även underlagets metadata och aktuella hushållsinställningar.</p><div class="table-wrap"><table class="calc-table calc-wrap"><thead><tr><th>Parameter</th><th>Aktuellt värde</th><th>Status</th><th>Förklaring och referens</th></tr></thead><tbody>'+rows+'</tbody></table></div></article>'+
    (model==='B'?'<article class="card"><h2>Scenarier</h2><p>En åtgärdsrubrik har ingen belagd automatisk procenteffekt. Ange egen effekt, täckning, målgrupp och motivering i scenariot. Grundeffekterna är noll. Scenarioantaganden är framåtblickande modellval; ett samband i en resvaneundersökning visar inte i sig en kausal åtgärdseffekt.</p></article>':'')+
    '<article class="card"><h2>Referenser och datakontroll</h2><p>'+esc(availability(project))+' Källbeskrivningar nedan anger vad varje källa faktiskt stödjer. Hämtad 23–25 oktober 2026 om annat datum inte anges.</p>'+sourceCards+'</article>'+
    '<article class="card"><h2>Stärk underlaget steg för steg</h2><ol><li>Läs in Trafikverkets ÅDT från NVDB (Lastkajen) med verktyg/importera_nvdb_adt.py. Uppmätta länkar ersätter schablonerna och skalas inte vid kalibrering.</li><li>Läs in kommunala trafikmätningar med verktyg/importera_trafikmatningar.py. Mätningar av vardagsdygn räknas om till ÅDT med Trafikverkets månads- och veckodagsindex och redovisad osäkerhet.</li><li>Ersätt kommunreferenserna med uttag ur Nationella emissionsdatabasen för 2024 per fordonsslag och kalibrera per fordonsgrupp i stället för totalt.</li><li>Använd kommunspecifik fordonsmix (personbilar i trafik per kommun och drivmedel) och körsträcka per län eller kommun för modell B.</li><li>Använd viktade resvaneundersökningar för områdesskillnader först när urval, bilförare, fordonskilometer och helårsomräkning kan dokumenteras.</li></ol></article>';
  }
  return {parameters,receipt,summary,render};
 }
 return {create,labels};
});
