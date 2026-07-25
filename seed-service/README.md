# 『씨앗(SEED)』 — 어린이 생태교육 서비스 코어 로직

[어린이_생태교육_서비스_기능명세서.md](../어린이_생태교육_서비스_기능명세서.md) v0.1을 코드로 구현한 백엔드 도메인 로직이다.
외부 API 키·DB 없이도 전체 파이프라인이 **MockProvider + in-memory 저장소**로 돌아간다.

## 실행

```bash
npm install
npm run demo        # 명세서 §2.2 골든 패스를 재현 (외부 키 불필요)
npm test            # 골든 테스트 스위트 (43개, 외부 키 불필요)
npm run typecheck   # 타입 검사
```

## 골든 테스트 (안전·프라이버시 CI 게이트)

체크리스트 §4가 요구한 대로, **회귀하면 사람이 다치거나 법을 어기는 경로**를 자동화 테스트로 잠갔다. `npm test`로 실행되며, **CI에서 이 스위트가 실패하면 배포를 차단해야 한다.**

| 테스트 파일 | 잠근 불변식 |
|---|---|
| `core/safety/SafetyFilter.test.ts` | 위험 종 반드시 경고·`showFirst`, 버섯 식용 판정 금지, 후보에 위험 섞이면 보수적 경고 |
| `core/observation/regionGeneralizer.test.ts` | 위치 OFF→null, ON이어도 정밀 좌표 미저장 |
| `core/media/MediaSanitizer.test.ts` | **EXIF GPS 제거**: JPEG/PNG 메타데이터 제거·구조 보존, 미지 포맷 거부, 멱등성 |
| `core/auth/Authorization.test.ts` | **IDOR 방지**: 남의 자녀/계정 접근 거부, 미존재와 소유 불일치 동일 에러, IDOR 시도 시 외부 API 호출 0(비용 공격 차단) |
| `core/identification/confidencePolicy.test.ts` | 확신도 구간 경계값 |
| `core/identification/IdentificationGateway.test.ts` | 확신도 분기, **안전 안내 우선 노출**, 상위 분류 폴백, 프로바이더 예외 안전 처리 |
| `child/ObservationFlow.test.ts` | high만 도감 반영(오동정 굳힘 방지), 재관찰 멱등성, **한도 초과 시 외부 API 미호출(비용 안전)**, 프라이버시 종단 |

> 이 테스트들은 **뮤테이션 검증**을 마쳤다: 안전 필터·프라이버시 로직을 일부러 깨뜨렸을 때 해당 테스트가 정확히 실패하는 것을 확인했다(방어력 입증). 안전·프라이버시 관련 코드를 수정할 때는 반드시 이 스위트를 먼저 통과시킬 것.

### 이 스위트가 잡아낸 실제 버그 (수정 완료)
명세서 §7이 요구하는 **상위 분류 폴백**("○○ 종류예요")이 원래 코드에서 **도달 불가능한 죽은 코드**였다(`pickHigherRankFallback`이 확신도 ≥ medium을 요구했으나, 그 분기는 확신도 < medium일 때만 진입 → 영구 미발동). `Taxon.parentId` 기반의 올바른 폴백으로 교체하고 테스트로 잠갔다. 실패 방향이 안전한 쪽('모르겠어요')이라 안전 구멍은 아니었으나, "작동한다고 믿는 죽은 코드"는 그 자체로 위험이므로 제거했다.

## 설계 원칙 (코드로 강제한 것)

| 명세서 원칙 | 코드에서의 강제 방식 |
|---|---|
| **프라이버시 우선** (§0-1, F12) | `Observation` 타입에 **정밀 좌표 필드 자체가 없다**. 위치는 `resolveRegionForStorage()`를 거쳐 시·군·구 코드로만 저장되고, 보호자가 껐으면(기본값) `null`. |
| **사진 EXIF 제거** (체크리스트 §1.4) | 게이트웨이/프로바이더는 브랜디드 `SanitizedImage`만 받는다. `MediaSanitizer.sanitizeImage()`가 JPEG/PNG의 EXIF·GPS·주석을 제거해야만 그 타입이 생기므로, **정화 안 된 원시 사진을 외부로 보내는 코드는 컴파일되지 않는다**. `ObservationFlow`가 인가 직후 정화를 수행. |
| **안전 우선** (§0-2, F4) | `SafetyFilter`가 `Taxon.riskTags`만 보고 판단. 위험 후보를 배제 못 하면 **종 정보보다 안전 안내를 먼저** 노출. 버섯 식용 판정은 `EDIBILITY_JUDGEMENT_SUPPORTED = false`로 아예 없음. |
| **인가/IDOR 방지** (체크리스트 §1.3) | 자녀/계정 데이터 진입점은 `AuthContext`를 **타입 수준에서 요구**한다. `Authorizer.assertOwnsChild`가 소유권을 검증하고, 대시보드는 `guardianId`를 파라미터로 받지 않아 남의 가족 열람이 구조적으로 불가능. 인가는 한도 체크·동정 호출보다 **먼저** 실행되어 비용 공격까지 차단. |
| **벤더 독립** (§9) | 모든 동정 API는 `IdentificationProvider` 인터페이스 뒤의 어댑터. 교체는 `composition.ts` 한 곳 수정. |
| **불확실할 땐 단정 안 함** (§7) | `confidencePolicy`가 high/medium/low/unknown으로 분기, 저확신은 상위 분류 폴백 또는 "모르겠어요". |
| **관찰로만 보상** (§5) | 퀘스트·배지·XP가 전부 `Observation` 이벤트에서만 파생. 확률형(가챠) 없음. |

## 디렉터리 구조

```
src/
├─ config/                     # 환경변수 로더 (공란=개발 기본값)
├─ core/                       # 【공유 코어】 — 명세서 §9의 추출 대상
│  ├─ domain/                  #   도메인 타입 = 명세서 §8 스키마
│  ├─ identification/          #   ★ 동정 게이트웨이 (F3) + 확신도 정책 (§7)
│  │  └─ providers/            #     Mock / Plant.id / PlantNet 어댑터
│  ├─ safety/                  #   ★ 위험생물 안전 필터 (F4)
│  ├─ taxonomy/                #   학명→국명 매핑
│  ├─ observation/             #   관찰 서비스 + 위치 일반화 (F9, F12)
│  ├─ collection/              #   도감 진행률 엔진 (F5)
│  ├─ quest/                   #   퀘스트 엔진 (F7)
│  ├─ rewards/                 #   배지·레벨·XP 엔진 (F8)
│  └─ repositories/            #   저장소 포트 + in-memory 구현
├─ child/                      # 【어린이 버티컬】
│  ├─ account/                 #   보호자 동의·프로필·프라이버시 (F1, F3-계정)
│  ├─ content/                 #   종 카드·학습 콘텐츠 (F6)
│  ├─ dashboard/               #   보호자 대시보드 (F11)
│  └─ ObservationFlow.ts       #   ★ 골든 패스 오케스트레이터 (핵심 루프)
├─ seed/                       # 데모용 한국 종/퀘스트/배지/콘텐츠 시드
├─ composition.ts             # 조립 루트 (의존성 주입 한 곳)
└─ demo.ts                    # 골든 패스 실행 데모
```

`core/`(공유 코어)와 `child/`(버티컬)의 분리가 명세서 §9의 핵심이다. 두 번째 제품(탐조 등)을
만들 때 `core/`만 추출하면 된다. **지금은 추출하지 않는다** — 사례가 둘 이상 실재할 때 추출.

## 나중에 채워야 할 공란 (제공 필요)

코드 전체에서 `TODO(제공 필요)` 로 표시. `.env.example` 참고. 핵심 항목:

| 항목 | 위치 | 비고 |
|---|---|---|
| **동정 유료 API 키** | `.env` `PLANT_ID_API_KEY`, `PLANTNET_API_KEY` | 없으면 Mock으로 동작 |
| 동정 API 요청/응답 매핑 | `providers/PlantIdProvider.ts`, `PlantNetProvider.ts` | 벤더 스펙 확정 후 `normalize()` 구현 |
| **DB 연결** | `.env` `DATABASE_URL` | PostgreSQL 14를 BioCLIP과 같은 GPU 서버에 설치 완료. `.env.example`의 SSH 터널 안내대로 접속. `DATABASE_URL`이 비어 있으면 지금처럼 in-memory로 동작(회귀 없음) |
| **미디어 저장소** | `.env` `MEDIA_STORAGE_*` | 사진 업로드용 오브젝트 스토리지 |
| **종 마스터 데이터** | `.env` `SPECIES_MASTER_*` | 국가생물종지식정보시스템 등 (라이선스 확인) |
| **역지오코딩** | `observation/regionGeneralizer.ts` | 좌표→시군구. 앱 내장 처리 권장 |
| 음성 나레이션(TTS) | `.env` `TTS_*` | 성우 녹음 쓰면 불필요 |
| 푸시 알림 | `.env` `PUSH_*` | FCM/APNs |
| 인증 서명 키 | `.env` `AUTH_JWT_SECRET` | 보호자 계정 인증 |
| 확신도 임계값 튜닝 | `identification/confidencePolicy.ts` | 실측 후 조정 |
| 무료 일일 동정 한도 | `.env` `FREE_DAILY_IDENTIFY_LIMIT` | 명세서 §15에서 수치 확정 |
| 콘텐츠 감수 프로세스 | `child/content/*` | 정확성·안전정보 신뢰 확보 |

`config/assertProductionConfig()`가 프로덕션 부팅 시 필수 공란을 검사해, 자격 증명 누락 상태로
조용히 Mock으로 도는 것을 막는다.

## 아직 구현하지 않은 것 (의도적, 명세서 §12 MVP 범위)

- 새/양서류/음성 동정 (고난도 — MVP 제외). `isMvpIdentifiable()`이 대상군을 식물·곤충·버섯으로 제한.
- 기관용(B2B/B2G, F15), 회고·포토북(F10), 오프라인 큐잉(F13), 알림(F14) — 서비스 인터페이스만 열어둠.
- HTTP API 계층(라우트/컨트롤러) — 이 저장소는 **도메인 로직**까지다. REST/GraphQL 계층은 이 서비스들을 감싸면 된다.
