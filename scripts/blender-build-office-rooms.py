"""Assemble the Company OS office asset library into reusable rooms and a showcase.

This script only consumes Company OS-owned GLBs and the local asset specification.
It exports eight room modules, a room manifest, a Blender source scene, individual
QA renders, and a complete isometric office preview.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def cli_args() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


ARGS = cli_args()
if len(ARGS) not in (6, 7):
    raise SystemExit(
        "usage: blender --background --python blender-build-office-rooms.py -- "
        "SPEC ASSET_DIR ROOM_DIR BLEND MANIFEST QA_DIR [ONLY_ROOM_ID]"
    )

SPEC_PATH, ASSET_DIR, ROOM_DIR, BLEND_PATH, MANIFEST_PATH, QA_DIR = map(Path, ARGS[:6])
ONLY_ROOM_ID = ARGS[6] if len(ARGS) == 7 else None
for path in (ROOM_DIR, Path(BLEND_PATH).parent, Path(MANIFEST_PATH).parent, QA_DIR):
    path.mkdir(parents=True, exist_ok=True)

SPEC = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
ASSETS = {item["id"]: item for item in SPEC["assets"]}


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.materials:
        bpy.data.materials.remove(block)


def material(name: str, color: tuple[float, float, float, float], roughness: float = 0.78):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    next(socket for socket in bsdf.inputs if socket.identifier == "Base Color").default_value = color
    next(socket for socket in bsdf.inputs if socket.identifier == "Roughness").default_value = roughness
    return mat


MATS = {}


def build_materials() -> None:
    palette = {
        "shell_cream": (0.96, 0.91, 0.82, 1),
        "floor_cream": (0.79, 0.73, 0.64, 1),
        "floor_coral": (0.72, 0.31, 0.17, 1),
        "floor_mint": (0.43, 0.54, 0.38, 1),
        "trim": (0.50, 0.30, 0.16, 1),
        "letter": (0.96, 0.91, 0.82, 1),
        "detail_floor": (0.72, 0.66, 0.57, 1),
        "detail_shell": (0.86, 0.78, 0.66, 1),
        "detail_olive": (0.22, 0.30, 0.12, 1),
        "detail_charcoal": (0.12, 0.12, 0.10, 1),
        "detail_wood": (0.59, 0.35, 0.17, 1),
        "detail_kraft": (0.55, 0.38, 0.23, 1),
    }
    for name, color in palette.items():
        MATS[name] = material(f"Room_{name}", color)


def cube(name: str, size, location, mat, bevel: float = 0.08, parent=None):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Soft clay edges", "BEVEL")
        modifier.width = min(bevel, min(size) * 0.25)
        modifier.segments = 3
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj


def descendants(root):
    result = [root]
    for child in root.children:
        result.extend(descendants(child))
    return result


def default_height(asset_id: str) -> float:
    if asset_id == "plant-hanging":
        return 2.55
    if asset_id in {
        "task-board", "whiteboard", "conference-display", "art-panel",
        "wall-clock", "mirror-round", "room-sign", "hand-dryer", "soap-dispenser",
    }:
        return 1.25
    if asset_id in {
        "monitor", "keyboard", "mouse", "desk-lamp", "approval-beacon", "laptop",
        "speakerphone", "charging-dock", "plant-desk", "reception-bell", "mug",
        "fruit-bowl", "kettle", "coffee-machine", "microwave", "book-stack",
    }:
        return 0.82
    return 0.0


ASSEMBLY_PALETTE = {
    "cream": (0.90, 0.84, 0.74, 1),
    "white": (0.97, 0.94, 0.87, 1),
    "coral": (0.79, 0.30, 0.16, 1),
    "yellow": (0.74, 0.57, 0.23, 1),
    "blue": (0.12, 0.23, 0.31, 1),
    "mint": (0.43, 0.53, 0.37, 1),
    "green": (0.23, 0.41, 0.19, 1),
    "wood": (0.61, 0.39, 0.22, 1),
    "charcoal": (0.07, 0.07, 0.07, 1),
}


def tone_materials(objects) -> None:
    """Collapse catalog colors into the calmer Company OS room palette."""
    for obj in objects:
        if obj.type != "MESH":
            continue
        for mat in obj.data.materials:
            if not mat or "glass" in mat.name.lower():
                continue
            key = next((name for name in ASSEMBLY_PALETTE if name in mat.name.lower()), None)
            if not key:
                continue
            color = ASSEMBLY_PALETTE[key]
            mat.diffuse_color = color
            if mat.use_nodes:
                bsdf = next((node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
                if bsdf:
                    next(socket for socket in bsdf.inputs if socket.identifier == "Base Color").default_value = color
                    next(socket for socket in bsdf.inputs if socket.identifier == "Roughness").default_value = 0.76


DETAIL_MATERIALS = {
    "sofa-two-seat": "detail_olive",
    "armchair": "detail_olive",
    "office-chair": "detail_charcoal",
    "side-table": "detail_wood",
    "parcel-stack": "detail_kraft",
}


def apply_detail_material(asset_id: str, objects) -> None:
    material_name = DETAIL_MATERIALS.get(asset_id)
    if not material_name:
        return
    replacement = MATS[material_name]
    for obj in objects:
        if obj.type != "MESH":
            continue
        obj.data.materials.clear()
        obj.data.materials.append(replacement)


def import_asset(asset_id: str, location, rotation=0.0, scale=1.0, parent=None, height=None):
    source = ASSET_DIR / f"{asset_id}.glb"
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
    imported = list(set(bpy.data.objects) - before)
    tone_materials(imported)
    if ONLY_ROOM_ID == "room-reception":
        apply_detail_material(asset_id, imported)
    top = [obj for obj in imported if obj.parent not in imported]
    holder = bpy.data.objects.new(f"Placement_{asset_id}", None)
    bpy.context.collection.objects.link(holder)
    resolved_height = default_height(asset_id) if height is None else height
    holder.location = (location[0], location[1], location[2] + resolved_height)
    holder.rotation_euler[2] = rotation
    holder.scale = (scale, scale, scale)
    holder.parent = parent
    for obj in top:
        obj.parent = holder
    return holder


def import_showcase_character(path: Path, character_id: str, location, rotation=0.0, scale=0.65):
    """Place an approved character in the QA showcase without baking it into a room."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    imported = list(set(bpy.data.objects) - before)
    top = [obj for obj in imported if obj.parent not in imported]
    holder = bpy.data.objects.new(f"Showcase_{character_id}", None)
    bpy.context.collection.objects.link(holder)
    holder.location = location
    holder.rotation_euler[2] = rotation
    holder.scale = (scale, scale, scale)
    holder["company_os_asset_id"] = character_id
    holder["company_os_fixture"] = True
    for obj in top:
        obj.parent = holder
    return holder


def room_shell(room, root):
    width, depth, height = room["size"]
    floor_mat = MATS["floor_cream"]
    cube(f"{room['id']}_floor", (width, depth, 0.18), (0, 0, -0.09), floor_mat, 0.12, root)
    cube(f"{room['id']}_back", (width, 0.16, height), (0, depth / 2, height / 2), MATS["shell_cream"], 0.1, root)
    cube(f"{room['id']}_left", (0.16, depth, height), (-width / 2, 0, height / 2), MATS["shell_cream"], 0.1, root)
    cube(f"{room['id']}_right", (0.16, depth, height), (width / 2, 0, height / 2), MATS["shell_cream"], 0.1, root)
    cube(f"{room['id']}_trim", (width, 0.12, 0.18), (0, depth / 2 - 0.09, 0.09), MATS["trim"], 0.04, root)


def detailed_reception_shell(room, root):
    """Open clay-miniature cutaway derived from the approved product concept."""
    width, depth, height = room["size"]
    cube(f"{room['id']}_plinth", (width + 0.46, depth + 0.46, 0.34), (0, 0, -0.25), MATS["detail_shell"], 0.22, root)
    cube(f"{room['id']}_floor", (width, depth, 0.16), (0, 0, -0.08), MATS["detail_floor"], 0.14, root)
    # Camera-facing edges stay open. The two walls read as a miniature cutaway,
    # not a closed grey box, while retaining proper wall occlusion semantics.
    cube(f"{room['id']}_back", (width, 0.18, height), (0, depth / 2, height / 2), MATS["detail_shell"], 0.14, root)
    cube(f"{room['id']}_left", (0.18, depth, height), (-width / 2, 0, height / 2), MATS["detail_shell"], 0.14, root)
    cube(f"{room['id']}_back_trim", (width, 0.12, 0.15), (0, depth / 2 - 0.1, 0.09), MATS["trim"], 0.05, root)
    cube(f"{room['id']}_left_trim", (0.12, depth, 0.15), (-width / 2 + 0.1, 0, 0.09), MATS["trim"], 0.05, root)
    # A shallow plaster feature panel gives the reception desk a deliberate
    # architectural home without adding another obstructing wall.
    cube(f"{room['id']}_feature", (3.55, 0.10, 1.95), (-1.45, depth / 2 - 0.13, 1.50), MATS["shell_cream"], 0.22, root)


# Placement tuples are (asset id, x, y, rotation degrees, optional scale).
# They intentionally include repeated chairs, computers, plants, and small props;
# richness lives in the assembled room, while the catalog retains 79 canonical IDs.
LAYOUTS = {
    "room-entrance": [
        ("doorway-glass", 0, -2.75, 0), ("welcome-mat", 0, -1.9, 0),
        ("bench", -2.5, 1.35, 90), ("umbrella-stand", 2.7, 1.8, 0),
        ("directional-sign", 2.7, -0.5, 0), ("parcel-stack", -2.7, -0.55, 0),
        ("plant-tall", 3.1, -2.0, 0), ("plant-tall", -3.1, 2.0, 0),
        ("art-panel", -2.2, 2.75, 0),
    ],
    "room-reception": [
        ("reception-desk", -1.45, 1.05, 0, 0.94),
        ("monitor", -1.88, 1.0, 180, 0.88, 0.84), ("reception-bell", -0.42, 0.76, 0, 0.9, 0.84),
        ("sofa-two-seat", 2.25, -1.72, -90, 0.92), ("armchair", 2.45, 0.55, -135, 0.88),
        ("side-table", 1.25, -0.55, 0, 0.88), ("rug-round", 1.55, -0.78, 0, 1.16),
        ("plant-tall", -3.25, 1.9, 0, 0.94), ("plant-tall", 3.25, 1.85, 0, 0.84),
        ("plant-desk", 1.25, -0.55, 0, 0.86, 0.50),
        ("wall-clock", -0.15, 2.84, 0, 0.86), ("art-panel", 2.0, 2.84, 0, 0.92),
        ("parcel-stack", -3.15, 0.35, 0, 0.82),
    ],
    "room-department": [
        ("desk-double", -2.4, 0.9, 0), ("desk-double", 2.4, 0.9, 0),
        ("office-chair", -3.0, 0.05, 180), ("office-chair", -1.8, 0.05, 180),
        ("office-chair", 1.8, 0.05, 180), ("office-chair", 3.0, 0.05, 180),
        ("monitor", -3.0, 0.85, 180, 1.0, 0.75), ("monitor", -1.8, 0.85, 180, 1.0, 0.75),
        ("monitor", 1.8, 0.85, 180, 1.0, 0.75), ("monitor", 3.0, 0.85, 180, 1.0, 0.75),
        ("keyboard", -3.0, 0.35, 0, 1.0, 0.75), ("keyboard", -1.8, 0.35, 0, 1.0, 0.75),
        ("keyboard", 1.8, 0.35, 0, 1.0, 0.75), ("keyboard", 3.0, 0.35, 0, 1.0, 0.75),
        ("task-board", 0, 3.85, 0), ("bookshelf", -4.25, 2.7, 0),
        ("storage-cabinet", 4.25, 2.7, 0), ("approval-beacon", -1.35, 0.82, 0, 1.0, 0.75),
        ("planter-divider", 0, -1.7, 0), ("recycle-bin", 4.25, -2.7, 0),
        ("plant-tall", -4.25, -2.55, 0),
    ],
    "room-project": [
        ("meeting-table-long", 0, 0.25, 0),
        ("visitor-chair", -1.15, -0.8, 180), ("visitor-chair", 0, -0.8, 180),
        ("visitor-chair", 1.15, -0.8, 180), ("visitor-chair", -1.15, 1.25, 0),
        ("visitor-chair", 0, 1.25, 0), ("visitor-chair", 1.15, 1.25, 0),
        ("speakerphone", 0, 0.25, 0, 1.0, 0.75), ("laptop", -0.8, 0.25, 0, 1.0, 0.75),
        ("task-board", -2.2, 3.4, 0), ("whiteboard", 2.2, 3.4, 0),
        ("conference-display", 0, 3.42, 0), ("charging-dock", 2.9, -2.15, 0, 1.0, 0.05),
        ("pouf", -2.9, -2.1, 0), ("pouf", -2.1, -2.1, 0),
        ("plant-desk", 1.25, 0.25, 0, 1.0, 0.75), ("acoustic-partition", -3.45, 0.9, 90),
    ],
    "room-meeting": [
        ("meeting-table-long", 0, 0.2, 0),
        ("visitor-chair", -1.25, -0.9, 180), ("visitor-chair", 0, -0.9, 180),
        ("visitor-chair", 1.25, -0.9, 180), ("visitor-chair", -1.25, 1.3, 0),
        ("visitor-chair", 0, 1.3, 0), ("visitor-chair", 1.25, 1.3, 0),
        ("visitor-chair", -2.0, 0.2, 90), ("visitor-chair", 2.0, 0.2, -90),
        ("conference-display", 0, 3.4, 0), ("whiteboard", -2.5, 3.4, 0),
        ("speakerphone", 0, 0.2, 0, 1.0, 0.75), ("wall-clock", 2.85, 3.4, 0),
        ("plant-tall", 3.7, 2.55, 0),
    ],
    "room-pantry": [
        ("sink-unit", -3.2, 2.45, 0), ("pantry-counter", -1.55, 2.45, 0),
        ("pantry-counter", 0.55, 2.45, 0),
        ("coffee-machine", -1.85, 2.45, 0, 1.0, 0.92),
        ("kettle", -0.95, 2.45, 0, 1.0, 0.92), ("fridge", 3.4, 2.35, 0),
        ("microwave", 0.65, 2.45, 0, 1.0, 0.92), ("snack-shelf", 2.15, 2.55, 0),
        ("water-cooler", -3.35, 0.6, 0), ("cafe-table", -1.2, -1.2, 0),
        ("cafe-table", 1.3, -1.2, 0), ("stool", -1.2, -2.0, 0),
        ("stool", 1.3, -2.0, 0), ("mug", -1.2, -1.2, 0, 1.0, 0.72),
        ("fruit-bowl", 1.3, -1.2, 0, 1.0, 0.72), ("recycle-bin", 3.25, -1.8, 0),
        ("art-panel", -2.3, 2.85, 0),
    ],
    "room-restroom": [
        ("restroom-stall", -2.0, 1.8, 0), ("toilet", -2.0, 1.7, 180),
        ("restroom-stall", 0, 1.8, 0), ("toilet", 0, 1.7, 180),
        ("sink-basin", 2.25, 1.8, 0), ("mirror-round", 2.25, 2.9, 0),
        ("soap-dispenser", 1.7, 2.65, 0), ("hand-dryer", 3.0, 2.65, 0),
        ("trash-bin", 3.0, 1.45, 0), ("plant-desk", 2.25, 1.8, 0, 1.0, 0.92),
        ("bench", -1.2, -1.85, 0),
    ],
    "room-corridor": [
        ("rug-runner", -4.7, 0, 0), ("rug-runner", 0, 0, 0),
        ("rug-runner", 4.7, 0, 0), ("bench", -5.7, 1.0, 0),
        ("planter-divider", 5.6, 1.0, 0), ("directional-sign", -1.7, 1.0, 0),
        ("room-sign", 1.2, 1.52, 0), ("art-panel", 3.0, 1.56, 0),
        ("wall-clock", -3.4, 1.55, 0),
    ],
}


def set_camera(location, target):
    camera_data = bpy.data.cameras.new("IsometricCamera")
    camera = bpy.data.objects.new("IsometricCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = location
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = max(11.0, abs(location[0]) * 1.45)
    bpy.context.scene.camera = camera
    return camera


def lights():
    world = bpy.context.scene.world
    world.color = (0.055, 0.045, 0.035)
    world.use_nodes = True
    background = next(node for node in world.node_tree.nodes if node.type == "BACKGROUND")
    is_detail = ONLY_ROOM_ID == "room-reception"
    next(socket for socket in background.inputs if socket.identifier == "Color").default_value = (
        (0.78, 0.68, 0.55, 1) if is_detail else (0.24, 0.21, 0.17, 1)
    )
    next(socket for socket in background.inputs if socket.identifier == "Strength").default_value = 0.82 if is_detail else 0.62
    for name, loc, energy, size, color in (
        ("Key", (-9, -10, 16), 3100 if is_detail else 2600, 10, (1.0, 0.86, 0.70)),
        ("Fill", (11, -2, 10), 2400 if is_detail else 2200, 10, (0.91, 0.88, 0.78) if is_detail else (0.72, 0.84, 1.0)),
        ("Top", (0, 10, 18), 2800 if is_detail else 2400, 11, (1.0, 0.94, 0.82)),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = color
        obj = bpy.data.objects.new(name, data)
        obj.location = loc
        bpy.context.collection.objects.link(obj)


def configure_render():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium Low Contrast"


def export_root(root, path):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in descendants(root):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(path.resolve()), export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_extras=True,
    )


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


reset_scene()
build_materials()
configure_render()
lights()
camera = set_camera((10, -13, 11), (0, 0.4, 0.7))
room_roots = []
room_records = []

selected_rooms = [room for room in SPEC["rooms"] if ONLY_ROOM_ID is None or room["id"] == ONLY_ROOM_ID]
if ONLY_ROOM_ID and not selected_rooms:
    raise RuntimeError(f"Unknown room id: {ONLY_ROOM_ID}")

for index, room in enumerate(selected_rooms):
    root = bpy.data.objects.new(room["id"], None)
    bpy.context.collection.objects.link(root)
    root["company_os_room_kind"] = room["kind"]
    root["company_os_contract"] = "OfficeRoomAsset 1.0"
    if ONLY_ROOM_ID == "room-reception":
        detailed_reception_shell(room, root)
    else:
        room_shell(room, root)
    placements = LAYOUTS[room["id"]]
    composition = []
    for item in placements:
        asset_id, x, y, degrees, *options = item
        scale = options[0] if options else 1.0
        height = options[1] if len(options) > 1 else None
        import_asset(asset_id, (x, y, 0), math.radians(degrees), scale, root, height)
        composition.append({
            "assetId": asset_id,
            "position": {"x": x, "y": y, "z": default_height(asset_id) if height is None else height},
            "rotationDegrees": degrees,
            "scale": scale,
        })

    room_path = ROOM_DIR / f"{room['id']}.glb"
    export_root(root, room_path)
    scene = bpy.context.scene
    scene.render.filepath = str((QA_DIR / f"{room['id']}.png").resolve())
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 960
    width, depth, _ = room["size"]
    camera.location = (width * 0.9, -depth * 1.35, max(width, depth) * 1.05)
    camera.rotation_euler = (Vector((0, 0.35, 0.7)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = max(width, depth) * 1.35
    bpy.ops.render.render(write_still=True)
    room_records.append({
        "id": room["id"], "kind": room["kind"], "label": room["label"],
        "formatVersion": "1.0", "src": "/" + str(room_path.resolve().relative_to(Path("web/public").resolve())),
        "sha256": sha256(room_path), "bytes": room_path.stat().st_size,
        "size": room["size"], "assetIds": sorted({item[0] for item in placements}),
        "placements": len(placements), "preview": str((QA_DIR / f"{room['id']}.png").resolve().relative_to(Path.cwd().resolve())),
        "composition": composition,
    })
    room_roots.append(root)
    for obj in descendants(root):
        obj.hide_render = True
    print("OFFICE_ROOM", index + 1, len(selected_rooms), room["id"], len(placements))

# Arrange the reusable room roots into an open-front miniature office.
showcase_positions = {
    "room-entrance": (-9.5, -7.0, 0), "room-reception": (-1.0, -7.0, 0),
    "room-pantry": (7.5, -7.0, 0), "room-corridor": (0, -1.8, 0),
    "room-department": (-9.5, 4.0, 0), "room-project": (0, 4.0, 0),
    "room-meeting": (9.0, 4.0, 0), "room-restroom": (9.5, -1.8, 0),
}
for root in room_roots:
    root.location = showcase_positions[root.name]
    for obj in descendants(root):
        obj.hide_render = ONLY_ROOM_ID is not None

# The three approved fish are showcase fixtures, not claims of live Agents.
fish_dir = Path("web/public/assets/3d")
showcase_characters = [] if ONLY_ROOM_ID else [
    import_showcase_character(fish_dir / "fish-bumble-3d-v4.glb", "fish-bumble-3d-v4", (-8.0, -8.25, 0.68), math.radians(18)),
    import_showcase_character(fish_dir / "fish-fizz-3d-v3.glb", "fish-fizz-3d-v3", (5.7, -8.55, 0.68), math.radians(-22)),
    import_showcase_character(fish_dir / "fish-honey-3d-v2.glb", "fish-honey-3d-v2", (-2.0, -9.15, 0.68), math.radians(155)),
]

# A soft plinth makes the complete office read as a clay miniature rather than
# a collection of disconnected dashboard cards.
if not ONLY_ROOM_ID:
    plinth = cube("CompanyOS_Showcase_Platform", (30, 20, 0.45), (0, 0.5, -0.42), MATS["floor_cream"], 0.35)
    camera.location = (25, -31, 28)
    camera.rotation_euler = (Vector((0, 0.5, 0.5)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = 35
    scene = bpy.context.scene
    scene.render.resolution_x = 2048
    scene.render.resolution_y = 1536
    scene.render.filepath = str((QA_DIR / "company-os-office-showcase.png").resolve())
    bpy.ops.render.render(write_still=True)

Path(MANIFEST_PATH).write_text(json.dumps({
    "schemaVersion": "1.0", "contract": "OfficeRoomAsset 1.0",
    "style": SPEC["style"], "unit": SPEC["unit"], "rooms": room_records,
    "showcase": None if ONLY_ROOM_ID else {
        "preview": "assets/3d/environment/qa/rooms/company-os-office-showcase.png",
        "fixtureCharacterIds": [item["company_os_asset_id"] for item in showcase_characters],
    },
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

bpy.ops.wm.save_as_mainfile(filepath=str(Path(BLEND_PATH).resolve()))
print("OFFICE_ROOMS", {"rooms": len(room_records), "blend": str(BLEND_PATH), "manifest": str(MANIFEST_PATH)})
