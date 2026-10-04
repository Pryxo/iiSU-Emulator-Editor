// Edits to emuladores.json. Emulator identity is scoped to a console.
import {validateConfig, consoleKey} from './config-validator.js';
import {isConsoleEntry} from './emulator-loader.js';
export const clone = value => structuredClone(value);
export const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
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
export function planChange(catalog, definition, shortName) {
  const mapping = definition.entries.find(e => consoleKey(e.shortName) === consoleKey(shortName));
  const consoleEntry = catalog.consoles.find(c => consoleKey(c.shortName) === consoleKey(shortName));
  if (mapping && isConsoleEntry(mapping)) {
    validateConfig({consoles:[mapping]});
    const after = mergeConsole(consoleEntry, mapping);
    return {kind:'console', shortName:consoleEntry?.shortName || mapping.shortName, platform:after.longName,
      consoleEntry:clone(mapping), entryChanged:!equal(consoleEntry,after),
      needsConfirmation:!!consoleEntry && mapping.emulators.some(incoming => {
        const old = consoleEntry.emulators.find(e => e.id.toLowerCase() === incoming.id.toLowerCase());
        return old && !equal(old,mergeEntry(old,incoming));
      })};
  }
  if (!mapping || !consoleEntry) throw new Error('This console is not present in your catalog.');
  const oldEntry = consoleEntry.emulators.find(e => e.id.toLowerCase() === mapping.emulator.id.toLowerCase());
  const newEntry = mergeEntry(oldEntry, mapping.emulator);
  return {shortName, platform: consoleEntry.longName, beforeEntry: clone(oldEntry), afterEntry: newEntry, entryChanged: !equal(oldEntry, newEntry), needsConfirmation: !!oldEntry && !equal(oldEntry, newEntry)};
}
function mergeConsole(existing, incoming) {
  if (!existing) return clone(incoming);
  const result = clone(existing);
  for (const emulator of incoming.emulators) {
    const index = result.emulators.findIndex(e => e.id.toLowerCase() === emulator.id.toLowerCase());
    if (index < 0) result.emulators.push(clone(emulator));
    else result.emulators[index] = mergeEntry(result.emulators[index], emulator);
  }
  return result;
}
export function applyPlan(catalog, plan) {
  const next = clone(catalog);
  const c = next.consoles.find(c => consoleKey(c.shortName) === consoleKey(plan.shortName));
  if (plan.kind === 'console') {
    validateConfig({consoles:[plan.consoleEntry]});
    if (consoleKey(plan.consoleEntry.shortName) !== consoleKey(plan.shortName)) throw new Error('Console identity does not match the selected console.');
    const merged = mergeConsole(c, plan.consoleEntry);
    if (c) next.consoles[next.consoles.indexOf(c)] = merged;
    else next.consoles.push(merged);
    validateConfig(next);
    return next;
  }
  if (!c) throw new Error('The selected console is missing. Reload emuladores.json.');
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
    if (!before) {
      changes.push({shortName:c.shortName, title:c.longName + ' (console)', before:undefined, after:c});
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
  return changes;
}
