# Developer guide

## Prerequisites

- Node.js 22+ and npm 10+
- Rust 1.77+ (1.93 tested) and Cargo
- Tauri 2 Linux libraries (see [README](../README.md))
- Python 3.11+ for the backend suite
- Blender 4.2+ for render tests and manual render verification
- Playwright Chromium for browser E2E

## Setup

```bash
npm install
python3 -m venv backend/.venv
backend/.venv/bin/pip install -e "backend[dev]"
npx playwright install chromium
```

Run:

```bash
npm run dev            # browser preview on :1420
npm run tauri dev      # desktop shell with HMR
```

## Repository map

```
src/
  App.tsx                  view routing, global shortcuts
  styles.css               design tokens and layout
  components/ui/           Button, Field, Panel, Dialog, Badge, Spinner…
  components/shell/        MenuBar, Sidebar, StatusBar, Toasts, palette, modals
  features/<area>/         one view per workspace
  lib/
    project/               schema, defaults, migrations, validation, service
    print/                 units and print planning/validation
    graphics/              SVG sanitize, artwork loading, panel rasterization
    platform/              browser and desktop adapters
    store/                 Zustand project/ui/export stores
    i18n/                  dictionaries and translate()
    diagnostics/           redacted logging
    autosave.ts            debounced save + viewport capture registry
    useProjectActions.ts   all document actions
src-tauri/
  src/lib.rs               command registration, exit cleanup
  src/paths.rs             path safety, atomic writes, limits
  src/project.rs           project I/O commands
  src/recent.rs            recent-project index
  src/blender.rs           discovery, version, probe
  src/render.rs            render job lifecycle
  resources/blender/render_scene.py
backend/wrapforge_backend/ models, print_layout, paths, asset_validation,
                           blender, cli
tools/generate_sample_vehicle.py
e2e/workflow.spec.ts
```

## Frontend architecture

### Document flow

```
UI event → useProjectActions → projectStore.update(mutator, label)
        → new ProjectDocument → React re-render + autosave scheduling
        → platform.saveProject → Tauri command / localStorage
```

- Views never mutate the document directly. Use `useProjectActions`.
- `update()` clones and pushes the previous snapshot for undo.
- Validation at load boundaries uses Zod; never trust a parsed object.
- Derived values (print plans, panel textures, manifests) are computed, not
  stored in the document.

### Adding a view

1. Add the ID to `AppView` in `uiStore.ts`.
2. Add the component under `src/features/<area>/`.
3. Register it in `App.tsx`.
4. Add a sidebar entry in `Sidebar.tsx` with translation keys.
5. Add English and German strings.
6. Add a test if the view contains non-trivial logic.

### Adding a document field

1. Update `schema.ts` and defaults.
2. Increment `SCHEMA_VERSION` if the change is incompatible.
3. Add a migration and fixture.
4. Update `validation.ts` if integrity rules apply.
5. Update `docs/PROJECT_FORMAT.md`.
6. Add a round-trip test.

### Platform adapter

`src/lib/platform/types.ts` defines the contract. `desktop.ts` invokes Tauri
commands; `browser.ts` uses `localStorage` and downloads.

When adding a capability:

1. Add it to the interface.
2. Implement both adapters. The browser adapter must fail honestly, not fake
   success.
3. Handle the desktop event listener lifecycle.
4. Test the browser path; exercise the desktop path manually or with a
   WebDriver test.

## Rust shell

### Commands

| Command | Purpose |
|---|---|
| `save_project` | Validate root, copy assets, write JSON + thumbnail |
| `load_project` | Read JSON with size limit, return text for JS validation |
| `inspect_project_root` | Check for an existing project and identity |
| `read_project_text` | Read a relative text file inside a project |
| `read_project_binary_base64` | Read a model/image inside a project |
| `import_file` | Read an external file with a size limit |
| `write_absolute_file` | Write an export chosen by the native dialog |
| `write_export_file` | Write a validated filename into a chosen export directory |
| `read_image_base64` | Read an image for preview/thumbnail |
| `list_recent_projects` | Recent index from app data |
| `discover_blender` | Find and classify Blender |
| `probe_blender` | Run a factory-startup engine probe |
| `start_render` | Validate, stage, and spawn a render job |
| `cancel_render` | Terminate a job by ID |

### Path rules

Every command that accepts a path must use `paths.rs`:

- `absolute_path` for user-chosen absolute paths.
- `canonical_project_root` / `existing_project_root` for roots.
- `safe_relative` for project-relative paths.
- `safe_read_path` / `safe_write_path` for actual access.
- `read_limited`, `write_atomic`, `parse_data_url` for I/O.

Do not join user input onto a root manually. Do not use `Command::new("sh")`.

### Adding a command

1. Implement `#[tauri::command]` with typed arguments and `AppResult`.
2. Validate all inputs and enforce size limits.
3. Register it in `lib.rs`.
4. Add the TypeScript wrapper in `desktop.ts` and the interface.
5. Add a Rust unit test for validation and a frontend test for the adapter.
6. Update the capability file only if a plugin permission is required.

### Render protocol

Config JSON (written by Rust):

```json
{
  "modelPath": "/abs/project/assets/vehicle/vehicle.glb",
  "outputPath": "/abs/project/renders/render-....png",
  "metadataPath": "/abs/project/renders/render-....json",
  "engine": "EEVEE",
  "resolution": [1600, 1000],
  "samples": 64,
  "camera": "three-quarter",
  "transparent": false,
  "floor": true,
  "paintColor": "#d8dde3",
  "panels": [{ "id": "hood", "texturePath": "/abs/.../hood.png" }]
}
```

The script prints one line per update:

```
WF_PROGRESS {"stage":"render","progress":0.6,"message":"Rendering"}
```

Rust forwards these as `render://progress`, then `render://done` or
`render://failed`. Metadata includes engine, device, Blender version,
resolution, duration, and warnings.

When changing the protocol:

1. Update both sides in one change.
2. Keep backward compatibility or bump a protocol version.
3. Update the Rust tests and the Blender integration test.
4. Verify with a real render, not a mock.

## Python backend

```bash
cd backend
.venv/bin/pytest -q
.venv/bin/pytest -q -m blender
.venv/bin/python -m wrapforge_backend.cli --help
```

The backend is independent of the desktop app. Keep print math and manifest
validation consistent with TypeScript; tests pin shared expectations.

## Testing strategy

See [TESTING.md](TESTING.md). In short:

- Pure logic: Vitest and pytest.
- Boundary validation: schema/migration/integrity tests.
- Adapter behavior: browser platform tests.
- UI workflow: Playwright browser E2E.
- Rust: unit tests for paths, Blender parsing, render validation.
- Integration: real Blender render with a real texture.
- Manual/desktop: build and launch; not yet automated through IPC.

## Debugging

- Frontend: browser DevTools in `npm run dev`; Tauri devtools in debug builds.
- Rust: run the binary from a terminal to see stderr; there is no logging framework yet.
- Blender: inspect `renders/logs/*.log`; run the generated command manually.
- Projects: inspect `project.json`; a `.bak` exists after overwriting.
- Diagnostics view exports environment facts and recent logs.

Useful commands:

```bash
npm run typecheck
npm run lint
npm run test -- --reporter=verbose
cargo test -- --nocapture
backend/.venv/bin/pytest -vv -s
npx playwright test --headed
```

## Performance notes

- Panel textures are capped at 2048 px in the viewport.
- three.js scene objects are reused; effects are separated from construction to
  avoid reloading the model on every state change.
- The renderer is disposed on unmount.
- Undo uses snapshots; large documents multiply memory. Profile before adding
  structural sharing.
- Blender is the expensive path; avoid spawning it in tests unless marked.

## Code review checklist

- Does it work when actually run?
- Are untrusted inputs validated (JSON, SVG, paths, subprocess args)?
- Is behavior preserved for existing projects?
- Are new limitations documented?
- Are tests meaningful and non-flaky?
- Is user-facing text translated or intentionally English-only?
- Does it avoid network access and telemetry?
