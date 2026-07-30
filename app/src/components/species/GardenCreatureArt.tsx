import { Image, type ImageSourcePropType } from 'react-native';
import { CreatureArt } from '@/components/species/CreatureArt';
import {
  GardenIllustratedArt,
  hasGardenIllustratedArt,
} from '@/components/species/GardenIllustratedArt';

interface Props {
  speciesId: string;
  size?: number;
}

/**
 * 종별 대표 일러스트(PNG) 제공자.
 *
 * 원래는 홈 가든 전용 회화풍 스프라이트였지만, 2D 홈 가든 제거 이후에도 도감·동정
 * 결과·지도 핀·인트로 등 앱 전반의 "종 대표 이미지"로 계속 쓰인다. 검수된 PNG가 없는
 * 종은 `species/CreatureArt`의 최소 벡터 세트로 폴백한다.
 */
export function GardenCreatureArt({ speciesId, size = 72 }: Props) {
  const normalizedSpeciesId = normalizeId(speciesId);
  if (hasGardenIllustratedArt(speciesId)) {
    return <GardenIllustratedArt speciesId={speciesId} size={size} />;
  }

  const source = GARDEN_ART[normalizedSpeciesId];
  if (!source) {
    return <CreatureArt speciesId={speciesId} size={size} />;
  }

  return (
    <Image
      source={source}
      resizeMode="contain"
      style={{ width: size, height: size }}
      accessibilityIgnoresInvertColors
    />
  );
}

/**
 * 도감처럼 정적인 종별 PNG가 필요한 화면에서 사용하는 원본 에셋 조회 함수.
 * assets/species에 저장한 그림을 그대로 표시하거나, tintColor를 적용해 종별
 * 실루엣을 만들 수 있다.
 */
export function getGardenCreatureImageSource(speciesId: string): ImageSourcePropType | undefined {
  return GARDEN_ART[normalizeId(speciesId)];
}

function normalizeId(speciesId: string): string {
  return speciesId.replace(/^(taxon-|sp_)/, '').replace(/_/g, '-');
}

const DANDELION = require('../../../assets/species/garden-v1/dandelion.png') as ImageSourcePropType;
const DAYFLOWER = require('../../../assets/species/garden-v1/dayflower.png') as ImageSourcePropType;
// ladybug/cabbage-white/honeybee의 v1 그림(garden-v1/ladybug.png 등)은 v6로 교체돼
// 더 이상 안 쓴다 — GARDEN_ART의 "곤충" 절 주석 참고.

// 홈 가든 v2: 사용자가 제공한 종별 일러스트. 원본의 마젠타 배경을 제거한
// 512px PNG만 이 레지스트리에 연결한다. 파일명은 DB taxon id의 접두사(taxon-)를
// 뺀 학명 slug와 맞춰, 새 종을 추가할 때 매칭 실수를 줄인다.
const ERIGERON_CANADENSIS = require('../../../assets/species/garden-v2/game/erigeron-canadensis.png') as ImageSourcePropType;
const OXALIS_CORNICULATA = require('../../../assets/species/garden-v2/game/oxalis-corniculata.png') as ImageSourcePropType;
const AMBROSIA_ARTEMISIIFOLIA = require('../../../assets/species/garden-v2/game/ambrosia-artemisiifolia.png') as ImageSourcePropType;
const SMILAX_CHINA = require('../../../assets/species/garden-v2/game/smilax-china.png') as ImageSourcePropType;
const PERSICARIA_THUNBERGII = require('../../../assets/species/garden-v2/game/persicaria-thunbergii.png') as ImageSourcePropType;
const LESPEDEZA_MAXIMOWICZII = require('../../../assets/species/garden-v2/game/lespedeza-maximowiczii.png') as ImageSourcePropType;
const BIDENS_FRONDOSA = require('../../../assets/species/garden-v2/game/bidens-frondosa.png') as ImageSourcePropType;
const LYSIMACHIA_CLETHROIDES = require('../../../assets/species/garden-v2/game/lysimachia-clethroides.png') as ImageSourcePropType;
const RUMEX_CRISPUS = require('../../../assets/species/garden-v2/game/rumex-crispus.png') as ImageSourcePropType;
const CLEMATIS_APIIFOLIA = require('../../../assets/species/garden-v2/game/clematis-apiifolia.png') as ImageSourcePropType;
const CAREX_SIDEROSTICTA = require('../../../assets/species/garden-v2/game/carex-siderosticta.png') as ImageSourcePropType;
const HYPSIPETES_AMAUROTIS = require('../../../assets/species/garden-v2/game/hypsipetes-amaurotis.png') as ImageSourcePropType;
const STREPTOPELIA_ORIENTALIS = require('../../../assets/species/garden-v2/game/streptopelia-orientalis.png') as ImageSourcePropType;
const ARDEA_CINEREA = require('../../../assets/species/garden-v2/game/ardea-cinerea.png') as ImageSourcePropType;
const CORVUS_MACRORHYNCHOS = require('../../../assets/species/garden-v2/game/corvus-macrorhynchos.png') as ImageSourcePropType;
const PICA_SERICA = require('../../../assets/species/garden-v2/game/pica-serica.png') as ImageSourcePropType;
const PHOENICURUS_AUROREUS = require('../../../assets/species/garden-v2/game/phoenicurus-auroreus.png') as ImageSourcePropType;
const LARUS_CRASSIROSTRIS = require('../../../assets/species/garden-v2/game/larus-crassirostris.png') as ImageSourcePropType;
const ANAS_POECILORHYNCHA_LEGACY = require('../../../assets/species/garden-v2/game/anas-poecilorhyncha-legacy.png') as ImageSourcePropType;
const PARUS_MAJOR_LEGACY = require('../../../assets/species/garden-v2/game/parus-major-legacy.png') as ImageSourcePropType;
const ARDEA_ALBA = require('../../../assets/species/garden-v2/game/ardea-alba.png') as ImageSourcePropType;
const SINOSUTHORA_WEBBIANA = require('../../../assets/species/garden-v2/game/sinosuthora-webbiana.png') as ImageSourcePropType;
const PARUS_CINEREUS = require('../../../assets/species/garden-v2/game/parus-cinereus.png') as ImageSourcePropType;
const POECILE_PALUSTRIS = require('../../../assets/species/garden-v2/game/poecile-palustris.png') as ImageSourcePropType;
const EMBERIZA_ELEGANS = require('../../../assets/species/garden-v2/game/emberiza-elegans.png') as ImageSourcePropType;
const ANAS_ZONORHYNCHA = require('../../../assets/species/garden-v2/game/anas-zonorhyncha.png') as ImageSourcePropType;
const MOTACILLA_ALBA = require('../../../assets/species/garden-v2/game/motacilla-alba.png') as ImageSourcePropType;
const ANAS_PLATYRHYNCHOS = require('../../../assets/species/garden-v2/game/anas-platyrhynchos.png') as ImageSourcePropType;
const PASSER_MONTANUS = require('../../../assets/species/garden-v2/game/passer-montanus.png') as ImageSourcePropType;
const FLY_AGARIC = require('../../../assets/species/garden-v2/game/amanita-muscaria.png') as ImageSourcePropType;
const RHABDOPHIS_TIGRINUS = require('../../../assets/species/garden-v2/game/rhabdophis-tigrinus.png') as ImageSourcePropType;

// 홈 가든 v3 나무·관목 일러스트. 굴참나무·작살나무·쥐똥나무는 기존 v2보다
// 이 버전을 우선해, 나무형 실루엣과 정원 배경의 톤을 맞춘다.
const TOXICODENDRON_VERNICIFLUUM = require('../../../assets/species/garden-v3/game/toxicodendron-vernicifluum.png') as ImageSourcePropType;
const LINDERA_OBTUSILOBA = require('../../../assets/species/garden-v3/game/lindera-obtusiloba.png') as ImageSourcePropType;
const QUERCUS_MONGOLICA = require('../../../assets/species/garden-v3/game/quercus-mongolica.png') as ImageSourcePropType;
const PINUS_DENSIFLORA = require('../../../assets/species/garden-v3/game/pinus-densiflora.png') as ImageSourcePropType;
const ZANTHOXYLUM_SCHINIFOLIUM = require('../../../assets/species/garden-v3/game/zanthoxylum-schinifolium.png') as ImageSourcePropType;
const NEILLIA_INCISA = require('../../../assets/species/garden-v3/game/neillia-incisa.png') as ImageSourcePropType;
const QUERCUS_VARIABILIS_V3 = require('../../../assets/species/garden-v3/game/quercus-variabilis.png') as ImageSourcePropType;
const CALLICARPA_JAPONICA_V3 = require('../../../assets/species/garden-v3/game/callicarpa-japonica.png') as ImageSourcePropType;
const LIGUSTRUM_OBTUSIFOLIUM_V3 = require('../../../assets/species/garden-v3/game/ligustrum-obtusifolium.png') as ImageSourcePropType;

// 홈 가든 v4 신규 곤충·식물 일러스트. 나무 종은 v4 원본이 있어도 아래에
// 다시 등록하지 않는다. 이미 검수된 v3 나무 스프라이트를 계속 사용한다.
const EUREMA_MANDARINA = require('../../../assets/species/garden-v4/game/eurema-mandarina.png') as ImageSourcePropType;
const OEDALEUS_INFERNALIS = require('../../../assets/species/garden-v4/game/oedaleus-infernalis.png') as ImageSourcePropType;
const EPHEMERA_ORIENTALIS = require('../../../assets/species/garden-v4/game/ephemera-orientalis.png') as ImageSourcePropType;
const ERIGERON_ANNUUS = require('../../../assets/species/garden-v4/game/erigeron-annuus.png') as ImageSourcePropType;
const COMMELINA_COMMUNIS = require('../../../assets/species/garden-v4/game/commelina-communis.png') as ImageSourcePropType;
const HUMULUS_SCANDENS = require('../../../assets/species/garden-v4/game/humulus-scandens.png') as ImageSourcePropType;
const PHYTOLACCA_AMERICANA = require('../../../assets/species/garden-v4/game/phytolacca-americana.png') as ImageSourcePropType;
const RHODODENDRON_MUCRONULATUM = require('../../../assets/species/garden-v4/game/rhododendron-mucronulatum.png') as ImageSourcePropType;
const TARAXACUM_OFFICINALE = require('../../../assets/species/garden-v4/game/taraxacum-officinale.png') as ImageSourcePropType;
const TRIFOLIUM_REPENS = require('../../../assets/species/garden-v4/game/trifolium-repens.png') as ImageSourcePropType;
const PUERARIA_MONTANA = require('../../../assets/species/garden-v4/game/pueraria-montana.png') as ImageSourcePropType;
const BOEHMERIA_JAPONICA = require('../../../assets/species/garden-v4/game/boehmeria-japonica.png') as ImageSourcePropType;
const CHELIDONIUM_MAJUS = require('../../../assets/species/garden-v4/game/chelidonium-majus.png') as ImageSourcePropType;
const RUBUS_CRATAEGIFOLIUS = require('../../../assets/species/garden-v4/game/rubus-crataegifolius.png') as ImageSourcePropType;
const VESPA_MANDARINIA = require('../../../assets/species/garden-v4/game/vespa-mandarinia.png') as ImageSourcePropType;

// 홈 가든 v5 곤충 일러스트.
const POLYGONIA_C_AUREUM = require('../../../assets/species/garden-v5/game/polygonia-c-aureum.png') as ImageSourcePropType;
const BOTHROGONIA_FERRUGINEA = require('../../../assets/species/garden-v5/game/bothrogonia-ferruginea.png') as ImageSourcePropType;
const BAETIS_FUSCATUS = require('../../../assets/species/garden-v5/game/baetis-fuscatus.png') as ImageSourcePropType;
const ORTHETRUM_ALBISTYLUM = require('../../../assets/species/garden-v5/game/orthetrum-albistylum.png') as ImageSourcePropType;
const PROPYLEA_JAPONICA = require('../../../assets/species/garden-v5/game/propylea-japonica.png') as ImageSourcePropType;
const PAPILIO_XUTHUS = require('../../../assets/species/garden-v5/game/papilio-xuthus.png') as ImageSourcePropType;
const EPISYRPHUS_BALTEATUS = require('../../../assets/species/garden-v5/game/episyrphus-balteatus.png') as ImageSourcePropType;
const PIERIS_MELETE = require('../../../assets/species/garden-v5/game/pieris-melete.png') as ImageSourcePropType;
const EPEORUS_PELLUCIDUS = require('../../../assets/species/garden-v5/game/epeorus-pellucidus.png') as ImageSourcePropType;
const ISCHNURA_ASIATICA = require('../../../assets/species/garden-v5/game/ischnura-asiatica.png') as ImageSourcePropType;
const ECDYONURUS_LEVIS = require('../../../assets/species/garden-v5/game/ecdyonurus-levis.png') as ImageSourcePropType;
const NEPTIS_SAPPHO = require('../../../assets/species/garden-v5/game/neptis-sappho.png') as ImageSourcePropType;
const RIPTORTUS_PEDESTRIS = require('../../../assets/species/garden-v5/game/riptortus-pedestris.png') as ImageSourcePropType;
const CELESTRINA_ARGIOLUS = require('../../../assets/species/garden-v5/game/celastrina-argiolus.png') as ImageSourcePropType;
const ELKALYCE_ARGIADES = require('../../../assets/species/garden-v5/game/elkalyce-argiades.png') as ImageSourcePropType;
const CHEUMATOPSYCHE_BREVILINEATA = require('../../../assets/species/garden-v5/game/cheumatopsyche-brevilineata.png') as ImageSourcePropType;
const SPHAEROPHORIA_SCRIPTA = require('../../../assets/species/garden-v5/game/sphaerophoria-scripta.png') as ImageSourcePropType;
const PACHYGRONTHA_ANTENNATA = require('../../../assets/species/garden-v5/game/pachygrontha-antennata.png') as ImageSourcePropType;
const CLETUS_SCHMIDTI = require('../../../assets/species/garden-v5/game/cletus-schmidti.png') as ImageSourcePropType;
const ACRIDA_CINEREA = require('../../../assets/species/garden-v5/game/acrida-cinerea.png') as ImageSourcePropType;
const ATRACTOMORPHA_LATA = require('../../../assets/species/garden-v5/game/atractomorpha-lata.png') as ImageSourcePropType;
const CARBULA_PUTONI = require('../../../assets/species/garden-v5/game/carbula-putoni.png') as ImageSourcePropType;

// 홈 가든 v6: v5에서 공용 아트로 표시했던 네 종의 전용 일러스트.
const APIS_MELLIFERA = require('../../../assets/species/garden-v6/game/apis-mellifera.png') as ImageSourcePropType;
const PIERIS_RAPAE = require('../../../assets/species/garden-v6/game/pieris-rapae.png') as ImageSourcePropType;
const COCCINELLA_SEPTEMPUNCTATA = require('../../../assets/species/garden-v6/game/coccinella-septempunctata.png') as ImageSourcePropType;
const HARMONIA_AXYRIDIS = require('../../../assets/species/garden-v6/game/harmonia-axyridis.png') as ImageSourcePropType;

const GARDEN_ART: Record<string, ImageSourcePropType> = {
  // v2 식물
  'erigeron-canadensis': ERIGERON_CANADENSIS,
  'quercus-variabilis': QUERCUS_VARIABILIS_V3,
  'oxalis-corniculata': OXALIS_CORNICULATA,
  'ambrosia-artemisiifolia': AMBROSIA_ARTEMISIIFOLIA,
  'smilax-china': SMILAX_CHINA,
  'persicaria-thunbergii': PERSICARIA_THUNBERGII,
  'lespedeza-maximowiczii': LESPEDEZA_MAXIMOWICZII,
  'bidens-frondosa': BIDENS_FRONDOSA,
  'lysimachia-clethroides': LYSIMACHIA_CLETHROIDES,
  'rumex-crispus': RUMEX_CRISPUS,
  'callicarpa-japonica': CALLICARPA_JAPONICA_V3,
  'ligustrum-obtusifolium': LIGUSTRUM_OBTUSIFOLIUM_V3,
  'clematis-apiifolia': CLEMATIS_APIIFOLIA,
  'carex-siderosticta': CAREX_SIDEROSTICTA,

  // v3 나무·관목
  'toxicodendron-vernicifluum': TOXICODENDRON_VERNICIFLUUM,
  'lindera-obtusiloba': LINDERA_OBTUSILOBA,
  'quercus-mongolica': QUERCUS_MONGOLICA,
  'pinus-densiflora': PINUS_DENSIFLORA,
  'zanthoxylum-schinifolium': ZANTHOXYLUM_SCHINIFOLIUM,
  'neillia-incisa': NEILLIA_INCISA,

  // v4 신규 곤충
  'eurema-mandarina': EUREMA_MANDARINA,
  'oedaleus-infernalis': OEDALEUS_INFERNALIS,
  'ephemera-orientalis': EPHEMERA_ORIENTALIS,

  // v4 신규 식물
  'erigeron-annuus': ERIGERON_ANNUUS,
  'commelina-communis': COMMELINA_COMMUNIS,
  'humulus-scandens': HUMULUS_SCANDENS,
  'phytolacca-americana': PHYTOLACCA_AMERICANA,
  'rhododendron-mucronulatum': RHODODENDRON_MUCRONULATUM,
  'taraxacum-officinale': TARAXACUM_OFFICINALE,
  'trifolium-repens': TRIFOLIUM_REPENS,
  'pueraria-montana': PUERARIA_MONTANA,
  'boehmeria-japonica': BOEHMERIA_JAPONICA,
  'chelidonium-majus': CHELIDONIUM_MAJUS,
  'rubus-crataegifolius': RUBUS_CRATAEGIFOLIUS,

  // v5 곤충
  'polygonia-c-aureum': POLYGONIA_C_AUREUM,
  'bothrogonia-ferruginea': BOTHROGONIA_FERRUGINEA,
  'baetis-fuscatus': BAETIS_FUSCATUS,
  'orthetrum-albistylum': ORTHETRUM_ALBISTYLUM,
  'propylea-japonica': PROPYLEA_JAPONICA,
  'papilio-xuthus': PAPILIO_XUTHUS,
  'episyrphus-balteatus': EPISYRPHUS_BALTEATUS,
  'pieris-melete': PIERIS_MELETE,
  'epeorus-pellucidus': EPEORUS_PELLUCIDUS,
  'ischnura-asiatica': ISCHNURA_ASIATICA,
  'ecdyonurus-levis': ECDYONURUS_LEVIS,
  // v5에는 두점하루살이만 제공되어, 네점하루살이도 같은 하루살이 아트로 표시한다.
  'ecdyonurus-kibunensis': ECDYONURUS_LEVIS,
  'neptis-sappho': NEPTIS_SAPPHO,
  'riptortus-pedestris': RIPTORTUS_PEDESTRIS,
  'celastrina-argiolus': CELESTRINA_ARGIOLUS,
  'elkalyce-argiades': ELKALYCE_ARGIADES,
  'cheumatopsyche-brevilineata': CHEUMATOPSYCHE_BREVILINEATA,
  'sphaerophoria-scripta': SPHAEROPHORIA_SCRIPTA,
  'pachygrontha-antennata': PACHYGRONTHA_ANTENNATA,
  'cletus-schmidti': CLETUS_SCHMIDTI,
  'acrida-cinerea': ACRIDA_CINEREA,
  'atractomorpha-lata': ATRACTOMORPHA_LATA,
  'carbula-putoni': CARBULA_PUTONI,

  // v2 조류 — 새 일러스트가 준비된 종은 v1보다 이 버전을 우선한다.
  'hypsipetes-amaurotis': HYPSIPETES_AMAUROTIS,
  'streptopelia-orientalis': STREPTOPELIA_ORIENTALIS,
  'ardea-cinerea': ARDEA_CINEREA,
  'corvus-macrorhynchos': CORVUS_MACRORHYNCHOS,
  'pica-serica': PICA_SERICA,
  'phoenicurus-auroreus': PHOENICURUS_AUROREUS,
  'larus-crassirostris': LARUS_CRASSIROSTRIS,
  // 과거/다른 분류 체계에서 내려오는 ID도 같은 방식으로 표시한다.
  'anas-poecilorhyncha': ANAS_POECILORHYNCHA_LEGACY,
  'parus-major': PARUS_MAJOR_LEGACY,
  'ardea-alba': ARDEA_ALBA,
  'sinosuthora-webbiana': SINOSUTHORA_WEBBIANA,
  'parus-cinereus': PARUS_CINEREUS,
  'poecile-palustris': POECILE_PALUSTRIS,
  'emberiza-elegans': EMBERIZA_ELEGANS,
  'anas-zonorhyncha': ANAS_ZONORHYNCHA,
  'motacilla-alba': MOTACILLA_ALBA,
  'anas-platyrhynchos': ANAS_PLATYRHYNCHOS,
  'passer-montanus': PASSER_MONTANUS,
  // 별도 PNG가 없는 두 조류는 가장 가까운 기존 조류 일러스트를 사용한다.
  // generic 물음표보다 실제 생물 윤곽을 유지하기 위한 안전 폴백이다.
  'cyanopica-cyanus': PICA_SERICA,
  'phalacrocorax-carbo': LARUS_CRASSIROSTRIS,

  // v2 기타 생물
  'fly-agaric': FLY_AGARIC,
  'lacquer-tree': TOXICODENDRON_VERNICIFLUUM,
  'rhabdophis-tigrinus': RHABDOPHIS_TIGRINUS,

  // v1 식물(교체 그림 없음)
  dandelion: DANDELION,
  dayflower: DAYFLOWER,

  // 곤충 — 대표 네 종은 이 컴포넌트에서 GardenIllustratedArt(벡터)를 우선하지만,
  // 도감 그리드(DexSpeciesArt)는 이 PNG 레지스트리를 직접 조회해 원본과 실루엣을 표시한다.
  'cabbage-white': PIERIS_RAPAE,
  honeybee: APIS_MELLIFERA,
  ladybug: HARMONIA_AXYRIDIS,
  'harmonia-axyridis': HARMONIA_AXYRIDIS,
  'coccinella-septempunctata': COCCINELLA_SEPTEMPUNCTATA,
  'vespa-mandarinia': VESPA_MANDARINIA,

  // 초기 mock ID 호환 — 같은 종을 가리키므로 위와 동일한 v6 그림을 쓴다.
  butterfly: PIERIS_RAPAE,
  bee: APIS_MELLIFERA,
};
