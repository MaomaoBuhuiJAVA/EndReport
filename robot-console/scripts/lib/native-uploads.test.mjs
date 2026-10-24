import assert from "node:assert/strict";
import { test } from "node:test";
import { putPrivateMedia, generateQwenCover } from "./native-uploads.mjs";

test("batch uploads use private OSS and return website media URLs", async () => {
  let captured;
  const bytes = Buffer.from("video");
  const result = await putPrivateMedia("science-stories/STORY-1.mp4", bytes, {contentType: "video/mp4", client: {put: async (...args) => {captured = args;}}});
  assert.match(result.url, /^\/api\/media\/uploads\/science-stories\/[a-f0-9-]+-STORY-1\.mp4$/u);
  assert.equal(captured[1], bytes);
  assert.equal(captured[2].headers["x-oss-object-acl"], "private");
  assert.equal(captured[2].headers["x-oss-forbid-overwrite"], "true");
  await assert.rejects(putPrivateMedia("../backup.mp4", bytes, {contentType: "video/mp4", client: {put: async () => {throw new Error("must not store");}}}));
});

test("batch cover generation uses the speech key and the supplied Qwen API", async () => {
  const previous = process.env.QWEN_TTS_API_KEY; process.env.QWEN_TTS_API_KEY = "shared-test-key";
  let captured;
  try {
    const result = await generateQwenCover("wind poem", {fetchImpl: async (...args) => {captured = args; return Response.json({output: {choices: [{message: {content: [{image: "https://dashscope-result.oss-cn-beijing.aliyuncs.com/generated.png"}]}}]}});}});
    assert.equal(result, "https://dashscope-result.oss-cn-beijing.aliyuncs.com/generated.png");
    assert.equal(captured[0], "https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation");
    assert.equal(captured[1].headers.Authorization, "Bearer shared-test-key");
    assert.deepEqual(JSON.parse(captured[1].body).parameters.size, "1328*1328");
  } finally {if (previous === undefined) delete process.env.QWEN_TTS_API_KEY; else process.env.QWEN_TTS_API_KEY = previous;}
});

test("batch cover generation accepts the verified live regional image result", async () => {
  const previous = process.env.QWEN_TTS_API_KEY;
  process.env.QWEN_TTS_API_KEY = "shared-test-key";
  try {
    const url = await generateQwenCover("rain", {fetchImpl: async () => Response.json({output: {choices: [{message: {content: [{image: "https://dashscope-5859.oss-cn-wulanchabu-acdr-1.aliyuncs.com/result.png"}]}}]}})});
    assert.equal(url, "https://dashscope-5859.oss-cn-wulanchabu-acdr-1.aliyuncs.com/result.png");
  } finally {if (previous === undefined) delete process.env.QWEN_TTS_API_KEY; else process.env.QWEN_TTS_API_KEY = previous;}
});
