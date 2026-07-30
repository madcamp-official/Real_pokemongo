"""Build and validate a template-driven armature using Blender only."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Euler, Vector


def parse_args() -> argparse.Namespace:
    separator = sys.argv.index("--")
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--spec", required=True, type=Path)
    parser.add_argument("--output-glb", required=True, type=Path)
    parser.add_argument("--output-blend", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    return parser.parse_args(sys.argv[separator + 1 :])


def load_spec(spec_path: Path, visited: set[Path] | None = None) -> dict:
    resolved_path = spec_path.expanduser().resolve()
    visited = set() if visited is None else visited
    if resolved_path in visited:
        raise ValueError(f"Rig spec inheritance cycle detected at {resolved_path}.")
    visited.add(resolved_path)

    spec = json.loads(resolved_path.read_text(encoding="utf-8"))
    parent_reference = spec.pop("extends", None)
    if not parent_reference:
        return spec

    parent_path = (resolved_path.parent / parent_reference).resolve()
    parent_spec = load_spec(parent_path, visited)
    parent_spec.update(spec)
    return parent_spec


def bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    points = [
        obj.matrix_world @ Vector(corner)
        for obj in objects
        for corner in obj.bound_box
    ]
    return (
        Vector(tuple(min(point[index] for point in points) for index in range(3))),
        Vector(tuple(max(point[index] for point in points) for index in range(3))),
    )


def normalized_point(point: list[float], minimum: Vector, maximum: Vector) -> Vector:
    size = maximum - minimum
    return Vector(
        (
            minimum.x + point[0] * size.x,
            minimum.y + point[1] * size.y,
            minimum.z + point[2] * size.z,
        )
    )


def optimize_images(max_texture_size: int | None) -> list[dict]:
    if not max_texture_size or max_texture_size < 1:
        return []

    optimized = []
    for image in bpy.data.images:
        width, height = image.size
        if width < 1 or height < 1 or image.type != "IMAGE":
            continue

        longest = max(width, height)
        if longest <= max_texture_size:
            continue

        scale = max_texture_size / longest
        target_width = max(1, round(width * scale))
        target_height = max(1, round(height * scale))
        image.scale(target_width, target_height)
        if image.packed_file is not None:
            image.pack()
        optimized.append(
            {
                "name": image.name,
                "from": [width, height],
                "to": [target_width, target_height],
            }
        )

    return optimized


def create_armature(
    spec: dict, minimum: Vector, maximum: Vector
) -> bpy.types.Object:
    armature_data = bpy.data.armatures.new(spec.get("armature_name", "CreatureRig"))
    armature = bpy.data.objects.new(armature_data.name, armature_data)
    bpy.context.scene.collection.objects.link(armature)
    armature.show_in_front = True

    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    created: dict[str, bpy.types.EditBone] = {}

    for bone_spec in spec["bones"]:
        bone = armature_data.edit_bones.new(bone_spec["name"])
        bone.head = normalized_point(bone_spec["head"], minimum, maximum)
        bone.tail = normalized_point(bone_spec["tail"], minimum, maximum)
        if (bone.tail - bone.head).length < 1e-5:
            raise ValueError(f"Bone {bone.name} has zero length.")
        bone.use_deform = bone_spec.get("deform", True)
        if "roll_reference" in bone_spec:
            bone.align_roll(Vector(bone_spec["roll_reference"]))
        else:
            bone.roll = math.radians(bone_spec.get("roll_degrees", 0.0))

        parent_name = bone_spec.get("parent")
        if parent_name:
            if parent_name not in created:
                raise ValueError(f"Bone {bone.name} has unknown parent {parent_name}.")
            bone.parent = created[parent_name]
            bone.use_connect = bone_spec.get("connected", False)
        created[bone.name] = bone

    bpy.ops.object.mode_set(mode="OBJECT")
    return armature


def bird_wing_material(name: str, color: list[float]) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.use_backface_culling = False
    rgba = tuple(color[:3]) + (color[3] if len(color) > 3 else 1.0,)
    material.diffuse_color = rgba
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is not None:
        principled.inputs["Base Color"].default_value = rgba
        principled.inputs["Roughness"].default_value = 0.72
    return material


def create_procedural_bird_wings(
    spec: dict,
    armature: bpy.types.Object,
    minimum: Vector,
    maximum: Vector,
) -> list[bpy.types.Object]:
    config = spec.get("procedural_wings")
    if not config:
        return []

    primary = bird_wing_material(
        f"{spec.get('profile', 'bird')} Wing Coverts",
        config.get("color", [0.28, 0.28, 0.26, 1.0]),
    )
    secondary = bird_wing_material(
        f"{spec.get('profile', 'bird')} Flight Feathers",
        config.get("feather_color", [0.16, 0.16, 0.15, 1.0]),
    )
    span_scale = float(config.get("span_scale", 1.0))
    trailing_scale = float(config.get("trailing_scale", 1.0))
    feather_count = int(config.get("feather_count", 10))
    created = []
    size = maximum - minimum
    centre = (minimum + maximum) * 0.5
    wing_span_basis = max(size.x, size.z) * 1.45

    def point(x: float, y: float, z: float, side: float) -> Vector:
        return Vector(
            (
                minimum.x + (x * size.x),
                centre.y
                + ((y - 0.5) * side * wing_span_basis * span_scale),
                minimum.z + (z * size.z),
            )
        )

    for side_name, side in (("L", 1.0), ("R", -1.0)):
        vertices: list[tuple[float, float, float]] = []
        faces: list[tuple[int, int, int, int]] = []
        face_materials: list[int] = []
        assignments: dict[str, list[int]] = {}

        def add_quad(
            points: list[Vector],
            bone_name: str,
            material_index: int,
        ) -> None:
            start = len(vertices)
            vertices.extend(tuple(value) for value in points)
            faces.append((start, start + 1, start + 2, start + 3))
            face_materials.append(material_index)
            assignments.setdefault(bone_name, []).extend(
                [start, start + 1, start + 2, start + 3]
            )

        root = point(0.55, 0.57, 0.64, side)
        elbow = point(0.46, 0.76, 0.65, side)
        wrist = point(0.32, 0.91, 0.60, side)
        tip = point(0.19, 0.985, 0.51, side)
        root_back = point(0.30, 0.59, 0.49, side)
        elbow_back = point(0.23, 0.72, 0.42, side)
        wrist_back = point(0.13, 0.88, 0.37, side)
        tip_back = point(0.08, 0.96, 0.40, side)

        add_quad(
            [root, elbow, elbow_back, root_back],
            f"wing.{side_name}.01",
            0,
        )
        add_quad(
            [elbow, wrist, wrist_back, elbow_back],
            f"wing.{side_name}.02",
            0,
        )
        add_quad(
            [wrist, tip, tip_back, wrist_back],
            f"wing.{side_name}.03",
            0,
        )

        for feather_index in range(feather_count):
            t = feather_index / max(1, feather_count - 1)
            origin_x = 0.39 - (0.14 * t)
            origin_y = 0.70 + (0.22 * t)
            origin_z = 0.50 - (0.07 * t)
            tip_x = 0.04 + (0.13 * t)
            tip_y = 0.61 + (0.36 * t)
            tip_z = (0.32 + (0.09 * t)) * trailing_scale
            half_width = 0.020 + (0.009 * (1.0 - t))
            origin_a = point(
                origin_x,
                origin_y - half_width,
                origin_z,
                side,
            )
            origin_b = point(
                origin_x,
                origin_y + half_width,
                origin_z,
                side,
            )
            tip_a = point(
                tip_x,
                tip_y - (half_width * 0.55),
                tip_z,
                side,
            )
            tip_b = point(
                tip_x,
                tip_y + (half_width * 0.55),
                tip_z,
                side,
            )
            bone_index = "02" if t < 0.35 else "03"
            add_quad(
                [origin_a, origin_b, tip_b, tip_a],
                f"wing.{side_name}.{bone_index}",
                1,
            )

        mesh_data = bpy.data.meshes.new(f"FlightWing.{side_name}.Mesh")
        mesh_data.from_pydata(vertices, [], faces)
        mesh_data.update()
        wing = bpy.data.objects.new(f"FlightWing.{side_name}", mesh_data)
        bpy.context.scene.collection.objects.link(wing)
        wing.data.materials.append(primary)
        wing.data.materials.append(secondary)
        for polygon, material_index in zip(wing.data.polygons, face_materials):
            polygon.material_index = material_index

        for bone_name, indices in assignments.items():
            group = wing.vertex_groups.new(name=bone_name)
            group.add(indices, 1.0, "REPLACE")

        modifier = wing.modifiers.new(name="Bird Armature", type="ARMATURE")
        modifier.object = armature
        wing.parent = armature
        wing.matrix_parent_inverse = armature.matrix_world.inverted()
        created.append(wing)

    return created


def bind_with_automatic_weights(
    meshes: list[bpy.types.Object], armature: bpy.types.Object
) -> str:
    bpy.ops.object.select_all(action="DESELECT")
    for mesh in meshes:
        mesh.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature

    try:
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    except RuntimeError as error:
        print(f"Automatic weights raised an error: {error}")

    has_weights = any(
        any(element.weight > 1e-5 for vertex in mesh.data.vertices for element in vertex.groups)
        for mesh in meshes
    )
    if has_weights:
        return "bone-heat"

    print("Bone heat produced no usable weights; using proximity weights.")
    bind_with_proximity_weights(meshes, armature)
    return "proximity-fallback"


def point_segment_distances(
    points: np.ndarray, head: np.ndarray, tail: np.ndarray
) -> np.ndarray:
    segment = tail - head
    length_squared = float(np.dot(segment, segment))
    if length_squared <= 1e-12:
        return np.linalg.norm(points - head, axis=1)
    projection = np.clip(((points - head) @ segment) / length_squared, 0.0, 1.0)
    closest = head + projection[:, None] * segment
    return np.linalg.norm(points - closest, axis=1)


def bind_with_proximity_weights(
    meshes: list[bpy.types.Object],
    armature: bpy.types.Object,
    excluded_bones: set[str] | None = None,
) -> None:
    excluded_bones = excluded_bones or set()
    deform_bones = [
        bone
        for bone in armature.data.bones
        if bone.use_deform and bone.name not in excluded_bones
    ]
    if not deform_bones:
        raise RuntimeError("The armature has no deform bones.")

    heads = [np.array(bone.head_local, dtype=np.float64) for bone in deform_bones]
    tails = [np.array(bone.tail_local, dtype=np.float64) for bone in deform_bones]
    radii = np.array(
        [max(0.018, (tail - head).dot(tail - head) ** 0.5 * 0.42) for head, tail in zip(heads, tails)],
        dtype=np.float64,
    )

    for mesh in meshes:
        for modifier in list(mesh.modifiers):
            if modifier.type == "ARMATURE":
                mesh.modifiers.remove(modifier)
        mesh.parent = None
        mesh.vertex_groups.clear()

        local_coordinates = np.empty(len(mesh.data.vertices) * 3, dtype=np.float64)
        mesh.data.vertices.foreach_get("co", local_coordinates)
        local_coordinates = local_coordinates.reshape((-1, 3))
        world_matrix = np.array(mesh.matrix_world, dtype=np.float64).T
        homogeneous = np.concatenate(
            [local_coordinates, np.ones((len(local_coordinates), 1))], axis=1
        )
        world_coordinates = (homogeneous @ world_matrix)[:, :3]

        normalized_distances = np.empty(
            (len(world_coordinates), len(deform_bones)), dtype=np.float64
        )
        for bone_index, (head, tail) in enumerate(zip(heads, tails)):
            normalized_distances[:, bone_index] = (
                point_segment_distances(world_coordinates, head, tail)
                / radii[bone_index]
            )

        influence_count = min(4, len(deform_bones))
        nearest = np.argpartition(
            normalized_distances, influence_count - 1, axis=1
        )[:, :influence_count]
        nearest_distances = np.take_along_axis(
            normalized_distances, nearest, axis=1
        )
        raw_weights = 1.0 / np.maximum(nearest_distances, 0.08) ** 2
        raw_weights /= raw_weights.sum(axis=1, keepdims=True)

        groups = {
            index: mesh.vertex_groups.new(name=bone.name)
            for index, bone in enumerate(deform_bones)
        }
        vertex_indices = np.arange(len(mesh.data.vertices))
        for slot in range(influence_count):
            slot_bones = nearest[:, slot]
            slot_weights = raw_weights[:, slot]
            for bone_index, group in groups.items():
                mask = slot_bones == bone_index
                if not np.any(mask):
                    continue
                selected_indices = vertex_indices[mask]
                selected_weights = slot_weights[mask]
                quantized = np.round(selected_weights, 3)
                for value in np.unique(quantized):
                    if value <= 0:
                        continue
                    indices = selected_indices[quantized == value].tolist()
                    group.add(indices, float(value), "REPLACE")

        modifier = mesh.modifiers.new(name="Creature Armature", type="ARMATURE")
        modifier.object = armature
        mesh.parent = armature
        mesh.matrix_parent_inverse = armature.matrix_world.inverted()


def normalize_weights(meshes: list[bpy.types.Object]) -> None:
    for mesh in meshes:
        bpy.context.view_layer.objects.active = mesh
        mesh.select_set(True)
        bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
        bpy.ops.object.vertex_group_limit_total(limit=4)
        bpy.ops.object.vertex_group_normalize_all(lock_active=False)
        bpy.ops.object.mode_set(mode="OBJECT")
        mesh.select_set(False)


def decimate_meshes(
    meshes: list[bpy.types.Object], target_vertices: int | None
) -> None:
    if not target_vertices or target_vertices <= 0:
        return

    total_vertices = sum(len(mesh.data.vertices) for mesh in meshes)
    if total_vertices <= target_vertices:
        return

    ratio = max(0.05, min(1.0, target_vertices / total_vertices))
    for mesh in meshes:
        if len(mesh.data.vertices) < 1000:
            continue

        bpy.ops.object.select_all(action="DESELECT")
        mesh.select_set(True)
        bpy.context.view_layer.objects.active = mesh
        modifier = mesh.modifiers.new(name="Pipeline Decimation", type="DECIMATE")
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        mesh.select_set(False)

    bpy.context.view_layer.update()


def create_actions(armature: bpy.types.Object, spec: dict) -> list[str]:
    animation_names: list[str] = []
    if not spec.get("animations"):
        return animation_names

    armature.animation_data_create()
    scene = bpy.context.scene
    for animation in spec["animations"]:
        action = bpy.data.actions.new(animation["name"])
        action.use_fake_user = True
        armature.animation_data.action = action
        animation_names.append(action.name)

        for pose_bone in armature.pose.bones:
            pose_bone.rotation_mode = "XYZ"

        for keyframe in animation["keyframes"]:
            frame = int(keyframe["frame"])
            scene.frame_set(frame)
            for pose_bone in armature.pose.bones:
                pose_bone.location = Vector((0.0, 0.0, 0.0))
                pose_bone.rotation_euler = (0.0, 0.0, 0.0)
                pose_bone.scale = Vector((1.0, 1.0, 1.0))

            for bone_name, degrees in keyframe.get("rotations", {}).items():
                pose_bone = armature.pose.bones.get(bone_name)
                if pose_bone is None:
                    raise ValueError(
                        f"Animation {action.name} references unknown bone {bone_name}."
                    )
                pose_bone.rotation_euler = tuple(math.radians(value) for value in degrees)

            for bone_name, location in keyframe.get("locations", {}).items():
                pose_bone = armature.pose.bones.get(bone_name)
                if pose_bone is None:
                    raise ValueError(
                        f"Animation {action.name} references unknown bone {bone_name}."
                    )
                pose_bone.location = Vector(location)

            for bone_name, scale in keyframe.get("scales", {}).items():
                pose_bone = armature.pose.bones.get(bone_name)
                if pose_bone is None:
                    raise ValueError(
                        f"Animation {action.name} references unknown bone {bone_name}."
                    )
                pose_bone.scale = Vector(scale)

            for pose_bone in armature.pose.bones:
                pose_bone.keyframe_insert("location", frame=frame, group=pose_bone.name)
                pose_bone.keyframe_insert(
                    "rotation_euler", frame=frame, group=pose_bone.name
                )
                pose_bone.keyframe_insert("scale", frame=frame, group=pose_bone.name)

        action.frame_start = animation["keyframes"][0]["frame"]
        action.frame_end = animation["keyframes"][-1]["frame"]
        action.use_frame_range = True

    armature.animation_data.action = bpy.data.actions.get(animation_names[0])
    scene.frame_start = int(spec["animations"][0]["keyframes"][0]["frame"])
    scene.frame_end = int(spec["animations"][0]["keyframes"][-1]["frame"])
    scene.frame_set(scene.frame_start)
    return animation_names


def weight_report(
    meshes: list[bpy.types.Object], armature: bpy.types.Object
) -> dict:
    deform_bones = {bone.name for bone in armature.data.bones if bone.use_deform}
    total_vertices = 0
    unweighted_vertices = 0
    max_influences = 0
    populated_groups: set[str] = set()

    for mesh in meshes:
        group_names = {group.index: group.name for group in mesh.vertex_groups}
        for vertex in mesh.data.vertices:
            total_vertices += 1
            influences = [
                element
                for element in vertex.groups
                if element.weight > 1e-5
                and group_names.get(element.group) in deform_bones
            ]
            if not influences:
                unweighted_vertices += 1
            max_influences = max(max_influences, len(influences))
            populated_groups.update(
                group_names[element.group] for element in influences
            )

    return {
        "vertices": total_vertices,
        "unweighted_vertices": unweighted_vertices,
        "unweighted_ratio": (
            unweighted_vertices / total_vertices if total_vertices else 1.0
        ),
        "max_influences": max_influences,
        "deform_bones": len(deform_bones),
        "populated_deform_bones": len(populated_groups),
        "empty_deform_bones": sorted(deform_bones - populated_groups),
    }


def main() -> None:
    args = parse_args()
    input_path = args.input.expanduser().resolve()
    spec_path = args.spec.expanduser().resolve()
    output_glb = args.output_glb.expanduser().resolve()
    output_blend = args.output_blend.expanduser().resolve()
    report_path = args.report.expanduser().resolve()
    spec = load_spec(spec_path)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(input_path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    existing_armatures = [
        obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"
    ]
    if not meshes:
        raise RuntimeError("No meshes were imported.")
    if existing_armatures:
        raise RuntimeError("Input already contains an armature.")

    pre_rotation = spec.get("pre_rotation_degrees")
    if pre_rotation:
        rotation_matrix = Euler(
            tuple(math.radians(value) for value in pre_rotation),
            "XYZ",
        ).to_matrix().to_4x4()
        for mesh in meshes:
            mesh.data.transform(rotation_matrix)
        bpy.context.view_layer.update()

        rotated_minimum, rotated_maximum = bounds(meshes)
        rotated_centre = (rotated_minimum + rotated_maximum) * 0.5
        translation = Vector(
            (-rotated_centre.x, -rotated_centre.y, -rotated_minimum.z)
        )
        for mesh in meshes:
            mesh.location += translation
        bpy.context.view_layer.update()

    decimate_meshes(meshes, spec.get("target_vertices"))
    minimum, maximum = bounds(meshes)
    armature = create_armature(spec, minimum, maximum)
    if spec.get("binding") == "proximity":
        bind_with_proximity_weights(
            meshes,
            armature,
            set(spec.get("body_excluded_bones", [])),
        )
        bind_method = "proximity"
    else:
        bind_method = bind_with_automatic_weights(meshes, armature)
    normalize_weights(meshes)
    procedural_wings = create_procedural_bird_wings(
        spec,
        armature,
        minimum,
        maximum,
    )
    meshes.extend(procedural_wings)
    animations = create_actions(armature, spec)
    weights = weight_report(meshes, armature)
    optimized_images = optimize_images(spec.get("max_texture_size"))

    output_glb.parent.mkdir(parents=True, exist_ok=True)
    output_blend.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.save_as_mainfile(filepath=str(output_blend))
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    for mesh in meshes:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = armature

    bpy.ops.export_scene.gltf(
        filepath=str(output_glb),
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_skins=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_anim_single_armature=True,
        export_force_sampling=True,
        export_frame_range=True,
        export_yup=True,
        export_image_format="AUTO",
        check_existing=False,
    )

    report = {
        "input": str(input_path),
        "spec": str(spec_path),
        "output_glb": str(output_glb),
        "output_blend": str(output_blend),
        "bind_method": bind_method,
        "bones": len(armature.data.bones),
        "animations": animations,
        "procedural_wings": [mesh.name for mesh in procedural_wings],
        "optimized_images": optimized_images,
        "weights": weights,
        "bounds": {"min": list(minimum), "max": list(maximum)},
    }
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("RIG_RESULT=" + json.dumps(report, ensure_ascii=False))

    if weights["unweighted_ratio"] > 0.001:
        print(f"Rig has {weights['unweighted_vertices']} unweighted vertices.")
        raise SystemExit(2)


if __name__ == "__main__":
    main()
