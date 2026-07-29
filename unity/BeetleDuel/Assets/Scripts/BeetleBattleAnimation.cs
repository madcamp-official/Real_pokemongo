using UnityEngine;

public sealed class BeetleBattleAnimation : MonoBehaviour
{
    public Transform leftBeetle;
    public Transform rightBeetle;
    public StagBeetleRig stagBeetleRig;
    public bool IsRunning { get; private set; } = true;

    private readonly Vector3 leftStart = new Vector3(-1.6f, 0.12f, 0f);
    private readonly Vector3 rightStart = new Vector3(1.6f, 0.12f, 0f);
    private float battleTime;

    public void ToggleBattle()
    {
        IsRunning = !IsRunning;
    }

    public void RestartBattle()
    {
        battleTime = 0f;
        IsRunning = true;
        ApplyPose(leftStart, rightStart, 0f, 0f, 0f, 0f);
        ApplyMandibles(0f, 0f, 0f);
    }

    private void Update()
    {
        if (leftBeetle == null || rightBeetle == null)
            return;

        if (!IsRunning)
        {
            float tension = Mathf.Sin(Time.time * 5f) * 0.025f;
            ApplyPose(leftStart + new Vector3(tension, 0f, 0f), rightStart - new Vector3(tension, 0f, 0f), 0f, 0f, 0f, 0f);
            ApplyMandibles(0.25f, 0f, 0f);
            return;
        }

        battleTime += Time.deltaTime;
        float phase = Mathf.Repeat(battleTime, 6.2f);

        if (phase < 1.0f)
        {
            float ready = Mathf.Sin(phase * Mathf.PI * 4f) * 0.035f;
            ApplyPose(leftStart + new Vector3(ready, 0f, 0f), rightStart - new Vector3(ready, 0f, 0f), -2f, 0f, 0f, 0f);
            ApplyMandibles(Smooth(phase), 0f, 0f);
        }
        else if (phase < 2.25f)
        {
            float t = Smooth((phase - 1.0f) / 1.25f);
            Vector3 left = Vector3.Lerp(leftStart, new Vector3(-0.92f, 0.12f, 0f), t);
            Vector3 right = Vector3.Lerp(rightStart, new Vector3(0.92f, 0.15f, 0f), t);
            ApplyPose(left, right, Mathf.Lerp(-2f, 4f, t), Mathf.Lerp(0f, -2f, t), 0f, 0f);
            ApplyMandibles(1f, 0f, 0f);
        }
        else if (phase < 2.55f)
        {
            float impactProgress = Smooth((phase - 2.25f) / 0.3f);
            float impact = Mathf.Sin(impactProgress * Mathf.PI);
            ApplyPose(
                new Vector3(-0.92f - impact * 0.04f, 0.12f + impact * 0.03f, 0f),
                new Vector3(0.92f + impact * 0.025f, 0.15f, 0f),
                Mathf.Lerp(4f, -2f, impactProgress),
                Mathf.Lerp(-2f, -4f, impactProgress),
                impact * -3f,
                impact * 2f);
            ApplyMandibles(1f - impactProgress, impactProgress, impactProgress);
        }
        else if (phase < 3.85f)
        {
            float t = Smooth((phase - 2.55f) / 1.3f);
            Vector3 left = Vector3.Lerp(new Vector3(-0.92f, 0.12f, 0f), new Vector3(-1.25f, 0.15f, 0f), t);
            Vector3 right = Vector3.Lerp(new Vector3(0.92f, 0.15f, 0f), new Vector3(0.59f, 0.15f, 0f), t);
            ApplyPose(left, right, Mathf.Lerp(-2f, -6f, t), Mathf.Lerp(-4f, -2f, t), Mathf.Lerp(0f, -4f, t), Mathf.Lerp(0f, 1f, t));
            ApplyMandibles(0f, 1f, 0.72f);
        }
        else if (phase < 5.35f)
        {
            float t = Smooth((phase - 3.85f) / 1.5f);
            ApplyPose(
                Vector3.Lerp(new Vector3(-1.25f, 0.15f, 0f), leftStart, t),
                Vector3.Lerp(new Vector3(0.59f, 0.15f, 0f), rightStart, t),
                Mathf.Lerp(-6f, 0f, t),
                Mathf.Lerp(-2f, 0f, t),
                Mathf.Lerp(-4f, 0f, t),
                Mathf.Lerp(1f, 0f, t));
            ApplyMandibles(t, 1f - t, 1f - t);
        }
        else
        {
            ApplyPose(leftStart, rightStart, 0f, 0f, 0f, 0f);
            ApplyMandibles(0f, 0f, 0f);
        }
    }

    private void ApplyMandibles(float open, float bite, float lift)
    {
        if (stagBeetleRig != null)
            stagBeetleRig.SetAttackPose(open, bite, lift);
    }

    private void ApplyPose(Vector3 leftPosition, Vector3 rightPosition, float leftPitch, float rightPitch, float leftRoll, float rightRoll)
    {
        leftBeetle.localPosition = leftPosition;
        rightBeetle.localPosition = rightPosition;
        leftBeetle.localRotation = Quaternion.Euler(leftPitch, 90f, leftRoll);
        rightBeetle.localRotation = Quaternion.Euler(rightPitch, 90f, rightRoll);
    }

    private float Smooth(float value)
    {
        value = Mathf.Clamp01(value);
        return value * value * (3f - (2f * value));
    }
}
