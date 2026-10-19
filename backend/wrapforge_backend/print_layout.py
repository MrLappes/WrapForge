"""Deterministic print planning and validation.

This is the backend reference implementation for the rules the frontend also
applies. It is independent of Blender and of the UI.
"""

from __future__ import annotations

import math

from .models import (
    ArtworkHint,
    ExportValidation,
    Panel,
    PanelPlan,
    PlacementHint,
    PrintConfiguration,
    PrintIssue,
    VehicleManifest,
)

MM_PER_INCH = 25.4
MAX_RASTER_PIXELS = 250_000_000


def unit_to_mm(value: float, unit: str) -> float:
    if unit == "mm":
        return value
    if unit == "cm":
        return value * 10.0
    if unit == "in":
        return value * MM_PER_INCH
    raise ValueError(f"Unsupported unit: {unit}")


def mm_to_unit(value_mm: float, unit: str) -> float:
    if unit == "mm":
        return value_mm
    if unit == "cm":
        return value_mm / 10.0
    if unit == "in":
        return value_mm / MM_PER_INCH
    raise ValueError(f"Unsupported unit: {unit}")


def pixels_for_physical_size(size_mm: float, dpi: int) -> int:
    if size_mm <= 0 or dpi <= 0:
        raise ValueError("Physical size and DPI must be positive")
    return max(1, math.ceil((size_mm / MM_PER_INCH) * dpi))


def physical_size_for_pixels(pixels: int, dpi: int) -> float:
    if pixels <= 0 or dpi <= 0:
        raise ValueError("Pixels and DPI must be positive")
    return (pixels / dpi) * MM_PER_INCH


def megabytes_for_pixels(width: int, height: int, bytes_per_pixel: int = 4) -> float:
    return (width * height * bytes_per_pixel) / (1024 * 1024)


def artwork_aspect(artwork: ArtworkHint | None) -> float:
    if artwork is None:
        return 1.0
    if artwork.pixelWidth and artwork.pixelHeight:
        return artwork.pixelWidth / artwork.pixelHeight
    return 1.0


def placement_bounds(
    placement: PlacementHint,
    panel: Panel,
    artwork: ArtworkHint | None,
) -> tuple[float, float, float, float]:
    aspect = max(artwork_aspect(artwork), 0.001)
    width_uv = placement.widthFraction
    height_uv = (
        placement.widthFraction * panel.dimensionsMm.width / aspect / panel.dimensionsMm.height
    )
    rotation = math.radians(placement.rotationDeg)
    cos = abs(math.cos(rotation))
    sin = abs(math.sin(rotation))
    half_width = (width_uv * cos + height_uv * sin) / 2
    half_height = (width_uv * sin + height_uv * cos) / 2
    return (
        placement.u - half_width,
        placement.u + half_width,
        placement.v - half_height,
        placement.v + half_height,
    )


def effective_dpi(
    artwork: ArtworkHint | None,
    placement: PlacementHint,
    panel: Panel,
    config: PrintConfiguration,
) -> float | None:
    if artwork is None or artwork.kind == "text":
        return None
    if not artwork.pixelWidth or not artwork.pixelHeight:
        return None
    physical_width_mm = placement.widthFraction * panel.dimensionsMm.width * config.scale
    if physical_width_mm <= 0:
        return None
    return artwork.pixelWidth / (physical_width_mm / MM_PER_INCH)


def compute_panel_plan(
    panel: Panel,
    config: PrintConfiguration,
    placements: list[PlacementHint] | None = None,
    artworks: list[ArtworkHint] | None = None,
) -> PanelPlan:
    placements = placements or []
    artworks = artworks or []
    trim_width = panel.dimensionsMm.width * config.scale
    trim_height = panel.dimensionsMm.height * config.scale
    output_width = trim_width + config.bleedMm * 2
    output_height = trim_height + config.bleedMm * 2
    pixel_width = pixels_for_physical_size(output_width, config.dpi)
    pixel_height = pixels_for_physical_size(output_height, config.dpi)
    memory = megabytes_for_pixels(pixel_width, pixel_height)
    issues: list[PrintIssue] = []

    if not panel.wrapable:
        issues.append(
            PrintIssue(
                id=f"panel-not-wrapable-{panel.id}",
                severity="error",
                panelId=panel.id,
                title="Panel is not wrap-able",
                detail=f"{panel.name} is marked as a non-wrap surface.",
                blocksExport=True,
            )
        )

    panel_placements = [p for p in placements if p.panelId == panel.id and p.visible]
    if panel.wrapable and not panel_placements:
        issues.append(
            PrintIssue(
                id=f"panel-empty-{panel.id}",
                severity="warning",
                panelId=panel.id,
                title="Panel has no artwork",
                detail=f"{panel.name} will export as a single paint-colour panel.",
                blocksExport=False,
            )
        )

    safe_fraction_x = 1.0 - config.safeMarginMm / max(trim_width, 0.001)
    safe_fraction_y = 1.0 - config.safeMarginMm / max(trim_height, 0.001)
    for placement in panel_placements:
        artwork = next((item for item in artworks if item.id == placement.artworkId), None)
        if artwork is None:
            issues.append(
                PrintIssue(
                    id=f"missing-artwork-{placement.id}",
                    severity="error",
                    panelId=panel.id,
                    title="Missing artwork",
                    detail=f"Placement {placement.id} references artwork that is not present.",
                    blocksExport=True,
                )
            )
            continue
        left, right, bottom, top = placement_bounds(placement, panel, artwork)
        if left < 0 or right > 1 or bottom < 0 or top > 1:
            issues.append(
                PrintIssue(
                    id=f"artwork-clipped-{placement.id}",
                    severity="warning",
                    panelId=panel.id,
                    title="Artwork crosses the panel edge",
                    detail=f"Placement {placement.id} extends beyond the printable panel area.",
                    blocksExport=False,
                )
            )
        if config.safeMarginMm > 0 and (
            left < 1.0 - safe_fraction_x
            or right > safe_fraction_x
            or bottom < 1.0 - safe_fraction_y
            or top > safe_fraction_y
        ):
            issues.append(
                PrintIssue(
                    id=f"artwork-safe-margin-{placement.id}",
                    severity="warning",
                    panelId=panel.id,
                    title="Artwork enters the safe margin",
                    detail=f"Placement {placement.id} is within {config.safeMarginMm} mm of a trim edge.",
                    blocksExport=False,
                )
            )
        if artwork.kind == "text":
            issues.append(
                PrintIssue(
                    id=f"text-not-outlined-{placement.id}",
                    severity="warning",
                    panelId=panel.id,
                    title="Text is not outlined",
                    detail="Production output should use outlined text or verify the font.",
                    blocksExport=False,
                )
            )
        dpi = effective_dpi(artwork, placement, panel, config)
        if dpi is not None and dpi < config.dpi * 0.75:
            issues.append(
                PrintIssue(
                    id=f"low-resolution-{placement.id}",
                    severity="warning",
                    panelId=panel.id,
                    title="Low raster resolution",
                    detail=f"Artwork resolves to about {round(dpi)} DPI at the configured size.",
                    blocksExport=False,
                )
            )
        if placement.opacity < 1:
            issues.append(
                PrintIssue(
                    id=f"transparency-{placement.id}",
                    severity="info",
                    panelId=panel.id,
                    title="Transparency in output",
                    detail="Confirm the printer handles transparency as expected.",
                    blocksExport=False,
                )
            )

    if config.dpi < 72:
        issues.append(
            PrintIssue(
                id="low-dpi",
                severity="warning",
                panelId=panel.id,
                title="Low target DPI",
                detail=f"{config.dpi} DPI is below a typical large-format minimum.",
                blocksExport=False,
            )
        )
    if config.bleedMm == 0:
        issues.append(
            PrintIssue(
                id="no-bleed",
                severity="warning",
                panelId=panel.id,
                title="No bleed",
                detail="Edge-to-edge graphics may show a white sliver after trimming.",
                blocksExport=False,
            )
        )
    if memory > 512:
        issues.append(
            PrintIssue(
                id="huge-raster",
                severity="warning",
                panelId=panel.id,
                title="Large raster allocation",
                detail=f"{pixel_width} x {pixel_height} px (~{round(memory)} MB).",
                blocksExport=False,
            )
        )
    if pixel_width * pixel_height > MAX_RASTER_PIXELS:
        issues.append(
            PrintIssue(
                id="raster-limit",
                severity="error",
                panelId=panel.id,
                title="Output exceeds the raster limit",
                detail="Exceeds 250 megapixels. Reduce DPI or scale, or split the panel.",
                blocksExport=True,
            )
        )

    return PanelPlan(
        panelId=panel.id,
        panelName=panel.name,
        trimWidthMm=trim_width,
        trimHeightMm=trim_height,
        bleedMm=config.bleedMm,
        outputWidthMm=output_width,
        outputHeightMm=output_height,
        pixelWidth=pixel_width,
        pixelHeight=pixel_height,
        estimatedMemoryMb=memory,
        issues=issues,
    )


def validate_export(
    manifest: VehicleManifest,
    config: PrintConfiguration,
    placements: list[PlacementHint] | None = None,
    artworks: list[ArtworkHint] | None = None,
) -> ExportValidation:
    placements = placements or []
    artworks = artworks or []
    wrapable = [panel for panel in manifest.panels if panel.wrapable]
    if config.panelSelectionMode == "custom":
        selected = [panel for panel in wrapable if panel.id in set(config.panelIds)]
    else:
        selected = wrapable

    plans = [compute_panel_plan(panel, config, placements, artworks) for panel in selected]
    issues: list[PrintIssue] = [issue for plan in plans for issue in plan.issues]
    if not selected:
        issues.append(
            PrintIssue(
                id="no-panels",
                severity="error",
                title="No panels selected",
                detail="Select at least one wrap-able panel.",
                blocksExport=True,
            )
        )
    if config.colorMode == "cmyk":
        issues.append(
            PrintIssue(
                id="cmyk-not-supported",
                severity="warning",
                title="CMYK output is not implemented",
                detail="WrapForge exports RGB only. CMYK, ICC, and spot colours require a printer profile.",
                blocksExport=False,
            )
        )
    if config.scale != 1:
        issues.append(
            PrintIssue(
                id="scaled-output",
                severity="info",
                title="Scaled output",
                detail=f"Output is scaled to {round(config.scale * 100)}%.",
                blocksExport=False,
            )
        )

    errors = [issue for issue in issues if issue.severity == "error"]
    warnings = [issue for issue in issues if issue.severity == "warning"]
    info = [issue for issue in issues if issue.severity == "info"]
    production_ready = not errors and not warnings
    return ExportValidation(
        label="print-ready" if production_ready else "draft",
        productionReady=production_ready,
        errors=errors,
        warnings=warnings,
        info=info,
        panels=plans,
        notes=[
            "Dimensions are computed from vehicle asset metadata, not measured from a physical vehicle.",
            "No curved-panel unfolding is applied; panel UV layouts are exported as planar documents.",
            "No CMYK conversion, ICC profile, or spot colour support is present.",
            "Live text is not outlined automatically.",
        ],
    )
