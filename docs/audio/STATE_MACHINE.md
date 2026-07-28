# Audio MVP state machines

> Contract version: `audio-mvp-v1`

## App recording state machine

```text
idle
  -> requesting_permission
  -> ready
  -> recording
  -> local_checking
  -> uploading
  -> identifying
  -> result
  -> confirming
  -> confirmed
```

| State | Entered by | Allowed next states | Required behavior |
|---|---|---|---|
| `idle` | Screen opened | `requesting_permission`, `ready` | No active recorder |
| `requesting_permission` | User starts feature | `ready`, `failed`, `discarded` | Request microphone permission once |
| `ready` | Permission granted | `recording`, `discarded` | Show instructions and record button |
| `recording` | User taps record | `local_checking`, `discarded` | Show elapsed time; auto-stop at 15 seconds |
| `local_checking` | Recording stops | `ready`, `uploading`, `discarded` | Reject local duration below 3 seconds |
| `uploading` | Local file accepted | `identifying`, `failed`, `discarded` | Reuse the same `client_recording_id` on retry |
| `identifying` | Upload accepted | `result`, `failed`, `discarded` | Do not create an observation |
| `result` | Identify returns | `confirming`, `ready`, `discarded` | Display candidates or unknown result |
| `confirming` | User confirms candidate | `confirmed`, `failed` | Disable duplicate confirmation action |
| `confirmed` | Confirm succeeds | `idle` | Refresh only relevant dex/map/reward queries |
| `failed` | API/device error | `ready`, `uploading`, `identifying`, `discarded` | Preserve a safe retry path |
| `discarded` | User closes/deletes | `idle` | Delete local file and call remote delete when applicable |

Rules:

- A recording can never run concurrently with another recording.
- App backgrounding, audio interruption, or input-device loss ends the recorder and discards an incomplete file.
- The loading UI remains mounted while its label changes from local check to upload to identification; it must not blink by remounting the spinner.
- Logging out clears unconfirmed local audio and the audio upload queue.

## Server sighting state machine

```text
uploaded -> quality_checked -> identified -> confirmed
                   |                |
                   v                v
                rejected          deleted

uploaded/quality_checked/identified -> expired
```

| State | Meaning | Allowed operation |
|---|---|---|
| `uploaded` | File stored but not fully inspected | Quality processing only |
| `quality_checked` | Usable recording with valid segments | Identify or score |
| `identified` | Candidate snapshot is stored | Identify again, score, or confirm |
| `rejected` | Quality or privacy gate failed | Read failure result, then delete only |
| `confirmed` | One observation has been created | Read original confirmation result only |
| `deleted` | Owner explicitly removed temporary recording | No further operation |
| `expired` | TTL cleanup removed temporary recording | No further operation |

Rules:

- `(user_id, client_recording_id)` makes upload retry idempotent.
- `confirmation_id` makes confirmation retry idempotent.
- `identify` stores the server result before returning it.
- `confirm` accepts only the stored result candidate set.
- Authorization failure and nonexistence both return `404 not_found`.
- The deletion task expires unconfirmed raw and canonical audio within 24 hours.
