"""Blender discovery and process adapter.

No shell strings are used. Every subprocess receives an argument array.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from .paths import home_dir

TESTED_MAJOR = 5
SUPPORTED_MAJOR = 4


@dataclass
class BlenderInvocation:
    program: str
    prefix_args: list[str] = field(default_factory=list)
    display: str = ""
    via: str = "path"
    flatpak: bool = False


@dataclass
class CapturedOutput:
    success: bool
    stdout: str
    stderr: str


def candidates(configured: str = "") -> list[BlenderInvocation]:
    result: list[BlenderInvocation] = []

    def add_path(value: str, via: str) -> None:
        path = Path(value).expanduser()
        if path.is_file():
            result.append(
                BlenderInvocation(
                    program=str(path),
                    display=str(path),
                    via=via,
                )
            )

    if configured.strip():
        add_path(configured.strip(), "configured")
    env_value = os.environ.get("WRAPFORGE_BLENDER", "")
    if env_value:
        add_path(env_value, "environment")
    which = shutil.which("blender")
    if which:
        add_path(which, "path")
    known = [
        "/usr/bin/blender",
        "/usr/local/bin/blender",
        "/opt/blender/blender",
        "/snap/bin/blender",
        "/var/lib/flatpak/exports/bin/org.blender.Blender",
    ]
    home = home_dir()
    if home:
        known.extend(
            [
                str(home / ".local/bin/blender"),
                str(home / ".local/share/flatpak/exports/bin/org.blender.Blender"),
            ]
        )
    for path in known:
        add_path(path, "known-path")
    flatpak = shutil.which("flatpak")
    if flatpak:
        result.append(
            BlenderInvocation(
                program=flatpak,
                prefix_args=["run", "--command=blender", "org.blender.Blender"],
                display="flatpak run --command=blender org.blender.Blender",
                via="flatpak",
                flatpak=True,
            )
        )
    seen: set[tuple[str, tuple[str, ...]]] = set()
    unique: list[BlenderInvocation] = []
    for item in result:
        key = (item.program, tuple(item.prefix_args))
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def run_version(invocation: BlenderInvocation, timeout: float = 25.0) -> CapturedOutput | None:
    try:
        completed = subprocess.run(
            [invocation.program, *invocation.prefix_args, "--version"],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            env={**os.environ, "PYTHONUNBUFFERED": "1"},
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    return CapturedOutput(
        success=completed.returncode == 0,
        stdout=completed.stdout,
        stderr=completed.stderr,
    )


def parse_version(output: CapturedOutput) -> str | None:
    text = output.stdout if output.stdout.strip() else output.stderr
    for line in text.splitlines():
        if line.startswith("Blender "):
            value = line[len("Blender ") :].strip()
            if value:
                return value
    return None


def compatibility(version: str) -> str:
    digits = "".join(character if character.isdigit() else " " for character in version).split()
    if not digits:
        return "unknown"
    major = int(digits[0])
    if major == TESTED_MAJOR:
        return "tested"
    if major == SUPPORTED_MAJOR:
        return "untested"
    return "unsupported"


def find(configured: str = "") -> tuple[BlenderInvocation, str] | None:
    for invocation in candidates(configured):
        output = run_version(invocation)
        if output and output.success:
            version = parse_version(output)
            if version:
                return invocation, version
    return None


def discover(configured: str = "") -> dict[str, object]:
    found = find(configured)
    if found is None:
        return {
            "found": False,
            "version": None,
            "compatibility": "unknown",
            "via": "none",
            "message": "Blender was not found via PATH, known paths, environment, or Flatpak.",
        }
    invocation, version = found
    return {
        "found": True,
        "executable": invocation.display,
        "version": version,
        "compatibility": compatibility(version),
        "via": invocation.via,
        "message": f"Blender {version} detected via {invocation.via}.",
    }


PROBE_SCRIPT = """
import json, os, platform, sys
import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
engines = [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
gpu = {}
try:
    import gpu as gpu_module
    gpu = {
        "vendor": gpu_module.platform.vendor_get(),
        "renderer": gpu_module.platform.renderer_get(),
        "version": gpu_module.platform.version_get(),
    }
except Exception as error:
    gpu = {"error": str(error)}
cycles = {}
try:
    addon = bpy.context.preferences.addons.get("cycles")
    if addon is None:
        cycles = {"available": False}
    else:
        prefs = addon.preferences
        prefs.get_devices()
        cycles = {
            "available": True,
            "computeDeviceType": prefs.compute_device_type,
            "devices": [{"name": d.name, "type": d.type, "use": d.use} for d in prefs.devices],
        }
except Exception as error:
    cycles = {"available": False, "error": str(error)}
print("WF_PROBE " + json.dumps({
    "available": True,
    "version": bpy.app.version_string,
    "python": sys.version.split()[0],
    "engines": engines,
    "cpu": {"processor": platform.processor(), "count": os.cpu_count(), "machine": platform.machine()},
    "gpu": gpu,
    "cycles": cycles,
}), flush=True)
"""


def probe(configured: str = "", timeout: float = 120.0) -> dict[str, object]:
    found = find(configured)
    if found is None:
        return {"available": False, "message": "Blender was not found."}
    invocation, version = found
    cache = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "wrapforge"
    cache.mkdir(parents=True, exist_ok=True)
    script_path = cache / "wrapforge-probe.py"
    script_path.write_text(PROBE_SCRIPT, encoding="utf-8")
    try:
        completed = subprocess.run(
            [
                invocation.program,
                *invocation.prefix_args,
                "-b",
                "--factory-startup",
                "--python",
                str(script_path),
            ],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            env={**os.environ, "PYTHONUNBUFFERED": "1"},
        )
    except subprocess.TimeoutExpired:
        return {"available": False, "message": "Blender probe timed out."}
    finally:
        script_path.unlink(missing_ok=True)
    for line in completed.stdout.splitlines():
        if line.startswith("WF_PROBE "):
            try:
                result = json.loads(line[len("WF_PROBE ") :])
            except json.JSONDecodeError:
                continue
            result["executable"] = invocation.display
            result["versionReportedByProbe"] = version
            result["via"] = invocation.via
            return result
    return {
        "available": False,
        "message": "Blender did not return a probe payload.",
        "stderr": "\n".join(completed.stderr.splitlines()[-20:]),
    }


def default_render_script() -> Path:
    return Path(__file__).resolve().parents[2] / "src-tauri" / "resources" / "blender" / "render_scene.py"


def render(
    config_path: Path | str,
    *,
    configured: str = "",
    script_path: Path | str | None = None,
    timeout: float = 1800.0,
) -> dict[str, object]:
    found = find(configured)
    if found is None:
        raise RuntimeError("Blender was not found")
    invocation, version = found
    script = Path(script_path) if script_path else default_render_script()
    if not script.is_file():
        raise FileNotFoundError(f"Render script not found: {script}")
    config = Path(config_path).resolve()
    if not config.is_file():
        raise FileNotFoundError(f"Render config not found: {config}")
    completed = subprocess.run(
        [
            invocation.program,
            *invocation.prefix_args,
            "-b",
            "--factory-startup",
            "--python",
            str(script),
            "--",
            str(config),
        ],
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
        env={**os.environ, "PYTHONUNBUFFERED": "1"},
    )
    metadata_path = None
    try:
        payload = json.loads(config.read_text(encoding="utf-8"))
        metadata_path = payload.get("metadata_path")
        output_path = payload.get("output_path")
    except (OSError, json.JSONDecodeError):
        output_path = None
    metadata = None
    if metadata_path and Path(metadata_path).is_file():
        metadata = json.loads(Path(metadata_path).read_text(encoding="utf-8"))
    return {
        "success": completed.returncode == 0,
        "returncode": completed.returncode,
        "outputPath": output_path,
        "metadataPath": metadata_path,
        "metadata": metadata,
        "blenderVersion": version,
        "stdoutTail": completed.stdout.splitlines()[-25:],
        "stderrTail": completed.stderr.splitlines()[-25:],
    }
