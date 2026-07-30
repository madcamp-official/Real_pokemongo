using UnityEngine;

/// <summary>
/// 배치 모델의 실제 렌더 바운드 최저점을 기준으로 바닥 위에 올린다.
/// 원본 GLB의 피벗 위치가 제각각이어도 생물이 바닥 아래로 빠지지 않는다.
/// </summary>
[DefaultExecutionOrder(1000)]
public sealed class PCGardenGroundClamp : MonoBehaviour
{
    public float floorY = 3.90f;
    public float clearance = 0.04f;
    public bool keepClamped = true;

    private Renderer[] renderers;
    private bool initialized;

    private void Start()
    {
        RecalculateAndClamp();
    }

    private void LateUpdate()
    {
        if (!keepClamped)
            return;
        if (!initialized)
            RecalculateAndClamp();

        ClampVisibleBottomToFloor();
    }

    public void RecalculateAndClamp()
    {
        renderers = GetComponentsInChildren<Renderer>(true);
        initialized = true;
        ClampVisibleBottomToFloor();
    }

    private void ClampVisibleBottomToFloor()
    {
        if (renderers == null || renderers.Length == 0)
        {
            Vector3 fallbackPosition = transform.position;
            fallbackPosition.y = floorY + clearance;
            transform.position = fallbackPosition;
            return;
        }

        float minimumY = float.PositiveInfinity;
        foreach (Renderer renderer in renderers)
        {
            if (renderer != null
                && renderer.enabled
                && !renderer.forceRenderingOff
                && renderer.gameObject.activeInHierarchy)
                minimumY = Mathf.Min(minimumY, renderer.bounds.min.y);
        }

        if (float.IsInfinity(minimumY))
            return;

        float correction = (floorY + clearance) - minimumY;
        if (Mathf.Abs(correction) > 0.0001f)
        {
            Vector3 position = transform.position;
            position.y += correction;
            transform.position = position;
        }
    }
}
