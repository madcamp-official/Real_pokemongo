# Nature Go 현재 구현 기능명세서

> 다른 AI·개발자가 현재 코드베이스를 이어서 작업하기 위한 구현 기준 문서

## 0. 문서 정보

| 항목 | 내용 |
|---|---|
| 기준일 | 2026-07-28 |
| 저장소 | `madcamp-official/Real_pokemongo` |
| 기준 브랜치 | `living-dex_ver2.6` |
| 확인한 HEAD | `54114cc` + 현재 작업 트리의 미커밋 수정 |
| 앱 | Expo SDK 57 / React Native 0.86 / React 19 / TypeScript |
| 서버 | Node.js / TypeScript / Fastify 5 |
| 주 저장소 | PostgreSQL, 개발 시 연결 실패하면 InMemory 폴백 |
| AI 동정 | 자체 GPU BioCLIP 우선, 실패 시 설정된 다음 프로바이더로 폴백 |
| 문서 원칙 | 기획상 목표가 아니라 현재 코드에서 실제 동작하는 범위만 기록 |

이 문서는 기존 `리빙도감_프론트엔드_기능명세서.md`,
`리빙도감_백엔드_기능명세서.md`를 대체하지 않는다. 기존 문서는 제품 목표를 포함하고
있으며, 이 문서는 현재 구현 상태와 인수인계 계약을 설명한다.

상태 표기는 다음과 같다.

- **완료**: 앱 UI와 서버 경로가 연결되어 핵심 흐름이 동작한다.
- **부분 구현**: 핵심 일부는 동작하지만 UI, 영속화 또는 외부 연동이 남아 있다.
- **미구현**: 기획 문서에는 있으나 현재 실행 경로에 없다.

## 1. 제품 한눈에 보기

Nature Go는 실제 생물을 촬영하고 AI로 종을 추정한 뒤, 사용자가 확정한 결과를 도감,
지도, 퀘스트, 배지, 홈가든에 연결하는 모바일 앱이다.

현재 대표 사용자 흐름은 다음과 같다.

```text
온보딩/로그인/게스트 시작
  → 카메라에서 생물 촬영 또는 갤러리 사진 선택
  → 로컬 영속 업로드 큐
  → 서버 메타데이터 제거 및 사진 보정
  → BioCLIP 동정
  → 고확신/후보 선택/위험 경고 화면
  → 사용자 확정
  → 관찰·도감·개체·퀘스트·배지 진행 갱신
  → 지도 핀 및 홈가든 배치
```

카메라 화면에서는 셔터를 누르기 전 피사체를 터치해 저해상도 크롭으로 빠른 잠정 종
추정과 위험 여부를 확인할 수도 있다. 이 터치 스캔은 도감이나 보상에 영향을 주지 않는다.

## 2. 전체 구현 상태

| 기능 | 상태 | 현재 구현 |
|---|---|---|
| F1 온보딩·인증 | 완료 | 튜토리얼, 로그인, 회원가입, 순차 동의, 서버 게스트 세션 |
| 게스트→정식 계정 데이터 이전 | 부분 구현 | 전환 UI와 API는 있으나 서버 응답은 현재 `migrated_sightings: 0` |
| F2 촬영 | 완료 | 단일/길게 눌러 버스트, 갤러리, 줌, 권한, 로컬 보관, 업로드 큐 |
| F3 사진 정화·보정 | 서버 완료 / 앱 부분 | EXIF 제거·버스트 병합·품질 판정 구현, 재촬영 권고 UI는 미연결 |
| F4 AI 동정 | 완료 | BioCLIP, 확신도 정책, 후보 선택, 위험 우선 경고, 사용자 확정 |
| F5 도감 | 완료 | 3열 그리드, 분류 필터, 발견 상태, 완성도, 상세 이동 |
| F6 종 카드 | 대부분 완료 | 안전 수칙, 생태 정보, 관찰 포인트, 퀴즈, 유사종, 사진 갤러리 |
| 종 카드→정원 즉시 초대 | 부분 구현 | 버튼은 메인으로만 이동하며 특정 개체 자동 선택은 없음 |
| F7 3D 모델 | 미구현 | 현재 홈가든은 2D PNG/SVG 스프라이트 방식 |
| F8 XP·배지 | 완료 | XP 바, 레벨, 배지 해금 및 수령, 레벨업 연출 |
| F9 친밀도 | 완료 | 상태 조회, Bond, 상호작용, 재회 판정, 작명 |
| F10 퀘스트 | 완료 | 진행률, 자동 판정, 완료, 보상 수령 |
| F11 지도 | 부분 구현 | 실제 카카오맵, 현재 위치, 관찰 핀, 핀 상세, 300m 홈 구역 |
| 실제 미방문 지역 시각화 | 미구현 | “안 가본 곳” 토글은 안내 UI만 표시 |
| F12 푸시 알림 | 미구현 | 설정의 알림 토글은 로컬 상태만 변경 |
| F14 소셜 | 미구현 | 친구, 정원 공유, 반응 API/화면 없음 |
| F16 홈가든 | 대부분 완료 | 가로 2D 월드, 배치, 장식, 상태 시트, pan/zoom, 구역 해금 |
| 홈가든 장식 서버 동기화 | 부분 구현 | 생물 배치는 서버 저장, 장식은 기기 로컬에만 저장 |
| F17 계절 이벤트 | 미구현 | 별도 이벤트 화면·API 없음 |
| F18 설정·계정 | 대부분 완료 | 개인정보 서버 동기화, 복원 조회, 로그아웃, 계정 삭제 |
| F19 터치 사전 스캔 | 완료 | 터치 좌표 크롭, 224px 전송, 잠정 종/위험 표시, 위험 진동 |

## 3. 현재 데이터 범위

서버 시드 기준:

| 데이터 | 수량 |
|---|---:|
| 전체 Taxon | 82종 |
| 곤충 | 31종 |
| 식물 | 31종 |
| 조류 | 18종 |
| 버섯 | 1종 |
| 파충류 | 1종 |
| 종 카드 콘텐츠 | 82종 |
| 퀘스트 | 2개 |
| 배지 | 5개 |

`SafetyFilter.isMvpIdentifiable()`에 선언된 제품 정책상 사진 AI 동정 MVP 대상군은
식물·곤충·버섯이다. 다만 이 함수는 현재 테스트 외 실행 경로에서 호출되지 않으므로 강제
제한은 아니다. 현재 BioCLIP이 조류·파충류를 반환하고 시드 학명에 매칭하면 실제 동정
후보가 될 수 있다. 대상군을 엄격히 제한하려면 게이트웨이 또는 확정 경로에 정책 연결이
추가로 필요하다.

분류 그룹의 앱 표시값은 다음 5개다.

```text
곤충 / 양서류 / 식물 / 조류 / 기타
```

서버의 `fungus`, `reptile` 등은 앱 DTO에서 `기타`로 매핑된다.

## 4. 앱 구조와 내비게이션

### 4.1 루트 스택

```text
Tutorial
Choice
Login
Consent
Signup
Main
SpeciesCard
IdentifyResult
PhotoViewer
```

- 로컬 Zustand 재수화와 SecureStore 토큰 복원이 모두 끝난 뒤 첫 화면을 결정한다.
- 튜토리얼 미완료면 `Tutorial`.
- 튜토리얼 완료 및 활성 세션이 있으면 `Main`.
- 로그아웃 상태면 `Choice`.
- 저장된 게스트 상태에 토큰이 없으면 앱 시작 시 서버 게스트 세션을 자동 복구한다.

### 4.2 메인 탭

```text
Map / Camera / Dex / Garden / Rewards / Settings
```

기본 탭바는 숨겨져 있다. 지도 하단의 방사형 메뉴가 각 화면으로 이동하는 주 진입점이다.
탭 내비게이터를 유지하므로 화면별 로컬 UI 상태는 탭 전환 후에도 보존된다.

- 기본 화면 방향은 세로다.
- 홈가든 진입 시 가로로 잠그고, 이탈 시 다시 세로로 복귀한다.
- `SpeciesCard`, `IdentifyResult`, `PhotoViewer`는 루트 스택 상세 화면이다.

## 5. 기능별 상세 명세

### 5.1 온보딩·로그인·게스트

#### 구현된 동작

- 3단계 튜토리얼.
- 시작 방식 선택: 로그인, 계정 만들기, 게스트.
- 이메일/비밀번호 로그인.
- 회원가입 입력:
  - 이메일 형식 검증
  - 비밀번호 8자 이상
  - 비밀번호 확인
  - 닉네임 1~12자
  - 6개 아바타 중 선택
- 가입 전 순차 동의:
  - 개인정보
  - 위치
  - 사진
- 동의 버전과 동의 시각을 로컬에 저장하고 가입 요청에도 포함한다.
- 액세스 토큰은 `expo-secure-store`에 보관한다.
- 일반 세션 상태, 동의, 게스트 횟수는 Zustand persist로 보관한다.
- 게스트도 서버에서 임시 사용자와 JWT를 발급받아 인증 API를 사용할 수 있다.
- 게스트 촬영 한도는 2회다.
- 서버 재시작 등으로 게스트 토큰이 401을 받으면 Axios 인터셉터가 새 게스트 세션을
  한 번 발급하고 원 요청을 재시도한다.

#### 주의할 점

- 가입 화면의 `convert` 모드와 `/session/guest/convert` 엔드포인트는 존재한다.
- 현재 백엔드 전환 API는 실제 관찰 이전 없이 `migrated_sightings: 0`을 반환한다.
- 따라서 “게스트 기록 이어가기” 문구와 실제 서버 데이터 이전은 완전히 일치하지 않는다.
- 일반 계정의 401은 자동 재가입하지 않고 세션을 정리한다.

### 5.2 카메라·촬영·갤러리

#### 촬영

- `expo-camera` 후면 카메라 사용.
- 짧게 누르면 단일 촬영.
- 길게 누르면 260ms 간격으로 연속 촬영.
- 한 번에 최대 8프레임.
- 촬영 품질은 `quality: 0.7`.
- 핀치 줌 및 1배/약 2배 전환 버튼.
- 촬영 중 프레임 수 표시.
- 카메라 권한이 없으면 별도 권한 요청 화면을 표시한다.
- 위치 권한은 촬영 권한과 분리한다.
- 설정에서 위치 수집을 켠 경우에만 현재 위치를 요청하고 업로드에 좌표를 첨부한다.
- 위치 획득 실패는 촬영 실패로 처리하지 않는다.

#### 갤러리

- `expo-image-picker`로 이미지 한 장을 선택한다.
- EXIF에 GPS 필드가 있는지 여부만 검사한다.
- EXIF의 원래 좌표를 직접 읽어 서버로 보내지 않는다.
- 위치 정보가 있는 갤러리 사진이면 현재 기기 위치를 다시 요청해 첨부한다.

#### 촬영 전 터치 스캔

- 카메라 프리뷰의 피사체 위치를 터치하면 1프레임을 촬영한다.
- CameraView `cover` 크롭 비율을 역산해 화면 좌표를 사진 좌표로 변환한다.
- 터치 주변 사진 가로·세로 45% 영역을 크롭한다.
- 가로 224px JPEG로 축소하고 base64로 `/vision/preview-scan`에 보낸다.
- 결과는 터치 지점에 잠정 종 이름, 확신도, 위험 여부로 표시한다.
- 위험 결과면 200ms 진동한다.
- 결과는 4.5초 뒤 자동으로 사라진다.
- 터치 스캔은 관찰, 도감, 개체, XP, 퀘스트에 어떤 데이터도 쓰지 않는다.
- 서버 제한은 IP당 분당 20회다.

#### 로딩 UI

- 촬영 후 큐 등록과 결과 화면 전환 중 전체 화면 로더를 표시한다.
- 정적 원형 트랙과 회전 강조선을 분리해 원 자체가 깜빡이지 않는다.
- 결과 화면이 실제로 카메라를 덮어 카메라 화면이 blur 될 때까지 로더 상태를 유지한다.

### 5.3 업로드 큐

- 촬영 파일을 앱 document 영역에 영속 저장한 뒤 큐에 넣는다.
- 큐 항목 상태:

```text
pending / uploading / done / failed
```

- 큐 자체도 Zustand persist로 저장한다.
- 앱이 업로드 중 종료되면 다음 실행에서 `uploading`을 `pending`으로 복구한다.
- 최대 3회 시도.
- 실패 사이 1.5초 × 시도 횟수의 선형 backoff.
- 성공하면 로컬 임시 사진을 삭제한다.
- 결과 화면은 현재 항목이 3회 실패하면 “다시 시도” 버튼을 제공한다.
- `UploadStatusStrip` 컴포넌트는 존재하지만 현재 어떤 화면에도 마운트되지 않는다.
  따라서 전역 실패 목록 UI는 아직 없다.

### 5.4 서버 사진 정화·보정

업로드 처리 순서:

```text
multipart frames 수신
  → JPEG/PNG 형식 검사
  → EXIF/GPS/텍스트 메타데이터 제거
  → 버스트 화질 분석
  → 평균 병합 또는 가장 선명한 단일 프레임 선택
  → 노출·선명도 보정 대표 이미지 생성
  → PendingSightingStore에 임시 저장
```

- 파일 파트당 최대 15MB.
- 프레임이 없으면 400.
- 알 수 없는 이미지 형식이면 400.
- JPEG EXIF·GPS·주석과 PNG eXIf·텍스트 계열 청크를 제거한다.
- 보정 실패가 업로드 자체를 깨지 않도록 원본 정화 이미지 폴백을 둔다.
- 서버는 `retake_suggested`를 업로드 응답에 추가한다.
- 현재 앱 `SightingUploadResponse`와 UI는 이 값을 소비하지 않는다.
- 저품질로 판정되고 사용자가 사진 이용에 동의한 경우에만 정화된 사진을 재학습 샘플로
  로컬 미디어 저장소에 보관한다.
- 사용자 확정 시 영구 보관하는 관찰 사진은 보정 대표 이미지 1장뿐이다.

### 5.5 AI 동정과 사용자 확정

#### 프로바이더

우선순위:

```text
BioCLIP → Plant.id → Pl@ntNet → MockProvider
```

- 현재 실제 동작하도록 연결된 프로바이더는 BioCLIP이다.
- Plant.id/Pl@ntNet 구현은 벤더 스펙·키 대기 상태로 사실상 비활성이다.
- 설정된 프로바이더가 예외나 타임아웃을 내면 다음 프로바이더를 시도한다.
- 모든 프로바이더 실패 시 안전한 unknown 결과를 반환한다.
- BioCLIP은 GPU 서버의 로컬 바인딩 포트를 SSH 터널로 연결하는 개발 구성을 사용한다.
- 엔드포인트와 자격 증명은 `.env`에서만 관리하며 문서나 코드에 비밀을 넣지 않는다.

#### 확신도 정책

| 최상위 확신도 | 처리 |
|---|---|
| 0.85 이상 | high, 단일 종 제안 |
| 0.60 이상 | medium, 최대 3개 후보 중 사용자 선택 |
| 0.35 이상 | low, 가능한 경우 상위 분류로 폴백 |
| 0.35 미만 | unknown, 재촬영 안내 |

- 알려진 혼동 종 쌍에서 top1과 top2 차이가 0.05 미만이면 high도 medium으로 강등한다.
- `/identify`는 읽기 전용 추론이다. 이 단계에서는 도감이나 보상을 갱신하지 않는다.
- `/identify/confirm`에서 사용자가 방금 받은 후보 중 하나를 골라야만 기록한다.
- 후보에 없는 `species_id`를 보내면 400.

#### 결과 화면

- 업로드 큐에서 `sighting_id`가 생길 때까지 기다린다.
- 업로드 실패, 동정 중, unknown, 위험, 후보 선택, high 축하 상태를 각각 렌더링한다.
- 위험 후보면 다른 콘텐츠보다 경고와 안전 정보 버튼을 먼저 노출한다.
- 확정 후 도감, XP, 퀘스트 Query 캐시를 무효화하고 종 카드로 이동한다.

#### 현재 한계

- `/identify/confirm` 실패를 사용자에게 재시도시키지 않고 종 카드로 이동한다.
- `PendingSightingStore`는 서버 프로세스 메모리다. 업로드 후 확정 전 서버가 재시작되면
  해당 임시 sighting을 잃는다.

### 5.6 안전 정책

- 위험 태그:

```text
toxic_if_eaten
sting_or_bite
contact_dermatitis
allergen
protected_species
```

- 위험 종은 종 정보보다 안전 안내를 먼저 표시한다.
- 후보 목록에 위험 종이 하나라도 있으면 배제 불가로 보고 보수적으로 경고한다.
- 버섯은 위험 태그 유무와 관계없이 “만지거나 먹지 말고 눈으로 관찰”하도록 안내한다.
- 이 서비스는 식용 여부를 판정하지 않는다.

### 5.7 도감

- 전체 시드 종을 3열 그리드로 표시한다.
- 발견/미발견 상태를 구분한다.
- 필터:

```text
전체 / 곤충 / 양서류 / 식물 / 조류 / 기타
```

- `GET /dex/completion`의 전체·발견 수·백분율을 표시한다.
- 종 카드를 누르면 발견 여부와 관계없이 종 상세 화면으로 이동할 수 있다.
- 한 종에 속한 실제 `Creature[]` 데이터를 응답에 포함한다.

### 5.8 종 카드·사진 갤러리

- 국명과 학명.
- 안전/위험 상태 배지.
- 위험 종 안전 수칙 최상단.
- 서식지, 크기, 활동 시간, 희귀도.
- 재미있는 사실.
- 관찰 포인트.
- 선택형 퀴즈.
- 헷갈리기 쉬운 유사종 링크.
- 지금까지 확정한 관찰 사진 목록.
- 사진 탭 시 전체 화면 뷰어.
- 미디어 URL은 짧은 `mt` 토큰이 붙은 사용자 범위 URL이며, 다른 관찰에 재사용할 수 없다.
- “우리집 정원에 초대하기”는 현재 특정 개체 선택 없이 `Main`으로만 이동한다.

### 5.9 XP·레벨·배지·퀘스트

- 관찰 확정 시 RewardEngine과 QuestEngine이 자동으로 진행을 반영한다.
- XP는 누적값이며 현재 레벨 시작 문턱과 다음 레벨까지 남은 XP를 함께 제공한다.
- 퀘스트나 배지는 해금과 수령이 분리되어 있다.
- 수령 시 XP가 지급된다.
- 이미 수령했거나 조건이 안 된 항목은 서버가 거부한다.
- 보상 화면에서:
  - XP 바
  - 레벨
  - 활성/완료/수령 퀘스트
  - 배지 상태
  - 수령 중 상태
  - 레벨업 연출
  을 표시한다.
- 현재 시드 퀘스트는 2개, 배지는 5개다.
- 레벨은 홈가든 구역과 장식 해금에 사용한다.

### 5.10 실제 지도

- 앱 홈은 `MapScreen`.
- 백엔드 `/map.html`이 카카오맵 JS SDK 페이지를 만든다.
- 앱은 HTML을 받아 WebView에 직접 주입한다.
- 카카오 허용 origin을 맞추기 위해 WebView `baseUrl`은 `https://localhost:8080`을 사용한다.
- 카카오 개발자 콘솔 Web 플랫폼에도 같은 origin 등록이 필요하다.
- RN과 지도 페이지는 `postMessage`로 통신한다.
- 지도 명령:

```text
set_pins / set_center / set_me
```

- 지도 이벤트:

```text
ready / pin_press / map_press / error
```

- ready 전 명령은 큐에 모았다가 준비 후 전달한다.
- 12초 안에 ready가 오지 않으면 무한 로딩 대신 오류 안내를 표시한다.
- 현재 기기 GPS가 있으면 현재 위치와 반경 300m 홈 구역을 표시한다.
- 관찰 핀을 누르면 종 요약·위험 정보를 담은 상세 시트를 연다.
- 상세 시트에서 전체 종 카드로 이동한다.
- 이번 주 발견 종 수를 표시한다.
- 오프라인, 지도 로딩 실패, 위치 권한 없음 상태를 각각 안내한다.

#### 부분 구현

- `GET /map/explored-regions`는 현재 마지막 관찰 위치만 제공한다.
- 방문 영역 blob과 home_zone 응답은 비어 있다.
- “안 가본 곳” 버튼은 선택 상태와 안내 문구만 바꾸며 실제 미방문 영역을 지도에 그리지 않는다.

### 5.11 홈가든

#### 화면과 조작

- 가로 화면 전용 2D 월드.
- 1400×596 배경 PNG.
- 한 손가락 pan, 두 손가락 pinch zoom.
- 왼쪽 구역 Lv.3, 오른쪽 구역 Lv.5 해금.
- 발견했고 검수된 정원 아트가 있는 개체만 친구 보관함에 표시한다.
- 친구를 보관함에서 정원으로 드래그한다.
- 드롭 위치에서 가장 가까운 호환 가능하면서 비어 있는 타일로 스냅한다.
- 드래그 중 흰색 원형 슬롯을 모두 표시하지 않는다.
- 이미 놓인 친구를 길게 눌러 이동할 때만 작은 초록색 `+` 위치 표식을 표시한다.
- 한 논리 타일에는 한 개체만 놓을 수 있다.
- 생물 배치는 6×6 `row`, `col` 계약을 유지한다.
- 식물과 동물의 발밑 인공 그림자는 표시하지 않는다.
- 동물은 기준 위치 주변 2~4px, 날개 곤충은 최대 약 13px 안에서만 천천히 움직인다.
- 날개 곤충은 별도 날갯짓 레이어를 사용한다.
- 나무는 큰 고정 스프라이트로 표시한다.

#### 타일 호환성

현재 서버 저작값:

| 그룹 | 배치 가능 타일 |
|---|---|
| 곤충 | 잔디, 꽃밭, 흙, 돌 |
| 양서류 | 물웅덩이, 잔디, 흙 |
| 식물 | 흙, 꽃밭, 잔디 |
| 조류 | 잔디, 돌, 꽃밭, 흙 |
| 기타 | 흙, 잔디, 돌, 꽃밭, 물웅덩이 |

#### 장식

장식 7개:

```text
꽃밭 / 울타리 / 연못 / 열매나무 / 벤치 / 나무다리 / 꽃 아치
```

- 발견 종 수와 레벨 조건으로 해금한다.
- 장식은 `% x/y` 자유 좌표로 배치한다.
- 길게 눌러 제거한다.
- 장식은 Zustand 로컬 저장만 하며 `/garden/layout`에는 포함되지 않는다.

#### 상태·작명·친밀도

- 배치된 친구를 누르면 상태 시트를 연다.
- 표시 정보:
  - 이름
  - 함께한 일수
  - Bond / Bond 최대치
  - 오늘 상태 문구
  - 재회 여부
- 작명은 서버 `POST /creatures/:id/name`.
- 상호작용은 `POST /creatures/:id/interact`.
- 상호작용은 Bond 증가, 반응 문구, Bond 구간 상승, 재회 여부를 반환한다.

#### 저장 정책

- 생물 배치는 로컬 우선으로 즉시 저장한다.
- 변경 후 `PUT /garden/layout`으로 서버 동기화한다.
- 동기화 실패는 UI 흐름을 막지 않으며 다음 변경 때 다시 시도한다.
- 로컬 타일 데이터가 이미 있으면 서버 레이아웃을 다시 덮어쓰지 않는다.
- 다중 기기 충돌 해결 정책은 구현되어 있지 않다.

### 5.12 설정·개인정보·계정

- 알림 토글: 로컬 저장만 한다.
- 위치정보 수집 토글:
  - 서버 개인정보 설정과 동기화한다.
  - 촬영 시 GPS 첨부 여부에 실제 반영한다.
- 사진 수집·이용 토글:
  - 서버 개인정보 설정과 동기화한다.
  - 저품질 재학습 샘플 저장 여부에 실제 반영한다.
- 서버 값을 조회한 뒤 로컬 설정에 반영한다.
- 변경은 낙관적으로 UI에 반영하고 서버 실패 시 원래 값으로 되돌린다.
- 계정 프로필 표시.
- 데이터 복원 조회.
- 로그아웃.
- 계정 삭제 확인 및 서버 전체 삭제 워크플로우.
- 게스트 전환 배너와 게스트 체험 종료.

## 6. 로컬 상태와 영속화

| Store | 영속화 | 주요 데이터 |
|---|---|---|
| `authStore` | 일부 | 온보딩, 동의, 게스트 상태·횟수, 사용자 |
| SecureStore | 예 | 액세스 토큰 |
| `settingsStore` | 예 | 알림, 위치, 사진 토글 |
| `uploadQueueStore` | 예 | 사진 URI, 업로드 상태, 시도 횟수, sighting ID |
| `gardenStore` | 예 | 타일, 생물 배치, 로컬 이름, 장식 |
| `rewardsStore` | 아니요 | 현재 런타임 레벨 |
| TanStack Query | 메모리 | 서버 조회 캐시 |

TanStack Query 기본값:

- query 재시도 2회
- mutation 재시도 1회
- stale time 30초
- window focus 자동 갱신 비활성

## 7. 백엔드 저장과 개인정보

### 7.1 PostgreSQL

`DATABASE_URL`이 있고 연결되면 다음 저장소를 PostgreSQL로 구성한다.

```text
users
taxa
observations
collection
quests
badges
credentials
consent
creatures
garden
```

- 개발 환경에서 DB 연결에 실패하면 InMemory로 폴백한다.
- InMemory 데이터는 서버 재시작 시 사라진다.
- 프로덕션에서는 DB 연결 실패를 숨기지 않고 부팅을 실패시킨다.

### 7.2 미디어

- 현재 확정 관찰 사진은 서버 로컬 디스크에 저장한다.
- 클라우드 오브젝트 스토리지 자격 증명 필드는 있으나 실제 어댑터는 아직 없다.
- 원본 프레임은 메모리에만 두고 사용자 확정 후 폐기한다.
- 영구 저장 대상은 메타데이터가 제거된 보정 대표 이미지다.

### 7.3 좌표

- 촬영 좌표가 있으면 관찰에 정밀 좌표를 저장한다.
- 위치 저장 동의는 일반화된 region 생성 및 사용자 설정에 영향을 준다.
- 현재 region 일반화는 실제 역지오코딩이 아니라 저해상도 그리드 stub이다.
- 지도 핀은 본인 관찰의 정밀 좌표를 사용한다.

### 7.4 접근 제어

- 인증 라우트는 JWT와 실제 사용자 존재를 함께 검증한다.
- 남의 자원과 존재하지 않는 자원은 같은 404로 처리해 존재 여부를 누설하지 않는다.
- 정원 배치 저장 시 소유 개체인지 검증한다.
- 계정 삭제는 사용자 범위의 관찰, 도감, 퀘스트, 배지, 자격 증명, 동의, 개체, 정원을 삭제한다.

## 8. 현재 API 목록

### 8.1 공개 API

| Method | Path | 역할 |
|---|---|---|
| POST | `/auth/signup` | 회원가입·동의 저장 |
| POST | `/auth/login` | 로그인 |
| POST | `/session/guest` | 게스트 사용자·토큰 발급 |
| GET | `/map.html` | 카카오맵 WebView HTML |
| GET | `/garden/tile-compatibility` | 분류군별 배치 가능 타일 |
| GET | `/species/:speciesId/card` | 공개 종 카드 참조 데이터 |
| POST | `/vision/preview-scan` | 터치 기반 잠정 동정, IP rate limit |

### 8.2 인증 필요 API

| Method | Path | 역할 |
|---|---|---|
| POST | `/session/guest/convert` | 게스트 전환 결과 반환 |
| POST | `/sightings/upload` | 사진·좌표 업로드 및 보정 |
| POST | `/identify` | sighting 읽기 전용 동정 |
| POST | `/identify/confirm` | 후보 확정 및 관찰 기록 |
| GET | `/dex` | 도감 목록, `group`·`sort` 쿼리 지원 |
| GET | `/dex/completion` | 도감 완성도 |
| GET | `/species/:speciesId/photos` | 본인 종별 관찰 사진 |
| GET | `/profile/xp` | XP·레벨 |
| GET | `/badges` | 배지 목록 |
| POST | `/badges/claim` | 배지 수령 |
| GET | `/quests` | 퀘스트 목록 |
| POST | `/quests/:questId/claim` | 퀘스트 보상 수령 |
| POST | `/creatures/:creatureId/name` | 개체 작명 |
| GET | `/creatures/:creatureId/status` | 상태·Bond·재회 |
| POST | `/creatures/:creatureId/interact` | 친밀도 상호작용 |
| GET | `/garden/layout` | 정원 생물 레이아웃 |
| PUT | `/garden/layout` | 정원 생물 레이아웃 저장 |
| GET | `/map/pins` | 본인 관찰 핀 |
| GET | `/map/explored-regions` | 마지막 관찰 위치·미구현 영역 필드 |
| GET | `/account/restore-bundle` | 복원 요약 |
| GET | `/account/privacy-settings` | 위치·사진 설정 |
| PATCH | `/account/privacy-settings` | 위치·사진 설정 변경 |
| DELETE | `/account` | 계정과 사용자 데이터 삭제 |

### 8.3 단기 미디어 URL

| Method | Path | 역할 |
|---|---|---|
| GET | `/media/:observationId?mt=...` | 관찰에 고정된 단기 토큰으로 이미지 반환 |

## 9. 주요 파일

### 앱

| 경로 | 역할 |
|---|---|
| `app/src/navigation/RootNavigator.tsx` | 초기 경로, 토큰 재수화, 게스트 복구 |
| `app/src/navigation/MainTabs.tsx` | 숨김 탭 구조와 화면 방향 |
| `app/src/screens/CameraScreen.tsx` | 카메라 UI와 결과 화면 전환 |
| `app/src/hooks/useCapture.ts` | 단일/버스트 촬영 |
| `app/src/hooks/usePreviewScan.ts` | 터치 좌표 변환·크롭·잠정 동정 |
| `app/src/store/uploadQueueStore.ts` | 영속 업로드 큐·재시도 |
| `app/src/screens/identify/IdentifyResultScreen.tsx` | 업로드/동정/확정 상태 UI |
| `app/src/screens/MapScreen.tsx` | 지도 홈·핀·현재 위치 |
| `app/src/components/map/KakaoMapView.tsx` | WebView 지도 브릿지 |
| `app/src/screens/DexScreen.tsx` | 도감 목록 |
| `app/src/screens/dex/SpeciesCardScreen.tsx` | 종 상세 |
| `app/src/screens/RewardsScreen.tsx` | XP·퀘스트·배지 |
| `app/src/screens/GardenScreen.tsx` | 홈가든 조립·드래그·배치 |
| `app/src/components/garden/GardenScene2D.tsx` | 2D 월드·스프라이트·애니메이션 |
| `app/src/components/garden/GardenCreatureArt.tsx` | 정원 종별 아트 레지스트리 |
| `app/src/store/gardenStore.ts` | 생물 배치·장식 로컬 저장 |
| `app/src/screens/SettingsScreen.tsx` | 개인정보·계정 UI |
| `app/src/api/client.ts` | 토큰, multipart, 게스트 401 복구 |
| `app/src/config/env.ts` | 실기기 개발 서버 호스트 자동 탐지 |

### 서버

| 경로 | 역할 |
|---|---|
| `seed-service/src/composition.ts` | 저장소·프로바이더·도메인 서비스 조립 |
| `seed-service/src/config/index.ts` | 환경 변수와 프로덕션 검증 |
| `seed-service/src/http/server.ts` | Fastify 플러그인·라우트·전역 오류 처리 |
| `seed-service/src/http/routes/sightings.routes.ts` | 업로드·동정·확정 |
| `seed-service/src/http/routes/vision.routes.ts` | 터치 스캔 |
| `seed-service/src/core/identification/IdentificationGateway.ts` | 프로바이더 폴백·확신도·안전 |
| `seed-service/src/core/identification/providers/BioClipProvider.ts` | GPU 추론 서버 어댑터 |
| `seed-service/src/core/media/MediaSanitizer.ts` | EXIF/GPS 제거 |
| `seed-service/src/core/media/ImageEnhancer.ts` | 화질 분석·버스트 병합·보정 |
| `seed-service/src/core/safety/SafetyFilter.ts` | 위험·버섯 안전 정책 |
| `seed-service/src/child/ObservationFlow.ts` | 확정 후 도감·퀘스트·보상 트랜잭션 |
| `seed-service/src/core/repositories/postgres/PostgresRepositories.ts` | PostgreSQL 저장소 |
| `seed-service/src/seed/seedData.ts` | 82종·콘텐츠·퀘스트·배지·정원 호환성 |

## 10. 개발 실행

### 10.1 앱

```powershell
cd "C:\Users\gjtjw\Desktop\nature Go\app"
npm install
npx expo start -c
```

- Metro 기본 포트는 8081.
- 앱은 `app.json > extra.apiBaseUrl`이 있으면 그 값을 우선한다.
- 없으면 Expo 런타임의 Metro 호스트를 찾아 `http://<개발 PC LAN IP>:8080`을 사용한다.
- 자동 탐지 실패 시 `http://localhost:8080`으로 폴백한다.
- 실기기에서 `localhost`는 휴대폰 자신이므로 자동 탐지가 실패하면 override가 필요하다.

### 10.2 서버

```powershell
cd "C:\Users\gjtjw\Desktop\nature Go\seed-service"
npm install
npm run db:migrate
npm run serve
```

- API 기본 포트는 8080.
- 실기기 접근 시 `HTTP_HOST=0.0.0.0`이 필요하다.
- PostgreSQL과 BioCLIP이 원격 서버의 localhost에만 바인딩된 개발 환경에서는 각각 SSH
  로컬 포트포워딩이 필요하다.
- 터널 호스트, 사용자, 비밀번호, DB 비밀번호는 이 문서에 적지 않는다.
- 실제 값은 로컬 `.env`와 운영 비밀 관리 수단에서만 확인한다.

### 10.3 검증

```powershell
cd app
npx tsc --noEmit

cd ..\seed-service
npm run typecheck
npm test
```

최근 검증 결과:

- 앱 TypeScript 검사 통과.
- 서버 TypeScript 검사 통과.
- 서버 테스트 240개 중 234개 통과.
- PostgreSQL 연결 문자열이 필요한 통합 테스트 6개는 환경 미설정 시 skip.

## 11. 현재 알려진 한계와 우선 후속 작업

### 높음

1. 게스트→정식 계정 전환 시 실제 서버 관찰·도감·사진 소유권 이전 구현.
2. `PendingSightingStore`를 Redis/PostgreSQL 등 재시작 안전 저장소로 이전.
3. `/identify/confirm` 실패 시 종 카드로 넘어가지 말고 사용자 재시도 UI 제공.
4. 서버 `retake_suggested`를 앱 타입과 결과 UI에 연결.
5. 홈가든 장식의 서버 스키마·API·다중 기기 동기화 추가.

### 중간

1. 실제 방문 영역 저장과 “안 가본 곳” 지도 시각화.
2. `UploadStatusStrip`을 공통 화면에 마운트해 전체 실패 업로드 복구 제공.
3. 종 카드의 “정원에 초대”를 특정 `Creature` 선택과 정원 보관함 이동으로 연결.
4. 로컬 디스크 미디어를 오브젝트 스토리지로 이전.
5. 실제 역지오코딩 기반 시·군·구 일반화.
6. BioCLIP 장애·지연 상태를 관리자나 앱에 더 명확히 노출.

### 낮음·미구현 제품 영역

1. 푸시 알림과 알림 시간대 설정.
2. 친구·정원 공유·반응 등 소셜.
3. 계절 이벤트 화면과 API.
4. 3D 모델 렌더링.
5. TTS.

## 12. 다른 AI가 수정할 때 지켜야 할 불변 조건

1. 위험 후보가 있으면 종 정보보다 안전 안내를 먼저 보여야 한다.
2. 터치 스캔은 읽기 전용이어야 하며 도감·개체·퀘스트·XP를 변경하면 안 된다.
3. `/identify`는 부수효과가 없어야 하고, 기록은 `/identify/confirm`에서만 해야 한다.
4. 사용자가 받은 후보에 없는 종은 확정할 수 없어야 한다.
5. 위치 권한 거부나 위치 획득 실패가 촬영 자체를 실패시키면 안 된다.
6. 서버에 보내는 사진에서는 EXIF/GPS 메타데이터를 제거해야 한다.
7. FormData 요청의 `Content-Type` boundary는 React Native가 직접 만들게 해야 한다.
8. 남의 자원과 없는 자원은 동일한 404로 처리해야 한다.
9. 액세스 토큰을 AsyncStorage에 평문 저장하지 않는다.
10. 일반 계정 401을 게스트 자동 생성으로 복구하면 안 된다.
11. 정원 생물 배치의 기존 `row`, `col` 서버 계약을 임의로 깨지 않는다.
12. 사용자 기존 작업 트리와 로컬 `.env`를 덮어쓰거나 비밀을 출력·커밋하지 않는다.
13. PostgreSQL 연결 실패 후 InMemory 폴백 여부를 로그에서 반드시 확인한다.
14. BioCLIP을 실제 모드로 검증할 때는 로컬 추론 포트가 열려 있는지 먼저 확인한다.
15. 기능 변경 후 최소한 앱·서버 TypeScript 검사와 관련 서버 테스트를 실행한다.

## 13. 코드 기준으로 폐기되었거나 사용하지 않는 것

- 홈가든 실행 경로에는 Three.js, WebGL, GLB 모델을 사용하지 않는다.
- `IsoGrid.tsx`, `IsoTile.tsx`는 이전 정원 렌더러이며 현재 `GardenScreen`의 주 렌더러가 아니다.
- 방문 영역의 과거 일러스트 지도 blob/home_zone 모델은 현재 실제 지도에서 사용하지 않는다.
- Plant.id/Pl@ntNet 설정 필드는 있으나 현재 실제 동정의 주 경로가 아니다.
- `UploadStatusStrip`은 구현되어 있으나 현재 화면 트리에 연결되지 않았다.

---

이 문서와 코드가 충돌하면 코드와 테스트를 우선 확인하고, 실제 동작을 검증한 뒤 이 문서를
같이 갱신한다. 기획 문서에 적혀 있다는 이유만으로 미구현 기능을 구현 완료로 간주하지 않는다.
