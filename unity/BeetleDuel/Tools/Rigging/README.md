# BeetleDuel Rigging Pipeline

This folder prepares static GLB assets for Blender, UniRig, and Unity.

## One-command Blender pipeline

```powershell
.\Build-CreatureRig.ps1 `
  -InputGlb "C:\path\animal.glb" `
  -TargetHeightMeters 0.95 `
  -RigSpec ".\specs\grey_heron.json" `
  -OutputDirectory ".\Output"
```

This runs inspection, real-world scaling, mesh transform baking, template
armature generation, automatic or proximity weight binding, animation action
generation, validation, and Unity-ready GLB export.

## Local preparation

Run from PowerShell:

```powershell
.\Prepare-Rig.ps1 `
  -InputGlb "C:\path\animal.glb" `
  -TargetHeightMeters 1.0 `
  -OutputDirectory "C:\path\rig-output"
```

The command:

1. inspects the GLB for existing skins, joints, and animations;
2. imports it into Blender;
3. scales it to the requested real-world height;
4. centres it on X/Y and places its lowest point on the ground;
5. exports a normalized GLB.

## UniRig

UniRig is installed in WSL at:

```text
~/tools/UniRig
```

Its Python 3.11 virtual environment is:

```text
~/tools/UniRig/.venv
```

UniRig requires an NVIDIA CUDA GPU with at least 8 GB VRAM. This PC uses an
Intel Arc GPU, so run `run_unirig.sh` on an NVIDIA CUDA machine or cloud GPU:

```bash
./run_unirig.sh /path/animal.normalized.glb /path/output
```

The expected final output is `animal.normalized.rigged.glb`.

Review the predicted skeleton before skinning. Wings, tails, jaws, antennae,
and small insect legs often need manual bone placement or weight correction.

## Blender-only template rigging

When CUDA is unavailable, use a reviewed species template:

```powershell
.\Create-BlenderRig.ps1 `
  -InputGlb ".\Output\animal.normalized.glb" `
  -RigSpec ".\specs\animal.json" `
  -OutputDirectory ".\Output"
```

The Blender-only path creates the armature, binds automatic heat weights,
limits each vertex to four influences, generates animation actions, saves an
editable `.blend`, exports a rigged `.glb`, and writes a validation report.

Template coordinates are normalized to the model bounds. A template must be
reviewed for each species or body plan; quadrupeds, birds, beetles, butterflies,
and long-necked animals should not share one generic skeleton.

### Runtime asset budgets

Rig specs can set `target_vertices` and `max_texture_size`. The ground-insect
templates use 35k-45k target vertices and 1024px textures because many animated
species are visible at once. Normal maps preserve close-up surface detail while
the lower mesh and texture budgets reduce skinning cost and GPU memory use.

To migrate an already generated `.blend`, run Blender with
`optimize_rigged_blend.py`, a target vertex count, a maximum texture size, and
the existing validation report. The script revalidates weights before replacing
the GLB.

## Unity import

Copy the reviewed rigged GLB into `Assets/Resources/Models` or another model
folder under `Assets`. Keep one Unity unit equal to one metre. Animation and
behaviour controllers are implemented per species after the skeleton is
validated.

## Folded-wing bird workflow

The bird specs inherit from `specs/bird_flight_base.json`. Static perched bird
GLBs receive a 19-bone skeleton, a non-destructive procedural flight-wing pair,
and five Unity clips:

- `Bird_Perched`
- `Bird_Takeoff`
- `Bird_Flight`
- `Bird_Glide`
- `Bird_Landing`

The original folded body mesh is excluded from synthetic wing deformation, so
the source silhouette remains intact while perched. The procedural flight wings
are scaled in during takeoff and removed from rendering after landing. A source
model that already has spread wings, such as the large-billed crow, uses
`specs/bird_crow_flight.json` and deforms its original wing mesh instead.

Build a bird with the same one-command pipeline:

```powershell
.\Build-CreatureRig.ps1 `
  -InputGlb "C:\path\bird.glb" `
  -TargetHeightMeters 0.28 `
  -RigSpec ".\specs\bird_passerine_brown.json" `
  -OutputDirectory ".\Output\Birds\BrownEaredBulbul"
```

Use the species' longest real-world body dimension for
`TargetHeightMeters`. The runtime scene applies one shared observation scale to
all normalized birds, preserving their relative size.
