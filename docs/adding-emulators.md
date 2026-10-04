# Add consoles and emulators

Console headers and emulator rows have independent definitions and descriptions. Use the matching JoiPlay files as examples.

## Folder structure

```text
consoles/
  index.json
  joiplay/
    console.json
emulators/
  index.json
  joiplay/
    emulator.json
```

Edit [consoles/joiplay/console.json](../consoles/joiplay/console.json) for the platform metadata and the description shown by the console header's info button. Edit [emulators/joiplay/emulator.json](../emulators/joiplay/emulator.json) for the launch command, packages, and the emulator row's description. Descriptions appear only in database info panels and are never exported to the user's configuration.

## Add a console

1. Create `consoles/<console-id>/console.json` using lowercase kebab-case for the folder name.
2. Give it a `description` and a `console` object, as shown below.
3. Register `{ "id": "your-console", "path": "your-console/console.json" }` in the `consoles` array in `consoles/index.json`. Keep the registry's `schemaVersion` at 1.

```json
{
  "description": "Notes about this platform and its file extensions.",
  "console": {
    "shortName": "my-platform",
    "longName": "My Platform",
    "manufacturer": "Example",
    "romExtensions": [".rom"],
    "emulators": []
  }
}
```

The console object requires `shortName`, `longName`, and an `emulators` array. Add other iiSU metadata such as release dates and achievement IDs as needed. Usually leave `emulators` empty so users can add their preferred emulators separately. A template may include default emulators; the entire array is applied when the console is added or replaced. The header's info button shows exactly that full template. The config header's info button shows the full current console, including all installed emulator entries.

The database header's + button adds a missing console. For an existing console it offers to replace the entire object, including metadata and all current emulators, with this template. Fields and emulator entries absent from the template are removed. Replacement requires confirmation and can be undone. An identical template shows a disabled checkmark. Console matching ignores capitalization and surrounding spaces in `shortName`, preventing duplicate platforms.

The config header's minus button removes the whole console and all its emulator entries after confirmation. Undo restores everything. Every uploaded console supports this removal and info action, even without a database template.

## Add an emulator

1. Create `emulators/<emulator-id>/emulator.json` using lowercase kebab-case. One emulator package per directory.
2. Add a `description` and an `entries` array of `{ shortName, emulator }` objects. Copy an existing emulator file as a starting point.
3. Register `{ "id": "your-emulator", "path": "your-emulator/emulator.json" }` in `emulators/index.json`.

Add an optional numeric `status` at the top level of `emulator.json`, alongside `description` and `entries`: `"status": 0` shows a red dot, `"status": 1` yellow, and `"status": 2` green. The softly glowing dot appears to the left of every database row from that definition. Missing or unrecognized values show a muted gray dot. Status is database metadata only and is never copied into the user's configuration.

Hover labels are **Not Working** (0), **Needs Testing** (1), **Fully Working** (2), and **Missing Info** (missing or invalid status). Screen readers use the same labels.

Each mapping's `shortName` selects its console. An emulator requires `id`, `name`, `routeType`, non-empty `commands` (each with `description` and `command`), and optional `packages`. Copy launch commands accurately. One package may map to several consoles; short names must be unique within a definition. Registry IDs and console template short names must also be unique.

Emulator rows remain visible under a missing platform, but their + buttons are disabled until its console is added. Adding or updating an individual emulator preserves console metadata and other emulator entries. Existing emulator IDs match without case sensitivity; commands merge by description and packages are combined without duplicates. Updates to an existing emulator require confirmation. The emulator info button shows only that emulator's JSON. Removing its last emulator keeps the console.

The database count shows distinct visible emulator packages, excluding console templates. No central JavaScript list, per-emulator README, icon, outer name, outer ID, or schema version is required for a definition.

## Existing combined definitions

Older complete-console objects inside an emulator file's `entries` still load. They appear as console header controls and individual emulator rows. Their console action now replaces the whole console after confirmation. To edit descriptions independently, move the full console into a separate console definition and leave `{ shortName, emulator }` mappings in the emulator file. A separately registered console template takes precedence over a legacy template for the same short name.

## Check your addition

Run `npm test`, `npm run build`, and `npm start`. Open `/iisu-emulator-editor/` and check adding, replacing, removing, undoing, and both info panels. Tests discover both registries automatically. Invalid definitions show an error while valid definitions continue to load. Keep personal configuration files out of contributions.
