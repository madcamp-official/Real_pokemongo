"""Render four orthographic previews of a GLB for rig-template authoring."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    separator = sys.argv.index("--")
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-directory", required=True, type=Path)
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


def look_at(camera: bpy.types.Object, target: Vector) -> None:
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def main() -> None:
    args = parse_args()
    input_path = args.input.expanduser().resolve()
    output_directory = args.output_directory.expanduser().resolve()
    output_directory.mkdir(parents=True, exist_ok=True)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(input_path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("No meshes were imported.")

    minimum, maximum = bounds(meshes)
    centre = (minimum + maximum) * 0.5
    size = maximum - minimum
    radius = max(size) * 1.25

    camera_data = bpy.data.cameras.new("Rig Preview Camera")
    camera = bpy.data.objects.new("Rig Preview Camera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = max(size.x, size.z) * 1.25
    bpy.context.scene.camera = camera

    light_data = bpy.data.lights.new("Rig Preview Key", "AREA")
    light_data.energy = 1200
    light_data.shape = "DISK"
    light_data.size = max(size) * 2
    light = bpy.data.objects.new("Rig Preview Key", light_data)
    bpy.context.scene.collection.objects.link(light)
    light.location = centre + Vector((radius, -radius, radius))
    light.rotation_euler = (centre - light.location).to_track_quat("-Z", "Y").to_euler()

    world = bpy.context.scene.world
    world.color = (0.08, 0.08, 0.08)
    scene = bpy.context.scene
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
    scene.render.film_transparent = False

    views = {
        "front_minus_y": Vector((0, -radius, 0)),
        "back_plus_y": Vector((0, radius, 0)),
        "left_minus_x": Vector((-radius, 0, 0)),
        "right_plus_x": Vector((radius, 0, 0)),
    }
    for name, offset in views.items():
        camera.location = centre + offset
        look_at(camera, centre)
        scene.render.filepath = str(output_directory / f"{name}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
