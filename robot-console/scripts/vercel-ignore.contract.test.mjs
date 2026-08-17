import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const ignoreFile = path.resolve(scriptDirectory, "..", ".vercelignore");

test("does not exclude the application directory from repository-root deployments", () => {
  const rules = fs
    .readFileSync(ignoreFile, "utf8")
    .split(/\r?\n/u)
    .map((rule) => rule.trim())
    .filter(Boolean);

  assert.equal(rules.includes("robot-console"), false);
  assert.equal(rules.includes("robot-console/robot-console"), true);
});
