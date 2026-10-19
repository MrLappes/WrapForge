from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


def run_cli(payload: dict, cwd: Path) -> tuple[int, dict]:
    completed = subprocess.run(
        [sys.executable, "-m", "wrapforge_backend.cli"],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        cwd=cwd,
        check=False,
    )
    return completed.returncode, json.loads(completed.stdout)


def test_discover_blender_cli(repo_root: Path) -> None:
    code, output = run_cli({"command": "discover-blender"}, repo_root / "backend")
    assert code == 0
    assert output["ok"] is True
    assert output["command"] == "discover-blender"
    assert "found" in output["result"]


def test_validate_manifest_cli(repo_root: Path, manifest_payload: dict) -> None:
    code, output = run_cli(
        {
            "command": "validate-manifest",
            "manifest": manifest_payload,
            "assetRoot": str(repo_root / "assets" / "sample-vehicle"),
        },
        repo_root / "backend",
    )
    assert code == 0
    assert output["result"]["valid"] is True
    assert output["result"]["wrapablePanels"] == 13


def test_plan_print_cli(repo_root: Path, manifest_payload: dict) -> None:
    panel_id = "hood"
    payload = {
        "command": "plan-print",
        "manifest": manifest_payload,
        "config": {
            "dpi": 100,
            "bleedMm": 3,
            "safeMarginMm": 5,
            "panelSelectionMode": "custom",
            "panelIds": [panel_id],
        },
        "placements": [
            {
                "id": "p1",
                "panelId": panel_id,
                "artworkId": "a1",
                "u": 0.5,
                "v": 0.5,
                "widthFraction": 0.5,
            }
        ],
        "artworks": [{"id": "a1", "pixelWidth": 4000, "pixelHeight": 2000}],
    }
    code, output = run_cli(payload, repo_root / "backend")
    assert code == 0
    assert output["ok"] is True
    assert output["result"]["label"] == "print-ready"
    assert output["result"]["panels"][0]["panelId"] == panel_id


def test_unknown_command_returns_error(repo_root: Path) -> None:
    code, output = run_cli({"command": "not-a-command"}, repo_root / "backend")
    assert code == 1
    assert output["ok"] is False
    assert "Unknown command" in output["error"]
