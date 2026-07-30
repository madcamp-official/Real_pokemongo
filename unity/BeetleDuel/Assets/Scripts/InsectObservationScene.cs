using System.Collections.Generic;
using UnityEngine;

public sealed class InsectObservationScene : MonoBehaviour
{
    
    public GameObject rhinocerosBeetlePrefab;
    public GameObject stagBeetlePrefab;
    public GameObject greyHeronPrefab;
    private InsectSelectable beetleSpecimen;
    private readonly List<InsectSelectable> specimens = new List<InsectSelectable>();
    private Camera observationCamera;
    private InsectSelectable selected;
    private Vector3 cameraTarget;
    private Vector3 desiredCameraPosition;
    private GUIStyle titleStyle;
    private GUIStyle bodyStyle;
    private Transform greenhouseInterior;

    private void Start()
    {
        if (stagBeetlePrefab == null)
            stagBeetlePrefab = Resources.Load<GameObject>("Models/StagBeetle");
        if (greyHeronPrefab == null)
            greyHeronPrefab = Resources.Load<GameObject>("Models/GreyHeronRigged");

        GameObject templatePlane = GameObject.Find("Plane");
        if (templatePlane != null)
            Destroy(templatePlane);

        GameObject templateGround = GameObject.Find("Ground");
        if (templateGround != null)
            Destroy(templateGround);

        SetupCameraAndLight();
        greenhouseInterior = BuildDollhouseGreenhouse();
        BuildForestHabitat();
        CreateBeetleHabitat(new Vector3(0f, 0.82f, 0.15f));
        CreateGreyHeron(new Vector3(-2.85f, 0.04f, -3.15f));
        CreateButterflyGroup();
        CreateFlyingInsectGroup();
        CreateGroundInsectGroup();
        CreateBirdGroup();

        selected = beetleSpecimen;
        cameraTarget = new Vector3(0f, 28f, 17f);
        desiredCameraPosition = new Vector3(0f, 30f, -88f);
        observationCamera.transform.position = desiredCameraPosition;
        observationCamera.transform.LookAt(cameraTarget);
    }

    private void SetupCameraAndLight()
    {
        observationCamera = Camera.main;
        if (observationCamera == null)
        {
            GameObject cameraObject = new GameObject("Observation Camera");
            observationCamera = cameraObject.AddComponent<Camera>();
            cameraObject.tag = "MainCamera";
        }

        observationCamera.transform.position = new Vector3(0f, 30f, -88f);
        observationCamera.transform.LookAt(new Vector3(0f, 28f, 17f));
        observationCamera.clearFlags = CameraClearFlags.SolidColor;
        observationCamera.backgroundColor = new Color(0.11f, 0.23f, 0.16f);
        observationCamera.fieldOfView = 50f;

        RenderSettings.fog = true;
        RenderSettings.fogMode = FogMode.Linear;
        RenderSettings.fogColor = new Color(0.16f, 0.29f, 0.2f);
        RenderSettings.fogStartDistance = 110f;
        RenderSettings.fogEndDistance = 180f;
        RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
        RenderSettings.ambientLight = new Color(0.43f, 0.47f, 0.38f);

        Light sun = FindAnyObjectByType<Light>();
        if (sun == null)
        {
            sun = new GameObject("Sun").AddComponent<Light>();
            sun.type = LightType.Directional;
        }
        // The camera views through the removed rear half. Light from that side
        // so exhibit shadows fall toward the intact entrance facade.
        sun.transform.rotation = Quaternion.Euler(48f, -28f, 0f);
        sun.color = new Color(1f, 0.9f, 0.67f);
        sun.intensity = 1.2f;
        sun.shadows = LightShadows.Soft;
        sun.shadowStrength = 0.35f;
    }

    private Transform BuildDollhouseGreenhouse()
    {
        GameObject prefab = Resources.Load<GameObject>(
            "Models/Environment/DollhouseGreenhouse");
        GameObject greenhouse;
        if (prefab == null)
        {
            Debug.LogWarning("인형의 집 온실 모델을 불러오지 못했습니다.");
            greenhouse = new GameObject("인형의 집 온실 (모델 누락)");
        }
        else
        {
            greenhouse = Instantiate(prefab);
            greenhouse.name = "후면 절반을 제거한 인형의 집 온실";
            greenhouse.transform.position = Vector3.zero;
            greenhouse.transform.rotation = Quaternion.identity;
            // Preserve the source proportions while giving the mature tree crowns
            // enough depth to remain fully inside the retained front half.
            greenhouse.transform.localScale = Vector3.one * 70f;
            LockEnvironmentObject(greenhouse);
        }

        Transform interior = new GameObject("온실 내부 생태 전시").transform;
        interior.position = new Vector3(0f, 0f, 28.1f);
        return interior;
    }

    private Vector3 InteriorPoint(Vector3 localPoint)
    {
        return greenhouseInterior != null
            ? greenhouseInterior.TransformPoint(localPoint)
            : localPoint;
    }

    private void BuildForestHabitat()
    {
        Transform forest = new GameObject("실제 수종 숲 환경").transform;
        forest.SetParent(greenhouseInterior, false);
        Primitive("부엽토", PrimitiveType.Cube, forest, new Vector3(0f, -0.3f, -7.2f), new Vector3(42f, 0.5f, 22f), new Color(0.11f, 0.16f, 0.08f));
        Primitive("이끼 낀 숲바닥", PrimitiveType.Plane, forest, new Vector3(0f, -0.03f, -7.2f), new Vector3(4.2f, 1f, 2.2f), new Color(0.16f, 0.3f, 0.12f));

        CreateFallenLog(forest, new Vector3(0f, 0.48f, 0.15f), new Vector3(0f, 0f, 90f), 3.3f, 0.62f);
        CreatePond(forest);

        Transform trees = new GameObject("현실 크기 나무 8종").transform;
        trees.SetParent(forest, false);

        // Representative mature heights in metres. The imported tree assets
        // are normalized to one metre, so the local scale equals real height.
        CreateStaticTree(trees, "신갈나무", "Models/Trees/MongolianOak",
            new Vector3(-11f, 0f, -14f), 20f, 22f);
        CreateStaticTree(trees, "굴참나무", "Models/Trees/OrientalCorkOak",
            new Vector3(11.5f, 0f, -14.5f), 20f, -31f);
        CreateStaticTree(trees, "옻나무", "Models/Trees/LacquerTree",
            new Vector3(16.5f, 0f, -5.5f), 15f, 138f);
        CreateStaticTree(trees, "생강나무", "Models/Trees/JapaneseSpicebush",
            new Vector3(-8.4f, 0f, 2.8f), 4f, 74f);
        CreateStaticTree(trees, "산초나무", "Models/Trees/MasticLeafPricklyAsh",
            new Vector3(8.1f, 0f, 2.6f), 3f, -42f);
        CreateStaticTree(trees, "국수나무", "Models/Trees/NoodleTree",
            new Vector3(-5.6f, 0f, -1.2f), 1.5f, 18f);
        CreateStaticTree(trees, "작살나무", "Models/Trees/JapaneseBeautyberry",
            new Vector3(5.9f, 0f, -1.7f), 2.5f, 111f);
        CreateStaticTree(trees, "쥐똥나무", "Models/Trees/BorderPrivet",
            new Vector3(-8.2f, 0f, -4.8f), 3f, -64f);

        CreateStaticTree(trees, "국수나무 군락", "Models/Trees/NoodleTree",
            new Vector3(3.7f, 0f, 4.1f), 1.35f, -85f);
        CreateStaticTree(trees, "작살나무 군락", "Models/Trees/JapaneseBeautyberry",
            new Vector3(-2.8f, 0f, -6.1f), 2.2f, 36f);
        CreateStaticTree(trees, "쥐똥나무 군락", "Models/Trees/BorderPrivet",
            new Vector3(9.8f, 0f, -6.2f), 2.6f, 126f);
        CreateStaticTree(trees, "생강나무 군락", "Models/Trees/JapaneseSpicebush",
            new Vector3(-15.2f, 0f, -4.2f), 3.6f, -18f);

        CreateUnderstoryPlants(forest);

        Vector3[] fernPositions =
        {
            new Vector3(-3.7f, 0f, 1.5f), new Vector3(3.8f, 0f, 1.7f),
            new Vector3(-4.4f, 0f, -4.5f), new Vector3(4.2f, 0f, -4.1f),
            new Vector3(-1.7f, 0f, -2.7f), new Vector3(1.2f, 0f, -3.2f)
        };
        for (int index = 0; index < fernPositions.Length; index++)
            CreateFern(forest, fernPositions[index], index * 29f);

        CreateForestRock(forest, new Vector3(-4.9f, 0.24f, -0.4f), new Vector3(1.5f, 0.65f, 1.1f));
        CreateForestRock(forest, new Vector3(4.7f, 0.18f, -1.2f), new Vector3(1.1f, 0.48f, 0.9f));
        CreateForestRock(forest, new Vector3(2.8f, 0.12f, 3.6f), new Vector3(0.75f, 0.38f, 0.62f));
    }

    private void CreateFallenLog(Transform parent, Vector3 position, Vector3 rotation, float halfLength, float radius)
    {
        Primitive("쓰러진 참나무", PrimitiveType.Cylinder, parent, position, new Vector3(radius, halfLength, radius), new Color(0.26f, 0.13f, 0.055f), rotation);
        Primitive("나이테 왼쪽", PrimitiveType.Cylinder, parent, position + new Vector3(-halfLength, 0f, 0f), new Vector3(radius * 1.02f, 0.035f, radius * 1.02f), new Color(0.48f, 0.29f, 0.12f), rotation);
        Primitive("나이테 오른쪽", PrimitiveType.Cylinder, parent, position + new Vector3(halfLength, 0f, 0f), new Vector3(radius * 1.02f, 0.035f, radius * 1.02f), new Color(0.42f, 0.24f, 0.1f), rotation);
        for (int index = -2; index <= 2; index++)
        {
            Primitive(
                "통나무 이끼",
                PrimitiveType.Sphere,
                parent,
                position + new Vector3(index * 1.15f, radius * 0.78f, -0.12f + ((index & 1) * 0.22f)),
                new Vector3(0.8f, 0.11f, 0.38f),
                new Color(0.18f, 0.38f, 0.09f),
                new Vector3(0f, index * 23f, 0f));
        }
    }

    private void CreateStaticTree(
        Transform parent,
        string koreanName,
        string resourcePath,
        Vector3 position,
        float heightMetres,
        float yaw)
    {
        GameObject prefab = Resources.Load<GameObject>(resourcePath);
        if (prefab == null)
        {
            Debug.LogWarning($"{koreanName} 나무 모델을 불러오지 못했습니다.");
            return;
        }

        GameObject tree = Instantiate(prefab, parent, false);
        tree.name = $"{koreanName} ({heightMetres:0.##}m)";
        tree.transform.localPosition = position;
        tree.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
        tree.transform.localScale = Vector3.one * heightMetres;

        LockEnvironmentObject(tree);
    }

    private void CreateUnderstoryPlants(Transform parent)
    {
        Transform plants = new GameObject("관찰용 확대 식물 15종").transform;
        plants.SetParent(parent, false);

        CreatePlantCluster(plants, "개망초", "Models/Plants/Fleabane", 1.05f,
            new Vector3(-6.4f, 0f, 3.4f),
            new Vector3(-5.25f, 0f, 3.85f),
            new Vector3(6.5f, 0f, 4.1f));
        CreatePlantCluster(plants, "닭의장풀", "Models/Plants/Dayflower", 0.78f,
            new Vector3(-3.8f, 0f, 2.55f),
            new Vector3(4.65f, 0f, 2.65f),
            new Vector3(7.0f, 0f, 1.35f));
        CreatePlantCluster(plants, "돼지풀", "Models/Plants/Ragweed", 1.75f,
            new Vector3(-10.25f, 0f, -3.5f),
            new Vector3(10.75f, 0f, -4.15f));
        CreatePlantCluster(plants, "미국자리공", "Models/Plants/Pokeweed", 3.1f,
            new Vector3(-12.6f, 0f, -7.1f),
            new Vector3(12.9f, 0f, -7.6f));
        CreatePlantCluster(plants, "사위질빵", "Models/Plants/ClematisVine", 2.75f,
            new Vector3(-9.8f, 0f, -11.8f),
            new Vector3(9.9f, 0f, -12.2f));
        CreatePlantCluster(plants, "산딸기", "Models/Plants/KoreanRaspberry", 2.0f,
            new Vector3(-7.2f, 0f, -5.9f),
            new Vector3(7.15f, 0f, -5.75f));
        CreatePlantCluster(plants, "서양민들레", "Models/Plants/Dandelion", 0.7f,
            new Vector3(-5.0f, 0f, 4.65f),
            new Vector3(-0.6f, 0f, 4.45f),
            new Vector3(4.9f, 0f, 4.75f));
        CreatePlantCluster(plants, "애기똥풀", "Models/Plants/Celandine", 1.1f,
            new Vector3(-6.1f, 0f, 0.55f),
            new Vector3(6.25f, 0f, 0.7f));
        CreatePlantCluster(plants, "진달래", "Models/Plants/KoreanAzalea", 2.5f,
            new Vector3(-13.45f, 0f, -2.0f),
            new Vector3(13.8f, 0f, -2.45f));
        CreatePlantCluster(plants, "청미래덩굴", "Models/Plants/Greenbrier", 3.0f,
            new Vector3(-14.2f, 0f, -9.8f),
            new Vector3(14.25f, 0f, -10.1f));
        CreatePlantCluster(plants, "초록싸리", "Models/Plants/GreenBushClover", 2.1f,
            new Vector3(-9.35f, 0f, 0.75f),
            new Vector3(9.45f, 0f, 0.4f));
        CreatePlantCluster(plants, "칡", "Models/Plants/Kudzu", 3.25f,
            new Vector3(-11.6f, 0f, -13.0f),
            new Vector3(11.8f, 0f, -13.2f));
        CreatePlantCluster(plants, "큰까치수염", "Models/Plants/GooseneckLoosestrife", 1.35f,
            new Vector3(-5.6f, 0f, -4.25f),
            new Vector3(-4.5f, 0f, -4.75f),
            new Vector3(-1.45f, 0f, -4.55f));
        CreatePlantCluster(plants, "토끼풀", "Models/Plants/WhiteClover", 0.58f,
            new Vector3(-2.8f, 0f, 3.75f),
            new Vector3(1.1f, 0f, 4.0f),
            new Vector3(3.4f, 0f, 3.55f));
        CreatePlantCluster(plants, "환상덩굴", "Models/Plants/HopsVine", 3.2f,
            new Vector3(-8.8f, 0f, -9.4f),
            new Vector3(8.9f, 0f, -9.7f));
    }

    private void CreatePlantCluster(
        Transform parent,
        string koreanName,
        string resourcePath,
        float displayHeightMetres,
        params Vector3[] positions)
    {
        for (int index = 0; index < positions.Length; index++)
        {
            float heightVariation = 0.9f + ((index % 3) * 0.1f);
            float yaw = (index * 137f) + (displayHeightMetres * 41f);
            CreateStaticPlant(
                parent,
                koreanName,
                resourcePath,
                positions[index],
                displayHeightMetres * heightVariation,
                yaw,
                index + 1);
        }
    }

    private void CreateStaticPlant(
        Transform parent,
        string koreanName,
        string resourcePath,
        Vector3 position,
        float displayHeightMetres,
        float yaw,
        int clusterIndex)
    {
        GameObject prefab = Resources.Load<GameObject>(resourcePath);
        if (prefab == null)
        {
            Debug.LogWarning($"{koreanName} 식물 모델을 불러오지 못했습니다.");
            return;
        }

        GameObject plant = Instantiate(prefab, parent, false);
        plant.name = $"{koreanName} {clusterIndex} ({displayHeightMetres:0.##}m 전시 크기)";
        plant.transform.localPosition = position;
        plant.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
        plant.transform.localScale = Vector3.one * displayHeightMetres;
        LockEnvironmentObject(plant);
    }

    private void LockEnvironmentObject(GameObject root)
    {
        Animator[] animators = root.GetComponentsInChildren<Animator>(true);
        for (int index = 0; index < animators.Length; index++)
            animators[index].enabled = false;
        Rigidbody[] rigidbodies = root.GetComponentsInChildren<Rigidbody>(true);
        for (int index = 0; index < rigidbodies.Length; index++)
            Destroy(rigidbodies[index]);

        Transform[] parts = root.GetComponentsInChildren<Transform>(true);
        for (int index = 0; index < parts.Length; index++)
            parts[index].gameObject.isStatic = true;
    }

    private void CreateFern(Transform parent, Vector3 position, float yaw)
    {
        for (int index = 0; index < 7; index++)
        {
            float angle = (yaw + (index * 51f)) * Mathf.Deg2Rad;
            Vector3 offset = new Vector3(Mathf.Cos(angle) * 0.42f, 0.38f, Mathf.Sin(angle) * 0.42f);
            Primitive(
                "고사리 잎",
                PrimitiveType.Cube,
                parent,
                position + offset,
                new Vector3(0.14f, 0.035f, 0.9f),
                new Color(0.16f, 0.46f, 0.12f),
                new Vector3(-20f, -yaw - (index * 51f), 8f));
        }
    }

    private void CreateForestRock(Transform parent, Vector3 position, Vector3 scale)
    {
        Primitive("이끼 바위", PrimitiveType.Sphere, parent, position, scale, new Color(0.26f, 0.31f, 0.23f), new Vector3(0f, 24f, 7f));
        Primitive("바위 이끼", PrimitiveType.Sphere, parent, position + new Vector3(0f, scale.y * 0.7f, 0f), new Vector3(scale.x * 0.75f, 0.08f, scale.z * 0.7f), new Color(0.19f, 0.39f, 0.1f));
    }

    private void CreatePond(Transform parent)
    {
        Primitive("얕은 물가", PrimitiveType.Cube, parent, new Vector3(-3.2f, 0.01f, -3.55f), new Vector3(4.6f, 0.045f, 2.4f), new Color(0.08f, 0.28f, 0.24f), new Vector3(0f, -8f, 0f));
        Primitive("물가 둔덕", PrimitiveType.Sphere, parent, new Vector3(-5.35f, 0.12f, -3.1f), new Vector3(1.8f, 0.25f, 1.1f), new Color(0.18f, 0.26f, 0.11f));
        Primitive("물가 둔덕", PrimitiveType.Sphere, parent, new Vector3(-1.0f, 0.11f, -4.05f), new Vector3(1.5f, 0.22f, 0.9f), new Color(0.18f, 0.26f, 0.11f));
    }

    private void CreateLadybug(Vector3 position)
    {
        InsectSelectable root = CreateSpecimen("무당벌레", "Harmonia axyridis", "풀밭과 정원에서 진딧물을 먹는 작은 포식자예요.", "몸길이 7~8mm · 봄~가을 · 낮 활동", false, position, 0.16f, 10f);
        Transform t = root.transform;
        Primitive("Red shell", PrimitiveType.Sphere, t, new Vector3(0f, 0.25f, 0f), new Vector3(1.35f, 0.65f, 1.5f), new Color(0.92f, 0.08f, 0.04f));
        Primitive("Head", PrimitiveType.Sphere, t, new Vector3(0f, 0.22f, 0.65f), new Vector3(0.6f, 0.42f, 0.52f), Color.black);
        Primitive("Shell divide", PrimitiveType.Cube, t, new Vector3(0f, 0.58f, -0.05f), new Vector3(0.06f, 0.05f, 1.1f), Color.black);

        Vector3[] spots =
        {
            new Vector3(-0.38f, 0.58f, 0.26f), new Vector3(0.38f, 0.58f, 0.26f),
            new Vector3(-0.4f, 0.59f, -0.38f), new Vector3(0.4f, 0.59f, -0.38f),
            new Vector3(-0.26f, 0.60f, -0.72f), new Vector3(0.26f, 0.60f, -0.72f)
        };
        foreach (Vector3 spot in spots)
            Primitive("Spot", PrimitiveType.Sphere, t, spot, Vector3.one * 0.19f, Color.black);

        CreateLegs(t, 0.42f, 0.34f);
        CreateAntennae(t, new Vector3(0f, 0.35f, 0.85f), 0.34f);
    }

    private void CreateHoneybee(Vector3 position)
    {
        InsectSelectable root = CreateSpecimen("양봉꿀벌", "Apis mellifera", "꽃가루를 옮기는 중요한 수분 곤충이에요.", "몸길이 1~1.5cm · 봄~여름 · 낮 활동", true, position, 0.22f, 9f);
        Transform t = root.transform;
        Primitive("Thorax", PrimitiveType.Sphere, t, new Vector3(0f, 0.05f, 0.12f), new Vector3(0.88f, 0.72f, 0.95f), new Color(0.34f, 0.18f, 0.08f));
        Primitive("Abdomen", PrimitiveType.Capsule, t, new Vector3(0f, 0.02f, -0.72f), new Vector3(0.7f, 1.12f, 0.7f), new Color(0.98f, 0.63f, 0.04f), new Vector3(90f, 0f, 0f));
        for (int i = 0; i < 3; i++)
            Primitive("Abdomen stripe", PrimitiveType.Cylinder, t, new Vector3(0f, 0.02f, -0.4f - (i * 0.35f)), new Vector3(0.38f, 0.11f, 0.38f), new Color(0.1f, 0.06f, 0.02f), new Vector3(90f, 0f, 0f));

        Primitive("Head", PrimitiveType.Sphere, t, new Vector3(0f, 0.06f, 0.72f), new Vector3(0.55f, 0.52f, 0.52f), Color.black);
        CreateWing(t, new Vector3(-0.62f, 0.28f, 0f), new Vector3(0.85f, 0.06f, 1.18f), new Color(0.67f, 0.9f, 1f), -17f);
        CreateWing(t, new Vector3(0.62f, 0.28f, 0f), new Vector3(0.85f, 0.06f, 1.18f), new Color(0.67f, 0.9f, 1f), 17f);
        CreateLegs(t, 0.5f, 0.32f);
        CreateAntennae(t, new Vector3(0f, 0.23f, 0.95f), 0.38f);
    }

    private void CreateDragonfly(Vector3 position)
    {
        InsectSelectable root = CreateSpecimen("밀잠자리", "Orthetrum albistylum", "연못과 풀밭 주변을 빠르게 비행하는 잠자리예요.", "몸길이 5cm 안팎 · 여름 · 낮 활동", false, position, 0.2f, 7.2f);
        Transform t = root.transform;
        Primitive("Dragonfly body", PrimitiveType.Capsule, t, new Vector3(0f, 0f, -0.38f), new Vector3(0.28f, 1.55f, 0.28f), new Color(0.3f, 0.58f, 0.72f), new Vector3(90f, 0f, 0f));
        Primitive("Dragonfly head", PrimitiveType.Sphere, t, new Vector3(0f, 0f, 0.88f), new Vector3(0.58f, 0.48f, 0.5f), new Color(0.12f, 0.24f, 0.2f));
        CreateWing(t, new Vector3(-0.93f, 0.07f, 0.25f), new Vector3(1.35f, 0.04f, 0.38f), new Color(0.72f, 0.94f, 1f), -4f);
        CreateWing(t, new Vector3(0.93f, 0.07f, 0.25f), new Vector3(1.35f, 0.04f, 0.38f), new Color(0.72f, 0.94f, 1f), 4f);
        CreateWing(t, new Vector3(-0.88f, 0.07f, -0.35f), new Vector3(1.28f, 0.04f, 0.32f), new Color(0.72f, 0.94f, 1f), -8f);
        CreateWing(t, new Vector3(0.88f, 0.07f, -0.35f), new Vector3(1.28f, 0.04f, 0.32f), new Color(0.72f, 0.94f, 1f), 8f);
        CreateLegs(t, 0.28f, 0.25f);
    }

    private InsectSelectable CreateSpecimen(string koreanName, string scientificName, string note, string profile, bool caution, Vector3 position, float bobAmount, float bobSpeed)
    {
        GameObject root = new GameObject(koreanName);
        root.transform.SetParent(greenhouseInterior, false);
        root.transform.localPosition = position;
        InsectSelectable selectable = root.AddComponent<InsectSelectable>();
        selectable.koreanName = koreanName;
        selectable.scientificName = scientificName;
        selectable.note = note;
        selectable.profile = profile;
        selectable.caution = caution;
        InsectHover hover = root.AddComponent<InsectHover>();
        hover.amount = bobAmount;
        hover.speed = bobSpeed;
        specimens.Add(selectable);
        return selectable;
    }

    private void CreateLeaf(Vector3 position, Vector3 scale, Color color, float yaw)
    {
        GameObject leaf = Primitive("Leaf perch", PrimitiveType.Sphere, position, scale, color, new Vector3(0f, yaw, 7f));
        leaf.transform.localScale = scale;
    }

    private void CreateFlower(Vector3 position, Color petal, Color centre)
    {
        Transform flower = new GameObject("Flower").transform;
        flower.position = position;
        Primitive("Stem", PrimitiveType.Cylinder, flower, new Vector3(0f, 0.72f, 0f), new Vector3(0.09f, 0.72f, 0.09f), new Color(0.17f, 0.55f, 0.21f));
        for (int i = 0; i < 6; i++)
        {
            float angle = i * 60f * Mathf.Deg2Rad;
            Primitive("Petal", PrimitiveType.Sphere, flower, new Vector3(Mathf.Cos(angle) * 0.52f, 1.42f, Mathf.Sin(angle) * 0.52f), new Vector3(0.62f, 0.16f, 0.42f), petal, new Vector3(0f, -i * 60f, 0f));
        }
        Primitive("Flower centre", PrimitiveType.Sphere, flower, new Vector3(0f, 1.46f, 0f), Vector3.one * 0.34f, centre);
    }

    private void CreateReed(Vector3 position)
    {
        Primitive("Reed", PrimitiveType.Cylinder, position + new Vector3(0f, 0.72f, 0f), new Vector3(0.055f, 0.72f, 0.055f), new Color(0.12f, 0.42f, 0.2f), new Vector3(8f, 0f, 3f));
        Primitive("Reed leaf", PrimitiveType.Cube, position + new Vector3(0.15f, 0.75f, 0f), new Vector3(0.48f, 0.08f, 0.12f), new Color(0.2f, 0.63f, 0.25f), new Vector3(0f, 0f, 28f));
    }

    private void CreateRock(Vector3 position)
    {
        Primitive("River rock", PrimitiveType.Sphere, position, new Vector3(1.2f, 0.55f, 0.9f), new Color(0.34f, 0.42f, 0.42f));
    }

    private GameObject Primitive(string objectName, PrimitiveType primitiveType, Vector3 position, Vector3 scale, Color color, Vector3? rotation = null)
    {
        GameObject created = GameObject.CreatePrimitive(primitiveType);
        created.name = objectName;
        created.transform.position = position;
        created.transform.localScale = scale;
        if (rotation.HasValue)
            created.transform.rotation = Quaternion.Euler(rotation.Value);
        ApplyColor(created, color);
        return created;
    }

    private GameObject Primitive(string objectName, PrimitiveType primitiveType, Transform parent, Vector3 localPosition, Vector3 scale, Color color, Vector3? localRotation = null)
    {
        GameObject created = GameObject.CreatePrimitive(primitiveType);
        created.name = objectName;
        created.transform.SetParent(parent, false);
        created.transform.localPosition = localPosition;
        created.transform.localScale = scale;
        if (localRotation.HasValue)
            created.transform.localRotation = Quaternion.Euler(localRotation.Value);
        ApplyColor(created, color);
        return created;
    }

    private void ApplyColor(GameObject target, Color color)
    {
        Renderer renderer = target.GetComponent<Renderer>();
        if (renderer == null)
            return;

        Shader shader = Shader.Find("Standard");
        if (shader == null)
            shader = Shader.Find("Sprites/Default");
        Material material = new Material(shader);
        material.color = color;
        renderer.material = material;
    }

    private void CreateWing(Transform parent, Vector3 localPosition, Vector3 scale, Color color, float yaw)
    {
        Primitive("Wing", PrimitiveType.Cube, parent, localPosition, scale, color, new Vector3(0f, yaw, 12f));
    }

    private void CreateLegs(Transform parent, float width, float length)
    {
        for (int side = -1; side <= 1; side += 2)
        {
            for (int i = 0; i < 3; i++)
            {
                float z = 0.38f - (i * 0.4f);
                Primitive("Leg", PrimitiveType.Cylinder, parent, new Vector3(side * width, -0.17f, z), new Vector3(0.035f, length, 0.035f), new Color(0.12f, 0.08f, 0.03f), new Vector3(0f, 0f, side * 58f));
            }
        }
    }

    private void CreateAntennae(Transform parent, Vector3 basePosition, float length)
    {
        for (int side = -1; side <= 1; side += 2)
            Primitive("Antenna", PrimitiveType.Cylinder, parent, basePosition + new Vector3(side * 0.17f, 0.18f, 0.05f), new Vector3(0.025f, length, 0.025f), Color.black, new Vector3(side * 30f, 0f, side * 25f));
    }

    private void Update()
    {
        if (Input.GetMouseButtonDown(0) && observationCamera != null)
        {
            Ray ray = observationCamera.ScreenPointToRay(Input.mousePosition);
            RaycastHit hit;
            if (Physics.Raycast(ray, out hit))
            {
                InsectSelectable selectable = hit.collider.GetComponentInParent<InsectSelectable>();
                if (selectable != null)
                    SelectSpecimen(selectable);
            }
        }
    }

    private void LateUpdate()
    {
        if (observationCamera == null || selected == null)
            return;

        observationCamera.transform.position = Vector3.Lerp(observationCamera.transform.position, desiredCameraPosition, Time.deltaTime * 2.8f);
        Quaternion desiredRotation = Quaternion.LookRotation(cameraTarget - observationCamera.transform.position);
        observationCamera.transform.rotation = Quaternion.Slerp(observationCamera.transform.rotation, desiredRotation, Time.deltaTime * 3.4f);
    }

    private void SelectSpecimen(InsectSelectable selectable)
    {
        selected = selectable;
        cameraTarget = selectable.transform.position + new Vector3(0f, 0.25f, 0f);

        if (selectable == beetleSpecimen)
        {
            cameraTarget = beetleSpecimen.transform.position + new Vector3(0f, 0.7f, -0.45f);
            desiredCameraPosition = cameraTarget + new Vector3(0f, 3.2f, -12f);
        }
        else
            desiredCameraPosition = cameraTarget + new Vector3(0f, 3.15f, -10f);
    }

    private void OnGUI()
    {
        if (beetleSpecimen == null)
            return;

        if (titleStyle == null)
            PrepareGuiStyles();

        GUI.Box(new Rect(22f, 20f, 405f, 154f), string.Empty);
        GUI.Label(new Rect(42f, 36f, 360f, 34f), "인형의 집 온실 생태 관찰", titleStyle);
        GUI.Label(new Rect(42f, 75f, 370f, 28f), "식물 15종 · 새 14종 · 숲 곤충 21종", bodyStyle);
        GUI.Label(new Rect(42f, 105f, 350f, 42f), "쓰러진 나무와 물가에서 살아가는 생물들의 자연스러운 행동을 관찰해요.", bodyStyle);
        GUI.Label(new Rect(42f, 148f, 350f, 24f), "생물을 클릭하면 가까이 관찰할 수 있어요.", bodyStyle);
    }

    private void PrepareGuiStyles()
    {
        titleStyle = new GUIStyle(GUI.skin.label);
        titleStyle.fontSize = 24;
        titleStyle.fontStyle = FontStyle.Bold;
        titleStyle.normal.textColor = new Color(0.7f, 0.94f, 0.63f);

        bodyStyle = new GUIStyle(GUI.skin.label);
        bodyStyle.fontSize = 15;
        bodyStyle.wordWrap = true;
        bodyStyle.normal.textColor = new Color(0.82f, 0.91f, 0.78f);
    }


    private void CreateBeetleHabitat(Vector3 position)
    {
        if (rhinocerosBeetlePrefab == null || stagBeetlePrefab == null)
        {
            Debug.LogWarning("장수풍뎅이 또는 사슴벌레 프리팹을 불러오지 못했습니다.");
            return;
        }

        beetleSpecimen = CreateSpecimen(
            "참나무 위의 장수풍뎅이와 사슴벌레",
            "Trypoxylus dichotomus · Lucanidae",
            "쓰러진 참나무의 수액과 그늘을 찾아 움직이는 두 곤충을 관찰해요.",
            "사용자 제공 GLB 2종 · 밤 활동 · 참나무 숲",
            false,
            position,
            0f,
            1f);

        InsectHover hover = beetleSpecimen.GetComponent<InsectHover>();
        if (hover != null)
            hover.enabled = false;

        BoxCollider selectionCollider = beetleSpecimen.gameObject.AddComponent<BoxCollider>();
        selectionCollider.center = new Vector3(0f, 0.32f, 0f);
        selectionCollider.size = new Vector3(5.5f, 1.4f, 2.4f);

        Transform leftPivot = new GameObject("나무를 탐색하는 장수풍뎅이").transform;
        leftPivot.SetParent(beetleSpecimen.transform, false);
        leftPivot.localPosition = new Vector3(-1.35f, 0.18f, -0.12f);
        leftPivot.localRotation = Quaternion.Euler(0f, 68f, -2f);

        Transform rightPivot = new GameObject("이끼를 탐색하는 사슴벌레").transform;
        rightPivot.SetParent(beetleSpecimen.transform, false);
        rightPivot.localPosition = new Vector3(1.45f, 0.2f, 0.14f);
        rightPivot.localRotation = Quaternion.Euler(0f, 112f, 2f);

        GameObject leftModel = Instantiate(rhinocerosBeetlePrefab, leftPivot, false);
        leftModel.name = "장수풍뎅이";
        leftModel.transform.localPosition = Vector3.zero;
        leftModel.transform.localRotation = Quaternion.identity;
        leftModel.transform.localScale = Vector3.one * 1.55f;
        ArticulatedBeetleRig.Attach(leftModel, 0f);

        GameObject rightModel = Instantiate(stagBeetlePrefab, rightPivot, false);
        rightModel.name = "사슴벌레";
        rightModel.transform.localPosition = Vector3.zero;
        rightModel.transform.localRotation = Quaternion.Euler(-90f, 0f, 0f);
        rightModel.transform.localScale = Vector3.one * 1.55f;
        StagBeetleRig.Attach(rightModel, Mathf.PI);
    }

    private void CreateGreyHeron(Vector3 position)
    {
        if (greyHeronPrefab == null)
        {
            Debug.LogWarning("왜가리 리깅 모델을 불러오지 못했습니다.");
            return;
        }

        GameObject heron = Instantiate(greyHeronPrefab, greenhouseInterior, false);
        heron.name = "회색왜가리";
        heron.transform.localPosition = position;
        heron.transform.localRotation = Quaternion.identity;
        heron.transform.localScale = Vector3.one * 3.15f;

        GreyHeronBehaviour behaviour = heron.GetComponent<GreyHeronBehaviour>();
        if (behaviour == null)
            behaviour = heron.AddComponent<GreyHeronBehaviour>();
        behaviour.animationResourcePath = "Models/GreyHeronRigged";
    }

    private void CreateButterflyGroup()
    {
        Transform group = new GameObject("숲을 날아다니는 나비 6종").transform;
        group.SetParent(greenhouseInterior, false);

        CreateButterfly(
            group,
            "남방노랑나비",
            "Models/Butterflies/SouthernYellow",
            new Vector3(-3.3f, 1.7f, 0.8f),
            new Vector3(1.4f, 0.38f, 1.2f),
            0.2f,
            0.16f,
            0.82f);
        CreateButterfly(
            group,
            "네발나비",
            "Models/Butterflies/AsianComma",
            new Vector3(3.1f, 2.1f, -0.4f),
            new Vector3(1.3f, 0.45f, 1.5f),
            1.3f,
            0.14f,
            0.78f);
        CreateButterfly(
            group,
            "배추흰나비",
            "Models/Butterflies/CabbageWhite",
            new Vector3(-1.5f, 2.7f, -2f),
            new Vector3(1.5f, 0.5f, 1.2f),
            2.2f,
            0.15f,
            0.86f);
        CreateButterfly(
            group,
            "애기세줄나비",
            "Models/Butterflies/Sailer",
            new Vector3(1.7f, 1.5f, 1.2f),
            new Vector3(1.2f, 0.35f, 1f),
            3f,
            0.17f,
            0.8f);
        CreateButterfly(
            group,
            "푸른부전나비",
            "Models/Butterflies/BlueButterfly",
            new Vector3(-4f, 1.15f, -1.5f),
            new Vector3(0.9f, 0.25f, 0.9f),
            4.1f,
            0.18f,
            0.9f);
        CreateButterfly(
            group,
            "호랑나비",
            "Models/Butterflies/Swallowtail",
            new Vector3(3.5f, 2.8f, -2.4f),
            new Vector3(1.5f, 0.55f, 1.4f),
            5f,
            0.12f,
            0.72f);
    }

    private void CreateButterfly(
        Transform parent,
        string koreanName,
        string resourcePath,
        Vector3 flightCentre,
        Vector3 flightRadii,
        float phaseOffset,
        float pathSpeed,
        float flapSpeed)
    {
        GameObject prefab = Resources.Load<GameObject>(resourcePath);
        if (prefab == null)
        {
            Debug.LogWarning($"{koreanName} 리깅 모델을 불러오지 못했습니다.");
            return;
        }

        GameObject butterfly = Instantiate(prefab, parent, false);
        butterfly.SetActive(false);
        butterfly.name = koreanName;
        butterfly.transform.localScale = Vector3.one * 5f;

        ButterflyFlight flight = butterfly.GetComponent<ButterflyFlight>();
        if (flight == null)
            flight = butterfly.AddComponent<ButterflyFlight>();
        flight.animationResourcePath = resourcePath;
        flight.flightCentre = InteriorPoint(flightCentre);
        flight.flightRadii = flightRadii;
        flight.phaseOffset = phaseOffset;
        flight.pathSpeed = pathSpeed;
        flight.flapAnimationSpeed = flapSpeed;
        butterfly.SetActive(true);
    }

    private void CreateFlyingInsectGroup()
    {
        Transform group = new GameObject("숲을 날아다니는 잠자리와 벌").transform;
        group.SetParent(greenhouseInterior, false);

        CreateFlyingInsect(
            group,
            "날아다니는 밀잠자리",
            "Models/FlyingInsects/Dragonfly",
            FlyingInsectStyle.Dragonfly,
            new Vector3(-2.4f, 2.2f, -1f),
            new Vector3(2.2f, 0.55f, 1.8f),
            0.6f,
            0.32f,
            1.5f);
        CreateFlyingInsect(
            group,
            "날아다니는 양봉꿀벌",
            "Models/FlyingInsects/Honeybee",
            FlyingInsectStyle.Honeybee,
            new Vector3(0.7f, 1.55f, 1.8f),
            new Vector3(1.3f, 0.35f, 1.2f),
            2.7f,
            0.24f,
            1.8f);
        CreateFlyingInsect(
            group,
            "날아다니는 장수말벌",
            "Models/FlyingInsects/Hornet",
            FlyingInsectStyle.Hornet,
            new Vector3(3.2f, 2f, 0.2f),
            new Vector3(2f, 0.5f, 1.7f),
            4.4f,
            0.19f,
            1.15f);
    }

    private void CreateFlyingInsect(
        Transform parent,
        string koreanName,
        string resourcePath,
        FlyingInsectStyle style,
        Vector3 flightCentre,
        Vector3 flightRadii,
        float phaseOffset,
        float pathSpeed,
        float flapSpeed)
    {
        GameObject prefab = Resources.Load<GameObject>(resourcePath);
        if (prefab == null)
        {
            Debug.LogWarning($"{koreanName} 리깅 모델을 불러오지 못했습니다.");
            return;
        }

        GameObject insect = Instantiate(prefab, parent, false);
        insect.SetActive(false);
        insect.name = koreanName;
        insect.transform.localScale = Vector3.one * 5f;

        FlyingInsectFlight flight = insect.GetComponent<FlyingInsectFlight>();
        if (flight == null)
            flight = insect.AddComponent<FlyingInsectFlight>();
        flight.animationResourcePath = resourcePath;
        flight.flightStyle = style;
        flight.flightCentre = InteriorPoint(flightCentre);
        flight.flightRadii = flightRadii;
        flight.phaseOffset = phaseOffset;
        flight.pathSpeed = pathSpeed;
        flight.flapAnimationSpeed = flapSpeed;
        insect.SetActive(true);
    }

    private void CreateGroundInsectGroup()
    {
        Transform group = new GameObject("숲바닥을 돌아다니는 곤충 12종").transform;
        group.SetParent(greenhouseInterior, false);

        CreateGroundInsect(group, "가시노린재", "Models/GroundInsects/ShieldBug", GroundInsectStyle.TrueBug,
            new Vector3(-4.6f, 0f, 1.1f), new Vector2(0.72f, 0.58f), 0.09f, 0.2f, 0.18f);
        CreateGroundInsect(group, "꼬마무당벌레", "Models/GroundInsects/TinyLadybug", GroundInsectStyle.Tiny,
            new Vector3(-1.8f, 0f, 0.08f), new Vector2(0.42f, 0.12f), 1.1f, 1.15f, 0.11f, 35f);
        CreateGroundInsect(group, "동양하루살이", "Models/GroundInsects/OrientalMayfly", GroundInsectStyle.Delicate,
            new Vector3(-3.7f, 0f, -2.65f), new Vector2(0.58f, 0.42f), 2f, 0.07f, 0.09f);
        CreateGroundInsect(group, "무당벌레", "Models/GroundInsects/Ladybug", GroundInsectStyle.Ladybug,
            new Vector3(-0.75f, 0f, 0.08f), new Vector2(0.5f, 0.12f), 2.7f, 1.15f, 0.14f);
        CreateGroundInsect(group, "방아깨비", "Models/GroundInsects/LongGrasshopper", GroundInsectStyle.Grasshopper,
            new Vector3(4.15f, 0f, 2.2f), new Vector2(0.8f, 0.62f), 3.3f, 0.08f, 0.25f);
        CreateGroundInsect(group, "섬서구메뚜기", "Models/GroundInsects/ChineseGrasshopper", GroundInsectStyle.Grasshopper,
            new Vector3(-4.45f, 0f, 3f), new Vector2(0.72f, 0.55f), 4f, 0.08f, 0.23f);
        CreateGroundInsect(group, "앉아있는 아시아실잠자리", "Models/GroundInsects/Damselfly", GroundInsectStyle.Delicate,
            new Vector3(-2.25f, 0f, -4.45f), new Vector2(0.5f, 0.38f), 4.7f, 0.07f, 0.08f);
        CreateGroundInsect(group, "칠성무당벌레", "Models/GroundInsects/SevenSpotLadybug", GroundInsectStyle.Ladybug,
            new Vector3(2.15f, 0f, 0.08f), new Vector2(0.46f, 0.12f), 5.2f, 1.15f, 0.13f);
        CreateGroundInsect(group, "톱다리개미허리노린재", "Models/GroundInsects/LeafFootBug", GroundInsectStyle.TrueBug,
            new Vector3(4.3f, 0f, -2.65f), new Vector2(0.68f, 0.52f), 5.9f, 0.08f, 0.17f);
        CreateGroundInsect(group, "팥중이", "Models/GroundInsects/RiceGrasshopper", GroundInsectStyle.Grasshopper,
            new Vector3(2.65f, 0f, 3.35f), new Vector2(0.74f, 0.56f), 0.9f, 0.08f, 0.24f);
        CreateGroundInsect(group, "호리꽃등에", "Models/GroundInsects/Hoverfly", GroundInsectStyle.Hoverfly,
            new Vector3(0.75f, 0f, 0.08f), new Vector2(0.44f, 0.12f), 1.6f, 1.15f, 0.15f);
        CreateGroundInsect(group, "흰부채하루살이", "Models/GroundInsects/WhiteMayfly", GroundInsectStyle.Delicate,
            new Vector3(-1.2f, 0f, -3.75f), new Vector2(0.52f, 0.4f), 2.3f, 0.07f, 0.085f);
    }

    private void CreateGroundInsect(
        Transform parent,
        string koreanName,
        string resourcePath,
        GroundInsectStyle style,
        Vector3 movementCentre,
        Vector2 movementRadii,
        float phaseOffset,
        float groundHeight,
        float movementSpeed,
        float modelYawOffset = 0f)
    {
        GameObject prefab = Resources.Load<GameObject>(resourcePath);
        if (prefab == null)
        {
            Debug.LogWarning($"{koreanName} 리깅 모델을 불러오지 못했습니다.");
            return;
        }

        GameObject insect = Instantiate(prefab, parent, false);
        insect.SetActive(false);
        insect.name = koreanName;
        insect.transform.localScale = Vector3.one * 5f;

        GroundInsectMovement movement = insect.GetComponent<GroundInsectMovement>();
        if (movement == null)
            movement = insect.AddComponent<GroundInsectMovement>();
        movement.animationResourcePath = resourcePath;
        movement.movementStyle = style;
        movement.movementCentre = InteriorPoint(movementCentre);
        movement.movementRadii = movementRadii;
        movement.phaseOffset = phaseOffset;
        movement.groundHeight = groundHeight;
        movement.movementSpeed = movementSpeed;
        movement.modelYawOffset = modelYawOffset;
        insect.SetActive(true);
    }

    private void CreateBirdGroup()
    {
        Transform group = new GameObject("숲과 물가를 오가는 새 13종").transform;
        group.SetParent(greenhouseInterior, false);

        CreateBird(group, "괭이갈매기", "Models/Birds/BlackTailedGull",
            BirdFlightStyle.Gull, true,
            new Vector3(0f, 8.2f, -2.2f), new Vector3(5.8f, 1.7f, 4.8f),
            0.2f, 0.26f,
            new Vector3(-4.9f, 1.15f, -0.5f),
            new Vector3(4.7f, 0.95f, -1.15f),
            new Vector3(-4.8f, 0.35f, -3.0f));
        CreateBird(group, "노랑턱멧새", "Models/Birds/YellowThroatedBunting",
            BirdFlightStyle.Passerine, false,
            new Vector3(-4.7f, 4.5f, -1.6f), new Vector3(2.8f, 0.75f, 2.4f),
            0.75f, 0.58f,
            new Vector3(-6.8f, 4.25f, 1.8f),
            new Vector3(-5.3f, 3.7f, -2.1f),
            new Vector3(-2.8f, 4.0f, -3.6f));
        CreateBird(group, "대백로", "Models/Birds/GreatEgret",
            BirdFlightStyle.Egret, false,
            new Vector3(-3.1f, 3.7f, -3.8f), new Vector3(4.0f, 1.1f, 3.0f),
            1.3f, 0.21f,
            new Vector3(-4.55f, 0.05f, -3.4f),
            new Vector3(-1.4f, 0.05f, -4.05f),
            new Vector3(3.9f, 0.06f, -2.5f));
        CreateBird(group, "딱새", "Models/Birds/DaurianRedstart",
            BirdFlightStyle.Passerine, true,
            new Vector3(4.5f, 7.3f, -1.5f), new Vector3(2.7f, 1.15f, 2.5f),
            1.9f, 0.62f,
            new Vector3(6.3f, 4.4f, 1.2f),
            new Vector3(5.4f, 3.6f, -2.5f),
            new Vector3(2.7f, 4.0f, -3.8f));
        CreateBird(group, "멧비둘기", "Models/Birds/OrientalTurtleDove",
            BirdFlightStyle.Pigeon, true,
            new Vector3(0.6f, 8.0f, -4.4f), new Vector3(4.3f, 1.45f, 3.8f),
            2.5f, 0.39f,
            new Vector3(-1.8f, 4.35f, -8.0f),
            new Vector3(2.2f, 4.55f, -8.2f),
            new Vector3(0.8f, 3.9f, -4.7f));
        CreateBird(group, "박새", "Models/Birds/GreatTit",
            BirdFlightStyle.Passerine, false,
            new Vector3(-2.3f, 4.4f, -5.1f), new Vector3(2.4f, 0.7f, 2.2f),
            3.1f, 0.65f,
            new Vector3(-3.0f, 4.15f, -7.8f),
            new Vector3(-1.2f, 3.9f, -4.2f),
            new Vector3(-4.6f, 3.7f, -5.2f));
        CreateBird(group, "붉은머리오목눈이", "Models/Birds/VinousThroatedParrotbill",
            BirdFlightStyle.Passerine, false,
            new Vector3(-4.3f, 2.2f, 1.5f), new Vector3(2.0f, 0.6f, 1.8f),
            3.8f, 0.67f,
            new Vector3(-5.1f, 1.25f, 3.3f),
            new Vector3(-4.4f, 1.15f, -2.0f),
            new Vector3(-2.4f, 1.1f, 1.3f));
        CreateBird(group, "쇠박새", "Models/Birds/MarshTit",
            BirdFlightStyle.Passerine, false,
            new Vector3(3.6f, 4.4f, -5.0f), new Vector3(2.6f, 0.7f, 2.4f),
            4.4f, 0.66f,
            new Vector3(3.0f, 4.25f, -8.0f),
            new Vector3(5.8f, 3.95f, -5.7f),
            new Vector3(2.8f, 3.8f, -3.8f));
        CreateBird(group, "알락할미새", "Models/Birds/WhiteWagtail",
            BirdFlightStyle.Wagtail, true,
            new Vector3(2.9f, 6.8f, 1.4f), new Vector3(2.8f, 1.0f, 2.4f),
            5.0f, 0.5f,
            new Vector3(2.8f, 0.65f, 3.6f),
            new Vector3(4.8f, 0.72f, -1.2f),
            new Vector3(0.8f, 1.1f, 0.15f));
        CreateBird(group, "직박구리", "Models/Birds/BrownEaredBulbul",
            BirdFlightStyle.Bulbul, true,
            new Vector3(4.7f, 7.6f, 0.8f), new Vector3(3.1f, 1.2f, 2.7f),
            5.7f, 0.46f,
            new Vector3(6.4f, 4.4f, 1.1f),
            new Vector3(5.4f, 3.8f, 3.0f),
            new Vector3(3.8f, 4.0f, -1.0f));
        CreateBird(group, "청둥오리", "Models/Birds/Mallard",
            BirdFlightStyle.Duck, false,
            new Vector3(-3.1f, 2.5f, -3.5f), new Vector3(3.3f, 0.75f, 2.8f),
            0.95f, 0.33f,
            new Vector3(-3.9f, 0.12f, -3.6f),
            new Vector3(-2.4f, 0.12f, -3.3f),
            new Vector3(-5.0f, 0.18f, -3.0f));
        CreateBird(group, "큰부리까마귀", "Models/Birds/LargeBilledCrow",
            BirdFlightStyle.Crow, true,
            new Vector3(0f, 5.4f, -2.5f), new Vector3(6.8f, 1.7f, 5.2f),
            1.55f, 0.29f,
            new Vector3(0f, 5.4f, -2.5f));
        CreateBird(group, "흰뺨검둥오리", "Models/Birds/SpotBilledDuck",
            BirdFlightStyle.Duck, false,
            new Vector3(-2.7f, 2.35f, -3.8f), new Vector3(3.5f, 0.7f, 2.7f),
            2.15f, 0.31f,
            new Vector3(-2.7f, 0.12f, -4.0f),
            new Vector3(-4.4f, 0.12f, -3.25f),
            new Vector3(-1.4f, 0.16f, -3.7f));
    }

    private void CreateBird(
        Transform parent,
        string koreanName,
        string resourcePath,
        BirdFlightStyle style,
        bool continuouslyFlying,
        Vector3 flightCentre,
        Vector3 flightRadii,
        float phaseOffset,
        float pathSpeed,
        params Vector3[] perchPoints)
    {
        GameObject prefab = Resources.Load<GameObject>(resourcePath);
        if (prefab == null)
        {
            Debug.LogWarning($"{koreanName} 리깅 모델을 불러오지 못했습니다.");
            return;
        }

        GameObject bird = Instantiate(prefab, parent, false);
        bird.SetActive(false);
        bird.name = koreanName;
        bird.transform.localScale = Vector3.one * 3.15f;

        BirdFlightBehaviour behaviour = bird.GetComponent<BirdFlightBehaviour>();
        if (behaviour == null)
            behaviour = bird.AddComponent<BirdFlightBehaviour>();
        behaviour.animationResourcePath = resourcePath;
        behaviour.flightStyle = style;
        behaviour.flightEnabled = continuouslyFlying;
        behaviour.continuouslyFlying =
            behaviour.flightEnabled && continuouslyFlying;
        behaviour.modelYawOffset =
            style == BirdFlightStyle.Crow ? 90f : -90f;
        behaviour.flightCentre = InteriorPoint(flightCentre);
        behaviour.flightRadii = flightRadii;
        behaviour.minimumFlightAltitude = Mathf.Max(
            0.35f,
            behaviour.flightCentre.y - flightRadii.y);
        behaviour.phaseOffset = phaseOffset;
        behaviour.pathSpeed = pathSpeed;
        behaviour.perchPoints = new Vector3[perchPoints.Length];
        for (int index = 0; index < perchPoints.Length; index++)
            behaviour.perchPoints[index] = InteriorPoint(perchPoints[index]);
        switch (style)
        {
            case BirdFlightStyle.Passerine:
                behaviour.perchWaitMin = 18f;
                behaviour.perchWaitMax = 36f;
                behaviour.flightTimeMin = 5f;
                behaviour.flightTimeMax = 9f;
                break;
            case BirdFlightStyle.Wagtail:
            case BirdFlightStyle.Bulbul:
                behaviour.perchWaitMin = 20f;
                behaviour.perchWaitMax = 38f;
                behaviour.flightTimeMin = 6f;
                behaviour.flightTimeMax = 10f;
                break;
            case BirdFlightStyle.Pigeon:
                behaviour.perchWaitMin = 22f;
                behaviour.perchWaitMax = 40f;
                behaviour.flightTimeMin = 8f;
                behaviour.flightTimeMax = 13f;
                break;
            case BirdFlightStyle.Gull:
                behaviour.perchWaitMin = 24f;
                behaviour.perchWaitMax = 42f;
                behaviour.flightTimeMin = 9f;
                behaviour.flightTimeMax = 15f;
                break;
            case BirdFlightStyle.Egret:
                behaviour.perchWaitMin = 30f;
                behaviour.perchWaitMax = 50f;
                behaviour.flightTimeMin = 10f;
                behaviour.flightTimeMax = 15f;
                break;
            case BirdFlightStyle.Duck:
                behaviour.perchWaitMin = 28f;
                behaviour.perchWaitMax = 48f;
                behaviour.flightTimeMin = 8f;
                behaviour.flightTimeMax = 14f;
                break;
        }
        bird.SetActive(true);
    }

}

public sealed class InsectSelectable : MonoBehaviour
{
    public string koreanName;
    public string scientificName;
    public string note;
    public string profile;
    public bool caution;
}

public sealed class InsectHover : MonoBehaviour
{
    public float amount;
    public float speed;
    private Vector3 startPosition;
    private float phase;private void Start()
    {
        startPosition = transform.position;
        phase = Random.value * 6.28f;
    }

    private void Update()
    {
        transform.position = startPosition + new Vector3(0f, Mathf.Sin((Time.time * speed) + phase) * amount, 0f);
        transform.Rotate(0f, Mathf.Sin((Time.time * speed * 0.55f) + phase) * Time.deltaTime * 14f, 0f, Space.World);
    }
}
