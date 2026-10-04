# iiSU Emulator Editor

[Open the editor](https://pryxo.github.io/iiSU-Emulator-Editor/)

A browser-based editor for iiSU's `emuladores.json`. Load your configuration, browse the emulator library, add or remove emulators, and download the edited file. Files stay in your browser and are not uploaded to a server. Your file, pending edits, undo history, and filters survive visits to the Info page and refreshes in the same tab. They are kept in tab session storage, which normally clears when you close the tab (browser session restore may recover it).

Emulators are grouped by platform. The editor preserves unrelated settings and supports undoing changes. Platform mappings use the console's `shortName`. Console headers can add, replace, or remove a whole platform. Emulator rows edit individual emulators. Console replacement applies the complete template after confirmation; emulator edits preserve platform settings. All actions support undo.

The database shows an “Already added” checkmark only when the entry matches your current config. Console checks ignore the `emulators` field and compare every other field; individual emulator checks compare the complete emulator entry. Any changed, missing, or extra field in that comparison prevents a match, including nested settings and array order. JSON formatting and object key order do not matter. Emulator updates preserve custom fields, extra commands, and packages, so an updated entry may still differ from the database.

## Contribute platforms and emulators

Contributions are welcome through pull requests. Fork this repository and create a branch for your addition. Platforms are called **consoles** in the JSON files; their `shortName` connects a platform to its emulator mappings.

### Add a platform

1. Create `consoles/<console-id>/console.json`. Use [JoiPlay's console template](consoles/joiplay/console.json) as a reference.
2. Include a `description` and a complete `console` object with `shortName`, `longName`, and an `emulators` array. Add appropriate metadata such as `manufacturer` and `romExtensions`. Usually leave `emulators` empty so users can choose emulators separately.
3. Add an entry to the `consoles` array in [consoles/index.json](consoles/index.json), keeping `schemaVersion` at `1`:

   ```json
   { "id": "my-platform", "path": "my-platform/console.json" }
   ```

A console template adds a missing platform or replaces an existing platform's entire object after confirmation. Include all intended metadata: replacement removes fields and emulators absent from the template.

### Add an emulator

1. Create `emulators/<emulator-id>/emulator.json`. Use [Eden Duo's emulator definition](emulators/eden-duo/emulator.json) or [JoiPlay's emulator definition](emulators/joiplay/emulator.json) as a reference.
2. Include a `description` and a non-empty `entries` array. Each entry has a platform `shortName` and an `emulator` object with `id`, `name`, `routeType`, and non-empty `commands`. Each command needs `description` and `command`; optional `packages` is an array of Android package names.
3. Add an entry to the `emulators` array in [emulators/index.json](emulators/index.json), keeping `schemaVersion` at `1`:

   ```json
   { "id": "my-emulator", "path": "my-emulator/emulator.json" }
   ```

For another platform supported by an existing emulator, extend that definition's `entries` array instead of creating a second directory. Each platform `shortName` must be unique within the definition. The platform must exist in the loaded configuration before an emulator can be added; contribute a console template too if users need a way to add it.

Use lowercase kebab-case for directory and registry IDs, and make each registry path match its directory exactly. Match platform short names to those used by iiSU. Descriptions appear in database info panels and are not exported. No central JavaScript list needs updating.

### Check and submit your contribution

With Node.js 22 or later, run these commands from the repository root. The core tests and build require no dependency installation.

```sh
npm test
npm run build
npm start
```

Open [the local editor](http://127.0.0.1:4173/iisu-emulator-editor/) and load a test configuration. Check the new entry's info panel, adding, replacing or updating, removing, undoing, and downloading the result. For a new platform, a file containing `{"consoles":[]}` lets you test adding its template before its emulators. `npm start` serves `dist/`; rerun `npm run build` after source or catalog changes and refresh the browser.

Open a pull request describing the addition, linking to the emulator's project, and listing the checks you ran. Test launch commands on a device with iiSU and state which emulator version you used. Mention any commands you could not verify: the editor treats commands as data and does not execute or validate Android intents.

See the [contribution guide](docs/adding-emulators.md) and [JSON format reference](docs/json-format.md) for details. Keep personal configuration files out of pull requests.

## Tests

### Core, catalog, and build checks

```sh
npm test
```

This runs the Node.js test suite:

| Test file | Coverage |
| --- | --- |
| [tests/core.test.js](tests/core.test.js) | Configuration validation, emulator merging, complete console replacement, removal, undo, and JSON export formatting. |
| [tests/catalog.test.js](tests/catalog.test.js) | Loads every registered emulator and console through the production loaders; checks emulator mappings can be applied without mutating the input or adding duplicates, and console templates replace existing platforms exactly. |
| [tests/build.test.js](tests/build.test.js) | Builds a temporary fixture site and checks asset versioning, reproducible output, and version changes after catalog edits. |

Catalog checks discover definitions through `emulators/index.json` and `consoles/index.json`, so registered additions and renames need no test-code changes. Unregistered files are not checked or shown in the editor. These checks validate structure and editor behavior; they do not prove an emulator can launch a game.

Run `npm run build` to build the actual site into `dist/`. The GitHub Pages deployment workflow runs `npm test` and `npm run build` before deployment; browser checks are a separate local step.

## Credits

[Font](https://puzzylpiece.xyz/consolesans/). Made by PuzzylPiece

## License

[MIT](LICENSE). Emulator names belong to their respective projects; no affiliation is implied.
