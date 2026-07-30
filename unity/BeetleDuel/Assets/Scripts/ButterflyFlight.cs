using UnityEngine;
using UnityEngine.Animations;
using UnityEngine.Playables;

public sealed class ButterflyFlight : MonoBehaviour
{
    public string animationResourcePath;
    public Vector3 flightCentre;
    public Vector3 flightRadii = new Vector3(1.2f, 0.4f, 1.2f);
    public float phaseOffset;
    public float pathSpeed = 0.15f;
    public float flapAnimationSpeed = 0.82f;
    public float turnSmoothness = 3.6f;
    public float CurrentTravelAlignmentDot { get; private set; } = 1f;

    private PlayableGraph graph;
    private AnimationMixerPlayable mixer;
    private AnimationClipPlayable flapPlayable;
    private AnimationClipPlayable glidePlayable;
    private AnimationClip flapClip;
    private AnimationClip glideClip;
    private Vector3 previousPosition;
    private Vector3 smoothedDirection = Vector3.forward;
    private Quaternion smoothedRotation = Quaternion.identity;
    private float elapsed;
    private float stateTimeRemaining;
    private float flapWeight = 1f;
    private bool gliding;

    private void OnEnable()
    {
        elapsed = 0f;
        gliding = false;
        stateTimeRemaining = Random.Range(3.1f, 5.3f);
        transform.position = EvaluateFlightPosition(0f);
        previousPosition = transform.position;
        BuildAnimationGraph();
    }

    private void BuildAnimationGraph()
    {
        Animator animator = GetComponentInChildren<Animator>();
        if (animator == null)
        {
            Debug.LogWarning($"{name}: 나비 Animator를 찾지 못했습니다.", this);
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
            else if (glideClip == null && (lowerName.Contains("glide") || lowerName.Contains("idle")))
                glideClip = clip;
        }

        if (flapClip == null)
        {
            Debug.LogWarning($"{name}: 날갯짓 애니메이션을 불러오지 못했습니다.", this);
            return;
        }
        if (glideClip == null)
            glideClip = flapClip;

        graph = PlayableGraph.Create($"{name} Flight");
        graph.SetTimeUpdateMode(DirectorUpdateMode.GameTime);
        mixer = AnimationMixerPlayable.Create(graph, 2);
        AnimationPlayableOutput output = AnimationPlayableOutput.Create(graph, "Butterfly Animation", animator);
        output.SetSourcePlayable(mixer);

        flapPlayable = AnimationClipPlayable.Create(graph, flapClip);
        flapPlayable.SetApplyFootIK(false);
        flapPlayable.SetApplyPlayableIK(false);
        flapPlayable.SetSpeed(flapAnimationSpeed);

        glidePlayable = AnimationClipPlayable.Create(graph, glideClip);
        glidePlayable.SetApplyFootIK(false);
        glidePlayable.SetApplyPlayableIK(false);
        glidePlayable.SetSpeed(0.58d);

        graph.Connect(flapPlayable, 0, mixer, 0);
        graph.Connect(glidePlayable, 0, mixer, 1);
        mixer.SetInputWeight(0, 1f);
        mixer.SetInputWeight(1, 0f);
        graph.Play();
    }

    private void Update()
    {
        elapsed += Time.deltaTime;
        UpdateFlightMotion();
        UpdateFlightState();
        UpdateAnimation();
    }

    private void UpdateFlightMotion()
    {
        Vector3 nextPosition = EvaluateFlightPosition(elapsed);
        Vector3 velocity = nextPosition - previousPosition;
        if (velocity.sqrMagnitude > 0.000001f)
        {
            Vector3 direction = velocity.normalized;
            Vector3 visualDirection = LimitVisualPitch(direction);
            smoothedDirection = Vector3.Slerp(
                smoothedDirection,
                visualDirection,
                1f - Mathf.Exp(-turnSmoothness * Time.deltaTime));

            float signedTurn = Vector3.SignedAngle(
                Vector3.ProjectOnPlane(transform.up, Vector3.up),
                Vector3.ProjectOnPlane(smoothedDirection, Vector3.up),
                Vector3.up);
            float bankAngle = Mathf.Clamp(signedTurn * 0.45f, -20f, 20f);
            Quaternion heading = Quaternion.LookRotation(smoothedDirection, Vector3.up) * Quaternion.Euler(90f, 0f, 0f);
            Quaternion bank = Quaternion.AngleAxis(bankAngle, smoothedDirection);
            Quaternion targetRotation = bank * heading;
            Quaternion candidateRotation = Quaternion.Slerp(
                smoothedRotation,
                targetRotation,
                1f - Mathf.Exp(-turnSmoothness * Time.deltaTime));
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

    private Vector3 EvaluateFlightPosition(float time)
    {
        float phase = phaseOffset + (time * pathSpeed);
        float x = (Mathf.Sin(phase) * flightRadii.x)
            + (Mathf.Sin((phase * 0.47f) + 1.3f) * flightRadii.x * 0.18f);
        float y = (Mathf.Sin((phase * 1.63f) + phaseOffset) * flightRadii.y)
            + (Mathf.Sin((time * 0.66f) + phaseOffset) * flightRadii.y * 0.22f);
        float z = (Mathf.Cos(phase * 0.78f) * flightRadii.z)
            + (Mathf.Sin((phase * 0.31f) + 2.1f) * flightRadii.z * 0.16f);
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

        float maxVertical = horizontal.magnitude
            * Mathf.Tan(24f * Mathf.Deg2Rad);
        return new Vector3(
            horizontal.x,
            Mathf.Clamp(direction.y, -maxVertical, maxVertical),
            horizontal.z).normalized;
    }

    private void UpdateFlightState()
    {
        stateTimeRemaining -= Time.deltaTime;
        if (stateTimeRemaining > 0f)
            return;

        gliding = !gliding;
        stateTimeRemaining = gliding
            ? Random.Range(0.8f, 1.65f)
            : Random.Range(2.8f, 5.2f);
    }

    private void UpdateAnimation()
    {
        if (!graph.IsValid())
            return;

        flapWeight = Mathf.MoveTowards(flapWeight, gliding ? 0f : 1f, Time.deltaTime * 2.2f);
        mixer.SetInputWeight(0, flapWeight);
        mixer.SetInputWeight(1, 1f - flapWeight);

        LoopPlayable(flapPlayable, flapClip);
        LoopPlayable(glidePlayable, glideClip);
    }

    private static void LoopPlayable(AnimationClipPlayable playable, AnimationClip clip)
    {
        if (!playable.IsValid() || clip == null || clip.length <= 0f)
            return;

        double time = playable.GetTime();
        if (time >= clip.length)
            playable.SetTime(time % clip.length);
    }

    private void OnDisable()
    {
        if (graph.IsValid())
            graph.Destroy();
        flapClip = null;
        glideClip = null;
    }
}
