import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createFixtures} from './fixtures.js';
const {chromium}=await import(process.env.PLAYWRIGHT_PATH?pathToFileURL(process.env.PLAYWRIGHT_PATH).href:'playwright');
// Override these when testing an existing deployment or a specific browser.
let server;
const baseURL = process.env.BASE_URL || await new Promise((resolve, reject) => {
 server = spawn(process.execPath, ['scripts/serve.js'], {env: {...process.env, PORT: '0'}, stdio: ['ignore','pipe','pipe'], windowsHide: true});
 const timer = setTimeout(() => { server.kill(); reject(new Error('Preview server did not start')); }, 10000);
 let output = '';
 server.stdout.on('data', chunk => {
  output += chunk;
  const match = output.match(/Preview: (http:\/\/\S+)/);
  if (match) { clearTimeout(timer); resolve(match[1]); }
 });
 server.on('error', error => { clearTimeout(timer); reject(error); });
 server.on('exit', code => { clearTimeout(timer); reject(new Error('Preview server exited: ' + code)); });
 server.stderr.on('data', chunk => process.stderr.write(chunk));
});
let browser;
try {
browser=await chromium.launch({headless:true, ...(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {})});
const context=await browser.newContext({viewport:{width:1440,height:960},acceptDownloads:true});
const page=await context.newPage(),errors=[],requests=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>requests.push({url:request.url(),method:request.method(),body:request.postData(),referer:request.headers().referer}));
await mkdir('.qa',{recursive:true});
const {singleDefinition: definition, fullDefinition, consoleDefinition, consoleEmulatorDefinition, consoleRegistry, consoleDefinitions, catalog: original, registry, definitions} = createFixtures();
const mapping = definition.entries[0];
const payload = mapping.emulator;
const consoleMapping = fullDefinition.entries[0];
const platform = original.consoles.find(c => c.shortName === mapping.shortName);
const row = (side, id) => page.locator('#' + side + '-list [data-emulator-id=' + JSON.stringify(id) + ']');
const option = shortName => page.locator('#platform-menu [data-value=' + JSON.stringify(shortName) + ']');
const inputFile = {name:'configuration.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(original))};
// Intercept only catalog requests. The app, styles, and module loading stay real.
await page.route('**/emulators/**', route => {
 const pathname = new URL(route.request().url()).pathname;
 const id = pathname.split('/').at(-2);
 const json = pathname.endsWith('/index.json') ? registry : definitions.get(id);
 return json ? route.fulfill({json}) : route.fulfill({status:404,body:'Unknown fixture'});
});
await page.route('**/consoles/**', route => {
 const pathname = new URL(route.request().url()).pathname;
 const json = pathname.endsWith('/index.json') ? consoleRegistry : consoleDefinitions.get(pathname.split('/').at(-2));
 return json ? route.fulfill({json}) : route.fulfill({status:404,body:'Unknown console fixture'});
});
 await page.goto(baseURL);
 assert.equal(await page.locator('#workspace').isVisible(),false);
 await page.locator('#file-input').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{no')});
 await page.locator('#file-error').filter({hasText:'Could not parse JSON'}).waitFor();
 assert.equal(await page.locator('#file-input').getAttribute('multiple'),null);
 // Uploaded entries must match the complete database payload, not just its ID or merge result.
 for(const [kind,mutate,exact] of [
  ['exact',e=>e,true],
  ['reordered keys',e=>Object.fromEntries(Object.entries(e).reverse()),true],
  ['one changed command',e=>{e.commands[0].command+=' ';return e;},false],
  ['extra field',e=>({...e,localSetting:true}),false],
  ['extra command field',e=>{e.commands[0].localSetting=true;return e;},false],
  ['extra package',e=>{e.packages.push('local.package');return e;},false],
  ['missing field',e=>{delete e.packages;return e;},false]
 ]) {
  const catalog=structuredClone(original);
  catalog.consoles[0].emulators=[mutate(structuredClone(payload))];
  await page.locator('#file-input').setInputFiles({name:kind+'.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(catalog))});
  await page.locator('#replace-file:not(:disabled)').waitFor();
  const control=row('database',payload.id).locator(exact?'.added':'.add');
  await control.waitFor();
  assert.equal(await control.isDisabled(),exact,kind);
  assert.equal(await row('database',payload.id).getByRole('button',{name:/Already added:/}).count(),exact?1:0,kind);
  if(kind==='extra field') {
   await control.click();
   await page.locator('#toasts').filter({hasText:'Your entry differs from the database'}).waitFor();
   assert.equal(await page.locator('#workspace-status').textContent(),'No changes');
   assert.equal(await row('database',payload.id).locator('.added').count(),0);
  }
 }
 await page.locator('#file-input').setInputFiles(inputFile);
 await row('config',payload.id).waitFor({state:'detached'});
 await page.locator('#workspace').waitFor();
 await page.locator('#database-list .emulator-row').first().waitFor();
 assert.equal(await page.locator('#database-count').textContent(),registry.emulators.length + ' emulators');
 assert.equal(await page.locator('#database-list .emulator-row').count(),[...definitions.values()].reduce((sum,d)=>sum+d.entries.length,0));
 // Status help appears immediately on hover/focus, including unknown values.
 for (const [status, text] of [[0,'Not Working'],[1,'Needs Testing'],[2,'Fully Working'],[undefined,'Missing Info'],['0','Missing Info'],[3,'Missing Info']]) {
  definition.status = status;
  await page.reload();
  const dot = row('database',payload.id).locator('.emulator-status');
  const tooltip = dot.getByRole('tooltip');
  await dot.hover();
  await tooltip.waitFor({state:'visible'});
  assert.equal(await tooltip.textContent(),text);
  assert.equal(await dot.getAttribute('aria-label'),text);
  await page.mouse.move(0,0);
  await tooltip.waitFor({state:'hidden'});
  await dot.focus();
  await tooltip.waitFor({state:'visible'});
  await page.keyboard.press('Escape');
  await tooltip.waitFor({state:'hidden'});
 }
 delete definition.status;
 await page.setViewportSize({width:390,height:844});
 const statusDot=row('database',payload.id).locator('.emulator-status');
 await statusDot.hover();
 const statusTooltip=statusDot.getByRole('tooltip');
 await statusTooltip.waitFor({state:'visible'});
 const tooltipBounds=await statusTooltip.boundingBox();
 assert.ok(tooltipBounds.x>=0 && tooltipBounds.x+tooltipBounds.width<=390 && tooltipBounds.y>=0 && tooltipBounds.y+tooltipBounds.height<=844);
 await page.screenshot({path:'.qa/status-tooltip-mobile.png',animations:'disabled'});
 await page.mouse.move(0,0);
 await page.setViewportSize({width:1440,height:960});
 assert.equal(await page.locator('#config-list .emulator-status').count(),0);
 const trigger=page.getByRole('combobox',{name:'Filter by console'});
 await trigger.click();
 await option(mapping.shortName).click();
 await trigger.click();
 const bounds=await page.locator('#platform-menu').boundingBox();
 assert.ok(bounds.height<=320 && bounds.y+bounds.height<=960);
 const selected=await page.locator('#platform-menu [aria-selected="true"]').boundingBox();
 assert.ok(selected.y>=bounds.y && selected.y+selected.height<=bounds.y+bounds.height);
 await page.keyboard.press('Home');await page.keyboard.press('Escape');
 assert.equal(await page.locator('.platform-label').textContent(),platform.longName);
 const databaseRow=row('database',payload.id);
 const configRow=row('config',payload.id);
 await databaseRow.locator('.info').click();
 assert.equal(await page.locator('#detail-title').textContent(),payload.name);
 assert.equal(await page.locator('#detail-content select, #detail-content input, #detail-content textarea, #detail-content .detail-action').count(),0);
 assert.deepEqual(JSON.parse(await page.locator('#detail-content pre').textContent()),payload);
 assert.equal(await page.locator('#detail-content .detail-description').textContent(),definition.description);
 await page.screenshot({path:'.qa/description-info.png',animations:'disabled'});
 await page.keyboard.press('Escape');
 await context.setOffline(true);
 await databaseRow.locator('.add').click();
 await configRow.waitFor();
 assert.equal(await databaseRow.locator('.added').isDisabled(),true);
 assert.equal(await page.locator('#workspace-status').textContent(),'1 change');
 await context.setOffline(false);
 // The documentation return link creates a fresh editor document in the same tab.
 await page.locator('#search').fill(payload.name.toLowerCase());
 await page.getByRole('link',{name:'Documentation',exact:true}).click();
 await page.getByRole('link',{name:'← Back to iiSU Emulator Editor'}).click();
 await configRow.waitFor();
 assert.equal(await page.locator('#workspace-status').textContent(),'1 change');
 assert.equal(await page.locator('#search').inputValue(),payload.name.toLowerCase());
 assert.equal(await page.locator('.platform-label').textContent(),platform.longName);
 await page.reload();await configRow.waitFor();
 await page.locator('#undo').click();
 assert.equal(await configRow.count(),0);
 assert.equal(await page.locator('#workspace-status').textContent(),'No changes');
 await databaseRow.locator('.add').click();await configRow.waitFor();
 await page.locator('#search').fill('');
 // A separately opened tab has its own session, even in the same browser context.
 const freshTab=await context.newPage();await freshTab.goto(baseURL);
 await freshTab.locator('#upload-zone:not(:disabled)').waitFor();
 assert.equal(await freshTab.locator('#workspace').isVisible(),false);
 await freshTab.close();
 await configRow.locator('.info').click();
 assert.deepEqual(JSON.parse(await page.locator('#detail-content pre').first().textContent()),payload);
 assert.equal(await page.locator('#detail-content pre').count(),1);
 assert.equal(await page.locator('#detail-content .detail-description').count(),0);
 await page.keyboard.press('Escape');
 await page.locator('#nav-changes').click();
 assert.equal(await page.locator('#preview-dialog .diff-block').count(),1);
 await page.keyboard.press('Escape');
 const output=page.waitForEvent('download');
 await page.locator('#download-config').click();
 const download=await output;
 assert.equal(download.suggestedFilename(),inputFile.name);
 await download.saveAs('.qa/browser-export.json');
 const exported=JSON.parse((await readFile('.qa/browser-export.json','utf8')).replace(/^\uFEFF/,''));
 const expected=structuredClone(original);expected.consoles.find(c=>c.shortName===mapping.shortName).emulators.push(payload);
 assert.deepEqual(exported,expected);
 await page.locator('#file-input').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{no')});
 await page.locator('#workspace-error').waitFor();
 assert.equal(await page.locator('#workspace-status').textContent(),'1 change');
 await page.locator('#file-input').setInputFiles(inputFile);
 await page.locator('#cancel-confirm').click();
 assert.equal(await page.locator('#workspace-status').textContent(),'1 change');
 await page.screenshot({path:'.qa/browser-workspace.png'});
 await configRow.locator('.remove').click();
 assert.equal(await configRow.count(),0);
 assert.equal(await page.locator('#workspace-status').textContent(),'No changes');
 await page.locator('#undo').click();await configRow.waitFor();
 await page.locator('#undo').click();
 assert.equal(await configRow.count(),0);
 assert.equal(await page.locator('#workspace-status').textContent(),'No changes');
 await page.locator('#search').fill('no-such-emulator');
 await page.getByText('No matching emulators.',{exact:true}).waitFor();
 await page.locator('#search').fill('');await databaseRow.waitFor();
 await page.locator('#nav-file').click();
 await page.getByRole('button',{name:'View JSON',exact:true}).first().click();
 assert.match(await page.locator('#preview-content pre').textContent(),/"consoles"/);
 await page.keyboard.press('Escape');
 for(const width of [320,390,768,1024]){
  await page.setViewportSize({width,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 await page.setViewportSize({width:390,height:844});
 await trigger.click();
 const mobile=await page.locator('#platform-menu').boundingBox();
 assert.ok(mobile.x>=0&&mobile.x+mobile.width<=390&&mobile.y+mobile.height<=844&&mobile.height<=320);
 await page.locator('#search').click();
 assert.equal(await trigger.getAttribute('aria-expanded'),'false');
 await databaseRow.locator('.info').click();
 for(let i=0;i<8;i++){await page.keyboard.press('Tab');assert.equal(await page.locator('#detail-dialog').evaluate(e=>e.contains(document.activeElement)),true);}
 await page.keyboard.press('Escape');
 assert.equal(await databaseRow.locator('.info').evaluate(e=>e===document.activeElement),true);
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('#download-config').evaluate(e=>getComputedStyle(e).animationName),'none');
 await page.reload();await page.locator('#workspace').waitFor();
 const drop=await page.evaluateHandle(()=>{const dt=new DataTransfer();dt.items.add(new File(['{"consoles":[]}'],'emuladores.json',{type:'application/json'}));return dt;});
 await page.locator('#upload-zone').dispatchEvent('drop',{dataTransfer:drop});
 await page.locator('#workspace').waitFor();
 assert.equal(await page.locator('#config-count').textContent(),'0');
 // Console headers and emulator rows are independent, even with an empty catalog.
 const consoleHeader=side=>page.locator('#'+side+'-list [data-console-header="'+consoleMapping.shortName+'"]');
 const databaseHeader=consoleHeader('database'), configHeader=consoleHeader('config');
 const consoleEmulator=consoleEmulatorDefinition.entries[0].emulator;
 const emulatorRow=row('database',consoleEmulator.id);
 await databaseHeader.waitFor();
 await trigger.click();await option(consoleMapping.shortName).click();
 assert.equal(await emulatorRow.locator('.add').isDisabled(),true);
 assert.equal(await page.locator('#database-list [data-emulator-id^="console:"]').count(),0);
 await databaseHeader.locator('.info').click();
 assert.deepEqual(JSON.parse(await page.locator('#detail-content pre').textContent()),consoleDefinition.console);
 assert.equal(await page.locator('#detail-content .detail-description').textContent(),consoleDefinition.description);
 await page.keyboard.press('Escape');
 assert.equal(await databaseHeader.locator('.info').evaluate(e=>e===document.activeElement),true);
 await emulatorRow.locator('.info').click();
 assert.deepEqual(JSON.parse(await page.locator('#detail-content pre').textContent()),consoleEmulator);
 assert.equal(await page.locator('#detail-content .detail-description').textContent(),consoleEmulatorDefinition.description);
 await page.keyboard.press('Escape');
 await databaseHeader.locator('.add').click();await configHeader.waitFor();
 assert.equal(await databaseHeader.locator('.added').isDisabled(),true);
 assert.equal(await page.locator('#config-count').textContent(),'0');
 await emulatorRow.locator('.add').click();await row('config',consoleEmulator.id).waitFor();
 assert.equal(await databaseHeader.locator('.added').isDisabled(),true);
 const addedConsole={...consoleDefinition.console,emulators:[consoleEmulator]};
 await configHeader.locator('.info').click();
 assert.deepEqual(JSON.parse(await page.locator('#detail-content pre').textContent()),addedConsole);
 assert.equal(await page.locator('#detail-content .detail-description').count(),0);
 await page.keyboard.press('Escape');
 await page.locator('#nav-changes').click();
 assert.deepEqual(JSON.parse(await page.locator('#preview-dialog .diff-block pre').last().textContent()),addedConsole);
 await page.keyboard.press('Escape');
 const consoleOutput=page.waitForEvent('download');await page.locator('#download-config').click();
 await (await consoleOutput).saveAs('.qa/console-export.json');
 assert.deepEqual(JSON.parse(await readFile('.qa/console-export.json','utf8')),{consoles:[addedConsole]});
 await page.screenshot({path:'.qa/console-mobile.png',animations:'disabled'});
 await page.setViewportSize({width:1440,height:960});
 await page.screenshot({path:'.qa/console-headers.png',animations:'disabled'});
 // Whole removal is confirmed, exports no console, and undoes with all emulators.
 await configHeader.locator('.remove').click();await page.locator('#cancel-confirm').click();
 await page.locator('#confirm-dialog').waitFor({state:'hidden'});
 assert.equal(await configHeader.count(),1);
 await configHeader.locator('.remove').click();await page.locator('#accept-confirm').click();
 await configHeader.waitFor({state:'detached'});
 assert.equal(await row('config',consoleEmulator.id).count(),0);
 assert.equal(await page.locator('#workspace-status').textContent(),'No changes');
 await page.locator('#undo').click();await row('config',consoleEmulator.id).waitFor();
 assert.equal(await databaseHeader.locator('.added').isDisabled(),true);
 await page.locator('#undo').click();assert.equal(await row('config',consoleEmulator.id).count(),0);
 await page.locator('#undo').click();assert.equal(await configHeader.count(),0);
 // Replace incorrect metadata and all current emulators, without duplicating a case variant.
 const localConsole={shortName:consoleMapping.shortName.toUpperCase(),longName:'Wrong platform',romExtensions:['.wrong'],obsolete:true,emulators:[consoleEmulator,payload]};
 const localCatalog={rootSetting:42,consoles:[localConsole,...original.consoles]};
 await page.locator('#file-input').setInputFiles({name:'existing.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(localCatalog))});
 await databaseHeader.locator('.add').click();
 assert.match(await page.locator('#confirm-message').textContent(),/2 current emulator/);
 await page.locator('#cancel-confirm').click();await page.locator('#confirm-dialog').waitFor({state:'hidden'});
 assert.equal(await page.locator('#workspace-status').textContent(),'No changes');
 await databaseHeader.locator('.add').click();await page.locator('#accept-confirm').click();
 await databaseHeader.locator('.added').waitFor();
 assert.equal(await row('config',consoleEmulator.id).count(),0);
 const replacedOutput=page.waitForEvent('download');await page.locator('#download-config').click();
 await (await replacedOutput).saveAs('.qa/console-replaced.json');
 assert.deepEqual(JSON.parse(await readFile('.qa/console-replaced.json','utf8')),{rootSetting:42,consoles:[consoleDefinition.console,...original.consoles]});
 await emulatorRow.locator('.add').click();await row('config',consoleEmulator.id).waitFor();
 await page.locator('#nav-changes').click();await page.getByRole('button',{name:'Undo all',exact:true}).click();
 await page.locator('#accept-confirm').click();await page.locator('#preview-dialog').waitFor({state:'hidden'});
 assert.equal(await page.locator('#workspace-status').textContent(),'No changes');
 await configHeader.locator('.info').click();
 assert.deepEqual(JSON.parse(await page.locator('#detail-content pre').textContent()),localConsole);
 await page.keyboard.press('Escape');
 // Existing consoles without a database template still have whole-console removal and info.
 const otherHeader=page.locator('#config-list [data-console-header="other"]');
 await otherHeader.locator('.remove').click();await page.locator('#accept-confirm').click();
 await otherHeader.waitFor({state:'detached'});
 await page.locator('#undo').click();await otherHeader.waitFor();
 await page.route('**/' + registry.emulators.find(entry=>definitions.get(entry.id)===definition).path + '*',route=>route.fulfill({json:{description:'Invalid entry',entries:[]}}));
 await page.reload();await page.locator('#file-input').setInputFiles(inputFile);
 await page.locator('#library-error').waitFor();
 assert.equal(await page.locator('#database-list .emulator-row').count(),[...definitions.values()].filter(d=>d!==definition).reduce((sum,d)=>sum+d.entries.length,0));
 assert.equal(await page.locator('.row-icon, .emulator-row img').count(),0);
 assert.deepEqual(errors,[]);
 assert.ok(requests.every(r=>r.method==='GET'&&!r.body&&new URL(r.url).origin===new URL(baseURL).origin));
 // Documentation styles are served separately from the editor's versioned assets.
 const assetRequests=requests.filter(r=>!new URL(r.referer || baseURL).pathname.includes('/docs/')).map(r=>new URL(r.url)).filter(url=>/\.(js|css|json)$/.test(url.pathname));
 const assetVersion=assetRequests.find(url=>url.pathname.endsWith('/js/app.js')).searchParams.get('v');
 assert.match(assetVersion,/^[a-f0-9]{16}$/);
 assert.ok(assetRequests.every(url=>url.searchParams.get('v')===assetVersion));
 // Legacy full-console packages with multiple emulators still expose independent row actions.
 const legacy=structuredClone(fullDefinition);
 legacy.entries[0].emulators.push({...structuredClone(payload),id:'SECOND-LEGACY',name:'Second Legacy Emulator'});
 await page.route('**/sample-console/emulator.json*',route=>route.fulfill({json:legacy}));
 await page.reload();await page.locator('#file-input').setInputFiles({name:'empty.json',mimeType:'application/json',buffer:Buffer.from('{"consoles":[]}')});
 await databaseHeader.locator('.add').click();
 await row('database','SECOND-LEGACY').locator('.add').click();
 await row('config','SECOND-LEGACY').waitFor();
 assert.equal(await row('config',consoleEmulator.id).count(),0);
 assert.equal(await row('database',consoleEmulator.id).locator('.add').isEnabled(),true);
 await row('database',consoleEmulator.id).locator('.add').click();await row('config',consoleEmulator.id).waitFor();
 assert.equal(await page.locator('#config-count').textContent(),'2');
 assert.deepEqual(errors,[]);
 // Storage restrictions must warn without preventing editing or downloads.
 const blockedTab=await context.newPage();
 await blockedTab.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new DOMException('Full','QuotaExceededError');};});
 await blockedTab.goto(baseURL);
 await blockedTab.locator('#upload-zone:not(:disabled)').waitFor();
 await blockedTab.locator('#file-input').setInputFiles(inputFile);
 await blockedTab.locator('#workspace').waitFor();
 await blockedTab.locator('#session-warning').filter({hasText:'Download your JSON'}).waitFor();
 assert.equal(await blockedTab.locator('#download-config').isEnabled(),true);
 await blockedTab.close();
 await writeFile('.qa/browser-results.json',JSON.stringify({passed:true,errors,checks:['custom-only database','exact emulator payload','single-file upload','invalid JSON','platform filter','read-only info','offline add','duplicate detection','exact JSON export','invalid replacement','cancel replacement','remove','undo','search','file preview','mobile','keyboard','reduced motion','documentation return and refresh persistence','restored undo history','separate tab isolation','storage failure warning','drag/drop','invalid definition handling','no uploads']},null,2));
 console.log('Sample emulator and full console browser checks passed.');
}finally{await browser?.close();server?.kill();}

