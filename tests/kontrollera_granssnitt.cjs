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
    assert.equal(await page.evaluate(()=>window.VagvisApp.getResult()?.version),'2.2.0');
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
    assert.equal(audit.version,'2.2.0');assert.equal(audit.model,'household');assert.equal(audit.evidence.modelVersion,'2.2.0');
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
    assert.equal(await offline.evaluate(()=>window.VagvisApp.getResult()?.version),'2.2.0');
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
    fs.writeFileSync(path.join(out,'granssnitt.json'),JSON.stringify({version:'2.2.0',executedAt:new Date().toISOString(),browser:'Chromium via Playwright',passed:checks.length,checks,errors},null,2)+'\n');
    console.log(checks.length+' verkliga webbläsarkontroller godkända.');
  }finally{
    await browser.close();
  }
}
main().catch(error=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'granssnitt-fel.txt'),error.stack||String(error));console.error(error.stack||error);process.exitCode=1;});
