# Audio MVP decisions

> Contract version: `audio-mvp-v1`
> Baseline commit: `2866770`
> Owner: common-design owner (user)

## Approved scope

| Item | Decision |
|---|---|
| Supported life group | Birds only |
| Recording duration | Minimum 3 seconds, recommended 6–10 seconds, maximum 15 seconds |
| Analysis location | CAMP-3 GPU server |
| First model | BirdNET; Perch evaluation is a follow-up task |
| Unconfirmed recording retention | Automatic deletion within 24 hours |
| Observation creation | Only after the user confirms a returned candidate |
| Similarity score side effects | Never changes the dex, map, quest, or rewards |
| Practice/imitation mode | Included in MVP (revised 2026-07-28, see `CHANGE_REQUESTS.md` CR-20260728-practice-mode-in-scope — this row was stale relative to `API_CONTRACT.md`, which already fully specifies it) |

## Additional MVP decisions

- The app records only while in the foreground and only after a user action.
- The model is a server-side service. No acoustic model is bundled with the app.
- The app uploads a mobile recording; the server validates and converts it to model-native mono PCM.
- A confirmed audio observation is saved with `modality = "audio"`.
- User-recorded raw and converted audio expire within 24 hours even when the observation is confirmed. MVP does not provide playback of a user's own recording.
- Licensed species reference clips are stored separately and are the only clips shown in the app's reference player.
- Speech-dominant recordings are rejected, are not transcribed, and are not retained after rejection.
- Location is optional and is never required for recording, identification, or similarity scoring.
- (2026-07-28) App commercial status: **non-commercial for now**. Recorded because Xeno-canto's API terms are described as free for non-commercial use — this makes Xeno-canto usable as the reference-sound source under `seed-service/research/audio-reference-pool/`. If the app's commercial status changes later, re-check Xeno-canto's terms and the license filter (currently CC0/CC-BY/CC-BY-SA only) before adding more reference clips.

## Fixed example taxa

| Scenario | Korean name | Taxon ID |
|---|---|---|
| High-confidence identification | 직박구리 | `taxon-hypsipetes-amaurotis` |
| Multiple candidates | 참새 | `taxon-passer-montanus` |
| Different-sound comparison | 까치 | `taxon-pica-serica` |

## Ownership and change rule

- `docs/audio/` is owned by the common-design owner.
- The app owner and server/GPU owner implement this contract without editing it.
- A requested change is written to `CHANGE_REQUESTS.md` with a reason, affected endpoint, compatibility impact, and proposed version.
- The contract owner accepts or rejects the change before either implementation changes behavior.

## Version rule

- Every server result includes `model_version`.
- Every similarity result includes `reference_set_version`.
- An incompatible API change requires a new contract version; it must not silently replace `audio-mvp-v1`.
