# Architecture

## Goals

1. A dedicated desktop design application, not a website in a window.
2. A design document independent of Blender.
3. Real, reproducible 3D rendering through a managed Blender process.
4. Print-oriented output with explicit validation and honest labels.
5. Offline-first operation with no account, telemetry, or cloud dependency.
6. A modular monolith that can grow without a rewrite.

## Non-goals for the alpha

- Manufacturer-accurate vehicle databases.
- A full Illustrator-class vector editor.
- Guaranteed installation-ready flat patterns.
- Cloud collaboration, asset marketplaces, or plugin execution.

## Components

```
┌──────────────────────────────────────────────────────────────────┐
│ React renderer (WebView)                                         │
│                                                                  │
│  views/            Home, Vehicle, Studio, Artwork, Panels,       │
│                    Projection, Print, Render, Export, Library,   │
│                    Preferences, Diagnostics                       │
│  stores/           project document + history, UI state, exports  │
│  lib/project/      Zod schema, migrations, defaults, validation   │
│  lib/print/        physical units, print plans, rules             │
│  lib/graphics/     SVG sanitizing, panel rasterization            │
│  lib/vehicle/      glTF analysis, normalisation, panel detection  │
│  lib/livery/       atlas composition, projection bake, presets    │
│  lib/platform/     desktop (Tauri) and browser adapters           │
└──────────────────────────────┬───────────────────────────────────┘
                               │ invoke() / events
┌──────────────────────────────▼───────────────────────────────────┐
│ Tauri 2 Rust shell                                                │
│                                                                  │
│  project.rs        save/load, atomic writes, asset copy, paths    │
│  recent.rs         local recent-project index                     │
│  blender.rs        discovery, version compatibility, probe        │
│  render.rs         job lifecycle, progress, cancellation, logs    │
│  paths.rs          traversal/symlink-safe path resolution         │
└───────────────┬──────────────────────────────┬───────────────────┘
                │ argv arrays                  │ files
                ▼                              ▼
┌───────────────────────────────┐   ┌──────────────────────────────┐
│ Blender 4.2+/5.2 headless     │   │ Project folder               │
│ render_scene.py               │   │  project.json                │
│  glTF import                  │   │  assets/vehicle/*.glb        │
│  panel materials + textures   │   │  assets/artwork/*.svg|png    │
│  studio lighting/camera       │   │  renders/*.png + *.json      │
│  Eevee/Cycles render          │   │  renders/logs/*.log          │
└───────────────────────────────┘   │  thumbnail.png               │
                                    └──────────────────────────────┘

Python backend (`backend/`) is a separate, independently testable layer:
Pydantic manifest/print models, validation, print planning, Blender adapter,
and a JSON-over-stdio CLI. It is used by tests and automation; the interactive
process lifecycle lives in Rust.
```

## Design document

`src/lib/project/schema.ts` defines the versioned document with Zod:

- `ProjectDocument` — identity, timestamps, vehicle instance, artwork,
  placements, print/render configuration, viewport settings.
- `VehicleInstance` — asset reference, paint, dimensions, panel metadata,
  license, validation report.
- `ArtworkAsset` — source-preserving SVG/raster/live-text asset.
- `Placement` — artwork-to-panel mapping in UV space with transform/opacity.
- `PrintConfiguration` — unit, scale, DPI, bleed, safe margin, colour mode,
  panel selection.
- `RenderConfiguration` — preset, resolution, engine, samples, camera.

IDs are prefixed (`proj_`, `art_`, `placement_`). Envelopes add `format`,
`formatVersion`, `appVersion`, and `savedAt`.

### Migrations

`migrations.ts` walks an explicit version ladder (currently `0 -> 1`), preserves
unknown optional fields where practical, and rejects documents from newer
schemas instead of silently damaging them. Every load validates through Zod
after migration.

## State

- `projectStore` owns the document, dirty flag, undo stack, and redo stack.
  Updates clone the document, apply a mutator, and push the previous snapshot
  (bounded to 80 entries).
- `uiStore` owns view, theme, language, selection, toasts, busy/status,
  autosave status, modal state, and the configured Blender path.
- `exportStore` is a session-only history of files written.

Autosave runs 2.2 seconds after a change when a project root exists. It writes
through the same service as manual save and only commits the in-memory state if
the document did not change during the write (`markSavedIfUnchanged`).

## Persistence

A project is a folder:

```
<name>.wrapforge/
  project.json
  thumbnail.png
  assets/vehicle/...
  assets/artwork/...
  renders/...
```

The Rust shell:

1. Canonicalizes the project root and rejects non-absolute paths.
2. Restricts save-time asset writes to `assets/`.
3. Resolves every read/write with `safe_read_path` / `safe_write_path`, which
   reject `..`, absolute components, backslashes, symlink escapes, and null
   bytes.
4. Copies the bundled sample glTF into the project on first save, making the
   project portable and readable by sandboxed Blender.
5. Writes project JSON through a temp file, fsync, and rename; keeps
   `project.json.bak` for recovery.
6. Limits project JSON (50 MB), assets (200 MB total), imports (50 MB), and
   exports (500 MB per file).

Browser mode uses `localStorage` with the same schema and the same validation,
but no native filesystem or Blender. It exists for development, demonstration,
and Playwright tests.

## 3D viewport

`VehicleViewport.tsx` uses three.js. It has two operating modes.

**Panel mode** (bundled asset):

- GLB loaded with `GLTFLoader`; panel identity comes from glTF extras
  (`panelId`, `wrapable`).
- Each wrap panel gets an independent `MeshStandardMaterial` (the glTF material
  is shared, so it must be cloned per panel).
- Per-panel textures are generated from canvas compositions: paint background +
  artwork drawn in panel UV space. Textures are regenerated only when project
  content changes.
- Raycasting selects wrap panels; a separate selection outline is attached.
- OrbitControls, camera presets, grid, floor, PBR environment lighting, shadow
  mapping, and panel isolation are implemented.
- The renderer is disposed on unmount; model loads are cancelled by a flag.
- If WebGL context creation fails, the viewport reports it instead of crashing
  the studio.

**Texture mode** (imported model, detected from `panels[].geometry`):

- `normalizeVehicle()` rotates, scales to metres, and grounds the model, then
  `collectSurfaces()` flattens every mesh into world-space triangles.
- Panel overlays are built from the triangle runs stored on each panel, so
  highlights work on a single-mesh model.
- Picking maps `Raycaster` face indexes through an `Int16Array` panel lookup.
- The composed livery atlas is bound as a `CanvasTexture` on every UV-mapped body
  mesh and refreshed each frame while painting.
- Painting raycasts to `intersection.uv` and forwards normalised atlas
  coordinates to `useLiveryTexture`, which paints vector strokes into an
  offscreen canvas and merges it with a cached static composition.

Blender uses the same project data, not the three.js scene: the frontend
rasterizes the panel compositions at 2048 px and passes them to the Rust process
manager.

## Livery composition

`composeLivery()` builds the atlas in four passes:

1. Base finish: the model's base-colour texture, tinted through its own luminance
   (`saturation`/`luminosity` compositing) or flooded with a colour.
2. Projected layers, one design canvas per projection (1024²). `bakeProjection()`
   walks every UV triangle, maps each atlas pixel to a 3D point, projects it into
   the design plane, and samples the design. Back-facing triangles are skipped so
   the left design does not bleed onto the right side.
3. Atlas layers, drawn directly into the texture.
4. Brush strokes, rasterised separately so they can be repainted live.

## Render pipeline

1. The user starts a render. The frontend saves the project if needed.
2. The frontend generates one PNG texture per panel that has artwork.
3. `start_render` validates the request, resolves the model and script, copies
   the script/model into a job temp directory, writes textures and a JSON
   config, and spawns Blender with an argument array.
4. Blender runs `-b --factory-startup --python render_scene.py -- config.json`.
5. The script imports the glTF, replaces wrap-panel materials, builds a studio
   stage and camera, renders, and writes metadata JSON.
6. Rust reads stdout, forwards `WF_PROGRESS` lines as `render://progress`
   events, writes a log, waits for the process, and emits
   `render://done` or `render://failed`.
7. Cancellation sets a flag and sends SIGTERM (Unix) or `taskkill` with numeric
   arguments (Windows).
8. On success, the temp directory is removed. On failure it is retained, and the
   log path is returned.

Flatpak Blender can only read paths visible to its sandbox. The shell refuses
projects outside the home directory (or `/tmp`) when Blender was detected as a
Flatpak, with an actionable message. The render script, model, textures, and
output all live under the project root.

## Print pipeline

`validatePrintProject` builds a plan for every wrap-able panel:

- trim size = panel metadata × scale
- output size = trim + 2 × bleed
- pixels = ceil(mm / 25.4 × DPI)
- raster memory estimate
- issue list (errors block; warnings require acknowledgment; info explains)

Exports are labelled `print-ready` only when errors and warnings are both zero.
Otherwise files are prefixed `wrapforge-draft-` and the manifest records
`productionReady: false`. No CMYK/ICC pipeline exists, so requesting CMYK
produces a warning and a draft label. Panel export draws trim, safe area, crop
marks, registration marks, and labels; SVG export preserves vector artwork and
live text.

## Security boundaries

- The WebView is trusted local code; all imported files are untrusted.
- SVG is sanitized (scripts, event handlers, external URLs, foreignObject).
- GLB is loaded by three.js or Blender; embedded scripts are not executed.
- Subprocesses receive argument arrays, never shell strings.
- No local HTTP service is exposed. The Tauri IPC surface is the only backend
  boundary.
- CSP restricts scripts to self, images to self/data/blob, and frames to none;
  local model fetches use `blob:`/`data:` in `connect-src`.
- Diagnostics are local and redact common home-directory patterns.

See [THREAT_MODEL.md](THREAT_MODEL.md).

## Verified environment

- Ubuntu 26.04 (x86_64), 16 cores, 30 GB RAM
- Node 22.22.2, npm 10.9.7
- Rust 1.93.1, Cargo 1.93.1
- WebKitGTK 2.52.6, GTK 3.24.52
- Blender 5.2.0 LTS via Flatpak
- Python 3.14.4, pydantic 2.14.1, pytest 8.4.2

No Windows or macOS verification has been performed.
