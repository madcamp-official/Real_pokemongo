using System;
using UnityEngine;

public enum PerchedBirdIdleStyle
{
    Songbird,
    Duck,
    Egret,
    Magpie
}

[DefaultExecutionOrder(500)]
public sealed class PerchedBirdIdleBehaviour : MonoBehaviour
{
    public PerchedBirdIdleStyle idleStyle;
    public float phaseOffset;
    public float CallGestureIntensity { get; private set; }

    private Transform body;
    private Transform neck;
    private Transform head;
    private Transform beak;
    private Vector3 bodyLocalPosition;
    private Quaternion bodyLocalRotation;
    private Quaternion neckLocalRotation;
    private Quaternion headLocalRotation;
    private Quaternion beakLocalRotation;
    private float callInterval;

    private void OnEnable()
    {
        Transform[] transforms = GetComponentsInChildren<Transform>(true);
        body = Array.Find(transforms, item => item.name == "body");
        neck = Array.Find(transforms, item => item.name == "neck");
        if (neck == null)
        {
            neck = Array.Find(
                transforms,
                item => item.name.StartsWith(
                    "neck",
                    StringComparison.OrdinalIgnoreCase));
        }
        head = Array.Find(transforms, item => item.name == "head");
        beak = Array.Find(transforms, item => item.name == "beak");

        if (body != null)
        {
            bodyLocalPosition = body.localPosition;
            bodyLocalRotation = body.localRotation;
        }
        if (neck != null)
            neckLocalRotation = neck.localRotation;
        if (head != null)
            headLocalRotation = head.localRotation;
        if (beak != null)
            beakLocalRotation = beak.localRotation;

        callInterval = idleStyle == PerchedBirdIdleStyle.Duck
            ? 11.5f
            : idleStyle == PerchedBirdIdleStyle.Egret ? 14f : 8.5f;
        callInterval += Mathf.Repeat(phaseOffset, 3.5f);
    }

    private void LateUpdate()
    {
        float time = Time.time + phaseOffset;
        float breathing = Mathf.Sin(time * BreathingSpeed());
        float slowLook = Mathf.Sin((time * 0.47f) + 0.8f);
        float quickLook = Mathf.Sin((time * 1.17f) + 1.9f);

        float callTime = Mathf.Repeat(time, callInterval);
        float callDuration = idleStyle == PerchedBirdIdleStyle.Duck
            ? 1.35f
            : 0.9f;
        CallGestureIntensity = callTime < callDuration
            ? Mathf.Sin((callTime / callDuration) * Mathf.PI)
            : 0f;

        if (body != null)
        {
            float lift = breathing * BodyBreathingAmount();
            body.localPosition = bodyLocalPosition + (Vector3.up * lift);
            body.localRotation = bodyLocalRotation * Quaternion.Euler(
                breathing * BodyPitchAmount(),
                0f,
                slowLook * BodyRollAmount());
        }

        if (neck != null)
        {
            float neckPitch = breathing * NeckPitchAmount()
                - (CallGestureIntensity * CallNeckPitch());
            neck.localRotation = neckLocalRotation * Quaternion.Euler(
                neckPitch,
                slowLook * NeckYawAmount(),
                0f);
        }

        if (head != null)
        {
            float headYaw = (slowLook * HeadYawAmount())
                + (quickLook * HeadQuickLookAmount());
            float headPitch = (breathing * 1.4f)
                - (CallGestureIntensity * CallHeadPitch());
            head.localRotation = headLocalRotation * Quaternion.Euler(
                headPitch,
                headYaw,
                slowLook * HeadTiltAmount());
        }

        if (beak != null)
        {
            // The source birds use one deforming beak bone. A small relative
            // pitch reads as an opening/calling gesture without distorting the
            // rest of the head.
            beak.localRotation = beakLocalRotation * Quaternion.Euler(
                CallGestureIntensity * BeakOpenAmount(),
                0f,
                0f);
        }
    }

    private float BreathingSpeed()
    {
        return idleStyle == PerchedBirdIdleStyle.Egret
            ? 1.15f
            : idleStyle == PerchedBirdIdleStyle.Duck ? 1.7f : 2.15f;
    }

    private float BodyBreathingAmount()
    {
        return idleStyle == PerchedBirdIdleStyle.Egret ? 0.0028f : 0.0018f;
    }

    private float BodyPitchAmount()
    {
        return idleStyle == PerchedBirdIdleStyle.Duck ? 1.4f : 0.8f;
    }

    private float BodyRollAmount()
    {
        return idleStyle == PerchedBirdIdleStyle.Songbird ? 1.2f : 0.55f;
    }

    private float NeckPitchAmount()
    {
        return idleStyle == PerchedBirdIdleStyle.Egret
            ? 4.5f
            : idleStyle == PerchedBirdIdleStyle.Duck ? 2.4f : 1.8f;
    }

    private float NeckYawAmount()
    {
        return idleStyle == PerchedBirdIdleStyle.Egret ? 4.5f : 2.5f;
    }

    private float HeadYawAmount()
    {
        return idleStyle == PerchedBirdIdleStyle.Songbird
            || idleStyle == PerchedBirdIdleStyle.Magpie
            ? 11f
            : 6f;
    }

    private float HeadQuickLookAmount()
    {
        return idleStyle == PerchedBirdIdleStyle.Songbird ? 3.5f : 1.5f;
    }

    private float HeadTiltAmount()
    {
        return idleStyle == PerchedBirdIdleStyle.Magpie ? 5f : 3f;
    }

    private float CallNeckPitch()
    {
        return idleStyle == PerchedBirdIdleStyle.Egret ? 7f : 3f;
    }

    private float CallHeadPitch()
    {
        return idleStyle == PerchedBirdIdleStyle.Duck ? 6f : 4f;
    }

    private float BeakOpenAmount()
    {
        return idleStyle == PerchedBirdIdleStyle.Egret
            ? 9f
            : idleStyle == PerchedBirdIdleStyle.Duck ? 7f : 11f;
    }

    private void OnDisable()
    {
        if (body != null)
        {
            body.localPosition = bodyLocalPosition;
            body.localRotation = bodyLocalRotation;
        }
        if (neck != null)
            neck.localRotation = neckLocalRotation;
        if (head != null)
            head.localRotation = headLocalRotation;
        if (beak != null)
            beak.localRotation = beakLocalRotation;
    }
}
