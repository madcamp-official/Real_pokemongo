using System;
using System.Collections;
using System.Globalization;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

public sealed class PCGardenApiClient : MonoBehaviour
{
    public string ApiBaseUrl { get; private set; }
    public string AuthToken { get; private set; }
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(ApiBaseUrl)
        && !string.IsNullOrWhiteSpace(AuthToken);

    public void ConfigureFromEnvironment()
    {
        ApiBaseUrl = FirstNonEmpty(
            Environment.GetEnvironmentVariable("NATURE_GO_API_URL"),
            PlayerPrefs.GetString("nature-go-api-url", string.Empty));
        AuthToken = FirstNonEmpty(
            Environment.GetEnvironmentVariable("NATURE_GO_AUTH_TOKEN"),
            PlayerPrefs.GetString("nature-go-auth-token", string.Empty));
        if (!string.IsNullOrWhiteSpace(ApiBaseUrl))
            ApiBaseUrl = ApiBaseUrl.TrimEnd('/');
    }

    public void Configure(string apiBaseUrl, string authToken)
    {
        ApiBaseUrl = (apiBaseUrl ?? string.Empty).Trim().TrimEnd('/');
        AuthToken = (authToken ?? string.Empty).Trim();
        PlayerPrefs.SetString("nature-go-api-url", ApiBaseUrl);
        PlayerPrefs.Save();
    }

    public IEnumerator Login(
        string apiBaseUrl,
        string email,
        string password,
        Action<string> onSuccess,
        Action<string> onFailure)
    {
        string endpoint = (apiBaseUrl ?? string.Empty).Trim().TrimEnd('/');
        string payload = "{\"email\":\"" + Escape(email)
            + "\",\"password\":\"" + Escape(password) + "\"}";
        using UnityWebRequest request = new UnityWebRequest(
            endpoint + "/auth/login",
            UnityWebRequest.kHttpVerbPOST);
        request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(payload));
        request.downloadHandler = new DownloadHandlerBuffer();
        request.SetRequestHeader("Content-Type", "application/json");
        request.timeout = 12;
        yield return request.SendWebRequest();

        if (request.result != UnityWebRequest.Result.Success)
        {
            onFailure?.Invoke(
                request.responseCode == 401
                    ? "이메일 또는 비밀번호가 올바르지 않습니다."
                    : "서버에 연결하지 못했습니다: " + request.error);
            yield break;
        }

        LoginResponse response = JsonUtility.FromJson<LoginResponse>(
            request.downloadHandler.text);
        if (response == null || string.IsNullOrWhiteSpace(response.access_token))
        {
            onFailure?.Invoke("로그인 응답에 인증 토큰이 없습니다.");
            yield break;
        }
        onSuccess?.Invoke(response.access_token);
    }

    public IEnumerator LoadBootstrap(Action<string> onSuccess, Action<string> onFailure)
    {
        using UnityWebRequest request = UnityWebRequest.Get(ApiBaseUrl + "/garden/bootstrap");
        request.SetRequestHeader("Authorization", "Bearer " + AuthToken);
        request.timeout = 12;
        yield return request.SendWebRequest();

        if (request.result == UnityWebRequest.Result.Success)
            onSuccess?.Invoke(request.downloadHandler.text);
        else
            onFailure?.Invoke(request.error);
    }

    public IEnumerator SaveLayout(
        GardenBootstrapData data,
        Action onSuccess,
        Action<string> onFailure)
    {
        string json = BuildLayoutJson(data);
        using UnityWebRequest request = new UnityWebRequest(
            ApiBaseUrl + "/garden/layout",
            UnityWebRequest.kHttpVerbPUT);
        request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json));
        request.downloadHandler = new DownloadHandlerBuffer();
        request.SetRequestHeader("Content-Type", "application/json");
        request.SetRequestHeader("Authorization", "Bearer " + AuthToken);
        request.timeout = 12;
        yield return request.SendWebRequest();

        if (request.result == UnityWebRequest.Result.Success)
            onSuccess?.Invoke();
        else
            onFailure?.Invoke(request.error);
    }

    private static string BuildLayoutJson(GardenBootstrapData data)
    {
        var builder = new StringBuilder("{\"tiles\":[");
        GardenTileData[] tiles = data.tiles ?? Array.Empty<GardenTileData>();
        for (int index = 0; index < tiles.Length; index++)
        {
            if (index > 0)
                builder.Append(',');
            GardenTileData tile = tiles[index];
            builder.Append("{\"row\":").Append(tile.row)
                .Append(",\"col\":").Append(tile.col)
                .Append(",\"type\":\"").Append(Escape(tile.type)).Append("\"}");
        }

        builder.Append("],\"placements\":[");
        GardenPlacementData[] placements =
            data.placements ?? Array.Empty<GardenPlacementData>();
        for (int index = 0; index < placements.Length; index++)
        {
            if (index > 0)
                builder.Append(',');
            GardenPlacementData placement = placements[index];
            builder.Append("{\"creature_id\":\"")
                .Append(Escape(placement.creatureId))
                .Append("\",\"placement_mode\":\"")
                .Append(placement.placementMode == "free" ? "free" : "slot")
                .Append('"');
            if (placement.placementMode == "free")
            {
                builder.Append(",\"world_x\":")
                    .Append(placement.worldX.ToString(
                        "R",
                        CultureInfo.InvariantCulture))
                    .Append(",\"world_y\":")
                    .Append(placement.worldY.ToString(
                        "R",
                        CultureInfo.InvariantCulture))
                    .Append(",\"world_z\":")
                    .Append(placement.worldZ.ToString(
                        "R",
                        CultureInfo.InvariantCulture));
            }
            else
            {
                builder.Append(",\"row\":").Append(placement.row)
                    .Append(",\"col\":").Append(placement.col);
            }
            builder.Append('}');
        }
        return builder.Append("]}").ToString();
    }

    private static string Escape(string value)
    {
        return (value ?? string.Empty)
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"");
    }

    private static string FirstNonEmpty(params string[] values)
    {
        foreach (string value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
                return value.Trim();
        }
        return string.Empty;
    }

    [Serializable]
    private sealed class LoginResponse
    {
        public string access_token;
    }
}
