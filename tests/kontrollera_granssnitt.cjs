/* Real Chromium interaction test. Requires playwright and an installed Chromium.
   CI installs both. No DOM stubs or synthetic screenshots are used. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'testresultat');
const checks=[],errors=[];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8*Math.max(1,Math.abs(b)),a+' ≠ '+b);
async function views(page,names){
  for(const name of names){
    await page.locator('.nav[data-view="'+name+'"]').click();
    const text=await page.locator('#view').innerText();
    assert.ok(text.trim().length>30,'Tom vy '+name);
    assert.ok(!text.includes('Vyn kunde inte visas'),'Körfel i '+name+': '+text);
    if(name==='map'){
      assert.ok(await page.locator('#map-surface').evaluate(node=>node.classList.contains('leaflet-container')),'Leaflet startade inte');
      assert.ok(await page.locator('.leaflet-control-attribution').count()>0,'Kartattribution saknas');
      // Teckenförklaring, landmask och områdespanel.
      assert.ok(await page.locator('#map-surface .map-legend span').count()>=3,'Teckenförklaring saknas');
      assert.ok(await page.locator('#map-surface clipPath path').count()>0,'Landmask saknas i kartan');
      const rowsN=await page.locator('#area-table tbody tr[data-area]').count();
      assert.ok(rowsN>=20,'För få rader i områdestabellen: '+rowsN);
      const shares=await page.locator('#area-table tbody tr[data-area] td:nth-child(6)').allInnerTexts();
      const shareSum=shares.reduce((s,x)=>s+Number(x.replace(/[^0-9,]/g,'').replace(',','.')),0);
      assert.ok(Math.abs(shareSum-100)<=0.05*rowsN+0.5,'Andelarna summerar inte till 100 %: '+shareSum);
      const first=page.locator('#area-table tbody tr[data-area]').first();
      const name=(await first.locator('.link-btn').innerText()).trim(),base=await first.locator('td:nth-child(3)').innerText();
      await first.locator('.link-btn').click();
      assert.equal((await page.locator('#area-detail .ad-head h3').innerText()).trim(),name,'Panelen visar inte valt område');
      const hero=Number((await page.locator('#area-detail .ad-hero b').innerText()).replace(/[^0-9]/g,''));
      assert.ok(Math.abs(hero-Number(base.replace(/[^0-9,]/g,'').replace(',','.')))<=1,'Panelens värde avviker från tabellen');
      assert.equal(await first.evaluate(n=>n.classList.contains('sel')),true,'Vald rad markeras inte');
      assert.ok(await page.locator('#area-detail .ad-facts dd').count()>=6,'Panelen saknar nyckeltal');
      // Hovring över flera områden får inte lämna kvar tooltips eller markeringar.
      const paths=page.locator('#map-surface path.leaflet-interactive'),np=await paths.count();
      for(const i of [Math.floor(np/4),Math.floor(np/2),Math.floor(3*np/4)]){
        const bb=await paths.nth(i).boundingBox().catch(()=>null);
        if(bb&&bb.width>2&&bb.height>2)await page.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2,{steps:3});
      }
      await page.mouse.move(2,2,{steps:6});await page.waitForTimeout(150);
      assert.equal(await page.locator('.leaflet-tooltip').count(),0,'Tooltips blir kvar efter hovring');
      checks.push('Karta: teckenförklaring, landmask, tabell, panel och hovring ('+rowsN+' områden)');
    }
    checks.push('Vy '+name+' i '+await page.evaluate(()=>window.VagvisApp.getModel()));
  }
}
async function main(){
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const page=await context.newPage();
  page.setDefaultTimeout(60000);
  page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto(pathToFileURL(path.join(root,'app/Vagvis.html')).href,{waitUntil:'load'});
    await page.waitForFunction(()=>window.VagvisApp&&window.VagvisApp.ready);
    await page.evaluate(async()=>{await window.VagvisApp.ready;return true;});
    assert.equal(await page.evaluate(()=>window.VagvisApp.getResult()?.version),'2.2.5');
    assert.ok((await page.locator('#view').innerText()).includes('Livscykel'));
    await page.screenshot({path:path.join(out,'granssnitt-A-oversikt.png')});
    await views(page,['map','calc','parameters','data','method']);
    await page.locator('#method-footer').click();
    assert.equal(await page.locator('#page-title').innerText(),'Metod & källor');
    checks.push('Metodknapp längst ner');
    await page.locator('[data-model="household"]').click();
    await page.evaluate(()=>{window.VagvisApp.getConfig().iterations=100;});
    await page.evaluate(async()=>{await window.VagvisApp.run();return true;});
    assert.equal(await page.evaluate(()=>window.VagvisApp.getResult()?.model),'household');
    await page.locator('.nav[data-view="overview"]').click();
    await page.screenshot({path:path.join(out,'granssnitt-B-oversikt.png')});
    await views(page,['map','calc','parameters','measures','control','data','method']);
    // Räkneexemplen i B:s stegvisa beskrivning ska stämma med beräkningen, för varje nivå och kommun.
    {
      const close=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,msg+': '+a+' ≠ '+b);
      const num=x=>Number(x.replace(/[\s  ]/g,'').replace(',','.'));
      const N='([\\d\\s\\u00a0\\u202f]+(?:,\\d+)?)';
      await page.locator('.nav[data-view="calc"]').click();
      for(const city of ['1280','1283','2180']){
        await page.locator('[data-city="'+city+'"]').click();await page.locator('.nav[data-view="calc"]').click();
        const opts=await page.locator('#calc-area option').evaluateAll(o=>o.map(x=>x.value));
        for(const key of [opts.find(k=>k.startsWith('city')),opts.find(k=>k.startsWith('district')),opts.find(k=>k.startsWith('deso'))]){
          await page.selectOption('#calc-area',key);
          const t=await page.locator('#view').innerText(),res=await page.evaluate(k=>window.VagvisApp.getResult().results.find(r=>r.key===k).central,key);
          let m=t.match(new RegExp(N+' bilar × '+N+' km = '+N+' fordonskm'));assert.ok(m,'Fordonskm-exempel saknas '+key);
          close(num(m[3]),res.vkm,1,'Visade fordonskm '+key);close(num(m[1])*num(m[2]),res.vkm,num(m[1])*0.5+1,'bilar × km '+key);
          m=t.match(new RegExp(N+' fordonskm × '+N+' g CO₂e ÷ 1 000 000 = '+N+' t CO₂e'));assert.ok(m,'Utsläppsexempel saknas '+key);
          close(num(m[3]),res.total,0.06,'Visade ton '+key);close(num(m[1])*num(m[2])/1e6,res.total,Math.abs(res.total)*1e-4+0.06,'fordonskm × g/km '+key);
          m=t.match(new RegExp(N+' km × '+N+' mil ÷ '+N+' mil \\(riket\\) = '+N+' km per bil'));
          if(m)assert.equal(Math.round(num(m[1])*num(m[2])/num(m[3])),num(m[4]),'Körsträckeformel '+key);
          assert.ok(!/Stortorget,|Bilmodell|φ =/.test(t),'Inaktuell metodtext '+key);
        }
      }
      checks.push('Räkneexemplen i B stämmer med beräkningen för kommun, RegSO och DeSO');
    }
    await page.locator('.nav[data-view="measures"]').click();
    await page.locator('[data-preset="carsharing_pbl2015"]').click();
    await page.locator('#scenario-note').fill('Test med <tagg> & Öresund.');
    await page.locator('#scenario-note').press('Tab');
    await page.evaluate(async()=>{await window.VagvisApp.run();return true;});
    const result=await page.evaluate(()=>{
      const r=window.VagvisApp.getResult(),row=r.results.find(x=>x.level==='city');
      return {base:row.central,scenario:row.scenarioCentral,effects:r.effects};
    });
    near(result.scenario.cars/result.base.cars,.7);near(result.scenario.vkm/result.base.vkm,.825);
    near(result.scenario.total/result.base.total,.825);checks.push('PBL-scenario via riktiga knappar ger rätt faktor');
    await page.locator('#export').click();
    const auditPending=page.waitForEvent('download');
    await page.locator('#download-audit').click();
    const auditDownload=await auditPending,auditFile=await auditDownload.path();
    const audit=JSON.parse(fs.readFileSync(auditFile,'utf8'));
    assert.equal(audit.version,'2.2.5');assert.equal(audit.model,'household');assert.equal(audit.evidence.modelVersion,'2.2.5');
    assert.equal(audit.dirty,false);assert.ok(audit.result.results.length>0);
    checks.push('JSON-export med resultat, inställningar och källkvitto');
    const csvPending=page.waitForEvent('download');
    await page.locator('#download-csv').click();
    const csvDownload=await csvPending,csv=fs.readFileSync(await csvDownload.path(),'utf8');
    assert.ok(csv.split('\n').length>100,'CSV saknar områdesrader');
    assert.ok(/total|livscykel|co2/i.test(csv.split('\n')[0]),'CSV saknar utsläppskolumner');
    checks.push('CSV-export med områdesrader');
    const offlinePending=page.waitForEvent('download');
    await page.locator('#download-offline').click();
    const offlineDownload=await offlinePending,offlineFile=path.join(out,'export-offline.html');
    await offlineDownload.saveAs(offlineFile);
    const offline=await context.newPage();
    offline.on('pageerror',error=>errors.push(error.message));
    await offline.goto(pathToFileURL(offlineFile).href,{waitUntil:'load'});
    await offline.waitForFunction(()=>window.VagvisApp&&window.VagvisApp.ready);
    await offline.evaluate(async()=>{await window.VagvisApp.ready;return true;});
    assert.equal(await offline.evaluate(()=>window.VagvisApp.getModel()),'household');
    assert.equal(await offline.evaluate(()=>window.VagvisApp.getConfig().scenarioNote),'Test med <tagg> & Öresund.');
    assert.equal(await offline.evaluate(()=>window.VagvisApp.getConfig().areaScenario.bilpool.preset),'carsharing_pbl2015');
    assert.equal(await offline.evaluate(()=>window.VagvisApp.getResult()?.version),'2.2.5');
    assert.ok(await offline.evaluate(()=>window.VagvisApp.getProject().cities.some(city=>city.name==='Malmö')));
    await offline.close();
    checks.push('Offlineexport öppnas med samma modell, scenario och svenska tecken');
    await page.locator('#close-export').click();
    assert.deepEqual(errors,[]);
    if(process.argv.includes('--streamlit')){
      const server=await context.newPage();
      server.on('pageerror',error=>errors.push(error.message));
      await server.goto('http://127.0.0.1:8501',{waitUntil:'domcontentloaded'});
      const iframe=server.frameLocator('iframe[data-testid="stIFrame"]').first();
      await iframe.locator('#method-footer').waitFor({state:'visible',timeout:120000});
      await iframe.locator('#method-footer').click();
      assert.equal(await iframe.locator('#page-title').innerText(),'Metod & källor');
      assert.ok((await iframe.locator('#view').innerText()).includes('Vägvis'));
      await server.screenshot({path:path.join(out,'granssnitt-Streamlit.png')});
      checks.push('Streamlit levererar det riktiga gränssnittet i iframe');
      await server.close();
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'granssnitt.json'),JSON.stringify({version:'2.2.5',executedAt:new Date().toISOString(),browser:'Chromium via Playwright',passed:checks.length,checks,errors},null,2)+'\n');
    console.log(checks.length+' verkliga webbläsarkontroller godkända.');
  }finally{
    await browser.close();
  }
}
main().catch(error=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'granssnitt-fel.txt'),error.stack||String(error));console.error(error.stack||error);process.exitCode=1;});
