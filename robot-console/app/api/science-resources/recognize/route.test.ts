import { afterEach, beforeEach, expect, it, vi } from "vitest";
import sharp from "sharp";
import { POST } from "./route";

const fields = {title: "风的旅行", ageLabel: "中班", topic: "风和空气", author: "", poemText: "风儿轻轻吹，叶子跳起舞。", description: "观察风的作用"};
const upstream = vi.fn();
let sequence = 0;
function request(file: File) {
  const form = new FormData(); form.set("file", file);
  return new Request("http://localhost/api/science-resources/recognize", {method: "POST", body: form, headers: {"x-forwarded-for": `198.51.100.${++sequence}`}});
}
beforeEach(() => {
  upstream.mockReset();
  upstream.mockResolvedValue(Response.json({choices: [{message: {content: JSON.stringify(fields)}}]}));
  vi.stubGlobal("fetch", upstream);
  vi.stubEnv("QWEN_TTS_API_KEY", "shared-key"); vi.stubEnv("DIFY_API_KEY", "");
  vi.stubEnv("QWEN_API_BASE_URL", "https://maas.qianwenaiapi.com/api/v1");
  vi.stubEnv("QWEN_TEXT_MODEL", "qwen3.5-plus"); vi.stubEnv("QWEN_VISION_MODEL", "qwen3-vl-flash");
});
afterEach(() => {vi.unstubAllEnvs(); vi.unstubAllGlobals();});

it("extracts the uploaded poem and sends its actual text directly to Qwen", async () => {
  const response = await POST(request(new File([fields.poemText], "风的旅行.txt", {type: "text/plain"})));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({fields});
  expect(upstream).toHaveBeenCalledTimes(1);
  expect(upstream.mock.calls[0][0]).toBe("https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions");
  const options = upstream.mock.calls[0][1];
  expect(options.headers.Authorization).toBe("Bearer shared-key");
  const sent = JSON.parse(options.body);
  expect(sent).toMatchObject({model: "qwen3.5-plus", response_format: {type: "json_object"}});
  expect(JSON.stringify(sent.messages)).toContain(fields.poemText);
});

it("uses direct vision on the uploaded image without a workflow upload roundtrip", async () => {
  const png = await sharp({create: {width: 8, height: 8, channels: 3, background: "white"}}).png().toBuffer();
  expect((await POST(request(new File([png], "poem.png", {type: "image/png"})))).status).toBe(200);
  const sent = JSON.parse(upstream.mock.calls[0][1].body);
  expect(sent.model).toBe("qwen3-vl-flash");
  expect(sent.messages[1].content).toContainEqual({type: "image_url", image_url: {url: `data:image/png;base64,${png.toString("base64")}`}});
  expect(upstream).toHaveBeenCalledTimes(1);
});

it("preserves the recognition upload limit above the separate chat limit", async () => {
  const file = new File(["风".repeat(1_500_000)], "large-poem.txt", {type: "text/plain"});
  expect(file.size).toBeGreaterThan(4 * 1024 * 1024);
  expect((await POST(request(file))).status).toBe(200);
  const sent = JSON.parse(upstream.mock.calls[0][1].body);
  expect(JSON.stringify(sent).length).toBeLessThan(55_000);
});

it("rejects malformed and oversized attachments before contacting Qwen", async () => {
  expect((await POST(request(new File(["not a png"], "poem.png", {type: "image/png"})))).status).toBe(400);
  expect((await POST(request(new File([new Uint8Array(20 * 1024 * 1024 + 1)], "poem.txt", {type: "text/plain"})))).status).toBe(400);
  expect(upstream).not.toHaveBeenCalled();
});

it("returns an honest retryable error for invalid model output", async () => {
  upstream.mockResolvedValue(Response.json({choices: [{message: {content: "unable to extract"}}]}));
  const response = await POST(request(new File([fields.poemText], "poem.txt", {type: "text/plain"})));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({error: expect.any(String)});
});
