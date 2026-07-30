# Audio MVP external API contract

> Contract version: `audio-mvp-v1`
> JSON keys use `snake_case`.

## Common rules

- All endpoints require the existing authenticated user session.
- `POST /audio/identify` and `POST /audio/similarity/score` are read-only: they must not change observations, dex entries, quests, maps, or rewards.
- Only `POST /audio/identify/confirm` may create an `audio` observation and issue its one-time reward.
- The client never submits a model candidate that was not returned for its own audio sighting.
- Errors use this shape:

```json
{
  "error": "audio_too_short",
  "message": "소리가 너무 짧아요. 3초 이상 녹음해 주세요.",
  "retryable": false,
  "trace_id": "trace_123"
}
```

`trace_id` can be omitted when no server request was made, such as a device-only network error.

## Quality object

```json
{
  "usable": true,
  "duration_ms": 8120,
  "active_duration_ms": 4210,
  "snr_db": 17.4,
  "clipping_ratio": 0.001,
  "silence_ratio": 0.22,
  "speech_ratio": 0.0,
  "feedback_codes": [],
  "valid_segments": [
    { "start_ms": 1100, "end_ms": 5300, "quality_score": 0.87 }
  ]
}
```

Supported blocking `feedback_codes`:

```text
TOO_SHORT
MOSTLY_SILENCE
TOO_NOISY
CLIPPED
SPEECH_DETECTED
MULTIPLE_OVERLAP
UNSUPPORTED_SOUND
NO_TARGET_ACTIVITY
```

`valid_segments` is empty when `usable` is `false`.

## 1. Upload and quality check

`POST /audio/sightings/upload`

Content type: `multipart/form-data`

| Field | Required | Notes |
|---|---:|---|
| `audio` | Yes | M4A/MP4-family mobile recording or WAV; maximum 10 MB |
| `client_recording_id` | Yes | UUID generated once per recording; reused on upload retry |
| `duration_ms` | Yes | Client-measured duration, validated by server decode |
| `recorded_at` | Yes | ISO 8601 timestamp |
| `mode` | Yes | Fixed to `ambient` in MVP |
| `lat`, `lng` | No | Sent only after a separate location choice |

Success (`200`): see `fixtures/upload-success.json`.

Quality rejection (`422`): see `fixtures/upload-quality-rejected.json`.

Other errors: `400 audio_invalid_format`, `413 audio_too_large`, `429 audio_rate_limited`, `503 audio_processor_unavailable`.

## 2. Identify a prepared sighting

`POST /audio/identify`

```json
{ "audio_sighting_id": "audio-sighting-fixture-001" }
```

Success (`200`): see `fixtures/identify-high-confidence.json`, `fixtures/identify-multiple-candidates.json`, and `fixtures/identify-unknown.json`.

Rules:

- Return at most three candidates. Candidates are no longer restricted to the server's taxon DB
  (CR-20260729-species-outside-db) — the model's raw output is surfaced even when the species
  isn't in our dex yet.
- Each candidate has `supported: boolean`. When `false`, `species_id` is `null` and
  `common_name_ko` is the model's raw label (not a taxon record) — this candidate cannot be
  confirmed to the dex or scored for similarity (`400 unsupported_species` / `400 invalid_species_id`
  if attempted).
- `confidence` is calibrated to `0..1`; `confidence_level` is `high`, `medium`, or `low`.
- `unknown: true` means no candidate cleared the low-confidence threshold at all (not the same as
  "species unsupported" — an unsupported species can still appear with `unknown: false`).
- Missing, expired, deleted, or another user's sighting returns the same `404 not_found` response.
- If the sighting's quality was `noisy` (CR-20260729-noisy-audio-reaches-model), only `high`-confidence
  candidates are returned regardless of species support.

## 3. Confirm a returned candidate

`POST /audio/identify/confirm`

```json
{
  "audio_sighting_id": "audio-sighting-fixture-001",
  "species_id": "taxon-hypsipetes-amaurotis",
  "confirmation_id": "7f767b34-9a59-46ea-a3c0-861f5fb9b6c8"
}
```

Success (`200`): see `fixtures/confirm-success.json`.

Rules:

- The submitted species must be in the stored candidate snapshot for that sighting.
- The same `confirmation_id` must return the original success response without creating another observation or reward.
- A sighting may be confirmed only once.
- `409 already_confirmed` is used only when a different confirmation request tries to confirm an already confirmed sighting.
- `400 unsupported_species`: the chosen candidate has `supported: false` (species outside the taxon
  DB) — there is no taxon record to attach an observation to (CR-20260729-species-outside-db).

## 4. Score similarity to a selected species

`POST /audio/similarity/score`

```json
{
  "audio_sighting_id": "audio-sighting-fixture-001",
  "species_id": "taxon-hypsipetes-amaurotis",
  "mode": "ambient"
}
```

Success (`200`): see `fixtures/similarity-success.json`.

The server returns `422 similarity_not_supported_for_species` when the selected species has no approved reference set; see `fixtures/similarity-not-supported.json`.

Rules:

- `score` is an integer from 0 to 100.
- `grade` is `low_similarity`, `somewhat_similar`, `very_similar`, or `strong_match`.
- The score is not the probability that the sound belongs to the species.
- This endpoint has no product side effect.

## 5. Get licensed reference sounds

`GET /species/:species_id/sounds`

Success (`200`):

```json
{
  "species_id": "taxon-hypsipetes-amaurotis",
  "supported_for_similarity": true,
  "reference_set_version": "kr-bird-reference@2026-07",
  "clips": [
    {
      "id": "ref-hypsipetes-001",
      "call_type": "song",
      "duration_ms": 5000,
      "playback_url": "short-lived-signed-url",
      "attribution": "Required attribution text",
      "license": "license-id",
      "source_url": "https://example.invalid/original"
    }
  ]
}
```

## 6. Delete an unconfirmed recording

`DELETE /audio/sightings/:audio_sighting_id`

Success (`204`) has no response body.

- The operation is idempotent for the owner.
- A deleted sighting cannot be identified, scored, or confirmed.
- Confirmed observations retain metadata, but their user-recorded audio still follows the 24-hour deletion rule.
