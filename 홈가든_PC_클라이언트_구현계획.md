# Nature Go PC 홈가든 구현계획

작성일: 2026-07-30  
상태: 구현 기준 문서  
대상: Windows PC용 Unity 홈가든 + 기존 모바일 앱 + 기존 백엔드  
Unity 프로젝트: `unity/BeetleDuel` / Unity 6000.5.4f1

## 0. 2026-07-30 배치 UX 구현 상태

이번 시연용 배치 UX는 다음 순서로 구현한다.

1. 기존 6×6을 7×6, 총 42개 슬롯으로 확장하고 빈 슬롯 링을 상시 표시한다.
2. 보관함 카드를 크게 만들고 보유·배치·배치 가능 수를 카드에서 바로 보여준다.
3. 카드를 온실로 드래그하면 반투명 3D 고스트가 커서를 따라가며, 빈 슬롯은
   초록색, 무효 위치는 빨간색으로 표시한다.
4. 배치 성공 시 1.5초 카메라 포커스, 이름 팝업, 상단 카운터 롤업을 동시에 실행한다.
5. 최근 포획 시각을 bootstrap에 포함해 `NEW` 필터를 자동 선택하고 신규 카드가
   화면 중앙에서 하단 보관함으로 이동하는 애니메이션을 실행한다.

현재 위 5단계는 Unity 런타임과 서버 데이터 계약에 반영됐다. 기존 36개 배치는 그대로
보존하며 새로 추가한 6칸만 빈 슬롯으로 시작한다. 슬롯 배치 결과는 로컬 캐시에 즉시
저장되고 서버 연결 상태에서는 기존 정원 저장 API로 함께 동기화된다.

## 1. 제품 결정

홈가든은 휴대폰 앱 안에서 실행하지 않고 별도의 **Windows PC용 Unity 프로그램**으로
제공한다.

- 휴대폰 앱: 촬영, 동정, 수집, 도감, PC 연결 관리
- PC 홈가든: 온실 3D 렌더링, 동식물 배치, 관찰, 키우기 상호작용
- 백엔드: 사용자 계정, 소유 개체, 배치, 친밀도, 동기화의 최종 원본

```text
휴대폰에서 생물 촬영·동정
             ↓
       서버에 개체 생성
             ↓
PC Nature Go 홈가든 로그인/연결
             ↓
수집한 동식물만 온실 보관함에 표시
             ↓
배치·관찰·쓰다듬기·친밀도 동기화
```

## 2. PC 방식을 선택한 이유

- 현재 인형의 집 온실과 60개 3D 모델은 이미 Windows Unity에서 실행된다.
- 약 318.91MB의 모델 원본을 모바일 설치 용량과 메모리에 맞추는 선행 작업을 피할 수 있다.
- 큰 화면에서 작은 곤충, 새의 자세, 식물과 온실 구조를 관찰하기 쉽다.
- 고품질 텍스처, 부드러운 그림자, 여러 동물의 동시 애니메이션을 유지하기 쉽다.
- Expo 앱에 Unity 네이티브 런타임을 삽입할 필요가 없다.
- Android SDK·NDK·Unity Android 모듈과 iOS Xcode 통합이 필요하지 않다.

PC 버전도 성능 최적화는 필요하지만, 첫 출시에서 모바일 수준으로 모델을 축소할 필요는 없다.

## 3. 현재 상태

### 재사용 가능

- 후면 절반이 제거된 인형의 집 온실
- 현실 크기를 반영한 나무와 확대 표시 식물
- 새, 나비, 비행 곤충, 지상 곤충, 딱정벌레 모델과 기본 행동
- 큰부리까마귀만 비행하고 나머지 새는 앉는 규칙
- 까마귀의 이동 방향과 모델 정면 정렬
- 사용자별 개체 생성과 도감 조회
- 7×6 정원 배치 조회·저장(기존 6×6 배치 호환)
- 개체 소유권과 중복 배치 서버 검증
- 작명, 함께한 일수, 친밀도 1–5단계, 재회, 쓰다듬기 API

### 새로 필요한 부분

- PC 홈가든 전용 Unity 장면
- Windows 실행 파일과 설정 화면
- PC 로그인 또는 휴대폰 기기 연결
- Unity용 HTTP API 클라이언트
- 서버의 `species_id`와 Unity 모델을 잇는 레지스트리
- 사용자별 보관함과 배치 UI
- 오프라인 캐시와 재동기화
- Windows 빌드·업데이트·오류 로그 배포 체계

## 4. 목표 사용자 흐름

### 첫 연결

1. 사용자가 PC에서 `Nature Go 홈가든`을 실행한다.
2. PC 화면에 QR 코드와 6자리 연결 코드가 표시된다.
3. 사용자가 로그인된 휴대폰 앱의 `PC 홈가든 연결` 화면에서 QR을 읽거나 코드를 입력한다.
4. 서버가 PC 기기 세션을 해당 사용자 계정에 연결한다.
5. PC가 사용자 개체와 정원 배치를 내려받는다.
6. 온실과 사용자의 보관함이 열린다.

개발 초기에는 기존 `POST /auth/login`을 사용한 이메일·비밀번호 로그인을 제공한다.
QR 기기 연결은 배치와 동기화가 안정된 다음 추가한다.

### 평상시 사용

1. 휴대폰에서 생물을 새로 수집한다.
2. 서버에 해당 사용자의 `creature`가 생성된다.
3. PC 홈가든이 시작·포커스 복귀·새로고침 시 서버를 조회한다.
4. 신규 개체가 `새 친구` 표시와 함께 보관함에 나타난다.
5. 사용자가 개체를 호환되는 온실 위치에 배치한다.
6. 배치가 즉시 로컬 저장되고 서버에 동기화된다.
7. 개체를 클릭해 확대 관찰하거나 쓰다듬는다.

## 5. 전체 아키텍처

```text
Mobile Expo App
├─ 촬영/동정/도감
├─ PC 연결 코드 승인
└─ PC 연결 해제 및 최근 동기화 확인
             │
             │ HTTPS / JWT
             ▼
Seed Service
├─ 인증 및 PC 기기 세션
├─ 소유 Creature
├─ GardenLayout
├─ CreatureStatus / Bond
├─ GardenCatalog
└─ 배치 revision 및 충돌 처리
             ▲
             │ UnityWebRequest / JSON
             │
Windows Unity Client
├─ DesktopAuthController
├─ GardenApiClient
├─ LocalGardenCache
├─ GreenhouseGardenScene
├─ GardenPlacementController
├─ CreatureModelRegistry
├─ CreatureBehaviourController
├─ GardenCameraController
└─ DesktopGardenUI
```

PC Unity는 서버에 직접 연결한다. 모바일 앱을 켜 놓아야 PC 홈가든이 동작하는 구조로 만들지
않는다.

## 6. Unity 프로젝트 구조

현재 `InsectObservation` 장면은 개발·검증용으로 보존하고 앱용 장면을 분리한다.

### 신규 장면

- `Assets/Scenes/PCGardenBootstrap.unity`
  - 로그인, 서버 선택, 다운로드, 오류 복구
- `Assets/Scenes/GreenhouseGarden.unity`
  - 실제 온실과 사용자 개체

### 신규 코드 영역

```text
Assets/Scripts/PCGarden/
├─ Auth/
│  ├─ DesktopAuthController.cs
│  ├─ DesktopSessionStore.cs
│  └─ DeviceLinkController.cs
├─ Api/
│  ├─ GardenApiClient.cs
│  ├─ GardenApiModels.cs
│  └─ GardenSyncQueue.cs
├─ Runtime/
│  ├─ PCGardenBootstrap.cs
│  ├─ GardenPlacementController.cs
│  ├─ HabitatSlot.cs
│  ├─ CreatureModelRegistry.cs
│  ├─ CreatureSpawner.cs
│  ├─ CreatureSelectionController.cs
│  └─ GardenCameraController.cs
├─ Care/
│  ├─ CreatureCareController.cs
│  └─ CreatureReactionController.cs
└─ UI/
   ├─ LoginPanelController.cs
   ├─ CreatureTrayController.cs
   ├─ CreatureStatusPanelController.cs
   └─ SyncStatusController.cs
```

### 런타임 원칙

- 검증 장면처럼 모든 동물을 무조건 생성하지 않는다.
- 서버 배치에 포함된 개체만 온실에 생성한다.
- 보관함 썸네일은 모델을 생성하지 않고 2D 아이콘 또는 미리 렌더링한 이미지를 사용한다.
- 나무, 식물, 온실은 정적 오브젝트로 유지한다.
- 동일 종이 여러 마리면 모델과 재질은 공유하고 개체 상태만 분리한다.
- 선택 해제된 동물의 애니메이션 업데이트 빈도를 거리별로 줄인다.

## 7. 온실 배치 시스템

첫 버전은 기존 서버의 6×6 `row`, `col`을 보존하면서 7번째 행을 추가한다.

- 온실 안에 42개의 `HabitatSlot`을 배치한다.
- 각 슬롯은 `row`, `col`, `habitat_type`, `world_position`, `world_rotation`을 가진다.
- 서버의 `row`, `col`을 동일한 슬롯에 대응시킨다.
- 기존 모바일 2D 홈가든에 배치된 개체도 데이터 손실 없이 PC 위치로 변환한다.

### 슬롯 종류

- `grass`
- `water_pool`
- `soil`
- `rock`
- `flower_bed`
- `perch`
- `air`

서버의 기존 타일 호환성은 유지하고, PC 전용 `perch`, `air`는 모델 행동 범위를 정하는
보조 태그로 사용한다.

### 개체 행동

- 새: 기본적으로 횃대에 앉기
- 큰부리까마귀: 지정된 공중 경로에서만 비행
- 오리·왜가리: 물가와 얕은 물 주변
- 나비·벌·잠자리: 식물 구역 주변 비행
- 지상 곤충: 흙·풀 슬롯을 벗어나지 않음
- 나무·식물: 이동하지 않음

## 8. 카메라와 PC 입력

### 입력

- 마우스 왼쪽 클릭: 개체 선택
- 마우스 오른쪽 드래그: 카메라 회전
- 마우스 휠: 확대·축소
- 마우스 가운데 드래그 또는 `WASD`: 화면 이동
- `Esc`: 선택 해제 또는 이전 화면
- 보관함 드래그: 개체 배치

### 카메라 상태

1. 전체 온실 보기
2. 배치 모드
3. 개체 관찰 모드
4. 자동 둘러보기 모드

작은 곤충을 선택하면 자동으로 가까이 이동하며, 나무나 온실 프레임이 시야를 가릴 때는
카메라 충돌 또는 임시 투명화를 적용한다.

## 9. 인증과 PC 연결

### 개발 MVP

- 기존 `POST /auth/login` 재사용
- 이메일과 비밀번호는 요청에만 사용하고 저장하지 않음
- 발급받은 토큰만 Windows 사용자 범위 암호화 저장소에 보관
- 로그아웃 시 토큰과 캐시된 개인정보 제거

### 운영용 휴대폰 연결

신규 흐름:

1. PC `POST /desktop/link/start`
2. 서버가 6자리 `user_code`, 비밀 `device_code`, 만료 시각 반환
3. 모바일 `POST /desktop/link/approve`로 로그인 사용자가 승인
4. PC가 `POST /desktop/link/token`을 짧은 간격으로 조회
5. 승인되면 PC 전용 access/refresh token 발급

### 보안 기준

- 연결 코드는 5분 만료
- 연결 코드는 1회 사용
- PC 토큰은 모바일 토큰과 별도 폐기 가능
- 비밀번호, access token, refresh token을 로그에 출력하지 않음
- HTTPS가 아닌 운영 서버 연결 금지
- 휴대폰 앱에서 연결된 PC 이름과 마지막 사용 시각 확인 및 원격 로그아웃 제공

## 10. 서버 변경 계획

### 유지할 API

- `POST /auth/login`
- `GET /dex`
- `GET /garden/layout`
- `PUT /garden/layout`
- `GET /garden/tile-compatibility`
- `GET /creatures/:id/status`
- `POST /creatures/:id/interact`
- `POST /creatures/:id/name`

### 추가할 API

#### PC 연결

- `POST /desktop/link/start`
- `POST /desktop/link/approve`
- `POST /desktop/link/token`
- `GET /desktop/sessions`
- `DELETE /desktop/sessions/:sessionId`

#### 홈가든 시작 데이터

- `GET /garden/bootstrap`
  - 사용자 레벨
  - 소유 개체
  - 배치
  - 타일 호환성
  - 개체 상태 요약
  - 모델 카탈로그 버전

#### 모델 카탈로그

- `GET /garden/catalog`
  - `species_id`
  - `asset_key`
  - `behaviour_profile`
  - `real_world_scale`
  - `display_scale`
  - `asset_version`
  - `sha256`

### 배치 계약 확장

`GET/PUT /garden/layout`에 다음을 추가한다.

- `revision`
- `updated_at`
- 장식 배치

`PUT`은 클라이언트가 마지막으로 본 `revision`을 전송하고, 오래된 revision이면 `409`와 최신
레이아웃을 반환한다.

## 11. 동기화와 오프라인 정책

- 서버가 최종 원본이다.
- PC는 마지막 정상 bootstrap과 레이아웃을 로컬 캐시한다.
- 네트워크가 끊기면 마지막 정원을 읽기 전용으로 먼저 보여준다.
- 오프라인 배치 변경을 허용할 경우 작업 큐에 기록한다.
- 재연결 시 `revision`을 확인해 충돌이 없을 때만 업로드한다.
- 충돌하면 최신 서버 레이아웃을 보여주고 사용자가 PC 변경을 다시 적용할지 선택하게 한다.
- 새 개체 확인은 시작 시, 창 포커스 복귀 시, 사용자의 새로고침 시 수행한다.
- 자동 폴링은 60초보다 짧게 하지 않는다.

## 12. 키우기 기능

### MVP

- 이름과 종명 표시
- 함께한 일수
- 친밀도 1–5
- 쓰다듬기
- 3일 이상 미접속 후 재회 연출
- 친밀도에 따른 반응 애니메이션 차이
- 개체 확대 관찰
- 정원에서 이동·제거

기존 서버 기능으로 구현할 수 있다.

### 2차 확장

- 먹이주기와 선호 먹이
- 놀이와 휴식
- 기분 상태
- 서식지 만족도
- 시간대와 계절 변화
- 장식과 개체의 상호작용
- 친구 PC 홈가든 방문

먹이주기 도입 시 서버에 `last_fed_at`, `daily_feed_count`, `mood`,
`habitat_satisfaction`, `care_state_version`을 추가한다.

## 13. 모바일 앱 변경

기존 `GardenScreen`의 2D 정원은 바로 삭제하지 않는다.

### 1차

- 홈가든 탭을 `PC 홈가든` 안내 화면으로 변경
- Windows 다운로드 안내
- 현재 수집 개체 수와 마지막 PC 동기화 시각 표시
- 개발 기간에는 기존 2D 홈가든으로 들어가는 숨김 폴백 버튼 유지

### 2차

- QR 스캔과 6자리 연결 코드 승인
- 연결된 PC 목록
- PC 세션 원격 로그아웃
- `PC에 새 친구가 도착했어요` 상태 표시

2D 배치 데이터는 PC 3D 슬롯 마이그레이션에 사용하므로 서버 스키마와 저장소를 제거하지 않는다.

## 14. 3D 자산 전략

PC 첫 버전은 현재 모델을 사용하되 빌드와 메모리를 관리한다.

### 기본 설치 포함

- 온실
- 공통 나무와 식물
- 현재 지원하는 새·곤충·동물 모델

### 최적화

- 원본은 별도 보존
- PC용 LOD0/LOD1/LOD2 생성
- 먼 거리의 작은 곤충은 billboard 또는 렌더링 생략
- 텍스처 mipmap과 플랫폼 압축
- 동일 재질 통합
- 고정 구조 정적 배칭
- 모델별 렌더러·삼각형·텍스처 메모리 리포트 자동 생성

### 장기 전략

종이 크게 늘어나면 모델을 Addressables 번들로 분리하고, 사용자가 수집한 종만 내려받는다.
첫 MVP에서는 설치 파일에 포함해 네트워크 다운로드 문제를 줄인다.

## 15. Windows 빌드와 배포

### 개발 빌드

- `Builds/Windows/NatureGoGarden/NatureGoGarden.exe`
- Development Build와 로그 활성화
- ZIP 배포

### 운영 빌드

- Windows 10/11 x64
- IL2CPP 또는 Mono 성능·호환성 비교 후 결정
- 앱 버전과 서버 API 최소 버전 검사
- 코드 서명된 설치 프로그램
- 사용자 데이터는 `%LOCALAPPDATA%/NatureGo/Garden` 아래에 저장
- 로그에는 개인정보와 토큰을 제외

### 업데이트

첫 운영 버전은 다운로드 페이지에서 새 설치 프로그램을 받는 방식으로 시작한다.
자동 업데이트는 홈가든 안정화 이후 별도 런처 또는 signed updater로 추가한다.

## 16. 1차 권장 PC 사양과 성능 목표

### 최소 사양 후보

- Windows 10 64-bit
- 8GB RAM
- DirectX 11 지원 GPU
- GTX 1050 Ti 또는 동급
- 여유 저장공간 3GB

### 권장 사양 후보

- Windows 10/11 64-bit
- 16GB RAM
- GTX 1650 / RX 570 이상, VRAM 4GB
- SSD

실제 최소 사양은 GTX 1050 Ti급과 내장 그래픽 실기기에서 측정 후 확정한다.

### 성능 합격 목표

- 권장 사양에서 1920×1080 평균 60fps
- 최소 사양에서 1280×720 평균 30fps
- 첫 온실 진입 15초 이내
- 재진입 5초 이내
- 실행 RAM 2.5GB 이하 목표
- 비정상적으로 증가하는 메모리 누수 없음
- 30분 실행 후 입력 지연이나 애니메이션 붕괴 없음

## 17. 구현 단계

### Phase 0 — Windows 기술 스파이크

예상: 2–4일

- `PCGardenBootstrap`과 `GreenhouseGarden` 장면 생성
- Windows Build Settings 등록
- 온실, 큰부리까마귀, 장수풍뎅이만 생성
- 로컬 mock bootstrap JSON으로 사용자 배치 재현
- 창 모드와 전체화면 전환
- FPS, RAM, VRAM, 첫 진입 시간을 기록

완료 조건:

- Windows 실행 파일 생성
- Editor 없이 온실 실행
- 까마귀와 장수풍뎅이 표시 및 선택
- 20분 실행 시 오류·메모리 증가 없음

### Phase 1 — PC 홈가든 장면과 UI

예상: 1주

- 전체/배치/관찰 카메라
- 36개 HabitatSlot
- 보관함과 개체 선택 UI
- 드래그 배치·이동·제거
- 작은 곤충 관찰 확대
- 정적 환경과 동적 개체 분리

### Phase 2 — 로그인과 서버 동기화

예상: 1주

- 기존 이메일 로그인
- Windows 토큰 보관
- `GardenApiClient`
- dex/layout/status/interact API 연결
- 로컬 캐시와 동기화 표시
- 서버 장애·401·타임아웃 UI

### Phase 3 — 사용자 수집 개체와 모델 레지스트리

예상: 1주

- `species_id → model/behaviour/scale` 레지스트리
- 소유한 개체만 보관함에 표시
- 모델이 없는 종의 대체 표시
- 기존 2D 배치 마이그레이션
- 배치 revision과 충돌 처리

### Phase 4 — 키우기 경험

예상: 1주

- 상태 패널
- 쓰다듬기와 반응 애니메이션
- 친밀도 상승과 최대 친밀도 연출
- 재회 연출
- 작명
- 친밀도별 행동 변화

### Phase 5 — 휴대폰 기기 연결

예상: 1주

- PC 연결 코드·QR 생성
- 모바일 승인 화면
- PC 전용 세션 발급과 폐기
- 연결된 PC 목록과 원격 로그아웃

### Phase 6 — 최적화·패키징·QA

예상: 1–2주

- 저사양 PC 프로파일링
- LOD와 텍스처 메모리 조정
- 네트워크 복구와 오프라인 캐시
- 설치 프로그램과 버전 검사
- 크래시·로그 수집
- 반복 실행과 장시간 안정성 테스트

## 18. 예상 일정

- 이메일 로그인 기반 Windows MVP: 5–7주, 1명 기준
- QR 휴대폰 연결과 배포 안정화 포함: 7–9주, 1명 기준
- Unity 담당과 앱/백엔드 담당이 병렬 작업하면 4–6주까지 단축 가능

## 19. 출시 합격 기준

### 계정과 데이터

- 휴대폰에서 수집한 개체가 PC 보관함에 나타남
- 다른 사용자 개체는 절대 나타나지 않음
- 배치, 이동, 제거가 서버와 왕복됨
- PC 재실행 후 동일한 정원이 복구됨
- PC 연결을 휴대폰에서 해제할 수 있음

### 홈가든

- 배치된 개체만 온실에 생성됨
- 식물과 나무는 움직이지 않음
- 큰부리까마귀 외 새는 기본적으로 앉아 있음
- 까마귀가 이동 방향을 향해 자연스럽게 비행함
- 작은 곤충도 선택·확대 관찰 가능
- 온실 절단면에 뒤쪽 구조물이 남지 않음
- 그림자 때문에 개체 식별이 불가능한 구간이 없음

### 안정성

- 권장 PC 1080p 60fps, 최소 PC 720p 30fps 목표 충족
- 로그인·동기화 실패 시 데이터가 사라지지 않음
- 30분 실행과 재실행 20회에서 크래시 없음
- 토큰과 비밀번호가 로그 또는 평문 파일에 남지 않음

## 20. 위험과 대응

| 위험 | 대응 |
|---|---|
| 휴대폰과 PC를 모두 써야 하는 진입 장벽 | QR 연결, 자동 로그인, 마지막 정원 즉시 표시 |
| 모델 증가로 설치 용량 확대 | LOD, 모델 압축, 장기적으로 Addressables 종별 다운로드 |
| PC 토큰 탈취 | Windows 사용자 범위 암호화, PC 세션 분리, 원격 로그아웃 |
| 다중 PC 배치 충돌 | revision 기반 낙관적 잠금과 충돌 UI |
| 작은 곤충이 보이지 않음 | 선택 마커, 확대 카메라, 관찰 모드 |
| 사용자 PC 성능 차이 | 시작 시 품질 자동 감지와 Low/Medium/High 프리셋 |
| 서버가 꺼지면 정원 진입 불가 | 마지막 정상 정원 로컬 캐시와 읽기 전용 진입 |

## 21. 첫 스프린트

가장 먼저 다음 세로 범위만 구현한다.

1. `GreenhouseGarden` PC 전용 장면
2. 온실, 큰부리까마귀, 장수풍뎅이
3. mock 사용자 개체와 6×6 중 2개 배치
4. 전체 보기와 개체 관찰 카메라
5. 마우스 클릭 선택
6. Windows Development Build
7. 20분 실행 성능 측정
8. 결과를 기준으로 전체 모델 확장 여부 결정

첫 스프린트에서는 모바일 앱과 서버 코드를 변경하지 않는다. Windows 실행 파일과 장면이
안정적으로 동작하는 것을 먼저 증명한 후 로그인·동기화를 연결한다.
