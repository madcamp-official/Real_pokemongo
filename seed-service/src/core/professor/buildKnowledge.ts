import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfusableSciNames } from "../identification/confusionPairs.js";
import { SEED_CONTENT, SEED_TAXA } from "../../seed/seedData.js";
import { assertKnowledgeDocument, buildKnowledgeDocument } from "./KnowledgeIndexer.js";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(sourceDir, "../../../data/professor-knowledge.json");
const document = buildKnowledgeDocument(SEED_TAXA, SEED_CONTENT, getConfusableSciNames);
assertKnowledgeDocument(
  document,
  SEED_TAXA.map((taxon) => taxon.id as string),
);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
console.log(
  `도감 박사 지식 ${document.records.length}문장을 ${outputPath}에 저장했습니다. (${document.content_hash})`,
);

