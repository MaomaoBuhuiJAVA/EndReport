import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const scriptPath = path.resolve("scripts/seed-science-on-build.mjs");

test("skips the science database import unless the production flag is enabled", () => {
  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    env: { ...process.env, SEED_SCIENCE_ON_BUILD: "" },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Science database import skipped/);
});
