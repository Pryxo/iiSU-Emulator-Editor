import {isObject, validateConfig, consoleKey} from './config-validator.js';
import {loadRegistry} from './emulator-loader.js';

export function validateConsoleDefinition(definition, id) {
  if (!isObject(definition) || typeof definition.description !== 'string') throw new Error(`${id}: a console definition needs a description.`);
  validateConfig({consoles:[definition.console]});
  return definition;
}

export async function loadConsoles() {
  const base = new URL('../consoles/index.json', import.meta.url);
  base.search = new URL(import.meta.url).search;
  const result = await loadRegistry(base,'consoles','console.json',validateConsoleDefinition);
  const seen = new Set();
  result.definitions = result.definitions.filter(definition => {
    const key = consoleKey(definition.console.shortName);
    if (seen.has(key)) { result.errors.push(`Duplicate console definition: ${definition.console.shortName}.`); return false; }
    seen.add(key); return true;
  });
  return result;
}
