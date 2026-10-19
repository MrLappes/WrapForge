# Known limitations

This file lists what WrapForge does not do, what is approximate, and what has
not been verified. It is intentionally blunt. An alpha release that hides its
limits is worse than no release.

## Vehicle data

- **The bundled vehicle is not a real car.** It is original, stylized,
  procedurally generated geometry released CC0. Proportions are plausible, not
  measured. Do not use its dimensions for a real installation.
- **No manufacturer CAD or configurator data is included** for licensing and
  trademark reasons. Users must supply their own licensed assets.
- **The asset format assumes planar outer-face panels.** Compound-curved panels
  cannot be represented faithfully.
- **Imported models are normalised by guesswork.** Scale comes from matching the
  model length against common units; orientation comes from the bounding-box
  proportions; the front is inferred from deck profile lengths. A model exported
  in metres, Y-up, facing +X imports predictably. Others need correction in a 3D
  tool before import.
- **Panel detection is geometric and heuristic.** Triangles are bucketed by
  position and facing direction, with 60–70% of body triangles landing in a named
  panel on typical scans. There are no shut lines and no manufacturer part data.
  A wrong region can be renamed, merged into a neighbour, or removed in the
  studio's **Panels** tab; splitting one region into two is not supported yet.
  Confidence per panel is reported.
- **Glass detection is geometric.** A single-mesh model with a baked texture has
  no separable glass, so windows are inferred from rake, height and inset width,
  then masked in UV space. Unusual greenhouses (very raked screens, split rear
  glass) can be missed; rename or remove the panel, or turn on "Wrap over glass".
- **The PSD round-trip is pixels, not vectors.** Shapes come back as raster image
  layers. Keep the project if you want to keep editing the vector shapes.
- **The MCP server has no renderer.** Rendering and PSD export need a canvas, so
  those stay in the app.
- **Meshes without UVs cannot be painted.** They are excluded from the paintable
  body when other meshes in the same model do have UVs.
- **No measurement verification.** Panel dimensions come from manifest metadata
  and are trusted. WrapForge does not compare them to a scan or a physical
  vehicle.

## Texture livery

- **Atlas layers can smear across UV seams.** A shape drawn in texture space
  follows the atlas, not the body. Use a projected layer for anything that must
  stay straight on the car.
- **Projected layers rasterise at 1024 × 1024** across the vehicle bounding box
  (roughly 4 mm per pixel on a 4.3 m car). Sub-millimetre details need the brush,
  which paints at the atlas resolution.
- **Projected layers are composited per projection.** Layers sharing a projection
  blend together first, then composite onto the body, so `multiply` against the
  paint underneath is not available for projected layers.
- **No undo granularity inside a stroke.** One stroke equals one undo step.
- **No symmetry mirroring for the brush.** Brush strokes are painted where you
  drag; only projected layers mirror between sides.
- **The livery atlas is not a print layout.** It is a texture for rendering and
  game engines. Installation output comes from Print Layout and the panel
  dimensions.

## Projection

- **Panel placement uses UV rectangles.** Artwork is positioned in each panel's
  UV rectangle. Camera projection and surface-conforming projection are not
  available.
- **No distortion analysis.** The application does not compute stretch, shear, or
  fit error for a projected design.
- **No geometric unfolding.** Curved panels are not flattened into cut patterns.
  Output assumes the panel is planar or that the installer compensates.
- **Rotation and scale occur in UV space**, so physical aspect ratio depends on
  correct UV metadata. Inconsistent UVs produce distorted artwork.

## Print and colour

- **RGB only.** There is no CMYK conversion, ICC profile handling, rendering
  intent, ink-limit check, or soft proofing. Requesting CMYK in the UI produces a
  warning and a draft label.
- **No spot colours, varnish, or white-ink channels.**
- **No PDF/X, TIFF, or native RIP formats.** Output is PNG, SVG, and JSON.
- **No tiling or overlap planning** for prints larger than the media.
- **Guides are advisory.** Crop marks, registration marks, bleed, and safe-area
  overlays are drawn, but WrapForge cannot guarantee a specific printer's
  imposition or cutter alignment.
- **`print-ready` is a local rule result, not a certification.** It means no
  errors and no warnings under the configured rules. It does not mean a print
  provider will accept the file.
- **Raster resolution is bounded.** Very large panels at high DPI may be capped;
  the UI reports the resulting effective DPI.
- **No colour-accurate preview.** Viewport and rendered colors depend on the
  display, the WebView, and Blender's view transform.

## Text and fonts

- **Live text is not outlined automatically.** Exports preserve text and warn.
  If the receiving system lacks the font, text may reflow or substitute.
- **No explicit "convert to outlines" action yet.**
- **Font metrics vary by fallback.** The UI uses bundled Inter and Space Grotesk
  for its own chrome; artwork text relies on system fonts and approximation.
- **No font embedding or licensing checks.**
- **No advanced typography**: no OpenType feature control, variable-font axes,
  text on a path, or automatic hyphenation.

## Rendering

- **Blender is required for final renders.** Without it, the 3D viewport still
  works, but offline rendering and capability diagnostics are unavailable.
- **CPU rendering only in verified environments.** Cycles is configured with
  `device = "CPU"`. Eevee's device is reported as unknown, not GPU. GPU rendering
  was not exercised and is not claimed.
- **Eevee and Cycles produce different images.** Engine choice changes lighting
  and material response.
- **The three.js viewport is an approximation.** It uses environment lighting and
  raster panel textures, not Blender's shader graph.
- **Flatpak sandbox limits paths.** A Flatpak Blender can only read files under
  visible directories. Projects outside the home directory fail with a clear
  error. Use a non-Flatpak Blender or keep projects under `$HOME`.
- **No persistent render queue or batch rendering.**
- **No denoiser configuration, light groups, or render passes.**
- **No transparent-background or shadow-catcher UI.**
- **Render cancellation is best-effort.** The process is terminated; partial
  output may remain and is reported.
- **Blender versions newer than the tested 5.2 LTS are untested.** The engine is
  probed rather than assumed, and unknown versions produce a compatibility
  warning.

## Platform and packaging

- **Only Linux was built and launched.** No Windows or macOS build has been
  verified.
- **No signed installers, notarization, or checksums.**
- **No auto-updater.**
- **WebKitGTK differences.** Rendering, CSS support, and file dialogs differ from
  Chromium. The browser preview is not pixel-identical to the desktop shell.
- **No portable/AppImage verification.** Only the debug binary was run.
- **No crash reporting.** Diagnostics are exported manually.

## Project files and storage

- **A project is a folder, not a single file.** Moving it requires copying the
  whole directory.
- **Asset writes are restricted to `assets/`.** This is deliberate, but it means
  projects cannot reference arbitrary external paths portably.
- **No cloud sync, collaboration, or merge.**
- **Atomic writes protect against torn files, not disk failure.** A `.bak` file
  is kept, but there is no transactional multi-file commit.
- **No guided repair for corrupted projects.** Errors identify the failing field;
  recovery is manual.
- **Undo history is in memory only** and is lost on close.
- **Autosave can lag by a few seconds.** It is debounced and cancels if the
  document changes during a write.
- **Absolute paths are rejected.** Projects must live at an absolute path chosen
  through the native dialog or a valid configured path.

## Performance

- **Panel textures are capped at 2048 px in the viewport.** Fine detail appears
  only in print export or final render.
- **Large SVG/raster assets increase memory use.** Raster limits are validated at
  print time, not continuously.
- **Undo snapshots grow with document size.** The stack is bounded at 80 entries;
  no structural sharing.
- **No benchmark suite.** Performance claims are not made.

## Accessibility and internationalization

- **No external accessibility audit or screen-reader certification.**
- Keyboard navigation, visible focus, reduced-motion support, and labelled
  controls exist, but canvas-based 3D interaction is inherently limited for
  assistive technology.
- **German is incomplete.** Shell, navigation, and common actions are translated;
  feature copy falls back to English.
- **No right-to-left layout support.**
- **Colour is not the only signal in validation**, but some 3D selections rely on
  outline colour and may be hard to perceive.

## Security and privacy

- **SVG sanitization is allowlist-based and intentionally conservative.** Some
  legitimate SVGs with external references or embedded HTML are stripped.
- **Blender scripts are trusted local resources.** A compromised installation or
  a replaced script is outside the threat model's protection.
- **No sandbox around Blender.** It runs with the user's privileges and can read
  files the user can read. The path guard limits what WrapForge passes, not what
  Blender could access if its script were malicious.
- **No plugin sandbox** because plugins are not supported.
- **Diagnostics redact common home-directory patterns**, but users should review
  a bundle before sharing it.
- **No encrypted project storage.**

## Testing gaps

- **No automated desktop UI test.** The Tauri shell launch, Rust unit tests,
  browser E2E, and Blender integration are verified separately; the full IPC path
  through the desktop UI is not.
- **No visual regression tests.**
- **No fuzzing** of project JSON, SVG, or glTF import.
- **Blender tests skip when Blender is absent.** CI reports skips separately, but
  a local "all green" run may not have exercised rendering.
- **No Windows/macOS CI.**
- **No load or soak testing.**
