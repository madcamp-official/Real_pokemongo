using UnityEngine;
using UnityEngine.Animations;
using UnityEngine.Playables;

public enum FlyingInsectStyle
{
    Dragonfly,
    Honeybee,
    Hornet
}

public sealed class FlyingInsectFlight : MonoBehaviour
{
    public string animationResourcePath;
    public FlyingInsectStyle flightStyle;
    public Vector3 flightCentre;
    public Vector3 flightRadii = new Vector3(1.5f, 0.4f, 1.4f);
    public float phaseOffset;
    public float pathSpeed = 0.2f;
    public float flapAnimationSpeed = 1.2f;
    public float turnSmoothness = 5f;
    public float CurrentTravelAlignmentDot { get; private set; } = 1f;

    private PlayableGraph graph;
    private AnimationMixerPlayable mixer;
    private AnimationClipPlayable flapPlayable;
    private AnimationClipPlayable hoverPlayable;
    private AnimationClip flapClip;
    private AnimationClip hoverClip;
    private Vector3 previousPosition;
    private Vector3 smoothedDirection = Vector3.forward;
    private Quaternion smoothedRotation = Quaternion.identity;
    private float elapsed;
    private float movementPhase;
    private float stateTimeRemaining;
    private float flapWeight = 1f;
    private bool hovering;

    private void OnEnable()
    {
        elapsed = 0f;
        movementPhase = phaseOffset;
        hovering = false;
        stateTimeRemaining = CruiseDuration();
        transform.position = EvaluateFlightPosition();
        previousPosition = transform.position;
        BuildAnimationGraph();
    }

    private void BuildAnimationGraph()
    {
        Animator animator = GetComponentInChildren<Animator>();
        if (animator == null)
        {
            Debug.LogWarning($"{name}: 비행 곤충 Animator를 찾지 못했습니다.", this);
            return;
        }

        AnimationClip[] loadedClips = Resources.LoadAll<AnimationClip>(animationResourcePath);
        for (int index = 0; index < loadedClips.Length; index++)
        {
            AnimationClip clip = loadedClips[index];
            if (clip == null || clip.length <= 0f)
                continue;

            string lowerName = clip.name.ToLowerInvariant();
            if (flapClip == null && lowerName.Contains("flap"))
                flapClip = clip;
            if (lowerName.Contains("hover"))
                hoverClip = clip;
        }

        if (hoverClip == null)
        {
            for (int index = 0; index < loadedClips.Length; index++)
            {
                AnimationClip clip = loadedClips[index];
                if (clip != null && clip.length > 0f && clip.name.ToLowerInvariant().Contains("glide"))
                {
                    hoverClip = clip;
                    break;
                }
            }
        }

        if (flapClip == null)
        {
            Debug.LogWarning($"{name}: 날갯짓 애니메이션을 불러오지 못했습니다.", this);
            return;
        }
        if (hoverClip == null)
            hoverClip = flapClip;

        graph = PlayableGraph.Create($"{name} Species Flight");
        graph.SetTimeUpdateMode(DirectorUpdateMode.GameTime);
        mixer = AnimationMixerPlayable.Create(graph, 2);
        AnimationPlayableOutput output = AnimationPlayableOutput.Create(graph, "Flying Insect Animation", animator);
        output.SetSourcePlayable(mixer);

        flapPlayable = AnimationClipPlayable.Create(graph, flapClip);
        flapPlayable.SetApplyFootIK(false);
        flapPlayable.SetApplyPlayableIK(false);
        flapPlayable.SetSpeed(flapAnimationSpeed);

        hoverPlayable = AnimationClipPlayable.Create(graph, hoverClip);
        hoverPlayable.SetApplyFootIK(false);
        hoverPlayable.SetApplyPlayableIK(false);
        hoverPlayable.SetSpeed(HoverAnimationSpeed());

        graph.Connect(flapPlayable, 0, mixer, 0);
        graph.Connect(hoverPlayable, 0, mixer, 1);
        mixer.SetInputWeight(0, 1f);
        mixer.SetInputWeight(1, 0f);
        graph.Play();
    }

    private void Update()
    {
        elapsed += Time.deltaTime;
        stateTimeRemaining -= Time.deltaTime;
        if (stateTimeRemaining <= 0f)
        {
            hovering = !hovering;
            stateTimeRemaining = hovering ? HoverDuration() : CruiseDuration();
        }

        float motionMultiplier = hovering ? HoverMotionMultiplier() : CruiseMotionMultiplier();
        movementPhase += Time.deltaTime * pathSpeed * motionMultiplier;
        UpdateFlightMotion();
        UpdateAnimation();
    }

    private void UpdateFlightMotion()
    {
        Vector3 nextPosition = EvaluateFlightPosition();
        Vector3 velocity = nextPosition - previousPosition;
        if (velocity.sqrMagnitude > 0.000001f)
        {
            Vector3 direction = velocity.normalized;
            Vector3 visualDirection = LimitVisualPitch(direction);
            float directionBlend = 1f - Mathf.Exp(-turnSmoothness * Time.deltaTime);
            smoothedDirection = Vector3.Slerp(
                smoothedDirection,
                visualDirection,
                directionBlend);

            float bankAngle = CalculateBankAngle();
            Quaternion heading = Quaternion.LookRotation(
                smoothedDirection,
                Vector3.up) * Quaternion.Euler(90f, 0f, 0f);
            Quaternion bank = Quaternion.AngleAxis(bankAngle, smoothedDirection);
            Quaternion targetRotation = bank * heading;
            Quaternion candidateRotation = Quaternion.Slerp(
                smoothedRotation,
                targetRotation,
                directionBlend);
            Vector3 modelForward = candidateRotation * Vector3.up;
            float alignment = Vector3.Dot(modelForward.normalized, direction);
            if (alignment < 0.02f)
            {
                Quaternion immediateHeading = Quaternion.LookRotation(
                    visualDirection,
                    Vector3.up) * Quaternion.Euler(90f, 0f, 0f);
                candidateRotation = Quaternion.AngleAxis(
                    bankAngle,
                    visualDirection) * immediateHeading;
                modelForward = candidateRotation * Vector3.up;
                alignment = Vector3.Dot(modelForward.normalized, direction);
            }

            smoothedRotation = candidateRotation;
            CurrentTravelAlignmentDot = alignment;
            transform.rotation = smoothedRotation;
        }

        transform.position = nextPosition;
        previousPosition = nextPosition;
    }

    private Vector3 EvaluateFlightPosition()
    {
        float x;
        float y;
        float z;

        if (flightStyle == FlyingInsectStyle.Dragonfly)
        {
            x = (Mathf.Sin(movementPhase) * flightRadii.x)
                + (Mathf.Sin((movementPhase * 2.17f) + 0.8f) * flightRadii.x * 0.12f);
            y = (Mathf.Sin((movementPhase * 1.31f) + phaseOffset) * flightRadii.y)
                + (Mathf.Sin((elapsed * 1.4f) + phaseOffset) * flightRadii.y * 0.08f);
            z = (Mathf.Cos(movementPhase * 0.83f) * flightRadii.z)
                + (Mathf.Sin((movementPhase * 1.73f) + 1.1f) * flightRadii.z * 0.14f);
        }
        else if (flightStyle == FlyingInsectStyle.Honeybee)
        {
            x = (Mathf.Sin(movementPhase) * flightRadii.x)
                + (Mathf.Sin((movementPhase * 3.2f) + 1.4f) * flightRadii.x * 0.18f);
            y = (Mathf.Sin((movementPhase * 1.9f) + phaseOffset) * flightRadii.y)
                + (Mathf.Sin((elapsed * 2.1f) + 0.7f) * flightRadii.y * 0.15f);
            z = (Mathf.Cos(movementPhase * 0.74f) * flightRadii.z)
                + (Mathf.Sin((movementPhase * 2.6f) + 2f) * flightRadii.z * 0.16f);
        }
        else
        {
            x = (Mathf.Sin(movementPhase) * flightRadii.x)
                + (Mathf.Sin((movementPhase * 0.43f) + 1.7f) * flightRadii.x * 0.12f);
            y = (Mathf.Sin((movementPhase * 1.42f) + phaseOffset) * flightRadii.y)
                + (Mathf.Sin((movementPhase * 2.15f) + phaseOffset)
                    * flightRadii.y * 0.06f);
            z = (Mathf.Cos(movementPhase * 0.71f) * flightRadii.z)
                + (Mathf.Sin((movementPhase * 0.37f) + 0.5f) * flightRadii.z * 0.12f);
        }

        return flightCentre + new Vector3(x, y, z);
    }

    private Vector3 LimitVisualPitch(Vector3 direction)
    {
        Vector3 horizontal = Vector3.ProjectOnPlane(direction, Vector3.up);
        if (horizontal.sqrMagnitude < 0.0001f)
        {
            horizontal = Vector3.ProjectOnPlane(smoothedDirection, Vector3.up);
            if (horizontal.sqrMagnitude < 0.0001f)
                horizontal = Vector3.forward;
        }

        float maxPitch = flightStyle == FlyingInsectStyle.Dragonfly
            ? 18f
            : flightStyle == FlyingInsectStyle.Hornet ? 14f : 22f;
        float maxVertical = horizontal.magnitude
            * Mathf.Tan(maxPitch * Mathf.Deg2Rad);
        return new Vector3(
            horizontal.x,
            Mathf.Clamp(direction.y, -maxVertical, maxVertical),
            horizontal.z).normalized;
    }

    private float CalculateBankAngle()
    {
        Vector3 bodyForward = Vector3.ProjectOnPlane(transform.forward, Vector3.up);
        Vector3 travelForward = Vector3.ProjectOnPlane(smoothedDirection, Vector3.up);
        if (bodyForward.sqrMagnitude < 0.0001f || travelForward.sqrMagnitude < 0.0001f)
            return 0f;

        float turn = Vector3.SignedAngle(bodyForward, travelForward, Vector3.up);
        float bankLimit = flightStyle == FlyingInsectStyle.Dragonfly ? 25f : 18f;
        return Mathf.Clamp(turn * 0.55f, -bankLimit, bankLimit);
    }

    private void UpdateAnimation()
    {
        if (!graph.IsValid())
            return;

        flapWeight = Mathf.MoveTowards(flapWeight, hovering ? 0f : 1f, Time.deltaTime * 4f);
        mixer.SetInputWeight(0, flapWeight);
        mixer.SetInputWeight(1, 1f - flapWeight);
        LoopPlayable(flapPlayable, flapClip);
        LoopPlayable(hoverPlayable, hoverClip);
    }

    private static void LoopPlayable(AnimationClipPlayable playable, AnimationClip clip)
    {
        if (!playable.IsValid() || clip == null || clip.length <= 0f)
            return;

        double time = playable.GetTime();
        if (time >= clip.length)
            playable.SetTime(time % clip.length);
    }

    private float CruiseDuration()
    {
        if (flightStyle == FlyingInsectStyle.Dragonfly)
            return Random.Range(2.2f, 4f);
        if (flightStyle == FlyingInsectStyle.Honeybee)
            return Random.Range(3.5f, 6f);
        return Random.Range(4f, 7f);
    }

    private float HoverDuration()
    {
        if (flightStyle == FlyingInsectStyle.Dragonfly)
            return Random.Range(0.7f, 1.45f);
        if (flightStyle == FlyingInsectStyle.Honeybee)
            return Random.Range(1f, 2.2f);
        return Random.Range(1.1f, 2f);
    }

    private float CruiseMotionMultiplier()
    {
        if (flightStyle == FlyingInsectStyle.Dragonfly)
            return 1.6f;
        if (flightStyle == FlyingInsectStyle.Honeybee)
            return 1.05f;
        return 0.82f;
    }

    private float HoverMotionMultiplier()
    {
        if (flightStyle == FlyingInsectStyle.Dragonfly)
            return 0.06f;
        if (flightStyle == FlyingInsectStyle.Honeybee)
            return 0.18f;
        return 0.12f;
    }

    private double HoverAnimationSpeed()
    {
        if (flightStyle == FlyingInsectStyle.Dragonfly)
            return 1.5d;
        if (flightStyle == FlyingInsectStyle.Honeybee)
            return 1.7d;
        return 1.05d;
    }

    private void OnDisable()
    {
        if (graph.IsValid())
            graph.Destroy();
        flapClip = null;
        hoverClip = null;
    }
}
