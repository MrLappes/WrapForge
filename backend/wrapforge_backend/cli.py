"""JSON-over-stdio process adapter.

Usage:
    echo '{"command":"discover-blender"}' | wrapforge-backend

Every command returns one JSON object on stdout:

    {"ok": true, "command": "...", "result": {...}}
    {"ok": false, "command": "...", "error": "..."}

Commands:
    validate-manifest  {manifest, assetRoot?}
    plan-print         {manifest, config, placements?, artworks?}
    discover-blender   {configuredPath?}
    probe-blender      {configuredPath?}
    render             {configPath, blenderPath?, scriptPath?, timeoutSeconds?}

The adapter never accepts shell strings. It is intended for CI, automation,
and backend verification; the desktop app uses the Rust process manager for
interactive render jobs.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from pydantic import ValidationError

from .asset_validation import validate_manifest
from .blender import discover, probe, render
from .models import (
    ArtworkHint,
    PlacementHint,
    PrintConfiguration,
    VehicleManifest,
)
from .print_layout import validate_export


def execute(payload: dict[str, object]) -> object:
    command = payload.get("command")
    if command == "validate-manifest":
        manifest = VehicleManifest.model_validate(payload.get("manifest"))
        root_value = payload.get("assetRoot")
        root = Path(root_value) if isinstance(root_value, str) else None
        return validate_manifest(manifest, root).model_dump()
    if command == "plan-print":
        manifest = VehicleManifest.model_validate(payload.get("manifest"))
        config = PrintConfiguration.model_validate(payload.get("config") or {})
        placements = [
            PlacementHint.model_validate(item)
            for item in (payload.get("placements") or [])
        ]
        artworks = [
            ArtworkHint.model_validate(item) for item in (payload.get("artworks") or [])
        ]
        return validate_export(manifest, config, placements, artworks).model_dump()
    if command == "discover-blender":
        configured = payload.get("configuredPath")
        return discover(configured if isinstance(configured, str) else "")
    if command == "probe-blender":
        configured = payload.get("configuredPath")
        return probe(configured if isinstance(configured, str) else "")
    if command == "render":
        config_value = payload.get("configPath")
        if not isinstance(config_value, str):
            raise ValueError("render requires configPath")
        configured = payload.get("blenderPath")
        script = payload.get("scriptPath")
        timeout = payload.get("timeoutSeconds")
        return render(
            Path(config_value),
            configured=configured if isinstance(configured, str) else "",
            script_path=Path(script) if isinstance(script, str) else None,
            timeout=float(timeout) if isinstance(timeout, (int, float)) else 1800.0,
        )
    raise ValueError(f"Unknown command: {command!r}")


def main() -> int:
    raw = sys.stdin.read()
    command = None
    try:
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("Input must be a JSON object")
        command = payload.get("command")
        result = execute(payload)
        print(json.dumps({"ok": True, "command": command, "result": result}, default=str))
        return 0
    except (json.JSONDecodeError, ValueError, ValidationError, OSError, RuntimeError) as error:
        print(
            json.dumps(
                {
                    "ok": False,
                    "command": command,
                    "error": str(error),
                    "errorType": type(error).__name__,
                },
                default=str,
            )
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
