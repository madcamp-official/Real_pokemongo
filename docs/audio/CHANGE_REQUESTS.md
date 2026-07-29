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
