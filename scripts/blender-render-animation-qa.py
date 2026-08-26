"""Render one representative deformation frame for every GLB animation."""

import sys
from pathlib import Path

import bpy
from mathutils import Vector


def look_at(item, target):
    item.rotation_euler = (Vector(target) - item.location).to_track_quat("-Z", "Y").to_euler()


arguments = sys.argv[sys.argv.index("--") + 1 :]
if len(arguments) != 2:
    raise SystemExit("Expected input GLB and output directory.")
input_path = Path(arguments[0]).resolve()
output_directory = Path(arguments[1]).resolve()
output_directory.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(input_path))
for item in list(bpy.context.scene.objects):
    if item.type == "MESH" and item.name == "Icosphere" and not item.data.materials:
        bpy.data.objects.remove(item, do_unlink=True)

meshes = [item for item in bpy.context.scene.objects if item.type == "MESH"]
rig = next((item for item in bpy.context.scene.objects if item.type == "ARMATURE"), None)
if not meshes or not rig:
    raise RuntimeError("Expected a skinned mesh and armature.")
corners = [item.matrix_world @ Vector(corner) for item in meshes for corner in item.bound_box]
minimum = Vector((min(point.x for point in corners), min(point.y for point in corners), min(point.z for point in corners)))
maximum = Vector((max(point.x for point in corners), max(point.y for point in corners), max(point.z for point in corners)))
extent = maximum - minimum

bpy.ops.mesh.primitive_plane_add(size=max(extent) * 5, location=(0, 0, -0.02))
plane = bpy.context.object
ground_material = bpy.data.materials.new("QA_Ground_Material")
ground_material.diffuse_color = (0.78, 0.74, 0.66, 1)
ground_material.roughness = 0.9
plane.data.materials.append(ground_material)

bpy.ops.object.camera_add(location=(-4.0, -4.0, 2.8))
camera = bpy.context.object
camera.data.type = "ORTHO"
camera.data.ortho_scale = max(extent) * 1.7
look_at(camera, (0, 0, extent.z * 0.48))
bpy.context.scene.camera = camera
for location, energy, size in [((-3.5, -4.5, 5.5), 1150, 4.0), ((4.0, -1.0, 3.0), 650, 3.0), ((1.0, 4.0, 4.5), 900, 2.5)]:
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.data.energy = energy
    light.data.size = size
    look_at(light, (0, 0, extent.z * 0.45))

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.world.color = (0.055, 0.045, 0.035)
scene.view_settings.look = "AgX - Medium High Contrast"

rig.animation_data_create()
for action in sorted(bpy.data.actions, key=lambda item: item.name):
    rig.animation_data.action = action
    start, end = action.frame_range
    frame = round(start + (end - start) * (0.42 if action.name != "COS_CELEBRATE" else 0.38))
    scene.frame_set(frame)
    scene.render.filepath = str(output_directory / f"{action.name.lower()}.png")
    bpy.ops.render.render(write_still=True)
    print("ANIMATION_QA", action.name, frame, tuple(round(value, 2) for value in action.frame_range))
