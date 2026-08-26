"""Export one project-owned Blender asset library file to a browser-ready GLB.

The source files intentionally contain unlinked asset data blocks. This script
links their hierarchy into a clean scene, preserves meter scale and anchor
empties, exports a GLB, and renders a neutral inspection preview.
"""

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def argument(name: str) -> str:
    index = sys.argv.index(name)
    return sys.argv[index + 1]


asset_id = argument("--asset-id")
output_directory = Path(argument("--output-directory")).resolve()
output_directory.mkdir(parents=True, exist_ok=True)

scene = bpy.context.scene
collection = scene.collection
for obj in list(bpy.data.objects):
    if not obj.users_collection:
        collection.objects.link(obj)

mesh_objects = [obj for obj in scene.objects if obj.type == "MESH"]
if not mesh_objects:
    raise RuntimeError(f"{asset_id}: source contains no mesh objects")

for obj in scene.objects:
    obj.select_set(True)

glb_path = output_directory / "base_basic_pbr.glb"
bpy.ops.export_scene.gltf(
    filepath=str(glb_path),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_extras=True,
)

world = bpy.data.worlds.new("COS_Preview_World") if not scene.world else scene.world
scene.world = world
world.use_nodes = True
background = next(
    (node for node in world.node_tree.nodes if node.type == "BACKGROUND"),
    None,
)
if background is None:
    background = world.node_tree.nodes.new("ShaderNodeBackground")
    output = next(
        (node for node in world.node_tree.nodes if node.type == "OUTPUT_WORLD"),
        world.node_tree.nodes.new("ShaderNodeOutputWorld"),
    )
    world.node_tree.links.new(background.outputs["Background"], output.inputs["Surface"])
background.inputs["Color"].default_value = (0.055, 0.055, 0.055, 1)
background.inputs["Strength"].default_value = 0.22

bounds = [obj.matrix_world @ Vector(corner) for obj in mesh_objects for corner in obj.bound_box]
minimum = Vector(tuple(min(point[index] for point in bounds) for index in range(3)))
maximum = Vector(tuple(max(point[index] for point in bounds) for index in range(3)))
center = (minimum + maximum) * 0.5
dimensions = maximum - minimum
radius = max(dimensions.length * 0.65, 0.5)

camera_data = bpy.data.cameras.new("COS_Preview_Camera")
camera = bpy.data.objects.new("COS_Preview_Camera", camera_data)
collection.objects.link(camera)
scene.camera = camera
camera_data.type = "ORTHO"
camera_data.ortho_scale = max(dimensions.x, dimensions.y, dimensions.z) * 1.45
camera.location = center + Vector((radius * 1.6, -radius * 1.9, radius * 1.35))
direction = center - camera.location
camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

for name, location, energy, size in (
    ("COS_Key", center + Vector((-radius, -radius * 1.4, radius * 2.0)), 900.0, radius * 2.5),
    ("COS_Fill", center + Vector((radius * 1.4, -radius * 0.5, radius)), 500.0, radius * 2.0),
):
    light_data = bpy.data.lights.new(name, "AREA")
    light_data.energy = energy
    light_data.shape = "DISK"
    light_data.size = max(size, 1.0)
    light = bpy.data.objects.new(name, light_data)
    light.location = location
    light.rotation_euler = (center - location).to_track_quat("-Z", "Y").to_euler()
    collection.objects.link(light)

try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
except TypeError:
    scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "JPEG"
scene.render.image_settings.color_mode = "RGB"
scene.render.filepath = str(output_directory / "render.jpg")
scene.render.film_transparent = False
scene.view_settings.look = "AgX - Medium High Contrast"
bpy.ops.render.render(write_still=True)

metadata = {
    "schemaVersion": "1.0",
    "assetId": asset_id,
    "provider": "Company OS parametric Blender source",
    "generationMode": "PROJECT_OWNED_PARAMETRIC",
    "unit": "METER",
    "meshObjects": len(mesh_objects),
    "vertices": sum(len(obj.data.vertices) for obj in mesh_objects),
    "polygons": sum(len(obj.data.polygons) for obj in mesh_objects),
    "bounds": {
        "min": list(minimum),
        "max": list(maximum),
        "dimensions": list(dimensions),
    },
}
(output_directory / "generation.json").write_text(json.dumps(metadata, indent=2) + "\n")
print(json.dumps(metadata))
