import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadEmulators, isConsoleEntry} from '../js/emulator-loader.js';
import {loadConsoles} from '../js/console-loader.js';
import {planChange, planConsoleChange, applyPlan, rebuild} from '../js/config-merger.js';

// Exercise the real registry through the production loader. No package names,
// platform names, entry order, or catalog size are assumed here.
test('every registered definition loads and its mappings can be applied', async t => {
  t.mock.method(globalThis, 'fetch', async url => ({
    ok: true,
    json: async () => JSON.parse(await readFile(url, 'utf8'))
  }));
  const {definitions, errors} = await loadEmulators();
  assert.deepEqual(errors, []);
  for (const definition of definitions) {
    for (const mapping of definition.entries) {
      await t.test(`${mapping.shortName}: ${isConsoleEntry(mapping) ? mapping.longName : mapping.emulator.id}`, () => {
        const fullConsole = isConsoleEntry(mapping);
        const original = {consoles: fullConsole ? [] : [{
          shortName: mapping.shortName, longName: 'Existing console', emulators: []
        }]};
        const snapshot = structuredClone(original);
        const plan = planChange(original, definition, mapping.shortName);
        const modified = applyPlan(original, plan);
        assert.deepEqual(original, snapshot);
        assert.deepEqual(modified.consoles[0], fullConsole ? mapping : {
          ...original.consoles[0], emulators: [mapping.emulator]
        });
        assert.equal(planChange(modified, definition, mapping.shortName).entryChanged, false);
        assert.deepEqual(rebuild(original, [plan]), modified);
        assert.deepEqual(rebuild(original, []), snapshot);
      });
    }
  }
});

test('registered console templates load independently and replace an existing platform exactly',async t=>{
 t.mock.method(globalThis,'fetch',async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
 const {definitions,errors}=await loadConsoles();assert.deepEqual(errors,[]);
 for(const definition of definitions){
  const original={consoles:[{shortName:definition.console.shortName.toUpperCase(),longName:'Incorrect',emulators:[],obsolete:true}]};
  const plan=planConsoleChange(original,definition.console);assert.equal(plan.needsConfirmation,true);
  assert.deepEqual(applyPlan(original,plan),{consoles:[definition.console]});
  assert.deepEqual(rebuild(original,[]),original);
 }
});
