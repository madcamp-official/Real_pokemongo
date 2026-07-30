using UnityEngine;
using UnityEngine.Animations;
using UnityEngine.Playables;

public enum GroundInsectStyle
{
    Ladybug,
    TrueBug,
    Grasshopper,
    Delicate,
    Hoverfly,
    Tiny
}

public sealed class GroundInsectMovement : MonoBehaviour
{
    public string animationResourcePath;
    public GroundInsectStyle movementStyle;
    public Vector3 movementCentre;
    public Vector2 movementRadii = new Vector2(0.6f, 0.5f);
    public float groundHeight = 0.06f;
    public float phaseOffset;
    public float movementSpeed = 0.15f;
    public float modelYawOffset;
    public float CurrentTravelAlignmentDot { get; private set; } = 1f;

    private PlayableGraph graph;
    private AnimationMixerPlayable mixer;
    private AnimationClipPlayable walkPlayable;
    private AnimationClipPlayable idlePlayable;
    private AnimationClip walkClip;
    private AnimationClip idleClip;
    private Vector3 previousPosition;
    private Quaternion smoothedRotation = Quaternion.identity;
    private float movementPhase;
    private float stateTimeRemaining;
    private float walkWeight = 1f;
    private bool paused;

    private void OnEnable()
    {
        movementPhase = phaseOffset;
        paused = false;
        stateTimeRemaining = WalkDuration();
        transform.position = EvaluatePosition();
        previousPosition = transform.position;
        BuildAnimationGraph();
    }

    private void BuildAnimationGraph()
    {
        Animator animator = GetComponentInChildren<Animator>();
        if (animator == null)
        {
            Debug.LogWarning($"{name}: 지상 곤충 Animator를 찾지 못했습니다.", this);
            return;
        }

        AnimationClip[] clips = Resources.LoadAll<AnimationClip>(animationResourcePath);
        for (int index = 0; index < clips.Length; index++)
        {
            AnimationClip clip = clips[index];
            if (clip == null || clip.length <= 0f)
                continue;

            string lowerName = clip.name.ToLowerInvariant();
            if (walkClip == null && lowerName.Contains("walk"))
                walkClip = clip;
            if (idleClip == null && lowerName.Contains("idle"))
                idleClip = clip;
        }

        if (walkClip == null)
        {
            Debug.LogWarning($"{name}: 걷기 애니메이션을 불러오지 못했습니다.", this);
            return;
        }
        if (idleClip == null)
            idleClip = walkClip;

        graph = PlayableGraph.Create($"{name} Ground Movement");
        graph.SetTimeUpdateMode(DirectorUpdateMode.GameTime);
        mixer = AnimationMixerPlayable.Create(graph, 2);
        AnimationPlayableOutput output = AnimationPlayableOutput.Create(graph, "Ground Insect Animation", animator);
        output.SetSourcePlayable(mixer);

        walkPlayable = AnimationClipPlayable.Create(graph, walkClip);
        walkPlayable.SetApplyFootIK(false);
        walkPlayable.SetApplyPlayableIK(false);
        walkPlayable.SetSpeed(WalkAnimationSpeed());

        idlePlayable = AnimationClipPlayable.Create(graph, idleClip);
        idlePlayable.SetApplyFootIK(false);
        idlePlayable.SetApplyPlayableIK(false);
        idlePlayable.SetSpeed(IdleAnimationSpeed());

        graph.Connect(walkPlayable, 0, mixer, 0);
        graph.Connect(idlePlayable, 0, mixer, 1);
        mixer.SetInputWeight(0, 1f);
        mixer.SetInputWeight(1, 0f);
        graph.Play();
    }

    private void Update()
    {
        stateTimeRemaining -= Time.deltaTime;
        if (stateTimeRemaining <= 0f)
        {
            paused = !paused;
            stateTimeRemaining = paused ? PauseDuration() : WalkDuration();
        }

        if (!paused)
            movementPhase += Time.deltaTime * movementSpeed;

        UpdateMovement();
        UpdateAnimation();
    }

    private void UpdateMovement()
    {
        Vector3 nextPosition = EvaluatePosition();
        Vector3 velocity = Vector3.ProjectOnPlane(nextPosition - previousPosition, Vector3.up);
        if (!paused && velocity.sqrMagnitude > 0.000001f)
        {
            Quaternion heading = Quaternion.LookRotation(velocity.normalized, Vector3.up)
                * Quaternion.Euler(0f, modelYawOffset, 0f);
            float turnSpeed = movementStyle == GroundInsectStyle.Grasshopper ? 5f : 3.8f;
            smoothedRotation = Quaternion.Slerp(
                smoothedRotation,
                heading,
                1f - Mathf.Exp(-turnSpeed * Time.deltaTime));
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
                smoothedRotation = heading;
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
        float x = (Mathf.Sin(movementPhase) * movementRadii.x)
            + (Mathf.Sin((movementPhase * 0.43f) + 1.2f) * movementRadii.x * 0.12f);
        float z = (Mathf.Cos(movementPhase * 0.81f) * movementRadii.y)
            + (Mathf.Sin((movementPhase * 1.7f) + 0.5f) * movementRadii.y * 0.08f);
        float bob = paused ? 0f : Mathf.Abs(Mathf.Sin(movementPhase * 11f)) * StepHeight();
        return movementCentre + new Vector3(x, groundHeight + bob, z);
    }

    private void UpdateAnimation()
    {
        if (!graph.IsValid())
            return;

        walkWeight = Mathf.MoveTowards(walkWeight, paused ? 0f : 1f, Time.deltaTime * 4.5f);
        mixer.SetInputWeight(0, walkWeight);
        mixer.SetInputWeight(1, 1f - walkWeight);
        LoopPlayable(walkPlayable, walkClip);
        LoopPlayable(idlePlayable, idleClip);
    }

    private static void LoopPlayable(AnimationClipPlayable playable, AnimationClip clip)
    {
        if (!playable.IsValid() || clip == null || clip.length <= 0f)
            return;

        double time = playable.GetTime();
        if (time >= clip.length)
            playable.SetTime(time % clip.length);
    }

    private float WalkDuration()
    {
        if (movementStyle == GroundInsectStyle.Grasshopper)
            return Random.Range(3.5f, 6.5f);
        if (movementStyle == GroundInsectStyle.Delicate)
            return Random.Range(2.5f, 4.5f);
        return Random.Range(4f, 7.5f);
    }

    private float PauseDuration()
    {
        if (movementStyle == GroundInsectStyle.Grasshopper)
            return Random.Range(1.6f, 3.2f);
        if (movementStyle == GroundInsectStyle.Delicate)
            return Random.Range(2f, 4f);
        return Random.Range(1f, 2.8f);
    }

    private float WalkAnimationSpeed()
    {
        if (movementStyle == GroundInsectStyle.Grasshopper)
            return 0.9f;
        if (movementStyle == GroundInsectStyle.Delicate)
            return 0.68f;
        if (movementStyle == GroundInsectStyle.Tiny)
            return 0.62f;
        return 1.05f;
    }

    private float IdleAnimationSpeed()
    {
        return movementStyle == GroundInsectStyle.Delicate ? 0.55f : 0.75f;
    }

    private float StepHeight()
    {
        if (movementStyle == GroundInsectStyle.Grasshopper)
            return 0.012f;
        if (movementStyle == GroundInsectStyle.Delicate)
            return 0.004f;
        return 0.007f;
    }

    private void OnDisable()
    {
        if (graph.IsValid())
            graph.Destroy();
        walkClip = null;
        idleClip = null;
    }
}
