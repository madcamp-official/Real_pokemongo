import { test } from "node:test";
import assert from "node:assert/strict";
import { getConfuserTaxonIds } from "./audioConfuserGroups.js";
import type { TaxonId } from "../../domain/types.js";

test("같은 그룹(오리류) 종은 서로를 혼동종으로 돌려준다", () => {
  const result = getConfuserTaxonIds("taxon-anas-platyrhynchos" as TaxonId);
  assert.deepEqual(result, ["taxon-anas-zonorhyncha"]);
});

test("자기 자신은 결과에 포함되지 않는다(3종 그룹, 까마귀류)", () => {
  const result = getConfuserTaxonIds("taxon-pica-serica" as TaxonId);
  assert.equal(result.includes("taxon-pica-serica" as TaxonId), false);
  assert.equal(result.length, 2);
  assert.ok(result.includes("taxon-corvus-macrorhynchos" as TaxonId));
  assert.ok(result.includes("taxon-cyanopica-cyanus" as TaxonId));
});

test("어느 그룹에도 없는 종은 빈 배열", () => {
  assert.deepEqual(getConfuserTaxonIds("taxon-passer-montanus" as TaxonId), []);
});
