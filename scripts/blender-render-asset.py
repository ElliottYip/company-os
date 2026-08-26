"""Render fixed QA views for a GLB asset.

Usage:
  Blender --background --factory-startup --python scripts/blender-render-asset.py -- input.glb output-directory
"""

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def look_at(camera, target):
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


arguments = sys.argv[sys.argv.index("--") + 1 :]
if len(arguments) != 2:
    raise SystemExit("Expected input GLB and output directory.")

input_path = Path(arguments[0]).resolve()
output_directory = Path(arguments[1]).resolve()
output_directory.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(input_path))
meshes = [item for item in bpy.context.scene.objects if item.type == "MESH"]
if not meshes:
    raise RuntimeError("GLB contains no mesh.")

corners = []
for mesh in meshes:
    corners.extend(mesh.matrix_world @ Vector(corner) for corner in mesh.bound_box)
minimum = Vector((min(point.x for point in corners), min(point.y for point in corners), min(point.z for point in corners)))
maximum = Vector((max(point.x for point in corners), max(point.y for point in corners), max(point.z for point in corners)))
center = (minimum + maximum) / 2
extent = maximum - minimum
for mesh in meshes:
    mesh.location -= Vector((center.x, center.y, minimum.z))

bpy.ops.mesh.primitive_plane_add(size=max(extent) * 5, location=(0, 0, -0.015))
plane = bpy.context.object
plane.name = "QA_Ground"
material = bpy.data.materials.new("QA_Ground_Material")
material.diffuse_color = (0.78, 0.74, 0.66, 1)
material.roughness = 0.9
plane.data.materials.append(material)

bpy.ops.object.camera_add()
camera = bpy.context.object
bpy.context.scene.camera = camera
camera.data.type = "ORTHO"
camera.data.ortho_scale = max(extent.x, extent.y, extent.z) * 1.45

for name, location, energy, size in [
    ("Key", (-3.5, -4.5, 5.5), 1150, 4.0),
    ("Fill", (4.0, -1.0, 3.0), 650, 3.0),
    ("Rim", (1.0, 4.0, 4.5), 900, 2.5),
]:
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    look_at(light, (0, 0, extent.z * 0.45))

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.world.color = (0.055, 0.045, 0.035)
scene.view_settings.look = "AgX - Medium High Contrast"

distance = max(extent) * 3.2
target = (0, 0, extent.z * 0.47)
views = {
    "negative-y": (0, -distance, extent.z * 0.55),
    "positive-y": (0, distance, extent.z * 0.55),
    "negative-x": (-distance, 0, extent.z * 0.55),
    "positive-x": (distance, 0, extent.z * 0.55),
    "isometric": (-distance * 0.72, -distance * 0.72, distance * 0.55),
}
for view_name, location in views.items():
    camera.location = location
    look_at(camera, target)
    scene.render.filepath = str(output_directory / f"{view_name}.png")
    bpy.ops.render.render(write_still=True)

print(
    "ASSET_QA",
    {
        "meshes": len(meshes),
        "vertices": sum(len(mesh.data.vertices) for mesh in meshes),
        "polygons": sum(len(mesh.data.polygons) for mesh in meshes),
        "materials": sorted({material.name for mesh in meshes for material in mesh.data.materials if material}),
        "dimensions": [round(value, 5) for value in extent],
    },
)
