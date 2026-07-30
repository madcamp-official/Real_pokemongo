using UnityEngine;
using UnityEngine.Animations;
using UnityEngine.Playables;

public enum BirdFlightStyle
{
    Passerine,
    Wagtail,
    Bulbul,
    Pigeon,
    Gull,
    Egret,
    Duck,
    Crow
}

public enum BirdMotionState
{
    Perched,
    TakingOff,
    Flying,
    Landing
}

public sealed class BirdFlightBehaviour : MonoBehaviour
{
    public string animationResourcePath;
    public BirdFlightStyle flightStyle;
    public bool flightEnabled = true;
    public bool continuouslyFlying;
    public Vector3 flightCentre;
    public Vector3 flightRadii = new Vector3(3f, 0.8f, 2.5f);
    public Vector3[] perchPoints;
    public float phaseOffset;
    public float pathSpeed = 0.35f;
    public float modelYawOffset = -90f;
    public float perchWaitMin = 10f;
    public float perchWaitMax = 24f;
    public float flightTimeMin = 10f;
    public float flightTimeMax = 20f;
    [Tooltip("비행 중 모델 루트가 이 높이 아래로 내려가지 않도록 제한합니다.")]
    public float minimumFlightAltitude = 0.35f;

    public BirdMotionState CurrentState => state;
    public float CurrentGlideWeight => glideWeight;
    public float CurrentTravelAlignmentDot { get; private set; } = 1f;

    private const int PerchedInput = 0;
    private const int TakeoffInput = 1;
    private const int FlightInput = 2;
    private const int GlideInput = 3;
    private const int LandingInput = 4;

    private PlayableGraph graph;
    private AnimationMixerPlayable mixer;
    private readonly AnimationClipPlayable[] playables = new AnimationClipPlayable[5];
    private readonly AnimationClip[] clips = new AnimationClip[5];
    private readonly float[] mixerWeights = new float[5];
    private BirdMotionState state;
    private int currentPerchIndex;
    private float movementPhase;
    private float stateElapsed;
    private float stateDuration;
    private float glideWeight;
    private Vector3 transitionStart;
    private Vector3 transitionTarget;
    private Vector3 previousPosition;
    private Vector3 previousDirection = Vector3.forward;
    private Vector3 smoothedDirection = Vector3.forward;
    private Quaternion smoothedRotation = Quaternion.identity;
    private SkinnedMeshRenderer[] flightWingRenderers =
        System.Array.Empty<SkinnedMeshRenderer>();

    private void OnEnable()
    {
        movementPhase = phaseOffset;
        currentPerchIndex = 0;
        BuildAnimationGraph();
        CacheFlightWingRenderers();

        bool startsInFlight = flightEnabled && continuouslyFlying;
        if (startsInFlight)
        {
            state = BirdMotionState.Flying;
            stateDuration = float.PositiveInfinity;
            transform.position = EvaluateFlightPosition(movementPhase);
            ResetPlayable(FlightInput);
            ResetPlayable(GlideInput);
        }
        else
        {
            state = BirdMotionState.Perched;
            stateDuration = Random.Range(perchWaitMin, perchWaitMax)
                + Mathf.Repeat(phaseOffset, 2.5f);
            transform.position = CurrentPerch();
            ResetPlayable(PerchedInput);
        }

        SetFlightWingRenderers(startsInFlight);
        previousPosition = transform.position;
        Vector3 initialDirection = startsInFlight
            ? EvaluateFlightTangent(movementPhase)
            : new Vector3(
                Mathf.Sin(phaseOffset + 0.7f),
                0f,
                Mathf.Cos(phaseOffset + 0.7f));
        smoothedDirection = initialDirection.sqrMagnitude > 0f
            ? initialDirection.normalized
            : Vector3.forward;
        previousDirection = smoothedDirection;
        smoothedRotation = FacingRotation(smoothedDirection, 0f);
        transform.rotation = smoothedRotation;
        ApplyImmediateAnimationWeights();
    }

    private void BuildAnimationGraph()
    {
        Animator animator = GetComponentInChildren<Animator>();
        if (animator == null)
        {
            Debug.LogWarning($"{name}: 새 Animator를 찾지 못했습니다.", this);
            return;
        }

        AnimationClip[] loadedClips =
            Resources.LoadAll<AnimationClip>(animationResourcePath);
        for (int index = 0; index < loadedClips.Length; index++)
        {
            AnimationClip clip = loadedClips[index];
            if (clip == null || clip.length <= 0f)
                continue;

            string lowerName = clip.name.ToLowerInvariant();
            if (lowerName.Contains("perched") || lowerName.Contains("idle"))
                clips[PerchedInput] = clip;
            else if (lowerName.Contains("takeoff"))
                clips[TakeoffInput] = clip;
            else if (lowerName.Contains("flight"))
                clips[FlightInput] = clip;
            else if (lowerName.Contains("glide"))
                clips[GlideInput] = clip;
            else if (lowerName.Contains("landing"))
                clips[LandingInput] = clip;
        }

        if (clips[FlightInput] == null)
        {
            if (!flightEnabled && clips[PerchedInput] != null)
                clips[FlightInput] = clips[PerchedInput];
            else
            {
                Debug.LogWarning($"{name}: 새 비행 애니메이션을 불러오지 못했습니다.", this);
                return;
            }
        }

        for (int index = 0; index < clips.Length; index++)
        {
            if (clips[index] == null)
                clips[index] = clips[FlightInput];
        }

        graph = PlayableGraph.Create($"{name} Natural Bird Flight");
        graph.SetTimeUpdateMode(DirectorUpdateMode.GameTime);
        mixer = AnimationMixerPlayable.Create(graph, clips.Length);
        AnimationPlayableOutput output = AnimationPlayableOutput.Create(
            graph,
            "Bird Animation",
            animator);
        output.SetSourcePlayable(mixer);

        for (int index = 0; index < clips.Length; index++)
        {
            playables[index] = AnimationClipPlayable.Create(graph, clips[index]);
            playables[index].SetApplyFootIK(false);
            playables[index].SetApplyPlayableIK(false);
            graph.Connect(playables[index], 0, mixer, index);
            mixer.SetInputWeight(index, 0f);
        }

        playables[PerchedInput].SetSpeed(0.72d);
        playables[FlightInput].SetSpeed(FlapPlaybackSpeed());
        playables[GlideInput].SetSpeed(0.58d);
        playables[TakeoffInput].SetSpeed(
            clips[TakeoffInput].length / TakeoffDuration());
        playables[LandingInput].SetSpeed(
            clips[LandingInput].length / LandingDuration());
        graph.Play();
    }

    private void Update()
    {
        float deltaTime = Time.deltaTime;
        stateElapsed += deltaTime;

        Vector3 nextPosition;
        switch (state)
        {
            case BirdMotionState.Perched:
                nextPosition = CurrentPerch();
                if (flightEnabled && stateElapsed >= stateDuration)
                    EnterTakeoff();
                break;
            case BirdMotionState.TakingOff:
                nextPosition = EvaluateTransition(
                    stateElapsed / Mathf.Max(0.01f, stateDuration),
                    TakeoffArcHeight());
                if (stateElapsed >= stateDuration)
                    EnterFlight();
                break;
            case BirdMotionState.Landing:
                nextPosition = EvaluateTransition(
                    stateElapsed / Mathf.Max(0.01f, stateDuration),
                    LandingArcHeight());
                if (stateElapsed >= stateDuration)
                    EnterPerched();
                break;
            default:
                movementPhase += deltaTime * pathSpeed;
                nextPosition = EvaluateFlightPosition(movementPhase);
                if (!continuouslyFlying && stateElapsed >= stateDuration)
                    EnterLanding();
                break;
        }

        if (state != BirdMotionState.Perched)
        {
            nextPosition.y = Mathf.Max(nextPosition.y, minimumFlightAltitude);
            UpdateFlightRotation(nextPosition, deltaTime);
        }
        else
            UpdatePerchedRotation(deltaTime);

        transform.position = nextPosition;
        previousPosition = nextPosition;
        UpdateAnimation(deltaTime);
    }

    private void EnterTakeoff()
    {
        SetFlightWingRenderers(true);
        state = BirdMotionState.TakingOff;
        stateElapsed = 0f;
        stateDuration = TakeoffDuration();
        transitionStart = transform.position;
        movementPhase = FindClosestFlightPhase(
            transitionStart + (Vector3.up * TakeoffArcHeight()));
        transitionTarget = EvaluateFlightPosition(movementPhase);
        ResetPlayable(TakeoffInput);
    }

    private void EnterFlight()
    {
        state = BirdMotionState.Flying;
        stateElapsed = 0f;
        stateDuration = continuouslyFlying
            ? float.PositiveInfinity
            : Random.Range(flightTimeMin, flightTimeMax);
        transform.position = transitionTarget;
        previousPosition = transitionTarget;
        ResetPlayable(FlightInput);
        ResetPlayable(GlideInput);
    }

    private void EnterLanding()
    {
        state = BirdMotionState.Landing;
        stateElapsed = 0f;
        stateDuration = LandingDuration();
        transitionStart = transform.position;
        currentPerchIndex = ChooseNextPerchIndex();
        transitionTarget = CurrentPerch();
        ResetPlayable(LandingInput);
    }

    private void EnterPerched()
    {
        state = BirdMotionState.Perched;
        stateElapsed = 0f;
        stateDuration = Random.Range(perchWaitMin, perchWaitMax);
        transform.position = CurrentPerch();
        previousPosition = transform.position;
        ResetPlayable(PerchedInput);
        SetFlightWingRenderers(false);
    }

    private void CacheFlightWingRenderers()
    {
        SkinnedMeshRenderer[] renderers =
            GetComponentsInChildren<SkinnedMeshRenderer>(true);
        flightWingRenderers = System.Array.FindAll(
            renderers,
            renderer => renderer.name.Contains("FlightWing"));
    }

    private void SetFlightWingRenderers(bool visible)
    {
        for (int index = 0; index < flightWingRenderers.Length; index++)
        {
            if (flightWingRenderers[index] != null)
            {
                flightWingRenderers[index].forceRenderingOff = !visible;
                flightWingRenderers[index].updateWhenOffscreen = false;
            }
        }
    }

    private void LateUpdate()
    {
        // Imported GLB visibility curves are evaluated after Update, so enforce the
        // inexpensive perched representation after animation evaluation.
        SetFlightWingRenderers(state != BirdMotionState.Perched);
    }

    private Vector3 EvaluateTransition(float normalizedTime, float arcHeight)
    {
        float t = Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(normalizedTime));
        Vector3 basePosition = Vector3.Lerp(transitionStart, transitionTarget, t);
        float arc = Mathf.Sin(t * Mathf.PI) * arcHeight;
        return basePosition + (Vector3.up * arc);
    }

    private Vector3 EvaluateFlightPosition(float phase)
    {
        if (flightStyle == BirdFlightStyle.Crow)
        {
            float crowX = Mathf.Sin(phase) * flightRadii.x;
            float crowY =
                Mathf.Sin((phase * 2f) + phaseOffset) * flightRadii.y * 0.55f
                + Mathf.Sin((phase * 0.5f) + 0.4f) * flightRadii.y * 0.12f;
            float crowZ = Mathf.Cos(phase) * flightRadii.z;
            return flightCentre + new Vector3(crowX, crowY, crowZ);
        }

        float x = (Mathf.Sin(phase) * flightRadii.x)
            + (Mathf.Sin((phase * 0.47f) + 1.3f) * flightRadii.x * 0.14f);
        float y = (Mathf.Sin((phase * 1.57f) + phaseOffset)
            * flightRadii.y)
            + (Mathf.Sin((phase * 0.61f) + 0.8f) * flightRadii.y * 0.22f);
        float z = (Mathf.Cos(phase * 0.79f) * flightRadii.z)
            + (Mathf.Sin((phase * 0.33f) + 2.1f) * flightRadii.z * 0.13f);
        return flightCentre + new Vector3(x, y, z);
    }

    private Vector3 EvaluateFlightTangent(float phase)
    {
        if (flightStyle == BirdFlightStyle.Crow)
        {
            Vector3 tangent = new Vector3(
                Mathf.Cos(phase) * flightRadii.x,
                Mathf.Cos((phase * 2f) + phaseOffset)
                    * flightRadii.y * 1.1f
                    + Mathf.Cos((phase * 0.5f) + 0.4f)
                    * flightRadii.y * 0.06f,
                -Mathf.Sin(phase) * flightRadii.z);
            if (tangent.sqrMagnitude > 0.0001f)
                return tangent.normalized;
        }

        const float tangentSample = 0.01f;
        Vector3 sampledTangent =
            EvaluateFlightPosition(phase + tangentSample)
            - EvaluateFlightPosition(phase);
        return sampledTangent.sqrMagnitude > 0.0001f
            ? sampledTangent.normalized
            : Vector3.forward;
    }

    private float FindClosestFlightPhase(Vector3 target)
    {
        float bestPhase = movementPhase;
        float bestDistance = float.PositiveInfinity;
        for (int sample = 0; sample < 128; sample++)
        {
            float candidate = phaseOffset + ((sample / 128f) * Mathf.PI * 2f);
            float distance = (EvaluateFlightPosition(candidate) - target).sqrMagnitude;
            if (distance >= bestDistance)
                continue;
            bestDistance = distance;
            bestPhase = candidate;
        }
        return bestPhase;
    }

    private void UpdateFlightRotation(Vector3 nextPosition, float deltaTime)
    {
        Vector3 velocity = nextPosition - previousPosition;
        if (velocity.sqrMagnitude <= 0.000001f)
            return;

        Vector3 direction = velocity.normalized;
        float smoothing = flightStyle == BirdFlightStyle.Crow
            ? 8.5f
            : flightStyle == BirdFlightStyle.Gull ? 7.4f : 6.2f;
        smoothedDirection = Vector3.Slerp(
            smoothedDirection,
            direction,
            1f - Mathf.Exp(-smoothing * deltaTime));
        Vector3 facingDirection = LimitVisualPitch(smoothedDirection);

        Vector3 previousHorizontal = Vector3.ProjectOnPlane(
            previousDirection,
            Vector3.up);
        Vector3 currentHorizontal = Vector3.ProjectOnPlane(
            smoothedDirection,
            Vector3.up);
        float turnRate = 0f;
        if (previousHorizontal.sqrMagnitude > 0.0001f
            && currentHorizontal.sqrMagnitude > 0.0001f)
        {
            turnRate = Vector3.SignedAngle(
                previousHorizontal,
                currentHorizontal,
                Vector3.up) / Mathf.Max(deltaTime, 0.001f);
        }

        float bankLimit = flightStyle == BirdFlightStyle.Gull
            || flightStyle == BirdFlightStyle.Crow
            ? 34f
            : 26f;
        float bank = Mathf.Clamp(-turnRate * 0.12f, -bankLimit, bankLimit);
        Quaternion targetRotation = FacingRotation(facingDirection, bank);
        float maxTurnSpeed = flightStyle == BirdFlightStyle.Crow
            ? 300f
            : flightStyle == BirdFlightStyle.Gull ? 270f : 230f;
        Quaternion candidateRotation = Quaternion.RotateTowards(
            smoothedRotation,
            targetRotation,
            maxTurnSpeed * deltaTime);

        // A fast curve can change direction more quickly than a visually smooth
        // turn. Never allow that lag to make a bird travel tail-first. If the
        // source model's real forward axis would enter the rear hemisphere,
        // finish the turn immediately; sideways travel is still allowed.
        Vector3 modelForward = candidateRotation * ModelLocalForwardAxis();
        float alignment = Vector3.Dot(modelForward.normalized, direction);
        if (alignment < 0.02f)
        {
            facingDirection = LimitVisualPitch(direction);
            candidateRotation = FacingRotation(facingDirection, bank);
            modelForward = candidateRotation * ModelLocalForwardAxis();
            alignment = Vector3.Dot(modelForward.normalized, direction);
        }

        smoothedRotation = candidateRotation;
        CurrentTravelAlignmentDot = alignment;
        transform.rotation = smoothedRotation;
        previousDirection = smoothedDirection;
    }

    private Vector3 LimitVisualPitch(Vector3 direction)
    {
        Vector3 horizontal = Vector3.ProjectOnPlane(direction, Vector3.up);
        if (horizontal.sqrMagnitude < 0.0001f)
        {
            horizontal = Vector3.ProjectOnPlane(previousDirection, Vector3.up);
            if (horizontal.sqrMagnitude < 0.0001f)
                horizontal = Vector3.forward;
        }

        float maxPitch = flightStyle == BirdFlightStyle.Egret ? 18f : 26f;
        float maxVertical = horizontal.magnitude
            * Mathf.Tan(maxPitch * Mathf.Deg2Rad);
        return new Vector3(
            horizontal.x,
            Mathf.Clamp(direction.y, -maxVertical, maxVertical),
            horizontal.z).normalized;
    }

    private Vector3 ModelLocalForwardAxis()
    {
        Quaternion modelOffset = Quaternion.Euler(0f, modelYawOffset, 0f);
        return Quaternion.Inverse(modelOffset) * Vector3.forward;
    }

    private void UpdatePerchedRotation(float deltaTime)
    {
        Vector3 direction = new Vector3(
            Mathf.Sin(phaseOffset + currentPerchIndex),
            0f,
            Mathf.Cos(phaseOffset + currentPerchIndex));
        Quaternion targetRotation = FacingRotation(direction.normalized, 0f);
        smoothedRotation = Quaternion.Slerp(
            smoothedRotation,
            targetRotation,
            1f - Mathf.Exp(-2.8f * deltaTime));
        transform.rotation = smoothedRotation;
    }

    private Quaternion FacingRotation(Vector3 direction, float bank)
    {
        if (direction.sqrMagnitude < 0.0001f)
            direction = Vector3.forward;
        Quaternion heading = Quaternion.LookRotation(direction, Vector3.up)
            * Quaternion.Euler(0f, modelYawOffset, 0f);
        return heading * Quaternion.Euler(0f, 0f, bank);
    }

    private void UpdateAnimation(float deltaTime)
    {
        if (!graph.IsValid())
            return;

        float flapTarget = 0f;
        float glideTarget = 0f;
        int dominantInput;
        switch (state)
        {
            case BirdMotionState.Perched:
                dominantInput = PerchedInput;
                break;
            case BirdMotionState.TakingOff:
                dominantInput = TakeoffInput;
                break;
            case BirdMotionState.Landing:
                dominantInput = LandingInput;
                break;
            default:
                dominantInput = -1;
                glideWeight = EvaluateGlideWeight();
                flapTarget = 1f - glideWeight;
                glideTarget = glideWeight;
                break;
        }

        for (int index = 0; index < mixerWeights.Length; index++)
        {
            float target = index == dominantInput ? 1f : 0f;
            if (index == FlightInput)
                target = flapTarget;
            else if (index == GlideInput)
                target = glideTarget;

            mixerWeights[index] = Mathf.MoveTowards(
                mixerWeights[index],
                target,
                deltaTime * 4.5f);
            mixer.SetInputWeight(index, mixerWeights[index]);
        }

        LoopPlayable(PerchedInput);
        LoopPlayable(FlightInput);
        LoopPlayable(GlideInput);
    }

    private float EvaluateGlideWeight()
    {
        float wave = (Mathf.Sin((Time.time * GlideCycleSpeed()) + phaseOffset)
            + 1f) * 0.5f;
        switch (flightStyle)
        {
            case BirdFlightStyle.Gull:
                return Mathf.SmoothStep(0.2f, 0.92f, wave);
            case BirdFlightStyle.Crow:
                return Mathf.SmoothStep(0.12f, 0.78f, wave);
            case BirdFlightStyle.Pigeon:
                return wave > 0.82f ? 0.55f : 0f;
            case BirdFlightStyle.Passerine:
            case BirdFlightStyle.Wagtail:
            case BirdFlightStyle.Bulbul:
                return wave > 0.72f ? 0.68f : 0f;
            case BirdFlightStyle.Egret:
                return wave > 0.9f ? 0.32f : 0f;
            default:
                return 0f;
        }
    }

    private void ApplyImmediateAnimationWeights()
    {
        if (!graph.IsValid())
            return;
        for (int index = 0; index < mixerWeights.Length; index++)
        {
            mixerWeights[index] = 0f;
            mixer.SetInputWeight(index, 0f);
        }
        int input = flightEnabled && continuouslyFlying
            ? FlightInput
            : PerchedInput;
        mixerWeights[input] = 1f;
        mixer.SetInputWeight(input, 1f);
    }

    private void ResetPlayable(int index)
    {
        if (!graph.IsValid() || !playables[index].IsValid())
            return;
        playables[index].SetTime(0d);
        playables[index].SetDone(false);
    }

    private void LoopPlayable(int index)
    {
        AnimationClip clip = clips[index];
        AnimationClipPlayable playable = playables[index];
        if (clip == null || !playable.IsValid() || clip.length <= 0f)
            return;
        double time = playable.GetTime();
        if (time >= clip.length)
            playable.SetTime(time % clip.length);
    }

    private Vector3 CurrentPerch()
    {
        if (perchPoints == null || perchPoints.Length == 0)
            return flightCentre;
        currentPerchIndex = Mathf.Clamp(
            currentPerchIndex,
            0,
            perchPoints.Length - 1);
        return perchPoints[currentPerchIndex];
    }

    private int ChooseNextPerchIndex()
    {
        if (perchPoints == null || perchPoints.Length <= 1)
            return 0;
        int next = Random.Range(0, perchPoints.Length - 1);
        if (next >= currentPerchIndex)
            next++;
        return next;
    }

    private float FlapPlaybackSpeed()
    {
        switch (flightStyle)
        {
            case BirdFlightStyle.Passerine:
                return 2.35f;
            case BirdFlightStyle.Wagtail:
                return 1.95f;
            case BirdFlightStyle.Bulbul:
                return 1.55f;
            case BirdFlightStyle.Pigeon:
                return 1.65f;
            case BirdFlightStyle.Duck:
                return 1.45f;
            case BirdFlightStyle.Egret:
                return 0.58f;
            case BirdFlightStyle.Gull:
                return 0.78f;
            default:
                return 0.9f;
        }
    }

    private float GlideCycleSpeed()
    {
        switch (flightStyle)
        {
            case BirdFlightStyle.Gull:
                return 0.48f;
            case BirdFlightStyle.Crow:
                return 0.62f;
            case BirdFlightStyle.Passerine:
            case BirdFlightStyle.Wagtail:
                return 1.35f;
            default:
                return 0.9f;
        }
    }

    private float TakeoffDuration()
    {
        switch (flightStyle)
        {
            case BirdFlightStyle.Egret:
                return 2.35f;
            case BirdFlightStyle.Gull:
            case BirdFlightStyle.Duck:
                return 1.85f;
            default:
                return 1.25f;
        }
    }

    private float LandingDuration()
    {
        switch (flightStyle)
        {
            case BirdFlightStyle.Egret:
                return 2.8f;
            case BirdFlightStyle.Gull:
            case BirdFlightStyle.Duck:
                return 2.35f;
            default:
                return 1.75f;
        }
    }

    private float TakeoffArcHeight()
    {
        return flightStyle == BirdFlightStyle.Egret ? 1.25f : 0.72f;
    }

    private float LandingArcHeight()
    {
        return flightStyle == BirdFlightStyle.Egret ? 0.9f : 0.48f;
    }

    private void OnDisable()
    {
        if (graph.IsValid())
            graph.Destroy();
        for (int index = 0; index < clips.Length; index++)
            clips[index] = null;
    }
}
