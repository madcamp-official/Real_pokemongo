Shader "Hidden/PCGarden/VerticalGradient"
{
    Properties
    {
        _TopColor ("Top Color", Color) = (0.1647, 0.1882, 0.2196, 1)
        _BottomColor ("Bottom Color", Color) = (0.1020, 0.1176, 0.1412, 1)
    }

    SubShader
    {
        Tags { "Queue" = "Background" "RenderType" = "Opaque" }
        Cull Off
        ZWrite Off
        ZTest Always

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            fixed4 _TopColor;
            fixed4 _BottomColor;

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 vertex : SV_POSITION;
                float2 uv : TEXCOORD0;
            };

            v2f vert(appdata input)
            {
                v2f output;
                output.vertex = UnityObjectToClipPos(input.vertex);
                output.uv = input.uv;
                return output;
            }

            fixed4 frag(v2f input) : SV_Target
            {
                return lerp(
                    _BottomColor,
                    _TopColor,
                    saturate(input.uv.y));
            }
            ENDCG
        }
    }
}
