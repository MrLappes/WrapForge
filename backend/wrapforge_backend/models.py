"""Validated backend data models.

These models intentionally mirror the TypeScript project schema on the fields
that affect production output. They do not replace the frontend schema; they
provide a second, independent validation layer for automation and exports.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class LicenseInfo(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str = Field(min_length=1)
    name: str | None = None
    attribution: str | None = None
    source: str | None = None
    redistributionPermitted: bool | None = None


class Dimensions(BaseModel):
    length: float = Field(gt=0)
    width: float = Field(gt=0)
    height: float = Field(gt=0)


class PanelDimensions(BaseModel):
    width: float = Field(gt=0)
    height: float = Field(gt=0)


class UvMetadata(BaseModel):
    model_config = ConfigDict(extra="allow")

    hasUv: bool
    layout: str | None = None
    outerFaceCount: int | None = Field(default=None, ge=0)
    overlapDetected: bool | None = None
    note: str | None = None


class Panel(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    category: str
    side: Literal["left", "right", "center"]
    wrapable: bool
    outwardAxis: Literal["+X", "-X", "+Y", "-Y", "+Z", "-Z"]
    objectName: str = Field(min_length=1)
    dimensionsMm: PanelDimensions
    areaM2: float | None = Field(default=None, ge=0)
    uv: UvMetadata


class ValidationCheck(BaseModel):
    id: str
    label: str
    status: Literal["pass", "warning", "fail"]
    detail: str


class AssetValidation(BaseModel):
    score: float = Field(ge=0, le=100)
    maxScore: float = Field(default=100, ge=0, le=100)
    method: str
    checks: list[ValidationCheck] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class VehicleFiles(BaseModel):
    model: str = Field(min_length=1)
    blend: str | None = None
    thumbnail: str | None = None
    hero: str | None = None


class VehicleManifest(BaseModel):
    model_config = ConfigDict(extra="allow")

    schemaVersion: int = Field(ge=1)
    assetId: str = Field(min_length=1)
    displayName: str = Field(min_length=1)
    manufacturer: str | None = None
    model: str | None = None
    modelYear: int | None = None
    bodyStyle: str | None = None
    units: Literal["mm"]
    dimensionsMm: Dimensions
    license: LicenseInfo
    files: VehicleFiles
    panels: list[Panel]
    validation: AssetValidation

    @model_validator(mode="after")
    def unique_panels(self) -> "VehicleManifest":
        ids = [panel.id for panel in self.panels]
        if len(ids) != len(set(ids)):
            duplicates = sorted({value for value in ids if ids.count(value) > 1})
            raise ValueError(f"Duplicate panel ids: {', '.join(duplicates)}")
        object_names = [panel.objectName for panel in self.panels]
        if len(object_names) != len(set(object_names)):
            raise ValueError("Duplicate panel object names")
        return self


class PrintConfiguration(BaseModel):
    unit: Literal["mm", "cm", "in"] = "mm"
    scale: float = Field(default=1, gt=0, le=10)
    dpi: int = Field(default=150, ge=30, le=1200)
    bleedMm: float = Field(default=3, ge=0, le=100)
    safeMarginMm: float = Field(default=5, ge=0, le=100)
    colorMode: Literal["rgb", "cmyk"] = "rgb"
    includeRegistrationMarks: bool = True
    includePanelLabels: bool = True
    panelSelectionMode: Literal["all", "custom"] = "all"
    panelIds: list[str] = Field(default_factory=list)


class PrintIssue(BaseModel):
    id: str
    severity: Literal["error", "warning", "info"]
    title: str
    detail: str
    panelId: str | None = None
    blocksExport: bool


class PanelPlan(BaseModel):
    panelId: str
    panelName: str
    trimWidthMm: float
    trimHeightMm: float
    bleedMm: float
    outputWidthMm: float
    outputHeightMm: float
    pixelWidth: int
    pixelHeight: int
    estimatedMemoryMb: float
    issues: list[PrintIssue] = Field(default_factory=list)


class ExportValidation(BaseModel):
    label: Literal["print-ready", "draft"]
    productionReady: bool
    errors: list[PrintIssue] = Field(default_factory=list)
    warnings: list[PrintIssue] = Field(default_factory=list)
    info: list[PrintIssue] = Field(default_factory=list)
    panels: list[PanelPlan] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class PlacementHint(BaseModel):
    """Minimal placement data needed for print validation."""

    id: str
    panelId: str
    artworkId: str
    u: float = 0.5
    v: float = 0.5
    widthFraction: float = Field(gt=0, le=4)
    rotationDeg: float = 0
    visible: bool = True
    opacity: float = Field(default=1, ge=0, le=1)


class ArtworkHint(BaseModel):
    id: str
    kind: Literal["svg", "raster", "text"] = "raster"
    pixelWidth: float | None = Field(default=None, gt=0)
    pixelHeight: float | None = Field(default=None, gt=0)
