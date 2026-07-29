# -*- coding: utf-8 -*-
"""
BirdNET(acoustic 2.4)을 감싸는 상시 구동 내부 전용 HTTP 서버 (2단계 — 모델 서비스).

`/root/inference_server.py`(BioCLIP)의 구조를 그대로 따른다: 모델은 프로세스 시작 시
한 번만 로드하고(lifespan), 모듈 전역 `_state`로 들고 있는다. 접근 통제도 동일하게
--host 127.0.0.1 바인딩이 유일한 방화벽이다 (seed-service는 SSH 로컬 포트포워딩으로만
접근).

1단계 spike(seed-service/research/audio-model-spike/SPIKE_REPORT.md)에서 실측으로 확인한
두 가지 제약을 그대로 반영한다:

1) GPU 라이브러리 경로: 이 프로세스를 실행하는 systemd 유닛은 반드시
   `Environment=LD_LIBRARY_PATH=...`(nvidia-*-cu12 lib 경로들)를 설정해야 한다. 설정하지
   않으면 GPU 백엔드 로드가 조용히 실패한다.

2) 세션 동시 호출 = 데드락: `predict_session`/`encode_session`은 동시에 두 개 이상의
   run()을 받으면 내부 assertion이 깨지고, 그 뒤로는 예외조차 없이 영원히 멈춘다(spike에서
   실제로 재현·확인함). 따라서:
   - 세션은 프로세스 시작 시 딱 한 번씩만 열어서 계속 재사용한다(매 요청 새로 열면
     11~14초 오버헤드가 붙는다 -- 이것도 spike에서 실측함).
   - asyncio.Lock() 하나로 predict/encode 호출을 전부 직렬화한다(BioCLIP과 동일 패턴).
   - 락 획득 대기가 무한정 쌓이지 않도록 세마포어로 대기열 상한을 두고, 초과 시 503로
     즉시 거부한다("과도한 요청을 안전하게 거부" 완료 기준).
   - **"락 대기 타임아웃"과 "실제 추론 타임아웃"은 반드시 분리해야 한다** -- 처음 구현에서
     이 둘을 하나의 타임아웃으로 묶었다가, 대기열이 8건까지 찬 상태에서 순서상 늦게 실행된
     정상 요청이 "대기 시간 + 실행 시간"의 합이 타임아웃을 넘겼다는 이유만으로 "세션이
     죽었다"고 오판해 정상 동작 중인 프로세스 전체를 죽이는 사고를 실제로 재현했다(2단계
     구현 중 실측). 그래서 락 획득 자체에는 짧은 타임아웃(큐가 너무 길면 503만 반환하고
     프로세스는 그대로 둠)을, 락을 잡은 뒤 실제 session.run() 호출에는 별도의(더 긴)
     타임아웃(여기서 걸리면 진짜 데드락이므로 프로세스 종료)을 따로 건다.
   - 타임아웃으로 세션이 죽었다고 판단되면 프로세스 자체를 종료한다 -- 세션은 자체 복구가
     안 되므로 재시도만으로는 해결 안 됨, systemd의 Restart=on-failure가 새 프로세스로
     다시 띄워준다. **주의**: `os._exit()`만 호출하면 predict_session/encode_session이
     내부적으로 띄운 멀티프로세싱 워커 자식 프로세스는 안 죽고 고아가 돼(PPID가 1로
     재부모화) GPU 메모리를 계속 붙잡고 있는다(수동 테스트로 실제 확인함 -- uvicorn을
     systemd 없이 직접 띄웠을 때 발생. systemd의 기본 KillMode=control-group이면 cgroup
     전체를 정리해 이 문제가 없어야 하지만, 방어적으로 앱 레벨에서도 프로세스 그룹 전체에
     SIGKILL을 보낸다).
   - /ready는 "모델 로드 여부"보다 한 단계 더 나아가, 아주 짧은 더미 오디오로 실제
     추론을 타임아웃과 함께 돌려 세션이 실제로 살아있는지 확인한다.
"""
import asyncio
import base64
import binascii
import logging
import math
import os
import signal
import struct
import subprocess
import tempfile
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

import birdnet
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("audio_model_service")

MODEL_VERSION = "birdnet-acoustic-2.4-pb"

# base64 문자열 길이 상한. AUDIO_MAX_BYTES(seed-service/.env.example, 10MB)와 맞춤
# -- base64는 원본보다 ~4/3배 커지므로 여유를 둔 상한.
MAX_AUDIO_B64_CHARS = 14 * 1024 * 1024
# AUDIO_MAX_DURATION_SECONDS(.env.example)과 동일 -- 녹음 자체가 서버 정책상 15초를
# 못 넘게 돼 있으므로, 이보다 긴 입력은 클라이언트/업로드 단계 버그로 보고 거부한다.
MAX_DURATION_S = 15.0
# 실제 session.run() 호출 자체(락을 이미 잡은 뒤)에 거는 타임아웃 -- 여기서 넘으면
# 진짜 데드락으로 간주해 프로세스를 죽인다. 실측 지연(15초 입력 기준 ~1.1~2.2초)보다
# 훨씬 여유를 둔 값 -- AUDIO_ANALYSIS_TIMEOUT_MS(.env.example)과 동일.
CALL_TIMEOUT_S = 15.0
# 락 "획득 대기"에 거는 타임아웃 -- 대기열이 밀려서 못 잡으면 그냥 503만 반환하고
# 프로세스는 죽이지 않는다(정상적인 혼잡일 뿐, 세션 장애가 아니다).
LOCK_WAIT_TIMEOUT_S = 10.0
# 동시에 락을 "기다릴 수 있는" 요청 수 상한 -- 이걸 넘으면 무한정 큐잉하는 대신 즉시 503.
# 요청당 순차 처리 시간이 실측 약 2초대이므로, 4개면 최악의 경우도 대기 시간이
# LOCK_WAIT_TIMEOUT_S 안에 들어온다.
MAX_QUEUED_REQUESTS = 4

_state: dict[str, Any] = {
    "model": None,
    "predict_session": None,
    "encode_session": None,
    "session_ctx": None,  # AsyncExitStack -- 두 세션의 컨텍스트를 lifespan 동안 붙잡아둠
    "lock": None,
    "admission": None,  # asyncio.Semaphore -- 대기열 상한
    "start_time": None,
    "dead": False,  # True가 되면 이 프로세스는 더 이상 새 요청을 받지 않고 스스로 종료
}


def _make_silence_wav(path: Path, duration_s: float = 1.0, sample_rate: int = 48000) -> None:
    """/ready 프로브용 무음 WAV를 즉석에서 만든다(외부 테스트 파일에 의존하지 않기 위함)."""
    n_samples = int(duration_s * sample_rate)
    data = b"\x00\x00" * n_samples
    with open(path, "wb") as f:
        f.write(b"RIFF")
        f.write(struct.pack("<I", 36 + len(data)))
        f.write(b"WAVEfmt ")
        f.write(struct.pack("<IHHIIHH", 16, 1, 1, sample_rate, sample_rate * 2, 2, 16))
        f.write(b"data")
        f.write(struct.pack("<I", len(data)))
        f.write(data)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from contextlib import ExitStack

    logger.info("BirdNET 모델 로드 시작...")
    t0 = time.time()
    model = birdnet.load("acoustic", "2.4", "pb", lang="ko")
    _state["model"] = model

    stack = ExitStack()
    predict_session = stack.enter_context(
        model.predict_session(top_k=5, device="GPU:0", n_workers=1, n_producers=1, show_stats=None)
    )
    encode_session = stack.enter_context(
        model.encode_session(device="GPU:0", n_workers=1, n_producers=1, show_stats=None)
    )
    _state["session_ctx"] = stack
    _state["predict_session"] = predict_session
    _state["encode_session"] = encode_session
    _state["lock"] = asyncio.Lock()
    _state["admission"] = asyncio.Semaphore(MAX_QUEUED_REQUESTS)
    _state["start_time"] = time.time()

    # 워밍업 -- 첫 요청이 콜드스타트 지연(11~14초)을 떠안지 않게 미리 한 번 태운다.
    warm_wav = Path(tempfile.gettempdir()) / "audio_model_service_warmup.wav"
    _make_silence_wav(warm_wav, duration_s=3.0)
    predict_session.run([str(warm_wav)])
    encode_session.run([str(warm_wav)])

    logger.info(f"모델+세션 로드 및 워밍업 완료 ({time.time() - t0:.1f}s)")
    yield
    logger.info("서버 종료 -- 세션 정리")
    stack.close()


app = FastAPI(lifespan=lifespan)


class ValidSegment(BaseModel):
    start_s: float = Field(ge=0)
    end_s: float = Field(gt=0)


class AnalyzeHint(BaseModel):
    region: str | None = None
    recorded_at: str | None = None


class AnalyzeRequest(BaseModel):
    audio_base64: str
    valid_segment: ValidSegment | None = None
    hint: AnalyzeHint | None = None


class SimilarityRequest(BaseModel):
    audio_base64: str
    reference_embedding: list[float]


def _json_safe(obj: Any) -> Any:
    """numpy 스칼라/배열이 응답 어딘가에 섞여 있어도 JSON 직렬화가 조용히 실패하지
    않도록 재귀적으로 순수 파이썬 타입으로 변환한다 (bioclip inference_server.py와 동일 패턴)."""
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return _json_safe(obj.tolist())
    if isinstance(obj, (str, bool)) or obj is None:
        return obj
    if isinstance(obj, (int,)):
        return obj
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if hasattr(obj, "item") and callable(getattr(obj, "item")):
        try:
            return _json_safe(obj.item())
        except (ValueError, TypeError):
            pass
    return obj


def _die(reason: str) -> None:
    """세션이 죽었다고 판단될 때 프로세스를 즉시 종료한다. 세션은 자체 복구가 안 되므로
    (1단계 spike에서 실측 확인) 재시도 대신 systemd Restart=on-failure로 새 프로세스를
    띄우는 게 유일하게 안전한 복구 방법이다.

    os._exit()만 호출하면 predict_session/encode_session이 내부적으로 띄운 멀티프로세싱
    워커 자식들이 고아 프로세스로 남아 GPU 메모리를 계속 붙잡는다(실제로 재현·확인함).
    프로세스 그룹 전체에 SIGKILL을 보내 자식까지 확실히 정리한다 -- systemd가
    KillMode=control-group으로 cgroup을 정리해줄 수도 있지만, 앱 레벨에서도 방어적으로
    처리한다."""
    logger.error(f"치명적 오류로 프로세스를 종료합니다: {reason}")
    _state["dead"] = True
    try:
        os.killpg(os.getpgrp(), signal.SIGKILL)
    except Exception:
        pass
    os._exit(1)


async def _acquire_lock_or_503() -> None:
    """락 획득 자체가 너무 오래 걸리면(대기열 밀림) 503만 반환하고 프로세스는 살려둔다 --
    이건 세션 장애가 아니라 정상적인 혼잡이다. 실제 세션 장애 감지는 락을 잡은 뒤
    session.run() 자체의 타임아웃(CALL_TIMEOUT_S)에서만 판단한다."""
    try:
        async with asyncio.timeout(LOCK_WAIT_TIMEOUT_S):
            await _state["lock"].acquire()
    except (TimeoutError, asyncio.TimeoutError):
        raise HTTPException(status_code=503, detail="server busy, try again shortly")


def _decode_audio_to_tempfile(audio_b64: str) -> Path:
    if len(audio_b64) > MAX_AUDIO_B64_CHARS:
        raise HTTPException(status_code=413, detail="audio payload too large")
    try:
        raw = base64.b64decode(audio_b64, validate=True)
    except binascii.Error as e:
        raise HTTPException(status_code=400, detail=f"invalid base64: {type(e).__name__}")
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="empty audio payload")

    # 실제 컨텐츠가 어떤 포맷이든(WAV가 기본 가정, 3단계에서 이미 mono PCM WAV로 변환돼
    # 들어온다) libsndfile은 확장자가 아니라 내용으로 포맷을 감지하므로 .wav로 고정해도
    # 안전하다 -- 다만 M4A/AAC처럼 아예 미지원 포맷이면 predict_session.run()에서
    # ValueError로 드러난다(아래에서 400으로 변환).
    fd, path_str = tempfile.mkstemp(suffix=".wav", dir="/root/audio_spike/tmp_requests")
    os.close(fd)
    path = Path(path_str)
    path.write_bytes(raw)
    return path


def _probe_duration_s(path: Path) -> float:
    import soundfile as sf

    with sf.SoundFile(str(path)) as f:
        return len(f) / f.samplerate


@app.get("/health")
async def health():
    if _state["dead"]:
        return JSONResponse(status_code=503, content={"status": "dead"})
    model = _state["model"]
    if model is None:
        return JSONResponse(status_code=503, content={"status": "loading"})
    gpu_mem = subprocess.run(
        ["nvidia-smi", "--query-gpu=memory.used,memory.total", "--format=csv,noheader,nounits"],
        capture_output=True, text=True, timeout=5,
    ).stdout.strip()
    return {
        "status": "ok",
        "model_loaded": True,
        "model_version": MODEL_VERSION,
        "gpu_memory_mb": gpu_mem,
        "uptime_seconds": round(time.time() - _state["start_time"], 1),
    }


@app.get("/ready")
async def ready():
    """단순 '모델 로드됨'보다 한 단계 더 나아가, 실제로 짧은 더미 오디오를 태워
    세션이 살아있는지(데드락 상태가 아닌지) 확인한다. 1단계 spike에서 세션이 한 번
    깨지면 프로세스가 살아있어도(health는 통과) 영원히 응답하지 않는 경우를 실제로
    확인했기 때문에, /health만으로는 이 실패 모드를 못 잡는다."""
    if _state["dead"] or _state["model"] is None:
        return JSONResponse(status_code=503, content={"status": "not_ready"})

    probe_wav = Path(tempfile.gettempdir()) / "audio_model_service_ready_probe.wav"
    if not probe_wav.exists():
        _make_silence_wav(probe_wav, duration_s=1.0)

    # 락 대기 자체가 오래 걸리는 건(다른 정상 요청이 밀려 있는 것뿐) 장애가 아니다 --
    # 이 경우 그냥 "아직 확인 못 함"으로 503만 반환하고 프로세스는 건드리지 않는다.
    try:
        await _acquire_lock_or_503()
    except HTTPException:
        return JSONResponse(status_code=503, content={"status": "busy_unknown"})

    try:
        # 락을 실제로 잡은 뒤 추론 자체가 멈추는 것만 진짜 데드락으로 취급한다.
        async with asyncio.timeout(CALL_TIMEOUT_S):
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, _state["predict_session"].run, [str(probe_wav)])
        return {"status": "ready"}
    except (TimeoutError, asyncio.TimeoutError):
        # 세션이 죽었다(데드락) -- 재시도해도 소용없으므로 바로 프로세스 종료.
        _die("/ready 프로브 타임아웃 -- 세션이 응답하지 않음")
    except Exception as e:
        logger.exception("/ready 프로브 중 예외")
        return JSONResponse(status_code=503, content={"status": "not_ready", "detail": repr(e)})
    finally:
        if _state["lock"].locked():
            _state["lock"].release()


@app.post("/internal/audio/analyze")
async def analyze(req: AnalyzeRequest):
    if _state["dead"] or _state["model"] is None:
        raise HTTPException(status_code=503, detail="model not ready")

    tmp_path = _decode_audio_to_tempfile(req.audio_base64)
    try:
        try:
            duration_s = _probe_duration_s(tmp_path)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"invalid or unsupported audio: {type(e).__name__}")

        if duration_s > MAX_DURATION_S:
            raise HTTPException(
                status_code=400,
                detail=f"audio duration {duration_s:.1f}s exceeds max {MAX_DURATION_S}s",
            )
        if duration_s <= 0:
            raise HTTPException(status_code=400, detail="audio duration is zero")

        if _state["admission"].locked():
            raise HTTPException(status_code=503, detail="server busy, try again shortly")

        async with _state["admission"]:
            # 락 대기(혼잡)와 실제 추론(장애 감지)의 타임아웃을 분리한다 -- 처음 구현에서
            # 이 둘을 합쳤다가, 대기열이 찬 상태에서 정상 처리된 요청이 "대기+실행" 합산
            # 시간 때문에 가짜 데드락으로 오판돼 정상 프로세스가 죽는 사고를 실제로 재현함.
            await _acquire_lock_or_503()
            t0 = time.time()
            try:
                try:
                    async with asyncio.timeout(CALL_TIMEOUT_S):
                        loop = asyncio.get_running_loop()
                        pred_result = await loop.run_in_executor(
                            None, _state["predict_session"].run, [str(tmp_path)]
                        )
                        enc_result = await loop.run_in_executor(
                            None, _state["encode_session"].run, [str(tmp_path)]
                        )
                except (TimeoutError, asyncio.TimeoutError):
                    _die("analyze 호출 타임아웃 -- 세션이 응답하지 않음")
                except Exception:
                    logger.exception("analyze 추론 중 미확인 예외")
                    raise HTTPException(status_code=500, detail="inference failed")
            finally:
                _state["lock"].release()
            elapsed_ms = round((time.time() - t0) * 1000, 1)
    finally:
        tmp_path.unlink(missing_ok=True)

    sp_list = pred_result.species_list
    probs = pred_result.species_probs[0]
    ids = pred_result.species_ids[0]
    embeddings = enc_result.embeddings[0]  # (n_segments, emb_dim)

    segments = []
    for seg_i in range(probs.shape[0]):
        candidates = []
        # 오름차순 정렬이므로 역순으로 순회해야 1위부터 나온다(1단계 spike에서 확인한
        # 디코딩 함정 -- species_probs/species_ids는 세그먼트별 오름차순).
        for k in range(probs.shape[1] - 1, -1, -1):
            label = sp_list[int(ids[seg_i][k])]
            sci_name, _, kor_or_en = label.partition("_")
            candidates.append(
                {"sci_name": sci_name, "label": kor_or_en, "score": float(probs[seg_i][k])}
            )
        segments.append(
            {
                "start_s": seg_i * float(pred_result.segment_duration_s),
                "end_s": (seg_i + 1) * float(pred_result.segment_duration_s),
                "candidates": candidates,
                "embedding": embeddings[seg_i].tolist(),
            }
        )

    logger.info(f"analyze elapsed_ms={elapsed_ms} n_segments={len(segments)} duration_s={duration_s:.1f}")
    return _json_safe(
        {
            "model_version": MODEL_VERSION,
            "quality": {
                "duration_s": duration_s,
                "sample_rate": int(pred_result.model_sr),
                "segment_duration_s": float(pred_result.segment_duration_s),
            },
            "segments": segments,
        }
    )


@app.post("/internal/audio/similarity")
async def similarity(req: SimilarityRequest):
    if _state["dead"] or _state["model"] is None:
        raise HTTPException(status_code=503, detail="model not ready")

    ref = np.asarray(req.reference_embedding, dtype=np.float32)
    if ref.ndim != 1 or ref.shape[0] != 1024:
        raise HTTPException(
            status_code=400, detail=f"reference_embedding must be a 1024-dim vector, got shape {ref.shape}"
        )

    tmp_path = _decode_audio_to_tempfile(req.audio_base64)
    try:
        try:
            duration_s = _probe_duration_s(tmp_path)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"invalid or unsupported audio: {type(e).__name__}")
        if duration_s > MAX_DURATION_S:
            raise HTTPException(status_code=400, detail=f"audio duration {duration_s:.1f}s exceeds max {MAX_DURATION_S}s")

        async with _state["admission"]:
            await _acquire_lock_or_503()
            try:
                try:
                    async with asyncio.timeout(CALL_TIMEOUT_S):
                        loop = asyncio.get_running_loop()
                        enc_result = await loop.run_in_executor(
                            None, _state["encode_session"].run, [str(tmp_path)]
                        )
                except (TimeoutError, asyncio.TimeoutError):
                    _die("similarity 호출 타임아웃 -- 세션이 응답하지 않음")
                except Exception:
                    logger.exception("similarity 추론 중 미확인 예외")
                    raise HTTPException(status_code=500, detail="inference failed")
            finally:
                _state["lock"].release()
    finally:
        tmp_path.unlink(missing_ok=True)

    # 세그먼트가 여러 개면 평균 풀링 -- 사용자의 짧은 흉내 녹음 전체를 하나의 벡터로
    # 요약해 참조 임베딩과 비교한다(등급 매핑은 이 서비스의 책임이 아니라 Fastify/앱
    # 쪽 API_CONTRACT.md 소관 -- 여기서는 원시 코사인 유사도만 반환한다).
    embeddings = enc_result.embeddings[0]  # (n_segments, 1024)
    pooled = embeddings.mean(axis=0)
    cos = float(
        np.dot(pooled, ref) / (np.linalg.norm(pooled) * np.linalg.norm(ref) + 1e-9)
    )
    return _json_safe(
        {
            "model_version": MODEL_VERSION,
            "similarity_raw": cos,
            "n_segments_used": int(embeddings.shape[0]),
        }
    )
