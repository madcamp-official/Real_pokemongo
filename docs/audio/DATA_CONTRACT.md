# Audio MVP data contract

> Contract version: `audio-mvp-v1`

## Existing observation extension

```ts
type ObservationModality = "photo" | "audio";

type Observation = {
  // existing fields remain unchanged
  modality: ObservationModality;
};
```

Migration invariant:

- Every existing observation becomes `modality = "photo"`.
- Existing photo upload, identification, reward, quest, dex, and map queries continue to work with no behavior change.

## Media metadata extension

```ts
type MediaKind = "image" | "audio";
type RetentionClass = "temporary" | "reference";

type MediaMetadata = {
  mediaKind: MediaKind;
  mimeType: string;
  durationMs?: number;
  sha256: string;
  retentionClass: RetentionClass;
  derivedFromMediaId?: string;
};
```

MVP does not retain a user's audio as permanent observation media. User audio is `temporary`; licensed species reference media is `reference`.

## audio_sighting

| Field | Requirement |
|---|---|
| `id` | Server-generated audio sighting ID |
| `user_id` | Required owner |
| `client_recording_id` | Required UUID; unique with `user_id` |
| `status` | `uploaded`, `quality_checked`, `identified`, `rejected`, `confirmed`, `deleted`, or `expired` |
| `original_media_ref` | Temporary encrypted/original upload reference |
| `canonical_media_ref` | Temporary converted mono PCM reference |
| `quality_json` | `AudioQualityResult` snapshot |
| `recorded_at` | Client recording timestamp |
| `coarse_region` | Optional privacy-preserving region |
| `precise_coord` | Optional; only after location choice |
| `expires_at` | Required, no later than 24 hours after upload |
| `confirmed_observation_id` | Nullable; set once |

## audio_identification_result

| Field | Requirement |
|---|---|
| `audio_sighting_id` | Unique sighting reference |
| `candidates_json` | Candidate snapshot used by confirm validation |
| `model_provider` | e.g. `birdnet` |
| `model_version` | Required immutable version |
| `location_prior_used` | Boolean |
| `created_at` | Required |

## species_sound_reference

| Field | Requirement |
|---|---|
| `id` | Reference clip ID |
| `taxon_id` | Existing supported bird taxon ID |
| `media_ref` | Licensed reference audio |
| `call_type` | e.g. `song`, `call`, `alarm` |
| `source_url`, `creator`, `license`, `attribution` | Required licensing metadata |
| `quality_status` | `pending`, `approved`, or `rejected` |
| `reference_set_version` | Required immutable set version |
| `embedding_ref` | Precomputed embedding reference |
| `embedding_model_version` | Required |

## Privacy and deletion

- User audio is never used for training without a future, separate opt-in.
- Speech-dominant audio is rejected and not retained after rejection.
- A cleanup job deletes raw and canonical user audio at or before `expires_at`, including for confirmed observations.
- User data export/deletion must include audio sighting metadata and any still-live temporary audio.
- Reference audio has its own licensed retention policy and is not deleted by user account deletion.
