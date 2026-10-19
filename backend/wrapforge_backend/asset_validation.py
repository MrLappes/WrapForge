"""Independent asset/manifest validation for imported vehicle assets."""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, Field

from .models import VehicleManifest
from .paths import UnsafePathError, safe_join, safe_relative_path

MAX_MODEL_BYTES = 200 * 1024 * 1024


class AssetCheck(BaseModel):
    id: str
    label: str
    status: str
    detail: str


class AssetReport(BaseModel):
    valid: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    checks: list[AssetCheck] = Field(default_factory=list)
    wrapablePanels: int = 0
    totalAreaM2: float = 0.0


def validate_manifest(manifest: VehicleManifest, asset_root: Path | None = None) -> AssetReport:
    errors: list[str] = []
    warnings: list[str] = []
    checks: list[AssetCheck] = []

    checks.append(
        AssetCheck(
            id="units",
            label="Metric units",
            status="pass" if manifest.units == "mm" else "fail",
            detail=f"Manifest units: {manifest.units}",
        )
    )
    if not manifest.license.id:
        errors.append("License id is missing")
    if manifest.license.redistributionPermitted is False:
        errors.append("License does not permit redistribution")
    checks.append(
        AssetCheck(
            id="license",
            label="License metadata",
            status="pass" if manifest.license.id else "fail",
            detail=f"{manifest.license.id} — {manifest.license.name or 'unnamed'}",
        )
    )

    wrapable = [panel for panel in manifest.panels if panel.wrapable]
    if not wrapable:
        errors.append("Asset has no wrap-able panels")
    checks.append(
        AssetCheck(
            id="panels",
            label="Wrap-able panel separation",
            status="pass" if wrapable else "fail",
            detail=f"{len(wrapable)} wrap-able of {len(manifest.panels)} total panels",
        )
    )

    missing_uv = [panel.id for panel in wrapable if not panel.uv.hasUv]
    if missing_uv:
        warnings.append(f"Panels without UV metadata: {', '.join(missing_uv)}")
    checks.append(
        AssetCheck(
            id="uv",
            label="UV availability",
            status="pass" if not missing_uv else "warning",
            detail="All wrap-able panels have UVs" if not missing_uv else f"Missing: {', '.join(missing_uv)}",
        )
    )

    overlap = [panel.id for panel in wrapable if panel.uv.overlapDetected]
    if overlap:
        warnings.append(f"UV overlap reported on: {', '.join(overlap)}")
    checks.append(
        AssetCheck(
            id="uv-overlap",
            label="UV overlap",
            status="pass" if not overlap else "warning",
            detail="No overlap reported" if not overlap else f"Overlap: {', '.join(overlap)}",
        )
    )

    try:
        model_relative = safe_relative_path(manifest.files.model)
        checks.append(
            AssetCheck(
                id="model-path",
                label="Model path safety",
                status="pass",
                detail=f"Relative model path: {model_relative}",
            )
        )
        if asset_root is not None:
            model_path = safe_join(asset_root, manifest.files.model)
            if not model_path.is_file():
                errors.append(f"Model file is missing: {manifest.files.model}")
                checks.append(
                    AssetCheck(
                        id="model-present",
                        label="Model file present",
                        status="fail",
                        detail=str(model_path),
                    )
                )
            else:
                size = model_path.stat().st_size
                if size > MAX_MODEL_BYTES:
                    errors.append(f"Model file exceeds {MAX_MODEL_BYTES} bytes")
                checks.append(
                    AssetCheck(
                        id="model-present",
                        label="Model file present",
                        status="pass" if size <= MAX_MODEL_BYTES else "fail",
                        detail=f"{size} bytes",
                    )
                )
    except UnsafePathError as error:
        errors.append(f"Unsafe model path: {error}")
        checks.append(
            AssetCheck(
                id="model-path",
                label="Model path safety",
                status="fail",
                detail=str(error),
            )
        )

    area = sum(panel.areaM2 or 0.0 for panel in manifest.panels)
    return AssetReport(
        valid=not errors,
        errors=errors,
        warnings=warnings,
        checks=checks,
        wrapablePanels=len(wrapable),
        totalAreaM2=round(area, 4),
    )
