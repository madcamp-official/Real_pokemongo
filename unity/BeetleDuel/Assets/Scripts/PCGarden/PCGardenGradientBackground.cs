using UnityEngine;

[RequireComponent(typeof(Camera))]
public sealed class PCGardenGradientBackground : MonoBehaviour
{
    public Color topColor = new Color32(0x87, 0xCE, 0xEB, 0xFF);
    public Color bottomColor = new Color32(0x87, 0xCE, 0xEB, 0xFF);

    private Material gradientMaterial;

    private void OnEnable()
    {
        Material template = Resources.Load<Material>(
            "Materials/PCGardenGradient");
        if (template == null)
        {
            Debug.LogError("PC 홈가든 세로 그라데이션 머티리얼을 찾지 못했습니다.");
            return;
        }
        gradientMaterial = new Material(template)
        {
            name = "PC 홈가든 하늘색 단색 배경",
            hideFlags = HideFlags.DontSave,
        };
    }

    private void OnPostRender()
    {
        if (gradientMaterial == null)
            return;

        gradientMaterial.SetColor("_TopColor", topColor);
        gradientMaterial.SetColor("_BottomColor", bottomColor);
        gradientMaterial.SetPass(0);

        GL.PushMatrix();
        GL.LoadOrtho();
        GL.Begin(GL.QUADS);
        GL.TexCoord2(0f, 0f);
        GL.Vertex3(0f, 0f, 0f);
        GL.TexCoord2(1f, 0f);
        GL.Vertex3(1f, 0f, 0f);
        GL.TexCoord2(1f, 1f);
        GL.Vertex3(1f, 1f, 0f);
        GL.TexCoord2(0f, 1f);
        GL.Vertex3(0f, 1f, 0f);
        GL.End();
        GL.PopMatrix();
    }

    private void OnDisable()
    {
        if (gradientMaterial != null)
            Destroy(gradientMaterial);
        gradientMaterial = null;
    }
}
