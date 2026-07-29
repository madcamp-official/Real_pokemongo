using UnityEngine;
using UnityEngine.Rendering;

/// <summary>
/// Builds a procedural six-leg rig and a pair of animated mandible bones for
/// the unrigged stag beetle GLB.
/// </summary>
public sealed class StagBeetleRig : MonoBehaviour
{
    private const int LegCount = 6;
    private const int JawCount = 2;

    private readonly Transform[] legBones = new Transform[LegCount];
    private readonly Quaternion[] legRestRotations = new Quaternion[LegCount];
    private readonly Transform[] jawBones = new Transform[JawCount];
    private readonly Quaternion[] jawRestRotations = new Quaternion[JawCount];

    private Transform motionReference;
    private Vector3 previousReferencePosition;
    private Vector3 restLocalPosition;
    private Quaternion restLocalRotation;
    private int longitudinalAxis;
    private int lateralAxis;
    private int verticalAxis;
    private float gaitPhase;
    private float attackOpen;
    private float attackBite;
    private float attackLift;
    private bool initialized;

    public static StagBeetleRig Attach(GameObject beetleModel, float phaseOffset)
    {
        StagBeetleRig rig = beetleModel.GetComponent<StagBeetleRig>();
        if (rig == null)
            rig = beetleModel.AddComponent<StagBeetleRig>();

        rig.gaitPhase = phaseOffset;
        rig.BuildRig();
        return rig;
    }

    public void SetAttackPose(float openAmount, float biteAmount, float liftAmount)
    {
        attackOpen = Mathf.Clamp01(openAmount);
        attackBite = Mathf.Clamp01(biteAmount);
        attackLift = Mathf.Clamp01(liftAmount);
    }

    private void BuildRig()
    {
        if (initialized)
            return;

        MeshFilter meshFilter = GetComponentInChildren<MeshFilter>();
        MeshRenderer meshRenderer = meshFilter != null ? meshFilter.GetComponent<MeshRenderer>() : null;
        if (meshFilter == null || meshRenderer == null || meshFilter.sharedMesh == null)
        {
            Debug.LogWarning("사슴벌레 메시를 찾지 못해 관절 리그를 만들 수 없습니다.", this);
            return;
        }

        Mesh sourceMesh = meshFilter.sharedMesh;
        if (!sourceMesh.isReadable)
        {
            Debug.LogWarning("사슴벌레 메시의 Read/Write가 꺼져 있어 관절 리그를 만들 수 없습니다.", this);
            return;
        }

        Mesh articulatedMesh = Instantiate(sourceMesh);
        articulatedMesh.name = sourceMesh.name + " - Stag Beetle Combat Rig";

        Transform meshTransform = meshFilter.transform;
        Bounds bounds = articulatedMesh.bounds;
        DetectBodyAxes(bounds.size);

        Vector3 center = bounds.center;
        float longitudinalExtent = Axis(bounds.extents, longitudinalAxis);
        float lateralExtent = Axis(bounds.extents, lateralAxis);
        float verticalExtent = Axis(bounds.extents, verticalAxis);
        float verticalMin = Axis(bounds.min, verticalAxis);
        float verticalSize = Axis(bounds.size, verticalAxis);

        Transform[] bones = new Transform[1 + LegCount + JawCount];
        bones[0] = CreateBone(meshTransform, "사슴벌레 몸통 관절", center);

        string[] sectionNames = { "앞", "가운데", "뒤" };
        for (int sideIndex = 0; sideIndex < 2; sideIndex++)
        {
            float side = sideIndex == 0 ? -1f : 1f;
            string sideName = sideIndex == 0 ? "왼쪽" : "오른쪽";

            for (int section = 0; section < 3; section++)
            {
                int legIndex = (sideIndex * 3) + section;
                float sectionOffset = section == 0 ? 0.36f : section == 1 ? 0f : -0.36f;
                Vector3 pivot = center;
                SetAxis(ref pivot, lateralAxis, Axis(center, lateralAxis) + (side * lateralExtent * 0.29f));
                SetAxis(ref pivot, verticalAxis, verticalMin + (verticalSize * 0.28f));
                SetAxis(ref pivot, longitudinalAxis, Axis(center, longitudinalAxis) + (sectionOffset * longitudinalExtent));

                Transform legBone = CreateBone(
                    meshTransform,
                    "사슴벌레 " + sideName + " " + sectionNames[section] + "다리 관절",
                    pivot);

                legBones[legIndex] = legBone;
                legRestRotations[legIndex] = legBone.localRotation;
                bones[1 + legIndex] = legBone;
            }
        }

        for (int sideIndex = 0; sideIndex < JawCount; sideIndex++)
        {
            float side = sideIndex == 0 ? -1f : 1f;
            string sideName = sideIndex == 0 ? "왼쪽" : "오른쪽";
            Vector3 jawPivot = center;
            SetAxis(ref jawPivot, lateralAxis, Axis(center, lateralAxis) + (side * lateralExtent * 0.10f));
            SetAxis(ref jawPivot, verticalAxis, verticalMin + (verticalSize * 0.55f));
            SetAxis(ref jawPivot, longitudinalAxis, Axis(center, longitudinalAxis) + (longitudinalExtent * 0.42f));

            Transform jawBone = CreateBone(meshTransform, "사슴벌레 " + sideName + " 큰턱 관절", jawPivot);
            jawBones[sideIndex] = jawBone;
            jawRestRotations[sideIndex] = jawBone.localRotation;
            bones[1 + LegCount + sideIndex] = jawBone;
        }

        Vector3[] vertices = articulatedMesh.vertices;
        BoneWeight[] weights = new BoneWeight[vertices.Length];
        float centerLongitudinal = Axis(center, longitudinalAxis);
        float centerLateral = Axis(center, lateralAxis);
        float innerLeg = lateralExtent * 0.27f;
        float fullLeg = lateralExtent * 0.64f;
        float legCeiling = verticalMin + (verticalSize * 0.57f);
        float fullLegHeight = verticalMin + (verticalSize * 0.25f);

        for (int vertexIndex = 0; vertexIndex < vertices.Length; vertexIndex++)
        {
            Vector3 vertex = vertices[vertexIndex];
            float lateralPosition = Axis(vertex, lateralAxis) - centerLateral;
            float lateralDistance = Mathf.Abs(lateralPosition);
            float verticalPosition = Axis(vertex, verticalAxis);
            float normalizedLongitudinal = longitudinalExtent > 0.0001f
                ? (Axis(vertex, longitudinalAxis) - centerLongitudinal) / longitudinalExtent
                : 0f;

            float jawFrontWeight = Mathf.InverseLerp(0.24f, 0.83f, normalizedLongitudinal);
            float jawSideWeight = Mathf.InverseLerp(lateralExtent * 0.04f, lateralExtent * 0.34f, lateralDistance);
            float jawWeight = jawFrontWeight * Mathf.Lerp(0.15f, 1f, jawSideWeight);

            if (jawWeight > 0.08f)
            {
                int jawIndex = lateralPosition < 0f ? 0 : 1;
                weights[vertexIndex] = MixedWeight(1 + LegCount + jawIndex, jawWeight);
                continue;
            }

            float lateralWeight = Mathf.InverseLerp(innerLeg, fullLeg, lateralDistance);
            float heightWeight = 1f - Mathf.InverseLerp(fullLegHeight, legCeiling, verticalPosition);
            float legWeight = Mathf.Clamp01(lateralWeight * heightWeight);

            if (legWeight < 0.06f)
            {
                weights[vertexIndex] = BodyWeight();
                continue;
            }

            int sideIndex = lateralPosition < 0f ? 0 : 1;
            int section = normalizedLongitudinal > 0.13f ? 0 : normalizedLongitudinal < -0.13f ? 2 : 1;
            weights[vertexIndex] = MixedWeight(1 + (sideIndex * 3) + section, legWeight);
        }

        Matrix4x4[] bindPoses = new Matrix4x4[bones.Length];
        for (int boneIndex = 0; boneIndex < bones.Length; boneIndex++)
            bindPoses[boneIndex] = bones[boneIndex].worldToLocalMatrix * meshTransform.localToWorldMatrix;

        articulatedMesh.boneWeights = weights;
        articulatedMesh.bindposes = bindPoses;

        Material[] sharedMaterials = meshRenderer.sharedMaterials;
        ShadowCastingMode shadowCastingMode = meshRenderer.shadowCastingMode;
        bool receiveShadows = meshRenderer.receiveShadows;
        LightProbeUsage lightProbeUsage = meshRenderer.lightProbeUsage;
        ReflectionProbeUsage reflectionProbeUsage = meshRenderer.reflectionProbeUsage;
        meshRenderer.enabled = false;

        SkinnedMeshRenderer skinnedRenderer = meshFilter.gameObject.AddComponent<SkinnedMeshRenderer>();
        skinnedRenderer.bones = bones;
        skinnedRenderer.rootBone = bones[0];
        skinnedRenderer.sharedMesh = articulatedMesh;
        skinnedRenderer.sharedMaterials = sharedMaterials;
        skinnedRenderer.shadowCastingMode = shadowCastingMode;
        skinnedRenderer.receiveShadows = receiveShadows;
        skinnedRenderer.lightProbeUsage = lightProbeUsage;
        skinnedRenderer.reflectionProbeUsage = reflectionProbeUsage;
        skinnedRenderer.updateWhenOffscreen = true;

        Bounds animatedBounds = bounds;
        Vector3 expansion = bounds.size * 0.22f;
        SetAxis(ref expansion, lateralAxis, Axis(bounds.size, lateralAxis) * 0.45f);
        skinnedRenderer.localBounds = new Bounds(bounds.center, bounds.size + expansion);

        Destroy(meshRenderer);
        Destroy(meshFilter);

        motionReference = transform.parent != null ? transform.parent : transform;
        previousReferencePosition = motionReference.position;
        restLocalPosition = transform.localPosition;
        restLocalRotation = transform.localRotation;
        initialized = true;
    }

    private void DetectBodyAxes(Vector3 size)
    {
        float[] values = { size.x, size.y, size.z };
        longitudinalAxis = 0;
        verticalAxis = 0;

        for (int axis = 1; axis < 3; axis++)
        {
            if (values[axis] > values[longitudinalAxis])
                longitudinalAxis = axis;
            if (values[axis] < values[verticalAxis])
                verticalAxis = axis;
        }

        lateralAxis = 3 - longitudinalAxis - verticalAxis;
    }

    private static float Axis(Vector3 vector, int axis)
    {
        return axis == 0 ? vector.x : axis == 1 ? vector.y : vector.z;
    }

    private static void SetAxis(ref Vector3 vector, int axis, float value)
    {
        if (axis == 0)
            vector.x = value;
        else if (axis == 1)
            vector.y = value;
        else
            vector.z = value;
    }

    private static Vector3 AxisVector(int axis)
    {
        return axis == 0 ? Vector3.right : axis == 1 ? Vector3.up : Vector3.forward;
    }

    private static Transform CreateBone(Transform parent, string boneName, Vector3 localPosition)
    {
        Transform bone = new GameObject(boneName).transform;
        bone.SetParent(parent, false);
        bone.localPosition = localPosition;
        bone.localRotation = Quaternion.identity;
        bone.localScale = Vector3.one;
        return bone;
    }

    private static BoneWeight BodyWeight()
    {
        return new BoneWeight
        {
            boneIndex0 = 0,
            weight0 = 1f
        };
    }

    private static BoneWeight MixedWeight(int movingBoneIndex, float movingWeight)
    {
        movingWeight = Mathf.Clamp01(movingWeight);
        return new BoneWeight
        {
            boneIndex0 = movingBoneIndex,
            weight0 = movingWeight,
            boneIndex1 = 0,
            weight1 = 1f - movingWeight
        };
    }

    private bool RestoreBoneReferencesIfNeeded()
    {
        if (legBones[0] != null && jawBones[0] != null)
            return true;

        string[] sectionNames = { "앞", "가운데", "뒤" };
        Transform[] descendants = GetComponentsInChildren<Transform>(true);

        for (int sideIndex = 0; sideIndex < 2; sideIndex++)
        {
            string sideName = sideIndex == 0 ? "왼쪽" : "오른쪽";
            for (int section = 0; section < 3; section++)
            {
                string expectedName = "사슴벌레 " + sideName + " " + sectionNames[section] + "다리 관절";
                int legIndex = (sideIndex * 3) + section;
                for (int transformIndex = 0; transformIndex < descendants.Length; transformIndex++)
                {
                    if (descendants[transformIndex].name != expectedName)
                        continue;

                    legBones[legIndex] = descendants[transformIndex];
                    legRestRotations[legIndex] = Quaternion.identity;
                    break;
                }
            }

            string jawName = "사슴벌레 " + sideName + " 큰턱 관절";
            for (int transformIndex = 0; transformIndex < descendants.Length; transformIndex++)
            {
                if (descendants[transformIndex].name != jawName)
                    continue;

                jawBones[sideIndex] = descendants[transformIndex];
                jawRestRotations[sideIndex] = Quaternion.identity;
                break;
            }
        }

        for (int legIndex = 0; legIndex < LegCount; legIndex++)
        {
            if (legBones[legIndex] == null)
                return false;
        }

        return jawBones[0] != null && jawBones[1] != null;
    }

    private void LateUpdate()
    {
        if (!initialized || motionReference == null || !RestoreBoneReferencesIfNeeded())
            return;

        float deltaTime = Mathf.Max(Time.deltaTime, 0.0001f);
        float speed = Vector3.Distance(motionReference.position, previousReferencePosition) / deltaTime;
        previousReferencePosition = motionReference.position;

        float movement = Mathf.Clamp01(speed / 0.55f);
        gaitPhase += deltaTime * Mathf.Lerp(1.7f, 10.8f, movement);
        float swingAngle = Mathf.Lerp(2f, 16f, movement);
        float liftAngle = Mathf.Lerp(1f, 9f, movement);
        Vector3 verticalDirection = AxisVector(verticalAxis);
        Vector3 longitudinalDirection = AxisVector(longitudinalAxis);

        for (int legIndex = 0; legIndex < LegCount; legIndex++)
        {
            int sideIndex = legIndex / 3;
            int section = legIndex % 3;
            float side = sideIndex == 0 ? -1f : 1f;
            bool firstTripod = (sideIndex == 0 && section != 1) || (sideIndex == 1 && section == 1);
            float phase = gaitPhase + (firstTripod ? 0f : Mathf.PI);
            float stride = Mathf.Sin(phase);
            float lift = Mathf.Max(0f, Mathf.Cos(phase));

            Quaternion swingRotation = Quaternion.AngleAxis(stride * swingAngle, verticalDirection);
            Quaternion liftRotation = Quaternion.AngleAxis(side * lift * liftAngle, longitudinalDirection);
            legBones[legIndex].localRotation = legRestRotations[legIndex] * swingRotation * liftRotation;
        }

        float idleJawMotion = Mathf.Sin(Time.time * 1.8f) * 0.8f;
        float jawSpread = idleJawMotion + (attackOpen * 24f) - (attackBite * 20f);
        Vector3 lateralDirection = AxisVector(lateralAxis);

        for (int jawIndex = 0; jawIndex < JawCount; jawIndex++)
        {
            float side = jawIndex == 0 ? -1f : 1f;
            Quaternion spreadRotation = Quaternion.AngleAxis(-side * jawSpread, verticalDirection);
            Quaternion liftRotation = Quaternion.AngleAxis(attackLift * 12f, lateralDirection);
            jawBones[jawIndex].localRotation = jawRestRotations[jawIndex] * liftRotation * spreadRotation;
        }

        float bob = Mathf.Sin(gaitPhase * 2f) * Mathf.Lerp(0.002f, 0.009f, movement);
        float jawClearance = (attackOpen * 0.006f) + (attackBite * 0.012f);
        transform.localPosition = restLocalPosition + (Vector3.up * (bob + jawClearance));
        transform.localRotation = restLocalRotation;
    }
}
