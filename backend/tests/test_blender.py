from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path

import pytest

from wrapforge_backend import blender


def test_parse_version_and_compatibility() -> None:
    output = blender.CapturedOutput(True, "Blender 5.2.0 LTS\n", "")
    assert blender.parse_version(output) == "5.2.0 LTS"
    assert blender.compatibility("5.2.0 LTS") == "tested"
    assert blender.compatibility("4.5.0 LTS") == "untested"
    assert blender.compatibility("3.6.0") == "unsupported"


def test_candidates_are_unique() -> None:
    candidates = blender.candidates("")
    keys = {(item.program, tuple(item.prefix_args)) for item in candidates}
    assert len(keys) == len(candidates)


def test_blender_discovery() -> None:
    result = blender.discover("")
    if not result["found"]:
        pytest.skip(f"Blender is not available: {result['message']}")
    assert result["version"]
    assert result["compatibility"] in {"tested", "untested", "unsupported"}


@pytest.mark.blender
def test_blender_probe() -> None:
    result = blender.probe("")
    if not result.get("available"):
        pytest.skip(f"Blender probe unavailable: {result.get('message')}")
    assert result["engines"]
    assert result["version"]


@pytest.mark.blender
def test_blender_render_integration(repo_root: Path) -> None:
    found = blender.find("")
    if found is None:
        pytest.skip("Blender is not available")
    model = repo_root / "assets" / "sample-vehicle" / "model" / "vehicle.glb"
    texture = repo_root / "assets" / "sample-vehicle" / "previews" / "thumbnail.png"
    assert model.is_file()
    assert texture.is_file()
    home = Path.home()
    work = Path(tempfile.mkdtemp(prefix="wrapforge-render-test-", dir=str(home)))
    try:
        config_path = work / "config.json"
        output_path = work / "render.png"
        metadata_path = work / "render.json"
        config = {
            "job_id": "pytest-render",
            "model_path": str(model),
            "output_path": str(output_path),
            "metadata_path": str(metadata_path),
            "engine": "BLENDER_EEVEE",
            "width": 640,
            "height": 400,
            "samples": 8,
            "camera": "three-quarter-front",
            "transparent_background": False,
            "include_floor": True,
            "paint_color": "#d9552f",
            "panel_textures": [
                {
                    "panel_id": "hood",
                    "object_name": "WF_hood",
                    "path": str(texture),
                }
            ],
        }
        config_path.write_text(json.dumps(config), encoding="utf-8")
        result = blender.render(config_path, timeout=600)
        assert result["success"] is True, result["stderrTail"]
        assert output_path.is_file()
        assert output_path.stat().st_size > 1000
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        assert metadata["engine"] == "BLENDER_EEVEE"
        assert metadata["resolution"] == {"width": 640, "height": 400}
        assert metadata["durationMs"] > 0
    finally:
        shutil.rmtree(work, ignore_errors=True)


@pytest.mark.blender
def test_blender_render_with_body_texture(repo_root: Path) -> None:
    """The livery atlas replaces the model's base-colour textures."""
    found = blender.find("")
    if found is None:
        pytest.skip("Blender is not available")
    model = repo_root / "assets" / "sample-vehicle" / "model" / "vehicle.glb"
    texture = repo_root / "assets" / "sample-vehicle" / "previews" / "thumbnail.png"
    assert model.is_file()
    assert texture.is_file()
    work = Path(tempfile.mkdtemp(prefix="wrapforge-body-texture-", dir=str(Path.home())))
    try:
        config_path = work / "config.json"
        output_path = work / "render.png"
        metadata_path = work / "render.json"
        config = {
            "job_id": "pytest-body-texture",
            "model_path": str(model),
            "output_path": str(output_path),
            "metadata_path": str(metadata_path),
            "engine": "BLENDER_EEVEE",
            "width": 480,
            "height": 320,
            "samples": 4,
            "camera": "three-quarter-front",
            "transparent_background": True,
            "include_floor": False,
            "paint_color": "#d9552f",
            "panel_textures": [],
            "body_texture_path": str(texture),
        }
        config_path.write_text(json.dumps(config), encoding="utf-8")
        result = blender.render(config_path, timeout=600)
        assert result["success"] is True, result["stderrTail"]
        assert output_path.is_file()
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        assert metadata["resolution"] == {"width": 480, "height": 320}
    finally:
        shutil.rmtree(work, ignore_errors=True)
