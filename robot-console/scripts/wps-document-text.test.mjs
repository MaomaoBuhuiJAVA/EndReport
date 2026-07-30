import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { extractWordCompatibleText } from "./wps-document-text.mjs";

const reportPath = path.resolve("ziliao", "国科第二幼儿园省二级评估自评报告.wps");

test("extracts the full text from the provincial level-two WPS report", async () => {
  const text = await extractWordCompatibleText(reportPath);

  assert.match(text, /温州市龙湾区国科第二幼儿园省二级幼儿园评估自评报告/);
  assert.match(text, /一、园所概况/);
  assert.ok(text.length > 3000);
});
