"""Build the approved Company OS reception concept as a real-time 3D room.

The approved raster is used only as an art-direction and camera-match reference.
All exported geometry is authored in this script and remains independently
rotatable. Static architecture and decoration share a room root; live Company OS
entities are deliberately injected by the Web renderer instead of being baked in.
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
if len(ARGS) != 5:
    raise SystemExit("usage: blender --background --python SCRIPT -- REFERENCE GLB BLEND MANIFEST PREVIEW")

REFERENCE_PATH, GLB_PATH, BLEND_PATH, MANIFEST_PATH, PREVIEW_PATH = map(Path, ARGS)
for path in (GLB_PATH.parent, BLEND_PATH.parent, MANIFEST_PATH.parent, PREVIEW_PATH.parent):
    path.mkdir(parents=True, exist_ok=True)


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.materials, bpy.data.curves, bpy.data.meshes, bpy.data.cameras, bpy.data.lights):
        for block in list(collection):
            collection.remove(block)


def principled(name: str, color, roughness=0.78, noise_scale=None, noise_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    next(socket for socket in bsdf.inputs if socket.identifier == "Base Color").default_value = color
    next(socket for socket in bsdf.inputs if socket.identifier == "Roughness").default_value = roughness
    if noise_scale:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = noise_scale
        noise.inputs["Detail"].default_value = 3.0
        noise.inputs["Roughness"].default_value = 0.68
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = noise_strength
        bump.inputs["Distance"].default_value = 0.06
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


MATS = {}


def build_materials() -> None:
    MATS.update({
        "plaster": principled("COS_Plaster_Cream", (0.88, 0.80, 0.68, 1), 0.93, 7.0, 0.14),
        "plaster_top": principled("COS_Plaster_Top", (0.98, 0.94, 0.86, 1), 0.88),
        "floor": principled("COS_Floor_WarmGrey", (0.57, 0.53, 0.46, 1), 0.91, 10.0, 0.09),
        "base": principled("COS_Base_Stone", (0.47, 0.43, 0.37, 1), 0.90),
        "wood": principled("COS_Honey_Wood", (0.55, 0.31, 0.13, 1), 0.72, 5.0, 0.07),
        "wood_light": principled("COS_Light_Wood", (0.72, 0.48, 0.23, 1), 0.76),
        "olive": principled("COS_Olive_Upholstery", (0.29, 0.36, 0.14, 1), 0.95, 9.0, 0.12),
        "olive_dark": principled("COS_Olive_Leaf", (0.18, 0.29, 0.08, 1), 0.88),
        "olive_light": principled("COS_Olive_Leaf_Light", (0.34, 0.46, 0.16, 1), 0.88),
        "terracotta": principled("COS_Terracotta_Rug", (0.66, 0.25, 0.10, 1), 0.98, 12.0, 0.10),
        "orange": principled("COS_Orange_Cushion", (0.82, 0.30, 0.08, 1), 0.92),
        "charcoal": principled("COS_Charcoal", (0.055, 0.052, 0.045, 1), 0.68),
        "screen": principled("COS_Screen", (0.018, 0.022, 0.020, 1), 0.38),
        "brass": principled("COS_Brass", (0.72, 0.45, 0.08, 1), 0.30),
        "pot": principled("COS_Clay_Pot", (0.57, 0.39, 0.22, 1), 0.92),
        "paper": principled("COS_Paper", (0.87, 0.82, 0.71, 1), 0.91),
        "book_green": principled("COS_Book_Green", (0.23, 0.31, 0.14, 1), 0.82),
        "book_gold": principled("COS_Book_Gold", (0.66, 0.45, 0.18, 1), 0.82),
    })


def add_mat(obj, mat):
    obj.data.materials.append(mat)
    return obj


def rounded_box(name, size, location, mat, bevel=0.10, rotation=0.0, parent=None):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=(0, 0, rotation))
    obj = bpy.context.object
    obj.name = name
    obj.scale = tuple(value / 2 for value in size)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("ClaySoftEdge", "BEVEL")
    modifier.width = min(bevel, min(size) * 0.24)
    modifier.segments = 4
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj


def cylinder(name, radius, depth, location, mat, vertices=48, parent=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("ClaySoftEdge", "BEVEL")
    bevel.width = min(0.08, depth * 0.18)
    bevel.segments = 3
    if parent:
        obj.parent = parent
    return obj


def sphere(name, location, scale, mat, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj


def wall_segment(name, start, end, height, parent):
    x1, y1 = start
    x2, y2 = end
    length = math.hypot(x2 - x1, y2 - y1)
    angle = math.atan2(y2 - y1, x2 - x1)
    center = ((x1 + x2) / 2, (y1 + y2) / 2, height / 2)
    wall = rounded_box(name, (length + 0.10, 0.22, height), center, MATS["plaster"], 0.11, angle, parent)
    rounded_box(f"{name}_Cap", (length + 0.18, 0.30, 0.12),
                (center[0], center[1], height + 0.03), MATS["plaster_top"], 0.06, angle, parent)
    rounded_box(f"{name}_Base", (length + 0.10, 0.10, 0.16),
                (center[0], center[1], 0.09), MATS["base"], 0.04, angle, parent)


def polygon_slab(name, points, height, top_z, mat, bevel, parent):
    count = len(points)
    bottom_z = top_z - height
    vertices = [(x, y, bottom_z) for x, y in points] + [(x, y, top_z) for x, y in points]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    modifier = obj.modifiers.new("ClaySoftEdge", "BEVEL")
    modifier.width = bevel
    modifier.segments = 4
    obj.parent = parent
    return obj


def continuous_wall(name, points, height, mat, parent, thickness=0.22, base_z=0.0):
    """Build one continuous ribbon so curved walls do not read as stacked cubes."""
    vertices = []
    for index, (x, y) in enumerate(points):
        previous = Vector(points[max(0, index - 1)])
        following = Vector(points[min(len(points) - 1, index + 1)])
        tangent = (following - previous).normalized()
        normal = Vector((-tangent.y, tangent.x)) * (thickness / 2)
        vertices.extend([
            (x + normal.x, y + normal.y, base_z),
            (x - normal.x, y - normal.y, base_z),
            (x + normal.x, y + normal.y, base_z + height),
            (x - normal.x, y - normal.y, base_z + height),
        ])
    faces = []
    for index in range(len(points) - 1):
        a = index * 4
        b = (index + 1) * 4
        faces.extend([
            (a, b, b + 2, a + 2),
            (a + 1, a + 3, b + 3, b + 1),
            (a + 2, b + 2, b + 3, a + 3),
            (a, a + 1, b + 1, b),
        ])
    faces.extend([(0, 2, 3, 1), (len(vertices) - 4, len(vertices) - 3, len(vertices) - 1, len(vertices) - 2)])
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    modifier = obj.modifiers.new("ClaySoftEdge", "BEVEL")
    modifier.width = min(0.075, thickness * 0.32, height * 0.16)
    modifier.segments = 3
    obj.parent = parent
    return obj


def plant(name, location, scale, parent):
    x, y, z = location
    cylinder(f"{name}_Pot", 0.30 * scale, 0.46 * scale, (x, y, z + 0.23 * scale), MATS["pot"], 32, parent)
    cylinder(f"{name}_Soil", 0.25 * scale, 0.035 * scale, (x, y, z + 0.47 * scale), MATS["charcoal"], 32, parent)
    for index in range(9):
        angle = index * math.tau / 9 + (index % 2) * 0.16
        reach = (0.17 + 0.055 * (index % 3)) * scale
        leaf = sphere(
            f"{name}_Leaf_{index:02d}",
            (x + math.cos(angle) * reach, y + math.sin(angle) * reach, z + (0.72 + 0.13 * (index % 3)) * scale),
            (0.13 * scale, 0.32 * scale, 0.095 * scale),
            MATS["olive_light"] if index % 3 == 0 else MATS["olive_dark"], parent,
        )
        leaf.rotation_euler = (0.20 + 0.08 * (index % 2), 0.38, angle)


def sofa(parent):
    x, y = -3.15, -0.75
    rounded_box("WaitingSofa_Base", (2.20, 0.90, 0.34), (x, y, 0.34), MATS["olive"], 0.17, 0, parent)
    rounded_box("WaitingSofa_Back", (2.20, 0.30, 0.92), (x, y + 0.33, 0.82), MATS["olive"], 0.14, 0, parent)
    rounded_box("WaitingSofa_Arm_L", (0.30, 0.94, 0.60), (x - 1.02, y, 0.56), MATS["olive"], 0.14, 0, parent)
    rounded_box("WaitingSofa_Arm_R", (0.30, 0.94, 0.60), (x + 1.02, y, 0.56), MATS["olive"], 0.14, 0, parent)
    for offset in (-0.52, 0.52):
        rounded_box(f"WaitingSofa_Seat_{offset}", (0.92, 0.70, 0.18), (x + offset, y - 0.04, 0.59), MATS["olive"], 0.12, 0, parent)
        rounded_box(f"WaitingSofa_BackCushion_{offset}", (0.90, 0.18, 0.58), (x + offset, y + 0.14, 0.92), MATS["olive"], 0.11, 0, parent)
    for offset in (-0.86, 0.86):
        cylinder(f"WaitingSofa_Leg_{offset}", 0.055, 0.24, (x + offset, y - 0.28, 0.12), MATS["wood"], 20, parent)
    cushion = rounded_box("WaitingSofa_OrangeCushion", (0.48, 0.16, 0.46), (x + 0.55, y - 0.25, 0.86), MATS["orange"], 0.13, -0.18, parent)
    cushion.rotation_euler[0] = -0.12


def reception_desk(parent):
    # Deliberately authored as one coordinated L-shaped object, matching the
    # reference silhouette instead of inserting a generic catalog desk.
    rounded_box("ReceptionDesk_Front", (3.05, 0.82, 0.92), (0.85, 0.70, 0.48), MATS["wood"], 0.34, 0, parent)
    rounded_box("ReceptionDesk_Return", (0.82, 1.72, 0.92), (-0.27, 1.10, 0.48), MATS["wood"], 0.25, 0, parent)
    rounded_box("ReceptionDesk_Top", (3.18, 0.96, 0.13), (0.85, 0.70, 0.98), MATS["plaster_top"], 0.30, 0, parent)
    rounded_box("ReceptionDesk_ReturnTop", (0.96, 1.84, 0.13), (-0.27, 1.10, 0.98), MATS["plaster_top"], 0.25, 0, parent)
    rounded_box("ReceptionDesk_Monitor", (0.72, 0.10, 0.46), (0.63, 0.28, 1.32), MATS["screen"], 0.05, 0, parent)
    rounded_box("ReceptionDesk_MonitorStand", (0.10, 0.16, 0.32), (0.63, 0.36, 1.12), MATS["charcoal"], 0.03, 0, parent)
    cylinder("ReceptionDesk_Bell", 0.12, 0.10, (1.63, 0.23, 1.09), MATS["brass"], 32, parent)
    sphere("ReceptionDesk_BellDome", (1.63, 0.23, 1.17), (0.11, 0.11, 0.08), MATS["brass"], parent)
    plant("ReceptionDesk_Plant", (-0.05, 0.28, 1.04), 0.44, parent)


def storage_cubby(parent):
    x, y = -0.45, 2.48
    rounded_box("ReceptionStorage_Body", (2.20, 0.42, 1.55), (x, y, 0.82), MATS["wood"], 0.08, 0, parent)
    # Cream recesses create readable cubbies without expensive boolean geometry.
    for row in range(2):
        for col in range(4):
            cx = x - 0.78 + col * 0.52
            cz = 0.86 + row * 0.48
            rounded_box(f"ReceptionStorage_Cubby_{row}_{col}", (0.38, 0.08, 0.34), (cx, y - 0.225, cz), MATS["floor"], 0.035, 0, parent)
            if (row + col) % 3 == 0:
                cylinder(f"ReceptionStorage_Pot_{row}_{col}", 0.085, 0.16, (cx, y - 0.28, cz), MATS["pot"], 20, parent)
            else:
                for book in range(2):
                    rounded_box(f"ReceptionStorage_Book_{row}_{col}_{book}", (0.08, 0.10, 0.24),
                                (cx - 0.06 + book * 0.10, y - 0.28, cz),
                                MATS["book_green"] if book == 0 else MATS["book_gold"], 0.015, 0, parent)
    for offset in (-0.52, 0.52):
        rounded_box(f"ReceptionStorage_Drawer_{offset}", (0.92, 0.08, 0.30), (x + offset, y - 0.24, 0.30), MATS["wood_light"], 0.04, 0, parent)
        rounded_box(f"ReceptionStorage_Handle_{offset}", (0.20, 0.05, 0.04), (x + offset, y - 0.30, 0.33), MATS["charcoal"], 0.02, 0, parent)


def waiting_area(parent):
    cylinder("WaitingRug", 1.52, 0.055, (-3.05, -0.78, 0.04), MATS["terracotta"], 72, parent)
    sofa(parent)
    cylinder("WaitingTable_Top", 0.43, 0.15, (-2.98, -2.00, 0.49), MATS["wood_light"], 40, parent)
    cylinder("WaitingTable_Stem", 0.085, 0.42, (-2.98, -2.00, 0.25), MATS["wood"], 24, parent)
    cylinder("WaitingTable_Base", 0.25, 0.08, (-2.98, -2.00, 0.06), MATS["wood"], 32, parent)
    plant("WaitingTable_Plant", (-2.98, -2.00, 0.56), 0.34, parent)


def wall_art(parent):
    rounded_box("WallArt_Frame", (1.12, 0.10, 0.90), (-3.92, 2.72, 1.34), MATS["wood_light"], 0.06, 0, parent)
    rounded_box("WallArt_Canvas", (0.92, 0.07, 0.70), (-3.92, 2.65, 1.34), MATS["paper"], 0.04, 0, parent)
    sphere("WallArt_Olive", (-4.08, 2.60, 1.37), (0.22, 0.04, 0.20), MATS["olive"], parent)
    sphere("WallArt_Grey", (-3.79, 2.60, 1.49), (0.21, 0.04, 0.18), MATS["base"], parent)
    rounded_box("WallArt_Orange", (0.32, 0.05, 0.16), (-3.89, 2.57, 1.12), MATS["orange"], 0.07, 0, parent)


def build_room():
    root = bpy.data.objects.new("room-reception", None)
    bpy.context.collection.objects.link(root)
    root["company_os_room_kind"] = "RECEPTION"
    root["company_os_contract"] = "OfficeRoomAsset 1.0"
    root["company_os_visual_reference"] = str(REFERENCE_PATH.resolve())
    root["company_os_reference_mode"] = "ART_DIRECTION_CAMERA_MATCH"

    # A continuous irregular footprint replaces the old rounded rectangle shell.
    # Twenty authored controls follow the reference's soft perimeter.
    # The front opening deliberately has no door, matching the approved revision.
    path = [
        (-4.35, -2.10), (-4.68, -1.72), (-4.82, -1.15), (-4.84, -0.20),
        (-4.82, 0.90), (-4.62, 1.88), (-4.15, 2.56), (-3.45, 2.92),
        (-2.30, 3.05), (-0.75, 3.08), (0.90, 3.04), (2.45, 2.98),
        (3.55, 2.72), (4.20, 2.22), (4.52, 1.50), (4.62, 0.50),
        (4.60, -0.55), (4.43, -1.36), (4.05, -1.92), (3.50, -2.28),
    ]
    front = [(3.50, -2.28), (3.12, -2.50), (2.62, -2.62), (1.15, -2.83),
             (-0.65, -2.97), (-2.18, -2.92), (-3.62, -2.72), (-4.35, -2.10)]
    footprint = path + front[1:-1]
    polygon_slab("ReceptionFloor_Platform", footprint, 0.34, -0.08, MATS["plaster"], 0.22, root)
    inset = [(x * 0.975, y * 0.965) for x, y in footprint]
    polygon_slab("ReceptionFloor_Base", inset, 0.18, 0.04, MATS["floor"], 0.15, root)

    # Separate occlusion ownership per side. The seams overlap at corners, so
    # the room still reads as one continuous wall while WebGL can fade only the
    # side actually blocking the fixed-pitch camera.
    wall_sides = {
        "Left": path[:8],
        "Back": path[7:14],
        "Right": path[13:],
    }
    for side, side_path in wall_sides.items():
        continuous_wall(f"OcclusionWall_{side}", side_path, 1.88, MATS["plaster"], root, 0.24)
        continuous_wall(f"OcclusionWall_{side}Cap", side_path, 0.12, MATS["plaster_top"], root, 0.31, 1.84)
        continuous_wall(f"OcclusionWall_{side}Base", side_path, 0.15, MATS["base"], root, 0.12, 0.02)
    # Two low front returns frame the open circulation path; there is no door.
    left_return = [(-4.35, -2.10), (-3.98, -2.46), (-3.62, -2.72), (-2.18, -2.92)]
    right_return = [(3.50, -2.28), (3.12, -2.50), (2.62, -2.62)]
    for index, return_path in enumerate((left_return, right_return)):
        continuous_wall(f"OcclusionWall_Front_{index:02d}", return_path, 0.72, MATS["plaster"], root, 0.24)
        continuous_wall(f"OcclusionWall_FrontCap_{index:02d}", return_path, 0.11, MATS["plaster_top"], root, 0.31, 0.68)

    reception_desk(root)
    storage_cubby(root)
    waiting_area(root)
    wall_art(root)
    plant("Plant_LeftCorner", (-4.10, -1.95, 0.02), 1.05, root)
    plant("Plant_SofaRight", (-1.78, -0.25, 0.02), 0.93, root)
    plant("Plant_BackRight", (3.30, 1.82, 0.02), 1.06, root)
    plant("Plant_FrontPlanterA", (2.72, -2.30, 0.58), 0.58, root)
    plant("Plant_FrontPlanterB", (3.22, -2.15, 0.58), 0.58, root)
    rounded_box("FrontPlanter", (1.75, 0.48, 0.36), (2.98, -2.38, 0.48), MATS["wood_light"], 0.10, -0.12, root)
    return root


def descendants(root):
    result = [root]
    for child in root.children:
        result.extend(descendants(child))
    return result


def setup_camera():
    camera_data = bpy.data.cameras.new("ReferenceMatchedOrthographicCamera")
    camera = bpy.data.objects.new("ReferenceMatchedOrthographicCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (10.8, -13.4, 11.2)
    target = Vector((0, 0.05, 0.55))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 12.6
    camera_data.show_background_images = True
    reference = camera_data.background_images.new()
    reference.image = bpy.data.images.load(str(REFERENCE_PATH.resolve()))
    reference.alpha = 0.22
    reference.display_depth = "BACK"
    bpy.context.scene.camera = camera
    return camera


def setup_lighting():
    world = bpy.context.scene.world
    world.use_nodes = True
    background = next(node for node in world.node_tree.nodes if node.type == "BACKGROUND")
    background.inputs["Color"].default_value = (0.62, 0.49, 0.35, 1)
    background.inputs["Strength"].default_value = 0.72
    for name, location, energy, size, color in (
        ("WarmKey", (-8, -10, 14), 2200, 9.0, (1.0, 0.78, 0.56)),
        ("SoftFill", (10, -4, 9), 1450, 8.0, (0.82, 0.88, 1.0)),
        ("TopBounce", (0, 7, 15), 1800, 10.0, (1.0, 0.90, 0.72)),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = color
        obj = bpy.data.objects.new(name, data)
        obj.location = location
        bpy.context.collection.objects.link(obj)


def configure_render():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1536
    scene.render.resolution_y = 1152
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.filepath = str(PREVIEW_PATH.resolve())


def export(root):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in descendants(root):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH.resolve()), export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_extras=True,
    )


reset_scene()
build_materials()
configure_render()
setup_lighting()
setup_camera()
room_root = build_room()
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH.resolve()))
bpy.ops.render.render(write_still=True)
export(room_root)

digest = hashlib.sha256(GLB_PATH.read_bytes()).hexdigest()
manifest = {
    "schemaVersion": "1.0",
    "contract": "OfficeRoomAsset 1.0",
    "style": "COMPANY_OS_REFERENCE_MATCHED_WARM_CLAY",
    "unit": "METER",
    "rooms": [{
        "id": "room-reception",
        "kind": "RECEPTION",
        "label": "前台",
        "formatVersion": "1.0",
        "src": "/assets/3d/detail/rooms/room-reception.glb",
        "sha256": digest,
        "bytes": GLB_PATH.stat().st_size,
        "size": [10.1, 7.2, 2.35],
        "assetIds": [
            "reference-matched-architecture", "reference-matched-reception-desk",
            "reference-matched-waiting-area", "reference-matched-storage",
            "reference-matched-plants", "reference-matched-wall-art",
        ],
        "placements": 6,
        "preview": str(PREVIEW_PATH),
        "reference": str(REFERENCE_PATH),
        "referenceRole": "ART_DIRECTION_CAMERA_MATCH",
        "interactiveSlots": ["receptionist", "monitor", "bell", "waiting-seat"],
    }],
    "showcase": None,
}
MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("REFERENCE_RECEPTION", {"bytes": GLB_PATH.stat().st_size, "sha256": digest, "preview": str(PREVIEW_PATH)})
