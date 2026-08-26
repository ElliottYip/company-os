"""Report topological component bounds for each mesh in an imported GLB."""

import json
import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy
from mathutils import Vector


arguments = sys.argv[sys.argv.index("--") + 1 :]
if len(arguments) != 2:
    raise SystemExit("Expected input GLB and output JSON path.")

input_path = Path(arguments[0]).resolve()
output_path = Path(arguments[1]).resolve()
output_path.parent.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(input_path))

report = {"schemaVersion": "1.0", "input": str(input_path), "meshes": []}
for obj in sorted((item for item in bpy.context.scene.objects if item.type == "MESH"), key=lambda item: item.name):
    mesh = obj.data
    adjacency = defaultdict(set)
    for edge in mesh.edges:
        a, b = edge.vertices
        adjacency[a].add(b)
        adjacency[b].add(a)

    unseen = set(range(len(mesh.vertices)))
    components = []
    while unseen:
        start = unseen.pop()
        queue = deque([start])
        indices = [start]
        while queue:
            current = queue.popleft()
            for neighbor in adjacency[current]:
                if neighbor not in unseen:
                    continue
                unseen.remove(neighbor)
                queue.append(neighbor)
                indices.append(neighbor)
        points = [obj.matrix_world @ mesh.vertices[index].co for index in indices]
        minimum = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
        maximum = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
        center = (minimum + maximum) / 2
        components.append(
            {
                "vertices": len(indices),
                "min": [round(value, 6) for value in minimum],
                "max": [round(value, 6) for value in maximum],
                "center": [round(value, 6) for value in center],
                "size": [round(value, 6) for value in maximum - minimum],
            }
        )
    components.sort(key=lambda item: item["vertices"], reverse=True)
    report["meshes"].append({"name": obj.name, "vertices": len(mesh.vertices), "components": components})

output_path.write_text(json.dumps(report, indent=2) + "\n")
print("COMPONENT_REPORT", output_path, sum(len(mesh["components"]) for mesh in report["meshes"]))
