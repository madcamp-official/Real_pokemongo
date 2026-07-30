using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

public sealed class PCGardenController : MonoBehaviour
{
    // 원본 온실 GLB의 실제 실내 바닥은 정규화 좌표 y=0.0556이고,
    // 환경 배율 70을 적용하면 약 3.89m다. 모든 배치는 이 면 위에서 시작한다.
    private const float HabitatFloorY = 3.90f;
    private const float HabitatStartZ = 16.5f;
    private const float HabitatRowSpacing = 2.6f;
    private const int SlotRows = 9;
    private const int SlotColumns = 6;
    private const int SlotCapacity = SlotRows * SlotColumns;
    private static readonly float[] HabitatColumns =
        { -18f, -12.5f, -7f, 7f, 12.5f, 18f };
    // 7~9번째 행의 식물 전용 슬롯 18칸. 좌우 돔과 중앙 돔의
    // 실제 바닥 메시 안쪽에 배치하며 동물 자유 배치에는 사용하지 않는다.
    private static readonly float[] ExpansionSlotColumns =
    {
        -35f, -30f, -7f, 7f, 30f, 35f,
        -36f, -31f, -12f, 12f, 31f, 36f,
        -28f, -24f, -16f, 16f, 24f, 28f,
    };
    private static readonly float[] ExpansionSlotDepths =
    {
        8f, 12f, 9f, 9f, 12f, 8f,
        5f, 9f, 6f, 6f, 9f, 5f,
        6f, 12f, 14f, 14f, 12f, 6f,
    };

    private struct FloorTriangle
    {
        public Vector2 a;
        public Vector2 b;
        public Vector2 c;
        public Rect bounds;
    }

    public GameObject greenhousePrefab;
    public GameObject largeBilledCrowPrefab;
    public GameObject rhinocerosBeetlePrefab;
    public PCGardenOrbitCamera orbitCamera;
    public string mockBootstrapFileName = "pc-garden-mock-bootstrap.json";

    private readonly Dictionary<string, GardenCreatureData> creaturesById =
        new Dictionary<string, GardenCreatureData>();
    private readonly Dictionary<string, GardenAssetData> assetsByKey =
        new Dictionary<string, GardenAssetData>();
    private readonly List<PCGardenCreatureView> spawnedCreatures =
        new List<PCGardenCreatureView>();
    private readonly List<PCGardenPlacementSlotView> placementSlots =
        new List<PCGardenPlacementSlotView>();
    private readonly HashSet<string> newCreatureIds =
        new HashSet<string>();
    private readonly Dictionary<string, Texture2D> speciesCardTextures =
        new Dictionary<string, Texture2D>();
    private readonly List<FloorTriangle> greenhouseFloorTriangles =
        new List<FloorTriangle>();
    private Transform environmentRoot;
    private Transform creatureRoot;
    private Transform slotRoot;
    private Transform dragGhostRoot;
    private GardenBootstrapData bootstrap;
    private PCGardenApiClient apiClient;
    private float smoothedFps;
    private string status = "초기화 중";
    private Vector2 inventoryScroll;
    private string inventoryCategoryFilter = "all";
    private bool inventoryExpanded = true;
    private bool showCreatureLabels = true;
    private bool showLogin;
    private bool loginInProgress;
    private string loginServerUrl = "http://127.0.0.1:8080";
    private string loginEmail = string.Empty;
    private string loginPassword = string.Empty;
    private string loginMessage = "모바일 앱에서 사용하는 계정으로 로그인하세요.";
    private GardenCreatureData draggedCreature;
    private GardenAssetData draggedAsset;
    private GameObject dragGhost;
    private Material dragGhostMaterial;
    private PCGardenPlacementSlotView hoveredPlacementSlot;
    private bool dragDropValid;
    private bool dragUsesPlantSlot;
    private Vector3 dragWorldPoint;
    private float animatedPlacementCount;
    private float targetPlacementCount;
    private float counterVelocity;
    private float successFeedbackStartedAt = -10f;
    private string successFeedbackName = string.Empty;
    private float newDockAnimationStartedAt = -10f;
    private string newDockAnimationName = string.Empty;
    private string creatureSearchQuery = string.Empty;
    private string lastCreatureSearchQuery = string.Empty;
    private int creatureSearchIndex = -1;

    public int SpawnedCreatureCount => spawnedCreatures.Count;
    public string Status => status;
    public bool IsInventoryDragging => draggedCreature != null;
    public bool IsInventoryExpanded => inventoryExpanded;
    public float InventoryUiHeight => inventoryExpanded ? 356f : 78f;

    private IEnumerator Start()
    {
        ConfigureVisualQuality();
        Application.targetFrameRate = 60;
        BuildEnvironment();
        apiClient = gameObject.AddComponent<PCGardenApiClient>();
        apiClient.ConfigureFromEnvironment();
        if (!string.IsNullOrWhiteSpace(apiClient.ApiBaseUrl))
            loginServerUrl = apiClient.ApiBaseUrl;

        if (apiClient.IsConfigured)
        {
            status = "서버에서 수집 생물을 불러오는 중입니다.";
            string serverJson = null;
            string serverError = null;
            yield return apiClient.LoadBootstrap(
                json => serverJson = json,
                error => serverError = error);
            if (!string.IsNullOrWhiteSpace(serverJson))
            {
                InitializeGarden(serverJson);
                yield break;
            }
            Debug.LogWarning("PC 홈가든 서버 연결 실패, 로컬 데이터 사용: " + serverError);
        }

        InitializeGarden(LoadLocalOrMockBootstrapJson());
        status += " · 로컬 미리보기";
    }

    private void Update()
    {
        float currentFps = 1f / Mathf.Max(Time.unscaledDeltaTime, 0.0001f);
        smoothedFps = Mathf.Lerp(smoothedFps <= 0f ? currentFps : smoothedFps, currentFps, 0.05f);
        animatedPlacementCount = Mathf.SmoothDamp(
            animatedPlacementCount,
            targetPlacementCount,
            ref counterVelocity,
            0.28f,
            30f,
            Time.unscaledDeltaTime);

        if (IsInventoryDragging)
            UpdateInventoryDrag();

        if (Input.GetKeyDown(KeyCode.F11))
            Screen.fullScreen = !Screen.fullScreen;
    }

    public void InitializeGarden(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            status = "초기 데이터가 비어 있습니다.";
            return;
        }

        GardenBootstrapData parsed;
        try
        {
            parsed = JsonUtility.FromJson<GardenBootstrapData>(json);
        }
        catch (System.Exception exception)
        {
            Debug.LogError("PC 홈가든 bootstrap JSON 파싱 실패: " + exception.Message);
            status = "정원 데이터를 읽지 못했습니다.";
            return;
        }

        if (parsed == null || (parsed.schemaVersion != 1 && parsed.schemaVersion != 2))
        {
            status = "지원하지 않는 정원 데이터 버전입니다.";
            return;
        }

        EnsurePlacementTiles(parsed);
        NormalizePlacementModes(parsed);
        DetectNewCreatures(parsed);
        bootstrap = parsed;
        RebuildCreatures();
        targetPlacementCount = bootstrap.placements?.Length ?? 0;
        if (animatedPlacementCount <= 0f)
            animatedPlacementCount = targetPlacementCount;
        status = spawnedCreatures.Count + "마리 배치 · "
            + bootstrap.creatures.Length + "마리 보유";
        Debug.Log("[PC Garden] " + status);
    }

    public Vector3 SlotPosition(int row, int col)
    {
        int safeRow = Mathf.Clamp(row, 0, SlotRows - 1);
        int safeCol = Mathf.Clamp(col, 0, SlotColumns - 1);
        bool expansionRow = safeRow >= 6;
        int expansionIndex = (safeRow - 6) * SlotColumns + safeCol;
        float x = expansionRow
            ? ExpansionSlotColumns[expansionIndex]
            : HabitatColumns[safeCol];
        float z = expansionRow
            ? ExpansionSlotDepths[expansionIndex]
            : HabitatStartZ + safeRow * HabitatRowSpacing;
        // 중앙 돔 뒤쪽은 원형 바닥이 좁아지므로 바깥 열을 안쪽으로 당긴다.
        if (!expansionRow && (safeCol == 0 || safeCol == SlotColumns - 1))
        {
            if (safeRow == 4)
                x = Mathf.Sign(x) * 16f;
            else if (safeRow == 5)
            {
                x = Mathf.Sign(x) * 16f;
                z = 28f;
            }
        }
        return new Vector3(x, HabitatFloorY, z);
    }

    private void BuildEnvironment()
    {
        environmentRoot = new GameObject("PC 홈가든 고정 환경").transform;
        creatureRoot = new GameObject("사용자 배치 생태 친구").transform;
        slotRoot = new GameObject("PC 홈가든 배치 슬롯").transform;
        dragGhostRoot = new GameObject("PC 홈가든 드래그 고스트").transform;

        if (greenhousePrefab != null)
        {
            GameObject greenhouse = Instantiate(greenhousePrefab, environmentRoot);
            greenhouse.name = "후면 절반을 제거한 PC 홈가든 온실";
            greenhouse.transform.SetPositionAndRotation(Vector3.zero, Quaternion.identity);
            greenhouse.transform.localScale = Vector3.one * 70f;
            TuneGreenhouseMaterials(greenhouse);
            BuildGreenhouseFloorFootprint(greenhouse);
            BuildSingleGrassPlane(greenhouse);
            MarkStatic(greenhouse);
        }
        else
        {
            Debug.LogWarning("PC 홈가든 온실 프리팹이 지정되지 않았습니다.");
        }

        ConfigureDayEnvironment();
        BuildInteriorLighting();
        BuildPlacementSlots();
    }

    private void ConfigureDayEnvironment()
    {
        Camera camera = orbitCamera != null
            ? orbitCamera.targetCamera
            : Camera.main;
        ConfigureCharcoalGradientBackground(camera);

        RenderSettings.fog = false;
        RenderSettings.ambientMode =
            UnityEngine.Rendering.AmbientMode.Trilight;
        RenderSettings.ambientSkyColor =
            new Color(0.7f, 0.68f, 0.64f);
        RenderSettings.ambientEquatorColor =
            new Color(0.5f, 0.49f, 0.46f);
        RenderSettings.ambientGroundColor =
            new Color(0.3f, 0.29f, 0.27f);
        RenderSettings.ambientIntensity = 1.1f;
        RenderSettings.defaultReflectionMode =
            UnityEngine.Rendering.DefaultReflectionMode.Custom;
        RenderSettings.customReflection = null;
        RenderSettings.reflectionIntensity = 0.5f;

        Light directionalLight = null;
        foreach (Light candidate in
            FindObjectsByType<Light>(FindObjectsSortMode.None))
        {
            if (candidate.type != LightType.Directional)
                continue;
            if (directionalLight == null)
                directionalLight = candidate;
            else
                candidate.enabled = false;
        }
        if (directionalLight == null)
        {
            GameObject lightObject =
                new GameObject("Directional Light · 좌측 상단 45도");
            directionalLight = lightObject.AddComponent<Light>();
            directionalLight.type = LightType.Directional;
        }
        directionalLight.name = "Directional Light · 좌측 상단 45도";
        directionalLight.color = new Color32(0xFF, 0xF6, 0xE8, 0xFF);
        directionalLight.intensity = 1.2f;
        directionalLight.shadows = LightShadows.Soft;
        directionalLight.shadowStrength = 0.5f;
        directionalLight.transform.rotation =
            Quaternion.LookRotation(
                new Vector3(0.5f, -0.7071068f, -0.5f).normalized,
                Vector3.up);
        RenderSettings.sun = directionalLight;
        DynamicGI.UpdateEnvironment();
    }

    private void ConfigureCharcoalGradientBackground(Camera mainCamera)
    {
        RenderSettings.skybox = null;
        if (mainCamera == null)
            return;

        mainCamera.clearFlags = CameraClearFlags.Depth;
        mainCamera.backgroundColor =
            new Color32(0x1A, 0x1E, 0x24, 0xFF);
        mainCamera.farClipPlane = 500f;

        GameObject backgroundObject =
            new GameObject("차콜 세로 그라데이션 배경 카메라");
        backgroundObject.transform.SetParent(environmentRoot, false);
        Camera backgroundCamera = backgroundObject.AddComponent<Camera>();
        backgroundCamera.clearFlags = CameraClearFlags.SolidColor;
        backgroundCamera.backgroundColor =
            new Color32(0x1A, 0x1E, 0x24, 0xFF);
        backgroundCamera.cullingMask = 0;
        backgroundCamera.depth = mainCamera.depth - 10f;
        backgroundCamera.rect = mainCamera.rect;
        backgroundCamera.targetDisplay = mainCamera.targetDisplay;
        backgroundCamera.allowHDR = false;
        backgroundCamera.allowMSAA = false;
        backgroundCamera.useOcclusionCulling = false;
        backgroundObject.AddComponent<PCGardenGradientBackground>();
    }

    private void BuildInteriorLighting()
    {
        CreateInteriorSpotLight(
            "중앙 돔 내부 조명",
            new Vector3(0f, 48f, 17f),
            new Vector3(0f, HabitatFloorY, 17f),
            2.4f,
            82f,
            112f);
        CreateInteriorSpotLight(
            "왼쪽 돔 내부 조명",
            new Vector3(-29f, 27f, 10f),
            new Vector3(-29f, HabitatFloorY, 10f),
            1.65f,
            48f,
            105f);
        CreateInteriorSpotLight(
            "오른쪽 돔 내부 조명",
            new Vector3(29f, 27f, 10f),
            new Vector3(29f, HabitatFloorY, 10f),
            1.65f,
            48f,
            105f);
    }

    private void CreateInteriorSpotLight(
        string lightName,
        Vector3 position,
        Vector3 target,
        float intensity,
        float range,
        float spotAngle)
    {
        GameObject lightObject = new GameObject(lightName);
        lightObject.transform.SetParent(environmentRoot, false);
        lightObject.transform.position = position;
        lightObject.transform.rotation = Quaternion.LookRotation(
            target - position,
            Vector3.forward);
        Light light = lightObject.AddComponent<Light>();
        light.type = LightType.Spot;
        light.color = new Color32(0xFF, 0xEC, 0xCF, 0xFF);
        light.intensity = intensity;
        light.range = range;
        light.spotAngle = spotAngle;
        light.innerSpotAngle = spotAngle * 0.62f;
        light.shadows = LightShadows.None;
        light.renderMode = LightRenderMode.ForcePixel;
    }

    private void BuildSingleGrassPlane(GameObject greenhouse)
    {
        Renderer[] greenhouseRenderers =
            greenhouse.GetComponentsInChildren<Renderer>(true);
        if (greenhouseRenderers.Length == 0)
        {
            Debug.LogWarning("온실 폭을 계산할 렌더러가 없습니다.");
            return;
        }

        Bounds buildingBounds = greenhouseRenderers[0].bounds;
        for (int index = 1; index < greenhouseRenderers.Length; index++)
            buildingBounds.Encapsulate(greenhouseRenderers[index].bounds);

        float planeWidth = buildingBounds.size.x * 2f;
        float planeDepth = buildingBounds.size.z * 1.6f;
        GameObject plane = GameObject.CreatePrimitive(PrimitiveType.Plane);
        plane.name = "잔디 바닥 Plane 1장 · UV 32x26";
        plane.transform.SetParent(environmentRoot, false);
        plane.transform.position = new Vector3(
            buildingBounds.center.x,
            -0.08f,
            buildingBounds.center.z);
        plane.transform.localScale = new Vector3(
            planeWidth / 10f,
            1f,
            planeDepth / 10f);

        Collider planeCollider = plane.GetComponent<Collider>();
        if (planeCollider != null)
            Destroy(planeCollider);

        Material grassTemplate = Resources.Load<Material>(
            "Materials/GardenGroundGrass");
        if (grassTemplate == null)
        {
            Debug.LogError("잔디 Plane용 Lit 머티리얼을 찾지 못했습니다.");
            return;
        }

        Material grassMaterial = new Material(grassTemplate)
        {
            name = "잔디 Plane · Lit 호환 · UV 32x26 · Smoothness 0.15",
        };
        grassMaterial.SetTextureScale("_MainTex", new Vector2(32f, 26f));
        grassMaterial.SetFloat("_Metallic", 0f);
        grassMaterial.SetFloat("_Glossiness", 0.15f);
        if (grassMaterial.GetTexture("_BumpMap") != null)
        {
            grassMaterial.SetTextureScale(
                "_BumpMap",
                new Vector2(32f, 26f));
            grassMaterial.EnableKeyword("_NORMALMAP");
        }

        Renderer planeRenderer = plane.GetComponent<Renderer>();
        planeRenderer.sharedMaterial = grassMaterial;
        planeRenderer.shadowCastingMode =
            UnityEngine.Rendering.ShadowCastingMode.Off;
        planeRenderer.receiveShadows = true;
        MarkStatic(plane);
        Debug.Log(
            "[PC Garden] 단일 잔디 Plane 구성 · "
            + planeWidth.ToString("F1")
            + "m x "
            + planeDepth.ToString("F1")
            + "m · UV 32x26 · Smoothness 0.15 · DrawCall 1");
    }

    private void BuildPlacementSlots()
    {
        placementSlots.Clear();
        for (int row = 0; row < SlotRows; row++)
        {
            for (int col = 0; col < SlotColumns; col++)
            {
                GameObject slotObject = new GameObject();
                slotObject.transform.SetParent(slotRoot, false);
                PCGardenPlacementSlotView slot =
                    slotObject.AddComponent<PCGardenPlacementSlotView>();
                slot.Initialize(row, col, SlotPosition(row, col));
                placementSlots.Add(slot);
            }
        }
    }

    private void BuildGreenhouseFloorFootprint(GameObject greenhouse)
    {
        greenhouseFloorTriangles.Clear();
        foreach (MeshFilter filter in
            greenhouse.GetComponentsInChildren<MeshFilter>(true))
        {
            Mesh mesh = filter.sharedMesh;
            if (mesh == null)
                continue;
            Vector3[] vertices = mesh.vertices;
            int[] triangles = mesh.triangles;
            for (int index = 0; index + 2 < triangles.Length; index += 3)
            {
                Vector3 a3 = filter.transform.TransformPoint(
                    vertices[triangles[index]]);
                Vector3 b3 = filter.transform.TransformPoint(
                    vertices[triangles[index + 1]]);
                Vector3 c3 = filter.transform.TransformPoint(
                    vertices[triangles[index + 2]]);
                float averageY = (a3.y + b3.y + c3.y) / 3f;
                if (Mathf.Abs(averageY - HabitatFloorY) > 0.22f)
                    continue;
                if (Mathf.Abs(Vector3.Cross(b3 - a3, c3 - a3).y) < 0.001f)
                    continue;

                Vector2 a = new Vector2(a3.x, a3.z);
                Vector2 b = new Vector2(b3.x, b3.z);
                Vector2 c = new Vector2(c3.x, c3.z);
                greenhouseFloorTriangles.Add(new FloorTriangle
                {
                    a = a,
                    b = b,
                    c = c,
                    bounds = Rect.MinMaxRect(
                        Mathf.Min(a.x, Mathf.Min(b.x, c.x)),
                        Mathf.Min(a.y, Mathf.Min(b.y, c.y)),
                        Mathf.Max(a.x, Mathf.Max(b.x, c.x)),
                        Mathf.Max(a.y, Mathf.Max(b.y, c.y))),
                });
            }
        }
        Debug.Log(
            "[PC Garden] 자유 배치용 온실 바닥 삼각형 "
            + greenhouseFloorTriangles.Count + "개 준비");
    }

    private bool IsPointOnGreenhouseFloor(Vector3 worldPoint)
    {
        Vector2 point = new Vector2(worldPoint.x, worldPoint.z);
        foreach (FloorTriangle triangle in greenhouseFloorTriangles)
        {
            if (!triangle.bounds.Contains(point))
                continue;
            float denominator =
                (triangle.b.y - triangle.c.y)
                * (triangle.a.x - triangle.c.x)
                + (triangle.c.x - triangle.b.x)
                * (triangle.a.y - triangle.c.y);
            if (Mathf.Abs(denominator) < 0.00001f)
                continue;
            float u =
                ((triangle.b.y - triangle.c.y)
                    * (point.x - triangle.c.x)
                    + (triangle.c.x - triangle.b.x)
                    * (point.y - triangle.c.y))
                / denominator;
            float v =
                ((triangle.c.y - triangle.a.y)
                    * (point.x - triangle.c.x)
                    + (triangle.a.x - triangle.c.x)
                    * (point.y - triangle.c.y))
                / denominator;
            float w = 1f - u - v;
            if (u >= -0.001f && v >= -0.001f && w >= -0.001f)
                return true;
        }
        return false;
    }

    private Vector3 SnapToGreenhouseFloor(Vector3 requested)
    {
        requested.y = HabitatFloorY;
        if (IsPointOnGreenhouseFloor(requested))
            return requested;

        const float step = 0.5f;
        for (float radius = step; radius <= 18f; radius += step)
        {
            int samples = Mathf.Max(16, Mathf.CeilToInt(radius * 10f));
            for (int index = 0; index < samples; index++)
            {
                float angle = index * Mathf.PI * 2f / samples;
                Vector3 candidate = new Vector3(
                    requested.x + Mathf.Cos(angle) * radius,
                    HabitatFloorY,
                    requested.z + Mathf.Sin(angle) * radius);
                if (IsPointOnGreenhouseFloor(candidate))
                    return candidate;
            }
        }
        return new Vector3(0f, HabitatFloorY, 16f);
    }

    private static void EnsurePlacementTiles(GardenBootstrapData data)
    {
        var tiles = new List<GardenTileData>(
            data.tiles ?? Array.Empty<GardenTileData>());
        var existing = new HashSet<string>();
        foreach (GardenTileData tile in tiles)
        {
            if (tile != null)
                existing.Add(tile.row + ":" + tile.col);
        }

        for (int row = 0; row < SlotRows; row++)
        {
            for (int col = 0; col < SlotColumns; col++)
            {
                if (existing.Contains(row + ":" + col))
                    continue;
                tiles.Add(new GardenTileData
                {
                    row = row,
                    col = col,
                    type = row >= 6 && (col == 2 || col == 5)
                        ? (col == 2 ? "흙" : "꽃밭")
                        : "잔디",
                });
            }
        }
        data.tiles = tiles.ToArray();
    }

    private void NormalizePlacementModes(GardenBootstrapData data)
    {
        var creatureById = new Dictionary<string, GardenCreatureData>();
        foreach (GardenCreatureData creature in
            data.creatures ?? Array.Empty<GardenCreatureData>())
        {
            if (creature != null)
                creatureById[creature.creatureId] = creature;
        }
        var assetByKey = new Dictionary<string, GardenAssetData>();
        foreach (GardenAssetData asset in
            data.assets ?? Array.Empty<GardenAssetData>())
        {
            if (asset != null)
                assetByKey[asset.assetKey] = asset;
        }

        foreach (GardenPlacementData placement in
            data.placements ?? Array.Empty<GardenPlacementData>())
        {
            if (placement == null
                || !creatureById.TryGetValue(
                    placement.creatureId,
                    out GardenCreatureData creature)
                || !assetByKey.TryGetValue(
                    creature.modelKey,
                    out GardenAssetData asset))
                continue;

            bool plantSlot = asset.category == "plant"
                || asset.category == "tree";
            if (plantSlot)
            {
                if (string.IsNullOrWhiteSpace(placement.placementMode))
                    placement.placementMode = "slot";
                continue;
            }
            if (placement.placementMode == "free")
            {
                Vector3 snapped = SnapToGreenhouseFloor(new Vector3(
                    placement.worldX,
                    placement.worldY,
                    placement.worldZ));
                placement.worldX = snapped.x;
                placement.worldY = snapped.y;
                placement.worldZ = snapped.z;
                continue;
            }

            Vector3 legacyPosition = SlotPosition(
                placement.row,
                placement.col);
            placement.placementMode = "free";
            placement.worldX = legacyPosition.x;
            placement.worldY = HabitatFloorY;
            placement.worldZ = legacyPosition.z;
            placement.row = -1;
            placement.col = -1;
        }
    }

    private void DetectNewCreatures(GardenBootstrapData data)
    {
        newCreatureIds.Clear();
        if (data.creatures == null || data.creatures.Length == 0)
            return;

        string key = "pc-garden-last-capture-" + (data.userId ?? "local");
        string stored = PlayerPrefs.GetString(key, string.Empty);
        DateTime lastSeen;
        bool hasLastSeen = DateTime.TryParse(stored, out lastSeen);
        DateTime newest = DateTime.MinValue;
        GardenCreatureData newestCreature = null;
        foreach (GardenCreatureData creature in data.creatures)
        {
            if (creature == null
                || !DateTime.TryParse(creature.capturedAt, out DateTime captured))
                continue;
            captured = captured.ToUniversalTime();
            if (captured > newest)
            {
                newest = captured;
                newestCreature = creature;
            }
            if (hasLastSeen && captured > lastSeen.ToUniversalTime())
                newCreatureIds.Add(creature.creatureId);
        }

        // 첫 PC 진입에서는 최신 포획 한 마리만 강조해 기존 보유 전체가
        // NEW로 도배되지 않게 한다.
        if (!hasLastSeen && newestCreature != null)
            newCreatureIds.Add(newestCreature.creatureId);

        if (newCreatureIds.Count > 0)
        {
            inventoryCategoryFilter = "new";
            GardenCreatureData dockCreature = newestCreature;
            if (dockCreature != null)
            {
                newDockAnimationName = dockCreature.displayName;
                newDockAnimationStartedAt = Time.unscaledTime;
            }
        }

        if (newest > DateTime.MinValue)
        {
            PlayerPrefs.SetString(key, newest.ToString("O"));
            PlayerPrefs.Save();
        }
    }

    private void RebuildCreatures()
    {
        foreach (PCGardenCreatureView view in spawnedCreatures)
        {
            if (view != null)
                Destroy(view.gameObject);
        }
        spawnedCreatures.Clear();
        creaturesById.Clear();
        assetsByKey.Clear();

        if (bootstrap.assets != null)
        {
            foreach (GardenAssetData asset in bootstrap.assets)
            {
                if (asset != null && !string.IsNullOrWhiteSpace(asset.assetKey))
                    assetsByKey[asset.assetKey] = asset;
            }
        }

        if (bootstrap.creatures != null)
        {
            foreach (GardenCreatureData creature in bootstrap.creatures)
            {
                if (creature != null && !string.IsNullOrWhiteSpace(creature.creatureId))
                    creaturesById[creature.creatureId] = creature;
            }
        }

        if (bootstrap.placements == null)
        {
            RefreshPlacementSlotVisuals();
            return;
        }

        foreach (GardenPlacementData placement in bootstrap.placements)
        {
            if (placement == null
                || !creaturesById.TryGetValue(placement.creatureId, out GardenCreatureData creature))
                continue;

            Vector3 position = placement.placementMode == "free"
                ? new Vector3(
                    placement.worldX,
                    Mathf.Abs(placement.worldY) > 0.001f
                        ? placement.worldY
                        : HabitatFloorY,
                    placement.worldZ)
                : SlotPosition(placement.row, placement.col);
            PCGardenCreatureView view = SpawnCreature(creature, position);
            if (view != null)
                spawnedCreatures.Add(view);
        }
        RefreshPlacementSlotVisuals();
    }

    private PCGardenCreatureView SpawnCreature(
        GardenCreatureData creature,
        Vector3 slotPosition)
    {
        // 일부 오래된 수집 기록은 아직 3D 카탈로그에 연결되지 않아
        // modelKey가 비어 있다. 화면 배치 대상만 조용히 건너뛴다.
        if (string.IsNullOrWhiteSpace(creature.modelKey))
            return null;

        if (assetsByKey.TryGetValue(creature.modelKey, out GardenAssetData asset))
            return SpawnCatalogCreature(creature, asset, slotPosition);

        switch (creature.modelKey)
        {
            case "large-billed-crow":
                return SpawnCrow(creature, slotPosition);
            case "rhinoceros-beetle":
                return SpawnRhinocerosBeetle(creature, slotPosition);
            default:
                Debug.LogWarning("지원하지 않는 PC 홈가든 modelKey: " + creature.modelKey);
                return null;
        }
    }

    private PCGardenCreatureView SpawnCatalogCreature(
        GardenCreatureData creature,
        GardenAssetData asset,
        Vector3 slotPosition)
    {
        GameObject prefab = Resources.Load<GameObject>(asset.resourcePath);
        if (prefab == null)
        {
            Debug.LogWarning("PC 홈가든 모델을 불러오지 못했습니다: " + asset.resourcePath);
            return null;
        }

        GameObject instance = Instantiate(prefab, creatureRoot);
        instance.SetActive(false);
        instance.name = creature.displayName;
        instance.transform.localScale =
            Vector3.one * EffectiveDisplayScale(asset);

        switch (asset.behaviourProfile)
        {
            case "bird-flight":
                ConfigureFlyingBird(instance, creature, asset, slotPosition);
                break;
            case "bird-perched":
                ConfigurePerchedBird(instance, creature, asset, slotPosition);
                AddGroundClamp(instance, asset.category);
                break;
            case "butterfly-flight":
                ConfigureButterfly(instance, creature, asset, slotPosition);
                break;
            case "flying-insect":
                ConfigureFlyingInsect(instance, creature, asset, slotPosition);
                break;
            case "ground-insect":
                ConfigureGroundInsect(instance, creature, asset, slotPosition);
                AddGroundClamp(instance, asset.category);
                break;
            default:
                PositionGrounded(instance, creature, slotPosition);
                AddGroundClamp(instance, asset.category);
                if (asset.behaviourProfile == "static")
                {
                    MarkStatic(instance);
                }
                break;
        }

        PCGardenCreatureView view = ConfigureCreatureView(instance, creature);
        instance.SetActive(true);
        view.EnsureSelectionCollider();
        return view;
    }

    private static void ConfigureFlyingBird(
        GameObject bird,
        GardenCreatureData creature,
        GardenAssetData asset,
        Vector3 slotPosition)
    {
        BirdFlightBehaviour behaviour = bird.GetComponent<BirdFlightBehaviour>();
        if (behaviour == null)
            behaviour = bird.AddComponent<BirdFlightBehaviour>();

        behaviour.animationResourcePath = asset.resourcePath;
        behaviour.flightStyle = FlightStyleFor(asset.assetKey);
        behaviour.flightEnabled = true;
        behaviour.continuouslyFlying = true;
        float phase = Mathf.Repeat(StableHash(creature.creatureId) * 0.0137f, 6.28f);
        float baseAltitude = Mathf.Max(8.5f, asset.minimumAltitude + 2.5f);
        behaviour.flightCentre = slotPosition + new Vector3(0f, baseAltitude, 0f);
        behaviour.flightRadii = new Vector3(
            behaviour.flightStyle == BirdFlightStyle.Gull ? 10f : 7.5f,
            behaviour.flightStyle == BirdFlightStyle.Gull ? 2.4f : 1.8f,
            behaviour.flightStyle == BirdFlightStyle.Gull ? 7.5f : 5.5f);
        behaviour.phaseOffset = phase;
        behaviour.pathSpeed = behaviour.flightStyle == BirdFlightStyle.Passerine
            ? 0.54f
            : behaviour.flightStyle == BirdFlightStyle.Gull ? 0.24f : 0.34f;
        behaviour.modelYawOffset =
            behaviour.flightStyle == BirdFlightStyle.Crow ? 90f : -90f;
        behaviour.minimumFlightAltitude = Mathf.Max(
            6.8f,
            behaviour.flightCentre.y - behaviour.flightRadii.y);
        behaviour.perchPoints = new[] { behaviour.flightCentre };
    }

    private static void ConfigurePerchedBird(
        GameObject bird,
        GardenCreatureData creature,
        GardenAssetData asset,
        Vector3 slotPosition)
    {
        BirdFlightBehaviour behaviour = bird.GetComponent<BirdFlightBehaviour>();
        if (behaviour == null)
            behaviour = bird.AddComponent<BirdFlightBehaviour>();

        behaviour.animationResourcePath = asset.resourcePath;
        behaviour.flightStyle = FlightStyleFor(asset.assetKey);
        behaviour.flightEnabled = false;
        behaviour.continuouslyFlying = false;
        behaviour.phaseOffset =
            Mathf.Repeat(StableHash(creature.creatureId) * 0.0137f, 6.28f);
        behaviour.modelYawOffset = -90f;
        behaviour.flightCentre = slotPosition;
        behaviour.perchPoints = new[] { slotPosition };
        behaviour.minimumFlightAltitude = HabitatFloorY;
        behaviour.perchWaitMin = 9999f;
        behaviour.perchWaitMax = 10000f;

        PerchedBirdIdleBehaviour idle =
            bird.GetComponent<PerchedBirdIdleBehaviour>();
        if (idle == null)
            idle = bird.AddComponent<PerchedBirdIdleBehaviour>();
        idle.idleStyle = PerchedIdleStyleFor(asset.assetKey);
        idle.phaseOffset = behaviour.phaseOffset;
    }

    private static void ConfigureButterfly(
        GameObject butterfly,
        GardenCreatureData creature,
        GardenAssetData asset,
        Vector3 slotPosition)
    {
        ButterflyFlight flight = butterfly.GetComponent<ButterflyFlight>();
        if (flight == null)
            flight = butterfly.AddComponent<ButterflyFlight>();
        flight.animationResourcePath = asset.resourcePath;
        flight.flightCentre = slotPosition + new Vector3(0f, 3.2f, 0f);
        flight.flightRadii = new Vector3(2.8f, 1.15f, 2.35f);
        flight.phaseOffset =
            Mathf.Repeat(StableHash(creature.creatureId) * 0.021f, 6.28f);
        flight.pathSpeed = 0.24f;
        flight.flapAnimationSpeed = 0.92f;
    }

    private static void ConfigureFlyingInsect(
        GameObject insect,
        GardenCreatureData creature,
        GardenAssetData asset,
        Vector3 slotPosition)
    {
        FlyingInsectFlight flight = insect.GetComponent<FlyingInsectFlight>();
        if (flight == null)
            flight = insect.AddComponent<FlyingInsectFlight>();
        flight.animationResourcePath = asset.resourcePath;
        flight.flightStyle = FlyingStyleFor(asset.assetKey);
        flight.flightCentre = slotPosition + new Vector3(
            0f,
            flight.flightStyle == FlyingInsectStyle.Dragonfly ? 4.4f : 3.5f,
            0f);
        flight.flightRadii = flight.flightStyle == FlyingInsectStyle.Dragonfly
            ? new Vector3(3.2f, 1.25f, 2.8f)
            : new Vector3(2.4f, 1f, 2.1f);
        flight.phaseOffset =
            Mathf.Repeat(StableHash(creature.creatureId) * 0.017f, 6.28f);
        flight.pathSpeed =
            flight.flightStyle == FlyingInsectStyle.Dragonfly ? 0.31f : 0.24f;
        flight.flapAnimationSpeed =
            flight.flightStyle == FlyingInsectStyle.Dragonfly ? 1.45f : 1.25f;
        flight.turnSmoothness =
            flight.flightStyle == FlyingInsectStyle.Dragonfly
                ? 10f
                : flight.flightStyle == FlyingInsectStyle.Hornet ? 8.5f : 7f;
    }

    private static void ConfigureGroundInsect(
        GameObject insect,
        GardenCreatureData creature,
        GardenAssetData asset,
        Vector3 slotPosition)
    {
        float phase = Mathf.Repeat(
            StableHash(creature.creatureId) * 0.019f,
            6.28f);

        if (asset.assetKey == "rhinoceros-beetle"
            || asset.assetKey == "stag-beetle")
        {
            if (asset.assetKey == "rhinoceros-beetle")
                ArticulatedBeetleRig.Attach(insect, phase);
            else
                StagBeetleRig.Attach(insect, phase);

            PCGardenGroundWander wander =
                insect.GetComponent<PCGardenGroundWander>();
            if (wander == null)
                wander = insect.AddComponent<PCGardenGroundWander>();
            wander.movementCentre = slotPosition;
            wander.movementRadii = new Vector2(1.55f, 1.15f);
            wander.phaseOffset = phase;
            wander.movementSpeed = 0.19f;
            return;
        }

        GroundInsectMovement movement =
            insect.GetComponent<GroundInsectMovement>();
        if (movement == null)
            movement = insect.AddComponent<GroundInsectMovement>();
        movement.animationResourcePath = asset.resourcePath;
        movement.movementStyle = GroundStyleFor(asset.assetKey);
        movement.movementCentre = slotPosition;
        movement.movementRadii =
            movement.movementStyle == GroundInsectStyle.Grasshopper
                ? new Vector2(1.8f, 1.35f)
                : new Vector2(1.35f, 1.05f);
        movement.phaseOffset = phase;
        movement.groundHeight = 0.16f;
        movement.movementSpeed =
            movement.movementStyle == GroundInsectStyle.Grasshopper
                ? 0.24f
                : movement.movementStyle == GroundInsectStyle.Delicate
                    ? 0.11f
                    : 0.17f;
    }

    private static void PositionGrounded(
        GameObject instance,
        GardenCreatureData creature,
        Vector3 slotPosition)
    {
        instance.transform.position = slotPosition + new Vector3(0f, 0.35f, 0f);
        instance.transform.rotation = Quaternion.Euler(
            0f,
            StableHash(creature.creatureId) % 360,
            0f);
    }

    private static float EffectiveDisplayScale(GardenAssetData asset)
    {
        // 로컬 배치 캐시에 예전 카탈로그 값이 남아 있어도 새 전시 배율보다
        // 작게 되돌아가지 않게 한다. 최신 DB 값은 이 하한보다 클 수 있다.
        float minimumScale;
        switch (asset.category)
        {
            case "tree":
                switch (asset.assetKey)
                {
                    case "korean-red-pine":
                        minimumScale = 22f;
                        break;
                    case "mongolian-oak":
                    case "oriental-cork-oak":
                        minimumScale = 24f;
                        break;
                    case "lacquer-tree":
                        minimumScale = 18f;
                        break;
                    case "japanese-spicebush":
                        minimumScale = 7f;
                        break;
                    case "mastic-leaf-prickly-ash":
                    case "border-privet":
                        minimumScale = 6f;
                        break;
                    case "japanese-beautyberry":
                        minimumScale = 5f;
                        break;
                    default:
                        minimumScale = 4f;
                        break;
                }
                break;
            case "plant":
                minimumScale = 3f;
                break;
            case "insect":
                minimumScale = asset.behaviourProfile == "ground-insect"
                    ? 7f
                    : 7.5f;
                break;
            case "bird":
                minimumScale = asset.assetKey == "large-billed-crow"
                    ? 3.5f
                    : asset.behaviourProfile == "bird-perched" ? 5.5f : 5.2f;
                break;
            default:
                minimumScale = 2f;
                break;
        }
        return Mathf.Max(0.01f, asset.displayScale, minimumScale);
    }

    private static void AddGroundClamp(GameObject instance, string category)
    {
        PCGardenGroundClamp clamp = instance.GetComponent<PCGardenGroundClamp>();
        if (clamp == null)
            clamp = instance.AddComponent<PCGardenGroundClamp>();
        clamp.floorY = HabitatFloorY;
        clamp.clearance = category == "insect"
            ? 0.02f
            : category == "bird" ? 0.005f : 0f;
        clamp.keepClamped = true;
    }

    private static GroundInsectStyle GroundStyleFor(string assetKey)
    {
        switch (assetKey)
        {
            case "long-grasshopper":
            case "chinese-grasshopper":
            case "rice-grasshopper":
                return GroundInsectStyle.Grasshopper;
            case "shield-bug":
            case "leaf-foot-bug":
                return GroundInsectStyle.TrueBug;
            case "oriental-mayfly":
            case "white-mayfly":
            case "damselfly":
                return GroundInsectStyle.Delicate;
            case "hoverfly":
                return GroundInsectStyle.Hoverfly;
            case "tiny-ladybug":
                return GroundInsectStyle.Tiny;
            default:
                return GroundInsectStyle.Ladybug;
        }
    }

    private static FlyingInsectStyle FlyingStyleFor(string assetKey)
    {
        switch (assetKey)
        {
            case "dragonfly": return FlyingInsectStyle.Dragonfly;
            case "hornet": return FlyingInsectStyle.Hornet;
            default: return FlyingInsectStyle.Honeybee;
        }
    }

    private static BirdFlightStyle FlightStyleFor(string assetKey)
    {
        switch (assetKey)
        {
            case "black-tailed-gull": return BirdFlightStyle.Gull;
            case "oriental-turtle-dove": return BirdFlightStyle.Pigeon;
            case "white-wagtail": return BirdFlightStyle.Wagtail;
            case "brown-eared-bulbul": return BirdFlightStyle.Bulbul;
            case "great-egret": return BirdFlightStyle.Egret;
            case "grey-heron-rigged": return BirdFlightStyle.Egret;
            case "mallard":
            case "spot-billed-duck":
                return BirdFlightStyle.Duck;
            case "large-billed-crow": return BirdFlightStyle.Crow;
            default: return BirdFlightStyle.Passerine;
        }
    }

    private static PerchedBirdIdleStyle PerchedIdleStyleFor(string assetKey)
    {
        switch (assetKey)
        {
            case "mallard":
            case "spot-billed-duck":
                return PerchedBirdIdleStyle.Duck;
            case "great-egret":
            case "grey-heron-rigged":
                return PerchedBirdIdleStyle.Egret;
            case "oriental-magpie":
                return PerchedBirdIdleStyle.Magpie;
            default:
                return PerchedBirdIdleStyle.Songbird;
        }
    }

    private PCGardenCreatureView SpawnCrow(
        GardenCreatureData creature,
        Vector3 slotPosition)
    {
        if (largeBilledCrowPrefab == null)
            return null;

        GameObject crow = Instantiate(largeBilledCrowPrefab, creatureRoot);
        crow.SetActive(false);
        crow.name = creature.displayName;
        crow.transform.localScale = Vector3.one * 3.5f;

        BirdFlightBehaviour behaviour = crow.GetComponent<BirdFlightBehaviour>();
        if (behaviour == null)
            behaviour = crow.AddComponent<BirdFlightBehaviour>();
        behaviour.animationResourcePath = "Models/Birds/LargeBilledCrow";
        behaviour.flightStyle = BirdFlightStyle.Crow;
        behaviour.flightEnabled = true;
        behaviour.continuouslyFlying = true;
        behaviour.flightCentre = slotPosition + new Vector3(0f, 6.5f, 0f);
        behaviour.flightRadii = new Vector3(7f, 1.8f, 5f);
        behaviour.minimumFlightAltitude = 5.1f;
        behaviour.phaseOffset = 1.55f;
        behaviour.pathSpeed = 0.29f;
        behaviour.modelYawOffset = 90f;
        behaviour.perchPoints = new[] { slotPosition + new Vector3(0f, 6.5f, 0f) };

        PCGardenCreatureView view = ConfigureCreatureView(crow, creature);
        crow.SetActive(true);
        view.EnsureSelectionCollider();
        return view;
    }

    private PCGardenCreatureView SpawnRhinocerosBeetle(
        GardenCreatureData creature,
        Vector3 slotPosition)
    {
        if (rhinocerosBeetlePrefab == null)
            return null;

        GameObject beetle = Instantiate(rhinocerosBeetlePrefab, creatureRoot);
        beetle.name = creature.displayName;
        beetle.transform.position = slotPosition + new Vector3(0f, 0.35f, 0f);
        beetle.transform.rotation = Quaternion.Euler(0f, 25f, 0f);
        // PC 홈가든에서는 작은 곤충도 클릭하고 관찰할 수 있도록 전시 배율을 적용한다.
        beetle.transform.localScale = Vector3.one * 7f;
        ArticulatedBeetleRig.Attach(beetle, 0f);
        PCGardenGroundWander wander = beetle.AddComponent<PCGardenGroundWander>();
        wander.movementCentre = slotPosition;
        wander.movementRadii = new Vector2(1.55f, 1.15f);
        wander.phaseOffset = 0f;
        wander.movementSpeed = 0.19f;
        PCGardenGroundClamp clamp = beetle.AddComponent<PCGardenGroundClamp>();
        clamp.floorY = HabitatFloorY;
        clamp.clearance = 0.08f;

        PCGardenCreatureView view = ConfigureCreatureView(beetle, creature);
        view.EnsureSelectionCollider();
        return view;
    }

    private static PCGardenCreatureView ConfigureCreatureView(
        GameObject root,
        GardenCreatureData creature)
    {
        PCGardenCreatureView view = root.GetComponent<PCGardenCreatureView>();
        if (view == null)
            view = root.AddComponent<PCGardenCreatureView>();
        view.creatureId = creature.creatureId;
        view.speciesId = creature.speciesId;
        view.displayName = creature.displayName;
        view.bond = creature.bond;
        return view;
    }

    private string LoadLocalOrMockBootstrapJson()
    {
        string localSavePath = Path.Combine(
            Application.persistentDataPath,
            "pc-garden-layout.json");
        if (File.Exists(localSavePath))
            return File.ReadAllText(localSavePath);

        string path = Path.Combine(Application.streamingAssetsPath, mockBootstrapFileName);
        if (File.Exists(path))
            return File.ReadAllText(path);

        Debug.LogWarning("mock bootstrap 파일이 없어 내장 데이터를 사용합니다: " + path);
        return "{\"schemaVersion\":1,\"userId\":\"mock-user\",\"displayName\":\"Nature Go 탐험가\","
            + "\"creatures\":["
            + "{\"creatureId\":\"mock-crow-1\",\"speciesId\":\"taxon-large-billed-crow\","
            + "\"displayName\":\"큰부리까마귀\",\"modelKey\":\"large-billed-crow\",\"bond\":3},"
            + "{\"creatureId\":\"mock-rhino-1\",\"speciesId\":\"taxon-rhinoceros-beetle\","
            + "\"displayName\":\"장수풍뎅이\",\"modelKey\":\"rhinoceros-beetle\",\"bond\":2}],"
            + "\"placements\":["
            + "{\"creatureId\":\"mock-crow-1\",\"row\":4,\"col\":4},"
            + "{\"creatureId\":\"mock-rhino-1\",\"row\":2,\"col\":2}]}";
    }

    private void RefreshPlacementSlotVisuals()
    {
        var occupied = new HashSet<string>();
        foreach (GardenPlacementData placement in bootstrap?.placements
            ?? Array.Empty<GardenPlacementData>())
        {
            if (placement != null && placement.placementMode != "free")
                occupied.Add(placement.row + ":" + placement.col);
        }

        foreach (PCGardenPlacementSlotView slot in placementSlots)
        {
            if (slot == null)
                continue;
            bool isOccupied = occupied.Contains(slot.row + ":" + slot.col);
            bool isHovered = slot == hoveredPlacementSlot;
            slot.SetState(
                isOccupied,
                IsInventoryDragging && dragUsesPlantSlot,
                isHovered,
                isHovered && dragDropValid);
        }
    }

    private GardenCreatureData FindUnplacedCreature(string modelKey)
    {
        if (bootstrap?.creatures == null)
            return null;

        var placed = new HashSet<string>();
        foreach (GardenPlacementData placement in bootstrap.placements
            ?? Array.Empty<GardenPlacementData>())
        {
            if (placement != null)
                placed.Add(placement.creatureId);
        }

        foreach (GardenCreatureData creature in bootstrap.creatures)
        {
            if (creature != null
                && creature.modelKey == modelKey
                && !placed.Contains(creature.creatureId))
                return creature;
        }
        return null;
    }

    private bool IsSlotOccupied(int row, int col)
    {
        foreach (GardenPlacementData placement in bootstrap?.placements
            ?? Array.Empty<GardenPlacementData>())
        {
            if (placement != null
                && placement.placementMode != "free"
                && placement.row == row
                && placement.col == col)
                return true;
        }
        return false;
    }

    private void BeginInventoryDrag(GardenCreatureData creature)
    {
        if (creature == null
            || string.IsNullOrWhiteSpace(creature.modelKey)
            || !assetsByKey.TryGetValue(creature.modelKey, out GardenAssetData asset))
            return;

        EndInventoryDrag(false);
        draggedCreature = creature;
        draggedAsset = asset;
        dragUsesPlantSlot = RequiresPlantSlot(asset);
        CreateDragGhost(asset);
        status = dragUsesPlantSlot
            ? creature.displayName + " 카드를 빈 식물 슬롯으로 끌어 놓으세요."
            : creature.displayName + " 카드를 온실 바닥 원하는 곳에 놓으세요.";
        RefreshPlacementSlotVisuals();
    }

    private void UpdateInventoryDrag()
    {
        Camera camera = orbitCamera != null ? orbitCamera.targetCamera : Camera.main;
        if (camera == null)
        {
            EndInventoryDrag(false);
            return;
        }

        Ray ray = camera.ScreenPointToRay(Input.mousePosition);
        Plane floor = new Plane(Vector3.up, new Vector3(0f, HabitatFloorY, 0f));
        if (!floor.Raycast(ray, out float distance))
        {
            dragDropValid = false;
            SetDragGhostColor(false);
            RefreshPlacementSlotVisuals();
            if (Input.GetMouseButtonUp(0))
                EndInventoryDrag(false);
            return;
        }

        Vector3 worldPoint = ray.GetPoint(distance);
        dragWorldPoint = new Vector3(
            worldPoint.x,
            HabitatFloorY,
            worldPoint.z);
        PositionDragGhost(worldPoint);
        hoveredPlacementSlot = null;
        float closestDistance = float.PositiveInfinity;
        if (dragUsesPlantSlot)
        {
            foreach (PCGardenPlacementSlotView slot in placementSlots)
            {
                if (slot == null)
                    continue;
                Vector2 delta = new Vector2(
                    worldPoint.x - slot.transform.position.x,
                    worldPoint.z - slot.transform.position.z);
                float sqrDistance = delta.sqrMagnitude;
                if (sqrDistance >= closestDistance)
                    continue;
                closestDistance = sqrDistance;
                hoveredPlacementSlot = slot;
            }
            dragDropValid = hoveredPlacementSlot != null
                && closestDistance <= 2.15f * 2.15f
                && !IsSlotOccupied(
                    hoveredPlacementSlot.row,
                    hoveredPlacementSlot.col);
        }
        else
        {
            dragDropValid = IsPointOnGreenhouseFloor(worldPoint);
        }

        SetDragGhostColor(dragDropValid);
        RefreshPlacementSlotVisuals();

        if (!Input.GetMouseButtonUp(0))
            return;

        if (dragDropValid && dragUsesPlantSlot && hoveredPlacementSlot != null)
        {
            GardenCreatureData creature = draggedCreature;
            int row = hoveredPlacementSlot.row;
            int col = hoveredPlacementSlot.col;
            EndInventoryDrag(false);
            PlaceCreatureAtSlot(creature, row, col);
        }
        else if (dragDropValid && !dragUsesPlantSlot)
        {
            GardenCreatureData creature = draggedCreature;
            Vector3 placementPoint = dragWorldPoint;
            EndInventoryDrag(false);
            PlaceCreatureAtWorldPosition(creature, placementPoint);
        }
        else
        {
            status = dragUsesPlantSlot
                ? "빈 식물 슬롯의 초록 링 위에 놓아야 배치됩니다."
                : "온실의 실제 바닥 안쪽에 놓아야 배치됩니다.";
            EndInventoryDrag(false);
        }
    }

    private void CreateDragGhost(GardenAssetData asset)
    {
        GameObject prefab = Resources.Load<GameObject>(asset.resourcePath);
        if (prefab == null)
            return;

        dragGhost = Instantiate(prefab, dragGhostRoot);
        dragGhost.name = asset.displayName + " 배치 고스트";
        dragGhost.transform.localScale = Vector3.one * EffectiveDisplayScale(asset);

        foreach (MonoBehaviour behaviour in
            dragGhost.GetComponentsInChildren<MonoBehaviour>(true))
            behaviour.enabled = false;
        foreach (Animator animator in
            dragGhost.GetComponentsInChildren<Animator>(true))
            animator.enabled = false;
        foreach (Collider collider in
            dragGhost.GetComponentsInChildren<Collider>(true))
            collider.enabled = false;
        foreach (Transform item in dragGhost.GetComponentsInChildren<Transform>(true))
            item.gameObject.layer = LayerMask.NameToLayer("Ignore Raycast");

        Shader shader = Shader.Find("Sprites/Default");
        if (shader == null)
            shader = Shader.Find("Unlit/Transparent");
        dragGhostMaterial = new Material(shader)
        {
            name = asset.displayName + " 반투명 배치 고스트",
        };
        foreach (Renderer renderer in
            dragGhost.GetComponentsInChildren<Renderer>(true))
        {
            Material[] ghostMaterials = new Material[
                Mathf.Max(1, renderer.sharedMaterials.Length)];
            for (int index = 0; index < ghostMaterials.Length; index++)
                ghostMaterials[index] = dragGhostMaterial;
            renderer.sharedMaterials = ghostMaterials;
            renderer.shadowCastingMode =
                UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
        }
        SetDragGhostColor(false);
    }

    private void PositionDragGhost(Vector3 worldPoint)
    {
        if (dragGhost == null)
            return;
        dragGhost.transform.position = new Vector3(
            worldPoint.x,
            HabitatFloorY,
            worldPoint.z);

        Renderer[] renderers = dragGhost.GetComponentsInChildren<Renderer>(true);
        if (renderers.Length == 0)
            return;
        float minimumY = float.PositiveInfinity;
        foreach (Renderer renderer in renderers)
        {
            if (renderer != null && renderer.enabled)
                minimumY = Mathf.Min(minimumY, renderer.bounds.min.y);
        }
        if (float.IsInfinity(minimumY))
            return;
        Vector3 position = dragGhost.transform.position;
        position.y += HabitatFloorY - minimumY;
        dragGhost.transform.position = position;
    }

    private void SetDragGhostColor(bool valid)
    {
        if (dragGhostMaterial == null)
            return;
        dragGhostMaterial.color = valid
            ? new Color(0.16f, 1f, 0.32f, 0.44f)
            : new Color(1f, 0.18f, 0.18f, 0.4f);
    }

    private void EndInventoryDrag(bool keepStatus)
    {
        if (dragGhost != null)
            Destroy(dragGhost);
        if (dragGhostMaterial != null)
            Destroy(dragGhostMaterial);
        dragGhost = null;
        dragGhostMaterial = null;
        draggedCreature = null;
        draggedAsset = null;
        hoveredPlacementSlot = null;
        dragDropValid = false;
        dragUsesPlantSlot = false;
        if (!keepStatus)
            RefreshPlacementSlotVisuals();
    }

    private void PlaceCreatureAtSlot(
        GardenCreatureData creature,
        int row,
        int col)
    {
        if (creature == null
            || IsSlotOccupied(row, col)
            || FindUnplacedCreature(creature.modelKey) == null)
            return;

        var placements = new List<GardenPlacementData>(
            bootstrap.placements ?? Array.Empty<GardenPlacementData>())
        {
            new GardenPlacementData
            {
                creatureId = creature.creatureId,
                row = row,
                col = col,
                placementMode = "slot",
            },
        };
        CompletePlacement(creature, placements);
    }

    private void PlaceCreatureAtWorldPosition(
        GardenCreatureData creature,
        Vector3 worldPoint)
    {
        if (creature == null
            || FindUnplacedCreature(creature.modelKey) == null
            || !IsPointOnGreenhouseFloor(worldPoint))
            return;

        var placements = new List<GardenPlacementData>(
            bootstrap.placements ?? Array.Empty<GardenPlacementData>())
        {
            new GardenPlacementData
            {
                creatureId = creature.creatureId,
                row = -1,
                col = -1,
                placementMode = "free",
                worldX = worldPoint.x,
                worldY = HabitatFloorY,
                worldZ = worldPoint.z,
            },
        };
        CompletePlacement(creature, placements);
    }

    private void CompletePlacement(
        GardenCreatureData creature,
        List<GardenPlacementData> placements)
    {
        int previousCount = bootstrap.placements?.Length ?? 0;
        bootstrap.placements = placements.ToArray();
        animatedPlacementCount = previousCount;
        targetPlacementCount = placements.Count;
        counterVelocity = 0f;
        successFeedbackName = creature.displayName;
        successFeedbackStartedAt = Time.unscaledTime;
        PersistAndRebuild(creature.displayName + " 배치 성공!");
        StartCoroutine(FocusPlacementSuccess(creature.creatureId));
    }

    private IEnumerator FocusPlacementSuccess(string creatureId)
    {
        yield return null;
        PCGardenCreatureView view = spawnedCreatures.Find(
            candidate => candidate != null
                && candidate.creatureId == creatureId);
        if (view == null || orbitCamera == null)
            yield break;
        orbitCamera.Focus(view);
        yield return new WaitForSecondsRealtime(1.5f);
        orbitCamera.ShowOverview();
    }

    private void DrawInventoryPanel()
    {
        if (bootstrap == null || bootstrap.creatures == null)
            return;

        var groups = new Dictionary<string, List<GardenCreatureData>>();
        foreach (GardenCreatureData creature in bootstrap.creatures)
        {
            if (creature == null)
                continue;
            string groupKey = (creature.modelKey ?? string.Empty)
                + "|" + (creature.speciesId ?? string.Empty);
            if (!groups.TryGetValue(groupKey, out List<GardenCreatureData> group))
            {
                group = new List<GardenCreatureData>();
                groups[groupKey] = group;
            }
            group.Add(creature);
        }

        var sortedGroups = new List<List<GardenCreatureData>>(groups.Values);
        sortedGroups.Sort((left, right) =>
        {
            string leftCategory = CategoryFor(left[0].modelKey);
            string rightCategory = CategoryFor(right[0].modelKey);
            int categoryComparison = CategorySortOrder(leftCategory)
                .CompareTo(CategorySortOrder(rightCategory));
            return categoryComparison != 0
                ? categoryComparison
                : string.Compare(
                    left[0].displayName,
                    right[0].displayName,
                    StringComparison.CurrentCulture);
        });

        var visibleGroups = new List<List<GardenCreatureData>>();
        foreach (List<GardenCreatureData> group in sortedGroups)
        {
            bool containsNew = group.Exists(
                creature => creature != null
                    && newCreatureIds.Contains(creature.creatureId));
            if (inventoryCategoryFilter == "all"
                || (inventoryCategoryFilter == "new" && containsNew)
                || CategoryFor(group[0].modelKey) == inventoryCategoryFilter)
                visibleGroups.Add(group);
        }

        if (!inventoryExpanded)
        {
            DrawCollapsedInventory(sortedGroups.Count);
            return;
        }

        const float panelHeight = 344f;
        float panelY = Mathf.Max(154f, Screen.height - panelHeight - 12f);
        float panelWidth = Screen.width - 32f;
        GUI.Box(new Rect(16f, panelY, panelWidth, panelHeight), string.Empty);

        var titleStyle = new GUIStyle(GUI.skin.label)
        {
            fontSize = 26,
            fontStyle = FontStyle.Bold,
        };
        var countStyle = new GUIStyle(GUI.skin.label)
        {
            fontSize = 18,
            alignment = TextAnchor.MiddleRight,
        };
        GUI.Label(
            new Rect(30f, panelY + 10f, 520f, 34f),
            "친구를 골라 정원에 놓아보세요",
            titleStyle);
        GUI.Label(
            new Rect(Screen.width - 520f, panelY + 13f, 300f, 28f),
            "전체 " + sortedGroups.Count + "종 · 표시 "
                + visibleGroups.Count + "종",
            countStyle);
        if (GUI.Button(
                new Rect(Screen.width - 205f, panelY + 9f, 160f, 38f),
                "보관함 접기 ▼",
                new GUIStyle(GUI.skin.button)
                {
                    fontSize = 18,
                    fontStyle = FontStyle.Bold,
                }))
            inventoryExpanded = false;

        string[] filterKeys =
            { "new", "all", "plant", "tree", "bird", "insect", "animal" };
        string[] filterLabels =
            { "NEW", "전체", "식물", "나무", "새", "곤충", "동물" };
        var filterStyle = new GUIStyle(GUI.skin.button)
        {
            fontSize = 17,
            fontStyle = FontStyle.Bold,
        };
        for (int index = 0; index < filterKeys.Length; index++)
        {
            Color previousColor = GUI.color;
            if (inventoryCategoryFilter == filterKeys[index])
                GUI.color = new Color(1f, 0.9f, 0.46f);
            if (GUI.Button(
                    new Rect(
                        30f + (index * 88f),
                        panelY + 50f,
                        80f,
                        38f),
                    filterLabels[index],
                    filterStyle))
            {
                inventoryCategoryFilter = filterKeys[index];
                inventoryScroll = Vector2.zero;
            }
            GUI.color = previousColor;
        }

        const float cardWidth = 520f;
        const float cardHeight = 218f;
        const float cardSpacing = 16f;
        Rect viewport = new Rect(
            24f,
            panelY + 98f,
            panelWidth - 16f,
            232f);
        Rect content = new Rect(
            0f,
            0f,
            Mathf.Max(
                viewport.width - 4f,
                visibleGroups.Count * (cardWidth + cardSpacing)),
            cardHeight);
        inventoryScroll = GUI.BeginScrollView(
            viewport,
            inventoryScroll,
            content,
            true,
            false);
        for (int index = 0; index < visibleGroups.Count; index++)
        {
            List<GardenCreatureData> group = visibleGroups[index];
            int placed = CountPlaced(group);
            GardenCreatureData representative = group[0];
            string modelKey = representative.modelKey ?? string.Empty;
            bool hasModel = CanRenderModelKey(modelKey);
            int available = Mathf.Max(0, group.Count - placed);
            string category = CategoryFor(modelKey);
            float x = index * (cardWidth + cardSpacing);
            Rect card = new Rect(x, 0f, cardWidth, cardHeight);
            bool isNew = group.Exists(
                creature => creature != null
                    && newCreatureIds.Contains(creature.creatureId));

            Color previousBackground = GUI.backgroundColor;
            GUI.backgroundColor = CategoryCardColor(category);
            GUI.Box(card, string.Empty);
            GUI.backgroundColor = previousBackground;

            var iconStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = 38,
                fontStyle = FontStyle.Bold,
                alignment = TextAnchor.MiddleCenter,
            };
            var nameStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = 32,
                fontStyle = FontStyle.Bold,
                alignment = TextAnchor.MiddleLeft,
            };
            Rect photoRect = new Rect(x + 12f, 12f, 150f, 194f);
            GUI.Box(photoRect, string.Empty);
            Texture2D speciesPhoto = GetSpeciesCardTexture(
                representative.speciesId);
            if (speciesPhoto != null)
            {
                GUI.DrawTexture(
                    new Rect(x + 18f, 18f, 138f, 182f),
                    speciesPhoto,
                    ScaleMode.ScaleToFit,
                    true);
            }
            else
            {
                GUI.Label(
                    photoRect,
                    CategoryIcon(category),
                    iconStyle);
            }
            GUI.Label(
                new Rect(x + 180f, 14f, cardWidth - 278f, 46f),
                representative.displayName,
                nameStyle);
            if (isNew)
            {
                float pulse = 0.75f
                    + Mathf.Sin(Time.unscaledTime * 6f) * 0.2f;
                Color previousColor = GUI.color;
                GUI.color = new Color(0.18f, 0.62f, 1f, pulse);
                GUI.Box(
                    new Rect(x + 96f, 20f, 58f, 34f),
                    "NEW",
                    new GUIStyle(GUI.skin.box)
                    {
                        fontSize = 16,
                        fontStyle = FontStyle.Bold,
                        alignment = TextAnchor.MiddleCenter,
                    });
                GUI.color = previousColor;
            }
            GUI.Label(
                new Rect(x + 180f, 64f, cardWidth - 198f, 34f),
                "보유 " + group.Count + " · 정원 " + placed
                    + " · 배치 가능 " + available,
                new GUIStyle(GUI.skin.label)
                {
                    fontSize = 21,
                    fontStyle = FontStyle.Bold,
                    alignment = TextAnchor.MiddleLeft,
                });

            if (!hasModel)
            {
                GUI.enabled = false;
                GUI.Button(
                    new Rect(x + 180f, 112f, cardWidth - 198f, 82f),
                    "3D 모델 준비 중",
                    new GUIStyle(GUI.skin.button)
                    {
                        fontSize = 21,
                        fontStyle = FontStyle.Bold,
                    });
                GUI.enabled = true;
                continue;
            }

            bool canPlace = placed < group.Count;
            bool requiresSlot = assetsByKey.TryGetValue(
                modelKey,
                out GardenAssetData cardAsset)
                && RequiresPlantSlot(cardAsset);
            bool hasPlacementSpace = !requiresSlot || HasFreeSlot();
            Rect dragRect = new Rect(
                x + 180f,
                112f,
                cardWidth - 306f,
                82f);
            GUI.enabled = canPlace && hasPlacementSpace;
            GUI.Box(
                dragRect,
                hasPlacementSpace
                    ? requiresSlot
                        ? "☝  끌어서 배치\n빈 식물 링에 놓으세요"
                        : "☝  자유 배치\n원하는 바닥에 놓으세요"
                    : "공간 가득",
                new GUIStyle(GUI.skin.box)
                {
                    fontSize = 21,
                    fontStyle = FontStyle.Bold,
                    alignment = TextAnchor.MiddleCenter,
                });
            Event guiEvent = Event.current;
            if (GUI.enabled
                && guiEvent.type == EventType.MouseDown
                && guiEvent.button == 0
                && dragRect.Contains(guiEvent.mousePosition))
            {
                BeginInventoryDrag(FindUnplacedCreature(modelKey));
                guiEvent.Use();
            }
            GUI.enabled = placed > 0;
            if (GUI.Button(
                    new Rect(x + cardWidth - 104f, 112f, 86f, 82f),
                    "회수\n" + placed + "마리",
                    new GUIStyle(GUI.skin.button)
                    {
                        fontSize = 19,
                        fontStyle = FontStyle.Bold,
                    }))
                RemoveOne(modelKey);
            GUI.enabled = true;
        }
        GUI.EndScrollView();
    }

    private void DrawCollapsedInventory(int speciesCount)
    {
        const float height = 66f;
        float y = Screen.height - height - 12f;
        GUI.Box(new Rect(16f, y, Screen.width - 32f, height), string.Empty);
        GUI.Label(
            new Rect(34f, y + 10f, 540f, 44f),
            "생태 친구 보관함 · " + speciesCount + "종",
            new GUIStyle(GUI.skin.label)
            {
                fontSize = 24,
                fontStyle = FontStyle.Bold,
                alignment = TextAnchor.MiddleLeft,
            });
        if (GUI.Button(
                new Rect(Screen.width - 210f, y + 10f, 165f, 44f),
                "보관함 펼치기 ▲",
                new GUIStyle(GUI.skin.button)
                {
                    fontSize = 18,
                    fontStyle = FontStyle.Bold,
                }))
            inventoryExpanded = true;
    }

    private Texture2D GetSpeciesCardTexture(string speciesId)
    {
        string key = (speciesId ?? string.Empty)
            .Replace("taxon-", string.Empty)
            .Replace("_", "-")
            .ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(key))
            return null;

        // 앱 종 사진에서 파일명이 다른 옻나무만 명시적으로 연결한다.
        if (key == "lacquer-tree")
            key = "toxicodendron-vernicifluum";

        if (speciesCardTextures.TryGetValue(key, out Texture2D cached))
            return cached;

        Texture2D texture = Resources.Load<Texture2D>(
            "SpeciesCards/" + key);
        speciesCardTextures[key] = texture;
        return texture;
    }

    private bool CanRenderModelKey(string modelKey)
    {
        return !string.IsNullOrWhiteSpace(modelKey)
            && (assetsByKey.ContainsKey(modelKey)
                || modelKey == "large-billed-crow"
                || modelKey == "rhinoceros-beetle");
    }

    private static bool RequiresPlantSlot(GardenAssetData asset)
    {
        return asset != null
            && (asset.category == "plant" || asset.category == "tree");
    }

    private string CategoryPrefix(string modelKey)
    {
        string category = CategoryFor(modelKey);
        return string.IsNullOrWhiteSpace(category)
            ? string.Empty
            : "[" + CategoryLabel(category) + "] ";
    }

    private string CategoryFor(string modelKey)
    {
        return assetsByKey.TryGetValue(
            modelKey ?? string.Empty,
            out GardenAssetData asset)
            ? asset.category
            : string.Empty;
    }

    private static string CategoryLabel(string category)
    {
        switch (category)
        {
            case "plant": return "식물";
            case "tree": return "나무";
            case "bird": return "새";
            case "insect": return "곤충";
            case "animal": return "동물";
            default: return "미연결";
        }
    }

    private static string CategoryIcon(string category)
    {
        switch (category)
        {
            case "plant": return "식";
            case "tree": return "나";
            case "bird": return "새";
            case "insect": return "곤";
            case "animal": return "동";
            default: return "?";
        }
    }

    private static int CategorySortOrder(string category)
    {
        switch (category)
        {
            case "plant": return 0;
            case "tree": return 1;
            case "bird": return 2;
            case "insect": return 3;
            case "animal": return 4;
            default: return 5;
        }
    }

    private static Color CategoryCardColor(string category)
    {
        switch (category)
        {
            case "plant": return new Color(0.68f, 0.86f, 0.58f);
            case "tree": return new Color(0.72f, 0.65f, 0.47f);
            case "bird": return new Color(0.62f, 0.78f, 0.94f);
            case "insect": return new Color(0.96f, 0.78f, 0.42f);
            case "animal": return new Color(0.86f, 0.68f, 0.82f);
            default: return new Color(0.68f, 0.68f, 0.68f);
        }
    }

    private int CountPlaced(List<GardenCreatureData> group)
    {
        if (bootstrap.placements == null)
            return 0;
        var ids = new HashSet<string>();
        foreach (GardenCreatureData creature in group)
            ids.Add(creature.creatureId);
        int count = 0;
        foreach (GardenPlacementData placement in bootstrap.placements)
        {
            if (placement != null && ids.Contains(placement.creatureId))
                count++;
        }
        return count;
    }

    private bool HasFreeSlot()
    {
        if (bootstrap?.placements == null)
            return true;
        for (int row = 0; row < SlotRows; row++)
        {
            for (int col = 0; col < SlotColumns; col++)
            {
                if (!IsSlotOccupied(row, col))
                    return true;
            }
        }
        return false;
    }

    private int CountOccupiedPlantSlots()
    {
        if (bootstrap?.placements == null)
            return 0;

        int count = 0;
        foreach (GardenPlacementData placement in bootstrap.placements)
        {
            if (placement != null
                && !string.Equals(
                    placement.placementMode,
                    "free",
                    StringComparison.OrdinalIgnoreCase))
                count++;
        }
        return count;
    }

    private void PlaceOne(string modelKey)
    {
        var placedIds = new HashSet<string>();
        var occupied = new HashSet<string>();
        foreach (GardenPlacementData placement in bootstrap.placements
            ?? Array.Empty<GardenPlacementData>())
        {
            placedIds.Add(placement.creatureId);
            occupied.Add(placement.row + ":" + placement.col);
        }

        GardenCreatureData candidate = null;
        foreach (GardenCreatureData creature in bootstrap.creatures)
        {
            if (creature.modelKey == modelKey && !placedIds.Contains(creature.creatureId))
            {
                candidate = creature;
                break;
            }
        }
        if (candidate == null)
            return;

        for (int row = 0; row < SlotRows; row++)
        {
            for (int col = 0; col < SlotColumns; col++)
            {
                if (occupied.Contains(row + ":" + col))
                    continue;
                PlaceCreatureAtSlot(candidate, row, col);
                return;
            }
        }
    }

    private void RemoveOne(string modelKey)
    {
        var modelCreatureIds = new HashSet<string>();
        foreach (GardenCreatureData creature in bootstrap.creatures)
        {
            if (creature.modelKey == modelKey)
                modelCreatureIds.Add(creature.creatureId);
        }

        var placements = new List<GardenPlacementData>(
            bootstrap.placements ?? Array.Empty<GardenPlacementData>());
        for (int index = placements.Count - 1; index >= 0; index--)
        {
            if (!modelCreatureIds.Contains(placements[index].creatureId))
                continue;
            string name = creaturesById.TryGetValue(
                placements[index].creatureId,
                out GardenCreatureData creature)
                ? creature.displayName
                : "생태 친구";
            placements.RemoveAt(index);
            bootstrap.placements = placements.ToArray();
            targetPlacementCount = placements.Count;
            PersistAndRebuild(name + "을(를) 보관함으로 돌려보냈습니다.");
            return;
        }
    }

    private void PersistAndRebuild(string message)
    {
        string localSavePath = Path.Combine(
            Application.persistentDataPath,
            "pc-garden-layout.json");
        File.WriteAllText(localSavePath, JsonUtility.ToJson(bootstrap, true));
        RebuildCreatures();
        status = message;

        if (apiClient != null && apiClient.IsConfigured)
        {
            StartCoroutine(apiClient.SaveLayout(
                bootstrap,
                () => status = message + " · 서버 저장 완료",
                error =>
                {
                    status = message + " · 서버 저장 재시도 필요";
                    Debug.LogWarning("PC 홈가든 서버 저장 실패: " + error);
                }));
        }
    }

    private void BeginLogin()
    {
        if (loginInProgress)
            return;
        if (string.IsNullOrWhiteSpace(loginServerUrl)
            || string.IsNullOrWhiteSpace(loginEmail)
            || string.IsNullOrWhiteSpace(loginPassword))
        {
            loginMessage = "서버 주소, 이메일, 비밀번호를 모두 입력해 주세요.";
            return;
        }
        StartCoroutine(LoginAndLoadGarden());
    }

    private IEnumerator LoginAndLoadGarden()
    {
        loginInProgress = true;
        loginMessage = "DB 계정에 로그인하는 중입니다.";
        string token = null;
        string error = null;
        yield return apiClient.Login(
            loginServerUrl,
            loginEmail,
            loginPassword,
            value => token = value,
            value => error = value);

        if (string.IsNullOrWhiteSpace(token))
        {
            loginMessage = error ?? "로그인하지 못했습니다.";
            loginInProgress = false;
            yield break;
        }

        apiClient.Configure(loginServerUrl, token);
        loginMessage = "수집 동식물을 불러오는 중입니다.";
        string json = null;
        yield return apiClient.LoadBootstrap(
            value => json = value,
            value => error = value);
        if (string.IsNullOrWhiteSpace(json))
        {
            loginMessage = "정원 데이터를 불러오지 못했습니다: " + error;
            loginInProgress = false;
            yield break;
        }

        InitializeGarden(json);
        showLogin = false;
        loginPassword = string.Empty;
        loginInProgress = false;
        status = bootstrap.displayName + "님의 DB 정원 · "
            + bootstrap.creatures.Length + "마리 보유";
    }

    private void DrawLoginWindow()
    {
        const float width = 470f;
        const float height = 300f;
        float x = (Screen.width - width) * 0.5f;
        float y = (Screen.height - height) * 0.5f;
        GUI.Box(new Rect(x, y, width, height), string.Empty);
        GUI.Label(new Rect(x + 24f, y + 20f, width - 48f, 28f), "실제 DB 홈가든 연결");
        GUI.Label(new Rect(x + 24f, y + 55f, 100f, 24f), "서버 주소");
        loginServerUrl = GUI.TextField(
            new Rect(x + 125f, y + 52f, 315f, 28f),
            loginServerUrl);
        GUI.Label(new Rect(x + 24f, y + 94f, 100f, 24f), "이메일");
        loginEmail = GUI.TextField(
            new Rect(x + 125f, y + 91f, 315f, 28f),
            loginEmail);
        GUI.Label(new Rect(x + 24f, y + 133f, 100f, 24f), "비밀번호");
        loginPassword = GUI.PasswordField(
            new Rect(x + 125f, y + 130f, 315f, 28f),
            loginPassword,
            '●');
        GUI.Label(new Rect(x + 24f, y + 171f, width - 48f, 48f), loginMessage);

        GUI.enabled = !loginInProgress;
        if (GUI.Button(new Rect(x + 125f, y + 228f, 150f, 42f), "로그인하고 불러오기"))
            BeginLogin();
        GUI.enabled = true;
        if (GUI.Button(new Rect(x + 290f, y + 228f, 150f, 42f), "닫기"))
            showLogin = false;
    }

    private static int StableHash(string value)
    {
        unchecked
        {
            int hash = 17;
            foreach (char character in value ?? string.Empty)
                hash = hash * 31 + character;
            return Mathf.Abs(hash);
        }
    }

    private static void MarkStatic(GameObject root)
    {
        foreach (Transform child in root.GetComponentsInChildren<Transform>(true))
            child.gameObject.isStatic = true;
    }

    private static void TuneGreenhouseMaterials(GameObject greenhouse)
    {
        var tunedMaterials = new Dictionary<Material, Material>();
        foreach (Renderer renderer in greenhouse.GetComponentsInChildren<Renderer>(true))
        {
            Material[] materials = renderer.sharedMaterials;
            for (int index = 0; index < materials.Length; index++)
            {
                Material source = materials[index];
                if (source == null)
                    continue;

                if (!tunedMaterials.TryGetValue(source, out Material tuned))
                {
                    tuned = new Material(source)
                    {
                        name = source.name + " · PC 홈가든 선명도 보정",
                    };
                    if (tuned.HasProperty("baseColorFactor"))
                        tuned.SetColor(
                            "baseColorFactor",
                            new Color(1.25f, 1.25f, 1.22f, 1f));
                    if (tuned.HasProperty("metallicFactor"))
                        tuned.SetFloat("metallicFactor", 0.08f);
                    if (tuned.HasProperty("roughnessFactor"))
                        tuned.SetFloat("roughnessFactor", 0.68f);
                    if (tuned.HasProperty("_CullMode"))
                        tuned.SetFloat("_CullMode", 0f);
                    tunedMaterials[source] = tuned;
                }

                materials[index] = tuned;
            }
            renderer.sharedMaterials = materials;
        }
    }

    private void SearchAndFollowCreature()
    {
        string query = (creatureSearchQuery ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(query))
        {
            status = "검색할 동물 이름을 입력해 주세요.";
            return;
        }

        var matches = new List<PCGardenCreatureView>();
        foreach (PCGardenCreatureView view in spawnedCreatures)
        {
            if (view == null
                || !view.gameObject.activeInHierarchy
                || string.IsNullOrWhiteSpace(view.displayName))
                continue;
            if (view.displayName.IndexOf(
                    query,
                    StringComparison.CurrentCultureIgnoreCase) >= 0)
                matches.Add(view);
        }
        matches.Sort((left, right) =>
        {
            bool leftExact = string.Equals(
                left.displayName,
                query,
                StringComparison.CurrentCultureIgnoreCase);
            bool rightExact = string.Equals(
                right.displayName,
                query,
                StringComparison.CurrentCultureIgnoreCase);
            if (leftExact != rightExact)
                return leftExact ? -1 : 1;
            int nameComparison = string.Compare(
                left.displayName,
                right.displayName,
                StringComparison.CurrentCulture);
            return nameComparison != 0
                ? nameComparison
                : string.Compare(
                    left.creatureId,
                    right.creatureId,
                    StringComparison.Ordinal);
        });

        if (matches.Count == 0)
        {
            bool ownedButNotPlaced = false;
            foreach (GardenCreatureData creature in
                bootstrap?.creatures ?? Array.Empty<GardenCreatureData>())
            {
                if (creature != null
                    && !string.IsNullOrWhiteSpace(creature.displayName)
                    && creature.displayName.IndexOf(
                        query,
                        StringComparison.CurrentCultureIgnoreCase) >= 0)
                {
                    ownedButNotPlaced = true;
                    break;
                }
            }
            status = ownedButNotPlaced
                ? query + "은(는) 보유 중이지만 현재 정원에 배치되지 않았습니다."
                : query + " 이름과 일치하는 동물을 찾지 못했습니다.";
            return;
        }

        bool continuingSameSearch = string.Equals(
            query,
            lastCreatureSearchQuery,
            StringComparison.CurrentCultureIgnoreCase);
        creatureSearchIndex = continuingSameSearch
            ? (creatureSearchIndex + 1) % matches.Count
            : 0;
        lastCreatureSearchQuery = query;

        PCGardenCreatureView selected = matches[creatureSearchIndex];
        showCreatureLabels = true;
        if (orbitCamera != null)
            orbitCamera.FocusAndFollow(selected);
        status = selected.displayName + " 검색 완료 · "
            + (creatureSearchIndex + 1) + "/" + matches.Count
            + " · 움직임을 계속 추적합니다. ESC로 전체 보기";
    }

    private void DrawHeroHeader()
    {
        int owned = bootstrap?.creatures?.Length ?? 0;
        int placed = Mathf.Clamp(
            Mathf.RoundToInt(animatedPlacementCount),
            0,
            Mathf.Max(owned, SlotCapacity));
        int actualPlaced = bootstrap?.placements?.Length ?? 0;
        int emptySlots = Mathf.Max(0, SlotCapacity - CountOccupiedPlantSlots());
        const float margin = 16f;
        const float height = 128f;
        float width = Screen.width - margin * 2f;
        GUI.Box(new Rect(margin, 14f, width, height), string.Empty);

        var numberStyle = new GUIStyle(GUI.skin.label)
        {
            fontSize = 42,
            fontStyle = FontStyle.Bold,
            alignment = TextAnchor.MiddleLeft,
        };
        var summaryStyle = new GUIStyle(GUI.skin.label)
        {
            fontSize = 22,
            fontStyle = FontStyle.Bold,
            alignment = TextAnchor.MiddleLeft,
        };
        var statusStyle = new GUIStyle(GUI.skin.label)
        {
            fontSize = 16,
            alignment = TextAnchor.MiddleLeft,
        };
        GUI.Label(new Rect(34f, 22f, 92f, 52f), placed.ToString(), numberStyle);
        GUI.Label(
            new Rect(116f, 30f, 350f, 40f),
            "/ " + owned + "마리 보유",
            summaryStyle);

        float elapsed = Time.unscaledTime - successFeedbackStartedAt;
        if (elapsed >= 0f && elapsed < 1.45f)
        {
            Color previous = GUI.color;
            GUI.color = new Color(0.2f, 1f, 0.35f, 1f - elapsed / 1.45f);
            GUI.Box(new Rect(410f, 28f, 62f, 38f), "+1");
            GUI.color = previous;
        }

        float progress = owned > 0
            ? Mathf.Clamp01(actualPlaced / (float)owned)
            : 0f;
        Rect progressBackground = new Rect(
            34f,
            78f,
            Mathf.Max(240f, Screen.width - 545f),
            20f);
        Color previousBackground = GUI.color;
        GUI.color = new Color(0.06f, 0.07f, 0.06f, 0.92f);
        GUI.DrawTexture(progressBackground, Texture2D.whiteTexture);
        GUI.color = new Color(0.12f, 0.8f, 0.25f, 0.95f);
        GUI.DrawTexture(
            new Rect(
                progressBackground.x,
                progressBackground.y,
                progressBackground.width * progress,
                progressBackground.height),
            Texture2D.whiteTexture);
        GUI.color = previousBackground;

        GUI.Label(
            new Rect(34f, 103f, Screen.width - 560f, 26f),
            status + "  ·  빈 식물 슬롯 " + emptySlots,
            statusStyle);

        float controlsX = Screen.width - 492f;
        string connectionLabel = apiClient != null && apiClient.IsConfigured
            ? "DB 다시 연결"
            : "실제 DB 연결";
        if (GUI.Button(new Rect(controlsX, 28f, 112f, 38f), connectionLabel))
        {
            loginMessage = "모바일 앱에서 사용하는 계정으로 로그인하세요.";
            showLogin = true;
        }
        if (GUI.Button(new Rect(controlsX + 120f, 28f, 104f, 38f), "전체 보기")
            && orbitCamera != null)
            orbitCamera.ShowOverview();

        string labelToggle = showCreatureLabels ? "이름 끄기" : "이름 켜기";
        if (GUI.Button(
                new Rect(controlsX + 232f, 28f, 104f, 38f),
                labelToggle))
            showCreatureLabels = !showCreatureLabels;

        if (GUI.Button(new Rect(controlsX + 344f, 28f, 104f, 38f), "종료"))
        {
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
#else
            Application.Quit();
#endif
        }

        const string searchControlName = "PCGardenCreatureNameSearch";
        Rect searchFieldRect = new Rect(controlsX, 74f, 270f, 30f);
        GUI.SetNextControlName(searchControlName);
        creatureSearchQuery = GUI.TextField(
            searchFieldRect,
            creatureSearchQuery ?? string.Empty,
            new GUIStyle(GUI.skin.textField)
            {
                fontSize = 17,
                alignment = TextAnchor.MiddleLeft,
            });
        if (string.IsNullOrEmpty(creatureSearchQuery)
            && GUI.GetNameOfFocusedControl() != searchControlName)
        {
            GUI.Label(
                new Rect(
                    searchFieldRect.x + 8f,
                    searchFieldRect.y + 3f,
                    searchFieldRect.width - 16f,
                    searchFieldRect.height - 4f),
                "동물 이름 입력",
                new GUIStyle(GUI.skin.label)
                {
                    fontSize = 16,
                    normal = { textColor = new Color(0.68f, 0.68f, 0.68f) },
                });
        }
        bool searchClicked = GUI.Button(
            new Rect(controlsX + 278f, 74f, 170f, 30f),
            "검색 · 줌인 · 추적",
            new GUIStyle(GUI.skin.button)
            {
                fontSize = 15,
                fontStyle = FontStyle.Bold,
            });
        bool enterPressed = Event.current.type == EventType.KeyDown
            && (Event.current.keyCode == KeyCode.Return
                || Event.current.keyCode == KeyCode.KeypadEnter)
            && GUI.GetNameOfFocusedControl() == searchControlName;
        if (searchClicked || enterPressed)
        {
            SearchAndFollowCreature();
            if (enterPressed)
                Event.current.Use();
        }
        string selectedText = orbitCamera != null && orbitCamera.Selected != null
            ? orbitCamera.Selected.displayName + " · 친밀도 "
                + orbitCamera.Selected.bond + "/5"
            : "친구를 클릭하면 가까이 관찰합니다.";
        GUI.Label(
            new Rect(controlsX, 103f, 448f, 24f),
            selectedText + " · FPS " + smoothedFps.ToString("F0"),
            new GUIStyle(GUI.skin.label)
            {
                fontSize = 15,
                alignment = TextAnchor.MiddleRight,
            });
    }

    private void DrawPlacementSuccessOverlay()
    {
        float elapsed = Time.unscaledTime - successFeedbackStartedAt;
        if (elapsed < 0f || elapsed >= 1.5f)
            return;

        float fade = Mathf.Clamp01(
            Mathf.Min(elapsed / 0.18f, (1.5f - elapsed) / 0.28f));
        float lift = Mathf.Lerp(18f, -12f, elapsed / 1.5f);
        Rect popup = new Rect(
            Screen.width * 0.5f - 190f,
            Screen.height * 0.28f + lift,
            380f,
            76f);
        Color previous = GUI.color;
        GUI.color = new Color(0.2f, 1f, 0.35f, fade);
        GUI.Box(popup, "✓  " + successFeedbackName + " 배치 완료");
        GUI.color = previous;
    }

    private void DrawNewDockAnimation()
    {
        float elapsed = Time.unscaledTime - newDockAnimationStartedAt;
        const float duration = 1.3f;
        if (elapsed < 0f || elapsed >= duration
            || string.IsNullOrWhiteSpace(newDockAnimationName))
            return;

        float t = Mathf.SmoothStep(0f, 1f, elapsed / duration);
        Rect start = new Rect(
            Screen.width * 0.5f - 165f,
            Screen.height * 0.38f,
            330f,
            126f);
        Rect end = new Rect(36f, Screen.height - 238f, 316f, 126f);
        Rect card = new Rect(
            Mathf.Lerp(start.x, end.x, t),
            Mathf.Lerp(start.y, end.y, t),
            Mathf.Lerp(start.width, end.width, t),
            Mathf.Lerp(start.height, end.height, t));
        Color previous = GUI.color;
        GUI.color = new Color(0.45f, 0.8f, 1f, 1f);
        GUI.Box(card, "NEW\n" + newDockAnimationName);
        GUI.color = previous;
    }

    private void OnGUI()
    {
        DrawHeroHeader();

        if (showCreatureLabels)
            DrawCreatureButtons();
        DrawInventoryPanel();
        DrawPlacementSuccessOverlay();
        DrawNewDockAnimation();

        if (showLogin)
            DrawLoginWindow();
    }

    private void DrawCreatureButtons()
    {
        Camera camera = orbitCamera != null ? orbitCamera.targetCamera : Camera.main;
        if (camera == null)
            return;

        const float width = 170f;
        const float height = 30f;
        float inventoryTop = Mathf.Max(
            154f,
            Screen.height - InventoryUiHeight);
        float maximumLabelY = Mathf.Max(165f, inventoryTop - height - 8f);
        var candidates = new List<CreatureLabelCandidate>();
        foreach (PCGardenCreatureView view in spawnedCreatures)
        {
            if (view == null || !view.gameObject.activeInHierarchy)
                continue;

            Bounds bounds = view.CalculateWorldBounds();
            Vector3 labelPoint = bounds.center + Vector3.up * (bounds.extents.y + 0.65f);
            Vector3 screenPoint = camera.WorldToScreenPoint(labelPoint);
            if (screenPoint.z <= 0f)
                continue;

            float x = Mathf.Clamp(screenPoint.x - width * 0.5f, 8f, Screen.width - width - 8f);
            float rawY = Screen.height - screenPoint.y - height;
            if (rawY > maximumLabelY)
                continue;
            float y = Mathf.Clamp(rawY, 165f, maximumLabelY);
            candidates.Add(new CreatureLabelCandidate
            {
                view = view,
                desiredRect = new Rect(x, y, width, height),
                depth = screenPoint.z,
            });
        }

        candidates.Sort((left, right) =>
        {
            bool leftSelected = orbitCamera != null
                && orbitCamera.Selected == left.view;
            bool rightSelected = orbitCamera != null
                && orbitCamera.Selected == right.view;
            if (leftSelected != rightSelected)
                return leftSelected ? -1 : 1;
            return left.depth.CompareTo(right.depth);
        });

        var occupied = new List<Rect>();
        foreach (CreatureLabelCandidate candidate in candidates)
        {
            if (!TryFindNonOverlappingLabelRect(
                    candidate.desiredRect,
                    occupied,
                    maximumLabelY,
                    out Rect labelRect))
                continue;
            occupied.Add(labelRect);

            bool isSelected = orbitCamera != null
                && orbitCamera.Selected == candidate.view;
            Color previousColor = GUI.color;
            if (isSelected)
                GUI.color = new Color(1f, 0.87f, 0.42f);

            string prefix = isSelected ? "● " : string.Empty;
            if (GUI.Button(
                    labelRect,
                    prefix + candidate.view.displayName + " · 친밀도 "
                        + candidate.view.bond))
                orbitCamera.Focus(candidate.view);

            GUI.color = previousColor;
        }
    }

    private static bool TryFindNonOverlappingLabelRect(
        Rect desired,
        List<Rect> occupied,
        float maximumY,
        out Rect result)
    {
        const float gap = 4f;
        for (int ring = 0; ring <= 9; ring++)
        {
            int[] directions = ring == 0 ? new[] { 0 } : new[] { -1, 1 };
            foreach (int direction in directions)
            {
                float y = Mathf.Clamp(
                    desired.y + direction * ring * (desired.height + gap),
                    165f,
                    maximumY);
                Rect candidate = new Rect(desired.x, y, desired.width, desired.height);
                bool overlaps = false;
                foreach (Rect used in occupied)
                {
                    if (candidate.Overlaps(used))
                    {
                        overlaps = true;
                        break;
                    }
                }
                if (!overlaps)
                {
                    result = candidate;
                    return true;
                }
            }
        }

        result = default;
        return false;
    }

    private sealed class CreatureLabelCandidate
    {
        public PCGardenCreatureView view;
        public Rect desiredRect;
        public float depth;
    }

    private static void ConfigureVisualQuality()
    {
        string[] qualityNames = QualitySettings.names;
        if (qualityNames.Length > 0)
            QualitySettings.SetQualityLevel(qualityNames.Length - 1, true);

        QualitySettings.vSyncCount = 1;
        QualitySettings.antiAliasing = 8;
        QualitySettings.anisotropicFiltering = AnisotropicFiltering.ForceEnable;
        QualitySettings.globalTextureMipmapLimit = 0;
        QualitySettings.lodBias = 2f;
        QualitySettings.shadowResolution = ShadowResolution.VeryHigh;
        QualitySettings.shadowCascades = 4;
        QualitySettings.shadowDistance = 150f;
    }
}
