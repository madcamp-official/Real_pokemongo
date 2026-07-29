using System.Collections.Generic;
using UnityEngine;

public sealed class InsectObservationScene : MonoBehaviour
{
    
    public GameObject rhinocerosBeetlePrefab;
    public GameObject stagBeetlePrefab;
    private BeetleBattleAnimation beetleBattle;
    private InsectSelectable beetleSpecimen;
private readonly List<InsectSelectable> specimens = new List<InsectSelectable>();
    private Camera observationCamera;
    private InsectSelectable selected;
    private Vector3 cameraTarget;
    private Vector3 desiredCameraPosition;
    private GUIStyle titleStyle;
    private GUIStyle bodyStyle;
    private GUIStyle buttonStyle;

private void Start()
    {
        if (stagBeetlePrefab == null)
            stagBeetlePrefab = Resources.Load<GameObject>("Models/StagBeetle");

        GameObject templatePlane = GameObject.Find("Plane");
        if (templatePlane != null)
            Destroy(templatePlane);

        GameObject templateGround = GameObject.Find("Ground");
        if (templateGround != null)
            Destroy(templateGround);

        SetupCameraAndLight();
        CreateRhinocerosBattle(new Vector3(0f, 0.4f, 0f));

        selected = beetleSpecimen;
        cameraTarget = beetleSpecimen.transform.position + new Vector3(0f, 0.25f, 0f);
        desiredCameraPosition = cameraTarget + new Vector3(0f, 2.35f, 4.5f);
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

        observationCamera.transform.position = new Vector3(0f, 5.4f, -10.5f);
        observationCamera.transform.LookAt(new Vector3(0f, 1.1f, 0f));
        observationCamera.clearFlags = CameraClearFlags.SolidColor;
        observationCamera.backgroundColor = new Color(0.72f, 0.91f, 0.98f);
        observationCamera.fieldOfView = 47f;

        Light sun = FindAnyObjectByType<Light>();
        if (sun == null)
        {
            sun = new GameObject("Sun").AddComponent<Light>();
            sun.type = LightType.Directional;
        }
        sun.transform.rotation = Quaternion.Euler(45f, -32f, 0f);
        sun.color = new Color(1f, 0.96f, 0.82f);
        sun.intensity = 1.25f;

        CreatePointLight("Warm Fill", new Vector3(-4f, 4f, -2f), new Color(1f, 0.72f, 0.48f), 3.3f, 7f);
        CreatePointLight("Cool Fill", new Vector3(4f, 3.5f, 1f), new Color(0.42f, 0.78f, 1f), 2.2f, 6f);
    }

    private void BuildHabitat()
    {
        GameObject ground = Primitive("Meadow", PrimitiveType.Plane, Vector3.zero, Vector3.one * 1.3f, new Color(0.19f, 0.48f, 0.25f));
        ground.transform.localScale = new Vector3(1.25f, 1f, 1.25f);

        CreateLeaf(new Vector3(-3.35f, 0.34f, 0.2f), new Vector3(3.0f, 0.16f, 2.0f), new Color(0.16f, 0.58f, 0.24f), -18f);
        CreateFlower(new Vector3(0f, 0.08f, 0.45f), new Color(1f, 0.64f, 0.13f), new Color(1f, 0.9f, 0.26f));
        CreateFlower(new Vector3(3.35f, 0.08f, 0.15f), new Color(0.9f, 0.25f, 0.56f), new Color(1f, 0.83f, 0.16f));
        CreateReed(new Vector3(0.7f, 0.05f, -3f));
        CreateReed(new Vector3(1.25f, 0.05f, -3.45f));
        CreateRock(new Vector3(-1.8f, 0.18f, -2.5f));
        CreateRock(new Vector3(4.6f, 0.14f, -2.0f));
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
        root.transform.position = position;
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

    private void CreatePointLight(string objectName, Vector3 position, Color color, float intensity, float range)
    {
        Light light = new GameObject(objectName).AddComponent<Light>();
        light.type = LightType.Point;
        light.transform.position = position;
        light.color = color;
        light.intensity = intensity;
        light.range = range;
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
            desiredCameraPosition = cameraTarget + new Vector3(0f, 2.35f, 4.5f);
        else
            desiredCameraPosition = cameraTarget + new Vector3(0f, 3.15f, -6.2f);
    }

private void OnGUI()
    {
        if (beetleSpecimen == null || beetleBattle == null)
            return;

        if (titleStyle == null)
            PrepareGuiStyles();

        GUI.Box(new Rect(22f, 20f, 405f, 164f), string.Empty);
        GUI.Label(new Rect(42f, 36f, 360f, 34f), "장수풍뎅이 vs 사슴벌레", titleStyle);
        GUI.Label(new Rect(42f, 75f, 340f, 28f), "장수풍뎅이  ·  사슴벌레", bodyStyle);
        GUI.Label(new Rect(42f, 105f, 350f, 42f), "큰 뿔과 큰턱을 사용하는 두 곤충의 공격을 관찰해요.", bodyStyle);
        GUI.Label(new Rect(42f, 151f, 350f, 24f), "사용자 제공 GLB · 밤 활동 · 참나무 숲", bodyStyle);

        GUI.Box(new Rect(22f, 195f, 405f, 82f), "결투 조작");
        string toggleLabel = beetleBattle.IsRunning ? "전투 일시정지" : "전투 계속";
        if (GUI.Button(new Rect(42f, 226f, 160f, 34f), toggleLabel, buttonStyle))
            beetleBattle.ToggleBattle();
        if (GUI.Button(new Rect(220f, 226f, 160f, 34f), "처음부터 다시", buttonStyle))
            beetleBattle.RestartBattle();
    }

    private void PrepareGuiStyles()
    {
        titleStyle = new GUIStyle(GUI.skin.label);
        titleStyle.fontSize = 24;
        titleStyle.fontStyle = FontStyle.Bold;
        titleStyle.normal.textColor = new Color(0.08f, 0.25f, 0.15f);

        bodyStyle = new GUIStyle(GUI.skin.label);
        bodyStyle.fontSize = 15;
        bodyStyle.wordWrap = true;
        bodyStyle.normal.textColor = new Color(0.08f, 0.13f, 0.11f);

        buttonStyle = new GUIStyle(GUI.skin.button);
        buttonStyle.fontSize = 14;
        buttonStyle.fontStyle = FontStyle.Bold;
    }


private void CreateRhinocerosBattle(Vector3 position)
    {
        if (rhinocerosBeetlePrefab == null || stagBeetlePrefab == null)
        {
            Debug.LogWarning("장수풍뎅이 또는 사슴벌레 프리팹을 불러오지 못했습니다.");
            return;
        }

        beetleSpecimen = CreateSpecimen(
            "장수풍뎅이와 사슴벌레",
            "Trypoxylus dichotomus · Lucanidae",
            "장수풍뎅이의 큰 뿔과 사슴벌레의 큰턱 공격을 함께 관찰해요.",
            "사용자 제공 GLB 2종 · 밤 활동 · 참나무 숲",
            false,
            position,
            0f,
            1f);

        InsectHover hover = beetleSpecimen.GetComponent<InsectHover>();
        if (hover != null)
            hover.enabled = false;

        BoxCollider selectionCollider = beetleSpecimen.gameObject.AddComponent<BoxCollider>();
        selectionCollider.center = new Vector3(0f, 0.45f, 0f);
        selectionCollider.size = new Vector3(5.3f, 1.5f, 2.5f);
        Primitive("Duel arena floor", PrimitiveType.Cube, beetleSpecimen.transform, new Vector3(0f, -0.31f, 0f), new Vector3(8.4f, 0.12f, 5.8f), new Color(0.18f, 0.22f, 0.24f));
        Primitive("Duel log", PrimitiveType.Cube, beetleSpecimen.transform, new Vector3(0f, -0.13f, 0f), new Vector3(5.1f, 0.22f, 2.2f), new Color(0.31f, 0.16f, 0.07f));
        Primitive("Blue corner", PrimitiveType.Cylinder, beetleSpecimen.transform, new Vector3(-1.62f, 0f, 0f), new Vector3(0.72f, 0.035f, 0.72f), new Color(0.08f, 0.42f, 0.92f));
        Primitive("Red corner", PrimitiveType.Cylinder, beetleSpecimen.transform, new Vector3(1.62f, 0f, 0f), new Vector3(0.72f, 0.035f, 0.72f), new Color(0.9f, 0.16f, 0.08f));

        Transform leftPivot = new GameObject("Blue Beetle Fighter").transform;
        leftPivot.SetParent(beetleSpecimen.transform, false);
        leftPivot.localPosition = new Vector3(-1.6f, 0.12f, 0f);
        leftPivot.localRotation = Quaternion.Euler(0f, 90f, 0f);

        Transform rightPivot = new GameObject("Red Beetle Fighter").transform;
        rightPivot.SetParent(beetleSpecimen.transform, false);
        rightPivot.localPosition = new Vector3(1.6f, 0.12f, 0f);
        rightPivot.localRotation = Quaternion.Euler(0f, 90f, 0f);

        GameObject leftModel = Instantiate(rhinocerosBeetlePrefab, leftPivot, false);
        leftModel.name = "장수풍뎅이 선수";
        leftModel.transform.localPosition = Vector3.zero;
        leftModel.transform.localRotation = Quaternion.identity;
        leftModel.transform.localScale = Vector3.one * 1.55f;
        ArticulatedBeetleRig.Attach(leftModel, 0f);

        GameObject rightModel = Instantiate(stagBeetlePrefab, rightPivot, false);
        rightModel.name = "사슴벌레 선수";
        rightModel.transform.localPosition = Vector3.zero;
        rightModel.transform.localRotation = Quaternion.Euler(-90f, 0f, 0f);
        rightModel.transform.localScale = Vector3.one * 1.55f;
        StagBeetleRig stagRig = StagBeetleRig.Attach(rightModel, Mathf.PI);

        beetleBattle = beetleSpecimen.gameObject.AddComponent<BeetleBattleAnimation>();
        beetleBattle.leftBeetle = leftPivot;
        beetleBattle.rightBeetle = rightPivot;
        beetleBattle.stagBeetleRig = stagRig;
        beetleBattle.RestartBattle();
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
