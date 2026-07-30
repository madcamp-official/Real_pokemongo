"""Blender background script that normalizes a GLB for automatic rigging."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    try:
        separator = sys.argv.index("--")
        script_args = sys.argv[separator + 1 :]
    except ValueError:
        script_args = []

    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    size_group = parser.add_mutually_exclusive_group(required=True)
    size_group.add_argument("--target-height", type=float)
    size_group.add_argument("--target-longest", type=float)
    return parser.parse_args(script_args)


def world_bounds(mesh_objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    points = [
        obj.matrix_world @ Vector(corner)
        for obj in mesh_objects
        for corner in obj.bound_box
    ]
    if not points:
        raise RuntimeError("No mesh bounds were found.")

    minimum = Vector(
        (min(point.x for point in points), min(point.y for point in points), min(point.z for point in points))
    )
    maximum = Vector(
        (max(point.x for point in points), max(point.y for point in points), max(point.z for point in points))
    )
    return minimum, maximum


def main() -> None:
    args = parse_args()
    input_path = args.input.expanduser().resolve()
    output_path = args.output.expanduser().resolve()
    if not input_path.is_file():
        raise FileNotFoundError(input_path)
    target_measure = (
        args.target_longest
        if args.target_longest is not None
        else args.target_height
    )
    if target_measure is None or target_measure <= 0:
        raise ValueError("Target size must be greater than zero.")

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(
        filepath=str(input_path),
        import_select_created_objects=True,
        import_scene_as_collection=False,
    )
    imported = [obj for obj in bpy.data.objects if obj not in before]
    meshes = [obj for obj in imported if obj.type == "MESH"]
    armatures = [obj for obj in imported if obj.type == "ARMATURE"]
    if not meshes:
        raise RuntimeError("The imported GLB contains no mesh objects.")
    if armatures:
        raise RuntimeError(
            "The model already contains an armature. Validate the existing rig "
            "instead of sending it through the static-mesh UniRig preparation."
        )

    imported_set = set(imported)
    roots = [obj for obj in imported if obj.parent not in imported_set]
    minimum, maximum = world_bounds(meshes)
    source_size = maximum - minimum
    source_measure = (
        max(source_size)
        if args.target_longest is not None
        else source_size.z
    )
    if source_measure <= 1e-6:
        raise RuntimeError("The imported model has zero target dimension.")

    scale_factor = target_measure / source_measure
    for root in roots:
        root.location *= scale_factor
        root.scale *= scale_factor
    bpy.context.view_layer.update()

    minimum, maximum = world_bounds(meshes)
    centre = (minimum + maximum) * 0.5
    translation = Vector((-centre.x, -centre.y, -minimum.z))
    for root in roots:
        root.location += translation
    bpy.context.view_layer.update()

    # Bake every object's world transform into an independent mesh. Some
    # automatic riggers read raw accessor positions and ignore glTF node scale.
    for obj in meshes:
        obj.data = obj.data.copy()
        obj.data.transform(obj.matrix_world)
        obj.matrix_world.identity()
        obj.parent = None
    bpy.context.view_layer.update()

    minimum, maximum = world_bounds(meshes)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)

    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_animations=True,
        export_skins=True,
        export_yup=True,
        export_image_format="AUTO",
        check_existing=False,
    )

    result = {
        "input": str(input_path),
        "output": str(output_path),
        "mesh_objects": len(meshes),
        "armatures": len(armatures),
        "size_mode": (
            "longest_dimension"
            if args.target_longest is not None
            else "height"
        ),
        "source_measure": source_measure,
        "target_measure": target_measure,
        "scale_factor": scale_factor,
        "final_bounds": {
            "min": list(minimum),
            "max": list(maximum),
        },
    }
    print("RIG_PREP_RESULT=" + json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
