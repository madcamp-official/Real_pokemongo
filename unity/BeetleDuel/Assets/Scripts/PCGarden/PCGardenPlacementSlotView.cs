using UnityEngine;

[DefaultExecutionOrder(800)]
public sealed class PCGardenPlacementSlotView : MonoBehaviour
{
    public int row;
    public int col;
    public bool occupied;

    private LineRenderer ring;
    private Material ringMaterial;
    private bool dragActive;
    private bool hovered;
    private bool validDrop;

    public void Initialize(int slotRow, int slotCol, Vector3 worldPosition)
    {
        row = slotRow;
        col = slotCol;
        transform.position = worldPosition + Vector3.up * 0.14f;
        gameObject.name = "배치 슬롯 " + row + ":" + col;

        ring = gameObject.AddComponent<LineRenderer>();
        ring.useWorldSpace = false;
        ring.loop = true;
        ring.positionCount = 48;
        ring.numCornerVertices = 4;
        ring.numCapVertices = 4;
        ring.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        ring.receiveShadows = false;
        ring.textureMode = LineTextureMode.Stretch;

        Shader shader = Shader.Find("Sprites/Default");
        ringMaterial = new Material(shader)
        {
            name = "PC 홈가든 배치 슬롯 링",
        };
        ring.sharedMaterial = ringMaterial;

        const float radius = 1.32f;
        for (int index = 0; index < ring.positionCount; index++)
        {
            float angle = index / (float)ring.positionCount * Mathf.PI * 2f;
            ring.SetPosition(
                index,
                new Vector3(
                    Mathf.Cos(angle) * radius,
                    0f,
                    Mathf.Sin(angle) * radius));
        }
        RefreshVisual();
    }

    public void SetState(
        bool isOccupied,
        bool isDragActive,
        bool isHovered,
        bool isValidDrop)
    {
        occupied = isOccupied;
        dragActive = isDragActive;
        hovered = isHovered;
        validDrop = isValidDrop;
        RefreshVisual();
    }

    private void Update()
    {
        if (ring == null)
            return;

        float pulse = dragActive && !occupied
            ? 0.5f + Mathf.Sin(Time.unscaledTime * 5.5f) * 0.5f
            : 0f;
        float width = hovered
            ? 0.34f
            : dragActive && !occupied ? Mathf.Lerp(0.24f, 0.34f, pulse) : 0.24f;
        ring.startWidth = width;
        ring.endWidth = width;

        Color color = CurrentColor(pulse);
        ring.startColor = color;
        ring.endColor = color;
        if (ringMaterial != null)
            ringMaterial.color = color;
    }

    private void RefreshVisual()
    {
        if (ring == null)
            return;
        Update();
    }

    private Color CurrentColor(float pulse)
    {
        if (hovered)
            return validDrop
                ? new Color(0.16f, 1f, 0.32f, 0.96f)
                : new Color(1f, 0.18f, 0.18f, 0.96f);
        if (occupied)
            return new Color(1f, 0.64f, 0.08f, 0.82f);
        if (dragActive)
            return new Color(0.2f, 1f, 0.56f, Mathf.Lerp(0.5f, 0.9f, pulse));
        return new Color(0.02f, 0.32f, 1f, 0.96f);
    }

    private void OnDestroy()
    {
        if (ringMaterial != null)
            Destroy(ringMaterial);
    }
}
