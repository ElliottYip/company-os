"""Apply one material only to the six protruding gill surfaces.

Usage:
  Blender --background --factory-startup --python scripts/blender-color-gill-faces.py -- input.glb output.glb
"""

import sys
from pathlib import Path

import bpy


arguments = sys.argv[sys.argv.index("--") + 1 :]
if len(arguments) != 2:
    raise SystemExit("Expected input GLB and output GLB.")

input_path = Path(arguments[0]).resolve()
output_path = Path(arguments[1]).resolve()
output_path.parent.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(input_path))
obj = next(item for item in bpy.context.scene.objects if item.type == "MESH")
mesh = obj.data

gill_material = bpy.data.materials.new("COS_Gill_Coral")
gill_material.use_nodes = True
principled = gill_material.node_tree.nodes.get("Principled BSDF")
principled.inputs["Base Color"].default_value = (1.0, 0.095, 0.025, 1.0)
principled.inputs["Metallic"].default_value = 0.0
principled.inputs["Roughness"].default_value = 0.52
mesh.materials.append(gill_material)
material_index = len(mesh.materials) - 1

selected = []
for polygon in mesh.polygons:
    center = obj.matrix_world @ polygon.center
    if (
        abs(center.x) > 0.445
        and -0.405 < center.y < -0.155
        and -0.215 < center.z < 0.065
    ):
        polygon.material_index = material_index
        selected.append(polygon.index)

if not 800 <= len(selected) <= 2200:
    raise RuntimeError(f"Unexpected gill face count: {len(selected)}")

bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.export_scene.gltf(
    filepath=str(output_path),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_materials="EXPORT",
)

print("GILL_FACES_COLORED", {"faces": len(selected), "output": str(output_path)})
