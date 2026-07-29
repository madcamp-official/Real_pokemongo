using UnityEngine;
using UnityEngine.Rendering;

/// <summary>
/// Adds a lightweight procedural six-leg rig to a beetle mesh that has no
/// authored bones or animation clips.
/// </summary>
public sealed class ArticulatedBeetleRig : MonoBehaviour
{
    private const int LegCount = 6;

    private readonly Transform[] legBones = new Transform[LegCount];
    private readonly Quaternion[] restRotations = new Quaternion[LegCount];

    private Transform motionReference;
    private Vector3 previousReferencePosition;
    private Vector3 restLocalPosition;
    private float gaitPhase;
    private float phaseOffset;
    private bool initialized;

    public static ArticulatedBeetleRig Attach(GameObject beetleModel, float phaseOffset)
    {
        ArticulatedBeetleRig rig = beetleModel.GetComponent<ArticulatedBeetleRig>();
        if (rig == null)
            rig = beetleModel.AddComponent<ArticulatedBeetleRig>();

        rig.phaseOffset = phaseOffset;
        rig.BuildRig();
        return rig;
    }

    private void BuildRig()
    {
        if (initialized)
            return;

        MeshFilter meshFilter = GetComponentInChildren<MeshFilter>();
        MeshRenderer meshRenderer = meshFilter != null ? meshFilter.GetComponent<MeshRenderer>() : null;
        if (meshFilter == null || meshRenderer == null || meshFilter.sharedMesh == null)
        {
            Debug.LogWarning("장수풍뎅이 메시를 찾지 못해 관절 리그를 만들 수 없습니다.", this);
            return;
        }

        Mesh sourceMesh = meshFilter.sharedMesh;
        if (!sourceMesh.isReadable)
        {
            Debug.LogWarning("장수풍뎅이 메시의 Read/Write가 꺼져 있어 관절 리그를 만들 수 없습니다.", this);
            return;
        }

        Mesh articulatedMesh = Instantiate(sourceMesh);
        articulatedMesh.name = sourceMesh.name + " - Procedural Leg Rig";

        Transform meshTransform = meshFilter.transform;
        Bounds bounds = articulatedMesh.bounds;
        Vector3 center = bounds.center;
        Vector3 extents = bounds.extents;

        Transform[] bones = new Transform[LegCount + 1];
        bones[0] = CreateBone(meshTransform, "몸통 관절", center);

        string[] sectionNames = { "앞", "가운데", "뒤" };
        for (int sideIndex = 0; sideIndex < 2; sideIndex++)
        {
            float side = sideIndex == 0 ? -1f : 1f;
            string sideName = sideIndex == 0 ? "왼쪽" : "오른쪽";

            for (int section = 0; section < 3; section++)
            {
                int legIndex = (sideIndex * 3) + section;
                float longitudinal = section == 0 ? 0.34f : section == 1 ? 0f : -0.34f;
                Vector3 pivot = new Vector3(
                    center.x + (side * extents.x * 0.30f),
                    bounds.min.y + (bounds.size.y * 0.27f),
                    center.z + (longitudinal * extents.z));

                Transform legBone = CreateBone(
                    meshTransform,
                    sideName + " " + sectionNames[section] + "다리 관절",
                    pivot);

                legBones[legIndex] = legBone;
                restRotations[legIndex] = legBone.localRotation;
                bones[legIndex + 1] = legBone;
            }
        }

        Vector3[] vertices = articulatedMesh.vertices;
        BoneWeight[] weights = new BoneWeight[vertices.Length];
        float innerLegX = extents.x * 0.27f;
        float fullLegX = extents.x * 0.62f;
        float legCeiling = bounds.min.y + (bounds.size.y * 0.56f);
        float fullLegHeight = bounds.min.y + (bounds.size.y * 0.25f);

        for (int vertexIndex = 0; vertexIndex < vertices.Length; vertexIndex++)
        {
            Vector3 vertex = vertices[vertexIndex];
            float sideDistance = Mathf.Abs(vertex.x - center.x);
            float lateralWeight = Mathf.InverseLerp(innerLegX, fullLegX, sideDistance);
            float heightWeight = 1f - Mathf.InverseLerp(fullLegHeight, legCeiling, vertex.y);
            float legWeight = Mathf.Clamp01(lateralWeight * heightWeight);

            if (legWeight < 0.06f)
            {
                weights[vertexIndex] = BodyWeight();
                continue;
            }

            int sideIndex = vertex.x < center.x ? 0 : 1;
            float normalizedZ = extents.z > 0.0001f ? (vertex.z - center.z) / extents.z : 0f;
            int section = normalizedZ > 0.13f ? 0 : normalizedZ < -0.13f ? 2 : 1;
            int legBoneIndex = 1 + (sideIndex * 3) + section;

            BoneWeight weight = new BoneWeight
            {
                boneIndex0 = legBoneIndex,
                weight0 = legWeight,
                boneIndex1 = 0,
                weight1 = 1f - legWeight
            };
            weights[vertexIndex] = weight;
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
        animatedBounds.Expand(new Vector3(bounds.size.x * 0.35f, bounds.size.y * 0.25f, bounds.size.z * 0.12f));
        skinnedRenderer.localBounds = animatedBounds;

        Destroy(meshRenderer);
        Destroy(meshFilter);

        motionReference = transform.parent != null ? transform.parent : transform;
        previousReferencePosition = motionReference.position;
        restLocalPosition = transform.localPosition;
        gaitPhase = phaseOffset;
        initialized = true;
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

    private bool RestoreLegReferencesIfNeeded()
    {
        if (legBones[0] != null)
            return true;

        string[] sectionNames = { "앞", "가운데", "뒤" };
        Transform[] descendants = GetComponentsInChildren<Transform>(true);
        for (int sideIndex = 0; sideIndex < 2; sideIndex++)
        {
            string sideName = sideIndex == 0 ? "왼쪽" : "오른쪽";
            for (int section = 0; section < 3; section++)
            {
                string expectedName = sideName + " " + sectionNames[section] + "다리 관절";
                int legIndex = (sideIndex * 3) + section;
                for (int transformIndex = 0; transformIndex < descendants.Length; transformIndex++)
                {
                    if (descendants[transformIndex].name != expectedName)
                        continue;

                    legBones[legIndex] = descendants[transformIndex];
                    restRotations[legIndex] = Quaternion.identity;
                    break;
                }
            }
        }

        for (int legIndex = 0; legIndex < LegCount; legIndex++)
        {
            if (legBones[legIndex] == null)
                return false;
        }

        return true;
    }

    private void LateUpdate()
    {
        if (!initialized || motionReference == null || !RestoreLegReferencesIfNeeded())
            return;

        float deltaTime = Mathf.Max(Time.deltaTime, 0.0001f);
        float speed = Vector3.Distance(motionReference.position, previousReferencePosition) / deltaTime;
        previousReferencePosition = motionReference.position;

        float movement = Mathf.Clamp01(speed / 0.55f);
        float cadence = Mathf.Lerp(1.8f, 10.5f, movement);
        float swingAngle = Mathf.Lerp(2.2f, 17f, movement);
        float liftAngle = Mathf.Lerp(1.2f, 10f, movement);
        gaitPhase += deltaTime * cadence;

        for (int legIndex = 0; legIndex < LegCount; legIndex++)
        {
            int sideIndex = legIndex / 3;
            int section = legIndex % 3;
            float side = sideIndex == 0 ? -1f : 1f;

            // Alternating tripod gait:
            // left front/rear + right middle, then the opposite three legs.
            bool firstTripod = (sideIndex == 0 && section != 1) || (sideIndex == 1 && section == 1);
            float tripodPhase = gaitPhase + (firstTripod ? 0f : Mathf.PI);
            float stride = Mathf.Sin(tripodPhase);
            float plantedLift = Mathf.Max(0f, Mathf.Cos(tripodPhase));

            float frontRearBias = section == 0 ? 2f : section == 2 ? -2f : 0f;
            Quaternion gaitRotation = Quaternion.Euler(
                side * (frontRearBias + (plantedLift * liftAngle)),
                stride * swingAngle,
                side * plantedLift * liftAngle * 0.65f);

            legBones[legIndex].localRotation = restRotations[legIndex] * gaitRotation;
        }

        float bob = Mathf.Sin(gaitPhase * 2f) * Mathf.Lerp(0.002f, 0.012f, movement);
        float roll = Mathf.Sin(gaitPhase) * Mathf.Lerp(0.2f, 1.1f, movement);
        transform.localPosition = restLocalPosition + (Vector3.up * bob);
        transform.localRotation = Quaternion.Euler(0f, 0f, roll);
    }
}
