/* Traceability only: no mutation of model inputs, random streams or results. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root.document){root.VagvisEvidence=api.create(JSON.parse(root.document.getElementById('embedded-evidence').textContent));}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={official_definition:'Officiell definition',derived_unverified:'Härledd uppgift med kvarstående källkontroll',model_assumption:'Modellbedömning',scenario_assumption:'Bedömd scenarioeffekt',literature_range:'Litteraturstöd för intervall',unverified_import:'Användarunderlag behöver egen källkontroll'};
  const get=(o,path)=>path.split('.').reduce((v,k)=>v==null?undefined:v[k],o);
  const fmt=x=>typeof x==='number'?new Intl.NumberFormat('sv-SE',{maximumSignificantDigits:8}).format(x):x==null?'Ej tillämpligt':Array.isArray(x)?'['+x.map(fmt).join('; ')+']':typeof x==='object'?JSON.stringify(x):String(x);
  const safeUrl=s=>/^https?:\/\//.test(s||'')?esc(s):'';
  function create(registry){
    function parameters(cfg,project){
      return registry.parameters.map(p=>{
        let value=p.path?get(cfg,p.path):p.value, status=p.status;
        if(p.binding==='car_ratio'){
          const rows=project.households||[],n=rows.reduce((s,r)=>s+r.hh*r.bph,0),den=rows.reduce((s,r)=>s+(Number(r.bil)||0),0);
          value=den>0?n/den:null;
          if(!rows.length||rows.some(r=>!Number.isFinite(r.bil)))status='unverified_import';
        }
        if(p.binding==='distance_exponent'){
          const rows=(project.households||[]).filter(r=>r.d>=0&&r.km>0),groups=new Map();
          for(const r of rows){if(!groups.has(r.kk))groups.set(r.kk,[]);groups.get(r.kk).push(r);}
          const slopes=[];
          for(const rs of groups.values()){
            const xs=rs.map(r=>Math.log(Math.max(r.d,.5))),ys=rs.map(r=>Math.log(r.km)),mx=xs.reduce((a,b)=>a+b,0)/xs.length,my=ys.reduce((a,b)=>a+b,0)/ys.length;
            const den=xs.reduce((s,x)=>s+(x-mx)**2,0);
            if(den>0)slopes.push(xs.reduce((s,x,i)=>s+(x-mx)*(ys[i]-my),0)/den);
          }
          value=slopes.length?slopes:null;
          if(!slopes.length)status='unverified_import';
        }
        if(p.binding?.startsWith('mean_km:')){
          const city=p.binding.split(':')[1],rows=(project.households||[]).filter(r=>r.kk===city);
          const cars=rows.reduce((s,r)=>s+r.hh*r.bph,0);
          value=cars?rows.reduce((s,r)=>s+r.hh*r.bph*r.km,0)/cars:null;
          if(!cars)status='unverified_import';
        }
        return {...p,activeValue:value,effectiveStatus:status};
      }).filter(p=>p.model==='both'||p.model===(project.model==='household'?'B':'A'));
    }
    function receipt(cfg,project){
      return {schemaVersion:1,modelVersion:'2.0.9',evidenceVersion:registry.version,reviewDate:registry.reviewDate,
        calculationYear:cfg.year,activityYear:project.metadata?.dataYear??project.metadata?.networkYear??cfg.year,
        geography:project.model==='household'?'DeSO 2018':project.metadata?.desoVersion||cfg.desoVersion,
        interpretation:'Villkorad modellskattning. Intervallen beror på valda fördelningar och är inte heltäckande statistiska konfidensintervall.',
        parameters:parameters(cfg,project),actions:registry.actions,actionReferences:registry.actionReferences,sources:registry.sources,
        release:registry.release,apiStatus:registry.apiStatus};
    }
    function sourceLinks(ids){return (ids||[]).map(id=>{const s=registry.sources.find(x=>x.id===id);return s?'<a href="'+safeUrl(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.short||s.title)+'</a>':esc(id);}).join(' · ');}
    function summary(cfg,project){
      return '<article class="card evidence-summary"><h2>Källstatus och tolkning</h2><p>Resultatet är en modellskattning med dokumenterade schabloner. År '+esc(cfg.year)+' är valt beräkningsår; aktivitet, bilpark och utsläppsfaktorer kan avse andra år. Intervallen är villkorade av modellens antaganden. Kommunal kalibrering verifierar inte fördelningen mellan DeSO.</p><p>Under <strong>Metod &amp; källor</strong> visas källregistret, aktuella parametrar och kvarstående databehov. A och B har olika systemgränser och ska inte summeras.</p><button class="secondary small-btn" data-view="method">Beräkningsbeskrivning och källor →</button></article>';
    }
    function render(cfg,project){
      const ps=parameters(cfg,project);
      const rows=ps.map(p=>'<tr><td>'+esc(p.name)+'<br><small>'+esc(p.id)+'</small></td><td>'+esc(fmt(p.activeValue))+' '+esc(p.unit||'')+'</td><td>'+esc(labels[p.effectiveStatus]||p.effectiveStatus)+'</td><td>'+esc(p.rationale)+'<br><small>'+esc(p.rangeNote||'')+'</small><br>'+sourceLinks(p.sources)+'</td></tr>').join('');
      const acts=registry.actions.map(a=>'<tr><td>'+esc(a.name)+'</td><td>'+esc(a.B.join(' / '))+'</td><td>'+esc(a.V.join(' / '))+'</td><td>'+esc(a.C.join(' / '))+'</td><td>Bedömd scenarioeffekt. Exakta koefficienter har inte verifierats som skattningar för varje DeSO.<br>'+esc(a.references.join(', '))+'</td></tr>').join('');
      const sources=registry.sources.map(s=>'<div class="source"><strong>'+esc(s.title)+'</strong><p>'+esc(s.use)+'</p><p class="small">'+esc(s.verification)+' '+esc(s.locator||'')+'</p><a href="'+safeUrl(s.url)+'" target="_blank" rel="noopener noreferrer">Öppna originalkälla ↗</a></div>').join('');
      return '<article class="card"><h2>Vägvis 2.0.9 · evidens och aktuella värden</h2><p>Gränssnitt, grunddata och beräkningsformler bygger vidare på 2.0.8. Denna version gör underlag och bedömningar spårbara. Ingen ny modell har skattats från RVU och inga nya uppmätta vägflöden har lagts in.</p><p><strong>Viktiga skillnader:</strong> SCB:s registerbilar omfattar privatleasing men inte förmånsbil via jobbet. Bilmodell v7:s mått ”direkt CO₂” inkluderar elproduktion vid eldrift och är därför inte rent tank to wheel. Livscykelresultatet är en komponentvis schablonberäkning; fullständig cradle to cradle verifiering återstår.</p><p><strong>År och områden:</strong> B använder huvudsakligen aktivitet 2023 och DeSO 2018 samt vald bilparksårgång. A använder DeSO 2025 och beräkningsår '+esc(cfg.year)+'. Statistik kan inte flyttas mellan dessa indelningar utan dokumenterad nyckel. Ändrat beräkningsår skriver inte automatiskt fram B:s aktivitet.</p></article>'+
      '<article class="card"><h2>Parametrar som används</h2><p>Värden med en inställning läses från aktuell konfiguration när sidan öppnas. Bilpåslag och avståndsexponent är inbyggda i hushållsunderlaget: tabellen visar härledda kontroller, inte nya statistiska skattningar. Registertext ändrar aldrig redan beräknade underlagsvärden.</p><div class="table-wrap"><table class="calc-table calc-wrap"><thead><tr><th>Parameter</th><th>Aktuellt värde</th><th>Evidensstatus</th><th>Motivering och referens</th></tr></thead><tbody>'+rows+'</tbody></table></div></article>'+
      (project.model==='household'?'<article class="card"><h2>Åtgärder och best guess</h2><p>För varje åtgärd anges centralvärde / gräns 1 / gräns 2 i v7:s ursprungliga kodordning, som andel vid full nivå. B är bilinnehav, V är fordonskilometer och C är driftutsläpp per kilometer. Detta är modellens bedömda scenariospann. De utgör inte statistiskt skattade osäkerhetsintervall. Referensnycklarna återfinns i det bevarade v7-underlaget.</p><div class="table-wrap"><table class="calc-table calc-wrap"><thead><tr><th>Åtgärd</th><th>B</th><th>V</th><th>C</th><th>Tolkning och referensnycklar</th></tr></thead><tbody>'+acts+'</tbody></table></div></article>':'')+
      '<article class="card"><h2>Källregister för nästa datasteg</h2><p>Kontrollerade källbeskrivningar är skilda från verifierade datauttag. '+esc(registry.apiStatus.note)+'</p>'+sources+'</article>'+
      '<article class="card"><h2>Arbetsgång för starkare evidens</h2><ol><li>Hämta registerdata, kontrollera målpopulation, enhet, år och DeSO-version. Spara anrop, råsvar och kontrollsummor.</li><li>Använd viktade RVU-tabeller eller avtalat mikrodatauttag för att skatta relativa skillnader. Skilj bilförare från passagerare och personkilometer från fordonskilometer. Dokumentera helårsomräkningen.</li><li>Anpassa en enkel områdesmodell med stöd från större grupper vid små urval. Jämför mot dagens modell och kommunens genomsnitt på uppgifter som hållits utanför anpassningen.</li><li>Pröva åtgärdernas effekter med interventionsstudier eller lokal före- och eftermätning. RVU-samband ensamt belägger inte en åtgärdseffekt.</li><li>För A behövs länktrafik med mätår, riktning och fordonsfördelning. MVDT kräver dokumenterad omräkning till ÅDT.</li></ol><p>Osäkerhet från urval, parametrar och alternativa modellstrukturer ska särredovisas. Kommunintervall beräknas från summering inom varje simulering; områdenas marginalintervall ska inte adderas.</p></article>';
    }
    return {parameters,receipt,summary,render};
  }
  return {create,labels};
});
