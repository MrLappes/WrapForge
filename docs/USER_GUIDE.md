# User guide

This guide describes the alpha application as implemented. Where a feature is
limited, it says so. For the full list, see
[KNOWN_LIMITATIONS.md](../KNOWN_LIMITATIONS.md).

## 1. Install and launch

Development launch:

```bash
npm install
npm run tauri dev
```

Built application (Linux):

```bash
npm run tauri build -- --debug --no-bundle
./src-tauri/target/debug/wrapforge
```

Blender is optional for design work. Install Blender 4.2+ (5.2 LTS is tested)
and make it available as `blender`, in a common install location, or as the
Flatpak `org.blender.Blender`. Configure an explicit path in **Preferences** or
**Diagnostics** if detection fails.

## 2. Concepts

- **Project** — a folder containing `project.json`, the vehicle model, artwork,
  renders, and a thumbnail.
- **Vehicle asset** — a glTF model plus a manifest describing panels, physical
  dimensions, UV bounds, and licensing.
- **Panel** — a wrap-able surface with a stable ID. Non-wrap parts (glass,
  lights, tyres) cannot receive artwork.
- **Artwork** — an imported SVG, raster image, or live text object. The source is
  preserved.
- **Placement** — an artwork instance mapped into one panel's UV rectangle, with
  position, width, rotation, opacity, visibility, and lock state.
- **Print plan** — physical output geometry and validation for the selected
  panels.
- **Livery** — the painted texture of an imported model: a base finish, brush
  strokes, atlas layers, and projected decal layers. Exported as one PNG.
- **Projected layer** — a design rasterised through the model's UVs from a side,
  top, front, or rear plane, so it follows body panels instead of smearing.
- **Render** — a Blender image generated from the project.

## 3. Create, open, and save

### Create

1. On **Home**, enter a project name.
2. Select **Create project**.
3. WrapForge loads the bundled CC0 sample hatchback and opens **Vehicle Setup**.

The project has no file location until the first save.

### Save

- **Ctrl+S** or **File → Save**.
- On the desktop, the first save asks for a parent folder. WrapForge creates
  `<project name>.wrapforge/` inside it.
- Subsequent saves reuse the project root.
- **Ctrl+Shift+S** or **File → Save as** creates a new project folder.
- Saving writes `project.json` atomically and keeps `project.json.bak`.
- If a viewport is active, its current image is saved as `thumbnail.png`.

Autosave starts after the first save and runs a few seconds after changes. It
does not overwrite newer edits made during the save.

### Open

- **Ctrl+O** or **File → Open** selects a project folder.
- **Home → Recent projects** reopens a recent project.
- The browser preview cannot open native folders; use the recent list.

If a project was written by a newer schema, WrapForge refuses to open it rather
than damaging it. If migration is needed, it runs automatically and reports what
changed.

## 4. Vehicle Setup

- **Vehicle asset** shows the model name, source, license, panel count, and
  validation score.
- **Base paint** changes the body colour used behind artwork.
- **Dimensions** shows physical width/height/length and panel area from the
  manifest.
- **Panels** lists wrap-able and non-wrap surfaces with category, side, size,
  area, and UV bounds.
- **Asset validation** lists checks and warnings from the manifest.

The bundled vehicle is stylized, not a measured production car. Do not use its
dimensions for a real installation without verifying them. Imported models are
scaled from a unit guess; confirm the length against the real vehicle with a
tape measure before printing a wrap.

**Import 3D model** replaces the current vehicle. Existing panel placements are
removed because their panel IDs belong to the old model; imported artwork and
brushwork stay in the project.

## 5. Import your own 3D car model

Any glTF you own can be used instead of the bundled hatchback.

1. Open **Vehicle Setup** and select **Import 3D model** (also available from the
   studio's *Livery* tab and the *Panels* tab).
2. Choose a `.glb` file. Self-contained `.glb` files work best; `.gltf` files
   that reference external `.bin` or texture files cannot be resolved from a
   single-file import.
3. WrapForge parses the model, normalises it to metres with the ground at zero,
   and guesses the panels.

What happens during import:

- **Orientation** — the longest axis becomes the car's length, the shortest the
  up axis. WrapForge then rotates the model so forward is +X, up is +Y and the
  car's left side is +Z. This matches the camera presets.
- **Scale** — the length is matched against common units (metres, centimetres,
  millimetres, inches, feet, decimetres) and scaled to a plausible car length.
  A model that is still smaller than 1 m or larger than 15 m after that guess
  (a toy car, or a unit-less export) is rescaled to 4.35 m and the import note
  says so. Check the result in **Vehicle Setup → Dimensions**.
- **Front** — guessed from the length of the low deck surfaces (bonnets are
  usually longer than boots). If it guesses wrong, import a model that is
  already oriented, or fix the orientation in your 3D tool.
- **Panels** — every triangle is classified by its position and facing
  direction: bonnet, roof, boot/hatch, front and rear bumpers, front fenders,
  front/rear doors per side, and rear quarters. Anything else lands in
  **Body (uncategorised)**. Each panel reports a confidence percentage.
- **Base texture** — the model's first base-colour texture is captured as the
  starting surface for the livery. Without one, the livery starts on a flat
  surface.

Panel detection is a heuristic, not a measurement. It reliably finds doors,
bonnets and bumpers on ordinary car models; it cannot know where a manufacturer
put a shut line. The panels drive highlighting, print planning and organisation.
Painting does not depend on them.

### Correcting the detection

Open the studio, select the **Panels** tab, and click a panel (or click it in the
viewport). **Correct this panel** fixes the few regions the guess gets wrong:

- **Name** — retype the label and press Enter. The new name is used everywhere:
  chips, print plans, and exports.
- **Merge into** — pick the panel the selected region really belongs to and press
  **Merge**. The triangles move onto the target, areas are summed, and the source
  panel disappears. A split bumper or a tailgate classified as boot is a merge
  away from correct.
- **Remove** — drops the panel and returns its triangles to the unpainted body.
  Useful when a spoiler or a mirror is picked up as its own region.

Every correction is one undo step (`Ctrl Z`), so you can experiment freely.
Splitting one panel into two is not supported yet: remove the panel, then paint
the region as part of the body.

### Transparency in imported models

Glass, chrome and other parts are detected by material transparency and by mesh
and material names (`glass`, `window`, `tyre`, `rim`, `light`, …). Those parts
keep their original materials and are excluded from the paintable body when the
model provides UV coordinates for the rest. Brush strokes and layers support
alpha, so a foil can fade out or leave areas unpainted.

## 6. Texture livery (paint directly on the car)

For imported models the studio paints the vehicle's **texture** instead of
placing artwork onto panels. This is the Forza-style workflow.

1. Open **3D Design Studio**. The inspector opens on the **Livery** tab.
2. Select **Paint on car** (or press **P**). Orbit is disabled while painting.
3. Drag on the body. Each stroke is stored as vector points, so it survives
   resolution changes and can be undone with **Ctrl+Z**.
4. **Size** (**[** and **]**), **opacity**, **hardness**, colour, and **eraser**
   control the brush.
5. Add **layers** for stripes, rectangles, ellipses, triangles, chevrons, and
   text. Each layer picks a **projection**:
   - `Texture (free)` draws straight into the atlas. Fast, but it can smear
     across UV seams.
   - `Left side`, `Right side`, `Top / bonnet`, `Front`, `Rear` are *projected*:
     the design is rasterised through the model's UVs, so a stripe stays a
     stripe and follows the body panels. The right side is mirrored so lettering
     reads correctly from outside on both flanks.
6. **Presets** apply an original Japanese street-tuning inspired design in one
   click: *Kaido Rising*, *Touge Blossom*, or *Midnight Chrome*. They contain no
   brand marks.
7. **Body finish** recolours the model's baked texture while keeping its
   shading: *Original* keeps the source, *Tint* applies the paint colour through
   the original luminance, *Solid* floods the colour.
8. **Export PNG** writes the composed atlas at up to 4096 × 4096. This is the
   same texture the viewport and Blender use.

Notes:

- A projected layer is rasterised at 1024 × 1024 over the vehicle's bounding
  box; small details need a brush stroke or a larger layer.
- On single-mesh models the glass shares the body material, so paint also lands
  on the glass. Use an eraser stroke or separate glass in your 3D tool.
- Projected layers blend against each other before they are composited onto the
  body, so a layer's blend mode affects the group, not the paint underneath.
- The atlas is not a physical print layout. Use **Print Layout** with the panel
  dimensions for installation output.

## 7. Artwork

Open **Vector Artwork**.

- **Import artwork** (Ctrl+I) accepts SVG, PNG, JPEG, and WebP.
- SVG is sanitized: scripts, event handlers, embedded HTML, and external URLs are
  removed.
- **New text object** creates live text with editable content, font family,
  size, weight, alignment, and colour.
- The sample library contains three CC0 SVGs.

Artwork stays as source. Raster images are not vectorized. Live text is not
outlined; print validation warns about it.

## 8. Place artwork in the 3D studio

1. Open **3D Design Studio**. On an imported model the inspector opens on
   **Livery**; switch to **Panels** and **Artwork** for the panel workflow.
2. Click a wrap panel in the viewport. Glass, lights, and tyres are not
   selectable.
3. Use **Place artwork** and choose an asset.
4. Adjust the placement in the inspector: horizontal/vertical position, width,
   rotation, opacity, visibility, and lock.
5. Use the placement list in the inspector's **Artwork** tab to select, duplicate,
   or delete instances.
6. Select empty space or press **Esc** to clear the panel selection.

Viewport controls: drag to orbit, right-drag or Shift-drag to pan, wheel to zoom.
Camera presets frame the vehicle from useful angles. **Isolate** shows one panel
without the rest of the body.

Arrow keys nudge the selected placement when focus is not in a text field.
**Delete** removes the selected placement.

## 9. Panels and UV layout

**Vehicle Panels** lists every surface.

- Wrap-able panels can receive artwork.
- The UV column shows the panel's UV rectangle. Artwork is positioned inside it.
- **Select panel** jumps to the studio with that panel selected.

If UV bounds are missing or inconsistent, placement will look distorted. The
asset is at fault; fix the manifest or the mesh, not the artwork.

## 10. UV and projection

The **UV & Projection** view edits the selected placement numerically.

Implemented: artwork mapped into each panel's UV rectangle.

Not implemented: planar projection from a reference plane, camera projection, and
surface-conforming projection. The view says so. Do not expect a design to wrap
around compound curves correctly.

## 11. Print Layout

Open **Print Layout**.

### Output settings

- **Unit** — millimetres, centimetres, or inches.
- **Scale** — 1.0 means physical size.
- **Target DPI** — used to compute pixel dimensions and warnings.
- **Bleed** — added around the trim on every side.
- **Safe margin** — inset from the trim.
- **Colour mode** — RGB is the only real mode. Selecting CMYK produces a warning
  because no conversion is implemented.
- **Registration marks** and **Panel labels** — drawn into raster exports.
- **Panels to export** — all wrap-able panels or an explicit selection.

### Validation

Each issue has a severity:

- **Error** — blocks a print-ready label and must be fixed.
- **Warning** — makes the output a draft until explicitly acknowledged.
- **Info** — explains a calculation or assumption.

The status is **PRINT-READY** only when there are zero errors and zero warnings.
Otherwise it is **DRAFT**, and exported files are prefixed `wrapforge-draft-`.

Warnings include: missing artwork, artwork outside the panel, content inside the
safe margin, live text, requested CMYK, insufficient effective DPI, and panels
exceeding raster limits.

### Export

- **Export panel PNG** writes raster panel documents with trim, safe area, crop
  marks, registration marks, and labels.
- **Export manifest JSON** writes the production plan, dimensions, issue list,
  and `productionReady` flag.
- Vector SVG panel export is available from the Export Center.

The print-ready label is a local rule result, not a printer's certification.
Always run the provider's preflight.

## 12. Render Studio

1. Open **Render Studio**.
2. Choose a preset, engine, samples, camera, resolution, transparency, and floor.
3. Select **Render with Blender**.

Rendering saves the project first if needed, rasterizes panel textures, and
starts a managed Blender process. Progress appears in the view; the rest of the
application stays responsive. **Cancel render** terminates the job.

The result shows the image, engine, resolution, duration, Blender version, log
path, and any warnings. Open the render folder to inspect the PNG, metadata JSON,
and log.

Notes:

- Eevee is the default and was verified. Cycles falls back to CPU.
- GPU rendering is not claimed or verified.
- Blender 5.2 uses the `BLENDER_EEVEE` engine identifier; WrapForge probes the
  available engines instead of hard-coding a name.
- A Flatpak Blender can only read paths visible to its sandbox. Projects outside
  your home directory (or `/tmp`) fail with an explanatory error.

**Capture viewport** saves the current three.js view as an image without Blender.

## 13. Export Center

- **Preview image** — current viewport or last render.
- **Print panels** — panel PNGs, vector SVGs, and the manifest.
- **Project package** — a copy of the project document and assets.
- **Export manifest** — production metadata.

Export history is session-only. Files remain on disk after restart.

## 14. Asset Library

Shows the bundled sample vehicle and artwork with license and provenance.

There is no asset-pack installer in this alpha. The button is intentionally not
exposed; adding third-party packs requires a trust and versioning design.

## 15. Preferences and Diagnostics

**Preferences**

- Dark/light theme.
- English/German UI.
- Explicit Blender executable path, with detection status and a test action.
- Reset of theme, language, and Blender path to defaults.

**Diagnostics**

- Application, platform, and WebView facts.
- Blender detection result, version, path, and compatibility.
- **Test Blender** runs a small `--factory-startup` probe.
- **Export diagnostics** writes a redacted JSON/text bundle.
- Recent log entries.

Diagnostics may still contain project paths and names. Review a bundle before
sharing it.

## 16. Keyboard shortcuts

| Action | Shortcut |
|---|---|
| New project | Ctrl+N |
| Open project | Ctrl+O |
| Save | Ctrl+S |
| Save as | Ctrl+Shift+S |
| Import artwork | Ctrl+I |
| Undo | Ctrl+Z |
| Redo | Ctrl+Shift+Z |
| Command palette | Ctrl+K |
| Close dialog/palette | Esc |
| Delete selected placement | Delete |
| Nudge selected placement | Arrow keys |
| Toggle paint mode | P |
| Brush size down / up | [ / ] |
| Show shortcut help | ? |

Shortcuts are fixed in this alpha.

## 17. Browser preview differences

`npm run dev` runs the React app in a browser.

Available: project creation, editing, artwork, viewport, print planning, and
localStorage persistence.

Unavailable: native folder dialogs, recent projects from disk, Blender
rendering, and opening arbitrary project folders.

The browser preview is for development and demonstration, not production.

## 18. Troubleshooting

### Blender not found

- Run **Diagnostics → Test Blender**.
- Set an explicit executable path in **Preferences**.
- Flatpak users: ensure `org.blender.Blender` is installed and can run
  `flatpak run org.blender.Blender --version`.
- Snap users: the snap's confinement may prevent reading project files outside
  the home directory.

### Render fails immediately

- Check the log path shown in the result.
- Confirm the project is under your home directory when using Flatpak Blender.
- Confirm the model is a valid glTF/GLB.
- Try Eevee instead of Cycles.

### Project will not open

- The error names the failing field. Validate the JSON against
  [PROJECT_FORMAT.md](PROJECT_FORMAT.md).
- Restore `project.json.bak` if the main file is truncated.
- A newer `schemaVersion` must be opened with a newer WrapForge.

### Print output is labelled DRAFT

Open the validation list. Errors must be fixed; warnings must be acknowledged.
CMYK requests always produce a warning in this alpha.

### A projected stripe smears or disappears

Increase the layer size, or paint the detail with the brush. Projected layers are
rasterised at 1024 × 1024 across the whole car, so a 5 mm pinstripe is thinner
than one pixel on a 4.3 m vehicle.

### The imported car is the wrong size or faces the wrong way

The import guesses units from the length and the front from the deck profile.
Re-export the model in metres, Y-up, facing +X, and import it again. Panel
dimensions and print plans inherit that scale.

### Paint lands on the windows

Single-mesh models share one material, so the glass is painted too. Erase the
glass area with an eraser stroke, or split the glass into its own mesh in your
3D tool before importing.

### Text looks different after export

Live text depends on fonts available to the viewer or printer. Convert text to
outlines in a vector editor before production until WrapForge adds an explicit
outlining workflow.

## 19. Before sending to a printer

1. Resolve all errors.
2. Resolve warnings or consciously accept the draft label.
3. Confirm physical panel dimensions against the actual vehicle.
4. Confirm bleed and safe margins with the print provider.
5. Outline live text in a vector tool, or verify the font is embedded/available.
6. Confirm colour expectations; output is RGB, not CMYK.
7. Ask the provider to preflight the files.
8. Keep the JSON manifest with the job for traceability.
