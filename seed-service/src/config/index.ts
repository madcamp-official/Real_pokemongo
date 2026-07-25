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
