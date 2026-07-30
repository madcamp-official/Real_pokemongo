# Audio MVP contract change requests

> Contract owner: common-design owner (user)

### CR-20260728-practice-mode-in-scope

- Requested by: server/GPU implementer (agent), on behalf of the user's original feature framing
- Date: 2026-07-28
- Affected contract file and endpoint/state/data field: `DECISIONS.md` → "Approved scope" table, row `Practice/imitation mode`
- Current behavior: `DECISIONS.md` states `Practice/imitation mode | Not included in MVP`, while `API_CONTRACT.md` (same contract version) already fully specifies `POST /audio/similarity/score` and `GET /species/:species_id/sounds`, with matching fixtures (`similarity-success.json`, `similarity-not-supported.json`) — the two files disagree.
- Proposed behavior: Treat the mimicry/similarity game as in scope for MVP, matching `API_CONTRACT.md` (which already fully describes it) and the user's original two-goal framing of this feature (bird-sound identification + call-mimicry similarity game).
- Why this is needed: `DECISIONS.md`'s exclusion line appears stale relative to the rest of the same contract version — `API_CONTRACT.md`/fixtures were clearly written assuming this feature ships. Leaving the contradiction in place would leave server/GPU Stage 8 (reference audio + similarity) ambiguous about whether to build it.
- App compatibility impact: None — `API_CONTRACT.md` (app's implementation target) does not change.
- Server/GPU compatibility impact: None — Stage 8 of `03_소리기능_서버_GPU_구현계획_팀원.md` already plans this work; this CR just removes the doc contradiction blocking it.
- Fixture changes required: None.
- Decision: accepted (2026-07-28, confirmed by contract owner via chat)
- Accepted contract version: `audio-mvp-v1` (no version bump — this corrects an internal inconsistency, it does not change any endpoint behavior already documented in `API_CONTRACT.md`)

### CR-20260729-noisy-audio-reaches-model

- Requested by: contract owner (user), directly via chat
- Date: 2026-07-29
- Affected contract file and endpoint/state/data field: `API_CONTRACT.md` "Quality object" (`feedback_codes` semantics for `TOO_NOISY`/`SPEECH_DETECTED`/`MULTIPLE_OVERLAP`); internal-only addition to `AudioQuality` (`noisy: boolean`, not exposed over HTTP) and to `AudioIdentificationGateway.identify()` (optional `requireHighConfidence` safeguard).
- Current behavior: `TOO_NOISY`, `SPEECH_DETECTED`, and `MULTIPLE_OVERLAP` block the upload (`usable: false`) before the audio ever reaches BirdNET.
- Proposed behavior: These three codes no longer block `usable`. The upload proceeds to `/audio/identify` even when noise or speech is present. Internally, the analyzer still computes the same three signals and folds them into a `noisy` flag (not sent to the client); when `noisy` is true, `AudioIdentificationGateway.identify()` only accepts `high`-confidence candidates (drops `medium`/`low`) as a misidentification safeguard. `TOO_SHORT`/`MOSTLY_SILENCE`/`CLIPPED`/`UNSUPPORTED_SOUND`/`NO_TARGET_ACTIVITY` are unchanged (still blocking) — those mean "no usable signal at all," not "noisy signal."
- Why this is needed: User's explicit product requirement — "노이즈(사람 소리, 바람 소리 등)가 섞여 있어도 새소리를 인식하고 동정해야 한다." The prior policy (see `03_소리기능_서버_GPU_구현계획_팀원.md` §7, `DECISIONS.md`) was a deliberate privacy/consent safeguard against processing bystanders' speech, not an accuracy feature; the tradeoff (accuracy vs. the original privacy rationale) was explained to the contract owner in chat before this CR, who accepted it knowingly.
- App compatibility impact: None — `feedback_codes` remains a subset of the documented 8 values; the three noise-related codes simply stop appearing (no new values, no shape change). `noisy` is never serialized into any HTTP response.
- Server/GPU compatibility impact: `AudioIdentificationGateway.identify()` gains an optional second parameter, backward compatible with existing callers/tests that omit it.
- Fixture changes required: None (success/rejection response shapes unchanged).
- Decision: accepted (2026-07-29, confirmed by contract owner via chat)
- Accepted contract version: `audio-mvp-v1` (no version bump — internal safeguard relocation, no endpoint/response shape change)

### CR-20260729-species-outside-db

- Requested by: contract owner (user), directly via chat
- Date: 2026-07-29
- Affected contract file and endpoint/state/data field: `API_CONTRACT.md` §2 "Identify a prepared sighting" (candidates no longer restricted to the taxon DB; new `supported`/nullable `species_id` fields) and §3 "Confirm a returned candidate" (new `400 unsupported_species` error).
- Current behavior: BirdNET candidates whose scientific name doesn't resolve to a taxon record are silently dropped before reaching the client; only DB-covered species (18 birds at time of writing) can ever appear as a candidate.
- Proposed behavior: All candidates that clear the confidence/noise gates are returned, regardless of taxon DB coverage. Each candidate gains `supported: boolean`; when `false`, `species_id` is `null` and `common_name_ko` is the model's raw label (not a real taxon). `/audio/identify/confirm` and `/audio/similarity/score` both reject unsupported candidates — confirm explicitly with `400 unsupported_species` (checked before claiming the confirmation slot); similarity naturally 400s via the existing `invalid_species_id` path since there is no real `species_id` to submit.
- Why this is needed: User's explicit product decision — the 18-species taxon DB was found to be a major cause of "동정 실패" during real testing (BirdNET correctly identifying species the app then hid). The user chose to surface the model's true output rather than hide it, while still hard-blocking dex registration for species without real taxon data (no Korean name, no safety classification, no dex art) — registering those would either fabricate data or silently under-inform on danger.
- App compatibility impact: `AudioIdentifyCandidate.species_id` becomes nullable and gains `supported: boolean`; existing candidates for DB-covered species are unaffected (`supported: true`, non-null `species_id`). Client must disable "record to dex" / "compare sound" actions when `supported: false`.
- Server/GPU compatibility impact: `AudioIdentificationCandidate.speciesId` is now `TaxonId | null`; `AudioIdentificationGateway.identify()` no longer drops taxon-less candidates.
- Fixture changes required: Yes — `identify-high-confidence.json` and `identify-multiple-candidates.json` gained `"supported": true` on existing candidates (additive, no other field changed).
- Decision: accepted (2026-07-29, confirmed by contract owner via chat)
- Accepted contract version: `audio-mvp-v1` (no version bump — additive field, no existing field removed or repurposed)

## Request template

```md
### CR-YYYYMMDD-short-title

- Requested by:
- Date:
- Affected contract file and endpoint/state/data field:
- Current behavior:
- Proposed behavior:
- Why this is needed:
- App compatibility impact:
- Server/GPU compatibility impact:
- Fixture changes required:
- Decision: pending / accepted / rejected
- Accepted contract version:
```
