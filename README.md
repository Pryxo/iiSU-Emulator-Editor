# EmuConfig

A static, browser-local editor for **emuladores.json**. Upload that one file to open a compact workspace with the emulator database and your catalog side by side. Both lists are grouped by console. Use **+** to add, **−** to remove, and **i** for read-only JSON. Download the edited JSON directly under its original filename.

## Run locally

With Node.js 22 or later (no packages to install):

```sh
npm test
npm run build
npm start
```

Open http://127.0.0.1:4173/emuconfig/. The subpath intentionally exercises GitHub project-page compatibility. The Node server is only a local preview helper; the deployed site consists entirely of static files. Alternatively, serve `dist/` with any static HTTP server. Opening `index.html` using `file://` is unsupported because browsers restrict module/JSON loading.

## Publish on GitHub Pages

1. Create your GitHub repository and push this project to `main`.
2. Open repository **Settings → Pages → Source → GitHub Actions**.
3. Run the included **Deploy static site to GitHub Pages** workflow, or push to `main`.
4. The workflow tests the project and publishes only the allowlisted `dist/` artifact.

The supplied root input files are ignored by Git and excluded from deployment. Keep personal configuration files out of commits. Emulator packages contain public launch definitions and a description. No repository remote was supplied, so this project has not been published. GitHub links infer the repository on `*.github.io`; for a custom domain, set `repositoryUrl` in `js/settings.js`.

## What the editor changes

- `emuladores.json`: inserts or updates one emulator inside an **existing** console's `emulators` array, matching `shortName` and case-insensitive emulator `id`.
- Unknown properties, unrelated consoles, existing extra commands, and package names are preserved. Matching command descriptions are updated while retaining unknown command properties. Changes to existing values require confirmation.
- The original parsed catalog is retained in memory. Undo reverses the latest action by reconstructing from the original. The Changes dialog includes Undo all and a focused before/after preview.
- Removing an emulator removes only that entry; unrelated settings stay intact.
- Duplicate additions are disabled. An unchanged download keeps the original text exactly. Edited JSON preserves detected indentation, line endings, BOM, values, and filename; whitespace is otherwise normalized.
- Files live only in memory. Refresh clears the session. No analytics, uploads, cookies, localStorage, or service worker. Once the library has loaded, core editing works offline; an offline page reload is not guaranteed.

## Mappings and limitations

The database now contains **Eden Duo for Nintendo Switch**, using the exact emulator JSON supplied by the user. The normal catalog entries (Dolphin, RetroArch, PPSSPP, AetherSX2, melonDS, and Cemu) were removed from the bundled library because they already exist in standard configurations. Uploaded catalogs are unaffected by that cleanup.

Eden Duo's launch command has not been tested on an Android device. This tool never executes commands or installs apps. Only mappings for consoles in the uploaded catalog are shown. The Switch console uses shortName "switch". The heading counts distinct custom emulators; its tooltip shows the console-entry count.

New consoles cannot be invented automatically.

Limits: 10 MB per input file, JSON only, unique console keys and emulator IDs per console, supported unversioned/schema-version-1 format. Unsafe integer values are rejected to avoid silent numeric corruption. JSON formatting and non-integer numeric spelling may normalize when a file changes. Duplicate object property names are rejected before parsing to avoid silently dropping values.

## Structure

- `js/config-validator.js`: target-format checks.
- `js/config-merger.js`: catalog merge and undo.
- `js/config-loader.js`: file decoding and metadata.
- `js/emulator-loader.js`: versioned registry, isolated definition failures.
- `js/download.js`: JSON serialization and direct download.
- `js/ui.js`: safe DOM rendering, JSON preview, accessible native dialogs.
- `js/app.js`: predictable session state and interactions.
- `emulators/<id>/`: one emulator.json containing a description and console entries. No per-emulator README or icon required.
- `docs/`: format and contribution documentation in Markdown and browser-readable HTML.

Change the app name or repository link in `js/settings.js`. No JavaScript changes are needed for normal emulator contributions. See [adding emulators](docs/adding-emulators.md) and [format reference](docs/json-format.md).

## Verification

`npm test` checks supplied definition schemas, preservation of unknown keys, safe merges, duplicate handling, unsupported versions, undo, file parsing, and JSON export. Optional local browser QA lives in `tests/browser.mjs` and requires Playwright; it is not shipped or needed by the site.

## License

MIT for this editor and its original brand artwork. Emulator names identify their respective projects. No affiliation with emulator or frontend projects is implied.
