#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <normalized-input.glb> <output-directory>" >&2
  exit 2
fi

input_path="$(realpath "$1")"
output_directory="$(realpath -m "$2")"
unirig_root="${UNIRIG_ROOT:-$HOME/tools/UniRig}"

if [[ ! -f "$input_path" ]]; then
  echo "Input model not found: $input_path" >&2
  exit 3
fi

if [[ ! -d "$unirig_root/.git" ]]; then
  echo "UniRig checkout not found: $unirig_root" >&2
  exit 4
fi

if ! command -v nvidia-smi >/dev/null 2>&1; then
  echo "UniRig requires an NVIDIA CUDA GPU with at least 8 GB VRAM." >&2
  exit 5
fi

available_vram_mb="$(
  nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits |
    sort -nr |
    head -n 1 |
    tr -d ' '
)"
if [[ -z "$available_vram_mb" || "$available_vram_mb" -lt 8192 ]]; then
  echo "UniRig requires at least 8192 MB VRAM; detected ${available_vram_mb:-0} MB." >&2
  exit 6
fi

mkdir -p "$output_directory"
stem="$(basename "${input_path%.*}")"
skeleton="$output_directory/${stem}.skeleton.fbx"
skinned="$output_directory/${stem}.skinned.fbx"
rigged="$output_directory/${stem}.rigged.glb"

cd "$unirig_root"
source .venv/bin/activate

bash launch/inference/generate_skeleton.sh \
  --input "$input_path" \
  --output "$skeleton"

echo "Review and correct the skeleton before skinning if wings, tails, jaws, or legs are missing."

bash launch/inference/generate_skin.sh \
  --input "$skeleton" \
  --output "$skinned"

bash launch/inference/merge.sh \
  --source "$skinned" \
  --target "$input_path" \
  --output "$rigged"

echo "$rigged"
