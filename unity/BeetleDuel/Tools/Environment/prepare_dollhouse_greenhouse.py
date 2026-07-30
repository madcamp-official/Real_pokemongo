"""Create a normalized dollhouse cutaway from a static greenhouse GLB."""

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
    parser.add_argument(
        "--cut-offset",
        type=float,
        default=0.0,
        help=(
            "Cut offset as a fraction of full depth. Positive values move "
            "the cut toward the rear (+Y)."
        ),
    )
    parser.add_argument("--max-texture-size", type=int, default=4096)
    return parser.parse_args(sys.argv[separator + 1 :])


def world_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    points = [
        obj.matrix_world @ Vector(corner)
        for obj in objects
        for corner in obj.bound_box
    ]
    if not points:
        raise RuntimeError("No mesh bounds were found.")
    minimum = Vector(
        tuple(min(point[index] for point in points) for index in range(3))
    )
    maximum = Vector(
        tuple(max(point[index] for point in points) for index in range(3))
    )
    return minimum, maximum


def mesh_bounds(mesh: bpy.types.Mesh) -> tuple[Vector, Vector]:
    if not mesh.vertices:
        raise RuntimeError("The greenhouse mesh has no vertices.")
    minimum = Vector(
        tuple(
            min(vertex.co[index] for vertex in mesh.vertices)
            for index in range(3)
        )
    )
    maximum = Vector(
        tuple(
            max(vertex.co[index] for vertex in mesh.vertices)
            for index in range(3)
        )
    )
    return minimum, maximum


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


def join_meshes(meshes: list[bpy.types.Object]) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    for mesh in meshes:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    if joined is None or joined.type != "MESH":
        raise RuntimeError("Unable to create a joined greenhouse mesh.")
    joined.name = "Dollhouse Greenhouse"
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return joined


def bisect_rear_half(
    greenhouse: bpy.types.Object,
    cut_y: float,
) -> None:
    bpy.context.view_layer.objects.active = greenhouse
    greenhouse.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.bisect(
        plane_co=(0.0, cut_y, 0.0),
        plane_no=(0.0, 1.0, 0.0),
        # Filling a joined architectural mesh creates large artificial sheets
        # across glass, roof frames and floor openings. Keep the cut open.
        use_fill=False,
        clear_inner=False,
        clear_outer=True,
        threshold=0.0001,
    )
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    greenhouse.data.update()


def convex_hull_2d(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    unique = sorted(set(points))
    if len(unique) < 3:
        raise RuntimeError("Not enough floor points to build a clean footprint.")

    def cross(
        origin: tuple[float, float],
        first: tuple[float, float],
        second: tuple[float, float],
    ) -> float:
        return (
            (first[0] - origin[0]) * (second[1] - origin[1])
            - (first[1] - origin[1]) * (second[0] - origin[0])
        )

    lower: list[tuple[float, float]] = []
    for point in unique:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0.0:
            lower.pop()
        lower.append(point)

    upper: list[tuple[float, float]] = []
    for point in reversed(unique):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0.0:
            upper.pop()
        upper.append(point)

    return lower[:-1] + upper[:-1]


def dominant_floor_material(
    greenhouse: bpy.types.Object,
    floor_height: float,
) -> bpy.types.Material:
    area_by_index: dict[int, float] = {}
    for polygon in greenhouse.data.polygons:
        if polygon.center.z > floor_height + 0.08 or polygon.normal.z < 0.65:
            continue
        area_by_index[polygon.material_index] = (
            area_by_index.get(polygon.material_index, 0.0) + polygon.area
        )

    if area_by_index:
        material_index = max(area_by_index, key=area_by_index.get)
        if material_index < len(greenhouse.data.materials):
            material = greenhouse.data.materials[material_index]
            if material is not None:
                return material

    material = bpy.data.materials.new("Clean Cut Floor Material")
    material.diffuse_color = (0.55, 0.52, 0.43, 1.0)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is not None:
        principled.inputs["Base Color"].default_value = (0.55, 0.52, 0.43, 1.0)
        principled.inputs["Roughness"].default_value = 0.82
        principled.inputs["Metallic"].default_value = 0.0
    return material


def create_clean_floor(greenhouse: bpy.types.Object) -> bpy.types.Object:
    minimum, maximum = mesh_bounds(greenhouse.data)
    height_range = maximum.z - minimum.z
    footprint_limit = minimum.z + max(0.025, height_range * 0.055)
    footprint_points = [
        (round(vertex.co.x, 5), round(vertex.co.y, 5))
        for vertex in greenhouse.data.vertices
        if vertex.co.z <= footprint_limit
    ]
    hull = convex_hull_2d(footprint_points)

    # The architectural model has a deep foundation below the actual walkable
    # interior floor. Using minimum.z created a second white sheet underneath
    # that foundation and put garden creatures between the two floors.
    # Find the dominant upward-facing surface above the foundation instead.
    floor_area_by_height: dict[float, float] = {}
    candidate_minimum = minimum.z + (height_range * 0.035)
    candidate_maximum = minimum.z + (height_range * 0.14)
    for polygon in greenhouse.data.polygons:
        height = polygon.center.z
        if (
            polygon.normal.z < 0.85
            or height < candidate_minimum
            or height > candidate_maximum
        ):
            continue
        rounded_height = round(height, 4)
        floor_area_by_height[rounded_height] = (
            floor_area_by_height.get(rounded_height, 0.0) + polygon.area
        )
    if not floor_area_by_height:
        raise RuntimeError("Could not find the greenhouse walkable floor.")

    top_z = max(floor_area_by_height, key=floor_area_by_height.get)
    bottom_z = top_z - 0.0125
    vertex_count = len(hull)
    vertices = (
        [(x, y, top_z) for x, y in hull]
        + [(x, y, bottom_z) for x, y in hull]
    )
    faces: list[list[int]] = []
    faces.append(list(range(vertex_count)))
    faces.append(list(reversed(range(vertex_count, vertex_count * 2))))
    for index in range(vertex_count):
        next_index = (index + 1) % vertex_count
        faces.append(
            [
                index,
                next_index,
                vertex_count + next_index,
                vertex_count + index,
            ]
        )

    floor_mesh = bpy.data.meshes.new("Clean Cut Floor Mesh")
    floor_mesh.from_pydata(vertices, [], faces)
    floor_mesh.materials.append(dominant_floor_material(greenhouse, top_z))
    floor_mesh.update()

    floor_object = bpy.data.objects.new("Clean Cut Floor", floor_mesh)
    bpy.context.collection.objects.link(floor_object)
    return floor_object


def normalize_cutaway(
    greenhouse: bpy.types.Object,
    cut_y: float,
    source_height: float,
) -> None:
    minimum, maximum = mesh_bounds(greenhouse.data)
    centre_x = (minimum.x + maximum.x) * 0.5
    scale = 1.0 / source_height
    origin = Vector((centre_x, cut_y, minimum.z))
    for vertex in greenhouse.data.vertices:
        vertex.co = (vertex.co - origin) * scale
    greenhouse.matrix_world = Matrix.Identity(4)
    greenhouse.data.update()


def main() -> None:
    args = parse_args()
    input_path = args.input.expanduser().resolve()
    output_path = args.output.expanduser().resolve()
    if not input_path.is_file():
        raise FileNotFoundError(input_path)
    if not -0.25 <= args.cut_offset <= 0.25:
        raise ValueError("cut-offset must be between -0.25 and 0.25.")

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(input_path))

    meshes = [
        obj for obj in bpy.context.scene.objects if obj.type == "MESH"
    ]
    if not meshes:
        raise RuntimeError("The imported GLB contains no mesh objects.")

    greenhouse = join_meshes(meshes)
    minimum, maximum = world_bounds([greenhouse])
    source_height = maximum.z - minimum.z
    source_depth = maximum.y - minimum.y
    if source_height <= 1e-6 or source_depth <= 1e-6:
        raise RuntimeError("The greenhouse has invalid bounds.")

    centre_y = (minimum.y + maximum.y) * 0.5
    cut_y = centre_y + (source_depth * args.cut_offset)
    original_faces = len(greenhouse.data.polygons)

    bisect_rear_half(greenhouse, cut_y)
    remaining_faces = len(greenhouse.data.polygons)
    normalize_cutaway(greenhouse, cut_y, source_height)
    clean_floor = create_clean_floor(greenhouse)
    resized_images = resize_images(args.max_texture_size)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    greenhouse.select_set(True)
    clean_floor.select_set(True)
    bpy.context.view_layer.objects.active = greenhouse
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

    final_minimum, final_maximum = mesh_bounds(greenhouse.data)
    result = {
        "input": str(input_path),
        "output": str(output_path),
        "front_side": "-Y",
        "removed_side": "+Y",
        "cut_y_source": cut_y,
        "cut_offset": args.cut_offset,
        "source_height": source_height,
        "source_depth": source_depth,
        "original_faces": original_faces,
        "remaining_faces": remaining_faces,
        "normalized_bounds": {
            "min": list(final_minimum),
            "max": list(final_maximum),
        },
        "resized_images": resized_images,
    }
    print(
        "DOLLHOUSE_GREENHOUSE_RESULT="
        + json.dumps(result, ensure_ascii=False)
    )


if __name__ == "__main__":
    main()
