using UnityEngine;

/// <summary>
/// 저작 애니메이션이 없는 장수풍뎅이/사슴벌레를 한 슬롯 주변에서
/// 천천히 걷고 잠시 쉬게 하는 결정론적 이동 컴포넌트다.
/// </summary>
public sealed class PCGardenGroundWander : MonoBehaviour
{
    public Vector3 movementCentre;
    public Vector2 movementRadii = new Vector2(1.2f, 0.9f);
    public float phaseOffset;
    public float movementSpeed = 0.18f;
    public float modelYawOffset;
    public float CurrentTravelAlignmentDot { get; private set; } = 1f;

    private float phase;
    private float stateRemaining;
    private bool paused;
    private Vector3 previousPosition;
    private Quaternion smoothedRotation = Quaternion.identity;

    private void OnEnable()
    {
        phase = phaseOffset;
        stateRemaining = 4f + Mathf.Repeat(phaseOffset, 2.5f);
        paused = false;
        transform.position = EvaluatePosition();
        previousPosition = transform.position;
    }

    private void Update()
    {
        stateRemaining -= Time.deltaTime;
        if (stateRemaining <= 0f)
        {
            paused = !paused;
            stateRemaining = paused
                ? Random.Range(1.4f, 3.4f)
                : Random.Range(4f, 8f);
        }

        if (!paused)
            phase += Time.deltaTime * movementSpeed;

        Vector3 nextPosition = EvaluatePosition();
        Vector3 velocity = Vector3.ProjectOnPlane(
            nextPosition - previousPosition,
            Vector3.up);
        if (!paused && velocity.sqrMagnitude > 0.000001f)
        {
            Quaternion target = Quaternion.LookRotation(
                velocity.normalized,
                Vector3.up) * Quaternion.Euler(0f, modelYawOffset, 0f);
            smoothedRotation = Quaternion.Slerp(
                smoothedRotation,
                target,
                1f - Mathf.Exp(-3.6f * Time.deltaTime));
            Vector3 modelForward = smoothedRotation
                * (Quaternion.Inverse(Quaternion.Euler(
                    0f,
                    modelYawOffset,
                    0f)) * Vector3.forward);
            float alignment = Vector3.Dot(
                modelForward.normalized,
                velocity.normalized);
            if (alignment < 0.02f)
            {
                smoothedRotation = target;
                alignment = 1f;
            }

            CurrentTravelAlignmentDot = alignment;
            transform.rotation = smoothedRotation;
        }

        transform.position = nextPosition;
        previousPosition = nextPosition;
    }

    private Vector3 EvaluatePosition()
    {
        float x = Mathf.Sin(phase) * movementRadii.x
            + Mathf.Sin((phase * 0.41f) + 1.2f) * movementRadii.x * 0.12f;
        float z = Mathf.Cos(phase * 0.78f) * movementRadii.y
            + Mathf.Sin((phase * 1.43f) + 0.4f) * movementRadii.y * 0.1f;
        return movementCentre + new Vector3(x, 0.16f, z);
    }
}
