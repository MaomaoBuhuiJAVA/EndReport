import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(resolve("src/components/StudentWorks.tsx"), "utf8");

test("student works includes an independent growth archive view", () => {
  assert.match(source, /tab === "archive"/);
  assert.match(source, /api\/student-works\/archive/);
  assert.match(source, /成长档案/);
});
