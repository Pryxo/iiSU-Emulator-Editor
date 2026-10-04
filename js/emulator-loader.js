import {isObject, validateEmulator, validateConfig, consoleKey} from './config-validator.js';
export const isConsoleEntry = entry => Object.hasOwn(entry, 'emulators');
export function validateDefinition(definition, id) {
  if (!isObject(definition)) throw new Error(`${id}: expected an emulator definition.`);
  if (typeof definition.description !== 'string') throw new Error(`${id}: missing description.`);
  if (!Array.isArray(definition.entries) || !definition.entries.length) throw new Error(`${id}: expected non-empty entries.`);
  const names = new Set();
  for (const mapping of definition.entries) {
    if (!isObject(mapping) || typeof mapping.shortName !== 'string' || !mapping.shortName.trim() || names.has(consoleKey(mapping.shortName))) throw new Error(`${id}: invalid or duplicate console mapping.`);
    names.add(consoleKey(mapping.shortName));
    if (isConsoleEntry(mapping)) {
      if (Object.hasOwn(mapping, 'emulator')) throw new Error(`${id}: use either emulator or emulators, not both.`);
      validateConfig({consoles:[mapping]});
    } else validateEmulator(mapping.emulator, id);
  }
  return definition;
}
async function getJSON(url) { const response = await fetch(url, {cache:'no-cache'}); if (!response.ok) throw new Error(`Could not load ${url.pathname} (${response.status}).`); return response.json(); }
export async function loadEmulators() {
  const base = new URL('../emulators/index.json', import.meta.url);
  base.search = new URL(import.meta.url).search;
  return loadRegistry(base,'emulators','emulator.json',validateDefinition);
}
export async function loadRegistry(base, collection, filename, validate) {
  const registry = await getJSON(base);
  if (registry.schemaVersion !== 1 || !Array.isArray(registry[collection])) throw new Error(`Unsupported ${collection} registry version.`);
  const ids = new Set();
  const results = await Promise.allSettled(registry[collection].map(async item => {
    if (!isObject(item) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) || item.path !== `${item.id}/${filename}` || ids.has(item.id)) throw new Error('Invalid or duplicate registry entry.');
    ids.add(item.id);
    const url = new URL(item.path, base);
    url.search = base.search;
    return validate(await getJSON(url), item.id);
  }));
  return {definitions: results.filter(r => r.status === 'fulfilled').map(r => r.value), errors: results.filter(r => r.status === 'rejected').map(r => r.reason.message)};
}
