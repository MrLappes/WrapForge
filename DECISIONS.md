# Architecture decisions

Format: decision, context, consequences. Decisions marked **(alpha)** are
reversible and expected to change.

## ADR-001: Tauri 2 instead of Electron

**Decision.** Use Tauri 2 with a Rust shell and the system WebView.

**Context.** The application is local-first, needs controlled filesystem access,
must spawn Blender, and should stay small. Electron would bundle Chromium and
Node, roughly tripling installer size and memory. Tauri was installable in the
target environment (WebKitGTK 4.1, Rust) without downloading a browser runtime.

**Consequences.** Linux depends on WebKitGTK behavior, which differs from
Chromium (media, CSS, DevTools). Rust adds build time. Tauri's IPC and
capability model require explicit command registration. The browser preview
exists partly to keep frontend work testable without the shell.

## ADR-002: React + TypeScript + Vite

**Decision.** React 19, TypeScript in strict mode, Vite 8.

**Context.** The UI is form- and canvas-heavy with many independent panels. A
typed component model and the three.js ecosystem matter more than minimal
runtime size. Vite provides fast HMR and a straightforward production build.

**Consequences.** A large JS bundle (~1 MB gzipped including three.js) must be
watched. React Compiler lint rules are enabled and one rule is intentionally
disabled for asynchronous initialization effects.

## ADR-003: Zustand for application state

**Decision.** Use small Zustand stores rather than Redux or React context for
the document.

**Context.** The document is a single deep object with explicit actions and an
undo stack. Redux adds ceremony without benefit; context re-renders broadly.

**Consequences.** Store actions are the only supported mutation path. History
is snapshot-based and bounded at 80 entries; very large documents will pay for
that (currently acceptable for JSON documents of a few MB).

## ADR-004: Versioned JSON document validated with Zod

**Decision.** Persist a JSON document with `schemaVersion`, validate it at every
boundary with Zod, and migrate explicitly.

**Context.** The document must be inspectable, diffable, and portable. A binary
database would complicate recovery and external tooling. Zod gives runtime and
compile-time types from one definition.

**Consequences.** Large rasters are stored as asset files referenced by the
document, never inlined. Schema changes require a migration and a fixture.
Unknown fields are preserved where safe, but a newer `schemaVersion` is
rejected rather than guessed at.

## ADR-005: Blender as an external rendering engine

**Decision.** Use Blender headless via a managed subprocess. Do not embed
Blender, link against it, or ship it.

**Context.** Blender provides glTF import, PBR rendering, and a Python API at
zero licensing cost for the host application. Reimplementing a renderer or
shipping Blender would be disproportionate. Blender is GPL-3.0; invoking it as
a separate process keeps WrapForge's Apache-2.0 licensing clean.

**Consequences.** Rendering requires a Blender installation. Process lifecycle,
path visibility, version compatibility, and cancellation are our problem. The
render script is a versioned contract with its own tests. Blender's Flatpak
sandbox restricts readable paths.

## ADR-006: Support Blender 4.2+ and probe rather than assume

**Decision.** Parse `blender --version`, classify compatibility, and probe the
running engine enum with a small script.

**Context.** Blender 5.2 renamed the Eevee engine identifier from
`BLENDER_EEVEE_NEXT` to `BLENDER_EEVEE`. Hard-coding an engine name breaks
silently after an upgrade.

**Consequences.** The render script chooses Eevee when available and falls back
to Cycles, and records the actual engine/device in metadata. The UI shows the
detected version and compatibility, and warns for untested versions instead of
pretending support.

## ADR-007: CPU rendering is the verified default; no GPU claims

**Decision.** Cycle renders are configured for CPU. Eevee device is reported as
`null` (not "GPU").

**Context.** GPU rendering depends on drivers, headless EGL, and Blender build
options. In the verified environment, GPU rendering was not exercised. Claiming
GPU acceleration without evidence would be false.

**Consequences.** Renders are slower. Metadata and docs state CPU-only
verification. GPU support is a roadmap item requiring per-platform testing.

## ADR-008: three.js for the interactive viewport, Blender for final output

**Decision.** The editable viewport uses three.js; Blender is used only for
final renders.

**Context.** Interactive Blender embedding is heavyweight and fragile. A WebGL
viewport gives immediate feedback, picking, and texture updates.

**Consequences.** Two renderers can disagree. The viewport is an approximation
(environment lighting, no Cycles path tracing). Users are told that the final
render comes from Blender. Panel textures are generated once and shared.

## ADR-009: Preserve SVG and live text; never silently outline

**Decision.** Imported SVG remains vector source. Text artwork remains live text
with an explicit "not outlined" warning. There is no automatic conversion.

**Context.** Outlining is a destructive production step. Doing it silently
removes editability; doing it automatically at export changes geometry and font
metrics without consent.

**Consequences.** Print validation warns when live text is present. A future
explicit "convert to outlines" action must be user-initiated and tested against
font availability.

## ADR-010: Canvas-composited panel textures

**Decision.** Compose paint, artwork, and transforms into one canvas per panel,
then use it as a three.js texture and as the Blender texture.

**Context.** Per-object shader graphs for arbitrary placement would be more
faithful but far more complex, and would diverge from the print rasterizer.

**Consequences.** Resolution is bounded (2048 px for the viewport, configurable
for print). Very large panels lose detail unless export resolution is raised.
The composition code is shared with print rasterization, which keeps preview and
output consistent.

## ADR-011: Planar outer-face UV convention in asset metadata

**Decision.** Wrap panels carry explicit UV bounds in the manifest, and glTF
meshes carry `panelId`, `wrapable`, and UV dimension extras. Panels are planar
outer faces.

**Context.** A stable convention makes placement predictable and lets the
application compute physical size without a full unwrap.

**Consequences.** Curved or compound panels cannot be represented faithfully
yet. Imported vehicles must follow the convention. Validation warns when UV
metadata is missing or inconsistent.

## ADR-012: Original procedural sample vehicle (CC0)

**Decision.** Generate the sample vehicle with a scripted Blender build and
release it CC0.

**Context.** Manufacturer CAD and configurator data carry licensing and
trademark constraints. Downloading a random model would create redistribution
risk.

**Consequences.** The sample is a stylized hatchback, not a real car. Its
dimensions are plausible but unverified. Users must supply properly licensed
vehicle assets for real work. The generator is checked in for reproducibility.

## ADR-013: Project folder, not a single archive

**Decision.** A project is a directory with `project.json`, assets, renders, and
a thumbnail.

**Context.** External assets must remain readable by Blender and by users.
Inlining megabytes of raster data into JSON would make saves slow and recovery
hard.

**Consequences.** Moving a project requires copying the folder. Paths inside the
document are project-relative. The shell enforces that writes stay under
`assets/`.

## ADR-014: Apache-2.0

**Decision.** License the application under Apache-2.0.

**Context.** It grants patent rights, is compatible with the Rust and JavaScript
ecosystems, and is familiar to commercial users. Blender stays external and
GPL-3.0; no GPL code is linked.

**Consequences.** Contributions require the inbound terms in CONTRIBUTING.md. A
`NOTICE` and third-party notices file are maintained. Asset licenses are
recorded separately (sample assets are CC0).

## ADR-015: Offline-first, no telemetry

**Decision.** No account, analytics, crash upload, or network calls at runtime.

**Context.** Design work is confidential, and the tool must function on a shop
floor without connectivity.

**Consequences.** No remote crash reports; diagnostics are user-exported
bundles. Update checks, if added, must be explicit and opt-in.

## ADR-016: English and German from the start **(alpha)**

**Decision.** Ship an i18n layer with English and German dictionaries; German is
a first-class target.

**Context.** The primary market includes German-speaking wrap shops.

**Consequences.** Shell, navigation, and common actions are translated. Feature
copy is not fully translated yet; missing keys fall back to English. Layout must
tolerate longer German strings.

## ADR-017: RGB-only print output with explicit draft labelling

**Decision.** Do not fake CMYK. Produce RGB output and label anything with
errors or warnings as a draft.

**Context.** True print production needs ICC profiles, rendering intents, spot
colors, and printer-specific constraints. Converting RGB to CMYK without a
profile produces misleading separations.

**Consequences.** Output may not be directly acceptable to every RIP. The
manifest and filename state the actual status. CMYK is a roadmap item, not a
checkbox that lies.

## ADR-018: No geometric unfolding in the alpha

**Decision.** Treat panels as planar UV domains. Do not claim to flatten curved
surfaces.

**Context.** Unfolding compound curvature correctly requires mesh parameterization,
seam selection, and distortion analysis. A naive planar projection would produce
patterns that do not fit.

**Consequences.** Only panels authored as planar outer faces are printable.
Curved surfaces need future work. The limitation is documented in the UI and in
KNOWN_LIMITATIONS.md.

## ADR-019: Rust owns I/O and processes; Python is a validation library and CLI

**Decision.** Keep filesystem access, atomic writes, and subprocess control in
Rust. Keep independent, testable domain logic (print math, manifest validation,
Blender discovery) in Python.

**Context.** Tauri commands already run in Rust; adding a Python sidecar would
add packaging and lifecycle complexity. Python is still valuable for batch
automation and for cross-checking the TypeScript print math.

**Consequences.** Some domain rules exist in two languages. Tests pin them to the
same expectations. The desktop path does not require Python at runtime.

## ADR-020: No plugin execution in the alpha

**Decision.** Do not load third-party code or Lua/JS plugins.

**Context.** A plugin API is a security boundary and a compatibility promise.
The document format and asset conventions are not stable enough to expose.

**Consequences.** Extensibility is limited to assets, project files, and the CLI.
A plugin system requires a sandbox design and versioned API first.

## ADR-021: Strict CSP and SVG sanitization

**Decision.** Deny remote script/frame execution in the WebView, sanitize SVG on
import, and never build shell command strings.

**Context.** Project files and artwork are untrusted input that may be shared
between users.

**Consequences.** Some legitimate SVGs using external references or embedded
HTML are rejected or stripped. Diagnostics explain why. Blender receives argv
arrays only.

## ADR-022: CI separates passed, failed, and skipped

**Decision.** CI runs frontend, backend, Rust, and build jobs independently; a
missing Blender produces an explicit skip, not a green test.

**Context.** "All tests pass" is meaningless if Blender tests silently skip.

**Consequences.** At least one CI job installs Blender and runs the integration
marker. The release checklist records which jobs ran where.

## ADR-023: No auto-updater yet

**Decision.** Ship without an update mechanism.

**Context.** An updater needs signed manifests, key management, rollback, and a
release channel. None of that exists yet.

**Consequences.** Users update manually. The threat model lists the updater as
future work with its requirements.

## ADR-024: Custom CSS design system

**Decision.** Use hand-written CSS with tokens instead of a component framework.

**Context.** The application has a specific, dense desktop layout. Utility
frameworks would add configuration and bundle weight for little gain, and the
visual language (dark-first studio UI) is easier to control directly.

**Consequences.** More CSS to maintain; no ready-made accessibility primitives
from a library. UI primitives (`Button`, `Field`, `Panel`, dialogs) are shared
and tested at the app level.

## ADR-025: Paint the body texture instead of placing per-panel artwork

**Decision.** Keep panel UV placement for the bundled asset, and add a texture
livery model for imported models. The livery is a stack of layers plus vector
brush strokes, composed into the model's own texture atlas.

**Context.** The request was Forza-Horizon-style editing: change the car's paint
and graphics directly, not per-panel posters. Real livery editors work on the
texture, because that is what exports to a game engine, a renderer, or a print
shop. Per-panel placement cannot express a stripe that crosses a door and a
fender.

**Consequences.** The composed atlas is derived, so a project stores layers and
strokes and rebuilds the texture on load. Atlas-space layers can smear across UV
seams, which is why projected layers exist. Print output still comes from panel
dimensions, not from the atlas.

## ADR-026: Rasterise projected layers through the model UVs

**Decision.** A layer marked `side-left`, `side-right`, `top`, `front`, or `rear`
is rendered into a 1024² design canvas and then baked into the atlas by walking
every triangle: each atlas pixel is mapped back to a 3D point, projected onto the
design plane, and sampled. Back-facing triangles are skipped.

**Context.** Drawing a stripe in atlas space follows UV islands, not the car.
Projecting through UVs makes the stripe follow body panels and stay straight.

**Consequences.** Baking costs tens of milliseconds per projection and must be
debounced. The design plane is a bounding-box projection, so extreme curvature
still stretches; a proper unwrap would need per-panel parameterisation.

## ADR-027: Heuristic panel detection with reported confidence

**Decision.** Classify triangles by position and facing direction. Do not attempt
mesh segmentation into semantic parts, and do not ask the user to tag every
panel.

**Context.** Models arrive as one mesh, many meshes, scans, or SketchUp exports.
The user asked for auto-detection with only minor corrections. A geometric
classifier works across formats and is deterministic, testable, and instant.

**Consequences.** Detection is approximate and reports confidence. Shut lines are
invisible to it. The manual merge/split editor is future work; until then the
user can re-export the model with sensible part names.

## ADR-028: Normalise imported models instead of trusting their units

**Decision.** Rotate, scale, and ground every imported model to metres with
forward +X, up +Y, and left +Z, inferring units and front direction from the
bounding box and deck profile.

**Context.** Imported models use centimetres, inches, Z-up, arbitrary origins,
and unknown facing. Camera presets, lighting, fog, and panel maths all assume a
real-world scale and orientation.

**Consequences.** The import is a guess and says so. A model exported in metres,
Y-up, facing +X needs no correction.

## ADR-029: Wrap masking instead of material splitting

**Context.** Imported cars are often one mesh with one baked texture: the
windows are pixels in that texture, not separate materials. Painting the texture
therefore paints the glass, which looked like a mistake.

**Decision.** Detect glass geometrically (rake angle, cabin height band, inset
width against the local body profile), store it as a `window` panel, and rasterise
the panel map into a UV-space mask. The composer draws the model's original pixels
back over the masked area, so windows stay clear by default and
`livery.wrapGlass` turns the behaviour off. The mask is rebuilt from the panel map
rather than stored, so it always follows panel corrections and costs no project
size.

**Consequences.** Glass detection is a heuristic and can miss an unusually raked
screen; the panel tools are the escape hatch. Models with separate glass
materials never needed the mask, and the mask builder returns `null` for them.

## ADR-030: PSD as the layer exchange format

**Context.** Users want to paint foil layers in Photoshop rather than in a
canvas-based editor.

**Decision.** Export a layered PSD with one layer per foil layer, embedding the
layer id, kind, mapping and blend mode in the layer name. Import matches by id,
updates layers in place and adds unknown layers. Projected layers keep their
mapping, so re-imported pixels still follow the model UVs. A PNG folder with a
`layers.json` manifest is the fallback for editors without PSD support.

**Consequences.** The round-trip is a pixel round-trip: a vector stripe returns as
a raster image layer. The project file stays small because imported rasters are
stored as artwork assets on disk, not inline in JSON.

## ADR-031: MCP server works on project files

**Context.** An AI client should be able to drive the tool, but rendering and
texture composition need a canvas.

**Decision.** Ship a stdio MCP server that reads and writes `project.json`
directly and reuses the app's Zod schema and pure panel/livery helpers. It covers
project, panel, livery and manifest operations and deliberately excludes render
and PSD export.

**Consequences.** The server is deterministic and testable without a display, and
changes land on disk where the studio sees them. Features that need WebGL stay in
the app, which keeps one implementation of each algorithm.
