# Audio MVP common-design acceptance criteria

> Contract version: `audio-mvp-v1`

## Contract completion gate

- [x] MVP decisions are approved.
- [x] Supported example taxa exist in `seed-service/src/seed/seedData.ts`.
- [x] External endpoint names and JSON keys are fixed.
- [x] State transitions and idempotency keys are fixed.
- [x] Observation, media, temporary audio, and reference audio data requirements are fixed.
- [x] Nine shared JSON fixtures exist.
- [x] Each fixture validates as JSON before handoff.
- [x] `COMMON_DESIGN_COMMIT` is committed and pushed.

## Required implementation scenarios

| # | Scenario | Expected result |
|---:|---|---|
| 1 | 8-second bird recording | Upload succeeds and candidates are displayed |
| 2 | 2-second recording | App stops before upload and asks for 3 seconds or more |
| 3 | Mostly silent audio | Quality rejection; no observation or reward |
| 4 | Speech-dominant audio | Upload succeeds (not rejected); model inference proceeds, but only `high`-confidence candidates are accepted (CR-20260729-noisy-audio-reaches-model) |
| 5 | Candidate result without confirmation | No dex, map, quest, or reward mutation |
| 6 | Valid confirmation | One `audio` observation and one reward result |
| 7 | Confirmation repeated three times | Exactly one observation and one reward |
| 8 | Similarity scoring | Score shown; no product mutation |
| 9 | Species with no reference set | Explicit unsupported response |
| 10 | Network/model failure | Retryable error; never shown as an unknown bird |
| 11 | Expired/deleted temporary audio | No further identify, score, or confirm permitted |
| 12 | Existing photo flow | Photo capture, identify, confirm, map, dex, garden, and rewards remain unchanged |

## Handoff package

The common-design owner hands both implementers:

```text
COMMON_DESIGN_COMMIT
docs/audio/DECISIONS.md
docs/audio/API_CONTRACT.md
docs/audio/STATE_MACHINE.md
docs/audio/DATA_CONTRACT.md
docs/audio/fixtures/
```

The app implementer works in `feature/audio-app`. The server/GPU implementer works in `feature/audio-server-gpu`. Neither edits shared contracts directly.
