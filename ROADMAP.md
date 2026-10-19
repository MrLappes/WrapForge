# Roadmap

This is a direction, not a promise. Priorities can change when real users report
what blocks them. Items are only marked done when they are implemented and
verified.

## Guiding principles

1. Do not fake production readiness. A draft label is better than a false
   promise.
2. Prefer a correct, boring pipeline over a broad, shallow feature list.
3. Every new format or engine needs a test that exercises a real file.
4. Keep the application offline-first and local-first.

## Next: alpha hardening

- **Desktop UI automation.** Add a `tauri-driver` + WebKitWebDriver test for
  create → save → reopen and a real render job.
- **Project recovery.** Guided repair for corrupt JSON, migration preview, and
  recovery from `.bak`.
- **Text outlining.** Explicit, user-initiated conversion with font-availability
  checks and a diff preview.
- **Render queue.** Persist jobs, allow multiple camera presets, and resume after
  a restart.
- **Concurrency limits.** Enforce a single active render in Rust, not only in the
  UI.
- **Accessibility pass.** Focus order through the 3D viewport, keyboard placement
  editing, and a screen-reader review.
- **German completeness.** Translate every feature view and error message.
- **Stress tests.** Large projects, many placements, high-resolution artwork.

## Mid-term: production credibility

- **Colour management.** CMYK conversion with ICC profiles, rendering intents,
  soft proofing, and ink-limit checks. Requires a real printer profile and a
  preflight comparison.
- **PDF/X and TIFF export.** With embedded output intent and vector text
  handling.
- **Geometric unfolding.** Mesh parameterization with seam selection and
  distortion heatmaps for curved panels.
- **Planar and camera projection.** Interactive projection gizmos and a
  distortion/fit preview.
- **Tiling.** Split oversized panels with overlap and registration marks.
- **Vehicle import.** Guided glTF/GLB import, UV validation, panel mapping, and a
  measurement editor.
- **Asset packs.** Signed, versioned packs with license metadata and duplicate
  detection.
- **Signed releases.** Linux, Windows, and macOS installers, checksums, and
  reproducible build notes.

## Later: ecosystem

- Plugin API with a sandbox and a versioned contract.
- Shared asset library with provenance and takedown process.
- Installer-facing cut diagrams and overlap instructions.
- Batch/CLI rendering for shops.
- Optional, explicit update checks.
- Additional languages beyond English and German.

## Explicit non-goals

- A cloud account or mandatory sync.
- A full vector illustration suite.
- Manufacturer CAD redistribution without a license.
- Telemetry or silent network calls.
- Claiming print-readiness without validation.
- GPU rendering claims without per-platform verification.

## How to influence this

Open an issue describing the workflow that fails, the output a printer rejects,
or the vehicle asset you cannot use. Concrete failures outrank feature votes.
