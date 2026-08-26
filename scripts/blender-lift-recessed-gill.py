"""Lift the recessed leading gill on both sides without regenerating the mesh.

Usage:
  Blender --background --factory-startup --python scripts/blender-lift-recessed-gill.py -- input.glb output.glb
"""

import math
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


def smoothstep(value):
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


moved = []
for vertex in obj.data.vertices:
    point = vertex.co
    # The leading gill occupies the first y-cluster on both lateral surfaces.
    # A compact falloff prevents a seam and leaves the next two bars untouched.
    y_weight = smoothstep(1.0 - abs(point.y + 0.352) / 0.068)
    z_weight = smoothstep(1.0 - abs(point.z + 0.074) / 0.155)
    x_weight = smoothstep((abs(point.x) - 0.405) / 0.055)
    weight = y_weight * z_weight * x_weight
    if weight <= 0.0:
        continue
    displacement = math.copysign(0.052 * weight, point.x)
    point.x += displacement
    moved.append((vertex.index, weight, displacement))

if not 80 <= len(moved) <= 1200:
    raise RuntimeError(f"Unexpected moved vertex count: {len(moved)}")

obj.data.update()
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

print(
    "RECESSED_GILL_LIFTED",
    {
        "vertices": len(moved),
        "max_displacement": round(max(abs(item[2]) for item in moved), 5),
        "output": str(output_path),
    },
)
