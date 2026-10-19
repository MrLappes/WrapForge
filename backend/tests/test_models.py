from __future__ import annotations

import copy

import pytest
from pydantic import ValidationError

from wrapforge_backend.models import PrintConfiguration, VehicleManifest


def test_valid_manifest(manifest: VehicleManifest) -> None:
    assert manifest.assetId == "wrapforge-sample-hatch"
    assert manifest.units == "mm"
    assert manifest.license.id == "CC0-1.0"
    assert len(manifest.panels) == 13


def test_duplicate_panel_ids_are_rejected(manifest_payload: dict) -> None:
    payload = copy.deepcopy(manifest_payload)
    payload["panels"][1]["id"] = payload["panels"][0]["id"]
    with pytest.raises(ValidationError):
        VehicleManifest.model_validate(payload)


def test_duplicate_object_names_are_rejected(manifest_payload: dict) -> None:
    payload = copy.deepcopy(manifest_payload)
    payload["panels"][1]["objectName"] = payload["panels"][0]["objectName"]
    with pytest.raises(ValidationError):
        VehicleManifest.model_validate(payload)


def test_invalid_units_are_rejected(manifest_payload: dict) -> None:
    payload = copy.deepcopy(manifest_payload)
    payload["units"] = "inches"
    with pytest.raises(ValidationError):
        VehicleManifest.model_validate(payload)


def test_missing_license_is_rejected(manifest_payload: dict) -> None:
    payload = copy.deepcopy(manifest_payload)
    del payload["license"]
    with pytest.raises(ValidationError):
        VehicleManifest.model_validate(payload)


def test_negative_dimensions_are_rejected(manifest_payload: dict) -> None:
    payload = copy.deepcopy(manifest_payload)
    payload["dimensionsMm"]["length"] = -1
    with pytest.raises(ValidationError):
        VehicleManifest.model_validate(payload)


def test_print_configuration_defaults() -> None:
    config = PrintConfiguration()
    assert config.unit == "mm"
    assert config.dpi == 150
    assert config.panelSelectionMode == "all"


def test_print_configuration_rejects_out_of_range_values() -> None:
    with pytest.raises(ValidationError):
        PrintConfiguration(dpi=5000)
    with pytest.raises(ValidationError):
        PrintConfiguration(scale=0)
