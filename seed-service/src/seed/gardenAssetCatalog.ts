import type { TaxonId } from "../core/domain/types.js";
import { SEED_TAXA } from "./seedData.js";

export type GardenAssetCategory =
  | "tree"
  | "plant"
  | "insect"
  | "bird"
  | "animal";

export interface GardenAssetDefinition {
  assetKey: string;
  displayName: string;
  category: GardenAssetCategory;
  resourcePath: string;
  behaviourProfile: string;
  displayScale: number;
  minimumAltitude: number;
  taxonId?: TaxonId;
}

type RawAsset = Omit<GardenAssetDefinition, "assetKey" | "taxonId">;

const rawAssets: RawAsset[] = [
  ...staticAssets("tree", "static", [
    // 나무 GLB는 높이 1m로 정규화되어 있다. 성목의 실제 높이보다 조금 크게
    // 전시해 온실을 관통하더라도 숲의 크기감이 확실히 드러나게 한다.
    ["소나무", "Models/Trees/KoreanRedPine", 22],
    ["신갈나무", "Models/Trees/MongolianOak", 24],
    ["굴참나무", "Models/Trees/OrientalCorkOak", 24],
    ["옻나무", "Models/Trees/LacquerTree", 18],
    ["생강나무", "Models/Trees/JapaneseSpicebush", 7],
    ["산초나무", "Models/Trees/MasticLeafPricklyAsh", 6],
    ["국수나무", "Models/Trees/NoodleTree", 4],
    ["작살나무", "Models/Trees/JapaneseBeautyberry", 5],
    ["쥐똥나무", "Models/Trees/BorderPrivet", 6],
  ]),
  ...staticAssets("plant", "static", [
    ["개망초", "Models/Plants/Fleabane", 3.2],
    ["닭의장풀", "Models/Plants/Dayflower", 3],
    ["돼지풀", "Models/Plants/Ragweed", 3.6],
    ["미국자리공", "Models/Plants/Pokeweed", 5],
    ["사위질빵", "Models/Plants/ClematisVine", 3.5],
    ["산딸기", "Models/Plants/KoreanRaspberry", 4.5],
    ["서양민들레", "Models/Plants/Dandelion", 3.2],
    ["애기똥풀", "Models/Plants/Celandine", 3.2],
    ["진달래", "Models/Plants/KoreanAzalea", 4.5],
    ["청미래덩굴", "Models/Plants/Greenbrier", 4],
    ["초록싸리", "Models/Plants/GreenBushClover", 4],
    ["칡", "Models/Plants/Kudzu", 4.5],
    ["큰까치수염", "Models/Plants/GooseneckLoosestrife", 3.5],
    ["토끼풀", "Models/Plants/WhiteClover", 3],
    ["환삼덩굴", "Models/Plants/HopsVine", 4],
  ]),
  ...animatedAssets("insect", "butterfly-flight", [
    ["남방노랑나비", "Models/Butterflies/SouthernYellow"],
    ["네발나비", "Models/Butterflies/AsianComma"],
    ["배추흰나비", "Models/Butterflies/CabbageWhite"],
    ["애기세줄나비", "Models/Butterflies/Sailer"],
    ["푸른부전나비", "Models/Butterflies/BlueButterfly"],
    ["호랑나비", "Models/Butterflies/Swallowtail"],
  ], 7.5, 1.1),
  ...animatedAssets("insect", "flying-insect", [
    ["밀잠자리", "Models/FlyingInsects/Dragonfly"],
    ["양봉꿀벌", "Models/FlyingInsects/Honeybee"],
    ["장수말벌", "Models/FlyingInsects/Hornet"],
  ], 7.5, 1.1),
  ...animatedAssets("insect", "ground-insect", [
    ["가시노린재", "Models/GroundInsects/ShieldBug"],
    ["꼬마무당벌레", "Models/GroundInsects/TinyLadybug"],
    ["동양하루살이", "Models/GroundInsects/OrientalMayfly"],
    ["무당벌레", "Models/GroundInsects/Ladybug"],
    ["방아깨비", "Models/GroundInsects/LongGrasshopper"],
    ["섬서구메뚜기", "Models/GroundInsects/ChineseGrasshopper"],
    ["아시아실잠자리", "Models/GroundInsects/Damselfly"],
    ["칠성무당벌레", "Models/GroundInsects/SevenSpotLadybug"],
    ["톱다리개미허리노린재", "Models/GroundInsects/LeafFootBug"],
    ["팥중이", "Models/GroundInsects/RiceGrasshopper"],
    ["호리꽃등에", "Models/GroundInsects/Hoverfly"],
    ["흰부채하루살이", "Models/GroundInsects/WhiteMayfly"],
    ["장수풍뎅이", "Models/GroundInsects/RhinocerosBeetle"],
  ], 7, 0.32),
  ...animatedAssets("bird", "bird-flight", [
    ["괭이갈매기", "Models/Birds/BlackTailedGull"],
    ["딱새", "Models/Birds/DaurianRedstart"],
    ["멧비둘기", "Models/Birds/OrientalTurtleDove"],
    ["알락할미새", "Models/Birds/WhiteWagtail"],
    ["직박구리", "Models/Birds/BrownEaredBulbul"],
  ], 5.2, 6.8),
  ...animatedAssets("bird", "bird-flight", [
    ["큰부리까마귀", "Models/Birds/LargeBilledCrow"],
  ], 3.5, 6.8),
  ...animatedAssets("bird", "bird-perched", [
    ["까치", "Models/Birds/OrientalMagpie"],
    ["노랑턱멧새", "Models/Birds/YellowThroatedBunting"],
    ["대백로", "Models/Birds/GreatEgret"],
    ["박새", "Models/Birds/GreatTit"],
    ["붉은머리오목눈이", "Models/Birds/VinousThroatedParrotbill"],
    ["쇠박새", "Models/Birds/MarshTit"],
    ["청둥오리", "Models/Birds/Mallard"],
    ["흰뺨검둥오리", "Models/Birds/SpotBilledDuck"],
    ["왜가리", "Models/GreyHeronRigged"],
  ], 5.5, 0.32),
  ...animatedAssets("insect", "ground-insect", [
    ["사슴벌레", "Models/StagBeetle"],
  ], 7, 0.32),
];

export const SEED_GARDEN_ASSETS: GardenAssetDefinition[] = rawAssets.map((asset) => {
  const taxonNameAliases: Record<string, string> = {
    초록싸리: "조록싸리",
    꼬마무당벌레: "꼬마남생이무당벌레",
    흰부채하루살이: "부채하루살이",
  };
  const taxonName = taxonNameAliases[asset.displayName] ?? asset.displayName;
  const taxon = SEED_TAXA.find((candidate) => candidate.korName === taxonName);
  return {
    ...asset,
    assetKey: pathToAssetKey(asset.resourcePath),
    taxonId: taxon?.id,
  };
});

function staticAssets(
  category: "tree" | "plant",
  behaviourProfile: string,
  rows: Array<[string, string, number]>,
): RawAsset[] {
  return rows.map(([displayName, resourcePath, displayScale]) => ({
    displayName,
    category,
    resourcePath,
    behaviourProfile,
    displayScale,
    minimumAltitude: 0,
  }));
}

function animatedAssets(
  category: "insect" | "bird" | "animal",
  behaviourProfile: string,
  rows: Array<[string, string]>,
  displayScale: number,
  minimumAltitude: number,
): RawAsset[] {
  return rows.map(([displayName, resourcePath]) => ({
    displayName,
    category,
    resourcePath,
    behaviourProfile,
    displayScale,
    minimumAltitude,
  }));
}

function pathToAssetKey(resourcePath: string): string {
  const stem = resourcePath.split("/").at(-1) ?? resourcePath;
  return stem
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}
