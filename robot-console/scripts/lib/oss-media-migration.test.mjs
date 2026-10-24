import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  buildMediaPlan,
  copyAndVerifyMedia,
  replaceMediaReferences,
} from "./oss-media-migration.mjs";

const storyUrl = "https://github.com/MaomaoBuhuiJAVA/EndReport/releases/download/science-media-v1/STORY-a.mp4";

test("the plan includes saved GitHub release assets only when explicitly requested", () => {
  const plan = buildMediaPlan({
    blobs: [{ url: storyUrl, size: 3 }],
    catalog: [{ videoUrl: storyUrl, resources: [{ externalUrl: "https://p1.qr105.cn/example" }] }],
    includeGithub: true,
  });
  assert.equal(plan.length, 1);
  assert.equal(plan.find((entry) => entry.sourceUrl === storyUrl).publicCatalog, true);
  assert.equal(plan.find((entry) => entry.sourceUrl === storyUrl).key, "migrated/github/science-media-v1/STORY-a.mp4");
  assert.equal(buildMediaPlan({ blobs: [{ url: storyUrl }], catalog: [{ videoUrl: storyUrl }] }).length, 0);
});

test("unknown hosts and unsafe object paths never become migration sources", () => {
  assert.equal(buildMediaPlan({ blobs: [{ url: "https://github.com.evil.test/MaomaoBuhuiJAVA/EndReport/releases/download/science-media-v1/file.png" }], catalog: [] }).length, 0);
  assert.throws(() => buildMediaPlan({ blobs: [{ url: "https://github.com/MaomaoBuhuiJAVA/EndReport/releases/download/science-media-v1/files/%2e%2e%2fsecret.png" }], catalog: [], includeGithub: true }), /unsafe/i);
});

test("replacement changes exact nested media references and preserves unrelated text", () => {
  const legacyUrl = "https://legacy-media.example.org/science-story-covers/STORY-a.webp";
  const source = { coverUrl: legacyUrl, body: `See ${legacyUrl}`, resources: [{ externalUrl: storyUrl }], count: 2 };
  const result = replaceMediaReferences(source, new Map([[legacyUrl, "/api/media/migrated/legacy-store/science-story-covers/STORY-a.webp"]]));
  assert.equal(result.coverUrl, "/api/media/migrated/legacy-store/science-story-covers/STORY-a.webp");
  assert.equal(result.body, `See ${legacyUrl}`);
  assert.equal(result.resources[0].externalUrl, storyUrl);
  assert.equal(source.coverUrl, legacyUrl);
});

function memoryTransport(source, initialTarget = null) {
  let target = initialTarget;
  let writes = 0;
  return {
    readSource: async () => ({ bytes: source, contentType: "image/png" }),
    readTarget: async () => target,
    writeTarget: async (_entry, bytes) => { writes++; target = Buffer.from(bytes); },
    get writes() { return writes; },
  };
}

test("a copy is marked verified only after reading back identical bytes", async () => {
  const transport = memoryTransport(Buffer.from("real source bytes"));
  const result = await copyAndVerifyMedia({ key: "migrated/example.png" }, transport);
  assert.equal(result.bytes, 17);
  assert.equal(result.sha256, createHash("sha256").update("real source bytes").digest("hex"));
  assert.equal(result.verified, true);
  assert.equal(transport.writes, 1);
});

test("resuming an identical object performs no write", async () => {
  const transport = memoryTransport(Buffer.from("same"), Buffer.from("same"));
  const result = await copyAndVerifyMedia({ key: "migrated/example.png" }, transport);
  assert.equal(result.reused, true);
  assert.equal(transport.writes, 0);
});

test("a conflicting destination is preserved and aborts migration", async () => {
  const transport = memoryTransport(Buffer.from("source"), Buffer.from("existing other bytes"));
  await assert.rejects(copyAndVerifyMedia({ key: "migrated/example.png" }, transport), /conflict/i);
  assert.equal(transport.writes, 0);
});

test("a damaged readback cannot be recorded as a successful migration", async () => {
  let reads = 0;
  await assert.rejects(copyAndVerifyMedia({ key: "migrated/example.png" }, {
    readSource: async () => ({ bytes: Buffer.from("source"), contentType: "image/png" }),
    readTarget: async () => ++reads === 1 ? null : Buffer.from("damage"),
    writeTarget: async () => {},
  }), /verification/i);
});
