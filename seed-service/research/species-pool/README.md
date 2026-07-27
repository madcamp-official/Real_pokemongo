# 종 Pool 후보 Universe (1단계 산출물)

동정 모델 species pool 선정 파이프라인의 **1단계(Universe 구축)** 결과물입니다.
2단계(임베딩 기반 가중 k-center 대표종 선택)의 입력으로 쓰기 위한 중간 데이터입니다.

**최신 버전은 v3입니다.**
- v1: 식물·곤충·균류 3개 그룹만(파일럿, 방법론 검증용).
- v2: 조류·포유류·양서류·파충류·기타무척추동물(거미/달팽이/노래기/지네/가재게) 추가, 8개 그룹.
- v3(현재): v2에서 발견된 오염 의심종 3종 완전 배제, 파충류/양서류/포유류의 저빈도종
  대폭 정리, **어류(민물고기) 신규 추가**.

## 파일

- **`kr-species-universe-v3-final.json`** — 최종 산출물(1000종, cap 상한 도달).
  `group`, `sciName`, `gbifSpeciesKey`, `koreaObservationCount`, `percentileInSource`(그룹/쿼리
  내부 정규화 백분위), `mustInclude` 등을 담음.
- `build_kr_universe_v3.mjs` — 재실행 스크립트. `node build_kr_universe_v3.mjs > out.json`.
  그룹/facetLimit/제외리스트/필수포함후보는 파일 상단 `SOURCES`/`EXCLUDE_LIST`/
  `MUST_INCLUDE_CANDIDATES`/`STRICT_MIN_COUNT`에서 조정.
- `genus-duplicates-for-review.json` — 같은 그룹 내 같은 속(genus) 중복 144건. 대부분 정상.
- `kr-species-universe-v1.json`, `build_kr_universe.mjs`, `build_kr_universe_v2.mjs` — 이전
  버전, 이력 보존용.

## 방법론 (v1·v2 공통 부분은 요약, 자세한 근거는 git 이력의 이전 README 참고)

1. GBIF Occurrence API, `country=KR` + `basisOfRecord=HUMAN_OBSERVATION` 강제 — 해외 관측
   혼입과 표본채집 편향을 원천 차단.
2. 상위분류군별 `facet=speciesKey`로 국내 관측건수 상위 N종 추출.
3. 각 종 재조회로 분류학적 상태 검증(`MISAPPLIED` 배제, `SYNONYM`은 정명 치환, `DOUBTFUL`은
   플래그만).
4. 그룹/쿼리 내부 백분위(`percentileInSource`)로 정규화 — 균류·양서류처럼 관측량 스케일이
   원래 작은 그룹이 곤충·식물에 밀려 배제되는 걸 방지.
5. must-include: 순수 랭킹으로 못 잡히는 안전필수/상징종을 GBIF로 실존 검증 후 강제 포함.
6. 1000종 예산: must-include 보존, 나머지는 백분위 내림차순으로 컷.

### v3에서 새로 한 것

**(1) 확정 배제 3종 추가.** `Pica pica`(v2에서 이미 발견·제거) 외에, 사용자 검토 결과
아래 3종도 완전 배제 처리:
- `Buteo buteo`(유럽말똥가리류) — 동아시아 분리종 `Buteo japonicus`와 유사한 종분리 오염
  패턴으로 의심되었으나 확증 부족이라 v2에선 보류, 이번엔 배제로 확정.
- `Larus argentatus`(유럽재갈매기) — 동아시아 분리종 `Larus vegae`가 이미 더 높은 순위로
  pool에 있어 동일 패턴, 배제.
- `Corvus corone` — 국내 서식 여부 문헌상 논쟁 있어 배제.

**(2) 파충류/양서류/포유류 저빈도종 대폭 정리.** "개체수가 적은 종은 최대한 배제" 요청에
따라 그룹별로 v2보다 훨씬 엄격한 최소 관측건수 문턱값을 적용(`STRICT_MIN_COUNT`):
mammal ≥100, reptile ≥50, amphibian ≥200. 실제 분포를 직접 봐서 정한 값 —
예컨대 포유류는 100 밑으로 고래·물범 등 해양포유류(Tursiops aduncus, Neophocaena
asiaeorientalis, Phoca largha 등 — "이웃에서 관찰 가능"과 거리가 먼 종들)와 극희귀
박쥐·설치류가 몰려있었음. 결과: reptile 28→13종, amphibian 21→14종, mammal 60→20종.

**(3) 어류(민물고기) 신규 추가.** GBIF 백본은 조류/포유류처럼 어류를 하나의 class로 묶지
않는다(`Actinopterygii`가 백본 노드로 존재하지 않음 — Reptilia와 같은 부류의 "계통분류상
측계통이라 현대 분류에서 배제" 사례). 대신 `species/44/children`(phylum Chordata)을 직접
조회해서 어류에 해당하는 목(order) 14개를 확인 후 개별 쿼리:
Cypriniformes(잉어목, 붕어·피라미 등 국내 담수어 최대 비중)/Perciformes(농어목, 배스·블루길·
망둑어류)/Siluriformes(메기목)/Beloniformes(송사리목)/Anguilliformes(뱀장어목)/
Salmoniformes(연어목, 산천어 등)/Synbranchiformes(드렁허리목)/Cyprinodontiformes/
Osmeriformes(빙어목)/Gasterosteiformes(큰가시고기목)/Pleuronectiformes(가자미목)/
Tetraodontiformes(복어목)/Syngnathiformes/Scorpaeniformes. 처음엔 Beloniformes와
Siluriformes를 빠뜨려서 **송사리(Oryzias latipes, 초등교과서에도 나오는 상징종, 국내
관측 1409건)와 메기가 통째로 누락**되는 걸 뒤늦게 발견해 추가 — 총 112종 확보.
**TaxonGroup 스키마에 `fish` 슬롯이 없어** 일단 `group: "other"`로 담되 `sourceClass`
필드에 목(order) 이름을 남겨 나중에 구분/분리 가능하게 함. 전용 스키마 슬롯을 새로 팔지는
이 pool을 앱에 실제로 연결하는 시점에 별도 결정 필요.

## 참고: 자동 오염판정은 신뢰도가 낮았음 (v2에서 시도, v3에도 유효)

GBIF `distributions` API로 "이 학명이 실제로 아시아/한국에 분포한다는 근거가 있는지" 전수
자동검증을 시도했으나, 체크리스트 데이터소스가 서구권(특히 벨기에)에 강하게 편중돼 있어
아시아 키워드 부재를 배제 기준으로 쓰면 위양성이 너무 많았다(1000종 중 352종 플래그, 그 중엔
배추흰나비·표고버섯처럼 명백히 정상인 종도 포함). **그래서 자동 배제는 쓰지 않았고, Pica
pica처럼 다수의 권위있는 출처(IOC/ITIS/Catalogue of Life)가 일관되게 뒷받침하는 경우에만
개별 확인 후 수동 배제했다.** 이번 v3에서 사용자가 직접 판단해 배제한 3종도 같은 성격 —
자동화가 못 미더운 영역은 사람이 최종 판단한다는 원칙을 유지.

## 최종 그룹별 종 수 (v3, 1000종)

| 그룹 | 종 수 | 비고 |
|---|---|---|
| plant | 206 | |
| fungus | 194 | |
| insect | 206 | |
| bird | 121 | Buteo buteo/Larus argentatus/Corvus corone/Pica pica 배제 반영 |
| other | 226 | 무척추동물(거미·달팽이·노래기·지네·가재게) + 어류(112종) 포함 |
| mammal | 20 | v2(60) 대비 대폭 정리 |
| amphibian | 14 | v2(21) 대비 정리 |
| reptile | 13 | v2(28) 대비 대폭 정리 |

## 알려진 한계 (2단계 진행 전 반드시 반영할 것)

1. **국명(한글명) 매핑이 없다.** 국가생물종지식정보시스템 등 별도 소스 필요.
2. **habitat/season 태그도 없다.**
3. **어류의 `group` 값이 "other"에 뭉쳐 있다.** 스키마에 전용 `fish` 그룹을 추가할지는 앱
   연동 시점에 결정. 그 전까지는 `sourceClass`(목 이름)로 구분.
4. **genus-duplicates-for-review.json의 나머지 항목**(조류 위주)은 Pica pica류 오염 패턴이
   더 있을 수 있어 필요시 추가 검토 권장 — 이번엔 사용자가 지목한 3종만 확정 처리함.
5. **facetLimit은 여전히 임의 컷오프.** 특히 신규 추가한 소규모 어류 목(Synbranchiformes,
   Cyprinodontiformes 등)은 후보 자체가 몇 종 안 돼 사실상 전수에 가깝지만, Cypriniformes/
   Perciformes처럼 큰 목은 더 늘리면 추가로 잡힐 여지가 있음.

## 다음 단계

2단계(임베딩 계산 + 가중 k-center 대표종 선택) 시작 전:
- 국명 매핑 소스 확보
- 어류의 TaxonGroup 스키마 처리 방식 결정
