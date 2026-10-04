# Add an emulator

1. Create `emulators/<emulator-id>/` using lowercase kebab-case. One emulator per directory.
2. Add `emulator.json` with a `description` and an `entries` array. Copy the Eden Duo definition as a starting point.
3. Register `{ "id": "your-id", "path": "your-id/emulator.json" }` in `emulators/index.json`.
4. Run `npm test`, `npm run build`, and `npm start`. Test at `/emuconfig/`, including adding, removing, and the info panel.

## Definition

`description` is the text shown above the emulator JSON in the info panel. It is displayed for database entries and matching entries in your uploaded configuration. It is not added to the exported configuration.

`entries` contains `{ shortName, emulator }` objects. The console short name chooses where to add the emulator. Console names come from the uploaded configuration when the console already exists. Each emulator object retains its required `id`, `name`, `routeType`, non-empty `commands` (each with `description` and `command`), and optional `packages`. Copy launch commands accurately.

No per-emulator README, icon, status, provenance, outer name, outer ID, or schema version is required. Keep any useful emulator notes in the description. The registry supplies the package identity.

Adding an emulator copies its complete payload, including all commands and packages, into emuladores.json. The editor updates one console per action. One package can have multiple console mappings, with unique console short names. IDs must be unique in the registry. Register custom additions rather than duplicating entries already present in the normal catalog. The database count shows distinct emulator packages, not mapping rows.

No central JavaScript list needs editing. An invalid definition produces a readable error while the remaining definitions continue to load. Add tests if the contribution changes merge behavior.

## Add a whole console

An item in `entries` can also be a complete console object with `shortName`, `longName`, and an `emulators` array. Paste your console object here, including metadata such as `romExtensions`, `manufacturer`, and release dates. See [JoiPlay](../emulators/joiplay/emulator.json) for a complete example.

```json
{
  "description": "My platform and its emulators",
  "entries": [
    {
      "shortName": "my-platform",
      "longName": "My Platform",
      "romExtensions": [".rom"],
      "emulators": []
    }
  ]
}
```

Register the file in `emulators/index.json` as usual. Full console entries appear in the database and console filter even when absent from the uploaded file. Click + on the console row to add the entire object and all its emulators. The info button previews the complete console JSON.

Console identity uses `shortName`, ignoring capitalization and surrounding spaces. If the console already exists, the editor keeps its name, metadata, ROM extensions, and other settings, and merges the supplied emulators by ID. Existing commands that would change require confirmation. Repeated additions do not duplicate consoles or emulators. Undo reverses the entire add action, including a newly created console.

Do not mix `emulator` and `emulators` in the same entry. A definition may mix legacy emulator mappings and full console entries for different consoles; console short names must remain unique within it. Empty emulator arrays are allowed. Removing a console's last emulator keeps the console; undo the original console addition to remove that new console entirely.
