# Configuration format

The editor accepts one file, emuladores.json, with an object containing a consoles array. A renamed .json copy with the same structure is also accepted. Unversioned files and version 1 are supported; an explicitly incompatible version or schemaVersion is rejected.

## emuladores.json

Each console has a unique `shortName`, a `longName`, and an `emulators` array. Other fields such as `manufacturer`, `romExtensions`, dates, and achievement IDs are preserved. Each emulator has a unique case-insensitive `id` within its console, a `name`, `routeType`, and non-empty `commands`. Commands contain a unique `description` plus a `command` string. Optional `packages` is a string array. Existing route strings are accepted; the editor does not execute or validate Android intents.

## Merge and undo

Full console definitions can create missing platforms with their metadata and all emulators in one action. Console short names match ignoring capitalization and surrounding spaces. If a console already exists, its metadata is preserved and only its emulators are merged. Repeated adds do not create duplicates. New consoles appear as complete objects in the Changes dialog, including empty consoles. Undoing their addition removes the new console; removing the last emulator alone keeps it.

New single-emulator mappings append to an existing console. Existing entries retain unknown keys and unrelated commands. Commands match by description; package arrays are unioned. The info button shows the database description, when available, above read-only JSON for the emulator. Descriptions are not included in the exported catalog. The original catalog is never mutated. Undo rebuilds the current catalog from the original and remaining actions.

The minus button removes an emulator from that console. Other emulator entries and unrelated settings are preserved. The Changes dialog shows additions, modifications, and removals and supports Undo all.

Download JSON saves the edited catalog directly under the uploaded filename. An unchanged download retains the exact source text. Edited JSON uses detected indentation, line endings, and BOM. Downloads use Blob/object URLs and run entirely in the browser. The File panel provides original and modified JSON previews, download, and replacement.

## Privacy and security

File contents never enter network requests, URLs, cookies, or browser storage. All UI text is rendered safely as text nodes. Commands are data, never executed. Only packaged assets and registry JSON are fetched, before editing. Closing or refreshing clears private session state. The app rejects files over 10 MB, invalid JSON, duplicate object keys, malformed emulator structures, duplicate IDs, and integer values that JavaScript cannot preserve exactly.
