using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

public static class PCGardenSceneBuilder
{
    public const string ScenePath = "Assets/Scenes/GreenhouseGarden.unity";
    public const string BuildFolder = "Builds/Windows/NatureGoGarden";
    public const string ExecutablePath = BuildFolder + "/NatureGoGarden.exe";

    [MenuItem("Nature Go/PC Garden/Rebuild Greenhouse Garden Scene")]
    public static void RebuildScene()
    {
        Scene scene = EditorSceneManager.NewScene(
            NewSceneSetup.EmptyScene,
            NewSceneMode.Single);

        GameObject cameraObject = new GameObject("Main Camera");
        Camera camera = cameraObject.AddComponent<Camera>();
        cameraObject.tag = "MainCamera";
        camera.clearFlags = CameraClearFlags.SolidColor;
        camera.backgroundColor = new Color(0.105f, 0.115f, 0.125f);
        camera.fieldOfView = 50f;
        camera.nearClipPlane = 0.05f;
        camera.farClipPlane = 300f;
        camera.allowHDR = true;
        camera.allowMSAA = true;
        cameraObject.AddComponent<AudioListener>();

        PCGardenOrbitCamera orbit = cameraObject.AddComponent<PCGardenOrbitCamera>();
        orbit.targetCamera = camera;
        orbit.overviewTarget = new Vector3(0f, 30f, 17f);
        orbit.overviewDistance = 94f;
        orbit.overviewYaw = 0f;

        GameObject lightObject = new GameObject("Directional Light");
        Light light = lightObject.AddComponent<Light>();
        light.type = LightType.Directional;
        light.transform.rotation = Quaternion.Euler(48f, 152f, 0f);
        light.color = new Color(1f, 0.97f, 0.9f);
        light.intensity = 1.35f;
        light.shadows = LightShadows.Soft;
        light.shadowStrength = 0.35f;

        GameObject controllerObject = new GameObject("PC Garden Controller");
        PCGardenController controller = controllerObject.AddComponent<PCGardenController>();
        controller.orbitCamera = orbit;
        controller.greenhousePrefab = LoadRequiredPrefab(
            "Assets/Resources/Models/Environment/DollhouseGreenhouse.glb");
        controller.largeBilledCrowPrefab = LoadRequiredPrefab(
            "Assets/Resources/Models/Birds/LargeBilledCrow.glb");
        controller.rhinocerosBeetlePrefab = LoadRequiredPrefab(
            "Assets/Models/RhinocerosBeetle/RhinocerosBeetle.glb");

        Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
        EditorSceneManager.SaveScene(scene, ScenePath);

        EditorBuildSettings.scenes = new[]
        {
            new EditorBuildSettingsScene(ScenePath, true),
        };

        PlayerSettings.companyName = "Nature Go";
        PlayerSettings.productName = "Nature Go Garden";
        PlayerSettings.bundleVersion = "0.1.0";
        PlayerSettings.defaultScreenWidth = 1920;
        PlayerSettings.defaultScreenHeight = 1080;
        PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
        PlayerSettings.resizableWindow = true;
        PlayerSettings.runInBackground = true;
        AssetDatabase.SaveAssets();

        Selection.activeGameObject = controllerObject;
        Debug.Log("[PC Garden] 장면 생성 완료: " + ScenePath);
    }

    [MenuItem("Nature Go/PC Garden/Build Windows Development")]
    public static void BuildWindowsDevelopment()
    {
        if (!File.Exists(ScenePath))
            RebuildScene();

        Directory.CreateDirectory(BuildFolder);
        BuildPlayerOptions options = new BuildPlayerOptions
        {
            scenes = new[] { ScenePath },
            locationPathName = ExecutablePath,
            target = BuildTarget.StandaloneWindows64,
            options = BuildOptions.Development
                | BuildOptions.AllowDebugging
                | BuildOptions.CompressWithLz4HC,
        };

        BuildReport report = BuildPipeline.BuildPlayer(options);
        BuildSummary summary = report.summary;
        if (summary.result != BuildResult.Succeeded)
            throw new BuildFailedException(
                "PC 홈가든 Windows 빌드 실패: " + summary.result);

        Debug.Log(
            "[PC Garden] Windows 빌드 완료: " + ExecutablePath
            + " · " + (summary.totalSize / (1024f * 1024f)).ToString("F1") + " MB"
            + " · " + summary.totalTime);
    }

    private static GameObject LoadRequiredPrefab(string path)
    {
        GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
        if (prefab == null)
            throw new FileNotFoundException("필수 모델을 찾을 수 없습니다.", path);
        return prefab;
    }
}
