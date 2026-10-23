import { afterEach, expect, it, vi } from "vitest";
import { generateTeachingImage, imageSize } from "./images";
afterEach(()=>vi.unstubAllEnvs());
it("uses the same key as speech and the supplied image API without a separate image credential", async () => {
  vi.stubEnv("QWEN_TTS_API_KEY", "shared-speech-key");
  vi.stubEnv("AI_IMAGE_API_KEY", "obsolete-image-key");
  const provider = vi.fn<typeof fetch>(async () => Response.json({output: {choices: [{message: {content: [{image: "https://dashscope-result.oss-cn-beijing.aliyuncs.com/generated.png"}]}}]}}));
  const result = await generateTeachingImage({prompt: "uploaded poem about wind", ratio: "1:1", fetchImpl: provider});
  expect(result.model).toBe("qwen-image");
  expect(provider.mock.calls[0]?.[0]).toBe("https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation");
  const options = provider.mock.calls[0]?.[1] as RequestInit;
  expect(options.headers).toMatchObject({Authorization: "Bearer shared-speech-key"});
  expect(JSON.parse(String(options.body))).toMatchObject({model: "qwen-image", parameters: {size: "1328*1328", n: 1, watermark: false, prompt_extend: true}});
});
it("uses exact aspect ratios and delivers one real provider image",async()=>{
  vi.stubEnv("QWEN_TTS_API_KEY", "test-key");
  expect(imageSize("3:4")).toBe("1140*1472");
  expect(imageSize("16:9")).toBe("1664*928");
  let sent:Record<string,unknown>={};
  const image=await generateTeachingImage({prompt:"A small water droplet from the supplied poem",ratio:"3:4",fetchImpl:async(_url,init)=>{
    sent=JSON.parse(String(init?.body));
    return Response.json({output:{choices:[{message:{content:[{image:"https://dashscope-result.oss-cn-beijing.aliyuncs.com/cover.png"}]}}]}});
  }});
  expect(image.url).toBe("https://dashscope-result.oss-cn-beijing.aliyuncs.com/cover.png");
  expect(sent.parameters).toMatchObject({n:1,size:"1140*1472"});
  expect(JSON.stringify(sent)).toContain("supplied poem");
});
it("does not turn an empty or unsafe image response into success",async()=>{
  vi.stubEnv("QWEN_TTS_API_KEY", "test-key");
  await expect(generateTeachingImage({prompt:"poem",ratio:"1:1",fetchImpl:async()=>Response.json({output:{choices:[]}})})).rejects.toThrow();
  await expect(generateTeachingImage({prompt:"poem",ratio:"1:1",fetchImpl:async()=>Response.json({output:{choices:[{message:{content:[{image:"http://127.0.0.1/private"}]}}]}})})).rejects.toThrow();
});

it("accepts the accelerated result host returned by the live Qwen image service", async () => {
  vi.stubEnv("QWEN_TTS_API_KEY", "test-key");
  const image = await generateTeachingImage({prompt: "magnet", ratio: "1:1", fetchImpl: async () => Response.json({output: {choices: [{message: {content: [{image: "https://dashscope-0484.oss-accelerate.aliyuncs.com/result.png"}]}}]}})});
  expect(image.url).toBe("https://dashscope-0484.oss-accelerate.aliyuncs.com/result.png");
});

it("accepts the regional result host returned by the supplied live Qwen image API", async () => {
  vi.stubEnv("QWEN_TTS_API_KEY", "test-key");
  const image = await generateTeachingImage({prompt: "rain and clouds", ratio: "3:4", fetchImpl: async () => Response.json({output: {choices: [{message: {content: [{image: "https://dashscope-5859.oss-cn-wulanchabu-acdr-1.aliyuncs.com/result.png"}]}}]}})});
  expect(image.url).toBe("https://dashscope-5859.oss-cn-wulanchabu-acdr-1.aliyuncs.com/result.png");
});
