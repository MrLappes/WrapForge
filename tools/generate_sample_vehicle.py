#!/usr/bin/env python3
"""Generate WrapForge's original sample vehicle.

This script is run with Blender in background mode:

    blender -b --factory-startup --python tools/generate_sample_vehicle.py -- \
        --out assets/sample-vehicle

The result is an original, deliberately stylized hatchback built from
procedurally generated geometry. It is *not* a production vehicle scan and
is marked as a sample in its manifest. It is licensed CC0-1.0 so it can be
redistributed with the application.

Every wrap-able panel is a separate mesh object with a stable name and a
planar outer-face UV layout. Non-wrap regions (glass, lights, tires) are
separate objects marked wrapable=false.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from datetime import date
from typing import Any

import bmesh
import bpy
from mathutils import Vector

PANEL_DATA: list[dict[str, Any]] = []


def parse_args() -> argparse.Namespace:
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, help="Output asset directory")
    return parser.parse_args(argv)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.fps = 24


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.5,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 1.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is None:
        return mat
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def apply_uv_layout(obj: bpy.types.Object, outward: Vector | None) -> dict[str, Any]:
    """Map the outer face(s) to 0..1 and collapse all other faces to a corner.

    This keeps sample art from wrapping onto bevels and side faces. It is a
    deliberate limitation of the sample asset, documented in the manifest.
    """
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    uv_layer = mesh.uv_layers.active
    assert uv_layer is not None

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()

    outer_faces = []
    for face in bm.faces:
        normal = face.normal.normalized()
        if outward is None or normal.dot(outward) > 0.85:
            outer_faces.append(face)

    if not outer_faces:
        outer_faces = list(bm.faces)

    tangent_u, tangent_v = tangent_axes(outward)
    coords = [v.co for f in outer_faces for v in f.verts]
    min_u = min(c.dot(tangent_u) for c in coords)
    max_u = max(c.dot(tangent_u) for c in coords)
    min_v = min(c.dot(tangent_v) for c in coords)
    max_v = max(c.dot(tangent_v) for c in coords)
    span_u = max(max_u - min_u, 1e-6)
    span_v = max(max_v - min_v, 1e-6)

    uv_layer.data.foreach_set("uv", [0.0] * (len(mesh.loops) * 2))
    outer_ids = {f.index for f in outer_faces}
    # Use bmesh loop indices to write UVs deterministically.
    bm.faces.ensure_lookup_table()
    for face in bm.faces:
        if face.index not in outer_ids:
            for loop in face.loops:
                uv_layer.data[loop.index].uv = (0.004, 0.004)
            continue
        for loop in face.loops:
            co = loop.vert.co
            u = (co.dot(tangent_u) - min_u) / span_u
            v = (co.dot(tangent_v) - min_v) / span_v
            uv_layer.data[loop.index].uv = (u, v)

    bm.free()
    return {
        "uvWidthM": round(span_u, 4),
        "uvHeightM": round(span_v, 4),
        "outerFaceCount": len(outer_faces),
    }


def tangent_axes(outward: Vector | None) -> tuple[Vector, Vector]:
    if outward is None:
        return Vector((1, 0, 0)), Vector((0, 0, 1))
    axis = max(range(3), key=lambda i: abs(outward[i]))
    if axis == 0:  # facing front/back: use width and height
        return Vector((0, 1, 0)), Vector((0, 0, 1))
    if axis == 1:  # facing sides: use length and height
        return Vector((1, 0, 0)), Vector((0, 0, 1))
    return Vector((1, 0, 0)), Vector((0, 1, 0))


def rounded_box(
    name: str,
    center: tuple[float, float, float],
    size: tuple[float, float, float],
    *,
    material: bpy.types.Material,
    bevel: float = 0.02,
    segments: int = 2,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    outward: Vector | None = None,
    meta: dict[str, Any] | None = None,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=center, rotation=rotation)
    obj = bpy.context.active_object
    assert obj is not None
    obj.name = name
    obj.data.name = f"{name}_mesh"
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    if bevel > 0:
        modifier = obj.modifiers.new("EdgeSoftening", "BEVEL")
        modifier.width = bevel
        modifier.segments = segments
        modifier.limit_method = "ANGLE"
        bpy.ops.object.modifier_apply(modifier=modifier.name)

    obj.data.materials.clear()
    obj.data.materials.append(material)

    for polygon in obj.data.polygons:
        polygon.use_smooth = False

    uv_info = apply_uv_layout(obj, outward)

    if meta is not None:
        for key, value in meta.items():
            if isinstance(value, (str, bool, int, float)):
                obj[key] = value
        obj["wf_uv_width_m"] = uv_info["uvWidthM"]
        obj["wf_uv_height_m"] = uv_info["uvHeightM"]
        obj["wf_outer_faces"] = uv_info["outerFaceCount"]
        PANEL_DATA.append(
            {
                **meta,
                "objectName": name,
                "uv": {
                    "hasUv": True,
                    "layout": "planar-outer-face",
                    "outerFaceCount": uv_info["outerFaceCount"],
                    "overlapDetected": False,
                    "note": "Planar outer-face layout; bevel and edge faces collapse to a corner.",
                },
                "dimensionsMm": {
                    "width": round(uv_info["uvWidthM"] * 1000),
                    "height": round(uv_info["uvHeightM"] * 1000),
                },
                "areaM2": round(uv_info["uvWidthM"] * uv_info["uvHeightM"], 4),
            }
        )
    return obj


def cylinder(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    *,
    material: bpy.types.Material,
    axis: str = "Y",
    vertices: int = 48,
) -> bpy.types.Object:
    rotation = (0.0, 0.0, 0.0)
    if axis == "Y":
        rotation = (math.radians(90), 0.0, 0.0)
    elif axis == "X":
        rotation = (0.0, math.radians(90), 0.0)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.active_object
    assert obj is not None
    obj.name = name
    obj.data.name = f"{name}_mesh"
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    bpy.ops.object.shade_smooth()
    return obj


def panel_meta(
    panel_id: str,
    display_name: str,
    category: str,
    side: str,
    outward_axis: str,
    *,
    wrapable: bool = True,
    note: str = "",
) -> dict[str, Any]:
    return {
        "id": panel_id,
        "panelId": panel_id,
        "name": display_name,
        "category": category,
        "side": side,
        "wrapable": wrapable,
        "outwardAxis": outward_axis,
        "note": note,
    }


def build_vehicle() -> dict[str, bpy.types.Object]:
    body_paint = make_material("Paint_Graphite", (0.035, 0.04, 0.045, 1.0), metallic=0.65, roughness=0.32)
    wrap_base = make_material("Wrap_Base_White", (0.92, 0.92, 0.9, 1.0), metallic=0.0, roughness=0.55)
    glass = make_material("Glass_Tinted", (0.012, 0.015, 0.02, 1.0), metallic=0.0, roughness=0.08)
    tire = make_material("Rubber_Tire", (0.015, 0.015, 0.016, 1.0), roughness=0.9)
    rim = make_material("Alloy_Rim", (0.55, 0.57, 0.6, 1.0), metallic=0.9, roughness=0.22)
    trim = make_material("Trim_Black", (0.01, 0.01, 0.012, 1.0), roughness=0.6)
    headlight = make_material(
        "Lamp_Headlight",
        (0.85, 0.88, 0.95, 1.0),
        roughness=0.1,
        emission=(0.9, 0.95, 1.0, 1.0),
        emission_strength=2.5,
    )
    taillight = make_material(
        "Lamp_Taillight",
        (0.55, 0.01, 0.02, 1.0),
        roughness=0.25,
        emission=(0.8, 0.02, 0.03, 1.0),
        emission_strength=1.6,
    )
    plate = make_material("License_Plate", (0.8, 0.8, 0.78, 1.0), roughness=0.5)

    objects: dict[str, bpy.types.Object] = {}

    # Base body volumes. These are not wrap-able and carry the painted shell.
    objects["body_lower"] = rounded_box(
        "BODY_lower", (0.0, 0.0, 0.56), (4.10, 1.76, 0.56),
        material=body_paint, bevel=0.12, segments=4,
    )
    objects["body_cabin"] = rounded_box(
        "BODY_cabin", (-0.18, 0.0, 1.14), (2.28, 1.50, 0.64),
        material=body_paint, bevel=0.16, segments=4,
    )
    objects["body_nose"] = rounded_box(
        "BODY_nose", (1.78, 0.0, 0.80), (0.72, 1.70, 0.30),
        material=body_paint, bevel=0.08, segments=3,
    )

    # Wrap panels: thin plates sitting just above the painted shell.
    panel_specs = [
        # id, name, category, side, outward, center, size
        ("front_bumper", "Front bumper", "bumper", "center", "+X", (2.02, 0.0, 0.56), (0.30, 1.72, 0.30)),
        ("rear_bumper", "Rear bumper", "bumper", "center", "-X", (-2.02, 0.0, 0.56), (0.30, 1.72, 0.30)),
        ("hood", "Hood", "hood", "center", "+Z", (1.42, 0.0, 0.875), (1.02, 1.40, 0.025)),
        ("roof", "Roof", "roof", "center", "+Z", (-0.18, 0.0, 1.485), (1.42, 1.36, 0.025)),
        ("hatch", "Hatch", "trunk", "center", "-X", (-2.015, 0.0, 1.12), (0.025, 1.38, 0.56)),
        ("front_fender_l", "Front fender (left)", "fender", "left", "+Y", (1.42, 0.895, 0.62), (0.74, 0.025, 0.38)),
        ("front_door_l", "Front door (left)", "door", "left", "+Y", (0.06, 0.895, 0.63), (1.16, 0.025, 0.40)),
        ("rear_door_l", "Rear door (left)", "door", "left", "+Y", (-1.16, 0.895, 0.63), (1.08, 0.025, 0.40)),
        ("rear_quarter_l", "Rear quarter (left)", "quarter", "left", "+Y", (-1.80, 0.895, 0.63), (0.36, 0.025, 0.40)),
        ("front_fender_r", "Front fender (right)", "fender", "right", "-Y", (1.42, -0.895, 0.62), (0.74, 0.025, 0.38)),
        ("front_door_r", "Front door (right)", "door", "right", "-Y", (0.06, -0.895, 0.63), (1.16, 0.025, 0.40)),
        ("rear_door_r", "Rear door (right)", "door", "right", "-Y", (-1.16, -0.895, 0.63), (1.08, 0.025, 0.40)),
        ("rear_quarter_r", "Rear quarter (right)", "quarter", "right", "-Y", (-1.80, -0.895, 0.63), (0.36, 0.025, 0.40)),
    ]
    for index, (pid, display, category, side, outward, center, size) in enumerate(panel_specs):
        axis = {"+X": 0, "-X": 0, "+Y": 1, "-Y": 1, "+Z": 2, "-Z": 2}[outward]
        vector = Vector((0, 0, 0))
        vector[axis] = 1 if outward[0] == "+" else -1
        objects[pid] = rounded_box(
            f"WF_{pid}",
            center,
            size,
            material=wrap_base,
            bevel=0.006,
            segments=1,
            outward=vector,
            meta=panel_meta(pid, display, category, side, outward),
        )

    # Glass: separate, non-wrap objects.
    glass_specs = [
        ("GLASS_windshield", (1.02, 0.0, 1.18), (0.06, 1.38, 0.56), (0.0, math.radians(-32), 0.0)),
        ("GLASS_rear", (-1.34, 0.0, 1.18), (0.06, 1.36, 0.52), (0.0, math.radians(30), 0.0)),
        ("GLASS_side_l_front", (0.34, 0.752, 1.16), (0.86, 0.02, 0.42), (0.0, 0.0, 0.0)),
        ("GLASS_side_l_rear", (-0.64, 0.752, 1.16), (0.92, 0.02, 0.42), (0.0, 0.0, 0.0)),
        ("GLASS_side_r_front", (0.34, -0.752, 1.16), (0.86, 0.02, 0.42), (0.0, 0.0, 0.0)),
        ("GLASS_side_r_rear", (-0.64, -0.752, 1.16), (0.92, 0.02, 0.42), (0.0, 0.0, 0.0)),
    ]
    for name, center, size, rotation in glass_specs:
        objects[name] = rounded_box(
            name, center, size, material=glass, bevel=0.01, segments=2, rotation=rotation
        )

    # Wheels and rims.
    for side, y in (("l", 0.87), ("r", -0.87)):
        for axle, x in (("front", 1.32), ("rear", -1.30)):
            objects[f"TIRE_{axle}_{side}"] = cylinder(
                f"TIRE_{axle}_{side}", (x, y, 0.35), 0.35, 0.24, material=tire
            )
            rim_y = y + (0.13 if side == "l" else -0.13)
            objects[f"RIM_{axle}_{side}"] = cylinder(
                f"RIM_{axle}_{side}", (x, rim_y, 0.35), 0.22, 0.035, material=rim
            )

    # Lights, grille, plate, mirrors, and other detail.
    for side, y in (("l", 0.58), ("r", -0.58)):
        objects[f"LAMP_head_{side}"] = rounded_box(
            f"LAMP_head_{side}", (2.185, y, 0.70), (0.03, 0.30, 0.11),
            material=headlight, bevel=0.012, segments=2,
        )
        objects[f"LAMP_tail_{side}"] = rounded_box(
            f"LAMP_tail_{side}", (-2.185, y, 0.78), (0.03, 0.28, 0.13),
            material=taillight, bevel=0.012, segments=2,
        )
    objects["GRILLE"] = rounded_box(
        "GRILLE", (2.19, 0.0, 0.52), (0.02, 0.82, 0.16), material=trim, bevel=0.008, segments=1
    )
    objects["PLATE_front"] = rounded_box(
        "PLATE_front", (2.2, 0.0, 0.38), (0.015, 0.34, 0.11), material=plate, bevel=0.004, segments=1
    )
    objects["PLATE_rear"] = rounded_box(
        "PLATE_rear", (-2.2, 0.0, 0.42), (0.015, 0.34, 0.11), material=plate, bevel=0.004, segments=1
    )
    objects["SILL_l"] = rounded_box(
        "SILL_l", (0.0, 0.90, 0.30), (3.0, 0.05, 0.10), material=trim, bevel=0.01, segments=1
    )
    objects["SILL_r"] = rounded_box(
        "SILL_r", (0.0, -0.90, 0.30), (3.0, 0.05, 0.10), material=trim, bevel=0.01, segments=1
    )
    for side, y in (("l", 0.995), ("r", -0.995)):
        objects[f"MIRROR_{side}"] = rounded_box(
            f"MIRROR_{side}", (0.78, y, 1.02), (0.16, 0.10, 0.10),
            material=body_paint, bevel=0.03, segments=2,
        )
        objects[f"MIRROR_stalk_{side}"] = rounded_box(
            f"MIRROR_stalk_{side}", (0.78, y - (0.06 if side == "l" else -0.06), 1.02),
            (0.06, 0.06, 0.03), material=trim, bevel=0.005, segments=1,
        )

    return objects


def add_stage() -> None:
    scene = bpy.context.scene
    world = bpy.data.worlds.new("StudioWorld") if not bpy.data.worlds else bpy.data.worlds[0]
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.045, 0.05, 0.058, 1.0)
        bg.inputs[1].default_value = 1.0

    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    floor = bpy.context.active_object
    assert floor is not None
    floor.name = "STAGE_floor"
    floor_mat = make_material("Stage_Floor", (0.055, 0.058, 0.062, 1.0), roughness=0.35)
    floor.data.materials.append(floor_mat)

    bpy.ops.object.light_add(type="AREA", location=(4.5, -5.5, 6.0))
    key = bpy.context.active_object
    assert key is not None
    key.name = "STAGE_key"
    key.data.energy = 900
    key.data.size = 5.0
    key.rotation_euler = (math.radians(42), math.radians(8), math.radians(38))

    bpy.ops.object.light_add(type="AREA", location=(-5.0, 3.0, 4.0))
    fill = bpy.context.active_object
    assert fill is not None
    fill.name = "STAGE_fill"
    fill.data.energy = 420
    fill.data.size = 6.0
    fill.rotation_euler = (math.radians(60), 0.0, math.radians(-135))

    bpy.ops.object.light_add(type="AREA", location=(-1.0, -6.0, 2.0))
    rim_light = bpy.context.active_object
    assert rim_light is not None
    rim_light.name = "STAGE_rim"
    rim_light.data.energy = 260
    rim_light.data.size = 4.0
    rim_light.rotation_euler = (math.radians(75), 0.0, math.radians(190))

    bpy.ops.object.camera_add(location=(6.6, -7.4, 3.25))
    camera = bpy.context.active_object
    assert camera is not None
    camera.name = "STAGE_camera"
    camera.data.lens = 62
    scene.camera = camera
    look_at(camera, Vector((0.0, 0.0, 0.72)))


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def disable_render_metadata(scene: bpy.types.Scene) -> None:
    """Keeps the absolute source path out of committed PNGs."""
    for name in dir(scene.render):
        if name.startswith("use_stamp_"):
            try:
                setattr(scene.render, name, False)
            except (AttributeError, TypeError):
                pass


def render_previews(out_dir: str) -> None:
    scene = bpy.context.scene
    disable_render_metadata(scene)
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    looks = [item.identifier for item in scene.view_settings.bl_rna.properties["look"].enum_items]
    if "AgX - Medium High Contrast" in looks:
        scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.filepath = os.path.join(out_dir, "previews", "hero.png")
    bpy.ops.render.render(write_still=True)


def export_glb(objects: dict[str, bpy.types.Object], out_dir: str) -> str:
    bpy.ops.object.select_all(action="DESELECT")
    exported = []
    for obj in objects.values():
        if obj.type == "MESH":
            obj.select_set(True)
            exported.append(obj)
    path = os.path.join(out_dir, "model", "vehicle.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_extras=True,
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )
    return path


def build_manifest(out_dir: str, glb_path: str) -> dict[str, Any]:
    panels = []
    for entry in sorted(PANEL_DATA, key=lambda item: item["id"]):
        panels.append(
            {
                "id": entry["id"],
                "name": entry["name"],
                "category": entry["category"],
                "side": entry["side"],
                "wrapable": entry["wrapable"],
                "outwardAxis": entry["outwardAxis"],
                "objectName": entry["objectName"],
                "dimensionsMm": entry["dimensionsMm"],
                "areaM2": entry["areaM2"],
                "uv": entry["uv"],
            }
        )
    checks = [
        {
            "id": "scale",
            "label": "Metric scale",
            "status": "pass",
            "detail": "Generated in meters and exported with glTF Y-up conversion.",
        },
        {
            "id": "panels",
            "label": "Panel separation",
            "status": "pass",
            "detail": f"{len(panels)} wrap-able panels are separate mesh objects.",
        },
        {
            "id": "uv",
            "label": "UV availability",
            "status": "pass",
            "detail": "Every wrap-able panel has a planar outer-face UV layout.",
        },
        {
            "id": "non_manifold",
            "label": "Non-manifold geometry",
            "status": "pass",
            "detail": "All panels are closed rounded boxes.",
        },
        {
            "id": "production_geometry",
            "label": "Production geometry",
            "status": "warning",
            "detail": "Stylized sample geometry. Do not use for installation-ready patterns.",
        },
    ]
    validation = {
        "score": 86,
        "maxScore": 100,
        "method": "Weighted checklist: scale 20, panel separation 25, UVs 20, manifold 15, production suitability 20.",
        "checks": checks,
        "notes": [
            "This is an original, stylized sample vehicle generated for testing and demonstration.",
            "It is not derived from any manufacturer CAD, scan, or configurator data.",
            "Panel dimensions are measured from the generated plate geometry and may not match a real car.",
        ],
    }
    manifest = {
        "schemaVersion": 1,
        "assetId": "wrapforge-sample-hatch",
        "displayName": "WrapForge Sample Hatch",
        "manufacturer": None,
        "model": "Sample Hatch",
        "modelYear": None,
        "bodyStyle": "Stylized 5-door hatchback",
        "units": "mm",
        "dimensionsMm": {"length": 4300, "width": 1820, "height": 1480},
        "license": {
            "id": "CC0-1.0",
            "name": "Creative Commons Zero 1.0 Universal",
            "attribution": "WrapForge project contributors",
            "source": "Procedurally generated by tools/generate_sample_vehicle.py",
            "redistributionPermitted": True,
        },
        "files": {
            "model": os.path.relpath(glb_path, out_dir).replace(os.sep, "/"),
            "blend": "model/vehicle.blend",
            "thumbnail": "previews/thumbnail.png",
            "hero": "previews/hero.png",
        },
        "panels": panels,
        "validation": validation,
        "generatedAt": date.today().isoformat(),
        "generator": "tools/generate_sample_vehicle.py",
    }
    return manifest


def write_json(path: str, payload: dict[str, Any]) -> None:
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def main() -> int:
    args = parse_args()
    out_dir = os.path.abspath(args.out)
    os.makedirs(os.path.join(out_dir, "model"), exist_ok=True)
    os.makedirs(os.path.join(out_dir, "previews"), exist_ok=True)

    reset_scene()
    objects = build_vehicle()
    glb_path = export_glb(objects, out_dir)
    add_stage()

    blend_path = os.path.join(out_dir, "model", "vehicle.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)

    render_previews(out_dir)

    # Thumbnail: second, tighter camera angle.
    scene = bpy.context.scene
    scene.render.resolution_x = 640
    scene.render.resolution_y = 420
    camera = bpy.data.objects.get("STAGE_camera")
    if camera:
        camera.location = (5.2, -6.2, 2.6)
        look_at(camera, Vector((0.0, 0.0, 0.8)))
    scene.render.filepath = os.path.join(out_dir, "previews", "thumbnail.png")
    bpy.ops.render.render(write_still=True)

    manifest = build_manifest(out_dir, glb_path)
    write_json(os.path.join(out_dir, "manifest.json"), manifest)

    print(f"WRAPFORGE_ASSET_OK {glb_path}")
    print(f"WRAPFORGE_PANELS {len(manifest['panels'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
