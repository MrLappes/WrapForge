#!/usr/bin/env python3
"""Headless Blender renderer for WrapForge.

Invoked as:

    blender -b --factory-startup --python render_scene.py -- config.json

The config is written by the Rust process manager. Progress is reported on
stdout as `WF_PROGRESS {json}` lines; the process manager forwards them to the
UI. No code from imported assets is executed: glTF import only reads geometry
and materials.
"""

from __future__ import annotations

import json
import math
import os
import sys
import time
import traceback
from typing import Any

import bpy
from mathutils import Matrix, Vector


def emit_progress(stage: str, percent: float, message: str) -> None:
    print(
        "WF_PROGRESS "
        + json.dumps(
            {"stage": stage, "percent": max(0.0, min(100.0, percent)), "message": message}
        ),
        flush=True,
    )


def load_config() -> dict[str, Any]:
    argv = sys.argv
    if "--" in argv:
        args = argv[argv.index("--") + 1 :]
    else:
        args = []
    if not args:
        raise SystemExit("render_scene.py requires a config JSON path after --")
    with open(args[0], "r", encoding="utf-8") as handle:
        return json.load(handle)


def srgb_to_linear(channel: float) -> float:
    if channel <= 0.04045:
        return channel / 12.92
    return ((channel + 0.055) / 1.055) ** 2.4


def hex_to_linear(color: str) -> tuple[float, float, float, float]:
    value = color.lstrip("#")
    if len(value) != 6:
        return (0.5, 0.1, 0.05, 1.0)
    r = int(value[0:2], 16) / 255.0
    g = int(value[2:4], 16) / 255.0
    b = int(value[4:6], 16) / 255.0
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)


def load_texture(path: str) -> bpy.types.Image:
    """Loads a project texture and flips it into Blender's image convention.

    WrapForge writes textures the way glTF reads them (row 0 of the PNG is
    v = 1). Blender stores images bottom-up, so the rows are flipped here to
    keep artwork and livery readable instead of mirrored across the vehicle.
    """
    image = bpy.data.images.load(path, check_existing=False)
    try:
        image.colorspace_settings.name = "sRGB"
    except Exception:
        pass
    try:
        import numpy as np

        width, height = image.size
        if width and height:
            buffer = np.empty(width * height * 4, dtype=np.float32)
            image.pixels.foreach_get(buffer)
            buffer = buffer.reshape(height, width, 4)[::-1]
            image.pixels.foreach_set(buffer.ravel())
            image.update()
    except Exception as error:  # pragma: no cover - defensive
        print(f"WF_WARNING could not flip {path}: {error}", file=sys.stderr)
    return image


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    roughness: float = 0.42,
    metallic: float = 0.05,
    image_path: str | None = None,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf is None:
        return material
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if image_path:
        image = load_texture(image_path)
        texture = nodes.new("ShaderNodeTexImage")
        texture.image = image
        texture.location = (-420, 240)
        links.new(texture.outputs["Color"], bsdf.inputs["Base Color"])
        if "Alpha" in texture.outputs and "Alpha" in bsdf.inputs:
            links.new(texture.outputs["Alpha"], bsdf.inputs["Alpha"])
            try:
                material.blend_method = "HASHED"
            except Exception:
                pass
        bsdf.inputs["Metallic"].default_value = 0.0
        bsdf.inputs["Roughness"].default_value = 0.36
    return material


def find_mesh(object_name: str, panel_id: str) -> bpy.types.Object | None:
    direct = bpy.data.objects.get(object_name)
    if direct is not None and direct.type == "MESH":
        return direct
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        if obj.name == object_name or obj.name.startswith(object_name + "."):
            return obj
        if panel_id and (
            obj.get("panelId") == panel_id or obj.get("wf_panel_id") == panel_id
        ):
            return obj
    return None


def panel_meshes() -> list[bpy.types.Object]:
    result = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        if obj.name.startswith("WF_") or obj.get("wrapable") is True:
            result.append(obj)
    return result


def apply_materials(config: dict[str, Any]) -> None:
    paint = hex_to_linear(config.get("paint_color", "#d9552f"))
    textures = {entry["panel_id"]: entry for entry in config.get("panel_textures", [])}
    painted = 0
    textured = 0
    for panel in panel_meshes():
        panel_id = str(panel.get("panelId") or panel.name.removeprefix("WF_"))
        entry = textures.get(panel_id)
        if entry is None:
            for candidate_id, candidate in textures.items():
                if find_mesh(candidate["object_name"], candidate_id) is panel:
                    entry = candidate
                    break
        if entry is not None:
            material = make_material(
                f"WF_Render_{panel_id}",
                (1.0, 1.0, 1.0, 1.0),
                image_path=entry["path"],
            )
            textured += 1
        else:
            material = make_material(f"WF_Paint_{panel_id}", paint, roughness=0.34, metallic=0.08)
            painted += 1
        panel.data.materials.clear()
        panel.data.materials.append(material)
    emit_progress(
        "Materials",
        32,
        f"Applied {textured} artwork texture(s) and paint to {painted} panel(s).",
    )


def apply_body_texture(path: str) -> int:
    """Replaces the model's base-colour textures with the composed livery atlas."""
    image = load_texture(path)
    replaced = 0
    for material in bpy.data.materials:
        if not material.use_nodes or material.node_tree is None:
            continue
        # Panel-based assets keep their own rendered artwork.
        if material.name.startswith("WF_Render_"):
            continue
        for node in material.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image is not None:
                node.image = image
                replaced += 1
    return replaced


def car_bounds() -> tuple[Vector, Vector]:
    minimum = Vector((math.inf, math.inf, math.inf))
    maximum = Vector((-math.inf, -math.inf, -math.inf))
    found = False
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        if obj.name.startswith("STAGE_"):
            continue
        found = True
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            minimum.x = min(minimum.x, world.x)
            minimum.y = min(minimum.y, world.y)
            minimum.z = min(minimum.z, world.z)
            maximum.x = max(maximum.x, world.x)
            maximum.y = max(maximum.y, world.y)
            maximum.z = max(maximum.z, world.z)
    if not found:
        return Vector((-2.0, -1.0, 0.0)), Vector((2.0, 1.0, 1.4))
    return minimum, maximum


# Radius of the bundled sample vehicle, used to keep exposure model-independent.
REFERENCE_RADIUS = 2.45
# Imported models arrive in arbitrary units; the stage assumes metres.
TARGET_LENGTH_M = 4.35

CAMERA_DIRECTIONS = {
    "three-quarter-front": Vector((1.05, 1.0, 0.48)),
    "three-quarter-rear": Vector((-1.05, 1.0, 0.48)),
    "front": Vector((1.0, 0.0, 0.25)),
    "rear": Vector((-1.0, 0.0, 0.25)),
    "left": Vector((0.0, -1.0, 0.22)),
    "right": Vector((0.0, 1.0, 0.22)),
    "top": Vector((0.0, 0.0, 1.0)),
}


def rescale_imported_model() -> tuple[float, list[str]]:
    """Scales metre-implausible imports so lights, clip planes and shadows hold."""
    minimum, maximum = car_bounds()
    size = maximum - minimum
    longest = max(size.x, size.y, size.z)
    if longest <= 1e-6:
        return 1.0, ["The model has no measurable size; scale was not adjusted."]
    factor = TARGET_LENGTH_M / longest
    if 0.5 <= factor <= 2.0:
        return 1.0, []
    for obj in bpy.data.objects:
        if obj.parent is None:
            obj.matrix_world = Matrix.Scale(factor, 4) @ obj.matrix_world
    bpy.context.view_layer.update()
    return factor, [
        f"The model measured {longest:.2f} units; WrapForge scaled it by {factor:.4f} to about {TARGET_LENGTH_M} m before rendering."
    ]


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def build_stage(config: dict[str, Any]) -> tuple[bpy.types.Object, str | None, list[str]]:
    warnings: list[str] = []
    scene = bpy.context.scene
    minimum, maximum = car_bounds()
    center = (minimum + maximum) / 2.0
    size = maximum - minimum
    radius = max(size.length / 2.0, 1.0)

    world = bpy.data.worlds.new("WF_World")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background:
        background.inputs[0].default_value = (0.016, 0.020, 0.026, 1.0)
        background.inputs[1].default_value = 0.22

    if config.get("include_floor", True):
        bpy.ops.mesh.primitive_plane_add(size=max(30.0, radius * 20.0), location=(0, 0, minimum.z))
        floor = bpy.context.active_object
        if floor:
            floor.name = "STAGE_floor"
            floor_material = make_material("STAGE_Floor", (0.035, 0.038, 0.044, 1.0), roughness=0.32, metallic=0.02)
            floor.data.materials.append(floor_material)

    def add_area(name: str, location: Vector, energy: float, size_light: float) -> None:
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.active_object
        if not light:
            return
        light.name = name
        light.data.energy = energy
        light.data.size = size_light
        look_at(light, center)

    # Area-light energy falls off with distance, so it has to follow the model
    # scale. REFERENCE_RADIUS is the bundled sample vehicle, where the base
    # energies were tuned; imported models keep the same relative exposure.
    light_scale = max(0.02, (radius / REFERENCE_RADIUS) ** 2)
    add_area(
        "STAGE_key",
        center + Vector((radius * 2.0, -radius * 2.2, radius * 2.4)),
        660.0 * light_scale,
        radius * 2.6,
    )
    add_area(
        "STAGE_fill",
        center + Vector((-radius * 2.2, radius * 1.8, radius * 1.6)),
        210.0 * light_scale,
        radius * 3.2,
    )
    add_area(
        "STAGE_rim",
        center + Vector((-radius * 1.2, -radius * 2.4, radius * 1.0)),
        380.0 * light_scale,
        radius * 2.2,
    )

    bpy.ops.object.camera_add()
    camera = bpy.context.active_object
    if camera is None:
        raise RuntimeError("Could not create a camera.")
    camera.name = "STAGE_camera"
    camera.data.lens = 58
    camera.data.sensor_width = 36
    camera.data.clip_start = max(0.001, radius / 5000.0)
    camera.data.clip_end = max(100.0, radius * 200.0)
    preset = config.get("camera", "three-quarter-front")
    direction = CAMERA_DIRECTIONS.get(preset, CAMERA_DIRECTIONS["three-quarter-front"]).normalized()
    angle = camera.data.angle
    distance = radius / math.tan(angle / 2.0) * 1.28
    camera.location = center + direction * distance
    look_at(camera, center)
    scene.camera = camera

    if preset == "top":
        warnings.append("Top view uses a straight-down camera; reflections are dominated by the world colour.")

    return camera, preset, warnings


def configure_render(config: dict[str, Any]) -> tuple[str, str | None, list[str]]:
    warnings: list[str] = []
    scene = bpy.context.scene
    requested = config.get("engine", "BLENDER_EEVEE")
    engines = [item.identifier for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    engine = requested if requested in engines else "BLENDER_EEVEE"
    if engine != requested:
        warnings.append(
            f"Requested engine {requested} is unavailable; Blender used {engine} instead."
        )
    scene.render.engine = engine

    width = int(config.get("width", 1600))
    height = int(config.get("height", 1000))
    samples = int(config.get("samples", 32))
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_depth = "8"
    transparent = bool(config.get("transparent_background", False))
    scene.render.film_transparent = transparent
    scene.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    scene.render.filepath = config["output_path"]

    device: str | None = None
    if engine == "CYCLES":
        try:
            scene.cycles.samples = samples
            scene.cycles.device = "CPU"
            device = "CPU"
        except Exception as error:
            warnings.append(f"Cycles settings could not be fully applied: {error}")
    elif engine == "BLENDER_EEVEE":
        try:
            scene.eevee.taa_render_samples = samples
        except Exception:
            try:
                scene.eevee.taa_samples = samples
            except Exception as error:
                warnings.append(f"Eevee sample count could not be set: {error}")
    elif engine == "BLENDER_WORKBENCH":
        warnings.append("Workbench is a diagnostics engine and does not use project materials fully.")

    try:
        scene.view_settings.view_transform = "AgX"
    except Exception:
        pass
    try:
        looks = [item.identifier for item in scene.view_settings.bl_rna.properties["look"].enum_items]
        if "AgX - Medium High Contrast" in looks:
            scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass

    if transparent:
        warnings.append("Transparent background requested; the floor is still rendered if enabled.")
    return engine, device, warnings


def main() -> int:
    config = load_config()
    started = time.time()
    emit_progress("Starting", 2, "Reset Blender to a deterministic empty scene.")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"

    model_path = config["model_path"]
    if not os.path.isfile(model_path):
        raise FileNotFoundError(f"Vehicle model not found: {model_path}")
    emit_progress("Import", 14, "Importing the vehicle glTF model.")
    bpy.ops.import_scene.gltf(filepath=model_path)

    scale_factor, scale_warnings = rescale_imported_model()
    if scale_factor != 1.0:
        emit_progress(
            "Import",
            18,
            f"Rescaled the model by {scale_factor:.4f} so the studio stage stays in metres.",
        )

    emit_progress("Materials", 26, "Assigning panel materials from the project.")
    apply_materials(config)

    body_texture = config.get("body_texture_path")
    if body_texture:
        if os.path.isfile(body_texture):
            replaced = apply_body_texture(body_texture)
            width, height = 0, 0
            for image in bpy.data.images:
                if image.filepath == body_texture:
                    width, height = image.size[0], image.size[1]
            emit_progress(
                "Materials",
                30,
                f"Applied the livery texture ({width}x{height}) to {replaced} material(s).",
            )
        else:
            emit_progress("Materials", 30, "The livery texture file was missing; using the model textures.")

    emit_progress("Stage", 40, "Building studio lighting and camera.")
    _camera, preset, stage_warnings = build_stage(config)
    engine, device, render_warnings = configure_render(config)
    warnings = scale_warnings + stage_warnings + render_warnings

    emit_progress("Rendering", 50, f"Rendering with {engine}.")
    bpy.ops.render.render(write_still=True)
    emit_progress("Encoding", 92, "Blender finished the render; writing metadata.")

    scene = bpy.context.scene
    metadata = {
        "jobId": config.get("job_id"),
        "engine": engine,
        "engineRequested": config.get("engine"),
        "device": device,
        "blenderVersion": bpy.app.version_string,
        "width": scene.render.resolution_x,
        "height": scene.render.resolution_y,
        "resolution": {
            "width": scene.render.resolution_x,
            "height": scene.render.resolution_y,
        },
        "camera": preset,
        "durationMs": int((time.time() - started) * 1000),
        "warnings": warnings,
    }
    with open(config["metadata_path"], "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)
        handle.write("\n")
    emit_progress("Complete", 100, "Render complete.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as error:  # noqa: BLE001 - report the real failure to the manager
        print(f"WF_RENDER_ERROR {error}", flush=True)
        traceback.print_exc()
        raise SystemExit(1)
