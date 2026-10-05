import test from 'node:test';
import assert from 'node:assert/strict';
import {readConfig} from '../js/config-loader.js';
import {validateConfig} from '../js/config-validator.js';
import {validateDefinition} from '../js/emulator-loader.js';
import {clone,equal,planChange,planRemoval,planConsoleChange,planConsoleRemoval,applyPlan,rebuild,changesBetween} from '../js/config-merger.js';
import {validateConsoleDefinition} from '../js/console-loader.js';
import {serializeConfig} from '../js/download.js';
import {createFixtures} from './fixtures.js';
const {singleDefinition, fullDefinition} = createFixtures();
const payload = singleDefinition.entries[0].emulator;
const fixture = () => createFixtures().catalog;
const makeFile=(value,name='emuladores.json')=>new File([typeof value==='string'?value:JSON.stringify(value)],name,{type:'application/json'});

test('catalog fetches revalidate caches and inherit the deployed module version',async t=>{
 const requests=[];
 const {registry, definitions} = createFixtures();
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  requests.push({url:new URL(url),options});
  return {ok:true,json:async()=>url.pathname.endsWith('/index.json') ? registry : definitions.get(url.pathname.split('/').at(-2))};
 });
 const {loadEmulators}=await import('../js/emulator-loader.js?v=deployment-test');
 const result=await loadEmulators();
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.definitions,[...definitions.values()]);
 assert.equal(requests.length,registry.emulators.length + 1);
 for(const request of requests){assert.equal(request.url.search,'?v=deployment-test');assert.equal(request.options.cache,'no-cache');}
});

test('add changes only the chosen emulator array and never mutates the input',()=>{
 const original=fixture(),snapshot=clone(original),modified=applyPlan(original,planChange(original,singleDefinition,'sample-platform'));
 const expected=clone(original);expected.consoles[0].emulators.push(payload);
 assert.deepEqual(original,snapshot);assert.deepEqual(modified,expected);
 assert.equal(changesBetween(original,modified).length,1);
});

test('matching IDs preserve unknown fields, extra commands and packages',()=>{
 const original=fixture(),entry=clone(payload);entry.id='sample-emulator';entry.customSetting={x:1};entry.commands[0].command='old';entry.commands[0].unknown=3;entry.commands.push({description:'Local command',command:'custom'});entry.packages.push('local.package');original.consoles[0].emulators.push(entry);
 const plan=planChange(original,singleDefinition,'sample-platform');assert.equal(plan.needsConfirmation,true);
 const modified=applyPlan(original,plan),updated=modified.consoles[0].emulators[0];
 assert.equal(modified.consoles[0].emulators.length,1);assert.deepEqual(updated.customSetting,{x:1});assert.equal(updated.commands[0].unknown,3);assert.equal(updated.commands[0].command,payload.commands[0].command);assert.ok(updated.commands.some(c=>c.description==='Local command'));assert.ok(updated.packages.includes('local.package'));
});

test('duplicate add is a no-op; undo restores the original',()=>{
 const original=fixture(),action=planChange(original,singleDefinition,'sample-platform'),next=applyPlan(original,action);
 const duplicate=planChange(next,singleDefinition,'sample-platform');assert.equal(duplicate.entryChanged,false);assert.deepEqual(applyPlan(next,duplicate),next);
 assert.deepEqual(rebuild(original,[]),original);assert.deepEqual(rebuild(original,[action]),next);assert.throws(()=>planChange(original,singleDefinition,'missing'),/not present/);
});

test('exact match checks every emulator field, independently of merge results',()=>{
 const check=entry=>{
  const catalog=fixture();catalog.consoles[0].emulators=[entry];
  return planChange(catalog,singleDefinition,'sample-platform');
 };
 assert.equal(check(clone(payload)).exactMatch,true);
 assert.equal(planChange(fixture(),singleDefinition,'sample-platform').exactMatch,false);
 for(const mutate of [
  e=>e.name+=' ', e=>e.id=e.id.toLowerCase(), e=>e.routeType='other',
  e=>e.commands[0].command+=' ', e=>e.commands[0].description+=' ',
  e=>e.commands[0].extra=false, e=>e.commands.push({description:'Local',command:'local'}),
  e=>e.packages.push('local.package'), e=>delete e.packages,
  e=>e.extra=null, e=>e.extra={nested:[false,1,'1']}
 ]) {
  const entry=clone(payload);mutate(entry);
  assert.equal(check(entry).exactMatch,false,JSON.stringify(entry));
 }
 const custom=clone(payload);custom.extra=true;
 assert.equal(check(custom).entryChanged,false);
 assert.equal(check(custom).exactMatch,false);
 // Updating a known field must not hide a remaining custom-field difference.
 custom.name='Old name';
 assert.equal(check(check(custom).afterEntry).exactMatch,false);
});

test('JSON equality ignores object key order but preserves types and array order',()=>{
 const reversed=value=>Array.isArray(value)?value.map(reversed):value && typeof value==='object'
  ? Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reversed(item)])):value;
 assert.equal(equal(payload,reversed(payload)),true);
 const original=fixture();original.consoles[0].emulators=[reversed(payload)];
 assert.equal(planChange(original,singleDefinition,'sample-platform').exactMatch,true);
 assert.equal(planChange(original,singleDefinition,'sample-platform').entryChanged,false);
 for(const [a,b] of [[1,'1'],[false,0],[null,{}],[[],{}],[[1,2],[2,1]],[{a:null},{}],[{a:1},{b:1}]]) {
  assert.equal(equal(a,b),false);
 }
 const {consoleDefinition}=createFixtures(),template=consoleDefinition.console;
 const catalog={consoles:[reversed(template)]};
 assert.equal(planConsoleChange(catalog,template).entryChanged,false);
 for(const mutate of [c=>c.longName+=' ',c=>c.extra=true,c=>c.emulators.push(clone(payload)),c=>c.customMetadata.preserve=false]) {
  const entry=clone(template);mutate(entry);
  assert.equal(planConsoleChange({consoles:[entry]},template).entryChanged,true);
 }
});

test('console added status ignores only emulators and compares all metadata exactly',()=>{
 const {consoleDefinition}=createFixtures(),template=consoleDefinition.console;
 const check=entry=>planConsoleChange({consoles:[entry]},template);
 assert.equal(planConsoleChange({consoles:[]},template).exactMatch,false);
 const entry=clone(template);entry.emulators=[clone(payload)];
 assert.equal(check(entry).exactMatch,true);
 entry.emulators[0].commands[0].command='custom';
 assert.equal(check(entry).exactMatch,true);
 // Full replacement planning still tracks the emulator list independently of status.
 assert.equal(check(entry).entryChanged,true);
 for(const mutate of [c=>c.longName+=' ',c=>delete c.manufacturer,c=>c.extra=true,c=>c.customMetadata.preserve=false,c=>c.romExtensions.push('.local')]) {
  const different=clone(entry);mutate(different);
  assert.equal(check(different).exactMatch,false);
 }
 assert.equal(check(Object.fromEntries(Object.entries(entry).reverse())).exactMatch,true);
});

test('undo retains remaining console changes',()=>{
 const original=fixture(),definition=clone(singleDefinition);definition.entries.push({...clone(singleDefinition.entries[0]),shortName:'other'});
 const a=planChange(original,definition,'sample-platform'),b=planChange(original,definition,'other');
 const next=rebuild(original,[a]);assert.equal(next.consoles[0].emulators.length,1);assert.equal(next.consoles[1].emulators.length,0);assert.equal(changesBetween(original,rebuild(original,[a,b])).length,2);
});

test('malformed formats, versions, duplicate IDs and invalid definitions fail safely',()=>{
 assert.throws(()=>validateConfig([]),/recognize/);assert.throws(()=>validateConfig({consoles:[],version:2}),/Unsupported/);
 assert.throws(()=>validateConfig({consoles:[{shortName:'sample-platform',emulator:'Sample Emulator',commandLabel:'Sample Emulator',routeType:'uri',launchPreference:'Ask'}]}),/longName and emulators/);
 const data=fixture();data.consoles.push(clone(data.consoles[0]));assert.throws(()=>validateConfig(data),/Duplicate/);
 const duplicate=fixture();duplicate.consoles[0].emulators=[clone(payload),clone(payload)];assert.throws(()=>validateConfig(duplicate),/duplicate emulator/);
 assert.throws(()=>validateDefinition({...singleDefinition,entries:[]},'sample-emulator'),/non-empty entries/);
 assert.throws(()=>validateDefinition({...singleDefinition,entries:[null]},'sample-emulator'),/invalid or duplicate/);
 assert.throws(()=>validateDefinition({...singleDefinition,entries:[singleDefinition.entries[0],singleDefinition.entries[0]]},'sample-emulator'),/invalid or duplicate/);
 assert.throws(()=>validateDefinition({...singleDefinition,description:42},'sample-emulator'),/missing description/);
});

test('loader validates one catalog and accepts renamed and empty catalogs',async()=>{
 const file=await readConfig(makeFile(fixture()));assert.deepEqual(file.data,fixture());assert.equal(file.name,'emuladores.json');
 const renamed=await readConfig(makeFile({consoles:[]},'backup.json'));assert.deepEqual(renamed.data,{consoles:[]});
 await assert.rejects(readConfig(makeFile('{bad')),/parse JSON/);await assert.rejects(readConfig(makeFile({consoles:[]},'notes.txt')),/\.json/);
 await assert.rejects(readConfig(makeFile('{"consoles":[],"id":9007199254740993}')),/numbers/);
 await assert.rejects(readConfig(makeFile('{"consoles":[],"consoles":[]}')),/Duplicate JSON/);
 await assert.rejects(readConfig(makeFile('{"consoles":[],"x":{"a":1,"\\u0061":2}}')),/Duplicate JSON/);
});

test('JSON export preserves exact unchanged text, edited CRLF/BOM and complete data',async()=>{
 const source='\ufeff'+JSON.stringify(fixture(),null,'\t').replace(/\n/g,'\r\n')+'\r\n';
 const file=await readConfig(makeFile(source));assert.equal(serializeConfig(file.data,file),source);
 const modified=applyPlan(file.data,planChange(file.data,singleDefinition,'sample-platform')),edited=serializeConfig(modified,file);
 assert.ok(edited.startsWith('\ufeff'));assert.ok(edited.includes('\r\n\t"consoles"'));assert.deepEqual(JSON.parse(edited.replace(/^\ufeff/,'')),modified);
 assert.equal(serializeConfig(rebuild(file.data,[]),file),source);
});

test('removal affects only the chosen entry and is fully reversible',()=>{
 const initial=fixture(),add=planChange(initial,singleDefinition,'sample-platform'),original=applyPlan(initial,add),snapshot=clone(original);
 original.consoles[0].emulators.push({...clone(payload),id:'OTHER',name:'Other'});
 const remove=planRemoval(original,'sample-platform','sample-emulator'),modified=applyPlan(original,remove);
 assert.deepEqual(modified.consoles[0].emulators,[original.consoles[0].emulators[1]]);assert.equal(original.consoles[0].emulators.length,2);
 assert.equal(changesBetween(original,modified).length,1);assert.equal(changesBetween(original,modified)[0].after,undefined);
 assert.deepEqual(rebuild(original,[]),original);assert.deepEqual(rebuild(initial,[add,planRemoval(snapshot,'sample-platform','SAMPLE-EMULATOR')]),initial);
 assert.throws(()=>planRemoval(original,'sample-platform','missing'),/no longer/);
});

test('full console addition preserves metadata, exports complete JSON and undoes atomically',async()=>{
 const original=fixture(),snapshot=clone(original),action=planChange(original,fullDefinition,'sample-console');
 const next=applyPlan(original,action),consoleEntry=next.consoles.at(-1);
 assert.deepEqual(original,snapshot);assert.deepEqual(consoleEntry,fullDefinition.entries[0]);
 assert.deepEqual(changesBetween(original,next),[{shortName:'sample-console',title:'Sample Console (console)',before:undefined,after:consoleEntry}]);
 const file=await readConfig(makeFile(original));assert.deepEqual(JSON.parse(serializeConfig(next,file)),next);
 assert.deepEqual(rebuild(original,[]),original);
 assert.deepEqual(rebuild(original,[action]),next);
 const addSingle=planChange(next,singleDefinition,'sample-platform');
 assert.deepEqual(rebuild(original,[addSingle]),applyPlan(original,addSingle));
 assert.equal(planChange(next,fullDefinition,'sample-console').entryChanged,false);
 assert.deepEqual(applyPlan(next,action),next);
});

test('whole console replacement matches casing and whitespace and replaces incorrect settings',()=>{
 const original=fixture();original.consoles.push({shortName:' SaMpLe-CoNsOlE ',longName:'My games',manufacturer:'Mine',romExtensions:['.custom'],custom:42,emulators:[]});
 const action=planChange(original,fullDefinition,'sample-console'),next=applyPlan(original,action);
 assert.equal(next.consoles.length,original.consoles.length);
 assert.equal(action.needsConfirmation,true);
 assert.deepEqual(next.consoles.at(-1),fullDefinition.entries[0]);
 assert.deepEqual(action.beforeConsole,original.consoles.at(-1));
 assert.deepEqual(rebuild(original,[]),original);
 assert.equal(changesBetween(original,next).length,1);
 assert.equal(planChange(next,fullDefinition,'SAMPLE-CONSOLE').entryChanged,false);
 // A plan made while the console was absent must also reuse it when applied later.
 assert.deepEqual(applyPlan(original,planChange(fixture(),fullDefinition,'sample-console')),next);
});

test('console replacement is exact and removes stale fields and extra emulators',()=>{
 const definition=clone(fullDefinition);definition.entries[0].emulators.push({...clone(payload),id:'SECOND'});
 const original=applyPlan(fixture(),planChange(fixture(),fullDefinition,'sample-console'));
 const c=original.consoles.at(-1);c.emulators[0].commands[0].command='custom';c.emulators[0].packages.push('local.package');c.emulators[0].extra=true;
 c.emulators.push({...clone(payload),id:'LOCAL'});
 const snapshot=clone(original),plan=planChange(original,definition,'sample-console');assert.equal(plan.needsConfirmation,true);
 const next=applyPlan(original,plan),updated=next.consoles.at(-1);
 assert.equal(updated.emulators.length,2);assert.equal(updated.emulators[0].extra,undefined);
 assert.ok(!updated.emulators[0].packages.includes('local.package'));
 assert.deepEqual(updated,definition.entries[0]);
 assert.equal(updated.emulators[0].commands[0].command,fullDefinition.entries[0].emulators[0].commands[0].command);
 assert.deepEqual(original,snapshot);assert.deepEqual(applyPlan(next,plan),next);
});

test('console replacement can preserve the exact existing emulators while replacing all metadata',()=>{
 const incoming=clone(fullDefinition.entries[0]);
 const local=clone(incoming);
 local.shortName=' SAMPLE-CONSOLE ';local.longName='Old name';local.obsolete=true;
 local.emulators[0].commands[0].command='custom command';
 local.emulators[0].packages.push('local.package');local.emulators[0].extra={setting:true};
 local.emulators.unshift({...clone(payload),id:'LOCAL'});
 const original={rootSetting:42,consoles:[local,...fixture().consoles]};
 const snapshot=clone(original),templateSnapshot=clone(incoming);
 const plan=planConsoleChange(original,incoming,{keepEmulators:true});
 const next=applyPlan(original,plan);
 assert.deepEqual(next,{...original,consoles:[{...incoming,emulators:local.emulators},...original.consoles.slice(1)]});
 assert.equal(plan.needsConfirmation,true);assert.equal(plan.entryChanged,true);
 assert.equal(next.consoles[0].obsolete,undefined);
 assert.deepEqual(rebuild(original,JSON.parse(JSON.stringify([plan]))),next);
 assert.deepEqual(rebuild(original,[]),snapshot);
 assert.deepEqual(original,snapshot);assert.deepEqual(incoming,templateSnapshot);
 next.consoles[0].emulators[0].name='Changed after applying';
 assert.deepEqual(plan.consoleEntry.emulators,local.emulators);
 const unchanged=planConsoleChange({consoles:[incoming]},incoming,{keepEmulators:true});
 assert.equal(unchanged.entryChanged,false);assert.equal(unchanged.needsConfirmation,false);
 // Empty local lists stay empty; missing consoles still receive template defaults.
 const empty={consoles:[{...local,emulators:[]}]};
 assert.deepEqual(applyPlan(empty,planConsoleChange(empty,incoming,{keepEmulators:true})).consoles[0].emulators,[]);
 assert.deepEqual(applyPlan({consoles:[]},planConsoleChange({consoles:[]},incoming,{keepEmulators:true})).consoles[0],incoming);
});

test('separate console template can replace metadata, add an emulator, remove everything and undo each step',()=>{
 const {consoleDefinition,consoleEmulatorDefinition}=createFixtures();
 validateConsoleDefinition(consoleDefinition,'sample-console');
 const original={rootSetting:42,consoles:[{shortName:'SAMPLE-CONSOLE',longName:'Wrong',romExtensions:['.wrong'],obsolete:true,emulators:[clone(payload)]},...fixture().consoles]};
 const snapshot=clone(original),replace=planConsoleChange(original,consoleDefinition.console);
 assert.equal(replace.needsConfirmation,true);
 const replaced=applyPlan(original,replace);
 assert.equal(replaced.consoles.length,original.consoles.length);
 assert.deepEqual(replaced.consoles[0],consoleDefinition.console);
 assert.deepEqual(replaced.consoles.slice(1),original.consoles.slice(1));
 assert.deepEqual(changesBetween(original,replaced),[{shortName:'sample-console',title:'Sample Console (console)',before:original.consoles[0],after:replaced.consoles[0]}]);
 const add=planChange(replaced,consoleEmulatorDefinition,'sample-console'),added=applyPlan(replaced,add);
 assert.deepEqual(added.consoles[0].emulators,[consoleEmulatorDefinition.entries[0].emulator]);
 const remove=planConsoleRemoval(added,' SAMPLE-CONSOLE '),removed=applyPlan(added,remove);
 assert.deepEqual(removed,{rootSetting:42,consoles:original.consoles.slice(1)});
 assert.deepEqual(changesBetween(original,removed),[{shortName:'SAMPLE-CONSOLE',title:'Wrong (console)',before:original.consoles[0],after:undefined}]);
 assert.deepEqual(rebuild(original,[replace,add,remove]),removed);
 assert.deepEqual(rebuild(original,[replace,add]),added);
 assert.deepEqual(rebuild(original,[replace]),replaced);
 assert.deepEqual(rebuild(original,[]),snapshot);
 assert.deepEqual(original,snapshot);
 assert.throws(()=>planConsoleRemoval(removed,'sample-console'),/no longer/);
});

test('new console add/remove returns to unchanged and metadata-only replacements are tracked',()=>{
 const {consoleDefinition}=createFixtures(),original=fixture();
 const add=planConsoleChange(original,consoleDefinition.console),added=applyPlan(original,add);
 const removed=applyPlan(added,planConsoleRemoval(added,'sample-console'));
 assert.deepEqual(removed,original);assert.deepEqual(changesBetween(original,removed),[]);
 const corrected=clone(added.consoles.at(-1));corrected.manufacturer='Corrected';
 const changed=applyPlan(added,planConsoleChange(added,corrected));
 assert.equal(changesBetween(added,changed).length,1);
 assert.deepEqual(changesBetween(added,changed)[0].after,corrected);
});

test('separate console definitions validate and descriptions stay outside exported data',()=>{
 const {consoleDefinition}=createFixtures();
 for(const definition of [null,{}, {...consoleDefinition,description:7},{...consoleDefinition,console:{shortName:'broken'}}]) assert.throws(()=>validateConsoleDefinition(definition,'bad'));
 const modified=applyPlan({consoles:[]},planConsoleChange({consoles:[]},consoleDefinition.console));
 assert.equal(Object.hasOwn(modified.consoles[0],'description'),false);
});

test('console registry rejects duplicate identities, reports malformed templates and retains valid ones',async t=>{
 const {consoleDefinition}=createFixtures();const requests=[];
 const registry={schemaVersion:1,consoles:['first','duplicate','broken'].map(id=>({id,path:id+'/console.json'}))};
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  requests.push({url:new URL(url),options});
  const id=url.pathname.split('/').at(-2);
  return {ok:true,json:async()=>url.pathname.endsWith('/index.json') ? registry : id==='broken' ? {description:'Broken',console:{shortName:'broken'}} : id==='duplicate' ? {...consoleDefinition,console:{...consoleDefinition.console,shortName:' SAMPLE-CONSOLE '}} : consoleDefinition};
 });
 const {loadConsoles}=await import('../js/console-loader.js?v=console-test');
 const result=await loadConsoles();assert.deepEqual(result.definitions,[consoleDefinition]);
 assert.equal(result.errors.length,2);assert.ok(result.errors.some(error=>error.includes('Duplicate console')));
 for(const request of requests){assert.equal(request.url.search,'?v=console-test');assert.equal(request.options.cache,'no-cache');}
});

test('empty consoles and removal of the last emulator remain visible as console changes',()=>{
 const original={consoles:[]},definition={description:'Empty',entries:[{shortName:'empty',longName:'Empty',emulators:[]}]};
 validateDefinition(definition,'empty');
 const next=applyPlan(original,planChange(original,definition,'empty'));
 assert.equal(changesBetween(original,next).length,1);
 const add=planChange(original,fullDefinition,'sample-console'),withConsole=applyPlan(original,add);
 const removal=planRemoval(withConsole,'SAMPLE-CONSOLE','SAMPLE-CONSOLE'),withoutEmulator=applyPlan(withConsole,removal);
 assert.equal(withoutEmulator.consoles.length,1);assert.deepEqual(withoutEmulator.consoles[0].emulators,[]);
 assert.equal(changesBetween(original,withoutEmulator).length,1);
 assert.deepEqual(rebuild(original,[add]),withConsole);assert.deepEqual(rebuild(original,[]),original);
});

test('invalid full console definitions and ambiguous identities fail safely',()=>{
 for (const mutate of [c=>delete c.longName,c=>c.emulators=null,c=>c.romExtensions='exe',c=>c.romExtensions=[null],c=>c.emulators.push(clone(c.emulators[0])),c=>c.emulator=clone(payload)]) {
  const definition=clone(fullDefinition);mutate(definition.entries[0]);assert.throws(()=>validateDefinition(definition,'sample-console'));
 }
 const duplicate=clone(fullDefinition);duplicate.entries.push({...clone(duplicate.entries[0]),shortName:' SaMpLe-CoNsOlE '});
 assert.throws(()=>validateDefinition(duplicate,'sample-console'),/duplicate/);
 assert.throws(()=>validateConfig({consoles:[...fullDefinition.entries,{...clone(fullDefinition.entries[0]),shortName:'SAMPLE-CONSOLE'}]}),/Duplicate/);
 const original=fixture(),plan=planChange(original,fullDefinition,'sample-console');plan.consoleEntry.shortName='different';
 assert.throws(()=>applyPlan(original,plan),/identity/);assert.deepEqual(original,fixture());
});
