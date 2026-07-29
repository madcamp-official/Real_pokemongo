# 2단계 — 모델 서비스 구현 결과

`03_소리기능_서버_GPU_구현계획_팀원.md` 5장("2단계 — 모델 서비스")을 CAMP-3
(`root@172.10.5.71`)에 실제로 배포하고 검증한 결과다. 1단계 spike(`SPIKE_REPORT.md`)에서
발견한 제약(GPU 라이브러리 경로, 세션 동시성)을 반영해 설계했는데, **구현 도중 그
반영 자체에서 새 버그를 하나 더 발견해 고쳤다** — 아래 "구현 중 발견한 버그" 참고.

이 폴더의 `stage2-service/`에 실제 배포한 소스(`audio_model_service.py`)와 systemd 유닛
원본(`audio-model-inference.service`)을 참고용으로 복사해뒀다. **실제 운영 원본은
CAMP-3의 `/root/audio_model_service.py` + `/etc/systemd/system/audio-model-inference.service`이며,
BioCLIP 서비스(`/root/inference_server.py`)와 동일하게 이 GPU 서버 쪽 Python 소스는 이
git 저장소의 소스가 아니라 CAMP-3 현지 파일이 정본이다** — 여기 복사본은 리뷰·복구용
스냅샷이다.

## 배포 위치 / 접근 방법

- CAMP-3, `127.0.0.1:8932`에서만 바인딩(BioCLIP의 8931과 동일한 패턴 — 외부 방화벽 대신
  로컬호스트 바인딩이 유일한 접근 통제, seed-service는 SSH 로컬 포트포워딩으로만 접근).
- systemd 유닛 `audio-model-inference.service`, `enable`+`start` 완료 — 재부팅 시에도
  자동 기동(BioCLIP과 동일하게 `WantedBy=multi-user.target`).
- venv: `/root/venvs/audio-model`(python3.11), 모델: `birdnet==0.2.16` acoustic 2.4 pb.

## 내부 API

doc 03이 요구한 4개 엔드포인트를 전부 구현했다.

### `POST /internal/audio/analyze`
요청:
```json
{
  "audio_base64": "<WAV mono PCM 바이트, base64>",
  "valid_segment": {"start_s": 0, "end_s": 10},   // 선택, 현재는 파싱만 하고 자르지 않음(아래 "남은 일" 참고)
  "hint": {"region": "KR", "recorded_at": "2026-07-28T12:00:00Z"}  // 선택, 현재는 응답에 반영 안 함
}
```
응답:
```json
{
  "model_version": "birdnet-acoustic-2.4-pb",
  "quality": {"duration_s": 15.0, "sample_rate": 48000, "segment_duration_s": 3.0},
  "segments": [
    {
      "start_s": 0, "end_s": 3,
      "candidates": [{"sci_name": "...", "label": "...", "score": 0.55}, ...],  // score 내림차순
      "embedding": [0.1, 0.2, ...]  // 1024차원
    },
    ...
  ]
}
```

### `POST /internal/audio/similarity`
요청: `{"audio_base64": "...", "reference_embedding": [1024개 float]}`
응답: `{"model_version": "...", "similarity_raw": 0.70, "n_segments_used": 5}`

등급 매핑(`low_similarity`/`somewhat_similar`/`very_similar`/`strong_match`, API_CONTRACT.md
소관)은 이 서비스가 하지 않는다 — 원시 코사인 유사도만 반환한다(doc 03 "금지" 목록에
"도감·보상 수정"이 있어, 등급 판정처럼 정책이 들어가는 계산은 Fastify/앱 쪽 책임으로
남겨뒀다).

### `GET /health`, `GET /ready`
`/health`는 "프로세스가 살아있고 모델이 로드됐는가"만 본다(BioCLIP과 동일). `/ready`는
한 단계 더 나아가 실제로 짧은 더미 오디오를 추론시켜 세션이 응답하는지 확인한다 —
1단계 spike에서 "프로세스는 살아있는데 세션만 죽어서 영원히 응답 없음" 상태를 실제로
겪었기 때문에, `/health`만으로는 이 실패를 못 잡는다는 게 이유다.

## 1단계 spike 제약의 반영

- **GPU 라이브러리 경로**: systemd 유닛의 `Environment=LD_LIBRARY_PATH=...`로 해결.
- **세션 재사용**: `predict_session`/`encode_session` 둘 다 프로세스 시작 시 딱 한 번만
  열어서(`lifespan`) 계속 재사용. 시작 시 무음 WAV로 워밍업까지 미리 태워서 첫 실제
  요청이 콜드스타트 지연(11~14초)을 떠안지 않게 했다.
- **동시 호출 = 데드락**: `asyncio.Lock()` 하나로 predict/encode 호출을 전부 직렬화
  (BioCLIP의 `inference_server.py`가 이미 쓰던 것과 정확히 같은 패턴 — 우연이 아니라
  같은 GPU/세션 제약이라 같은 해법으로 수렴한 것).

## 구현 중 발견한 버그 (반드시 알아야 할 것)

### 버그 1 — "가짜 데드락": 대기열 혼잡을 세션 장애로 오판해 정상 프로세스를 죽임
처음 구현에서는 "락 획득 대기 + 실제 추론"을 하나의 타임아웃(`asyncio.timeout(15s)`)으로
묶었다. 12개 동시 요청을 쏴서 부하 테스트를 했더니, 대기열(세마포어 상한 8)이 찬 상태에서
늦게 실행된 정상 요청이 "대기 시간 + 실행 시간"의 합이 15초를 넘겼다는 이유만으로
**"세션이 죽었다"고 오판해 `_die()`가 멀쩡히 동작 중인 프로세스 전체를 죽였다** — 실제로
재현하고 로그로 확인함(`elapsed_ms`가 2.2초→13.3초로 요청마다 늘어나다가 결국 타임아웃).

**고친 방법**: 락 "획득 대기"에는 별도의(짧은) 타임아웃을 걸어 여기서 넘으면 그냥 503만
반환하고 프로세스는 그대로 둔다(`_acquire_lock_or_503`). 락을 실제로 잡은 뒤 `session.run()`
자체가 멈추는 것만 진짜 데드락으로 간주해 `_die()`를 부른다. 이 둘을 분리한 뒤
12개 동시 요청 재현 테스트에서 4개 성공/8개 즉시 503/프로세스 생존을 확인했다.
세마포어 상한도 8→4로 낮춰서(요청당 순차 처리 시간이 실측 ~2.2초이므로) 최악의 대기
시간을 대기 타임아웃 예산 안에 들어오게 조정했다.

### 버그 2 — `os._exit()`만으로는 GPU 메모리를 쥔 자식 프로세스가 안 죽음
`_die()`가 처음엔 `os._exit(1)`만 호출했는데, 이러면 `predict_session`/`encode_session`이
내부적으로 띄운 멀티프로세싱 워커 자식 프로세스들이 **고아 프로세스(PPID=1)로 남아
GPU 메모리(약 15GB)를 계속 붙잡는다** — 실제로 uvicorn을 systemd 없이 수동으로 띄워
재현·확인했다(자식들이 살아있는데 부모만 죽어서, 이후 프로세스가 재시작돼도 GPU 메모리가
누적되는 상황이 될 뻔했다).

**고친 방법**: `_die()`가 `os.killpg(os.getpgrp(), signal.SIGKILL)`로 프로세스 그룹
전체를 죽인 뒤 종료하도록 수정. 검증 방법: 워커 프로세스에 `SIGSTOP`을 보내 인위적으로
멈춰놓고(`CALL_TIMEOUT_S`를 2초로 낮춘 테스트 사본으로) 실제로 `/internal/audio/analyze`를
호출해 타임아웃→`_die()`가 발동하는 걸 확인했고, 그 결과 멈춰 있던 워커까지 포함해
프로세스 그룹 전체가 사라지고 GPU 메모리가 정확히 원래 베이스라인(13.6GB)으로
복귀하는 것을 확인했다. 추가로 systemd 유닛에도 `KillMode=control-group`을 명시해
이중으로 방어했다(systemd가 이미 v230+ 기본값으로 이렇게 동작하지만, 이 서비스의
특성상 명시해두는 게 안전하다고 판단).

## 검증한 항목 (전부 실측)

- `/health`, `/ready` 정상 응답.
- `/internal/audio/analyze` 동일 입력 재실행 시 **완전히 동일한 JSON**(재현성, doc 03
  완료 기준).
- 안전 거부: 잘못된 base64(400), 오디오가 아닌 바이트(400), M4A(400, 미지원 포맷),
  10MB 초과 페이로드(413), 15초 초과 길이(400) — 전부 크래시 없이 깔끔한 에러로 처리.
- 동시 요청 4/8/12개 부하 테스트: 상한(4) 이내는 성공, 초과분은 503으로 안전하게 거부,
  프로세스는 계속 응답(데드락 재현 안 됨).
- `systemctl restart` 후 GPU 메모리·프로세스 수가 재시작 전과 동일(누수 없음),
  `/ready` 재확인 통과.
- BioCLIP(`bioclip-inference.service`)과 Postgres(`postgresql@14-main.service`)는
  이 모든 테스트 내내 `active` 유지, 디스크 17GB 여유(84% 사용 — 계속 지켜볼 것).

## 아직 안 한 것 (3단계 이후 범위)

- `valid_segment`/`hint` 파라미터는 현재 파싱만 하고 실제로 오디오를 자르거나 지역/시절
  필터에 반영하지 않는다 — 필요해지면 3단계(업로드/변환) 연동 시점에 구현.
- Fastify 쪽에서 이 서비스를 호출하는 TS 어댑터(`BioClipProvider.ts`에 대응하는
  `AudioModelProvider.ts` 같은 것)는 아직 없음 — 3단계 이후 작업.
- 참조 음원 임베딩을 실제로 채워 `similarity`에 넘기는 파이프라인(8단계, 사람 검수 후
  임베딩 추출)은 별도 진행 중(`research/audio-reference-pool/`).
