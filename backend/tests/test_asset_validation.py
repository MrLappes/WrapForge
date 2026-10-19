from __future__ import annotations

import copy
from pathlib import Path

from wrapforge_backend.asset_validation import validate_manifest
from wrapforge_backend.models import VehicleManifest


def test_valid_sample_asset(manifest: VehicleManifest, asset_root: Path) -> None:
    report = validate_manifest(manifest, asset_root)
    assert report.valid is True
    assert report.wrapablePanels == 13
    assert report.totalAreaM2 > 0
    assert all(check.status != "fail" for check in report.checks)


def test_missing_model_is_an_error(
    manifest_payload: dict, asset_root: Path
) -> None:
    payload = copy.deepcopy(manifest_payload)
    payload["files"]["model"] = "model/missing.glb"
    report = validate_manifest(VehicleManifest.model_validate(payload), asset_root)
    assert report.valid is False
    assert any("missing" in error.lower() for error in report.errors)


def test_non_redistributable_license_is_an_error(
    manifest_payload: dict, asset_root: Path
) -> None:
    payload = copy.deepcopy(manifest_payload)
    payload["license"]["redistributionPermitted"] = False
    report = validate_manifest(VehicleManifest.model_validate(payload), asset_root)
    assert report.valid is False
    assert any("redistribution" in error.lower() for error in report.errors)


def test_asset_without_wrapable_panels_is_rejected(
    manifest_payload: dict, asset_root: Path
) -> None:
    payload = copy.deepcopy(manifest_payload)
    for panel in payload["panels"]:
        panel["wrapable"] = False
    report = validate_manifest(VehicleManifest.model_validate(payload), asset_root)
    assert report.valid is False
    assert any("wrap-able" in error for error in report.errors)


def test_unsafe_model_path_is_rejected(
    manifest_payload: dict, asset_root: Path
) -> None:
    payload = copy.deepcopy(manifest_payload)
    payload["files"]["model"] = "../evil.glb"
    report = validate_manifest(VehicleManifest.model_validate(payload), asset_root)
    assert report.valid is False
    assert any("Unsafe model path" in error for error in report.errors)


def test_missing_uv_is_a_warning(manifest_payload: dict, asset_root: Path) -> None:
    payload = copy.deepcopy(manifest_payload)
    payload["panels"][0]["uv"]["hasUv"] = False
    report = validate_manifest(VehicleManifest.model_validate(payload), asset_root)
    assert any("without UV" in warning for warning in report.warnings)
