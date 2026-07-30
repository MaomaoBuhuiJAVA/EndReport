import assert from "node:assert/strict";
import test from "node:test";

import { legacyReportTitles } from "./qualification-report-migration.mjs";

test("replaces only the exact legacy provincial report title", () => {
  assert.deepEqual(legacyReportTitles, ["省二终极"]);
});
