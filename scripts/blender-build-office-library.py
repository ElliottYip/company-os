"""Build the Company OS procedural clay office asset library.

Usage:
  Blender --background --factory-startup --python scripts/blender-build-office-library.py -- \
    asset-spec.json output-glb-directory output.blend manifest.json catalog-preview.png
"""

import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


args = sys.argv[sys.argv.index("--") + 1 :]
if len(args) != 5:
    raise SystemExit("Expected spec, GLB directory, .blend, manifest, and preview paths.")
spec_path, output_dir, blend_path, manifest_path, preview_path = map(lambda value: Path(value).resolve(), args)
output_dir.mkdir(parents=True, exist_ok=True)
blend_path.parent.mkdir(parents=True, exist_ok=True)
source_dir = blend_path.parent / "sources"
source_dir.mkdir(parents=True, exist_ok=True)
manifest_path.parent.mkdir(parents=True, exist_ok=True)
preview_path.parent.mkdir(parents=True, exist_ok=True)
spec = json.loads(spec_path.read_text(encoding="utf-8"))

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.users == 0:
        bpy.data.collections.remove(collection)


COLORS = {
    "cream": (0.93, 0.88, 0.78, 1),
    "coral": (0.82, 0.30, 0.15, 1),
    "yellow": (0.78, 0.59, 0.20, 1),
    "blue": (0.12, 0.27, 0.40, 1),
    "mint": (0.43, 0.55, 0.36, 1),
    "wood": (0.64, 0.40, 0.21, 1),
    "charcoal": (0.08, 0.08, 0.07, 1),
    "white": (0.98, 0.95, 0.88, 1),
    "green": (0.24, 0.44, 0.18, 1),
    "glass": (0.55, 0.72, 0.72, 0.28),
}


def clay_material(name, color):
    material = bpy.data.materials.get(f"COS_Clay_{name}") or bpy.data.materials.new(f"COS_Clay_{name}")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = 0.68 if name != "glass" else 0.22
    if name == "glass":
        transmission = principled.inputs.get("Transmission Weight")
        if transmission:
            transmission.default_value = 0.72
        principled.inputs["Alpha"].default_value = color[3]
        material.surface_render_method = "DITHERED"
    if not nodes.get("COS_Clay_Noise"):
        texcoord = nodes.new("ShaderNodeTexCoord")
        noise = nodes.new("ShaderNodeTexNoise")
        noise.name = "COS_Clay_Noise"
        noise.inputs["Scale"].default_value = 6.5
        noise.inputs["Detail"].default_value = 3.0
        noise.inputs["Roughness"].default_value = 0.72
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.18
        bump.inputs["Distance"].default_value = 0.035
        links.new(texcoord.outputs["Generated"], noise.inputs["Vector"])
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    return material


MATERIALS = {name: clay_material(name, color) for name, color in COLORS.items()}


def attach(obj, root, material=None):
    obj.parent = root
    if material:
        obj.data.materials.append(material)
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def box(root, name, size, location=(0, 0, 0), material="cream", bevel=None):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = tuple(value / 2 for value in size)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("COS_Rounded", "BEVEL")
    modifier.width = min(size) * 0.16 if bevel is None else bevel
    modifier.segments = 3
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return attach(obj, root, MATERIALS[material])


def cylinder(root, name, radius, depth, location=(0, 0, 0), material="cream", vertices=24, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    modifier = obj.modifiers.new("COS_Rounded", "BEVEL")
    modifier.width = min(radius * 0.22, depth * 0.12)
    modifier.segments = 3
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return attach(obj, root, MATERIALS[material])


def sphere(root, name, scale, location=(0, 0, 0), material="cream"):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return attach(obj, root, MATERIALS[material])


def torus(root, name, major, minor, location=(0, 0, 0), material="cream", rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=24, minor_segments=10, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    return attach(obj, root, MATERIALS[material])


def anchor(root, name, location=(0, 0, 0)):
    item = bpy.data.objects.new(name, None)
    item.empty_display_type = "PLAIN_AXES"
    item.empty_display_size = 0.1
    bpy.context.collection.objects.link(item)
    item.parent = root
    item.location = location
    item["company_os_anchor"] = True
    return item


def four_legs(root, width, depth, height, material="wood", radius=0.055):
    for index, (x, y) in enumerate(((-width, -depth), (-width, depth), (width, -depth), (width, depth))):
        cylinder(root, f"leg-{index + 1}", radius, height, (x, y, height / 2), material)


def build_asset(asset):
    asset_id = asset["id"]
    form = asset["form"]
    sx, sy, sz = asset["size"]
    mat = asset["material"]
    root = bpy.data.objects.new(f"COS_ASSET_{asset_id}", None)
    bpy.context.collection.objects.link(root)
    root["company_os_asset_id"] = asset_id
    root["company_os_label"] = asset["label"]
    root["company_os_kind"] = asset["kind"]
    root["company_os_role"] = asset["role"]
    root["company_os_bounds"] = json.dumps({"width": sx, "depth": sy, "height": sz})
    root["company_os_collision_bounds"] = json.dumps({
        "shape": "BOX",
        "center": {"x": 0, "y": 0, "z": sz / 2},
        "size": {"width": sx, "depth": sy, "height": sz},
    })
    root["company_os_interaction_slots"] = json.dumps(asset["slots"])

    if form == "wall":
        box(root, "wall", (sx, sy, sz), (0, 0, sz / 2), mat)
    elif form == "corner-wall":
        box(root, "wall-a", (sx, 0.18, sz), (0, -sy / 2 + 0.09, sz / 2), mat)
        box(root, "wall-b", (0.18, sy, sz), (-sx / 2 + 0.09, 0, sz / 2), mat)
    elif form == "glass-wall":
        box(root, "glass", (sx, sy * 0.55, sz * 0.82), (0, 0, sz * 0.52), "glass", 0.035)
        for x in (-sx / 2, sx / 2): box(root, "frame", (0.12, sy, sz), (x, 0, sz / 2), "charcoal", 0.025)
        box(root, "frame-top", (sx, sy, 0.12), (0, 0, sz - 0.06), "charcoal", 0.025)
    elif form in {"arch-door", "glass-door"}:
        frame_mat = mat if form == "arch-door" else "charcoal"
        box(root, "frame-left", (0.18, sy, sz), (-sx / 2 + 0.09, 0, sz / 2), frame_mat, 0.05)
        box(root, "frame-right", (0.18, sy, sz), (sx / 2 - 0.09, 0, sz / 2), frame_mat, 0.05)
        box(root, "frame-top", (sx, sy, 0.18), (0, 0, sz - 0.09), frame_mat, 0.05)
        if form == "glass-door":
            box(root, "door-glass", (sx * 0.78, sy * 0.45, sz * 0.84), (0, 0, sz * 0.44), "glass", 0.04)
            sphere(root, "handle", (0.055, 0.055, 0.055), (sx * 0.24, -sy * 0.38, sz * 0.48), "yellow")
    elif form == "window":
        box(root, "pane", (sx * 0.9, sy * 0.5, sz * 0.88), (0, 0, sz / 2), "glass", 0.03)
        for x in (-sx / 2, 0, sx / 2): box(root, "frame", (0.1, sy, sz), (x, 0, sz / 2), "charcoal", 0.02)
        for z in (0.05, sz - 0.05): box(root, "frame", (sx, sy, 0.1), (0, 0, z), "charcoal", 0.02)
    elif form == "column":
        cylinder(root, "column", sx / 2, sz, (0, 0, sz / 2), mat, 32)
    elif form == "floor":
        box(root, "floor", (sx, sy, sz), (0, 0, sz / 2), mat, 0.025)
    elif form in {"disc-light", "pendant-light"}:
        cylinder(root, "shade", sx / 2, sz * (0.55 if form == "disc-light" else 0.3), (0, 0, sz * 0.25), mat)
        sphere(root, "glow", (sx * 0.28, sy * 0.28, sz * 0.16), (0, 0, sz * 0.1), "white")
        if form == "pendant-light": cylinder(root, "cord", 0.025, sz * 0.7, (0, 0, sz * 0.65), "charcoal", 12)
    elif form in {"sign", "partition", "board", "task-board", "display", "art", "direction-sign"}:
        box(root, "panel", (sx, sy, sz * (0.72 if form == "direction-sign" else 1)), (0, 0, sz * (0.65 if form == "direction-sign" else 0.5)), mat)
        if form == "direction-sign": cylinder(root, "post", 0.055, sz * 0.65, (0, 0, sz * 0.325), "wood")
        if form in {"task-board", "art"}:
            for index, color in enumerate(("yellow", "coral", "mint")):
                box(root, f"card-{index}", (sx * 0.18, sy * 1.08, sz * 0.22), ((index - 1) * sx * 0.23, -sy * 0.58, sz * 0.52), color, 0.025)
        if form == "display": box(root, "screen", (sx * 0.88, sy * 1.1, sz * 0.8), (0, -sy * 0.55, sz * 0.52), "charcoal", 0.04)
    elif form == "planter-divider":
        box(root, "planter", (sx, sy, sz * 0.34), (0, 0, sz * 0.17), "wood")
        for index, x in enumerate((-sx * 0.34, -sx * 0.16, sx * 0.04, sx * 0.24, sx * 0.39)):
            leaf = sphere(root, f"leaf-{index}", (sx * 0.095, sy * 0.20, sz * 0.30), (x, 0, sz * (0.55 + (index % 2) * 0.08)), "green")
            leaf.rotation_euler.y = math.radians((-18, 12, -8, 16, -14)[index])
    elif form in {"desk", "standing-desk", "table", "corner-desk", "reception-desk"}:
        top_z = sz * (0.76 if form == "reception-desk" else 0.92)
        box(root, "top", (sx, sy, max(0.08, sz * 0.1)), (0, 0, top_z), mat)
        four_legs(root, sx * 0.42, sy * 0.38, top_z, "charcoal" if form == "standing-desk" else "wood")
        if form == "corner-desk": box(root, "return", (sy * 0.55, sy, 0.09), (sx * 0.35, sy * 0.28, top_z), mat)
        if form == "reception-desk": box(root, "front", (sx, 0.12, sz * 0.8), (0, -sy * 0.42, sz * 0.4), mat)
    elif form == "round-table":
        cylinder(root, "top", sx / 2, max(0.08, sz * 0.1), (0, 0, sz * 0.92), mat)
        cylinder(root, "pedestal", sx * 0.08, sz * 0.86, (0, 0, sz * 0.43), "wood")
        cylinder(root, "base", sx * 0.26, 0.08, (0, 0, 0.04), "wood")
    elif form in {"chair", "office-chair", "stool", "bench", "pouf"}:
        seat_z = sz * (0.5 if form != "stool" else 0.88)
        box(root, "seat", (sx, sy, max(0.1, sz * 0.14)), (0, 0, seat_z), mat)
        if form not in {"stool", "pouf"}: box(root, "back", (sx, max(0.1, sy * 0.16), sz * 0.52), (0, sy * 0.42, sz * 0.72), mat)
        if form == "pouf": sphere(root, "cushion", (sx / 2, sy / 2, sz / 2), (0, 0, sz / 2), mat)
        elif form != "office-chair": four_legs(root, sx * 0.38, sy * 0.35, seat_z, "wood", 0.035)
        if form == "office-chair":
            # A real office-chair base: one central column, five spokes and five
            # small recessed wheels. Never combine it with a four-leg chair base
            # and never represent casters as large spheres.
            cylinder(root, "gas-column", 0.045, seat_z - 0.12, (0, 0, (seat_z + 0.12) / 2), "charcoal")
            cylinder(root, "base-hub", 0.075, 0.09, (0, 0, 0.105), "charcoal")
            for angle in range(0, 360, 72):
                radians = math.radians(angle)
                spoke_length = sx * 0.30
                spoke = box(
                    root, "base-spoke", (spoke_length, 0.04, 0.04),
                    (math.cos(radians) * spoke_length / 2, math.sin(radians) * spoke_length / 2, 0.085),
                    "charcoal", 0.015,
                )
                spoke.rotation_euler.z = radians
                x, y = math.cos(radians) * sx * 0.295, math.sin(radians) * sy * 0.295
                fork = box(root, "caster-fork", (0.035, 0.035, 0.075), (x, y, 0.055), "charcoal", 0.012)
                fork.rotation_euler.z = radians
                cylinder(
                    root, "caster-wheel", 0.018, 0.026, (x, y, 0.018), "charcoal", 16,
                    rotation=(math.pi / 2, 0, radians),
                )
            for x in (-sx * 0.42, sx * 0.42):
                cylinder(root, "arm-post", 0.025, sz * 0.22, (x, 0, seat_z + sz * 0.11), "charcoal", 16)
                box(root, "arm-rest", (sx * 0.08, sy * 0.42, 0.055), (x, -sy * 0.02, seat_z + sz * 0.22), "charcoal", 0.018)
    elif form in {"sofa", "armchair"}:
        box(root, "base", (sx, sy, sz * 0.38), (0, 0, sz * 0.24), mat)
        box(root, "back", (sx, sy * 0.22, sz * 0.62), (0, sy * 0.38, sz * 0.62), mat)
        for x in (-sx * 0.45, sx * 0.45): box(root, "arm", (sx * 0.12, sy, sz * 0.48), (x, 0, sz * 0.38), mat)
        box(root, "cushion", (sx * 0.78, sy * 0.72, sz * 0.14), (0, -sy * 0.05, sz * 0.47), "cream")
    elif form == "shelf":
        for x in (-sx * 0.46, sx * 0.46): box(root, "side", (sx * 0.08, sy, sz), (x, 0, sz / 2), mat, 0.025)
        for index in range(5):
            z = sz * index / 4
            box(root, "shelf", (sx, sy, 0.055), (0, 0, z), mat, 0.018)
        for index, (x, z, color) in enumerate(((-0.28, 0.29, "cream"), (0.08, 0.30, "coral"), (0.28, 0.56, "yellow"), (-0.12, 0.79, "mint"))):
            box(root, f"contents-{index}", (sx * 0.22, sy * 0.72, sz * 0.13), (sx * x, -sy * 0.07, sz * z), color, 0.025)
    elif form == "cubby":
        box(root, "back", (sx, sy * 0.22, sz), (0, sy * 0.38, sz / 2), mat)
        for x in (-sx * 0.48, 0, sx * 0.48): box(root, "vertical", (0.055, sy, sz), (x, 0, sz / 2), mat, 0.02)
        for z in (0, sz / 3, sz * 2 / 3, sz): box(root, "shelf", (sx, sy, 0.055), (0, 0, z), mat, 0.02)
    elif form == "locker":
        box(root, "carcass", (sx, sy, sz), (0, 0, sz / 2), mat)
        for row in range(3):
            for col in range(2):
                x = (col - 0.5) * sx * 0.48
                z = sz * (row + 0.5) / 3
                box(root, "door", (sx * 0.43, sy * 0.08, sz * 0.28), (x, -sy * 0.54, z), "blue", 0.025)
                sphere(root, "handle", (0.025, 0.018, 0.025), (x + sx * 0.12, -sy * 0.61, z), "cream")
    elif form == "cabinet":
        box(root, "carcass", (sx, sy, sz * 0.9), (0, 0, sz * 0.45), mat)
        box(root, "worktop", (sx * 1.03, sy * 1.05, sz * 0.09), (0, -sy * 0.01, sz * 0.955), "wood", 0.035)
        for col in (-0.25, 0.25):
            box(root, "door", (sx * 0.45, sy * 0.07, sz * 0.72), (sx * col, -sy * 0.54, sz * 0.46), "cream", 0.028)
            sphere(root, "handle", (0.025, 0.018, 0.025), (sx * (col + (-0.11 if col > 0 else 0.11)), -sy * 0.62, sz * 0.55), "wood")
        box(root, "toe-kick", (sx * 0.88, sy * 0.12, sz * 0.08), (0, -sy * 0.42, sz * 0.04), "charcoal", 0.015)
    elif form == "drawer":
        box(root, "carcass", (sx, sy, sz), (0, 0, sz / 2), mat)
        for row in range(3):
            z = sz * (row + 0.5) / 3
            box(root, "drawer-front", (sx * 0.9, sy * 0.08, sz * 0.27), (0, -sy * 0.54, z), "cream", 0.02)
            box(root, "handle", (sx * 0.22, 0.025, 0.025), (0, -sy * 0.61, z), "wood", 0.008)
        for x in (-sx * 0.32, sx * 0.32): sphere(root, "caster", (0.035, 0.035, 0.035), (x, 0, 0.035), "charcoal")
    elif form == "coat-rack":
        cylinder(root, "post", 0.055, sz, (0, 0, sz / 2), mat)
        cylinder(root, "base", sx * 0.3, 0.08, (0, 0, 0.04), mat)
        for angle in range(0, 360, 90):
            x, y = math.cos(math.radians(angle)) * sx * 0.28, math.sin(math.radians(angle)) * sy * 0.28
            sphere(root, "hook", (0.06, 0.06, 0.06), (x, y, sz * 0.88), "coral")
    elif form in {"monitor", "display"}:
        box(root, "screen", (sx, sy, sz * 0.72), (0, 0, sz * 0.62), "charcoal")
        cylinder(root, "stem", 0.035, sz * 0.25, (0, 0, sz * 0.22), "charcoal")
        box(root, "base", (sx * 0.42, sy * 1.5, sz * 0.08), (0, 0, sz * 0.04), mat)
    elif form == "laptop":
        box(root, "base", (sx, sy, sz * 0.12), (0, 0, sz * 0.06), mat)
        screen = box(root, "screen", (sx, sz * 0.08, sz * 0.75), (0, sy * 0.42, sz * 0.46), "charcoal")
        screen.rotation_euler.x = math.radians(-8)
    elif form in {"keyboard", "mouse", "speaker", "dock", "tray"}:
        box(root, "body", (sx, sy, sz), (0, 0, sz / 2), mat)
        if form == "keyboard":
            for row in range(3):
                for col in range(7): box(root, "key", (sx * 0.09, sy * 0.17, sz * 0.2), ((col - 3) * sx * 0.12, (row - 1) * sy * 0.25, sz * 1.05), "charcoal", 0.01)
    elif form == "desk-lamp":
        cylinder(root, "base", sx * 0.38, sz * 0.1, (0, 0, sz * 0.05), mat)
        cylinder(root, "stem", 0.035, sz * 0.62, (0, 0, sz * 0.36), "charcoal")
        sphere(root, "shade", (sx * 0.35, sy * 0.35, sz * 0.18), (0, 0, sz * 0.82), mat)
    elif form in {"appliance", "server", "fridge", "dryer", "dispenser"}:
        box(root, "body", (sx, sy, sz), (0, 0, sz / 2), mat)
        if form == "server":
            for index in range(7):
                box(root, "server-slot", (sx * 0.8, sy * 1.02, sz * 0.07), (0, -sy * 0.51, sz * (index + 1) / 9), "charcoal", 0.015)
                sphere(root, "status", (0.025, 0.018, 0.025), (sx * 0.25, -sy * 0.55, sz * (index + 1) / 9), "mint")
        elif form == "fridge":
            box(root, "upper-door", (sx * 0.9, sy * 0.08, sz * 0.57), (0, -sy * 0.54, sz * 0.66), "cream", 0.035)
            box(root, "lower-door", (sx * 0.9, sy * 0.08, sz * 0.28), (0, -sy * 0.54, sz * 0.19), "cream", 0.035)
            box(root, "handle", (0.035, 0.035, sz * 0.25), (sx * 0.34, -sy * 0.61, sz * 0.66), "wood", 0.01)
        elif form == "dryer":
            box(root, "air-slot", (sx * 0.6, sy * 0.08, sz * 0.08), (0, -sy * 0.55, sz * 0.22), "charcoal", 0.015)
            sphere(root, "sensor", (0.025, 0.018, 0.025), (0, -sy * 0.59, sz * 0.7), "coral")
        elif form == "dispenser":
            box(root, "window", (sx * 0.34, sy * 0.08, sz * 0.42), (0, -sy * 0.55, sz * 0.58), "glass", 0.015)
            box(root, "nozzle", (sx * 0.36, sy * 0.3, sz * 0.08), (0, -sy * 0.58, sz * 0.15), "charcoal", 0.015)
        elif asset_id == "microwave":
            box(root, "window", (sx * 0.62, sy * 0.08, sz * 0.56), (-sx * 0.08, -sy * 0.55, sz * 0.53), "charcoal", 0.025)
            for z in (sz * 0.64, sz * 0.38): sphere(root, "control", (0.025, 0.018, 0.025), (sx * 0.36, -sy * 0.6, z), "coral")
        elif asset_id == "printer":
            box(root, "paper-slot", (sx * 0.7, sy * 0.08, sz * 0.08), (0, -sy * 0.55, sz * 0.34), "charcoal", 0.015)
            box(root, "paper-tray", (sx * 0.72, sy * 0.48, sz * 0.06), (0, -sy * 0.54, sz * 0.08), "cream", 0.015)
        else:
            sphere(root, "control", (0.04, 0.025, 0.04), (sx * 0.32, -sy * 0.52, sz * 0.68), "coral")
    elif form == "beacon":
        cylinder(root, "base", sx * 0.48, sz * 0.25, (0, 0, sz * 0.125), "charcoal")
        sphere(root, "light", (sx * 0.42, sy * 0.42, sz * 0.38), (0, 0, sz * 0.62), mat)
    elif form == "clock":
        cylinder(root, "face", sx / 2, sy, (0, 0, sz / 2), "cream", rotation=(math.pi / 2, 0, 0))
        for angle, length in ((0, 0.17), (115, 0.13)):
            hand = box(root, "hand", (0.035, sy * 1.2, length), (0, -sy * 0.6, sz / 2 + length / 2), "charcoal", 0.012)
            hand.rotation_euler.y = math.radians(angle)
    elif form == "coffee-machine":
        box(root, "body", (sx, sy, sz), (0, 0, sz / 2), mat)
        box(root, "opening", (sx * 0.62, sy * 1.05, sz * 0.36), (0, -sy * 0.52, sz * 0.3), "charcoal")
        cylinder(root, "spout", 0.025, sy * 0.35, (0, -sy * 0.58, sz * 0.5), "charcoal", rotation=(math.pi / 2, 0, 0))
    elif form == "kettle":
        sphere(root, "body", (sx * 0.42, sy * 0.42, sz * 0.42), (0, 0, sz * 0.42), mat)
        torus(root, "handle", sx * 0.38, sx * 0.06, (0, sy * 0.12, sz * 0.62), "charcoal", (math.pi / 2, 0, 0))
        cylinder(root, "spout", sx * 0.09, sx * 0.48, (sx * 0.34, 0, sz * 0.52), mat, rotation=(0, math.pi / 2, 0))
    elif form == "mug":
        cylinder(root, "cup", sx * 0.4, sz * 0.72, (0, 0, sz * 0.42), mat)
        torus(root, "handle", sx * 0.27, sx * 0.055, (sx * 0.4, 0, sz * 0.47), mat, (math.pi / 2, 0, 0))
    elif form == "water-cooler":
        box(root, "base", (sx, sy, sz * 0.68), (0, 0, sz * 0.34), "cream")
        sphere(root, "bottle", (sx * 0.38, sy * 0.38, sz * 0.25), (0, 0, sz * 0.82), "glass")
        for x, color in ((-sx * 0.12, "blue"), (sx * 0.12, "coral")): sphere(root, "tap", (0.035, 0.025, 0.035), (x, -sy * 0.52, sz * 0.52), color)
    elif form in {"sink", "basin"}:
        if form == "sink":
            box(root, "cabinet", (sx, sy, sz * 0.78), (0, 0, sz * 0.39), mat)
            for x in (-sx * 0.23, sx * 0.23): box(root, "door", (sx * 0.42, sy * 0.07, sz * 0.58), (x, -sy * 0.54, sz * 0.39), "cream", 0.025)
            box(root, "worktop", (sx * 1.03, sy * 1.04, sz * 0.08), (0, 0, sz * 0.82), "wood", 0.025)
            basin_z = sz * 0.86
        else:
            cylinder(root, "pedestal", sx * 0.18, sz * 0.66, (0, 0, sz * 0.33), mat, 28)
            basin_z = sz * 0.72
        sphere(root, "basin", (sx * 0.36, sy * 0.38, sz * 0.11), (0, -sy * 0.03, basin_z), "white")
        torus(root, "tap", sx * 0.12, 0.025, (0, sy * 0.15, min(sz, basin_z + sz * 0.16)), "charcoal", (math.pi / 2, 0, 0))
    elif form == "bowl":
        sphere(root, "bowl", (sx / 2, sy / 2, sz / 2), (0, 0, sz / 2), mat)
        for index, color in enumerate(("coral", "yellow", "green")): sphere(root, "fruit", (sx * 0.13, sy * 0.13, sz * 0.38), ((index - 1) * sx * 0.18, 0, sz * 0.8), color)
    elif form in {"plant", "hanging-plant"}:
        pot_z = sz * (0.18 if form == "plant" else 0.58)
        cylinder(root, "pot", sx * 0.28, sz * 0.25, (0, 0, pot_z), "coral")
        for index, angle in enumerate(range(0, 360, 45)):
            radians = math.radians(angle)
            x, y = math.cos(radians) * sx * 0.16, math.sin(radians) * sy * 0.16
            cylinder(root, f"stem-{index}", 0.012, sz * 0.28, (x * 0.45, y * 0.45, pot_z + sz * 0.22), "green", 10)
            leaf = sphere(root, f"leaf-{index}", (sx * 0.10, sy * 0.065, sz * (0.19 + (index % 3) * 0.025)), (x, y, pot_z + sz * (0.30 + (index % 2) * 0.07)), "green")
            leaf.rotation_euler.y = math.radians(-24 + (index % 3) * 22)
            leaf.rotation_euler.z = radians
        if form == "hanging-plant":
            for x in (-sx * 0.22, sx * 0.22): cylinder(root, "cord", 0.012, sz * 0.5, (x, 0, sz * 0.82), "wood")
    elif form in {"rug-round", "rug"}:
        if form == "rug-round": cylinder(root, "rug", sx / 2, sz, (0, 0, sz / 2), mat, 48)
        else: box(root, "rug", (sx, sy, sz), (0, 0, sz / 2), mat, sz * 0.4)
    elif form == "books":
        for index, color in enumerate((mat, "coral", "yellow")): box(root, "book", (sx, sy, sz / 3.3), (0, 0, sz * (index + 0.5) / 3), color, 0.018)
    elif form == "bin":
        cylinder(root, "bin", sx / 2, sz, (0, 0, sz / 2), mat)
        torus(root, "rim", sx * 0.38, sx * 0.04, (0, 0, sz * 0.94), "charcoal")
    elif form == "toilet":
        box(root, "pedestal", (sx * 0.42, sy * 0.40, sz * 0.34), (0, sy * 0.02, sz * 0.17), mat, 0.08)
        sphere(root, "bowl-body", (sx * 0.36, sy * 0.34, sz * 0.18), (0, -sy * 0.06, sz * 0.36), mat)
        seat = torus(root, "seat", sx * 0.285, sx * 0.065, (0, -sy * 0.07, sz * 0.49), mat)
        seat.scale.y = 1.16
        box(root, "tank", (sx * 0.58, sy * 0.24, sz * 0.55), (0, sy * 0.31, sz * 0.54), mat, 0.06)
        box(root, "tank-lid", (sx * 0.62, sy * 0.27, sz * 0.055), (0, sy * 0.31, sz * 0.83), mat, 0.025)
        cylinder(root, "flush", 0.035, 0.018, (0, sy * 0.31, sz * 0.87), "wood", 20)
    elif form == "stall":
        box(root, "back", (sx, 0.08, sz), (0, sy / 2, sz / 2), mat)
        for x in (-sx / 2, sx / 2): box(root, "side", (0.08, sy, sz), (x, 0, sz / 2), mat)
        box(root, "door", (sx * 0.72, 0.08, sz * 0.86), (0, -sy / 2, sz * 0.48), mat)
        sphere(root, "door-handle", (0.035, 0.025, 0.035), (sx * 0.24, -sy / 2 - 0.055, sz * 0.48), "charcoal")
    elif form == "mirror":
        cylinder(root, "mirror", sx / 2, sy, (0, 0, sz / 2), "glass", 48, (math.pi / 2, 0, 0))
        torus(root, "frame", sx * 0.43, sx * 0.045, (0, -sy * 0.52, sz / 2), "wood", (math.pi / 2, 0, 0))
    elif form == "umbrella":
        cylinder(root, "stand", sx * 0.42, sz * 0.72, (0, 0, sz * 0.36), mat)
        for index, x in enumerate((-sx * 0.18, 0, sx * 0.18)):
            cylinder(root, "umbrella", 0.025, sz * 0.88, (x, 0, sz * 0.55), ("coral", "yellow", "mint")[index])
            torus(root, "handle", 0.07, 0.018, (x + 0.05, 0, sz * 0.95), ("coral", "yellow", "mint")[index], (math.pi / 2, 0, 0))
    elif form == "parcels":
        for index, (size, loc) in enumerate((((sx, sy * 0.72, sz * 0.38), (0, 0, sz * 0.19)), ((sx * 0.62, sy, sz * 0.32), (-sx * 0.12, 0, sz * 0.54)), ((sx * 0.5, sy * 0.55, sz * 0.28), (sx * 0.15, 0, sz * 0.82)))):
            box(root, f"parcel-{index}", size, loc, mat)
    elif form == "bell":
        cylinder(root, "base", sx * 0.48, sz * 0.18, (0, 0, sz * 0.09), "charcoal")
        sphere(root, "bell", (sx * 0.42, sy * 0.42, sz * 0.45), (0, 0, sz * 0.52), mat)
        sphere(root, "button", (0.025, 0.025, 0.025), (0, 0, sz * 0.98), "coral")
    else:
        box(root, "body", (sx, sy, sz), (0, 0, sz / 2), mat)

    for index, anchor_name in enumerate(asset["anchors"]):
        location = (0, 0, 0) if anchor_name == "root" else (0, -sy * 0.55, min(sz, max(0.08, sz * 0.55 + index * 0.025)))
        anchor(root, anchor_name, location)
    return root


def descendants(root):
    result = [root]
    stack = list(root.children)
    while stack:
        item = stack.pop()
        result.append(item)
        stack.extend(item.children)
    return result


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


manifest_assets = []
roots = []
for index, asset in enumerate(spec["assets"]):
    root = build_asset(asset)
    roots.append(root)
    bpy.ops.object.select_all(action="DESELECT")
    for item in descendants(root): item.select_set(True)
    bpy.context.view_layer.objects.active = root
    glb_path = output_dir / f"{asset['id']}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path), export_format="GLB", use_selection=True,
        export_yup=True, export_extras=True, export_materials="EXPORT",
        export_cameras=False, export_lights=False, export_apply=True,
    )
    source_path = source_dir / f"{asset['id']}.blend"
    bpy.data.libraries.write(
        str(source_path), set(descendants(root)), fake_user=True, compress=True,
    )
    root.location = ((index % 10) * 4.8, (index // 10) * 4.4, 0)
    manifest_assets.append({
        "id": asset["id"], "label": asset["label"], "kind": asset["kind"],
        "semanticRole": asset["role"], "interactionSlots": asset["slots"],
        "variants": ["DEFAULT"], "unitScale": 1,
        "bounds": {"width": asset["size"][0], "depth": asset["size"][1], "height": asset["size"][2]},
        "collisionBounds": {
            "shape": "BOX",
            "center": {"x": 0, "y": 0, "z": asset["size"][2] / 2},
            "size": {"width": asset["size"][0], "depth": asset["size"][1], "height": asset["size"][2]},
        },
        "anchorPoints": asset["anchors"], "accessibilityFallback": asset["label"],
        "src": f"/assets/3d/environment/{asset['id']}.glb",
        "sha256": sha256(glb_path), "bytes": glb_path.stat().st_size,
        "sourceBlend": {
            "path": f"assets/3d/environment/sources/{asset['id']}.blend",
            "sha256": sha256(source_path), "bytes": source_path.stat().st_size,
        },
    })
    print("OFFICE_ASSET", index + 1, len(spec["assets"]), asset["id"])

# Catalog floor and studio setup live only in the source/QA scene.
box_root = bpy.data.objects.new("COS_CATALOG_STAGE", None)
bpy.context.collection.objects.link(box_root)
box(box_root, "catalog-floor", (50, 38, 0.12), (21.6, 15.4, -0.06), "cream", 0.04)

def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()

bpy.ops.object.camera_add(location=(-18, -22, 35))
camera = bpy.context.object
camera.data.type = "ORTHO"
camera.data.ortho_scale = 50
look_at(camera, (21.6, 15.4, 0.8))
bpy.context.scene.camera = camera
for location, energy, size in [((-12, -14, 25), 2300, 8), ((35, -5, 18), 1700, 7), ((20, 35, 24), 1900, 6)]:
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    look_at(light, (21.6, 15.4, 0.7))

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 2048
scene.render.resolution_y = 1536
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.world.color = (0.055, 0.045, 0.035)
scene.view_settings.look = "AgX - Medium High Contrast"
scene.render.filepath = str(preview_path)
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
bpy.ops.render.render(write_still=True)

manifest = {
    "formatVersion": "1.0", "schemaVersion": "1.0", "style": spec["style"],
    "unit": spec["unit"], "assets": manifest_assets,
    "rooms": spec["rooms"],
    "source": {"path": str(spec_path), "sha256": sha256(spec_path)},
    "sourceBlend": {"path": str(blend_path), "sha256": sha256(blend_path)},
    "individualSourceDirectory": "assets/3d/environment/sources",
    "catalogPreview": {"path": str(preview_path), "sha256": sha256(preview_path)},
}
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("OFFICE_LIBRARY", {"assets": len(manifest_assets), "rooms": len(spec["rooms"]), "manifest": str(manifest_path)})
