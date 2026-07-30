"""Resize packed textures in an existing rigged Blender file and re-export GLB."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy


def parse_args() -> argparse.Namespace:
    separator = sys.argv.index("--")
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-glb", required=True, type=Path)
    parser.add_argument("--max-texture-size", required=True, type=int)
    parser.add_argument("--target-vertices", type=int)
    parser.add_argument("--report", type=Path)
    return parser.parse_args(sys.argv[separator + 1 :])


def resize_images(max_texture_size: int) -> None:
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
        print(
            f"TEXTURE_RESIZE={image.name}:{width}x{height}"
            f"->{target_width}x{target_height}"
        )
        image.scale(target_width, target_height)
        if image.packed_file is not None:
            image.pack()


def decimate_meshes(meshes: list[bpy.types.Object], target_vertices: int | None) -> None:
    if not target_vertices or target_vertices < 1:
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
        mesh.modifiers.move(len(mesh.modifiers) - 1, 0)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        mesh.select_set(False)

    bpy.context.view_layer.update()


def normalize_weights(meshes: list[bpy.types.Object]) -> None:
    for mesh in meshes:
        bpy.context.view_layer.objects.active = mesh
        mesh.select_set(True)
        bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
        bpy.ops.object.vertex_group_limit_total(limit=4)
        bpy.ops.object.vertex_group_normalize_all(lock_active=False)
        bpy.ops.object.mode_set(mode="OBJECT")
        mesh.select_set(False)


def weight_report(
    meshes: list[bpy.types.Object], armature: bpy.types.Object
) -> dict:
    deform_bones = {bone.name for bone in armature.data.bones if bone.use_deform}
    total_vertices = 0
    unweighted_vertices = 0
    max_influences = 0
    populated_groups = set()
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
    output_glb = args.output_glb.expanduser().resolve()
    output_glb.parent.mkdir(parents=True, exist_ok=True)

    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    resize_images(args.max_texture_size)
    decimate_meshes(meshes, args.target_vertices)
    normalize_weights(meshes)
    weights = weight_report(meshes, armatures[0])
    if weights["unweighted_ratio"] > 0.001 or weights["max_influences"] > 4:
        raise RuntimeError(f"Invalid post-optimization weights: {weights}")

    if args.report:
        report_path = args.report.expanduser().resolve()
        report = json.loads(report_path.read_text(encoding="utf-8"))
        report["weights"] = weights
        report["optimization"] = {
            "max_texture_size": args.max_texture_size,
            "target_vertices": args.target_vertices,
        }
        report_path.write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in armatures + meshes:
        obj.select_set(True)
    if armatures:
        bpy.context.view_layer.objects.active = armatures[0]

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
    print("WEIGHTS=" + json.dumps(weights))
    print(f"OPTIMIZED_GLB={output_glb}")


if __name__ == "__main__":
    main()
