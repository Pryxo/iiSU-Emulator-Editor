// Synthetic examples exercise the supported shapes without depending on catalog contents.
// Each call returns fresh objects so individual tests can safely customize them.
export function createFixtures() {
  const emulator = {
    id: 'SAMPLE-EMULATOR', name: 'Sample Emulator (Standalone)', routeType: 'uri',
    commands: [{description: 'Launch', command: 'example.app/.Main -d %ROM_URI%'}],
    packages: ['example.app']
  };
  const singleDefinition = {description: 'Sample emulator description', entries: [{shortName: 'sample-platform', emulator}]};
  const fullDefinition = {description: 'Sample console description', entries: [{
    shortName: 'sample-console', longName: 'Sample Console', manufacturer: 'Example',
    romExtensions: ['.example'], customMetadata: {preserve: true},
    emulators: [{...structuredClone(emulator), id: 'SAMPLE-CONSOLE', name: 'Console Emulator'}]
  }]};
  const catalog = {customRoot: {preserve: true}, consoles: [
    {shortName: 'sample-platform', longName: 'Sample Platform', customConsole: 42, emulators: []},
    {shortName: 'other', longName: 'Other', emulators: []}
  ]};
  const definitions = new Map([['sample-emulator', singleDefinition], ['sample-console', fullDefinition]]);
  const registry = {schemaVersion: 1, emulators: [...definitions.keys()].map(id => ({id, path: `${id}/emulator.json`}))};
  return {singleDefinition, fullDefinition, catalog, definitions, registry};
}
