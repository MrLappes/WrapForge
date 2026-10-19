# Progress

**Timestamp:** 2026-10-18 20:40 UTC
**Version:** 0.1.0-alpha.0 (schema v2)
**Milestone:** 10 of 10 (alpha scope + generic vehicle import and texture livery),
release hardening remaining

## Environment verified

| Component | Version | Source |
|---|---|---|
| OS | Ubuntu 26.04 LTS, x86_64 | `lsb_release` |
| Node.js | 22.22.2 | `node -v` |
| npm | 10.9.7 | `npm -v` |
| Rust | 1.93.1 | `rustc --version` |
| Cargo | 1.93.1 | `cargo --version` |
| WebKitGTK | 2.52.6 | system package |
| GTK | 3.24.52 | system package |
| Blender | 5.2.0 LTS (Flatpak `org.blender.Blender`) | `flatpak run org.blender.Blender --version` |
| Python | 3.14.4 | `python3 --version` |
| pydantic | 2.14.1 | backend venv |
| pytest | 8.4.2 | backend venv |

Rust and the Tauri system libraries were installed with `pkexec apt-get` during
this session. Blender was already installed as a Flatpak and was not downloaded
or redistributed.

## Milestone 10 — generic vehicles and texture livery

| Item | Result |
|---|---|
| glTF import | Verified with a real 4.3 m car scan (4.1 MB, 50k triangles, 2 meshes, 1024² baked texture) |
| Unit inference | Inches detected → 4313 mm length, matching the real car |
| Panel detection | 14 named panels, 70% of body triangles classified |
| Texture livery | 3 presets, 10 layers applied; exported 2048² atlas |
| Projection bake | 98.1% of projected red pixels and 96.6% of projected gold pixels land inside UV islands |
| Brush painting | Vector strokes with alpha and erase, one undo step per stroke |
| Blender | New integration test renders with the livery atlas and a transparent background |
| Second model | Khronos CC0 ToyCar (5.4 MB, 109k triangles, no semantic names): imported, rescaled 0.07 m → 4.35 m, 14 panels, preset applied |
| Panel correction | Rename, merge, and remove verified in the browser on the 14-panel import; undo restores the original map |
| Layout | No horizontal overflow at 1440, 1180, 1024, 900, and 820 px; inspector tabs wrap; base texture survives studio remounts |
| Tests | Frontend 12 files / 69 tests, Python 53 (incl. 3 Blender), Rust 13, Playwright 1 + 1 opt-in import test |

The import test is opt-in because it needs a local model:
`WRAPFORGE_TEST_MODEL=/path/to/car.glb npx playwright test e2e/import-model.spec.ts`.

## Verification results

Commands were run in this repository in the environment above.

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | exit 0 |
| ESLint | `npm run lint` | exit 0, no warnings |
| Frontend unit | `npm run test` | **53 passed** (10 files) |
| Frontend build | `npm run build` | success; `dist/` generated |
| Browser E2E | `npx playwright test` | **1 passed** |
| Rust check | `cargo check` | clean |
| Rust tests | `cargo test` | **11 passed** |
| Python tests | `backend/.venv/bin/pytest -q` | **52 passed** |
| Blender integration | `backend/.venv/bin/pytest -q -m blender` | **2 passed** |
| Tauri debug build | `npm run tauri build -- --debug --no-bundle` | binary produced |
| Desktop launch | built binary with X11/Wayland display | window rendered, PNG captured |
| Desktop IPC | `tauri-driver` + WebKitWebDriver | create → save → close → reopen, 3D model load, 1600×1000 Blender render |

Known build warnings, accepted and documented:

- Vite warns that one chunk exceeds 500 kB (three.js dominates).
- Tailwind's source map warning appears in the production build.
- The debug Tauri binary is ~246 MB; this is not a release size claim.

## Working

- Project creation, defaults, save/load/open, recent projects, thumbnails,
  autosave, undo/redo, dirty-state tracking.
- Desktop IPC create → save (`project.json`, model copy, `.bak`) → close →
  reopen from Recent, verified through the running Tauri window.
- Schema versioning, migration from v0, rejection of newer documents, detailed
  validation errors with field paths.
- Sample CC0 vehicle generated reproducibly with 13 separate wrap panels,
  planar outer-face UVs, dimensions, area, and a validation report.
- three.js viewport with PBR environment, orbit/pan/zoom, panel picking,
  paint, per-panel textures, isolation, edges, camera presets, and capture.
- Panel correction after import: rename, merge into a neighbour, remove; each
  edit rewrites the panel map and is one undo step.
- SVG/raster/text artwork, sanitization, placement transforms, visibility and
  lock, duplication and deletion.
- Print planning with physical dimensions, bleed, safe margin, DPI, raster
  limits, validation, required warning acknowledgment, and honest
  print-ready/draft labels.
- PNG and SVG panel export with production guides and a JSON manifest.
- Blender discovery (including Flatpak), version classification, engine probe,
  managed render, progress events, metadata, logs, and cancellation.
- English/German shell localization, dark and light themes, command palette,
  keyboard shortcuts, toasts, status bar.
- Diagnostics bundle with redaction and a Blender self-test.

## Partial

- **Vehicle import UI.** Rust commands and manifest validation exist, but the
  full guided import flow is not exposed.
- **Desktop IPC coverage.** The shell, project save/reopen, model loading, and a
  Blender render were driven manually through `tauri-driver` +
  WebKitWebDriver. There is no committed CI harness for this path yet; browser
  E2E covers the same frontend workflow through the browser adapter.
- **German localization.** Shell, navigation, and common actions are translated;
  feature-specific copy falls back to English.
- **Project recovery.** Corrupt or newer projects produce a clear error; there
  is no guided repair or migration preview.
- **Render queue.** Jobs are tracked for the session only and are not persisted.
- **Large documents.** History is snapshot-based; no stress benchmark exists.
- **Accessibility.** Keyboard navigation, focus states, and reduced motion are
  implemented, but no external audit or screen-reader certification was done.

## Not implemented

- CMYK, ICC profiles, spot colours, PDF/X, TIFF.
- Geometric unfolding of curved panels.
- Planar, camera, and surface-conforming projection.
- User-installed asset packs and a writable library.
- Batch rendering and persistent queues.
- Windows/macOS builds, signed installers, notarization, auto-update.
- Plugin execution.
- Cloud sync or collaboration.

## Known bugs and sharp edges

1. **Flatpak path visibility.** Blender's Flatpak sandbox cannot read arbitrary
   absolute paths. Rendering a project outside the home directory (or `/tmp`)
   fails by design with an explanatory error. Fix: portal-based file access or a
   non-Flatpak Blender.
2. **Live text is not outlined.** Print exports preserve text and warn. Fonts
   must be available to the producing application.
3. **Panel texture resolution cap.** The viewport uses 2048 px panel textures;
   fine detail may be invisible until print export.
4. **Print math is duplicated.** TypeScript and Python implement the same rules;
   tests pin shared expectations, but divergence is possible without discipline.
5. **No colour management.** Colors are sRGB; display and print may differ.
6. **Assumed sample dimensions.** The sample vehicle's dimensions are plausible
   but not measured against a real vehicle.
7. **Session-only export history.** Restarting the app clears the list (files
   remain on disk).
8. **No committed desktop UI automation.** Regressions in IPC wiring could pass
   the browser suite. The manual WebDriver run caught a real production-only bug:
   the CSP `connect-src` did not allow `blob:`, so models from saved projects
   failed to load. Fixed by allowing `blob:` and `data:` in `connect-src`.

## Blockers

None for alpha development. Release work is blocked on signing credentials and
platform build machines, which are outside this environment.

## Decisions made this session

- Retained Tauri instead of switching to Electron because the required Rust and
  WebKitGTK toolchain was installable.
- Generated an original CC0 vehicle rather than importing licensed manufacturer
  data.
- Implemented UV placement only; documented the other projection methods as
  roadmap rather than shipping misleading controls.
- Kept print output RGB-only and made draft labelling a hard rule.
- Forced Cycles to CPU and refused to claim GPU acceleration.
- Disabled the React Compiler `react-hooks/set-state-in-effect` rule with an
  explanatory comment because asynchronous initialization and external-store
  synchronization are intentional.

## Next actions

1. Commit the `tauri-driver` desktop harness (create → save → reopen and a
   render job) so the manual verification is repeatable in CI.
2. Add guided project recovery and a migration preview.
3. Add explicit text outlining with font-availability checks.
4. Prototype CMYK/ICC export with LittleCMS and a real printer profile.
5. Implement planar and camera projection with distortion previews.
6. Add a persistent render queue and batch camera renders.
7. Verify builds on Windows and macOS, then produce signed installers and
   checksums.
