# Configuration format

The editor accepts one JSON file containing a `consoles` array. Unversioned files and version 1 are supported; an incompatible `version` or `schemaVersion` is rejected.

## Console and emulator data

Each console has a unique `shortName`, a `longName`, and an `emulators` array. Console short names match ignoring capitalization and surrounding spaces. Other fields such as `manufacturer`, `romExtensions`, dates, and achievement IDs are retained unless you replace the whole console. Each emulator has a unique case-insensitive `id` within its console, a `name`, `routeType`, and non-empty `commands`. Commands contain a unique `description` and a `command` string. Optional `packages` is a string array. The editor does not execute or validate Android intents.

## Console header actions

Database consoles live in `consoles/<id>/console.json` and are registered in `consoles/index.json`. Each definition contains a `description` and a complete `console` object. Console templates appear in the database and console filter even when missing from your configuration.

The header's + adds a missing console, or offers to replace an existing console with the complete database template. Replacement changes all metadata and the emulator array: fields and emulators omitted from the template are removed. You must confirm replacement. The config header's minus removes the whole console and all its emulators after confirmation. Both actions can be undone. The header's info button previews the complete console JSON for that side of the editor.

Console additions, removals, and metadata changes appear as full objects in the Changes dialog, including empty consoles. Emulator-only changes are shown individually. Matching `shortName` values never create duplicate consoles.

## Emulator row actions

Emulator packages live in `emulators/<id>/emulator.json` and are registered in `emulators/index.json`. Each definition contains a `description` and an `entries` array of `{ shortName, emulator }` mappings. See the [contribution guide](adding-emulators.html) for examples and legacy support.

Add the console first, then use the emulator row's + to add or update that emulator. Updating an existing emulator requires confirmation. Existing entries retain unknown keys and unrelated commands. Commands match by description and package arrays are combined without duplicates. Emulator actions preserve console metadata and other emulators. The row's minus removes only that emulator; an empty console remains.

The row's info button shows only the emulator JSON. Database info panels also show the corresponding console or emulator description. Your config's panels show its JSON without database descriptions. Descriptions are not exported.

## Undo and download

The original catalog is never mutated. Undo rebuilds the current catalog from the original and remaining actions. Undo all restores the original file, including consoles and emulators removed by replacements.

Download JSON saves the edited catalog under the uploaded filename. An unchanged download retains the exact source text. Edited JSON uses detected indentation, line endings, and BOM. Downloads use Blob/object URLs and run entirely in the browser. The File panel provides original and modified JSON previews, download, and replacement.

## Privacy and security

File contents never enter network requests, URLs, cookies, or browser storage. All UI text is rendered as text nodes. Commands are data, never executed. Only packaged assets and registry JSON are fetched. Closing or refreshing clears private session state. The app rejects files over 10 MB, invalid JSON, duplicate object keys, malformed structures, duplicate IDs, and integer values that JavaScript cannot preserve exactly.
