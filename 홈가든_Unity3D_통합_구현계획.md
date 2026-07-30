# 홈가든 Unity 3D 통합 구현계획

> **상태: 대체됨.** 2026-07-30 결정에 따라 모바일 앱 내부 Unity 통합은 보류하고,
> 홈가든을 별도의 Windows PC 프로그램으로 제공한다. 최신 계획은
> `홈가든_PC_클라이언트_구현계획.md`를 따른다.

작성일: 2026-07-30  
대상 앱: `app` (Expo SDK 57 / React Native 0.86)  
대상 Unity 프로젝트: `unity/BeetleDuel` (Unity 6000.5.4f1)

## 1. 결론

현재 만든 인형의 집 온실과 동식물을 앱의 홈가든으로 사용하는 것은 가능하다.

권장 방식은 기존 React Native 앱 안에서 홈가든 탭을 눌렀을 때 Unity를
전체화면으로 실행하는 **Unity as a Library** 구조다.

- React Native/Expo: 로그인, 도감, 수집 개체 목록, 서버 API, 앱 내비게이션 담당
- Unity: 온실 3D 렌더링, 카메라, 동물 행동, 배치, 쓰다듬기 연출 담당
- 백엔드: 개체 소유권, 배치 상태, 친밀도, 마지막 상호작용 시각의 최종 원본 담당

Unity는 Android/iOS에서 부분 화면 삽입이 아니라 전체화면 렌더링을 전제로 해야 한다.
따라서 기존 React Native 홈가든 HUD와 트레이를 Unity 화면 위에 그대로 얹는 방식보다,
홈가든용 HUD와 보관함을 Unity UI로 옮기는 방식이 유지보수에 유리하다.

## 2. 영상 및 현재 상태 판단

### 2.1 영상에서 확인된 내용

- 온실의 뒷면 절단 방향은 정상이다.
- 정면 구조, 돔, 중앙 분수, 내부 나무가 안정적으로 렌더링된다.
- 조명과 그림자는 이전보다 밝아졌고 콘솔 오류는 보이지 않는다.
- 5.6초 동안 화면 구도는 안정적이다.

### 2.2 아직 부족한 부분

- 카메라가 너무 멀어 동물과 곤충의 움직임을 육안으로 확인하기 어렵다.
- 나무가 동물을 가리는 구간이 많다.
- 현재 장면은 모든 콘텐츠를 한 번에 전시하는 검증 장면이며 사용자별 홈가든 장면이 아니다.
- 배치, 선택, 확대 관찰, 쓰다듬기, 먹이주기 같은 앱용 입력 흐름이 Unity에 없다.
- Unity Build Settings에 빌드 장면이 등록되어 있지 않다.
- 현재 3D 모델 파일은 60개, 약 318.91MB다. 모바일 앱에 그대로 포함하면 안 된다.
- 기존 Expo 앱은 네이티브 `android`/`ios` 프로젝트가 없는 CNG 구조이며 Expo Go만으로
  Unity 런타임을 포함할 수 없다.

따라서 현재 결과는 **PC용 3D 프로토타입으로는 정상**, **모바일 홈가든으로는 통합 전 준비가
필요한 상태**로 판단한다.

## 3. 현재 재사용 가능한 기능

### 앱

- 발견한 종과 소유 개체를 도감 API에서 가져오는 흐름
- 6×6 정원 배치와 로컬 우선 저장
- `GET /garden/layout`
- `PUT /garden/layout`
- `GET /garden/tile-compatibility`
- 개체 상태 조회, 작명, 쓰다듬기와 친밀도 UI
- 가로 화면 진입과 세로 화면 복귀

### 백엔드

- 사용자별 개체 소유권 검증
- 같은 개체의 중복 배치 방지
- 같은 위치의 중복 점유 방지
- 친밀도 1–5단계
- 함께한 일수
- 3일 이상 미상호작용 시 재회 상태
- 작명 및 마지막 상호작용 시각 저장

### Unity

- 인형의 집 형태로 절단된 온실
- 나무, 식물, 새, 곤충, 딱정벌레 모델
- 큰부리까마귀 비행과 나머지 새의 앉기 상태
- 나비, 비행 곤충, 지상 곤충의 기본 행동
- 개체 선택 카메라와 환경 조명 기반 코드

## 4. 목표 사용자 흐름

1. 사용자가 앱에서 동물 또는 식물을 촬영하고 종을 확정한다.
2. 서버가 해당 사용자의 `creature`를 생성한다.
3. 사용자가 홈가든 탭을 연다.
4. 앱이 정원 배치와 소유 개체 목록을 가져온다.
5. 전체화면 Unity 온실이 열린다.
6. Unity는 서버 배치에 들어 있는 개체만 온실에 생성한다.
7. 보관함에서 수집한 개체를 선택해 호환되는 위치에 배치한다.
8. 배치 변경은 앱으로 전달되고 로컬 저장 후 서버에 동기화된다.
9. 개체를 누르면 가까이 확대하고 이름, 함께한 일수, 친밀도를 보여준다.
10. 쓰다듬기 등 상호작용을 하면 서버 친밀도가 갱신되고 Unity에서 반응 애니메이션을 재생한다.
11. 홈가든에서 나가면 최신 배치를 저장하고 Unity를 일시정지 또는 언로드한다.

## 5. 권장 아키텍처

```text
React Native / Expo
├─ 인증 토큰과 사용자 세션
├─ 도감 및 수집 개체 조회
├─ Garden API 호출
├─ 로컬 우선 저장과 재시도
└─ ExpoUnityGarden 네이티브 모듈
        ↕ JSON 명령/이벤트
Android unityLibrary / iOS UnityFramework
└─ GreenhouseGardenScene
   ├─ GardenBootstrapper
   ├─ GardenPlacementController
   ├─ CreatureRegistry
   ├─ HabitatSlotRegistry
   ├─ CreatureInteractionController
   ├─ MobileCameraController
   └─ Addressables 콘텐츠 로더
```

### 5.1 데이터 소유권

인증 토큰은 Unity로 넘기지 않는다.

- React Native가 기존 `apiClient`로 서버와 통신한다.
- Unity는 렌더링과 입력만 담당한다.
- Unity가 `interactRequested`, `placementChanged` 같은 이벤트를 앱에 보낸다.
- 앱이 API 성공 결과를 Unity에 다시 전달한다.
- 서버 데이터와 충돌하면 서버 소유권·배치 검증 결과를 우선한다.

이 구조는 Unity 안에 로그인, 토큰 갱신, Axios와 동일한 오류 처리를 다시 구현하지 않게 한다.

### 5.2 브리지 메시지 계약

#### 앱 → Unity

- `initializeGarden(payload)`
- `applyLayout(layout)`
- `applyCreatureStatus(status)`
- `applyInteractionResult(result)`
- `setQualityLevel(low | medium | high)`
- `pauseGarden()`
- `resumeGarden()`
- `closeGarden()`

초기 payload에 포함할 값:

- 사용자 레벨
- 수집한 개체 목록
- 배치 목록
- 종별 모델 Addressable 키와 버전
- 분류군 및 서식지 호환성
- 장식 해금 목록
- 언어와 접근성 설정

#### Unity → 앱

- `gardenReady`
- `exitRequested`
- `placementChanged`
- `creatureSelected`
- `interactRequested`
- `assetDownloadRequested`
- `runtimeError`
- `performanceSample`

모든 메시지는 `schema_version`, `request_id`, `event`, `payload`를 갖는 JSON으로 정의한다.

## 6. Unity 홈가든 구조 개편

현재 `InsectObservationScene`은 검증용으로 유지하고 앱용 장면을 별도로 만든다.

### 신규 장면

- `GreenhouseGarden.unity`
- `GreenhouseGarden_LowEnd.unity`는 별도 장면으로 만들지 않고 품질 프리셋으로 처리

### 핵심 변경

- 시작할 때 모든 60개 모델을 생성하지 않는다.
- 사용자가 실제로 배치한 개체만 생성한다.
- 온실, 분수, 고정 나무와 식물은 정적 배칭 대상으로 분리한다.
- 동물은 오브젝트 풀을 사용한다.
- 6×6 `row`, `col`을 온실 안의 36개 `HabitatSlot`으로 매핑한다.
- 슬롯에 `grass`, `water_pool`, `soil`, `rock`, `flower_bed`, `perch`, `air` 태그를 둔다.
- 새는 횃대, 오리는 물가, 지상 곤충은 흙과 풀, 나비는 식물 구역으로 이동 범위를 제한한다.
- 선택되지 않은 작은 곤충에는 근거리 확대 표시 또는 관찰 마커를 제공한다.
- 카메라는 전체 보기, 개체 추적, 배치 보기의 세 상태로 나눈다.

## 7. 모바일 자산 파이프라인

현재 약 318.91MB의 모델을 그대로 `Resources`에 넣는 방식은 중단한다.

### 원칙

- 원본 GLB는 제작 원본으로 보관한다.
- Unity에는 모바일용 FBX 또는 최적화 GLB만 넣는다.
- `Resources.Load` 대신 Addressables를 사용한다.
- 온실과 공통 환경만 기본 설치에 포함한다.
- 새 종 모델은 사용자가 해당 종을 얻거나 배치할 때 다운로드한다.
- 다운로드한 번들은 캐시하고 해시로 무결성을 확인한다.

### 1차 권장 예산

| 항목 | 목표 |
|---|---|
| 온실 최종 메시 | 80k–150k triangles |
| 일반 새 LOD0 | 15k–30k triangles |
| 곤충 LOD0 | 5k–15k triangles |
| LOD1 | LOD0의 40–50% |
| LOD2 | LOD0의 10–20% 또는 billboard |
| 일반 텍스처 | 512–1024px |
| 온실 주요 텍스처 | 최대 2048px |
| 애니메이션 동시 활성 | 8–12개 |
| 기본 설치 3D 콘텐츠 | 60–100MB 이내 목표 |
| 실행 FPS | 중급 Android/iPhone에서 30fps 이상 |

실제 수치는 Android 중급 기준 기기에서 프로파일링 후 확정한다.

## 8. 키우기 기능 범위

### MVP

- 정원 배치와 이동
- 이름 표시 및 작명
- 함께한 일수
- 쓰다듬기
- 친밀도 1–5단계
- 오랜만에 방문했을 때 재회 연출
- 친밀도에 따른 대기 행동과 반응 차이
- 개체별 관찰 카메라

기존 서버 기능으로 대부분 구현할 수 있다.

### 2차 확장

- 먹이주기
- 선호 먹이와 서식지 만족도
- 하루 상호작용 횟수 제한
- 개체별 휴식, 탐색, 놀이 상태
- 계절과 시간대 반영
- 장식에 대한 반응
- 친구 홈가든 방문

먹이주기를 추가할 때는 다음 서버 필드가 필요하다.

- `last_fed_at`
- `daily_feed_count`
- `mood`
- `habitat_satisfaction`
- `care_state_version`

실제 야생동물을 포획해 기르는 기능으로 오해되지 않도록, 앱에서는 “수집한 동물의 가상
생태 친구”임을 명확히 표시한다.

## 9. 백엔드 변경 계획

### 기존 API 유지

- `GET /garden/layout`
- `PUT /garden/layout`
- `GET /garden/tile-compatibility`
- `GET /creatures/:id/status`
- `POST /creatures/:id/interact`
- `POST /creatures/:id/name`

### 신규 또는 확장 API

1. `GET /garden/catalog`
   - 종별 `asset_key`, `bundle_version`, `sha256`, `lod_profile`
   - 행동 프리셋과 기본 크기
2. `GET /garden/bootstrap`
   - 레이아웃, 소유 개체, 상태, 해금 장식을 한 번에 반환
3. `PUT /garden/layout`
   - `layout_version` 또는 `revision` 추가
   - 다중 기기 충돌 감지
4. 장식 배치 서버 저장
   - 현재 장식은 기기 로컬에만 저장되므로 레이아웃 계약에 포함
5. 2차 단계에서 `POST /creatures/:id/feed`

첫 MVP에서는 기존 `row`, `col` 스키마를 유지한다. 자유 좌표 저장은 카메라와 충돌 판정,
다중 기기 병합 난도가 커지므로 후속 단계로 미룬다.

## 10. 구현 단계

### Phase 0 — 기술 검증과 기준 측정

예상: 2–4일

- `GreenhouseGarden` 최소 장면 생성
- 온실과 동물 2종만 포함한 Android 개발 빌드
- 중급 Android 실기기에서 FPS, 메모리, 첫 실행 시간을 측정
- Unity 전체화면 진입과 React Native 복귀 검증
- Go/No-Go 기준 확정

완료 조건:

- 앱 홈가든 탭에서 Unity 장면 진입
- 앱으로 정상 복귀
- 반복 20회 진입·이탈 시 크래시 없음
- 30fps 이상

### Phase 1 — 모바일 장면과 자산 최적화

예상: 1–2주

- 온실 모바일 재질과 텍스처 압축
- 모든 모델 LOD 생성
- Addressables 그룹과 원격 카탈로그 구성
- 고정 구조 정적 배칭
- 조명 베이크 또는 혼합 조명 전환
- 품질 프리셋 Low/Medium/High 작성
- 현재 모든 모델 동시 로딩 코드 제거

완료 조건:

- 배치되지 않은 모델은 메모리에 로드되지 않음
- 온실과 10개 개체가 목표 기기에서 30fps 이상
- 다운로드 실패 시 대체 아이콘 또는 기본 모델 표시

### Phase 2 — Expo/Unity 네이티브 브리지

예상: 1–1.5주

- Expo 로컬 모듈 `ExpoUnityGarden` 생성
- Android `unityLibrary` 자동 포함용 config plugin 작성
- iOS `UnityFramework` 연결 자동화
- 개발 빌드 전환
- Unity 진입, 종료, pause/resume, 앱 백그라운드 처리
- JSON 명령과 이벤트 스키마 구현

Android를 먼저 완료하고 iOS는 Android 계약이 안정된 뒤 진행한다.

### Phase 3 — 사용자별 수집 및 배치

예상: 1주

- 기존 2D 홈가든 데이터와 3D 슬롯 매핑
- 소유한 개체만 Unity 보관함에 표시
- 드래그 또는 선택 후 슬롯 배치
- 서식지 비호환 위치 거부
- 로컬 우선 저장과 서버 재동기화
- 기존 2D 레이아웃 마이그레이션

완료 조건:

- 다른 사용자의 개체를 생성할 수 없음
- 앱 종료 후 같은 배치가 복구됨
- 다른 기기 조회 시 서버 배치가 재현됨

### Phase 4 — 키우기 상호작용

예상: 1주

- 개체 선택과 관찰 카메라
- 상태 패널 Unity UI 구현
- 쓰다듬기 요청과 서버 응답 연결
- 친밀도 상승, 최대치, 재회 애니메이션
- 친밀도별 행동 프리셋
- 접근성용 큰 선택 영역과 텍스트 대체 정보

### Phase 5 — 안정화와 출시 준비

예상: 1.5–2주

- Android/iOS 실기기 성능 프로파일링
- 저메모리 복귀와 백그라운드 테스트
- 네트워크 끊김과 자산 다운로드 재시도
- 발열과 배터리 테스트
- 앱 번들 크기 측정
- 크래시 로그와 Unity 런타임 오류 수집
- 기존 2D 홈가든을 비상 폴백으로 일정 기간 유지

## 11. 전체 예상 일정

- Android 우선 MVP: 6–8주, 1명 기준
- Android와 iOS 동시 출시 수준: 8–11주, 1명 기준
- Unity/모바일 네이티브 담당과 앱/백엔드 담당이 나뉘면 4–7주까지 단축 가능

모델 최적화 품질과 iOS 빌드 환경 준비 여부에 따라 달라질 수 있다.

## 12. 출시 합격 기준

### 기능

- 수집하지 않은 개체는 보관함에 나타나지 않는다.
- 배치한 개체만 온실에 생성된다.
- 배치, 이동, 제거가 서버와 왕복된다.
- 쓰다듬기 결과가 친밀도와 Unity 반응에 동시에 반영된다.
- 새, 곤충, 식물이 각자의 서식지 범위를 벗어나지 않는다.
- 앱 백그라운드와 화면 회전 후 상태가 깨지지 않는다.

### 성능

- 중급 Android와 지원 최저 iPhone에서 평균 30fps 이상
- 프레임 시간 급등 구간을 100ms 이하로 제한
- 홈가든 첫 진입 8초 이내, 재진입 3초 이내 목표
- Unity 진입·종료 20회 반복 시 크래시 없음
- 장시간 실행 20분 후 제어 불가능한 메모리 증가 없음

### 시각

- 인형의 집 절단면에 벽·지붕·프레임 잔여물이 없음
- 전체 보기에서도 최소 한 개 이상의 동물 움직임이 명확히 보임
- 작은 곤충을 탭하거나 확대해 관찰할 수 있음
- 그림자 때문에 개체가 식별 불가능해지는 구간이 없음
- 까마귀는 이동 방향을 향해 날고 나머지 새는 기본적으로 앉아 있음

## 13. 주요 위험과 대응

| 위험 | 대응 |
|---|---|
| Unity 런타임 메모리 | 홈가든 이탈 시 pause/unload 정책을 실기기에서 비교하고 저메모리 기기는 2D 폴백 |
| 전체화면 제한 | 홈가든 HUD와 보관함을 Unity UI로 구현 |
| 319MB 모델 자산 | Addressables, 종별 다운로드, LOD, 텍스처 압축 |
| Expo CNG 재생성 시 네이티브 수정 소실 | 수동 수정 대신 로컬 Expo 모듈과 config plugin 사용 |
| iOS에서 Unity 완전 종료 후 재실행 불가 | 세션 중에는 quit 대신 unload/pause 사용 |
| 서버와 Unity 상태 불일치 | 서버를 최종 원본으로 두고 revision 기반 충돌 검증 |
| 저사양 기기 발열 | 30fps 제한, 그림자/애니메이션 수 자동 조절 |

## 14. 바로 시작할 첫 스프린트

첫 구현은 전체 기능을 한 번에 만들지 않고 다음 세로 범위로 제한한다.

1. Android 개발 빌드
2. 온실, 큰부리까마귀, 장수풍뎅이만 포함
3. 홈가든 탭에서 Unity 전체화면 열기
4. 앱이 JSON으로 두 개체의 배치 위치 전달
5. Unity에서 개체 선택
6. 선택 이벤트를 앱에 돌려보내기
7. 홈가든 닫기와 앱 복귀
8. FPS, 메모리, 설치 용량 기록

이 스파이크가 통과한 뒤 나머지 58개 모델 최적화와 사육 기능을 확장한다.

## 15. 공식 기술 참고자료

- [Unity as a Library 개요](https://docs.unity3d.com/6000.0/Documentation/Manual/UnityasaLibrary.html)
- [Unity를 Android 앱에 통합](https://docs.unity3d.com/6000.0/Documentation/Manual/UnityasaLibrary-Android.html)
- [Unity를 iOS 앱에 통합](https://docs.unity3d.com/6000.0/Documentation/Manual/UnityasaLibrary-iOS.html)
- [Expo SDK 57에서 네이티브 코드 추가](https://docs.expo.dev/workflow/customizing/)
- [React Native 0.86 Native Modules](https://reactnative.dev/docs/turbo-native-modules-introduction)
