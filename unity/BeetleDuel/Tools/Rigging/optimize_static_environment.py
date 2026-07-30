"""Optimize a static GLB and normalize it to a one-metre ground-based asset."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


def parse_args() -> argparse.Namespace:
    separator = sys.argv.index("--")
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--target-faces", required=True, type=int)
    parser.add_argument("--max-texture-size", type=int, default=1024)
    return parser.parse_args(sys.argv[separator + 1 :])


def world_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    points = [
        obj.matrix_world @ Vector(corner)
        for obj in objects
        for corner in obj.bound_box
    ]
    if not points:
        raise RuntimeError("No mesh bounds were found.")
    return (
        Vector(
            tuple(min(point[index] for point in points) for index in range(3))
        ),
        Vector(
            tuple(max(point[index] for point in points) for index in range(3))
        ),
    )


def resize_images(maximum_size: int) -> list[dict[str, object]]:
    resized: list[dict[str, object]] = []
    for image in bpy.data.images:
        width, height = image.size
        if width <= 0 or height <= 0 or max(width, height) <= maximum_size:
            continue
        ratio = maximum_size / max(width, height)
        target_width = max(1, round(width * ratio))
        target_height = max(1, round(height * ratio))
        image.scale(target_width, target_height)
        if image.packed_file is None:
            image.pack()
        resized.append(
            {
                "name": image.name,
                "from": [width, height],
                "to": [target_width, target_height],
            }
        )
    return resized


def main() -> None:
    args = parse_args()
    input_path = args.input.expanduser().resolve()
    output_path = args.output.expanduser().resolve()
    if not input_path.is_file():
        raise FileNotFoundError(input_path)
    if args.target_faces <= 0:
        raise ValueError("target-faces must be greater than zero.")

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(input_path))

    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("The imported GLB contains no mesh objects.")

    minimum, maximum = world_bounds(meshes)
    source_height = maximum.z - minimum.z
    if source_height <= 1e-6:
        raise RuntimeError("The imported model has zero height.")

    imported = set(meshes)
    roots = [obj for obj in meshes if obj.parent not in imported]
    scale = 1.0 / source_height
    for root in roots:
        root.scale *= scale
    bpy.context.view_layer.update()

    minimum, maximum = world_bounds(meshes)
    centre = (minimum + maximum) * 0.5
    translation = Vector((-centre.x, -centre.y, -minimum.z))
    for root in roots:
        root.location += translation
    bpy.context.view_layer.update()

    for obj in meshes:
        obj.data = obj.data.copy()
        obj.data.transform(obj.matrix_world)
        obj.matrix_world = Matrix.Identity(4)
        obj.parent = None
    bpy.context.view_layer.update()

    original_faces = sum(len(obj.data.polygons) for obj in meshes)
    if original_faces > args.target_faces:
        ratio = args.target_faces / original_faces
        for obj in meshes:
            if len(obj.data.polygons) < 8:
                continue
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            modifier = obj.modifiers.new("Environment LOD", "DECIMATE")
            modifier.decimate_type = "COLLAPSE"
            modifier.ratio = ratio
            modifier.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            obj.select_set(False)

    resized_images = resize_images(args.max_texture_size)
    final_faces = sum(len(obj.data.polygons) for obj in meshes)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_animations=False,
        export_skins=False,
        export_yup=True,
        export_image_format="AUTO",
        check_existing=False,
    )

    final_minimum, final_maximum = world_bounds(meshes)
    result = {
        "input": str(input_path),
        "output": str(output_path),
        "source_height": source_height,
        "normalized_height": final_maximum.z - final_minimum.z,
        "original_faces": original_faces,
        "final_faces": final_faces,
        "resized_images": resized_images,
    }
    print(
        "STATIC_ENVIRONMENT_RESULT="
        + json.dumps(result, ensure_ascii=False)
    )


if __name__ == "__main__":
    main()
