"""Create a bounded web candidate from an immutable generated GLB.

The source is never modified. The derivative is normalized to the asset-spec
meter bounds, decimated to a polygon budget, given stable semantic anchors, and
exported with bounded embedded textures plus secret-free provenance metadata.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def value(name: str) -> str:
    return sys.argv[sys.argv.index(name) + 1]


source = Path(value("--source")).resolve()
output = Path(value("--output")).resolve()
asset_id = value("--asset-id")
target_size = Vector(json.loads(value("--target-size")))
target_polygons = int(value("--target-polygons"))
texture_limit = int(value("--texture-limit"))
anchors = json.loads(value("--anchors"))

output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))

meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if not meshes:
    raise RuntimeError(f"{asset_id}: no mesh in source")

source_polygons = sum(len(obj.data.polygons) for obj in meshes)
if source_polygons > target_polygons:
    ratio = max(0.02, target_polygons / source_polygons)
    for obj in meshes:
        modifier = obj.modifiers.new("COS_Web_Decimate", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)

for image in bpy.data.images:
    if image.size[0] <= 0 or image.size[1] <= 0:
        continue
    scale = min(1.0, texture_limit / max(image.size[0], image.size[1]))
    if scale < 1.0:
        image.scale(max(1, round(image.size[0] * scale)), max(1, round(image.size[1] * scale)))
    image.pack()

meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
bounds = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
minimum = Vector(tuple(min(point[i] for point in bounds) for i in range(3)))
maximum = Vector(tuple(max(point[i] for point in bounds) for i in range(3)))
dimensions = maximum - minimum
if any(not math.isfinite(component) or component <= 0 for component in dimensions):
    raise RuntimeError(f"{asset_id}: invalid source bounds {tuple(dimensions)}")

uniform_scale = min(target_size[i] / dimensions[i] for i in range(3))
source_center = (minimum + maximum) * 0.5
translation = Vector((-source_center.x, -source_center.y, -minimum.z))

root = bpy.data.objects.new("root", None)
bpy.context.collection.objects.link(root)
for obj in list(bpy.context.scene.objects):
    if obj is root or obj.parent is not None:
        continue
    obj.parent = root
for obj in meshes:
    obj.location += translation
root.scale = (uniform_scale, uniform_scale, uniform_scale)
root["company_os_asset_id"] = asset_id
root["company_os_unit"] = "METER"

for anchor_name in anchors:
    if anchor_name == "root":
        continue
    anchor = bpy.data.objects.new(anchor_name, None)
    bpy.context.collection.objects.link(anchor)
    anchor.parent = root
    anchor_meters = Vector((0.0, 0.0, target_size.z * 0.72))
    if anchor_name == "seat":
        anchor_meters.z = target_size.z * 0.52
    elif anchor_name == "seat-left":
        anchor_meters = Vector((-target_size.x * 0.22, 0.0, target_size.z * 0.52))
    elif anchor_name == "seat-right":
        anchor_meters = Vector((target_size.x * 0.22, 0.0, target_size.z * 0.52))
    elif anchor_name == "visitor":
        anchor_meters = Vector((0.0, -target_size.y * 0.65, 0.0))
    elif anchor_name == "workstation":
        anchor_meters.z = target_size.z * 0.82
    elif anchor_name == "screen":
        anchor_meters.z = target_size.z * 0.55
    elif anchor_name == "pickup":
        anchor_meters.z = target_size.z * 0.78
    anchor.location = anchor_meters / uniform_scale
    anchor["company_os_semantic_anchor"] = True

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=str(output),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_extras=True,
)

result_polygons = sum(len(obj.data.polygons) for obj in meshes)
metadata = {
    "schemaVersion": "1.0",
    "assetId": asset_id,
    "source": str(source),
    "sourcePolygons": source_polygons,
    "resultPolygons": result_polygons,
    "targetPolygons": target_polygons,
    "textureLimit": texture_limit,
    "targetBoundsMeters": list(target_size),
    "uniformScale": uniform_scale,
    "anchors": anchors,
    "output": str(output),
    "outputBytes": output.stat().st_size,
}
metadata_path = output.with_suffix(".json")
metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
print(json.dumps(metadata))
