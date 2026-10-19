from __future__ import annotations

import json
from pathlib import Path

import pytest

from wrapforge_backend.models import VehicleManifest

REPO_ROOT = Path(__file__).resolve().parents[2]
ASSET_ROOT = REPO_ROOT / "assets" / "sample-vehicle"
MANIFEST_PATH = ASSET_ROOT / "manifest.json"


@pytest.fixture(scope="session")
def repo_root() -> Path:
    return REPO_ROOT


@pytest.fixture(scope="session")
def manifest_payload() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


@pytest.fixture()
def manifest(manifest_payload: dict) -> VehicleManifest:
    return VehicleManifest.model_validate(manifest_payload)


@pytest.fixture()
def asset_root() -> Path:
    return ASSET_ROOT
