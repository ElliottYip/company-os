"""Normalize all faces in gill UV islands to one clay-orange material.

Usage:
  Blender --background --factory-startup --python scripts/blender-normalize-gill-material.py -- input.glb output.glb
"""

import sys
from collections import defaultdict, deque
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
uv_data = mesh.uv_layers.active.data
material = mesh.materials[0]
images = [node.image for node in material.node_tree.nodes if node.type == "TEX_IMAGE" and node.image]
diffuse = next((image for image in images if "diffuse" in image.name.lower()), None)
if diffuse is None:
    raise RuntimeError("Diffuse texture not found.")

width, height = diffuse.size
pixels = list(diffuse.pixels)


def sample(uv):
    x = min(width - 1, max(0, int((uv.x % 1.0) * width)))
    y = min(height - 1, max(0, int((uv.y % 1.0) * height)))
    offset = (y * width + x) * 4
    return pixels[offset : offset + 3]


def is_orange(polygon):
    colors = [sample(uv_data[index].uv) for index in polygon.loop_indices]
    r, g, b = [sum(channel) / len(colors) for channel in zip(*colors)]
    return r > 0.35 and r > g * 1.45 and r > b * 1.8


# Polygon adjacency is restricted to UV-continuous mesh edges. This grows the
# orange seed faces across each complete bar without leaking over a UV seam
# into the blue body.
edge_polygons = defaultdict(list)
polygon_uvs = {}
for polygon in mesh.polygons:
    uv_by_vertex = {}
    for loop_index in polygon.loop_indices:
        loop = mesh.loops[loop_index]
        uv_by_vertex[loop.vertex_index] = uv_data[loop_index].uv.copy()
    polygon_uvs[polygon.index] = uv_by_vertex
    vertices = list(polygon.vertices)
    for index, a in enumerate(vertices):
        b = vertices[(index + 1) % len(vertices)]
        edge_polygons[tuple(sorted((a, b)))].append(polygon.index)

adjacency = [set() for _ in mesh.polygons]
for edge, polygons in edge_polygons.items():
    if len(polygons) != 2:
        continue
    first, second = polygons
    a, b = edge
    first_uvs = polygon_uvs[first]
    second_uvs = polygon_uvs[second]
    if a not in first_uvs or b not in first_uvs or a not in second_uvs or b not in second_uvs:
        continue
    continuous = (
        (first_uvs[a] - second_uvs[a]).length < 1e-5
        and (first_uvs[b] - second_uvs[b]).length < 1e-5
    )
    if continuous:
        adjacency[first].add(second)
        adjacency[second].add(first)

orange_seeds = {polygon.index for polygon in mesh.polygons if is_orange(polygon)}
unseen = set(range(len(mesh.polygons)))
selected_islands = []
selected_polygons = set()
while unseen:
    seed = unseen.pop()
    queue = deque([seed])
    island = {seed}
    while queue:
        current = queue.popleft()
        for neighbor in adjacency[current]:
            if neighbor in unseen:
                unseen.remove(neighbor)
                island.add(neighbor)
                queue.append(neighbor)

    island_seeds = island & orange_seeds
    if not island_seeds:
        continue
    centers = [obj.matrix_world @ mesh.polygons[index].center for index in island_seeds]
    center_x = sum(point.x for point in centers) / len(centers)
    center_y = sum(point.y for point in centers) / len(centers)
    center_z = sum(point.z for point in centers) / len(centers)
    if abs(center_x) > 0.38 and -0.50 < center_y < -0.10 and -0.28 < center_z < 0.12:
        selected_islands.append((len(island), len(island_seeds), (center_x, center_y, center_z)))
        selected_polygons.update(island)

if not selected_polygons:
    raise RuntimeError("No gill UV islands selected.")

gill_material = bpy.data.materials.new("COS_Gill_Coral")
gill_material.use_nodes = True
principled = gill_material.node_tree.nodes.get("Principled BSDF")
principled.inputs["Base Color"].default_value = (1.0, 0.095, 0.025, 1.0)
principled.inputs["Roughness"].default_value = 0.52
mesh.materials.append(gill_material)
gill_material_index = len(mesh.materials) - 1
for polygon_index in selected_polygons:
    mesh.polygons[polygon_index].material_index = gill_material_index

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
    "GILL_MATERIAL_NORMALIZED",
    {
        "orange_seed_faces": len(orange_seeds),
        "selected_faces": len(selected_polygons),
        "selected_islands": [
            {
                "faces": faces,
                "seed_faces": seeds,
                "center": [round(value, 4) for value in center],
            }
            for faces, seeds, center in selected_islands
        ],
        "output": str(output_path),
    },
)
