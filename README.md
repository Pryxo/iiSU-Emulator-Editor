# iiSU Emulator Editor

[Open the editor](https://pryxo.github.io/iiSU-Emulator-Editor/)

A browser-based editor for iiSU's `emuladores.json`. Load your configuration, browse the emulator library, add or remove emulators, and download the edited file. Files stay in your browser and are not uploaded to a server.

Emulators are grouped by platform. The editor preserves unrelated settings and supports undoing changes. Platform mappings use the console's `shortName`. Console headers can add, replace, or remove a whole platform. Emulator rows edit individual emulators. Console replacement applies the complete template after confirmation; emulator edits preserve platform settings. All actions support undo.

## Contribute platforms and emulators

Contributions are welcome through pull requests:

1. Fork this repository and create a branch for your addition.
2. Create `emulators/<emulator-id>/emulator.json` with a description and an `entries` array. Each entry maps a platform's `shortName` to an emulator definition, including its launch commands and any package names. To add another platform for an existing emulator, extend its `entries` array. For a platform template, create `consoles/<console-id>/console.json` with its own `description` and a complete `console` object. Usually leave its `emulators` array empty so emulators can be added separately.
3. Register emulator files in `emulators/index.json` and console files in `consoles/index.json`. Use lowercase kebab-case for directory and registry IDs, and match platform short names to those used by iiSU.
4. With Node.js 22 or later, run `npm test` and `npm run build`. Run `npm start` and open `http://127.0.0.1:4173/emuconfig/` to check your addition in the editor.
5. Open a pull request describing the platform and emulator, linking to the emulator's project, and explaining how you tested the launch commands. Mention any commands you could not test on a device.

See the [contribution guide](docs/adding-emulators.md) and [JSON format reference](docs/json-format.md) for details. Keep personal configuration files out of pull requests.

## Tests

`npm test` runs the core behavior checks, build checks, and a catalog check that discovers every definition through `emulators/index.json` and `consoles/index.json`. New or renamed emulators and consoles require no changes to test code. The catalog check validates each definition and checks that every mapping can be added without changing the input or creating duplicates.

Core and browser behavior tests use fictional data from `tests/fixtures.js`. These examples cover single-emulator mappings and complete console entries independently of the real catalog. Tests are excluded from the deployed website.

For browser checks, install Playwright locally with `npm install --no-save --package-lock=false playwright` and install its browser with `npx playwright install chromium`, then run `npm run test:browser`. This builds the site, starts a temporary local server on an available port, and closes it afterward. Screenshots and exported test files go in `.qa/`.

Optional environment variables: `BROWSER_CHANNEL` selects an installed browser such as `msedge` or `chrome`; `BASE_URL` uses an existing built-site server; `PLAYWRIGHT_PATH` points to an existing Playwright module entry file. The browser checks supply their own fictional catalog and never need a personal configuration file.

## Credits

[Font](https://puzzylpiece.xyz/consolesans/). Made by PuzzylPiece

## License

[MIT](LICENSE). Emulator names belong to their respective projects; no affiliation is implied.
