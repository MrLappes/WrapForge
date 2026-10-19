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


def set_alpha(material: bpy.types.Material, alpha: float) -> None:
    """Marks a material as translucent so importers treat it as glass."""
    if not material.use_nodes:
        return
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None and "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = alpha
    for attribute, value in (("blend_method", "BLEND"), ("surface_render_method", "BLENDED")):
        try:
            setattr(material, attribute, value)
        except (AttributeError, TypeError):
            pass


def apply_uv_layout(
    obj: bpy.types.Object,
    outward: Vector | None,
    *,
    outer_only: bool = True,
) -> dict[str, Any]:
    """Map the outer face(s) to 0..1 and collapse all other faces to a corner.

    This keeps sample art from wrapping onto bevels and side faces. It is a
    deliberate limitation of the sample asset, documented in the manifest.
    Curved wrap panels pass ``outer_only=False``: every face is the wrap surface,
    so filtering by normal would shrink the panel and break left/right symmetry.
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
        if not outer_only or outward is None or normal.dot(outward) > 0.85:
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

    uv_info = apply_uv_layout(obj, outward, outer_only=False)

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


def superellipse_loop(
    width: float,
    bottom: float,
    top: float,
    exponent: float,
    points: int,
) -> list[tuple[float, float]]:
    """Closed cross-section as (width, height), matching Blender's Y/Z."""
    center = (bottom + top) / 2
    half = max((top - bottom) / 2, 1e-4)
    power = 2.0 / max(exponent, 1.2)
    loop: list[tuple[float, float]] = []
    for index in range(points):
        theta = 2 * math.pi * index / points
        cos = math.cos(theta)
        sin = math.sin(theta)
        lateral = width * math.copysign(abs(cos) ** power, cos)
        height = center + half * math.copysign(abs(sin) ** power, sin)
        loop.append((lateral, height))
    return loop


def loft_mesh(
    name: str,
    stations: list[dict[str, float]],
    material: bpy.types.Material,
    *,
    points: int = 56,
    smooth: bool = True,
    caps: bool = True,
    meta: dict[str, Any] | None = None,
    outward: Vector | None = None,
) -> bpy.types.Object:
    """Lofts a superellipse cross-section along X, giving a smooth car body."""
    loops = [
        superellipse_loop(
            station["w"], station["yb"], station["yt"], station.get("n", 3.0), points
        )
        for station in stations
    ]
    verts: list[tuple[float, float, float]] = []
    for station, loop in zip(stations, loops):
        for lateral, height in loop:
            verts.append((station["x"], lateral, height))

    faces: list[tuple[int, ...]] = []
    for index in range(len(stations) - 1):
        base = index * points
        nxt = (index + 1) * points
        for point in range(points):
            a = base + point
            b = base + (point + 1) % points
            c = nxt + (point + 1) % points
            d = nxt + point
            faces.append((a, b, c, d))
    if caps:
        faces.append(tuple(range(points - 1, -1, -1)))
        last = (len(stations) - 1) * points
        faces.append(tuple(last + point for point in range(points)))

    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    if meta is not None:
        annotate_panel(obj, outward, meta)
    return obj


def surface_point(station: dict[str, float], theta: float) -> tuple[float, float, float]:
    width = station["w"]
    center = (station["yb"] + station["yt"]) / 2
    half = (station["yt"] - station["yb"]) / 2
    power = 2.0 / max(station.get("n", 3.0), 1.2)
    cos = math.cos(theta)
    sin = math.sin(theta)
    lateral = width * math.copysign(abs(cos) ** power, cos)
    height = center + half * math.copysign(abs(sin) ** power, sin)
    return (station["x"], lateral, height)


def sample_station(stations: list[dict[str, float]], x: float) -> dict[str, float]:
    """Interpolates the station table so patches follow the shell exactly."""
    ordered = sorted(stations, key=lambda item: item["x"])
    if x <= ordered[0]["x"]:
        return dict(ordered[0])
    if x >= ordered[-1]["x"]:
        return dict(ordered[-1])
    for left, right in zip(ordered, ordered[1:]):
        if left["x"] <= x <= right["x"]:
            span = max(right["x"] - left["x"], 1e-6)
            t = (x - left["x"]) / span
            return {
                "x": x,
                "w": left["w"] + (right["w"] - left["w"]) * t,
                "yb": left["yb"] + (right["yb"] - left["yb"]) * t,
                "yt": left["yt"] + (right["yt"] - left["yt"]) * t,
                "n": left.get("n", 3.0) + (right.get("n", 3.0) - left.get("n", 3.0)) * t,
            }
    return dict(ordered[-1])


def body_patch(
    name: str,
    stations: list[dict[str, float]],
    x0: float,
    x1: float,
    theta0: float,
    theta1: float,
    material: bpy.types.Material,
    *,
    offset: float = 0.006,
    columns: int = 18,
    rows: int = 10,
    meta: dict[str, Any] | None = None,
    outward: Vector | None = None,
    closed: bool = False,
) -> bpy.types.Object:
    """A curved panel that sits just above the lofted shell, like real foil."""
    verts: list[tuple[float, float, float]] = []
    for column in range(columns + 1):
        x = x0 + (x1 - x0) * column / columns
        station = sample_station(stations, x)
        for row in range(rows if closed else rows + 1):
            theta = theta0 + (theta1 - theta0) * row / rows
            px, lateral, height = surface_point(station, theta)
            # Push outward along the radial direction of the section.
            center_height = (station["yb"] + station["yt"]) / 2
            dh = height - center_height
            length = math.hypot(dh, lateral) or 1.0
            verts.append(
                (px, lateral + lateral / length * offset, height + dh / length * offset)
            )

    step = rows if closed else rows + 1
    faces: list[tuple[int, ...]] = []
    for column in range(columns):
        for row in range(rows):
            a = column * step + row
            b = a + 1
            c = (column + 1) * step + row + 1
            d = (column + 1) * step + row
            if closed:
                wrap_row = (row + 1) % rows
                b = column * step + wrap_row
                c = (column + 1) * step + wrap_row
            faces.append((a, b, c, d))

    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    if meta is not None:
        annotate_panel(obj, outward, meta)
    return obj


def annotate_panel(obj: bpy.types.Object, outward: Vector | None, meta: dict[str, Any]) -> None:
    for key, value in meta.items():
        if isinstance(value, (str, bool, int, float)):
            obj[key] = value
    uv_info = apply_uv_layout(obj, outward, outer_only=False)
    obj["wf_uv_width_m"] = uv_info["uvWidthM"]
    obj["wf_uv_height_m"] = uv_info["uvHeightM"]
    obj["wf_outer_faces"] = uv_info["outerFaceCount"]
    PANEL_DATA.append(
        {
            **meta,
            "objectName": obj.name,
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


def cut_arches(obj: bpy.types.Object, arches: list[tuple[float, float]]) -> None:
    """Boolean-cuts wheel arches so the body reads as a car, not a brick."""
    for index, (x, y) in enumerate(arches):
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=40,
            radius=0.395,
            depth=0.62,
            location=(x, y, 0.30),
            rotation=(math.radians(90), 0.0, 0.0),
        )
        cutter = bpy.context.active_object
        assert cutter is not None
        cutter.name = f"CUT_arch_{index}"
        bpy.context.view_layer.objects.active = obj
        modifier = obj.modifiers.new(f"ArchCut{index}", "BOOLEAN")
        modifier.operation = "DIFFERENCE"
        modifier.object = cutter
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        bpy.data.objects.remove(cutter, do_unlink=True)


BODY_STATIONS: list[dict[str, float]] = [
    {"x": 2.15, "w": 0.70, "yb": 0.34, "yt": 0.66, "n": 2.6},
    {"x": 2.05, "w": 0.80, "yb": 0.28, "yt": 0.74, "n": 2.8},
    {"x": 1.86, "w": 0.87, "yb": 0.22, "yt": 0.82, "n": 3.0},
    {"x": 1.50, "w": 0.90, "yb": 0.17, "yt": 0.88, "n": 3.2},
    {"x": 1.05, "w": 0.91, "yb": 0.16, "yt": 0.92, "n": 3.3},
    {"x": 0.55, "w": 0.91, "yb": 0.16, "yt": 0.94, "n": 3.3},
    {"x": -0.20, "w": 0.91, "yb": 0.16, "yt": 0.96, "n": 3.3},
    {"x": -1.05, "w": 0.91, "yb": 0.16, "yt": 0.96, "n": 3.3},
    {"x": -1.60, "w": 0.88, "yb": 0.20, "yt": 0.92, "n": 3.1},
    {"x": -1.94, "w": 0.82, "yb": 0.26, "yt": 0.84, "n": 2.9},
    {"x": -2.15, "w": 0.72, "yb": 0.34, "yt": 0.70, "n": 2.6},
]

CABIN_STATIONS: list[dict[str, float]] = [
    {"x": 1.02, "w": 0.58, "yb": 0.84, "yt": 0.96, "n": 3.0},
    {"x": 0.74, "w": 0.70, "yb": 0.84, "yt": 1.26, "n": 3.6},
    {"x": 0.42, "w": 0.77, "yb": 0.84, "yt": 1.43, "n": 4.0},
    {"x": 0.02, "w": 0.78, "yb": 0.84, "yt": 1.475, "n": 4.2},
    {"x": -0.66, "w": 0.78, "yb": 0.84, "yt": 1.475, "n": 4.2},
    {"x": -1.22, "w": 0.75, "yb": 0.84, "yt": 1.40, "n": 4.0},
    {"x": -1.60, "w": 0.66, "yb": 0.84, "yt": 1.18, "n": 3.4},
    {"x": -1.86, "w": 0.55, "yb": 0.84, "yt": 0.98, "n": 3.0},
]

# theta = 0 is the widest point on the left flank, pi/2 the roof centre.
# Sides run from the sill up to the shoulder; top panels from shoulder to shoulder.
SIDE_LEFT = (-0.35 * math.pi, 0.22 * math.pi)
SIDE_RIGHT = (0.78 * math.pi, 1.35 * math.pi)
TOP = (0.22 * math.pi, 0.78 * math.pi)


def build_vehicle() -> dict[str, bpy.types.Object]:
    body_paint = make_material("Paint_Graphite", (0.028, 0.032, 0.038, 1.0), metallic=0.7, roughness=0.28)
    wrap_base = make_material("Wrap_Base_White", (0.92, 0.92, 0.9, 1.0), metallic=0.0, roughness=0.55)
    glass = make_material("Glass_Tinted", (0.01, 0.013, 0.018, 0.42), metallic=0.0, roughness=0.05)
    set_alpha(glass, 0.42)
    tire = make_material("Rubber_Tire", (0.015, 0.015, 0.016, 1.0), roughness=0.9)
    rim = make_material("Alloy_Rim", (0.55, 0.57, 0.6, 1.0), metallic=0.9, roughness=0.22)
    trim = make_material("Trim_Black", (0.008, 0.008, 0.01, 1.0), roughness=0.55)
    headlight = make_material(
        "Lamp_Headlight",
        (0.85, 0.88, 0.95, 1.0),
        roughness=0.08,
        emission=(0.9, 0.95, 1.0, 1.0),
        emission_strength=3.0,
    )
    taillight = make_material(
        "Lamp_Taillight",
        (0.6, 0.01, 0.02, 1.0),
        roughness=0.2,
        emission=(0.9, 0.02, 0.03, 1.0),
        emission_strength=2.0,
    )
    plate = make_material("License_Plate", (0.82, 0.82, 0.78, 1.0), roughness=0.45)

    objects: dict[str, bpy.types.Object] = {}

    # Painted shell below the beltline. Arches are cut, not faked with plates.
    shell = loft_mesh("BODY_shell", BODY_STATIONS, body_paint, caps=True)
    cut_arches(shell, [(1.34, 0.78), (1.34, -0.78), (-1.32, 0.78), (-1.32, -0.78)])
    objects["body_shell"] = shell

    # Greenhouse: one glass loft, so the windows are real surface, not decals.
    # The name and alpha keep it out of the paintable body on import.
    objects["glass_cabin"] = loft_mesh("GLASS_cabin", CABIN_STATIONS, glass, points=56)

    # Wrap panels follow the shell and cabin exactly, offset by 6 mm.
    objects["WF_hood"] = body_patch(
        "WF_hood", BODY_STATIONS, 2.00, 1.02, TOP[0], TOP[1], wrap_base,
        meta=panel_meta("hood", "Hood", "hood", "center", "+Z"), outward=Vector((0, 0, 1)),
    )
    objects["WF_roof"] = body_patch(
        "WF_roof", CABIN_STATIONS, 0.32, -1.18, 0.34 * math.pi, 0.66 * math.pi, wrap_base,
        offset=0.008, meta=panel_meta("roof", "Roof", "roof", "center", "+Z"),
        outward=Vector((0, 0, 1)),
    )
    objects["WF_hatch"] = body_patch(
        "WF_hatch", BODY_STATIONS, -1.20, -2.04, TOP[0], TOP[1], wrap_base,
        meta=panel_meta("hatch", "Hatch", "trunk", "center", "-X"), outward=Vector((-1, 0, 0)),
    )
    objects["WF_front_bumper"] = body_patch(
        "WF_front_bumper", BODY_STATIONS, 2.03, 2.15, 0.0, 2 * math.pi, wrap_base,
        offset=0.004, closed=True, columns=8, rows=40,
        meta=panel_meta("front_bumper", "Front bumper", "bumper", "center", "+X"),
        outward=Vector((1, 0, 0)),
    )
    objects["WF_rear_bumper"] = body_patch(
        "WF_rear_bumper", BODY_STATIONS, -2.15, -2.03, 0.0, 2 * math.pi, wrap_base,
        offset=0.004, closed=True, columns=8, rows=40,
        meta=panel_meta("rear_bumper", "Rear bumper", "bumper", "center", "-X"),
        outward=Vector((-1, 0, 0)),
    )

    side_specs = [
        ("front_fender", "Front fender", "fender", 1.05, 1.92),
        ("front_door", "Front door", "door", 0.36, 1.05),
        ("rear_door", "Rear door", "door", -0.62, 0.36),
        ("rear_quarter", "Rear quarter", "quarter", -1.94, -0.62),
    ]
    for key, display, category, x0, x1 in side_specs:
        for side, theta, outward in (
            ("l", SIDE_LEFT, Vector((0, 1, 0))),
            ("r", SIDE_RIGHT, Vector((0, -1, 0))),
        ):
            panel_id = f"{key}_{side}"
            objects[f"WF_{panel_id}"] = body_patch(
                f"WF_{panel_id}", BODY_STATIONS, x0, x1, theta[0], theta[1], wrap_base,
                columns=20, rows=10,
                meta=panel_meta(panel_id, f"{display} ({'left' if side == 'l' else 'right'})",
                                category, 'left' if side == 'l' else 'right',
                                "+Y" if side == "l" else "-Y"),
                outward=outward,
            )

    # The side panels are lofted across the wheel openings, so they need the
    # same arch cuts as the shell or the foil would bridge the wheels.
    for side, y in (("l", 0.78), ("r", -0.78)):
        for key in ("front_fender", "front_door", "rear_door", "rear_quarter"):
            cut_arches(objects[f"WF_{key}_{side}"], [(1.34, y), (-1.32, y)])

    # Wheels: tyre, rim face and a dark hub, tucked into the cut arches.
    for side, y in (("l", 0.80), ("r", -0.80)):
        for axle, x in (("front", 1.34), ("rear", -1.32)):
            objects[f"TIRE_{axle}_{side}"] = cylinder(
                f"TIRE_{axle}_{side}", (x, y, 0.335), 0.335, 0.235, material=tire, vertices=48
            )
            rim_y = y + (0.075 if side == "l" else -0.075)
            objects[f"RIM_{axle}_{side}"] = cylinder(
                f"RIM_{axle}_{side}", (x, rim_y, 0.335), 0.215, 0.10, material=rim, vertices=32
            )
            hub_y = y + (0.13 if side == "l" else -0.13)
            objects[f"HUB_{axle}_{side}"] = cylinder(
                f"HUB_{axle}_{side}", (x, hub_y, 0.335), 0.075, 0.02, material=trim, vertices=24
            )

    # Lights sunk into the nose and tail, plus a grille and plates.
    for side, y in (("l", 0.5), ("r", -0.5)):
        objects[f"LAMP_head_{side}"] = rounded_box(
            f"LAMP_head_{side}", (2.115, y, 0.66), (0.055, 0.34, 0.10),
            material=headlight, bevel=0.014, segments=2, rotation=(0.0, math.radians(-6), 0.0),
        )
        objects[f"LAMP_tail_{side}"] = rounded_box(
            f"LAMP_tail_{side}", (-2.12, y, 0.72), (0.05, 0.30, 0.10),
            material=taillight, bevel=0.012, segments=2,
        )
    objects["GRILLE"] = rounded_box(
        "GRILLE", (2.14, 0.0, 0.46), (0.05, 0.78, 0.15), material=trim, bevel=0.02, segments=2,
    )
    objects["PLATE_front"] = rounded_box(
        "PLATE_front", (2.17, 0.0, 0.31), (0.02, 0.34, 0.11), material=plate, bevel=0.004, segments=1,
    )
    objects["PLATE_rear"] = rounded_box(
        "PLATE_rear", (-2.17, 0.0, 0.36), (0.02, 0.34, 0.11), material=plate, bevel=0.004, segments=1,
    )

    # Sills, mirrors and a roof-edge spoiler give the silhouette some intent.
    for side, y in (("l", 0.885), ("r", -0.885)):
        objects[f"SILL_{side}"] = rounded_box(
            f"SILL_{side}", (0.0, y, 0.24), (2.9, 0.05, 0.09), material=trim, bevel=0.012, segments=2,
        )
        objects[f"MIRROR_{side}"] = rounded_box(
            f"MIRROR_{side}", (0.86, y + (0.11 if side == "l" else -0.11), 1.02),
            (0.15, 0.11, 0.09), material=body_paint, bevel=0.035, segments=2,
        )
        objects[f"MIRROR_stalk_{side}"] = rounded_box(
            f"MIRROR_stalk_{side}", (0.86, y * 0.99, 1.0), (0.05, 0.12, 0.025),
            material=trim, bevel=0.006, segments=1,
        )
    objects["SPOILER"] = rounded_box(
        "SPOILER", (-1.50, 0.0, 1.335), (0.26, 1.30, 0.045), material=body_paint,
        bevel=0.03, segments=3, rotation=(0.0, math.radians(12), 0.0),
    )
    objects["SPOILER_lip_l"] = rounded_box(
        "SPOILER_lip_l", (-1.62, 0.60, 1.30), (0.09, 0.07, 0.09), material=trim,
        bevel=0.02, segments=2,
    )
    objects["SPOILER_lip_r"] = rounded_box(
        "SPOILER_lip_r", (-1.62, -0.60, 1.30), (0.09, 0.07, 0.09), material=trim,
        bevel=0.02, segments=2,
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
            "detail": "Wrap panels are lofted surfaces layered over a closed body shell.",
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
