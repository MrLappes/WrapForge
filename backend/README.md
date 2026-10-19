# WrapForge Python backend

This package is the independently testable backend layer for WrapForge. It
provides:

- Pydantic models for vehicle manifests and print configuration.
- Print planning and validation (physical sizes, bleed, DPI, safe margins,
  raster limits, draft/ready labelling).
- Asset manifest validation, including path safety and license metadata.
- Blender discovery (including Flatpak) and a no-shell subprocess adapter.
- A JSON-over-stdio CLI for CI and automation.

## Install

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
.venv/bin/pytest -q
```

Blender integration tests are marked `blender` and skip when no compatible
Blender is installed. Run them explicitly with:

```bash
.venv/bin/pytest -q -m blender
```

## CLI

```bash
echo '{"command":"discover-blender"}' | .venv/bin/wrapforge-backend
```

The desktop application uses the Rust process manager for interactive render
jobs. The Python CLI exists so the same validation logic and Blender adapter
can be exercised without the UI, and to keep backend behavior testable.
