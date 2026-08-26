"""Normalize, rig, animate, and export one Company OS fish asset.

Usage:
  Blender --background --factory-startup --python scripts/blender-prepare-fish.py -- \
    input.glb asset-id display-name output.blend output.glb audit.json
"""

import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def bounds(objects):
    corners = [item.matrix_world @ Vector(corner) for item in objects for corner in item.bound_box]
    minimum = Vector((min(point.x for point in corners), min(point.y for point in corners), min(point.z for point in corners)))
    maximum = Vector((max(point.x for point in corners), max(point.y for point in corners), max(point.z for point in corners)))
    return minimum, maximum


def file_hash(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def add_bone(armature, name, head, tail, parent=None):
    bone = armature.edit_bones.new(name)
    bone.head = head
    bone.tail = tail
    bone.parent = parent
    return bone


def add_anchor(name, location, parent, bone=None):
    anchor = bpy.data.objects.new(name, None)
    anchor.empty_display_type = "PLAIN_AXES"
    anchor.empty_display_size = 0.08
    anchor.location = location
    bpy.context.collection.objects.link(anchor)
    anchor.parent = parent
    if bone:
        anchor.parent_type = "BONE"
        anchor.parent_bone = bone
    anchor["company_os_anchor"] = True
    return anchor


def reset_pose(armature_object):
    for pose_bone in armature_object.pose.bones:
        pose_bone.rotation_mode = "XYZ"
        pose_bone.location = (0, 0, 0)
        pose_bone.rotation_euler = (0, 0, 0)
        pose_bone.scale = (1, 1, 1)


def create_action(armature_object, name, end_frame, keyframes):
    action = bpy.data.actions.new(name)
    armature_object.animation_data_create()
    armature_object.animation_data.action = action
    reset_pose(armature_object)
    for frame, values in keyframes:
        for bone_name, transforms in values.items():
            bone = armature_object.pose.bones[bone_name]
            if "location" in transforms:
                bone.location = transforms["location"]
                bone.keyframe_insert(data_path="location", frame=frame, group=bone_name)
            if "rotation" in transforms:
                bone.rotation_euler = transforms["rotation"]
                bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=bone_name)
    action.frame_range = (1, end_frame)
    armature_object.animation_data.action = None
    return action


arguments = sys.argv[sys.argv.index("--") + 1 :]
if len(arguments) != 6:
    raise SystemExit("Expected input, asset ID, display name, .blend output, .glb output, and audit JSON.")

input_path, asset_id, display_name, blend_path, glb_path, audit_path = arguments
input_path = Path(input_path).resolve()
blend_path = Path(blend_path).resolve()
glb_path = Path(glb_path).resolve()
audit_path = Path(audit_path).resolve()
for path in (blend_path, glb_path, audit_path):
    path.parent.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(input_path))
meshes = [item for item in bpy.context.scene.objects if item.type == "MESH"]
if len(meshes) != 1:
    raise RuntimeError(f"Expected one mesh, found {len(meshes)}.")
mesh = meshes[0]
mesh.name = f"COS_{asset_id}_Mesh"
mesh.data.name = f"COS_{asset_id}_Geometry"

# Hyper3D fish arrive with the face toward -Y. Company OS character forward is -X.
mesh.rotation_mode = "XYZ"
mesh.rotation_euler.z = -math.pi / 2
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
minimum, maximum = bounds([mesh])
scale = 2.0 / (maximum.x - minimum.x)
mesh.scale = (scale, scale, scale)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
minimum, maximum = bounds([mesh])
mesh.location -= Vector(((minimum.x + maximum.x) / 2, (minimum.y + maximum.y) / 2, minimum.z))
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
mesh.data.validate(verbose=True, clean_customdata=False)
mesh.data.update()
minimum, maximum = bounds([mesh])
extent = maximum - minimum

# Preserve the generated PBR texture while enforcing a clay-like roughness floor.
for material in mesh.data.materials:
    if not material or not material.use_nodes:
        continue
    material.name = f"COS_{asset_id}_Clay"
    principled = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if not principled:
        continue
    roughness = principled.inputs.get("Roughness")
    if roughness and roughness.is_linked:
        source_socket = roughness.links[0].from_socket
        material.node_tree.links.remove(roughness.links[0])
        floor = material.node_tree.nodes.new("ShaderNodeMath")
        floor.name = "COS_Clay_Roughness_Floor"
        floor.operation = "MAXIMUM"
        floor.inputs[1].default_value = 0.62
        material.node_tree.links.new(source_socket, floor.inputs[0])
        material.node_tree.links.new(floor.outputs[0], roughness)
    elif roughness:
        roughness.default_value = max(roughness.default_value, 0.62)

body_height = extent.z * 0.52
bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
rig = bpy.context.object
rig.name = f"COS_{asset_id}_Rig"
armature = rig.data
armature.name = f"COS_{asset_id}_Armature"
armature.edit_bones.remove(armature.edit_bones[0])
root = add_bone(armature, "root", (0, 0, body_height * 0.75), (0, 0, body_height))
body = add_bone(armature, "body", (0, 0, body_height), (-0.55, 0, body_height), root)
tail = add_bone(armature, "tail", (0.42, 0, body_height), (0.98, 0, body_height), root)
fin_left = add_bone(armature, "fin.L", (-0.12, 0.24, body_height * 0.8), (-0.15, extent.y * 0.52, body_height * 0.35), body)
fin_right = add_bone(armature, "fin.R", (-0.12, -0.24, body_height * 0.8), (-0.15, -extent.y * 0.52, body_height * 0.35), body)
dorsal = add_bone(armature, "dorsal", (0, 0, extent.z * 0.67), (0.08, 0, extent.z * 0.98), body)
gaze = add_bone(armature, "gaze", (-0.45, 0, body_height * 1.12), (-0.92, 0, body_height * 1.12), body)
bpy.ops.object.mode_set(mode="OBJECT")

# Hyper3D returns a fused mesh. Heat weights visibly tear intersections between
# the body and fins, so v1 deliberately uses one rigid root weight. Named fin,
# tail, dorsal, and gaze bones establish the future skinning contract without
# pretending that automatic deformation is production-safe.
mesh.parent = rig
mesh.parent_type = "OBJECT"
modifier = mesh.modifiers.new("COS_Rigid_Rig", "ARMATURE")
modifier.object = rig
root_group = mesh.vertex_groups.new(name="root")
root_group.add(range(len(mesh.data.vertices)), 1.0, "REPLACE")

add_anchor("root", (0, 0, 0), rig, "root")
add_anchor("gaze", (0, 0, 0), rig, "gaze")
add_anchor("fin_left", (0, 0, 0), rig, "fin.L")
add_anchor("fin_right", (0, 0, 0), rig, "fin.R")
add_anchor("tail", (0, 0, 0), rig, "tail")
add_anchor("dorsal", (0, 0, 0), rig, "dorsal")
add_anchor("workstation", (-0.78, 0, body_height * 0.58), rig)
add_anchor("door", (-0.92, 0, body_height), rig)
add_anchor("handheld_prop", (-0.48, extent.y * 0.42, body_height * 0.48), rig)

actions = [
    create_action(rig, "COS_IDLE", 60, [
        (1, {"root": {"location": (0, 0, 0), "rotation": (0, 0, -0.025)}}),
        (30, {"root": {"location": (0, 0, 0.07), "rotation": (0, 0, 0.025)}}),
        (60, {"root": {"location": (0, 0, 0), "rotation": (0, 0, -0.025)}}),
    ]),
    create_action(rig, "COS_WORK", 40, [
        (1, {"root": {"location": (0, 0, 0), "rotation": (0, 0.02, -0.04)}}),
        (20, {"root": {"location": (-0.035, 0, 0.025), "rotation": (0, -0.02, 0.04)}}),
        (40, {"root": {"location": (0, 0, 0), "rotation": (0, 0.02, -0.04)}}),
    ]),
    create_action(rig, "COS_APPROVAL", 48, [
        (1, {"root": {"rotation": (0, 0, 0)}}),
        (20, {"root": {"rotation": (0, -0.12, -0.08)}}),
        (48, {"root": {"rotation": (0, 0, 0)}}),
    ]),
    create_action(rig, "COS_CELEBRATE", 48, [
        (1, {"root": {"location": (0, 0, 0), "rotation": (0, 0, 0)}}),
        (18, {"root": {"location": (0, 0, 0.28), "rotation": (0.12, 0, -0.2)}}),
        (32, {"root": {"location": (0, 0, 0.12), "rotation": (-0.08, 0, 0.18)}}),
        (48, {"root": {"location": (0, 0, 0), "rotation": (0, 0, 0)}}),
    ]),
]

rig["company_os_asset_id"] = asset_id
rig["company_os_display_name"] = display_name
rig["company_os_forward_axis"] = "-X"
rig["company_os_up_axis"] = "+Z"
rig["company_os_contract"] = "AssetManifest 1.0"
bpy.context.scene["company_os_asset_id"] = asset_id
bpy.context.scene.render.fps = 30
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

bpy.ops.export_scene.gltf(
    filepath=str(glb_path),
    export_format="GLB",
    export_yup=True,
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_skins=True,
    export_morph=True,
    export_tangents=True,
    export_extras=True,
    export_cameras=False,
    export_lights=False,
    export_image_format="AUTO",
    export_apply=True,
)

audit = {
    "schemaVersion": "1.0",
    "assetId": asset_id,
    "displayName": display_name,
    "status": "RIGID_BODY_RIGGED_CANDIDATE",
    "source": {"path": str(input_path), "sha256": file_hash(input_path)},
    "outputs": {
        "blend": {"path": str(blend_path), "sha256": file_hash(blend_path)},
        "glb": {"path": str(glb_path), "sha256": file_hash(glb_path)},
    },
    "geometry": {
        "meshCount": len(meshes),
        "vertices": sum(len(item.data.vertices) for item in meshes),
        "polygons": sum(len(item.data.polygons) for item in meshes),
        "bounds": {"width": round(extent.x, 5), "height": round(extent.z, 5), "depth": round(extent.y, 5)},
        "forwardAxis": "-X",
        "upAxis": "+Z",
    },
    "rig": {
        "bones": [bone.name for bone in rig.data.bones],
        "anchors": [item.name for item in bpy.context.scene.objects if item.get("company_os_anchor")],
        "actions": [action.name for action in actions],
        "fps": 30,
    },
    "knownLimitations": [
        "Fin, tail, dorsal, and gaze bones are named contract seams but intentionally unweighted until manual skinning or part separation.",
        "Generated surface roughness is adjusted but does not yet fully reproduce the source clay fingerprints.",
    ],
}
audit_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("COMPANY_OS_FISH_ASSET", audit)
