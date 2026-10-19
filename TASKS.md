# Tasks and milestone status

Legend: `[x]` implemented and verified · `[~]` partial or unverified in some
environments · `[ ]` not started · `[!]` blocked or intentionally deferred

Last updated: 2026-10-18

## Milestone 0 — Foundation

- [x] Repository scaffold, TypeScript strict mode, ESLint, Prettier, EditorConfig
- [x] Pinned dependency manifest and lockfile
- [x] Apache-2.0 license, NOTICE, third-party notices
- [x] Tauri 2 shell with hardened CSP and capabilities
- [x] Design tokens, dark-first theme, real light theme
- [x] Shell layout: menu bar, sidebar, status bar, toasts, command palette
- [x] English/German i18n infrastructure
- [x] Diagnostics logging with redaction
- [ ] Signed installers and auto-update channel
- [ ] Windows and macOS build verification

## Milestone 1 — Project lifecycle and document model

- [x] Versioned Zod document schema (`schemaVersion: 1`)
- [x] Defaults and ID generation
- [x] Migration ladder and newer-schema rejection
- [x] Integrity validation (referential, geometric, print consistency)
- [x] Undo/redo with bounded history
- [x] Dirty tracking and debounced autosave
- [x] Atomic project save with `.bak` recovery file
- [x] Save copies bundled model and artwork into the project
- [x] Recent-project index with thumbnails
- [x] Browser fallback using localStorage
- [x] Open/save/import/export commands in Rust
- [x] Path traversal, symlink escape, and size-limit enforcement
- [~] Project recovery UI for corrupted JSON (load reports an error; no guided repair)
- [ ] Project archive import/export (single-file `.wrapforge` bundle)

## Milestone 2 — Vehicle asset system

- [x] Manifest schema with panels, UV bounds, dimensions, area, license
- [x] Procedural CC0 sample vehicle generator in Blender
- [x] glTF export with panel extras and planar outer-face UVs
- [x] Hero and thumbnail previews
- [x] Asset validation (checks, score, warnings) in TypeScript and Python
- [x] Vehicle setup UI: asset facts, panels, paint, dimensions, license
- [x] Bundled asset resolution in development and packaged builds
- [~] Import of external vehicle assets (Rust command and manifest validation exist; no full import UI)
- [ ] Multi-vehicle library with duplicate detection
- [ ] Real measured vehicle dimensions and installer reference data

## Milestone 3 — 3D viewport

- [x] glTF loading with per-panel material cloning
- [x] Orbit, pan, zoom, frame-all
- [x] Panel raycast selection and hover highlight
- [x] Panel isolation and wrap-panel edge overlay
- [x] Paint color and per-panel artwork textures
- [x] Camera presets with tweened transitions
- [x] PBR environment lighting and shadows
- [x] Viewport PNG capture for thumbnails
- [x] Renderer/scene disposal and load cancellation
- [~] Large-scene performance profiling (no benchmark suite yet)
- [ ] Measurement overlay and section views

## Milestone 4 — Artwork and placement

- [x] SVG import with sanitization and dimension parsing
- [x] Raster import (PNG/JPEG/WebP)
- [x] Live text artwork with font, size, weight, alignment, color
- [x] Sample artwork library (CC0)
- [x] Placement transform in UV space (position, width, rotation, opacity)
- [x] Visibility/lock, duplicate, delete, reorder
- [x] Artwork inspector and placement list
- [x] Source-preserving project storage
- [~] Text metrics and wrapping are approximate across font fallbacks
- [ ] Explicit "convert text to outlines" workflow
- [ ] Node-level vector editing of imported SVG
- [ ] Clipping/masking of artwork to arbitrary shapes

## Milestone 5 — Projection

- [x] Panel UV placement (the implemented projection method)
- [x] Per-panel texture composition shared by viewport, print, and Blender
- [x] Projection status shown honestly as UV-based
- [ ] Planar projection from a reference plane
- [ ] Camera projection from an arbitrary view
- [ ] Surface-conforming / shrink-wrap projection
- [ ] Projection preview and distortion visualization

## Milestone 6 — Print preparation

- [x] Unit conversion (mm, cm, in) and scale
- [x] Bleed and safe-margin geometry
- [x] DPI-to-pixel calculation and memory estimate
- [x] Validation: missing artwork, clipping, safe margin, raster limits, live text, CMYK request
- [x] Print-ready vs draft labelling tied to validation
- [x] Required acknowledgment for warnings
- [x] PNG panel export with guides, crop marks, registration marks
- [x] Vector SVG panel export
- [x] JSON production manifest
- [x] Independent Python print implementation with shared test expectations
- [~] Very large panel rasterization is bounded and may downsample
- [ ] CMYK conversion with ICC profiles and rendering intents
- [ ] Spot colour channels
- [ ] Geometric unfolding of curved panels
- [ ] Tiling and panel overlap planning for oversized prints

## Milestone 7 — Rendering

- [x] Blender discovery: configured path, env var, PATH, known locations, Flatpak
- [x] Version parsing and compatibility classification
- [x] Engine probe with `--factory-startup`
- [x] Managed render subprocess with argv arrays
- [x] Per-panel texture staging
- [x] Studio lighting, floor, camera presets
- [x] Eevee render verified at 1200×760
- [x] Cycles fallback with CPU device
- [x] Progress events, log file, metadata JSON
- [x] Cancellation (SIGTERM / taskkill)
- [x] Flatpak path guard with actionable error
- [x] Render studio UI: settings, progress, result, metadata, open folder
- [~] GPU rendering unverified (explicitly not claimed)
- [~] Render queue is session-only; no persistence across restarts
- [ ] Batch renders across camera presets
- [ ] Transparent background and shadow-catcher options
- [ ] Denoising configuration for Cycles

## Milestone 8 — Export and library

- [x] Export center with artwork, panel, render, and project actions
- [x] Export history for the session
- [x] Native save dialogs and download fallback
- [x] Asset library for sample artwork and vehicle
- [x] License and attribution display
- [~] Library is read-only; no user pack installation
- [ ] Export presets and repeat-last-export
- [ ] PDF/X and TIFF output
- [ ] Installer-facing cut/overlap diagrams

## Milestone 9 — Quality, docs, release

- [x] Frontend unit tests (53)
- [x] Backend tests (52, including 2 Blender-marked)
- [x] Rust unit tests (11)
- [x] Browser end-to-end workflow (1)
- [x] Typecheck, lint, production frontend build
- [x] Debug desktop build and real launch verification
- [x] README, architecture, decisions, limitations, threat model
- [x] User, developer, asset, print, format, testing, release, privacy docs
- [x] Issue templates, PR template, CI workflows
- [~] Desktop IPC verified manually with `tauri-driver` + WebKitWebDriver (create → save → reopen, 3D model load, Blender render); committed CI harness still missing
- [~] Accessibility audit (keyboard paths and reduced motion exist; no external audit)
- [~] German translation completeness (shell/navigation/common actions only)
- [ ] Release installers for Linux/Windows/macOS
- [ ] Code signing, notarization, checksums
- [ ] Published release with reproducible build notes
- [ ] External security review

## Milestone 10 — generic vehicles and texture livery

- [x] Import any self-contained glTF vehicle from the UI
- [x] Normalise units, orientation, ground plane, and front direction with
      reported confidence
- [x] Geometric panel detection (bonnet, roof, boot, bumpers, fenders, doors,
      quarters) with per-panel confidence
- [x] Panel overlays and picking from triangle runs on single-mesh models
- [x] Brush and eraser painting directly on the body texture, stored as vectors
- [x] Layer stack with blend modes, opacity, blend, and text layers
- [x] Projected decal layers rasterised through model UVs
- [x] Body finish: original, tint through luminance, or solid
- [x] Three original livery presets
- [x] Atlas export as PNG up to 4096 px
- [x] Blender renders accept the composed livery atlas
- [x] Transparency: alpha strokes, transparent PNG, transparent render background
- [x] WebGL failure handling and studio spacing pass
- [x] Rename, merge, and remove detected panels (undo-safe)
- [ ] Split a detected panel into two regions
- [ ] Draco/KTX2-compressed model import
- [ ] Camera and shrink-wrap projection
- [ ] Symmetry-mirrored brush strokes
