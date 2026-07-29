# 1단계 — BirdNET 기술 검증 spike 결과

`03_소리기능_서버_GPU_구현계획_팀원.md` 4장("1단계 — BirdNET 기술 검증")에서 요구하는
spike를 CAMP-3(`root@172.10.5.71`)에서 실제로 실행해 얻은 결과다. 아래 모든 수치는
추측이 아니라 CAMP-3에서 직접 돌린 스크립트(`scripts/spike_0*.py`, 원시 로그
`scripts/out_0*.log`)의 실제 출력이다.

**결론 먼저**: BirdNET(2.4, GPU)은 우리 18종 전부를 인식하고, 지속 세션 기준 지연도
충분히 빠르다(1~1.1초). 다만 실제 2단계 서비스로 만들 때 **반드시 지켜야 할 제약 두 가지**를
이번에 발견했다 — (1) GPU pip 설치는 `LD_LIBRARY_PATH`를 수동으로 잡아줘야 하고,
(2) 세션 하나에 동시에 두 개 이상의 요청을 넣으면 **예외 없이 영원히 멈춘다(데드락)**.
이 두 가지를 빼먹으면 2단계에서 "GPU를 켰다고 착각하고 실제로는 CPU로 도는" 상황이나
"트래픽이 겹치자마자 서비스가 통째로 멈추는" 장애로 이어진다.

## 모델 버전 / 설치 방법

- 패키지: `birdnet` (PyPI, `birdnet-team` 공식) **0.2.16**
- 모델: `acoustic` 타입, 버전 **"2.4"**(현재 pip 패키지가 지원하는 유일한 acoustic 버전.
  웹 검색으로 나온 "V3.0 / pt / onnx 백엔드"는 이 pip 패키지에는 아직 없음 —
  `birdnet/globals.py`의 `VALID_ACOUSTIC_MODEL_VERSIONS`/`VALID_MODEL_BACKENDS`를 직접
  읽어 확인함)
- 백엔드: **`pb`**(ProtoBuf, GPU 지원 + 임베딩 지원) — `tf`(TFLite)는 CPU 전용이라 제외
- 언어: `lang="ko"` — 한국어 공용명이 기본 내장돼 있음(예: `Hypsipetes amaurotis_직박구리`)

**설치 순서(실제로 성공한 절차)**:

1. CAMP-3의 시스템 Python은 3.10.12뿐인데, `birdnet>=0.2.0`은 Python **3.11+**를 요구함.
   → `deadsnakes` PPA로 `python3.11`만 추가 설치(기존 3.10과 bioclip 서비스는 그대로 둠,
   설치 후 `postgresql@14-main`/`bioclip-inference` 서비스 uptime으로 무영향 확인함).
2. `python3.11 -m venv /root/venvs/audio-model`
3. `pip install 'birdnet[and-cuda]==0.2.16'`
4. **(중요, 버그 발견/해결)** GPU를 실제로 쓰려면 `LD_LIBRARY_PATH`를 pip로 설치된
   `nvidia-*-cu12` 패키지의 `lib/` 경로들로 수동 설정해야 한다. PyTorch(BioCLIP이 쓰는)와
   달리 TensorFlow pip 배포판은 이 경로를 자동으로 찾지 못한다 — 설정하지 않으면
   `tf.config.list_physical_devices('GPU')`가 조용히 빈 리스트를 반환하고("Cannot dlopen
   some GPU libraries" 경고만 뜸), BirdNET은 이를 `AssertionError`로 처리해 매 요청마다
   워커가 죽는다. `/root/venvs/audio-model/bin/activate`에 아래를 추가해 해결함:
   ```bash
   export LD_LIBRARY_PATH="$(find /root/venvs/audio-model/lib/python3.11/site-packages/nvidia -maxdepth 2 -type d -name lib | paste -sd: -)"
   ```
   **2단계에서 systemd 유닛을 만들 때 `Environment=LD_LIBRARY_PATH=...`로 반드시 동일하게
   설정해야 한다** — 안 하면 GPU 백엔드가 매 요청마다 조용히 실패한다.

## 지원 입력 형식

실제 코드(`birdnet/acoustic/models/v2_4/model.py`가 참조하는 sndfile 포맷 목록)와 직접
만든 M4A 테스트 파일로 검증:

- **지원**: MP3, WAV, FLAC, OGG, OPUS, AIFF 등 (libsndfile 계열 대부분)
- **미지원 — 실제로 거부됨**: `.m4a`(AAC) — `ffmpeg`으로 만든 테스트 파일을 넣었더니
  `ValueError("... is not a supported audio format!")`로 즉시 거부됨.
  → 아이폰 등에서 M4A/AAC로 녹음될 경우 3단계("오디오 업로드와 변환")의 WAV mono PCM
  변환이 **선택이 아니라 필수**임이 실증됨.

## 지연 시간 (평균 / P95)

**주의**: `model.predict()`를 매번 새로 호출하면(세션을 새로 여닫으면) 워커 프로세스 기동 +
모델 로드 오버헤드로 **매 요청 11~14초**가 걸린다. 반면 `model.predict_session(...)`을
**한 번만 열고 계속 재사용**하면(2단계 서비스가 취해야 할 패턴) 요청당 지연이 급격히 준다.
아래는 지속 세션 기준, 3종(직박구리/참새/까치) × 5회 반복(워밍업 1회 제외, n=15/구간):

| 입력 길이 | mean | P95 | min | max |
|---|---|---|---|---|
| 3초  | 1.029s | 1.031s | 1.028s | 1.032s |
| 6초  | 1.047s | 1.050s | 1.042s | 1.051s |
| 10초 | 1.082s | 1.087s | 1.072s | 1.088s |
| 15초 | 1.096s | 1.102s | 1.082s | 1.103s |

(첫 콜드 스타트: 워밍업 호출 11.068초 — 통계에서 제외)

**동일 파일 반복 추론 안정성**: `hypsipetes_15s.wav`를 5회 반복 추론한 top-5 결과(종 이름 +
확률)가 **완전히 동일**함을 확인(`scripts/out_02.log` B절). 결정론적으로 재현됨.

## CPU/GPU 사용량

- 백엔드 `pb` + `device="GPU:0"`로 로드 시 실제 GPU(RTX 3090)에서 실행됨 —
  `tf.config.list_physical_devices('GPU')`가 `[PhysicalDevice(name='/physical_device:GPU:0', ...)]`을
  반환하는 것으로 확인(`LD_LIBRARY_PATH` 수정 후).
- 추론 중 GPU 메모리 점유는 약 14.6GB(memory_growth=True라 필요한 만큼만 늘어남).
  기존 BioCLIP 서비스(11.2GB 상주)와 합쳐도 순간적으로는 겹치지만, **추론 종료 후 즉시
  반환되어 베이스라인(13.6GB, BioCLIP + 기타 프로세스만)으로 복귀**함을 확인 —
  BioCLIP 서비스는 spike 실행 전/중/후 내내 `active` 상태 유지, 재시작 없음.
- `nvidia-smi` 순간 스냅샷(폴링 타이밍이 짧은 추론 구간을 놓쳐 `0%`로 찍힘)은 GPU
  사용률 측정 방법으로 부적합함을 확인 — 실제 사용 여부는 물리 디바이스 목록 확인과
  메모리 점유 변화로 판단해야 한다(순간 utilization% 폴링은 신뢰 불가).

## 샘플 입력과 원시 결과

`scripts/out_01.log`, `scripts/out_03.log`에 원시 `predict()`/`encode()` 반환값 전체가
있다. 주의할 점(디코딩 시 실수하기 쉬움): **`species_probs`/`species_ids`는 세그먼트별로
오름차순 정렬**돼 있다 — top-1은 인덱스 `[0]`이 아니라 **`[-1]`(마지막)**이다. 이 순서를
반대로 읽으면 "모델이 아예 새를 못 알아듣는다"는 잘못된 결론에 이르기 쉽다(처음에 이
실수를 했다가 `scripts/spike_03_decode_check.py`로 원시 배열을 직접 찍어보고 발견/수정함).

`encode()`(임베딩 추출)도 정상 동작 확인 — `AcousticFileEncodingResult.embeddings`,
`emb_dim` 속성으로 접근 가능. 8단계(유사도 게임)에서 이 임베딩을 참조 음원과 비교하는
용도로 쓸 수 있음.

## 현재 seed 18종 매핑 결과

**어휘 포함 여부(species_list 매칭)**: **18종 전부 BirdNET 6,522종 목록에 존재**.

**실제 오디오로 top-1 식별 결과**(Xeno-canto 실제 녹음, 최대 60초 구간, 세그먼트별 top-1
중 최고 신뢰도 — 전체 로그는 `scripts/out_04.log`):

| 한글명 | 학명(seedData.ts 기준) | 결과 |
|---|---|---|
| 직박구리 | Hypsipetes amaurotis | ✅ 0.996 |
| 참새 | Passer montanus | ✅ 0.766 |
| 멧비둘기 | Streptopelia orientalis | ✅ 0.951 |
| 왜가리 | Ardea cinerea | ✅ 0.951 |
| 큰부리까마귀 | Corvus macrorhynchos | ✅ 0.963 |
| 까치 | Pica serica | ✅ 0.786 (해당 녹음 전체 1위는 곤줄박이 0.966 — 다른 새도 같이 녹음됨) |
| 딱새 | Phoenicurus auroreus | ✅ 0.946 |
| 괭이갈매기 | Larus crassirostris | ✅ 0.996 |
| 청둥오리 | Anas platyrhynchos | ✅ 0.969 |
| 대백로 | Ardea alba | ✅ 0.826 (BirdNET 한글 라벨은 "중대백로" — 학명은 동일, 국명만 다름) |
| 붉은머리오목눈이 | Sinosuthora webbiana | ✅ 1.000 |
| **박새** | **Parus cinereus** | **❌ 이 학명은 모델에 있지만 0%. 실제로 이 녹음의 최고 예측은 `Parus minor_박새`(0.999) — 아래 "발견 3" 참고** |
| 쇠박새 | Poecile palustris | ✅ 0.886 |
| 노랑턱멧새 | Emberiza elegans | ✅ 0.359 (약함, 해당 녹음 전체 1위는 쑥새 0.637) |
| **흰뺨검둥오리** | **Anas zonorhyncha** | **❌ 이 녹음에서 target이 1위인 구간 없음(0%). 전체 1위는 청둥오리 0.820 — 아래 "발견 4" 참고** |
| 알락할미새 | Motacilla alba | ✅ 0.994 |
| 민물가마우지 | Phalacrocorax carbo | ✅ 0.996 |
| 물까치 | Cyanopica cyanus | ✅ 0.744 |

**16/18 정상 식별.** 나머지 2건은 아래 "추가로 발견한 이슈"에서 설명.

## 라이선스 검토 메모

- **코드(`birdnet` 패키지)**: MIT License.
- **모델 가중치**: **CC BY-NC-SA 4.0** (Creative Commons 표시-비영리-동일조건변경허락).
  BirdNET 공식 문서는 "교육·연구 목적은 비영리 사용으로 간주한다"고 명시.
- 우리 앱은 이미 `docs/audio/DECISIONS.md`(2026-07-28)에 **비영리로 확정**돼 있으므로
  모델 사용에 라이선스 문제 없음. 단, **앱이 나중에 상업적 성격을 띠면 참조 음원
  라이선스(Xeno-canto NC 클립)뿐 아니라 이 모델 가중치 라이선스도 함께 재검토해야 한다.**

## 완료 기준 확인 (doc 03 4장)

- [x] 직박구리, 참새, 까치 중 모델이 지원하는 종을 확인한다 → 3종 모두 어휘에 있고,
      실제 녹음으로도 3종 모두 top-1 식별 성공(0.766~0.996).
- [x] 동일 파일 반복 추론 결과가 안정적이다 → 5회 반복, 완전히 동일한 결과.
- [x] 모델 장애를 탐지할 health/readiness 방법이 있다 → 아래 "발견 2"의 데드락 때문에,
      단순 "모델 로드 성공 여부"만으로는 불충분하다는 것을 확인함. 권장 방법을
      "추가로 발견한 이슈"에 구체적으로 적어둠(2단계에서 실제 구현 필요).

## 추가로 발견한 이슈 (체크리스트에는 없지만 2단계 설계에 반드시 반영해야 함)

### 발견 1 — GPU 사용 시 `LD_LIBRARY_PATH` 필수 (위 "설치 방법" 참고)
2단계 systemd 유닛에 `Environment=LD_LIBRARY_PATH=...`를 빠뜨리면 GPU 백엔드가 매 요청
`AssertionError`로 죽는다. 조용히 CPU로 폴백하지 않고 **매 요청이 실패**하므로 배포 직후
바로 드러나긴 하지만, 원인이 비직관적이라 미리 문서화해둔다.

### 발견 2 — 세션 동시 호출 시 데드락 (가장 중요한 발견)
`predict_session()`으로 연 세션 객체 하나에 **동시에 두 개 이상의 `run()` 호출**을 넣으면
(`scripts/spike_04_full.py` D절):

```
동시 2개: RuntimeError('Analysis was cancelled...')
동시 4개: RuntimeError('Analysis was cancelled...') (전부)
```

내부 로그(`birdnet_session_*.log`)를 보면 `assert self._tot_n_segments.value == 0`,
`assert_queue_is_empty` 같은 내부 상태 assertion이 깨진 것 — 이 세션 구현은 **한 번에
하나의 `run()` 호출만 허용**하도록 설계돼 있고, 동시 호출에 안전하지 않다.

**더 심각한 부분**: 이 assertion이 한 번 깨진 뒤 **같은 세션으로 다시 단일 호출**을 넣으면
예외를 던지지도 않고 **영원히 멈춘다(데드락)** — `scripts/spike_05_recovery.py`로 재현·확인함.
`/proc/<pid>/status`가 `State: S (sleeping)`, 90개 가까운 스레드가 전부 `futex_wait_queue_me`에
멈춰 있었고, 5분 넘게 CPU를 전혀 안 쓰길래 강제 종료함(종료 후 GPU 메모리·BioCLIP 서비스는
정상 복귀 확인 — 다른 서비스에는 영향 없었음).

**2단계 설계에 반영해야 할 것 (필수)**:
1. **세션 하나에 절대 동시 호출을 넣지 않는다** — Fastify → 내부 Python 서비스 호출은
   반드시 **서버 쪽에서 큐로 직렬화**하거나, 내부 서비스 자체가 요청을 순차 처리하는
   구조(예: 단일 워커 큐)여야 한다. 진짜 병렬 처리가 필요하면 세션/모델 인스턴스를
   여러 개(GPU 메모리 여유 확인 필요) 띄우는 방식을 검토해야지, 같은 세션을 공유하면
   안 된다.
2. **모든 호출에 타임아웃을 건다** — 세션이 깨지면 예외 없이 무한 대기하므로, 내부
   서비스는 요청마다 하드 타임아웃(예: `AUDIO_ANALYSIS_TIMEOUT_MS`, 이미 `.env.example`에
   있는 값)을 반드시 적용하고, 타임아웃 시 **프로세스 자체를 재시작**해야 한다(세션 내부
   상태 복구가 안 되므로 재시도만으로는 해결 안 됨).
3. **health/readiness는 "모델 로드 여부"보다 한 단계 더 나가야 한다** — 프로세스가 살아
   있어도 세션이 이미 데드락 상태일 수 있으므로, `GET /ready`는 주기적으로(또는 매 N번째
   요청마다) 아주 짧은 더미 오디오로 실제 `session.run()`을 타임아웃과 함께 호출해보고,
   응답이 없으면 프로세스를 강제 재시작하는 워치독이 필요하다.

### 발견 3 — 박새(`Parus cinereus`)는 seedData.ts의 학명이 틀렸을 가능성이 큼
BirdNET 어휘에 `Parus cinereus`는 있지만(라벨: `Parus cinereus_Cinereous Tit`, 한글명
없음 — 남아시아 종), 실제 국내 "박새" 녹음을 넣었더니 최고 신뢰도(0.999)로 나온 건
**`Parus minor_박새`**였다. `Parus major`가 여러 종으로 분류학적으로 쪼개지면서
(Parus major/동양권 Parus minor/남아시아 Parus cinereus) 국명이 갈린 것으로 보인다 —
이전에 발견한 `taxon-sinosuthora-webbiana`(seedData.ts는 `Suthora webbiana`, 실제는
`Sinosuthora webbiana`)와 **같은 종류의 문제**다. `seedData.ts`의 박새 `sciName`을
`Parus cinereus` → `Parus minor`로 고쳐야 하는지는 이 spike의 범위를 넘는 핵심 종 데이터
변경이라 **별도로 사용자 확인이 필요함** — 여기서는 고치지 않았다.

### 발견 4 — 흰뺨검둥오리 ↔ 청둥오리 실제 혼동 확인
`research/audio-reference-pool/README.md`에 "잠정 혼동종"으로 미리 추정해뒀던 오리류
쌍(청둥오리/흰뺨검둥오리)이 **실제로 모델 예측에서도 혼동됨**을 확인했다 — 흰뺨검둥오리
녹음을 넣었더니 청둥오리가 더 높은 신뢰도(0.820)로 나왔고, 흰뺨검둥오리 자체는 어느
구간에서도 1위를 못했다(테스트에 쓴 특정 녹음 하나의 결과이므로 표본 하나로 결론내긴
이르지만, 8단계 혼동종 목록의 근거로 참고할 만하다).

## 다음 단계 제안

이 spike로 1단계 완료 기준은 충족했다고 판단한다. 2단계(모델 서비스, Python 독립
프로세스)로 넘어갈 때 위 발견 1·2를 반드시 설계에 반영해야 하고, 발견 3(박새 학명)은
사용자 확인이 필요한 별도 안건으로 남겨둔다.
