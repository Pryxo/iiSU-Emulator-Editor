export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const consoleKey = value => value.trim().toLowerCase();
const required = (condition, message) => { if (!condition) throw new Error(message); };
const text = value => typeof value === 'string' && value.trim().length > 0;
export function validateEmulator(entry, location = 'Emulator') {
  required(isObject(entry) && text(entry.id) && text(entry.name), `${location}: each emulator needs an id and name.`);
  required(text(entry.routeType), `${location}: missing routeType.`);
  required(Array.isArray(entry.commands) && entry.commands.length > 0, `${location}: commands must be a non-empty array.`);
  const labels = new Set();
  for (const cmd of entry.commands) {
    required(isObject(cmd) && text(cmd.description) && text(cmd.command), `${location}: malformed launch command.`);
    required(!labels.has(cmd.description), `${location}: duplicate command label ${cmd.description}.`);
    labels.add(cmd.description);
  }
  required(entry.packages === undefined || (Array.isArray(entry.packages) && entry.packages.every(text)), `${location}: packages must contain strings.`);
}
export function validateConfig(data) {
  required(isObject(data) && Array.isArray(data.consoles), "We couldn't recognize this configuration. Expected an object with a consoles array.");
  for (const key of ['schemaVersion', 'version']) {
    required(data[key] === undefined || data[key] === 1 || data[key] === '1', `Unsupported configuration ${key}: ${data[key]}. This editor supports the supplied unversioned format and version 1.`);
  }
  const consoles = new Set();
  for (const c of data.consoles) {
    required(isObject(c) && text(c.shortName), 'Each console needs a shortName.');
    required(!consoles.has(consoleKey(c.shortName)), `Duplicate console shortName: ${c.shortName}.`);
    consoles.add(consoleKey(c.shortName));
    required(text(c.longName) && Array.isArray(c.emulators), `${c.shortName}: expected longName and emulators array.`);
    required(c.romExtensions === undefined || (Array.isArray(c.romExtensions) && c.romExtensions.every(text)), `${c.shortName}: romExtensions must contain strings.`);
    const ids = new Set();
    for (const e of c.emulators) {
      validateEmulator(e, c.shortName);
      required(!ids.has(e.id.toLowerCase()), `${c.shortName}: duplicate emulator ID ${e.id}.`);
      ids.add(e.id.toLowerCase());
    }
  }
  return data;
}
