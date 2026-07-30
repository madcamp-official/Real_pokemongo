using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Animations;
using UnityEngine.Playables;

public sealed class GreyHeronBehaviour : MonoBehaviour
{
    public string animationResourcePath = "Models/GreyHeronRigged";
    public float blendSpeed = 5f;

    private readonly List<AnimationClip> clips = new List<AnimationClip>();
    private readonly List<AnimationClipPlayable> playables = new List<AnimationClipPlayable>();
    private PlayableGraph graph;
    private AnimationMixerPlayable mixer;
    private int idleIndex = -1;
    private int peckIndex = -1;
    private int wingIndex = -1;
    private int currentIndex = -1;
    private int previousIndex = -1;
    private float stateTime;
    private int idleLoopsRemaining = 1;

    private void OnEnable()
    {
        BuildAnimationGraph();
    }

    private void BuildAnimationGraph()
    {
        Animator animator = GetComponentInChildren<Animator>();
        if (animator == null)
        {
            Debug.LogWarning("왜가리 Animator를 찾지 못했습니다.", this);
            return;
        }

        AnimationClip[] loadedClips = Resources.LoadAll<AnimationClip>(animationResourcePath);
        for (int index = 0; index < loadedClips.Length; index++)
        {
            AnimationClip clip = loadedClips[index];
            if (clip == null || clip.length <= 0f)
                continue;

            int clipIndex = clips.Count;
            clips.Add(clip);
            string lowerName = clip.name.ToLowerInvariant();
            if (lowerName.Contains("idle"))
                idleIndex = clipIndex;
            else if (lowerName.Contains("peck"))
                peckIndex = clipIndex;
            else if (lowerName.Contains("wing"))
                wingIndex = clipIndex;
        }

        if (clips.Count == 0)
        {
            Debug.LogWarning("왜가리 애니메이션 클립을 불러오지 못했습니다.", this);
            return;
        }

        if (idleIndex < 0)
            idleIndex = 0;

        graph = PlayableGraph.Create("Grey Heron Behaviour");
        graph.SetTimeUpdateMode(DirectorUpdateMode.GameTime);
        mixer = AnimationMixerPlayable.Create(graph, clips.Count);
        AnimationPlayableOutput output = AnimationPlayableOutput.Create(graph, "Grey Heron Animation", animator);
        output.SetSourcePlayable(mixer);

        for (int index = 0; index < clips.Count; index++)
        {
            AnimationClipPlayable playable = AnimationClipPlayable.Create(graph, clips[index]);
            playable.SetApplyFootIK(false);
            playable.SetApplyPlayableIK(false);
            graph.Connect(playable, 0, mixer, index);
            mixer.SetInputWeight(index, 0f);
            playables.Add(playable);
        }

        currentIndex = idleIndex;
        mixer.SetInputWeight(currentIndex, 1f);
        playables[currentIndex].SetTime(0d);
        graph.Play();
    }

    private void Update()
    {
        if (!graph.IsValid() || currentIndex < 0)
            return;

        stateTime += Time.deltaTime;
        float clipLength = Mathf.Max(0.1f, clips[currentIndex].length);
        if (stateTime >= clipLength)
        {
            if (currentIndex == idleIndex && idleLoopsRemaining > 0)
            {
                idleLoopsRemaining--;
                playables[currentIndex].SetTime(0d);
                stateTime = 0f;
            }
            else
            {
                ChooseNextState();
            }
        }

        for (int index = 0; index < clips.Count; index++)
        {
            float targetWeight = index == currentIndex ? 1f : 0f;
            float currentWeight = mixer.GetInputWeight(index);
            mixer.SetInputWeight(index, Mathf.MoveTowards(currentWeight, targetWeight, Time.deltaTime * blendSpeed));
        }

        if (previousIndex >= 0 && mixer.GetInputWeight(previousIndex) <= 0.001f)
            previousIndex = -1;
    }

    private void ChooseNextState()
    {
        int nextIndex;
        if (currentIndex != idleIndex)
        {
            nextIndex = idleIndex;
            idleLoopsRemaining = Random.Range(1, 3);
        }
        else if (peckIndex >= 0 && wingIndex >= 0)
        {
            nextIndex = Random.value < 0.72f ? peckIndex : wingIndex;
        }
        else if (peckIndex >= 0)
        {
            nextIndex = peckIndex;
        }
        else if (wingIndex >= 0)
        {
            nextIndex = wingIndex;
        }
        else
        {
            nextIndex = idleIndex;
        }

        previousIndex = currentIndex;
        currentIndex = nextIndex;
        stateTime = 0f;
        playables[currentIndex].SetTime(0d);
        playables[currentIndex].SetSpeed(1d);
    }

    private void OnDisable()
    {
        if (graph.IsValid())
            graph.Destroy();
        clips.Clear();
        playables.Clear();
        currentIndex = -1;
    }
}
