"""Replace malformed generated gills with exact procedural geometry.

Usage:
  Blender --background --factory-startup --python scripts/blender-rebuild-fish-gills.py -- input.glb output.glb
"""

import sys
from pathlib import Path

import bpy
import bmesh


arguments = sys.argv[sys.argv.index("--") + 1 :]
if len(arguments) != 2:
    raise SystemExit("Expected input GLB and output GLB.")

input_path = Path(arguments[0]).resolve()
output_path = Path(arguments[1]).resolve()
output_path.parent.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(input_path))

meshes = [item for item in bpy.context.scene.objects if item.type == "MESH"]
if len(meshes) != 1:
    raise RuntimeError(f"Expected one source mesh, found {len(meshes)}.")

source = meshes[0]
mesh = source.data

# Hyper3D emitted two overlapping disconnected gill shells per side. Their
# bounding boxes are isolated at the lateral extremes, ahead of the fins.
adjacency = [set() for _ in mesh.vertices]
for edge in mesh.edges:
    a, b = edge.vertices
    adjacency[a].add(b)
    adjacency[b].add(a)

unseen = set(range(len(mesh.vertices)))
remove_indices = set()
removed_components = []
while unseen:
    seed = unseen.pop()
    stack = [seed]
    indices = [seed]
    while stack:
        current = stack.pop()
        for neighbor in adjacency[current]:
            if neighbor in unseen:
                unseen.remove(neighbor)
                stack.append(neighbor)
                indices.append(neighbor)

    points = [mesh.vertices[index].co for index in indices]
    min_x, max_x = min(p.x for p in points), max(p.x for p in points)
    min_y, max_y = min(p.y for p in points), max(p.y for p in points)
    min_z, max_z = min(p.z for p in points), max(p.z for p in points)
    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2
    center_z = (min_z + max_z) / 2
    size_x = max_x - min_x

    is_generated_gill_shell = (
        abs(center_x) > 0.48
        and size_x < 0.20
        and -0.40 < center_y < -0.18
        and -0.56 < center_z < -0.38
    )
    if is_generated_gill_shell:
        remove_indices.update(indices)
        removed_components.append((round(center_x, 4), len(indices)))

if len(removed_components) != 4:
    raise RuntimeError(f"Expected four malformed gill components, found {removed_components}.")

editable = bmesh.new()
editable.from_mesh(mesh)
editable.verts.ensure_lookup_table()
bmesh.ops.delete(editable, geom=[editable.verts[index] for index in remove_indices], context="VERTS")
editable.to_mesh(mesh)
editable.free()
mesh.update()

gill_material = bpy.data.materials.new("COS_Gill_Coral")
gill_material.diffuse_color = (1.0, 0.16, 0.055, 1.0)
gill_material.metallic = 0.0
gill_material.roughness = 0.52

# Each side receives exactly three equal ellipsoidal capsules. All six share
# the same z-axis, scale and y-spacing, which guarantees true parallelism.
gill_objects = []
for side in (-1, 1):
    for index, y in enumerate((-0.43, -0.285, -0.14), start=1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=(side * 0.548, y, -0.455))
        gill = bpy.context.object
        gill.name = f"COS_Gill_{'L' if side < 0 else 'R'}_{index}"
        gill.scale = (0.034, 0.044, 0.205)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        gill.data.materials.append(gill_material)
        for polygon in gill.data.polygons:
            polygon.use_smooth = True
        gill_objects.append(gill)

# Keep the gills as named parts for future rigging and deterministic QA.
bpy.ops.object.select_all(action="DESELECT")
source.select_set(True)
for gill in gill_objects:
    gill.select_set(True)

bpy.ops.export_scene.gltf(
    filepath=str(output_path),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_materials="EXPORT",
)

print(
    "GILL_REBUILD",
    {
        "removed_components": removed_components,
        "new_gills": len(gill_objects),
        "spacing": 0.145,
        "parallel_axis": "Z",
        "output": str(output_path),
    },
)
