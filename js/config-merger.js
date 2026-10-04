// Edits to emuladores.json. Emulator identity is scoped to a console.
import {validateConfig, consoleKey} from './config-validator.js';
import {isConsoleEntry} from './emulator-loader.js';
export const clone = value => structuredClone(value);
// Compare JSON data exactly, independent of object key order. Array order matters.
export function equal(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((value, index) => equal(value, b[index]));
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
}
export function mergeEntry(existing, incoming) {
  if (!existing) return clone(incoming);
  const commands = clone(existing.commands);
  for (const command of incoming.commands) {
    const i = commands.findIndex(c => c.description === command.description);
    if (i === -1) commands.push(clone(command));
    else commands[i] = {...commands[i], ...clone(command)};
  }
  const result = {...clone(existing), ...clone(incoming), commands};
  if (existing.packages || incoming.packages) result.packages = [...new Set([...(existing.packages || []), ...(incoming.packages || [])])];
  return result;
}
export function planChange(catalog, definition, shortName, emulatorId) {
  const mapping = definition.entries.find(e => consoleKey(e.shortName) === consoleKey(shortName) &&
    (!emulatorId || (!isConsoleEntry(e) && e.emulator.id.toLowerCase() === emulatorId.toLowerCase())));
  const consoleEntry = catalog.consoles.find(c => consoleKey(c.shortName) === consoleKey(shortName));
  if (mapping && isConsoleEntry(mapping)) {
    return planConsoleChange(catalog, mapping);
  }
  if (!mapping || !consoleEntry) throw new Error('This console is not present in your catalog.');
  const oldEntry = consoleEntry.emulators.find(e => e.id.toLowerCase() === mapping.emulator.id.toLowerCase());
  const newEntry = mergeEntry(oldEntry, mapping.emulator);
  return {shortName, platform: consoleEntry.longName, beforeEntry: clone(oldEntry), afterEntry: newEntry, exactMatch: equal(oldEntry, mapping.emulator), entryChanged: !equal(oldEntry, newEntry), needsConfirmation: !!oldEntry && !equal(oldEntry, newEntry)};
}
export function planConsoleChange(catalog, incoming) {
  validateConfig({consoles:[incoming]});
  const existing = catalog.consoles.find(c => consoleKey(c.shortName) === consoleKey(incoming.shortName));
  const metadata = ({emulators, ...fields}) => fields;
  return {kind:'console',shortName:incoming.shortName,platform:incoming.longName,
    exactMatch:!!existing && equal(metadata(existing),metadata(incoming)),
    consoleEntry:clone(incoming),beforeConsole:clone(existing),entryChanged:!equal(existing,incoming),
    needsConfirmation:!!existing && !equal(existing,incoming)};
}
export function planConsoleRemoval(catalog, shortName) {
  const existing = catalog.consoles.find(c => consoleKey(c.shortName) === consoleKey(shortName));
  if (!existing) throw new Error('This console is no longer in your configuration.');
  return {kind:'remove-console',shortName:existing.shortName,platform:existing.longName,beforeConsole:clone(existing)};
}
export function applyPlan(catalog, plan) {
  const next = clone(catalog);
  const c = next.consoles.find(c => consoleKey(c.shortName) === consoleKey(plan.shortName));
  if (plan.kind === 'console') {
    validateConfig({consoles:[plan.consoleEntry]});
    if (consoleKey(plan.consoleEntry.shortName) !== consoleKey(plan.shortName)) throw new Error('Console identity does not match the selected console.');
    // Replacing means using the complete supplied object, including its emulator list.
    if (c) next.consoles[next.consoles.indexOf(c)] = clone(plan.consoleEntry);
    else next.consoles.push(clone(plan.consoleEntry));
    validateConfig(next);
    return next;
  }
  if (!c) throw new Error('The selected console is missing. Reload your configuration file.');
  if (plan.kind === 'remove-console') {
    next.consoles.splice(next.consoles.indexOf(c),1);
    validateConfig(next);
    return next;
  }
  if (plan.kind === 'remove') {
    c.emulators = c.emulators.filter(e => e.id.toLowerCase() !== plan.emulatorId.toLowerCase());
    validateConfig(next);
    return next;
  }
  const index = c.emulators.findIndex(e => e.id.toLowerCase() === plan.afterEntry.id.toLowerCase());
  if (index < 0) c.emulators.push(clone(plan.afterEntry)); else c.emulators[index] = clone(plan.afterEntry);
  validateConfig(next);
  return next;
}
export function rebuild(original, actions) { return actions.reduce((catalog, action) => applyPlan(catalog, action), clone(original)); }
export function planRemoval(catalog, shortName, emulatorId) {
  const consoleEntry = catalog.consoles.find(c => consoleKey(c.shortName) === consoleKey(shortName));
  const entry = consoleEntry?.emulators.find(e => e.id.toLowerCase() === emulatorId.toLowerCase());
  if (!entry) throw new Error('This emulator is no longer in your configuration.');
  return {kind:'remove', shortName, emulatorId, name:entry.name, platform:consoleEntry.longName};
}
export function changesBetween(original, modified) {
  const changes = [];
  for (const c of modified.consoles) {
    const before = original.consoles.find(item => consoleKey(item.shortName) === consoleKey(c.shortName));
    const metadata = ({emulators,...fields}) => fields;
    if (!before || !equal(metadata(before),metadata(c))) {
      changes.push({shortName:c.shortName, title:c.longName + ' (console)', before, after:c});
      continue;
    }
    for (const e of c.emulators) {
      const previous = before?.emulators.find(item => item.id.toLowerCase() === e.id.toLowerCase());
      if (!equal(previous, e)) changes.push({shortName: c.shortName, title: e.name, before: previous, after: e});
    }
    for (const e of before?.emulators || []) {
      if (!c.emulators.some(item => item.id.toLowerCase() === e.id.toLowerCase())) changes.push({shortName:c.shortName, title:e.name, before:e, after:undefined});
    }
  }
  for (const c of original.consoles) {
    if (!modified.consoles.some(item => consoleKey(item.shortName) === consoleKey(c.shortName))) {
      changes.push({shortName:c.shortName,title:c.longName + ' (console)',before:c,after:undefined});
    }
  }
  return changes;
}
