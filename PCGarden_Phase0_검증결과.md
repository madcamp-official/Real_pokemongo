# Nature Go PC 홈가든 Phase 0 검증 결과

검증일: 2026-07-30  
대상 프로젝트: `unity/BeetleDuel`  
Unity: 6000.5.4f1  
대상 빌드: Windows x64 Development Build

## 결론

PC 홈가든 첫 스프린트의 완료 조건을 충족했다.

- Editor 없이 Windows 실행 파일로 온실이 정상 실행된다.
- mock bootstrap에서 큰부리까마귀와 장수풍뎅이 2개체만 생성된다.
- 두 개체 모두 이름·친밀도 버튼 또는 모델 클릭으로 선택할 수 있다.
- 선택한 작은 곤충은 자동 확대되며, 움직이는 까마귀는 카메라가 계속 추적한다.
- 까마귀의 이동 방향과 보정된 모델 앞방향의 수평 내적은 `1.0000`이다.
- 20분 연속 실행 중 36개 샘플이 모두 응답 상태였다.
- Player 로그에서 Exception, Error, Crash, Assert, Fatal 항목이 발견되지 않았다.

## 구현 범위

### 전용 런타임

- `Assets/Scripts/PCGarden/GardenBootstrapData.cs`
- `Assets/Scripts/PCGarden/PCGardenController.cs`
- `Assets/Scripts/PCGarden/PCGardenCreatureView.cs`
- `Assets/Scripts/PCGarden/PCGardenOrbitCamera.cs`
- `Assets/StreamingAssets/pc-garden-mock-bootstrap.json`

### 장면과 빌드

- `Assets/Scenes/GreenhouseGarden.unity`
- `Assets/Editor/PCGardenSceneBuilder.cs`
- 실행 파일: `unity/BeetleDuel/Builds/Windows/NatureGoGarden/NatureGoGarden.exe`

### 입력과 화면

- 왼쪽 클릭 또는 이름 버튼: 개체 선택
- 오른쪽 드래그: 카메라 회전
- 마우스 휠: 확대·축소
- `WASD`: 화면 이동
- `Esc` 또는 `전체 보기`: 전체 온실로 복귀
- `F11`: 전체화면 전환

## 기능 검증 결과

| 항목 | 결과 |
|---|---|
| 온실 절단면 | 열린 후면에서 내부가 보이고 정면 외형은 유지됨 |
| 조명 | 그림자가 관찰면 반대쪽으로 향하도록 방향 보정 |
| mock 개체 | 큰부리까마귀 1, 장수풍뎅이 1 |
| 6×6 배치 변환 | 서버형 `row`, `col`을 온실 내부 좌표로 변환 |
| 까마귀 비행 | 계속 비행, 진행 방향과 모델 앞방향 내적 `1.0000` |
| 장수풍뎅이 표시 | PC 관찰용 전시 배율 적용 |
| 선택 UI | 이름·친밀도 버튼과 3D 콜라이더 모두 제공 |
| 관찰 카메라 | 정적 개체 확대 및 비행 개체 실시간 추적 |
| 독립 실행 | 정상 |
| 화면 성능 | 1920×1080 창 모드에서 60FPS 표시 |

## Windows 빌드

- 최종 증분 빌드: 성공
- 빌드 오류: 0
- 빌드 경고: 0
- Unity 빌드 리포트 크기: 1,677.79MB
- 출력 폴더 실제 크기: 약 1.64GB
- Development Build이므로 우측 하단에 Development Build 표시가 남는다.

현재 빌드가 큰 이유는 기존 나무·식물·동물 모델이 `Resources` 아래에 있어 PC 홈가든에서
사용하지 않는 자산도 함께 포함되기 때문이다. 기능 스파이크에는 허용하지만 배포 전에는
Addressables 또는 전용 자산 번들로 분리해야 한다.

## 20분 연속 실행

| 지표 | 측정값 |
|---|---:|
| 샘플 수 | 36 |
| 응답 정상 샘플 | 36 / 36 |
| 작업 메모리 최소–최대 | 179.8–1,174.2MB |
| 개인 메모리 최소–최대 | 1,264.7–1,266.6MB |
| GPU 공유 메모리 | 약 758MB |
| GPU 전용 메모리 | 0MB |
| Player 로그 예외·오류·크래시 | 0 |

검증 PC는 Intel Arc 130V 통합 GPU를 사용했다. 창이 백그라운드로 이동한 뒤 운영체제가
작업 메모리를 회수했지만 개인 메모리는 약 2MB 범위에 머물러 증가 추세가 없었다.

## 산출물

- `Builds/Windows/NatureGoGarden/PCGarden_Standalone_Final_Window.png`
- `Builds/Windows/NatureGoGarden/PCGarden_Standalone_ClickQA.png`
- `Builds/Windows/NatureGoGarden/PCGarden_Soak_QA.json`
- `Tools/Monitor-PCGarden.ps1`

## 다음 스프린트 권장 순서

1. 36개 `HabitatSlot`과 배치·이동·제거 UI
2. 보관함과 전체/배치/관찰 카메라 상태 분리
3. `species_id → model/behaviour/scale` 레지스트리
4. 이메일 로그인과 `GardenApiClient`
5. bootstrap/layout/status API 및 로컬 캐시
6. Addressables 기반 종별 모델 분리로 설치 크기와 시작 메모리 축소
7. UI Toolkit 기반 운영 UI와 Release Build 패키징

## 2026-07-30 화질·바닥·마우스 회전 보정

### 확인된 원인

- 기존 Ultra 품질의 안티앨리어싱이 2×라 얇은 온실 프레임에 계단 현상이 보였다.
- 절단 도구의 `use_fill=True`가 결합된 온실 메시의 절단면을 한꺼번에 채워 지붕에
  불필요한 면을 만들었다.
- 원래 바닥 메시가 복잡하고 비정형이라 절단선에 울퉁불퉁한 구멍과 외곽이 남았다.
- 원본 GLB의 단일 PBR 재질이 `metallicFactor=1.0`이라 어두운 환경에서 내부 면이
  검게 보였다.

### 적용한 수정

- 8× MSAA, 강제 이방성 필터링, 원본 mipmap, Very High 그림자를 적용했다.
- 절단면 자동 채우기를 제거했다.
- 온실 하단 정점의 볼록 껍질로 얇고 평평한 바닥 메시를 새로 생성했다.
- PC 홈가든에서 온실 재질을 흰색 도장 금속에 가까운 값으로 보정했다.
  - `baseColorFactor=(1.25, 1.25, 1.22)`
  - `metallicFactor=0.08`
  - `roughnessFactor=0.68`
  - 양면 렌더링
- 왼쪽 또는 오른쪽 마우스 버튼을 누른 채 드래그하면 카메라가 회전한다.
- 클릭과 드래그를 5픽셀 이동 임계값으로 분리해 동물 선택과 회전이 충돌하지 않게 했다.

### 재검증

- Windows Development Build: 성공, 오류 0, 경고 0
- Player 로그 오류·예외·크래시: 0
- 왼쪽 드래그로 정면에서 측면까지 회전하는 장면을 독립 실행 파일에서 확인
- 보정 전 화면:
  `Builds/Windows/NatureGoGarden/PCGarden_ClarityFloor_BeforeDrag.png`
- 왼쪽 드래그 측면 화면:
  `Builds/Windows/NatureGoGarden/PCGarden_LeftDrag_SideView.png`
