# Print workflow

WrapForge prepares panel documents for large-format printing. This document
explains the math, the validation rules, and the exact limits of the alpha.

**Read this first:** output is RGB. There is no CMYK/ICC pipeline. A
`PRINT-READY` label means the local rules found no errors or warnings; it is not
a printer's certification.

## 1. Model

Each wrap-able panel has:

- `dimensionsMm.width` and `dimensionsMm.height` from the vehicle manifest;
- a UV rectangle that maps its outer face to 0..1;
- zero or more artwork placements.

The print plan is independent of the 3D mesh. If the manifest dimensions are
wrong, the print is wrong.

## 2. Geometry

Given print configuration `scale`, `bleedMm`, and `dpi`:

```
trimWidthMm  = panel.widthMm  × scale
trimHeightMm = panel.heightMm × scale
outputWidth  = trimWidthMm  + 2 × bleedMm
outputHeight = trimHeightMm + 2 × bleedMm
pixelWidth   = ceil(outputWidth  / 25.4 × dpi)
pixelHeight  = ceil(outputHeight / 25.4 × dpi)
```

The trim line is the intended cut. Bleed extends beyond it. The safe margin is
measured inward from the trim.

Example: a 1148 × 388 mm door at scale 1.0, 3 mm bleed, 150 DPI:

```
trim     = 1148 × 388 mm
output   = 1154 × 394 mm
pixels   = ceil(1154/25.4×150) × ceil(394/25.4×150)
         = 6816 × 2327 px
memory   ≈ 6816 × 2327 × 4 bytes ≈ 60.5 MB
```

## 3. Placement in UV space

A placement stores:

- `u`, `v` — artwork centre in panel UV space (0..1);
- `widthFraction` — artwork width as a fraction of the panel's physical width;
- `rotationDeg`, `opacity`, `visible`, `locked`.

The physical aspect ratio is preserved:

```
heightUv = (widthFraction × panel.widthMm) / artworkAspect / panel.heightMm
```

The bounding box accounts for rotation:

```
halfWidth  = (widthUv  × |cos θ| + heightUv × |sin θ|) / 2
halfHeight = (widthUv  × |sin θ| + heightUv × |cos θ|) / 2
```

Bounds outside 0..1 are clipped by the panel edge.

Effective raster DPI:

```
physicalWidthMm = widthFraction × panel.widthMm × scale
effectiveDpi    = artwork.pixelWidth / (physicalWidthMm / 25.4)
```

Text has no raster DPI; it is vector/live and is warned about separately.

## 4. Validation rules

| ID | Severity | Condition | Blocks export |
|---|---|---|---|
| `panel-not-wrapable` | error | A non-wrap panel is selected | Yes |
| `panel-empty` | warning | Wrap panel has no visible artwork | No |
| `missing-artwork` | error | Placement references a missing asset | Yes |
| `artwork-clipped` | warning | Artwork crosses the panel edge | No |
| `artwork-safe-margin` | warning | Artwork enters the safe margin | No |
| `text-not-outlined` | warning | A visible placement is live text | No |
| `low-resolution` | warning | Effective DPI < 75% of target | No |
| `transparency` | info | Placement opacity < 100% | No |
| `low-dpi` | warning | Target DPI < 72 | No |
| `no-bleed` | warning | Bleed = 0 | No |
| `huge-raster` | warning | Estimated allocation > 512 MB | No |
| `raster-limit` | error | Output > 250 megapixels | Yes |
| `no-panels` | error | No wrap-able panels selected | Yes |
| `cmyk-not-supported` | warning | Colour mode is CMYK | No |
| `scaled-output` | info | Scale ≠ 1.0 | No |
| `missing-placement-assets` | error | Any placement has no artwork | Yes |

Errors block the print-ready label. Warnings require an explicit acknowledgment
checkbox before export. Info items never block.

`productionReady` is true only when both error and warning lists are empty.

## 5. Labels and filenames

- Zero errors and zero warnings → `PRINT-READY`; files are named
  `wrapforge-*`.
- Otherwise → `DRAFT`; files are named `wrapforge-draft-*`.
- The JSON manifest contains `productionReady` and
  `acknowledgedWarnings`.

The label is rendered in the UI and recorded in the manifest. Do not remove the
prefix manually to imply readiness.

## 6. Raster export

`Export panel PNG` writes one PNG per selected panel. Each document contains:

- the artwork composited over the paint colour at the computed pixel size;
- the trim rectangle;
- the safe-area rectangle (when margin > 0);
- crop marks at the corners;
- registration marks (when enabled);
- a panel label (when enabled);
- bleed area extending beyond trim.

The raster is capped by the 250-megapixel rule. Very large panels may need lower
DPI or splitting; there is no tiling feature yet.

## 7. Vector export

`Export panel SVG` writes a vector document containing:

- a panel-sized viewBox;
- the paint background;
- vector artwork transformed into panel coordinates;
- trim/safe-area guides;
- crop marks and labels where configured;
- live text as `<text>` elements (not outlined).

SVG export preserves editability but is not a PDF/X print file. Some printers
prefer PDF; none is produced yet.

## 8. Manifest

The print manifest is JSON:

```json
{
  "format": "wrapforge-print-manifest",
  "formatVersion": 1,
  "appVersion": "0.1.0-alpha.0",
  "generatedAt": "2026-10-18T17:41:00.000Z",
  "label": "draft",
  "productionReady": false,
  "acknowledgedWarnings": true,
  "project": { "id": "proj_...", "name": "Fleet van" },
  "vehicle": {
    "assetId": "wrapforge-sample-hatch",
    "displayName": "WrapForge Sample Hatch",
    "dimensionsMm": { "length": 4300, "width": 1820, "height": 1480 },
    "license": { "id": "CC0-1.0" }
  },
  "configuration": {
    "unit": "mm",
    "scale": 1,
    "dpi": 150,
    "bleedMm": 3,
    "safeMarginMm": 5,
    "colorMode": "rgb"
  },
  "validation": { "errors": [], "warnings": [], "info": [] },
  "panels": [
    {
      "panelId": "front_door_l",
      "panelName": "Front door (left)",
      "dimensionsMm": { "width": 1148, "height": 388 },
      "plan": {
        "trimWidthMm": 1148,
        "trimHeightMm": 388,
        "outputWidthMm": 1154,
        "outputHeightMm": 394,
        "bleedMm": 3,
        "pixelWidth": 6816,
        "pixelHeight": 2327,
        "dpi": 150,
        "scale": 1
      },
      "files": { "png": "wrapforge-draft-front-door-left-....png", "svg": "..." },
      "issues": [],
      "dimensionsVerified": false,
      "flatteningMethod": "planar-uv-outer-face",
      "distortionNote": "Sample panels are planar plates. No curved-surface parameterisation or flattening was applied."
    }
  ],
  "notes": ["..."]
}
``````

Exact keys are defined by the exporter; treat this as an example, not a stable
API. See `src/features/print/PrintLayoutView.tsx` for the current writer.

## 9. What is not implemented

- CMYK conversion, ICC profiles, rendering intents, ink limits.
- Spot colours, white ink, varnish.
- PDF/X, TIFF, or RIP-native formats.
- Tiling and overlap for oversized panels.
- Geometric unfolding of curved panels.
- Automatic text outlining.
- Printer-specific preflight.
- Colour-accurate soft proofing.

See [KNOWN_LIMITATIONS.md](../KNOWN_LIMITATIONS.md).

## 10. Preflight checklist

1. Resolve every error.
2. Review every warning; acknowledge only what you understand.
3. Verify panel dimensions against the vehicle.
4. Confirm bleed and safe margin with the printer.
5. Outline live text in a vector editor or verify font availability.
6. Check effective DPI for every raster placement.
7. Confirm the provider accepts RGB/SVG/PNG; convert to CMYK/PDF externally if
   required.
8. Keep the manifest with the job.
9. Have the provider run their own preflight before printing.
