# Testing

The test strategy is layered so failures point at the right boundary. A green
unit suite does not prove the desktop app works; this document is explicit about
what each layer covers.

## Current verified results

Environment: Ubuntu 26.04, Node 22.22.2, Rust 1.93.1, Blender 5.2.0 LTS
(Flatpak), Python 3.14.4.

| Layer | Command | Result |
|---|---|---|
| Frontend unit | `npm test` | **63 passed**, 11 files |
| Typecheck | `npm run typecheck` | passed |
| Lint | `npm run lint` | passed |
| Frontend build | `npm run build` | passed |
| Browser E2E | `npx playwright test` | **1 passed**, 1 skipped (opt-in import test) |
| Rust unit | `cd src-tauri && cargo test` | **13 passed** |
| Python | `cd backend && .venv/bin/pytest -q` | **53 passed** |
| Blender integration | `.venv/bin/pytest -q -m blender` | **3 passed** |
| Import E2E (opt-in) | `WRAPFORGE_TEST_MODEL=/path/car.glb npx playwright test e2e/import-model.spec.ts` | **1 passed** (14 panels, 10 layers, 2048² atlas export) |
| Tauri build | `npm run tauri build -- --debug --no-bundle` | passed |
| Desktop launch | run built binary | window rendered; screenshot captured |
| Desktop IPC (manual WebDriver) | `tauri-driver` + WebKitWebDriver | create → save → close → reopen, 3D model load, 1600×1000 render |
| Desktop imported-car render (manual WebDriver) | `tauri-driver` + WebKitWebDriver | opened a project containing a real 4.3 m car, composed its livery, and rendered 1600×1000 in Blender with the composed atlas |

Not verified: Windows/macOS, release bundles, signing, and automated desktop UI
interaction through the IPC path.

## Frontend unit tests (Vitest)

Location: `src/**/*.test.{ts,tsx}`.

| File | Covers |
|---|---|
| `lib/project/schema.test.ts` | Schema constraints, defaults, IDs, colors, ranges |
| `lib/project/migrations.test.ts` | v0→v1, envelope unwrapping, newer-schema rejection, invalid data |
| `lib/project/validation.test.ts` | Duplicate IDs, missing references, non-wrap panels, print linkage |
| `lib/print/units.test.ts` | mm/cm/in conversion, pixel math, memory estimate |
| `lib/print/validation.test.ts` | Bleed, DPI, safe margin, clipping, raster limits, labels |
| `lib/graphics/svg.test.ts` | Sanitization, dimensions, data URLs |
| `lib/store/projectStore.test.ts` | Load/update/undo/redo/history/save marking |
| `lib/i18n/i18n.test.ts` | Key coverage, interpolation, fallback |
| `lib/platform/browser.test.ts` | localStorage project round-trip, honest capability errors |
| `test/app.test.tsx` | App renders the shell and home state |

Run:

```bash
npm test
npm test -- --reporter=verbose
npm test -- src/lib/print
npm run test:coverage
```

## Browser end-to-end (Playwright)

`e2e/workflow.spec.ts` drives the real React app in Chromium:

1. Create a project.
2. Open the panel list.
3. Import/choose a sample SVG.
4. Place it on a panel.
5. Open print layout.
6. Save to browser storage.
7. Reload and reopen the project.

```bash
npx playwright install chromium   # once
npx playwright test
npx playwright test --headed
npx playwright test --debug
```

The Vite dev server is started by the Playwright config at
`http://127.0.0.1:1420`. Failures retain traces and screenshots.

Browser E2E does not cover native dialogs, Tauri IPC, or Blender.

## Rust unit tests (Cargo)

Inline `#[cfg(test)]` modules:

| Module | Covers |
|---|---|
| `paths.rs` | Traversal/absolute rejection, invalid names, atomic write/backup |
| `blender.rs` | Version parsing, compatibility classification, discovery (skips when absent) |
| `render.rs` | Render request validation and paint colour parsing |

```bash
cd src-tauri
cargo test
cargo test -- --nocapture
```

Blender discovery tests skip when Blender is not installed. The skip is printed;
it is not a pass.

## Python backend (pytest)

`backend/tests/`:

| File | Covers |
|---|---|
| `test_print_layout.py` | Print geometry, bleed, DPI, pixels, issues |
| `test_models.py` | Pydantic manifest/print models and validation |
| `test_asset_validation.py` | License, panels, UV, model path, size |
| `test_paths.py` | Safe relative paths and joins |
| `test_cli.py` | JSON stdio commands |
| `test_blender.py` | Discovery, version parsing, and a **real render** with a texture |

```bash
cd backend
.venv/bin/pytest -q
.venv/bin/pytest -q -m blender
.venv/bin/pytest -vv -s tests/test_blender.py
```

Blender-marked tests skip when Blender is unavailable. They create a temporary
scene, render a PNG, and assert that the file is non-trivial and that metadata
reports the actual engine.

## Typecheck, lint, build

```bash
npm run typecheck
npm run lint
npm run build
```

`npm run build` runs `tsc --noEmit` first, then Vite. Warnings about chunk size
and Tailwind source maps are known and non-blocking.

## Desktop IPC verification (manual WebDriver harness)

There is no committed desktop UI test yet, but the installed desktop app was
driven with Tauri's WebDriver stack. This caught a bug the browser suite could
not: a production CSP without `blob:` in `connect-src` blocked models loaded from
saved projects.

```bash
# system WebDriver (Ubuntu package name)
sudo apt-get install -y webkitgtk-webdriver xdotool

# Tauri's WebDriver proxy
cargo install tauri-driver --locked --root /tmp/wf-tauri-driver

npm run tauri build -- --debug --no-bundle
```

Run the proxy with a clean environment and X11 so native windows are visible:

```bash
env -i HOME="$HOME" USER="$USER" DISPLAY=:0 GDK_BACKEND=x11 \
  XDG_RUNTIME_DIR=/run/user/$(id -u) \
  DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus \
  XAUTHORITY="$XAUTHORITY" PATH=/usr/local/bin:/usr/bin:/bin \
  /tmp/wf-tauri-driver/bin/tauri-driver --port 4444 \
  --native-driver /usr/bin/WebKitWebDriver
```

Create a session:

```bash
curl -s -X POST http://127.0.0.1:4444/session \
  -H 'Content-Type: application/json' \
  -d '{"capabilities":{"alwaysMatch":{"tauri:options":{"application":"'"$PWD"'/src-tauri/target/debug/wrapforge"}}}}'
```

Use W3C WebDriver endpoints (`/element`, `/element/{id}/click`,
`/execute/sync`, `/screenshot`) to:

1. Fill `#home-project-name` and click `.input-row button`.
2. Open **File → Save** (the save dialog resolved to Downloads in the verified
   environment; interact with the native dialog if your setup differs).
3. Confirm `project.json`, `assets/vehicle/vehicle.glb`, and `.bak` exist.
4. Open **File → Close project**, then click `.recent-item`.
5. Open **3D Design Studio**; confirm "Vehicle ready".
6. Open **Render Studio**, click **Render with Blender**, and wait for
   "Render complete".
7. Confirm the PNG, metadata JSON, and log in `renders/`.

Checks:

- The window opens at the configured size.
- Home renders with the sample vehicle preview.
- Create, save, close, and reopen preserve the project.
- The saved model loads (not just the bundled sample).
- The render reports `BLENDER_EEVEE`, 1600×1000, and a non-zero duration.
- The PNG is a valid 1600×1000 image.

This is a manual harness, not CI. Record the exact results in the PR and do not
describe it as automated. A committed harness is on the roadmap.

## Adding tests

- Pure logic: add a Vitest or pytest test next to it.
- A new Tauri command: add a Rust validation test, then a frontend adapter test.
- A new schema field: add a migration fixture and a round-trip test.
- A new print rule: test both error and warning paths, and the label result.
- A new Blender option: extend the integration test and assert metadata.
- Texture orientation: any change to how textures are written must be checked
  with an asymmetric design. Both the livery atlas and panel textures are
  written in the glTF convention and flipped once inside the render script; a
  double flip is invisible on symmetric artwork.

### Debug builds and the render script

`render_scene.py` is copied next to the binary at build time. Debug builds
prefer `src-tauri/resources/blender/render_scene.py` so an edit takes effect on
the next render without rebuilding; release builds use the bundled copy.
- A UI workflow: extend Playwright, but do not pretend it covers the desktop IPC.

Test data belongs in `src/test/fixtures.ts`, `backend/tests`, or a temporary
directory. Do not commit large binary fixtures.

## Flakiness rules

- No arbitrary sleeps; wait on conditions.
- Blender tests get generous timeouts and are marked.
- Playwright is serial (`fullyParallel: false`) because the app uses shared
  browser storage.
- Tests must not depend on network access.
- Clean up temp directories.

## CI expectations

CI runs separate jobs for frontend, backend, Rust, and build. A skipped Blender
test is reported as skipped, never as passed. See `.github/workflows`.
