import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readConfig} from '../js/config-loader.js';
import {validateConfig} from '../js/config-validator.js';
import {validateDefinition} from '../js/emulator-loader.js';
import {clone,planChange,planRemoval,applyPlan,rebuild,changesBetween} from '../js/config-merger.js';
import {serializeConfig} from '../js/download.js';
const eden=JSON.parse(await readFile(new URL('../emulators/eden-duo/emulator.json',import.meta.url)));
const payload=eden.entries[0].emulator;
const joi=JSON.parse((await readFile(new URL('../emulators/joiplay/emulator.json',import.meta.url),'utf8')).replace(/^\uFEFF/,''));
const fixture=()=>({customRoot:{preserve:true},consoles:[{shortName:'switch',longName:'Nintendo Switch',customConsole:42,emulators:[]},{shortName:'other',longName:'Other',emulators:[]}]});
const makeFile=(value,name='emuladores.json')=>new File([typeof value==='string'?value:JSON.stringify(value)],name,{type:'application/json'});

test('registered definitions validate and preserve registry-folder identity',async()=>{
 const registry=JSON.parse(await readFile(new URL('../emulators/index.json',import.meta.url)));
 assert.equal(registry.schemaVersion,1);
 for(const entry of registry.emulators){const data=JSON.parse(await readFile(new URL(`../emulators/${entry.path}`,import.meta.url)));validateDefinition(data,entry.id);assert.equal(entry.path,`${entry.id}/emulator.json`);}
});

test('add changes only the chosen emulator array and never mutates the input',()=>{
 const original=fixture(),snapshot=clone(original),modified=applyPlan(original,planChange(original,eden,'switch'));
 const expected=clone(original);expected.consoles[0].emulators.push(payload);
 assert.deepEqual(original,snapshot);assert.deepEqual(modified,expected);
 assert.equal(changesBetween(original,modified).length,1);
});

test('matching IDs preserve unknown fields, extra commands and packages',()=>{
 const original=fixture(),entry=clone(payload);entry.id='eden-duo';entry.customSetting={x:1};entry.commands[0].command='old';entry.commands[0].unknown=3;entry.commands.push({description:'Local command',command:'custom'});entry.packages.push('local.package');original.consoles[0].emulators.push(entry);
 const plan=planChange(original,eden,'switch');assert.equal(plan.needsConfirmation,true);
 const modified=applyPlan(original,plan),updated=modified.consoles[0].emulators[0];
 assert.equal(modified.consoles[0].emulators.length,1);assert.deepEqual(updated.customSetting,{x:1});assert.equal(updated.commands[0].unknown,3);assert.equal(updated.commands[0].command,payload.commands[0].command);assert.ok(updated.commands.some(c=>c.description==='Local command'));assert.ok(updated.packages.includes('local.package'));
});

test('duplicate add is a no-op; undo restores the original',()=>{
 const original=fixture(),action=planChange(original,eden,'switch'),next=applyPlan(original,action);
 const duplicate=planChange(next,eden,'switch');assert.equal(duplicate.entryChanged,false);assert.deepEqual(applyPlan(next,duplicate),next);
 assert.deepEqual(rebuild(original,[]),original);assert.deepEqual(rebuild(original,[action]),next);assert.throws(()=>planChange(original,eden,'missing'),/not present/);
});

test('undo retains remaining console changes',()=>{
 const original=fixture(),definition=clone(eden);definition.entries.push({...clone(eden.entries[0]),shortName:'other'});
 const a=planChange(original,definition,'switch'),b=planChange(original,definition,'other');
 const next=rebuild(original,[a]);assert.equal(next.consoles[0].emulators.length,1);assert.equal(next.consoles[1].emulators.length,0);assert.equal(changesBetween(original,rebuild(original,[a,b])).length,2);
});

test('malformed formats, versions, duplicate IDs and invalid definitions fail safely',()=>{
 assert.throws(()=>validateConfig([]),/recognize/);assert.throws(()=>validateConfig({consoles:[],version:2}),/Unsupported/);
 assert.throws(()=>validateConfig({consoles:[{shortName:'switch',emulator:'Eden Duo',commandLabel:'Eden Duo',routeType:'uri',launchPreference:'Ask'}]}),/longName and emulators/);
 const data=fixture();data.consoles.push(clone(data.consoles[0]));assert.throws(()=>validateConfig(data),/Duplicate/);
 const duplicate=fixture();duplicate.consoles[0].emulators=[clone(payload),clone(payload)];assert.throws(()=>validateConfig(duplicate),/duplicate emulator/);
 assert.throws(()=>validateDefinition({...eden,entries:[]},'eden-duo'),/non-empty entries/);
 assert.throws(()=>validateDefinition({...eden,entries:[null]},'eden-duo'),/invalid or duplicate/);
 assert.throws(()=>validateDefinition({...eden,entries:[eden.entries[0],eden.entries[0]]},'eden-duo'),/invalid or duplicate/);
 assert.throws(()=>validateDefinition({...eden,description:42},'eden-duo'),/missing description/);
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
 const modified=applyPlan(file.data,planChange(file.data,eden,'switch')),edited=serializeConfig(modified,file);
 assert.ok(edited.startsWith('\ufeff'));assert.ok(edited.includes('\r\n\t"consoles"'));assert.deepEqual(JSON.parse(edited.replace(/^\ufeff/,'')),modified);
 assert.equal(serializeConfig(rebuild(file.data,[]),file),source);
});

test('removal affects only the chosen entry and is fully reversible',()=>{
 const initial=fixture(),add=planChange(initial,eden,'switch'),original=applyPlan(initial,add),snapshot=clone(original);
 original.consoles[0].emulators.push({...clone(payload),id:'OTHER',name:'Other'});
 const remove=planRemoval(original,'switch','eden-duo'),modified=applyPlan(original,remove);
 assert.deepEqual(modified.consoles[0].emulators,[original.consoles[0].emulators[1]]);assert.equal(original.consoles[0].emulators.length,2);
 assert.equal(changesBetween(original,modified).length,1);assert.equal(changesBetween(original,modified)[0].after,undefined);
 assert.deepEqual(rebuild(original,[]),original);assert.deepEqual(rebuild(initial,[add,planRemoval(snapshot,'switch','EDEN-DUO')]),initial);
 assert.throws(()=>planRemoval(original,'switch','missing'),/no longer/);
});

test('full console addition preserves metadata, exports complete JSON and undoes atomically',async()=>{
 const original=fixture(),snapshot=clone(original),action=planChange(original,joi,'joiplay');
 const next=applyPlan(original,action),consoleEntry=next.consoles.at(-1);
 assert.deepEqual(original,snapshot);assert.deepEqual(consoleEntry,joi.entries[0]);
 assert.deepEqual(changesBetween(original,next),[{shortName:'joiplay',title:'JoiPlay (console)',before:undefined,after:consoleEntry}]);
 const file=await readConfig(makeFile(original));assert.deepEqual(JSON.parse(serializeConfig(next,file)),next);
 assert.deepEqual(rebuild(original,[]),original);
 assert.deepEqual(rebuild(original,[action]),next);
 const addEden=planChange(next,eden,'switch');
 assert.deepEqual(rebuild(original,[addEden]),applyPlan(original,addEden));
 assert.equal(planChange(next,joi,'joiplay').entryChanged,false);
 assert.deepEqual(applyPlan(next,action),next);
});

test('existing console is reused across casing and whitespace and keeps all its settings',()=>{
 const original=fixture();original.consoles.push({shortName:' JoiPlay ',longName:'My games',manufacturer:'Mine',romExtensions:['.custom'],custom:42,emulators:[]});
 const action=planChange(original,joi,'joiplay'),next=applyPlan(original,action);
 assert.equal(next.consoles.length,original.consoles.length);
 assert.deepEqual(next.consoles.at(-1),{...original.consoles.at(-1),emulators:joi.entries[0].emulators});
 assert.equal(changesBetween(original,next).length,1);
 assert.equal(planChange(next,joi,'JOIPLAY').entryChanged,false);
 // A plan made while the console was absent must also reuse it when applied later.
 assert.deepEqual(applyPlan(original,planChange(fixture(),joi,'joiplay')),next);
});

test('console merge adds all missing emulators and confirms changes to existing commands',()=>{
 const definition=clone(joi);definition.entries[0].emulators.push({...clone(payload),id:'SECOND'});
 const original=applyPlan(fixture(),planChange(fixture(),joi,'joiplay'));
 const c=original.consoles.at(-1);c.emulators[0].commands[0].command='custom';c.emulators[0].packages.push('local.package');c.emulators[0].extra=true;
 c.emulators.push({...clone(payload),id:'LOCAL'});
 const snapshot=clone(original),plan=planChange(original,definition,'joiplay');assert.equal(plan.needsConfirmation,true);
 const next=applyPlan(original,plan),updated=next.consoles.at(-1);
 assert.equal(updated.emulators.length,3);assert.equal(updated.emulators[0].extra,true);
 assert.ok(updated.emulators[0].packages.includes('local.package'));
 assert.equal(updated.emulators[0].commands[0].command,joi.entries[0].emulators[0].commands[0].command);
 assert.deepEqual(original,snapshot);assert.deepEqual(applyPlan(next,plan),next);
});

test('empty consoles and removal of the last emulator remain visible as console changes',()=>{
 const original={consoles:[]},definition={description:'Empty',entries:[{shortName:'empty',longName:'Empty',emulators:[]}]};
 validateDefinition(definition,'empty');
 const next=applyPlan(original,planChange(original,definition,'empty'));
 assert.equal(changesBetween(original,next).length,1);
 const add=planChange(original,joi,'joiplay'),withJoi=applyPlan(original,add);
 const removal=planRemoval(withJoi,'JOIPLAY','JOIPLAY'),withoutEmulator=applyPlan(withJoi,removal);
 assert.equal(withoutEmulator.consoles.length,1);assert.deepEqual(withoutEmulator.consoles[0].emulators,[]);
 assert.equal(changesBetween(original,withoutEmulator).length,1);
 assert.deepEqual(rebuild(original,[add]),withJoi);assert.deepEqual(rebuild(original,[]),original);
});

test('invalid full console definitions and ambiguous identities fail safely',()=>{
 for (const mutate of [c=>delete c.longName,c=>c.emulators=null,c=>c.romExtensions='exe',c=>c.romExtensions=[null],c=>c.emulators.push(clone(c.emulators[0])),c=>c.emulator=clone(payload)]) {
  const definition=clone(joi);mutate(definition.entries[0]);assert.throws(()=>validateDefinition(definition,'joiplay'));
 }
 const duplicate=clone(joi);duplicate.entries.push({...clone(duplicate.entries[0]),shortName:' JoiPlay '});
 assert.throws(()=>validateDefinition(duplicate,'joiplay'),/duplicate/);
 assert.throws(()=>validateConfig({consoles:[...joi.entries,{...clone(joi.entries[0]),shortName:'JOIPLAY'}]}),/Duplicate/);
 const original=fixture(),plan=planChange(original,joi,'joiplay');plan.consoleEntry.shortName='different';
 assert.throws(()=>applyPlan(original,plan),/identity/);assert.deepEqual(original,fixture());
});
