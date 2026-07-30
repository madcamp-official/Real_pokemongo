#!/usr/bin/env python3
"""Inspect a binary glTF file without third-party dependencies."""

from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path


def load_glb_json(path: Path) -> dict:
    with path.open("rb") as stream:
        header = stream.read(12)
        if len(header) != 12:
            raise ValueError("File is too short to be a GLB.")

        magic, version, total_length = struct.unpack("<4sII", header)
        if magic != b"glTF" or version != 2:
            raise ValueError("Only glTF 2.0 binary files are supported.")
        if total_length != path.stat().st_size:
            raise ValueError("GLB header length does not match the file size.")

        chunk_length, chunk_type = struct.unpack("<II", stream.read(8))
        if chunk_type != 0x4E4F534A:
            raise ValueError("The first GLB chunk is not JSON.")

        return json.loads(stream.read(chunk_length).decode("utf-8").rstrip(" \0"))


def inspect(path: Path) -> dict:
    gltf = load_glb_json(path)
    meshes = gltf.get("meshes", [])
    nodes = gltf.get("nodes", [])
    skins = gltf.get("skins", [])
    animations = gltf.get("animations", [])

    attributes = set()
    for mesh in meshes:
        for primitive in mesh.get("primitives", []):
            attributes.update(primitive.get("attributes", {}).keys())

    accessors = gltf.get("accessors", [])
    position_bounds = []
    for mesh in meshes:
        for primitive in mesh.get("primitives", []):
            position_index = primitive.get("attributes", {}).get("POSITION")
            if position_index is None or position_index >= len(accessors):
                continue
            accessor = accessors[position_index]
            if "min" in accessor and "max" in accessor:
                position_bounds.append(
                    {"min": accessor["min"], "max": accessor["max"]}
                )

    joint_count = sum(len(skin.get("joints", [])) for skin in skins)
    has_skin_attributes = "JOINTS_0" in attributes and "WEIGHTS_0" in attributes
    rigged = bool(skins and joint_count > 1 and has_skin_attributes)

    return {
        "file": str(path),
        "generator": gltf.get("asset", {}).get("generator"),
        "nodes": len(nodes),
        "meshes": len(meshes),
        "skins": len(skins),
        "joints": joint_count,
        "animations": len(animations),
        "mesh_attributes": sorted(attributes),
        "position_bounds": position_bounds,
        "is_rigged": rigged,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    args = parser.parse_args()

    input_path = args.input.expanduser().resolve()
    if not input_path.is_file():
        raise FileNotFoundError(input_path)

    print(json.dumps(inspect(input_path), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
