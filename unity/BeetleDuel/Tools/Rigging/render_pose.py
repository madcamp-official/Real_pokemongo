"""Render a named action/frame from an editable Blender rig for QA."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    separator = sys.argv.index("--")
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend", required=True, type=Path)
    parser.add_argument("--action", required=True)
    parser.add_argument("--frame", required=True, type=int)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--view",
        choices=("side", "front"),
        default="side",
    )
    parser.add_argument(
        "--engine",
        choices=("eevee", "workbench"),
        default="eevee",
    )
    return parser.parse_args(sys.argv[separator + 1 :])


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


def main() -> None:
    args = parse_args()
    blend_path = args.blend.expanduser().resolve()
    output_path = args.output.expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(blend_path))

    armature = next(
        (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None
    )
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    action = bpy.data.actions.get(args.action)
    if armature is None or not meshes or action is None:
        raise RuntimeError("Armature, meshes, or requested action are missing.")

    armature.animation_data_create()
    armature.animation_data.action = action
    bpy.context.scene.frame_set(args.frame)
    bpy.context.view_layer.update()

    minimum, maximum = bounds(meshes)
    centre = (minimum + maximum) * 0.5
    size = maximum - minimum
    radius = max(size) * 1.4

    camera_data = bpy.data.cameras.new("Pose QA Camera")
    camera = bpy.data.objects.new("Pose QA Camera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = max(size.x, size.z) * 1.3
    camera_data.clip_start = max(0.0001, radius * 0.01)
    camera_data.clip_end = max(10.0, radius * 100.0)
    camera.location = (
        centre + Vector((0, -radius, 0))
        if args.view == "side"
        else centre + Vector((radius, 0, 0))
    )
    camera.rotation_euler = (centre - camera.location).to_track_quat("-Z", "Y").to_euler()

    light_data = bpy.data.lights.new("Pose QA Key", "AREA")
    light_data.energy = 1200
    light_data.size = max(size) * 2
    light = bpy.data.objects.new("Pose QA Key", light_data)
    bpy.context.scene.collection.objects.link(light)
    light.location = centre + Vector((radius, -radius, radius))
    light.rotation_euler = (centre - light.location).to_track_quat("-Z", "Y").to_euler()

    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = (
        "BLENDER_WORKBENCH" if args.engine == "workbench" else "BLENDER_EEVEE"
    )
    if args.engine == "workbench":
        scene.display.shading.light = "STUDIO"
        scene.display.shading.color_type = "MATERIAL"
        scene.display.shading.show_shadows = True
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(output_path)
    scene.world.color = (0.08, 0.08, 0.08)
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
