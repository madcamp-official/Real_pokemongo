/**
 * 설정(config) 로더.
 *
 * 명세서 원칙: "제공되지 않은 정보(서버/유료 API/자격 증명)는 공란으로 남긴다."
 * 여기서는 환경 변수에서 값을 읽되, 비어 있으면 안전한 개발용 기본값으로 동작하게
 * 하고, 프로덕션에서 반드시 필요한 값이 비어 있으면 `assertProductionConfig()`로
 * 명시적으로 실패시킨다.
 *
 * 실제 값은 `.env`(→ `.env.example` 참고)에서 주입한다. 코드에는 비밀을 하드코딩하지 않는다.
 */

function env(key: string): string | undefined {
  const v = process.env[key];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

function envNumber(key: string, fallback: number): number {
  const v = env(key);
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";

  database: {
    // TODO(제공 필요): 프로덕션 DB 연결 문자열
    url?: string;
  };

  mediaStorage: {
    // TODO(제공 필요): 오브젝트 스토리지 자격 증명(프로덕션에서 클라우드로 교체할 때 사용)
    bucket?: string;
    region?: string;
    accessKey?: string;
    secretKey?: string;
    /** C단계 MVP: 실제 클라우드 대신 로컬 디스크에 저장(과금 리스크 없음). */
    localDir: string;
  };

  http: {
    port: number;
    /** 바인딩 주소. 기본은 127.0.0.1(로컬 전용, 안전). 같은 네트워크의 다른 기기(예: 실기기
     * Expo Go 테스트)에서 접근하려면 명시적으로 0.0.0.0으로 채워야 한다 — BIOCLIP_ENDPOINT와
     * 같은 관례("채워야만 켜짐, 기본은 안전"). */
    host: string;
  };

  identification: {
    plantId: {
      // TODO(제공 필요): 유료 API 키
      apiKey?: string;
      endpoint: string;
      insectEndpoint: string;
    };
    plantNet: {
      // TODO(제공 필요): 유료 API 키
      apiKey?: string;
      endpoint: string;
    };
    /** B단계: GPU 서버(HybridClassifier) 상시 추론 서버. SSH 로컬 포트포워딩 경유 접근. */
    bioclip: {
      endpoint: string;
      timeoutMs: number;
    };
    freeDailyLimit: number; // 0 = 무제한
  };

  speciesMaster: {
    // TODO(제공 필요): 공공 종 데이터 API (라이선스 확인 필요)
    apiKey?: string;
    endpoint?: string;
  };

  tts: {
    provider?: string;
    apiKey?: string;
  };

  push: {
    provider?: string;
    apiKey?: string;
  };

  auth: {
    // TODO(제공 필요): 프로덕션 서명 키
    jwtSecret?: string;
  };

  map: {
    /** F11 카카오맵 JS SDK 키. 비어 있으면(기본) /map.html이 지도를 못 띄운다(개발자가
     * developers.kakao.com에서 직접 발급받아 .env에 채워야 함 — 다른 유료 프로바이더와
     * 같은 관례). */
    kakaoJsKey?: string;
  };

  /** 소리 기능 3단계(업로드와 변환). `.env.example`의 AUDIO_* 값과 1:1 대응. */
  audio: {
    /** 입출력 임시 파일 + 변환된 WAV를 두는 디렉터리. */
    tempDir: string;
    /** 업로드 원본 최대 크기(바이트) — doc 03 3단계 "최대 10 MB". */
    maxBytes: number;
    /** 허용 최대 길이(초) — doc 03 3단계 "길이 최대 15초". */
    maxDurationSeconds: number;
    /** ffmpeg 변환 자식 프로세스 하드 타임아웃(ms) — "변환기 보호"의 시간 제한. */
    conversionTimeoutMs: number;
    /** 미확정 세션 TTL(시간) — doc 03 5단계 "미확정 세션은 최대 24시간". */
    ttlHours: number;
    /** TTL 스윕(AudioSessionCleanupService) 주기(ms) — doc 03 5단계 "삭제 작업". */
    cleanupIntervalMs: number;
    /** 6단계: BirdNET 기반 audio-model-service(CAMP-3, 127.0.0.1:8932). BioCLIP과 동일한
     * 온/오프 관례 — endpoint가 비어있으면(기본) 이 프로바이더는 꺼진 상태다. */
    model: {
      endpoint: string;
      timeoutMs: number;
      /** 있으면 요청에 실어 보낸다(지금은 같은 서버 안에서만 통하는 저위험 값 — 값 자체는
       * .env.example에 채우지 않는다). 없으면 헤더 자체를 안 붙인다. */
      token?: string;
    };
  };
}

export function loadConfig(): AppConfig {
  const nodeEnv = (env("NODE_ENV") as AppConfig["nodeEnv"]) ?? "development";

  return {
    nodeEnv,
    database: {
      url: env("DATABASE_URL"),
    },
    mediaStorage: {
      bucket: env("MEDIA_STORAGE_BUCKET"),
      region: env("MEDIA_STORAGE_REGION"),
      accessKey: env("MEDIA_STORAGE_ACCESS_KEY"),
      secretKey: env("MEDIA_STORAGE_SECRET_KEY"),
      localDir: env("MEDIA_STORAGE_LOCAL_DIR") ?? "./data/media",
    },
    http: {
      // app/src/config/env.ts의 API_BASE_URL('http://localhost:8080')과 기본값 일치.
      port: envNumber("HTTP_PORT", 8080),
      host: env("HTTP_HOST") ?? "127.0.0.1",
    },
    identification: {
      plantId: {
        apiKey: env("PLANT_ID_API_KEY"),
        endpoint: env("PLANT_ID_ENDPOINT") ?? "https://plant.id/api/v3",
        insectEndpoint:
          env("INSECT_ID_ENDPOINT") ?? "https://insect.kindwise.com/api/v1",
      },
      plantNet: {
        apiKey: env("PLANTNET_API_KEY"),
        endpoint: env("PLANTNET_ENDPOINT") ?? "https://my-api.plantnet.org/v2",
      },
      bioclip: {
        // plantId/plantNet과 동일한 관례: 명시적으로 설정하지 않으면 빈 문자열(꺼짐).
        // BIOCLIP_ENDPOINT는 apiKey가 없는 대신 그 자체가 온/오프 스위치이므로, 여기서
        // 기본값을 채워버리면(예: 127.0.0.1:8931) 실제 GPU 서버가 없는 개발/테스트
        // 환경에서도 isConfigured()=true가 되어 항상 이 프로바이더가 먼저 선택되고,
        // 매 요청이 네트워크 실패로 죽는다 -- 실제로 이 값을 채워 넣었다가 기존
        // ObservationFlow/DataRightsService/Authorization 테스트가 무더기로 깨지는 걸
        // 확인하고 되돌린 결정이다. 로컬 개발 시 .env.example의 안내대로 SSH 터널을 연
        // 뒤 개발자가 직접 .env에 값을 채워야 활성화된다.
        endpoint: env("BIOCLIP_ENDPOINT") ?? "",
        timeoutMs: envNumber("BIOCLIP_TIMEOUT_MS", 15000),
      },
      freeDailyLimit: envNumber("FREE_DAILY_IDENTIFY_LIMIT", 20),
    },
    speciesMaster: {
      apiKey: env("SPECIES_MASTER_API_KEY"),
      endpoint: env("SPECIES_MASTER_ENDPOINT"),
    },
    tts: {
      provider: env("TTS_PROVIDER"),
      apiKey: env("TTS_API_KEY"),
    },
    push: {
      provider: env("PUSH_PROVIDER"),
      apiKey: env("PUSH_API_KEY"),
    },
    auth: {
      jwtSecret: env("AUTH_JWT_SECRET"),
    },
    map: {
      kakaoJsKey: env("KAKAO_MAP_JS_KEY"),
    },
    audio: {
      tempDir: env("AUDIO_TEMP_DIR") ?? "./data/audio-temp",
      maxBytes: envNumber("AUDIO_MAX_BYTES", 10 * 1024 * 1024),
      maxDurationSeconds: envNumber("AUDIO_MAX_DURATION_SECONDS", 15),
      conversionTimeoutMs: envNumber("AUDIO_ANALYSIS_TIMEOUT_MS", 15000),
      ttlHours: envNumber("AUDIO_TEMP_TTL_HOURS", 24),
      cleanupIntervalMs: envNumber("AUDIO_CLEANUP_INTERVAL_MS", 60 * 60 * 1000),
      model: {
        // bioclip과 동일한 온/오프 관례(위 156번째 줄 주석 참고) — 기본값을 채우면 GPU
        // 서버 없는 테스트 환경에서도 항상 켜진 것으로 오인돼 매 요청이 실패한다.
        endpoint: env("AUDIO_MODEL_SERVICE_URL") ?? "",
        timeoutMs: envNumber("AUDIO_MODEL_TIMEOUT_MS", 15000),
        token: env("AUDIO_MODEL_SERVICE_TOKEN") || undefined,
      },
    },
  };
}

/**
 * 프로덕션 부팅 시 호출. 필수 공란이 비어 있으면 조용히 개발용 기본값으로 도는 대신
 * 명시적으로 실패시켜, 자격 증명 누락이 배포에서 드러나게 한다.
 */
export function assertProductionConfig(cfg: AppConfig): void {
  if (cfg.nodeEnv !== "production") return;
  const missing: string[] = [];
  if (!cfg.database.url) missing.push("DATABASE_URL");
  if (!cfg.mediaStorage.bucket) missing.push("MEDIA_STORAGE_BUCKET");
  if (!cfg.auth.jwtSecret) missing.push("AUTH_JWT_SECRET");
  // 동정 API 키가 하나도 없으면 프로덕션에서 Mock으로 도는 것을 막는다.
  if (!cfg.identification.plantId.apiKey && !cfg.identification.plantNet.apiKey) {
    missing.push("PLANT_ID_API_KEY 또는 PLANTNET_API_KEY (최소 1개)");
  }
  if (missing.length > 0) {
    throw new Error(
      `[config] 프로덕션 필수 설정 누락: ${missing.join(", ")}. .env를 채워주세요.`,
    );
  }
}
