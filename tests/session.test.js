import test from 'node:test';
import assert from 'node:assert/strict';
import {SESSION_KEY, saveSession, restoreSession} from '../js/session.js';
import {readConfig} from '../js/config-loader.js';
import {planChange, rebuild, changesBetween} from '../js/config-merger.js';
import {serializeConfig} from '../js/download.js';
import {createFixtures} from './fixtures.js';

const memoryStorage = () => {
  const values = new Map();
  return {getItem:key=>values.get(key) ?? null, setItem:(key,value)=>values.set(key,value), removeItem:key=>values.delete(key)};
};
test('session restores original formatting, edits, undo history, filename and filters', async () => {
  const {catalog, singleDefinition} = createFixtures();
  const source = '\uFEFF' + JSON.stringify(catalog,null,'\t').replace(/\n/g,'\r\n') + '\r\n';
  const file = await readConfig(new File([source],'my-config.json'));
  const actions = [planChange(catalog,singleDefinition,'sample-platform')];
  const storage = memoryStorage();
  saveSession({file,actions,search:'sample',platform:'sample-platform'},storage);
  const restored = await restoreSession(storage);
  assert.deepEqual(restored.file,file);
  assert.deepEqual(restored.modified,rebuild(catalog,actions));
  assert.deepEqual(restored.changes,changesBetween(catalog,restored.modified));
  assert.equal(restored.search,'sample');
  assert.equal(restored.platform,'sample-platform');
  restored.actions.pop();
  assert.equal(serializeConfig(rebuild(restored.original,restored.actions),restored.file),source);
  saveSession(restored,storage);
  assert.deepEqual((await restoreSession(storage)).modified,catalog);
});
test('failed saves discard stale sessions, and malformed sessions do not restore',async () => {
  const storage = memoryStorage();
  storage.setItem(SESSION_KEY,'old session');
  storage.setItem = () => { throw new Error('Quota exceeded'); };
  assert.throws(()=>saveSession({file:{name:'new.json',source:'{}'},actions:[]},storage));
  assert.equal(await restoreSession(storage),null);
  for (const source of ['{broken',JSON.stringify({version:9}),JSON.stringify({version:1,file:{name:'bad.json',source:'{}'},actions:[],search:'',platform:'all'})]) {
    const invalid = memoryStorage();invalid.setItem(SESSION_KEY,source);
    await assert.rejects(restoreSession(invalid));
    assert.equal(invalid.getItem(SESSION_KEY),null);
  }
});
