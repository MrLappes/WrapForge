# Project format

A saved project is a directory containing `project.json` and its assets. The
JSON is UTF-8, inspectable, and validated at load time.

## Directory layout

```
My Wrap.wrapforge/
  project.json          # envelope + document
  project.json.bak      # previous save, when overwritten
  thumbnail.png         # viewport capture, optional
  assets/
    vehicle/
      vehicle.glb
      manifest.json          # bundled assets only
      base-texture.png       # imported models: original base colour
    artwork/
      art_....svg
      art_....png
  renders/
    render-....png
    render-....json
    logs/
      render-....log
```

Only `assets/` may be written during a project save. Exports go to a directory
chosen by the user.

## Envelope

```json
{
  "format": "wrapforge-project",
  "formatVersion": 1,
  "appVersion": "0.1.0-alpha.0",
  "savedAt": "2026-10-18T17:41:00.000Z",
  "project": { "...": "ProjectDocument" }
}
```

- `format` must be `wrapforge-project`.
- `formatVersion` is the envelope version (currently `1`).
- `project.schemaVersion` is the document version (currently `2`).
- A document with a newer `schemaVersion` is rejected, not downgraded.

Bare project objects without an envelope are accepted for migration.

## ProjectDocument

```json
{
  "schemaVersion": 2,
  "id": "proj_...",
  "name": "Fleet van",
  "description": "",
  "createdAt": "2026-10-18T17:00:00.000Z",
  "updatedAt": "2026-10-18T17:41:00.000Z",
  "vehicle": { "...": "VehicleInstance" },
  "artwork": [],
  "placements": [],
  "print": { "...": "PrintConfiguration" },
  "render": { "...": "RenderConfiguration" },
  "settings": { "...": "ProjectSettings" }
}
```

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | integer | Must equal the supported version |
| `id` | string | `proj_` prefix |
| `name` | string | Non-empty |
| `description` | string | May be empty |
| `createdAt`, `updatedAt` | ISO timestamp | Must parse as a date |
| `vehicle` | object | Vehicle instance |
| `artwork` | array | Artwork assets |
| `placements` | array | Artwork-to-panel mappings |
| `print` | object | Print configuration |
| `render` | object | Render configuration |
| `settings` | object | Viewport settings |

## VehicleInstance

```json
{
  "assetId": "wrapforge-sample-hatch",
  "displayName": "WrapForge Sample Hatch",
  "modelPath": "assets/vehicle/vehicle.glb",
  "manifestPath": "assets/vehicle/manifest.json",
  "paintColor": "#d8dde3",
  "livery": { "...": "Livery" },
  "dimensionsMm": { "length": 4300, "width": 1820, "height": 1480 },
  "bodyStyle": "Stylized 5-door hatchback",
  "license": {
    "id": "CC0-1.0",
    "name": "Creative Commons Zero 1.0 Universal",
    "attribution": "WrapForge project contributors",
    "redistributionPermitted": true
  },
  "panels": [
    {
      "id": "front_door_l",
      "name": "Front door (left)",
      "category": "door",
      "side": "left",
      "wrapable": true,
      "outwardAxis": "+Y",
      "objectName": "WF_front_door_l",
      "dimensionsMm": { "width": 1148, "height": 388 },
      "areaM2": 0.4454,
      "uv": { "hasUv": true, "layout": "planar-outer-face" }
    }
  ],
  "validation": { "score": 86, "maxScore": 100, "method": "...", "checks": [], "notes": [] }
}
```

`modelPath` may be `bundled:...` before the first save. On save, the bundled
model is copied into `assets/vehicle/vehicle.glb` and the path is rewritten to a
project-relative path.

`panels` is a snapshot of the asset manifest. Placement and print references use
`panels[].id`.

Imported models add two optional panel fields and one vehicle-level map:

| Field | Meaning |
|---|---|
| `confidence` | 0–1 heuristic confidence from auto-detection. |
| `detection` | `bundled`, `geometry` (auto-detected), `name`, or `manual`. |
| `panelMap` (vehicle) | Which triangles belong to which panel. |

`panelMap` is a compact ownership map, because imported models are usually one
mesh:

```json
{
  "panelMap": {
    "order": ["p-hood", "p-roof", "p-door-front-L"],
    "meshes": [
      { "objectName": "body", "triangles": "AAABAgME..." }
    ]
  }
}
```

- `order` lists panel ids; the byte value in `triangles` is an index into it.
- `triangles` is base64 of one byte per triangle, in mesh triangle order. `254`
  means "not part of a wrap panel".
- 50k triangles cost about 67 kB of base64 instead of megabytes of ranges, and
  picking decodes it once into an `Int16Array`.

### Livery

`wrapGlass` (boolean, default `false`) controls whether the livery may be applied
to panels whose category is `window`. When false the composer keeps the model's
original glass pixels: the panel map is rasterised into a UV-space mask and the
foil is clipped to everything else.

```json
{
  "enabled": true,
  "resolution": 2048,
  "baseTexturePath": "assets/vehicle/base-texture.png",
  "baseTextureSize": 1024,
  "finish": { "mode": "tint", "color": "#0a1020", "strength": 0.96 },
  "layers": [
    {
      "id": "layer_...",
      "name": "Rising sun",
      "kind": "ellipse",
      "mapping": "side-left",
      "visible": true,
      "locked": false,
      "blend": "normal",
      "opacity": 0.96,
      "color": "#d21f2b",
      "u": 0.46, "v": 0.52, "w": 0.5, "h": 0.66,
      "rotationDeg": 0, "skew": 0,
      "createdAt": "2026-10-18T17:00:00.000Z"
    }
  ],
  "strokes": [
    {
      "id": "stroke-...",
      "name": "Brush stroke",
      "visible": true,
      "erase": false,
      "color": "#ff2d55",
      "opacity": 0.9,
      "size": 0.03,
      "hardness": 0.75,
      "points": [{ "u": 0.42, "v": 0.31 }],
      "createdAt": "2026-10-18T17:00:00.000Z"
    }
  ]
}
```

- `finish.mode` is `original`, `tint` (keeps the baked luminance) or `solid`.
- `mapping` is `atlas` (texture space) or `side-left`, `side-right`, `top`,
  `front`, `rear` (rasterised through the model's UVs).
- Layer boxes are normalised. For `atlas` they are texture UV; for projections
  they are fractions of the vehicle bounding box in that projection.
- `strokes[].size` is a fraction of the texture width, so strokes render
  identically at any `resolution`.
- The composed atlas is derived data. It is not stored in the project; the
  layers and strokes are, and the atlas is rebuilt on load.

## ArtworkAsset

```json
{
  "id": "art_...",
  "name": "Velocity stripes",
  "kind": "svg",
  "mimeType": "image/svg+xml",
  "sourcePath": "assets/artwork/art_....svg",
  "pixelWidth": 1200,
  "pixelHeight": 600,
  "physicalWidthMm": 600,
  "physicalHeightMm": 300,
  "attribution": "WrapForge sample artwork (CC0-1.0)",
  "createdAt": "2026-10-18T17:10:00.000Z"
}
```

`kind` is `svg`, `raster`, or `text`.

- `sourcePath` is project-relative. On desktop, `embeddedSource` is removed from
  the on-disk JSON to keep it small.
- `embeddedSource` holds a data URL for browser storage or unsaved work.
- `pixelWidth`/`pixelHeight` are required for raster resolution checks.
- Text assets use `text`:

```json
{
  "kind": "text",
  "mimeType": "text/plain",
  "text": {
    "content": "FLEET",
    "fontFamily": "Inter",
    "fontWeight": 700,
    "fontSizePx": 160,
    "fill": "#ffffff",
    "align": "center"
  }
}
```

## Placement

```json
{
  "id": "placement_...",
  "name": "Velocity stripes",
  "artworkId": "art_...",
  "panelId": "front_door_l",
  "mapping": "uv",
  "u": 0.5,
  "v": 0.5,
  "widthFraction": 0.6,
  "rotationDeg": 0,
  "opacity": 1,
  "visible": true,
  "locked": false,
  "createdAt": "2026-10-18T17:12:00.000Z"
}
```

- `mapping` is `uv` only.
- `u`/`v` are the artwork centre in panel UV space, 0..1.
- `widthFraction` is the artwork width as a fraction of panel physical width
  (max 4).
- `rotationDeg` is -360..360.
- `opacity` is 0..1.

## PrintConfiguration

```json
{
  "unit": "mm",
  "scale": 1,
  "dpi": 150,
  "bleedMm": 3,
  "safeMarginMm": 5,
  "colorMode": "rgb",
  "includeRegistrationMarks": true,
  "includePanelLabels": true,
  "panelSelectionMode": "all",
  "panelIds": []
}
```

- `unit`: `mm`, `cm`, `in`.
- `scale`: 0 < scale ≤ 10.
- `dpi`: 30..1200.
- `bleedMm`, `safeMarginMm`: 0..100.
- `colorMode`: `rgb` or `cmyk`; `cmyk` is accepted but produces a warning and a
  draft label because conversion is not implemented.
- `panelSelectionMode`: `all` or `custom`; `panelIds` is used for `custom`.

## RenderConfiguration

```json
{
  "preset": "preview",
  "width": 1600,
  "height": 1000,
  "engine": "BLENDER_EEVEE",
  "samples": 32,
  "camera": "three-quarter-front",
  "transparentBackground": false,
  "includeFloor": true
}
```

- `preset`: `draft`, `preview`, `high`, `final`.
- `width`/`height`: 64..8192.
- `engine`: `BLENDER_EEVEE` or `CYCLES`.
- `samples`: 1..4096.
- `camera`: `three-quarter-front`, `three-quarter-rear`, `front`, `rear`, `left`,
  `right`, `top`.
- `transparentBackground`, `includeFloor`: booleans.

## ProjectSettings

```json
{
  "showGrid": true,
  "showPanelEdges": true,
  "showUvSeams": false,
  "gridSizeMm": 250
}
```

## Schema versions and migration

Current: `schemaVersion: 2`.

| From | To | Behavior |
|---|---|---|
| 0 (no version / bare object) | 1 | Adds schema version, defaults for missing timestamps, artwork, placements, print, render, settings; warns if no panels |
| 1 | 2 | Adds `vehicle.livery` with defaults (disabled, 2048 px, tint finish, no layers or strokes) |
| 2 | 2 | Validated without change |

Rules:

- A newer version is rejected with an explicit message.
- Missing required fields fail validation with a field path.
- Unknown fields are preserved where the migration spreads the source object.
- Migrations operate on untrusted JSON; validation always follows.

To add a schema version:

1. Increment `SCHEMA_VERSION`.
2. Add a migration from the previous version.
3. Add a fixture and a migration test.
4. Update this document.

## Integrity validation

Beyond schema validation, `validateProjectIntegrity` checks:

- duplicate artwork IDs;
- missing artwork source (non-text);
- text artwork without text configuration;
- raster artwork without pixel dimensions (warning);
- duplicate placement IDs;
- placements referencing missing artwork or panels;
- placements on non-wrap panels (warning);
- placement centres outside 0..1 (warning);
- no panels loaded;
- missing vehicle license (warning);
- empty project name (warning);
- updated timestamp before created (info);
- print selection referencing missing panels;
- all blocking print errors.

## Browser storage

In browser mode, projects are stored in `localStorage` under a key derived from
the project ID. The same schema and integrity rules apply. Inline artwork data is
kept because there is no file system. Storage quotas are the browser's, not
WrapForge's.

## Recovery

- A save writes `project.json.tmp`, fsyncs, then renames.
- The previous `project.json` is copied to `project.json.bak`.
- If the main file is corrupt, rename the `.bak` over it and reopen.
- There is no guided repair UI in this alpha.
