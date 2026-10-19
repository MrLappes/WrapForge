from __future__ import annotations

import pytest

from wrapforge_backend.models import (
    ArtworkHint,
    Panel,
    PlacementHint,
    PrintConfiguration,
)
from wrapforge_backend.print_layout import (
    compute_panel_plan,
    effective_dpi,
    placement_bounds,
    pixels_for_physical_size,
    unit_to_mm,
    validate_export,
)


def hood(manifest) -> Panel:
    return next(panel for panel in manifest.panels if panel.id == "hood")


def test_unit_conversions() -> None:
    assert unit_to_mm(1, "in") == pytest.approx(25.4)
    assert unit_to_mm(1, "cm") == pytest.approx(10)
    assert pixels_for_physical_size(25.4, 300) == 300
    assert pixels_for_physical_size(1000, 150) == 5906


def test_panel_plan_dimensions_and_pixels(manifest) -> None:
    panel = hood(manifest)
    config = PrintConfiguration(dpi=150, bleedMm=3, scale=1)
    plan = compute_panel_plan(panel, config)
    expected_width = panel.dimensionsMm.width + 6
    expected_height = panel.dimensionsMm.height + 6
    assert plan.outputWidthMm == pytest.approx(expected_width)
    assert plan.outputHeightMm == pytest.approx(expected_height)
    assert plan.pixelWidth == pixels_for_physical_size(expected_width, 150)
    assert plan.pixelHeight == pixels_for_physical_size(expected_height, 150)
    assert plan.estimatedMemoryMb > 0


def test_scaled_output(manifest) -> None:
    panel = hood(manifest)
    config = PrintConfiguration(dpi=150, bleedMm=3, scale=0.5)
    plan = compute_panel_plan(panel, config)
    assert plan.trimWidthMm == pytest.approx(panel.dimensionsMm.width * 0.5)
    assert plan.trimHeightMm == pytest.approx(panel.dimensionsMm.height * 0.5)


def test_empty_panel_is_a_warning(manifest) -> None:
    result = validate_export(manifest, PrintConfiguration(dpi=150))
    assert result.label == "draft"
    assert any(issue.id == "panel-empty-hood" for issue in result.warnings)


def test_clean_export_is_print_ready(manifest) -> None:
    panel = hood(manifest)
    placement = PlacementHint(
        id="p1",
        panelId=panel.id,
        artworkId="a1",
        u=0.5,
        v=0.5,
        widthFraction=0.5,
    )
    artwork = ArtworkHint(id="a1", pixelWidth=4000, pixelHeight=2000)
    result = validate_export(
        manifest,
        PrintConfiguration(
            dpi=100,
            bleedMm=3,
            safeMarginMm=5,
            panelSelectionMode="custom",
            panelIds=[panel.id],
        ),
        placements=[placement],
        artworks=[artwork],
    )
    assert result.productionReady is True
    assert result.label == "print-ready"
    assert not result.errors
    assert not result.warnings


def test_missing_artwork_blocks_export(manifest) -> None:
    panel = hood(manifest)
    placement = PlacementHint(id="p1", panelId=panel.id, artworkId="missing", widthFraction=0.5)
    result = validate_export(manifest, PrintConfiguration(), placements=[placement], artworks=[])
    assert result.label == "draft"
    assert any(issue.id == "missing-artwork-p1" for issue in result.errors)


def test_clipping_and_low_resolution_warnings(manifest) -> None:
    panel = hood(manifest)
    placement = PlacementHint(
        id="p1", panelId=panel.id, artworkId="a1", u=0.05, widthFraction=0.6
    )
    artwork = ArtworkHint(id="a1", pixelWidth=100, pixelHeight=50)
    result = validate_export(
        manifest, PrintConfiguration(dpi=150), placements=[placement], artworks=[artwork]
    )
    ids = {issue.id for issue in result.warnings}
    assert any(value.startswith("artwork-clipped") for value in ids)
    assert any(value.startswith("low-resolution") for value in ids)
    assert result.productionReady is False


def test_text_warning(manifest) -> None:
    panel = hood(manifest)
    placement = PlacementHint(id="p1", panelId=panel.id, artworkId="a1", widthFraction=0.4)
    artwork = ArtworkHint(id="a1", kind="text", pixelWidth=1000, pixelHeight=300)
    result = validate_export(
        manifest, PrintConfiguration(), placements=[placement], artworks=[artwork]
    )
    assert any(issue.id.startswith("text-not-outlined") for issue in result.warnings)


def test_cmyk_and_empty_selection(manifest) -> None:
    config = PrintConfiguration(colorMode="cmyk", panelSelectionMode="custom", panelIds=[])
    result = validate_export(manifest, config)
    ids = {issue.id for issue in result.errors + result.warnings}
    assert "no-panels" in ids
    assert "cmyk-not-supported" in ids


def test_custom_selection(manifest) -> None:
    config = PrintConfiguration(panelSelectionMode="custom", panelIds=["roof"])
    result = validate_export(manifest, config)
    assert [plan.panelId for plan in result.panels] == ["roof"]


def test_raster_limit(manifest) -> None:
    panel = hood(manifest)
    config = PrintConfiguration(dpi=1200, scale=10)
    plan = compute_panel_plan(panel, config)
    assert any(issue.id == "raster-limit" for issue in plan.issues)
    assert any(issue.blocksExport for issue in plan.issues if issue.id == "raster-limit")


def test_placement_bounds_and_dpi(manifest) -> None:
    panel = hood(manifest)
    artwork = ArtworkHint(id="a1", pixelWidth=1000, pixelHeight=1000)
    bounds = placement_bounds(
        PlacementHint(id="p1", panelId=panel.id, artworkId="a1", widthFraction=0.4),
        panel,
        artwork,
    )
    left, right, bottom, top = bounds
    expected_height_uv = 0.4 * panel.dimensionsMm.width / panel.dimensionsMm.height
    assert right - left == pytest.approx(0.4)
    assert top - bottom == pytest.approx(expected_height_uv)
    dpi = effective_dpi(
        ArtworkHint(id="a1", pixelWidth=4000, pixelHeight=2000),
        PlacementHint(id="p1", panelId=panel.id, artworkId="a1", widthFraction=0.5),
        panel,
        PrintConfiguration(scale=1),
    )
    assert dpi is not None and dpi > 100
