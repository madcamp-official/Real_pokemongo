using UnityEngine;

public sealed class PCGardenCreatureView : MonoBehaviour
{
    public string creatureId;
    public string speciesId;
    public string displayName;
    public int bond;

    public Bounds CalculateWorldBounds()
    {
        Renderer[] renderers = GetComponentsInChildren<Renderer>(true);
        if (renderers.Length == 0)
            return new Bounds(transform.position, Vector3.one);

        Bounds bounds = renderers[0].bounds;
        for (int index = 1; index < renderers.Length; index++)
            bounds.Encapsulate(renderers[index].bounds);
        return bounds;
    }

    public void EnsureSelectionCollider()
    {
        if (GetComponent<Collider>() != null)
            return;

        Bounds worldBounds = CalculateWorldBounds();
        Vector3 lossy = transform.lossyScale;
        BoxCollider box = gameObject.AddComponent<BoxCollider>();
        box.center = transform.InverseTransformPoint(worldBounds.center);
        box.size = new Vector3(
            worldBounds.size.x / Mathf.Max(Mathf.Abs(lossy.x), 0.0001f),
            worldBounds.size.y / Mathf.Max(Mathf.Abs(lossy.y), 0.0001f),
            worldBounds.size.z / Mathf.Max(Mathf.Abs(lossy.z), 0.0001f));
    }
}
