# iiSU Emulator Editor

[Open the editor](https://pryxo.github.io/iiSU-Emulator-Editor/)

A browser-based editor for iiSU's `emuladores.json`. Load your configuration, browse the emulator library, add or remove emulators, and download the edited file. Files stay in your browser and are not uploaded to a server.

Emulators are grouped by platform. The editor preserves unrelated settings and supports undoing changes. Platform mappings use the console's `shortName` and require that console to exist in your configuration.

## Contribute platforms and emulators

Contributions are welcome through pull requests:

1. Fork this repository and create a branch for your addition.
2. Create `emulators/<emulator-id>/emulator.json` with a description and an `entries` array. Each entry maps a platform's `shortName` to an emulator definition, including its launch commands and any package names. To add another platform for an existing emulator, extend its `entries` array.
3. Register new emulator files in `emulators/index.json`. Use lowercase kebab-case for directory and registry IDs, and match platform short names to those used by iiSU.
4. With Node.js 22 or later, run `npm test` and `npm run build`. Run `npm start` and open `http://127.0.0.1:4173/emuconfig/` to check your addition in the editor.
5. Open a pull request describing the platform and emulator, linking to the emulator's project, and explaining how you tested the launch commands. Mention any commands you could not test on a device.

See the [contribution guide](docs/adding-emulators.md) and [JSON format reference](docs/json-format.md) for details. Keep personal configuration files out of pull requests.

## License

[MIT](LICENSE). Emulator names belong to their respective projects; no affiliation is implied.
