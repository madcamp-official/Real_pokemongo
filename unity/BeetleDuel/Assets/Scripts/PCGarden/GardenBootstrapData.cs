using System;

[Serializable]
public sealed class GardenBootstrapData
{
    public int schemaVersion = 2;
    public string userId = "mock-user";
    public string displayName = "Nature Go 탐험가";
    public GardenAssetData[] assets = Array.Empty<GardenAssetData>();
    public GardenCreatureData[] creatures = Array.Empty<GardenCreatureData>();
    public GardenPlacementData[] placements = Array.Empty<GardenPlacementData>();
    public GardenTileData[] tiles = Array.Empty<GardenTileData>();
    public GardenInventoryData[] inventory = Array.Empty<GardenInventoryData>();
}

[Serializable]
public sealed class GardenAssetData
{
    public string assetKey;
    public string speciesId;
    public string displayName;
    public string category;
    public string resourcePath;
    public string behaviourProfile;
    public float displayScale = 1f;
    public float minimumAltitude;
}

[Serializable]
public sealed class GardenCreatureData
{
    public string creatureId;
    public string speciesId;
    public string displayName;
    public string modelKey;
    public int bond = 1;
    public string capturedAt;
}

[Serializable]
public sealed class GardenPlacementData
{
    public string creatureId;
    public int row;
    public int col;
    public string placementMode = "slot";
    public float worldX;
    public float worldY = 3.90f;
    public float worldZ;
}

[Serializable]
public sealed class GardenTileData
{
    public int row;
    public int col;
    public string type = "잔디";
}

[Serializable]
public sealed class GardenInventoryData
{
    public string speciesId;
    public string displayName;
    public string modelKey;
    public int ownedCount;
    public int placedCount;
}
