# DeepSeek 对话式资料检索实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 让每个有效提问先检索园所资料，再调用 DeepSeek 生成自然回答，同时原样保留资料来源、图片结果、访问限制和异常兜底。

**架构：** `app/api/ai-chat/route.ts` 继续负责 HTTP 请求校验、资料检索和响应结构；新增 `src/lib/deepseek.ts` 只负责构造 DeepSeek 请求、超时处理和响应解析。路由无条件将限制后的资料上下文和近期对话传给该模块，模型无结果时沿用本地资料库回复。

**技术栈：** Next.js 16 Route Handler、TypeScript、Vitest、DeepSeek Chat Completions API、Vercel CLI。

---

## 文件结构

- 新建：`robot-console/src/lib/deepseek.ts`，封装 DeepSeek 的服务端请求和安全的空结果返回。
- 修改：`robot-console/app/api/ai-chat/route.ts`，移除“多资料命中时直接返回”的分支，统一走模型并保留原响应格式。
- 新建：`robot-console/src/lib/deepseek.test.ts`，测试请求消息、空结果和请求异常。
- 新建：`robot-console/app/api/ai-chat/route.test.ts`，测试多资料命中、图片/来源保留及路由兜底。
- 新建：`robot-console/vitest.config.ts`，让测试使用与 Next.js 相同的 `@/` 路径别名。
- 修改：`robot-console/package.json` 与 `robot-console/package-lock.json`，添加 `test` 脚本及 Vitest 开发依赖。

### 任务 1：建立可单测的 DeepSeek 服务端模块

**文件：**
- 新建：`robot-console/src/lib/deepseek.test.ts`
- 新建：`robot-console/src/lib/deepseek.ts`

- [ ] **步骤 1：先写失败测试，固定模型调用协议**

```ts
import { describe, expect, it, vi } from "vitest";
import { generateDeepSeekReply } from "@/lib/deepseek";

describe("generateDeepSeekReply", () => {
  it("发送系统规则、受限资料上下文、近期历史和当前问题", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "园所回复" } }] }), { status: 200 }),
    );

    await expect(generateDeepSeekReply({
      apiKey: "test-key", apiUrl: "https://example.test/chat", systemPrompt: "仅依据资料回答",
      context: "[园所简介] 省二级幼儿园", history: [{ role: "user", content: "之前的问题" }],
      message: "园所是什么？", fetchImpl,
    })).resolves.toBe("园所回复");

    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/chat", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({
      model: "deepseek-chat",
      messages: expect.arrayContaining([
        { role: "system", content: "仅依据资料回答" },
        { role: "system", content: expect.stringContaining("园所简介") },
        { role: "user", content: "园所是什么？" },
      ]),
    });
  });

  it.each([new Response("", { status: 502 }), new Response(JSON.stringify({ choices: [] }), { status: 200 })])(
    "模型不可用或回复为空时返回 null", async (response) => {
      await expect(generateDeepSeekReply({
        apiKey: "test-key", apiUrl: "https://example.test/chat", systemPrompt: "规则", context: "资料",
        history: [], message: "问题", fetchImpl: vi.fn().mockResolvedValue(response),
      })).resolves.toBeNull();
    },
  );
});
```

- [ ] **步骤 2：运行测试，确认因模块不存在而失败**

运行：`npm test -- --run src/lib/deepseek.test.ts`

预期：失败，并显示无法解析 `@/lib/deepseek`。

- [ ] **步骤 3：实现最小模型调用模块**

```ts
import type { ConversationMessage } from "@/lib/types";

type GenerateDeepSeekReplyArgs = {
  apiKey?: string;
  apiUrl: string;
  systemPrompt: string;
  context: string;
  history: ConversationMessage[];
  message: string;
  fetchImpl?: typeof fetch;
};

export async function generateDeepSeekReply({ apiKey, apiUrl, systemPrompt, context, history, message, fetchImpl = fetch }: GenerateDeepSeekReplyArgs) {
  if (!apiKey) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8500);
  try {
    const response = await fetchImpl(apiUrl, {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "system", content: context ? `资料库检索内容如下：\n${context.slice(0, 8000)}` : "资料库检索内容：未找到直接相关资料。" },
          ...history.slice(-6), { role: "user", content: message },
        ], temperature: 0.2, max_tokens: 900,
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **步骤 4：运行模块测试，确认通过**

运行：`npm test -- --run src/lib/deepseek.test.ts`

预期：两个用例通过。

- [ ] **步骤 5：提交模型模块和测试**

```powershell
git add robot-console/src/lib/deepseek.ts robot-console/src/lib/deepseek.test.ts
git commit -m "feat: add DeepSeek chat helper"
```

### 任务 2：以测试先行方式将所有资料检索结果交给模型

**文件：**
- 新建：`robot-console/app/api/ai-chat/route.test.ts`
- 修改：`robot-console/app/api/ai-chat/route.ts`

- [ ] **步骤 1：先写失败路由测试，覆盖原先绕过模型的情况**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/search", () => ({ searchKnowledge: vi.fn(), wantsPhotoResults: vi.fn() }));
vi.mock("@/lib/deepseek", () => ({ generateDeepSeekReply: vi.fn() }));

import { POST } from "@/app/api/ai-chat/route";
import { generateDeepSeekReply } from "@/lib/deepseek";
import { searchKnowledge, wantsPhotoResults } from "@/lib/search";

const chunk = (title: string, content: string) => ({ document: { title }, content });

describe("POST /api/ai-chat", () => {
  beforeEach(() => vi.clearAllMocks());

  it("多条资料命中仍调用 DeepSeek 并返回资料来源", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [chunk("园所简介", "省二级"), chunk("课程", "体验学习")], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDeepSeekReply).mockResolvedValue("这是自然的园所介绍。");

    const response = await POST(new Request("http://localhost/api/ai-chat", { method: "POST", body: JSON.stringify({ message: "介绍园所" }) }));

    await expect(response.json()).resolves.toMatchObject({ reply: "这是自然的园所介绍。", provider: "deepseek", sources: ["园所简介", "课程"] });
    expect(generateDeepSeekReply).toHaveBeenCalledWith(expect.objectContaining({ context: expect.stringContaining("园所简介"), message: "介绍园所" }));
  });

  it("照片检索保留全部照片和来源，同时调用 DeepSeek", async () => {
    const photos = [{ id: "1", title: "阅读角", url: "/reading.jpg" }, { id: "2", title: "科学馆", url: "/science.jpg" }, { id: "3", title: "大厅", url: "/hall.jpg" }];
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [chunk("空间", "功能室")], photos } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(true);
    vi.mocked(generateDeepSeekReply).mockResolvedValue("下方有相关照片。");

    const response = await POST(new Request("http://localhost/api/ai-chat", { method: "POST", body: JSON.stringify({ message: "看看照片" }) }));

    await expect(response.json()).resolves.toMatchObject({ reply: "下方有相关照片。", provider: "deepseek", photos, sources: ["空间"] });
  });

  it("模型无可用回复时返回资料库兜底", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [chunk("园所简介", "省二级幼儿园")], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDeepSeekReply).mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/ai-chat", { method: "POST", body: JSON.stringify({ message: "园所级别" }) }));

    await expect(response.json()).resolves.toMatchObject({ provider: "fallback", sources: ["园所简介"] });
  });
});
```

- [ ] **步骤 2：运行路由测试，确认现有的多资料短路逻辑导致失败**

运行：`npm test -- --run app/api/ai-chat/route.test.ts`

预期：第一、第二个用例失败，因为 `generateDeepSeekReply` 尚未被路由调用。

- [ ] **步骤 3：仅替换路由中的模型分支**

在 `route.ts` 中导入 `generateDeepSeekReply`，删除 `if (search.chunks.length >= 2 || photos.length >= 3)` 的提前返回以及内联的 `AbortController`/`fetch` 代码。检索后始终执行下列调用并使用同一套 `photos`、`uniqueSources`：

```ts
const reply = await generateDeepSeekReply({
  apiKey: process.env.DEEPSEEK_API_KEY,
  apiUrl: process.env.DEEPSEEK_API_URL ?? "https://api.deepseek.com/chat/completions",
  systemPrompt,
  context,
  history: body.history ?? [],
  message,
});

return NextResponse.json({
  reply: reply ?? fallbackReply(context, sources),
  provider: reply ? "deepseek" : "fallback",
  photos,
  sources: uniqueSources,
});
```

- [ ] **步骤 4：运行路由测试，确认通过**

运行：`npm test -- --run app/api/ai-chat/route.test.ts`

预期：三个用例通过；现有 `FloatingChat` 和 `SciencePet` 无需修改，因为响应字段不变。

- [ ] **步骤 5：提交路由行为变更和测试**

```powershell
git add robot-console/app/api/ai-chat/route.ts robot-console/app/api/ai-chat/route.test.ts
git commit -m "feat: use DeepSeek for every knowledge query"
```

### 任务 3：配置测试执行与本地质量验证

**文件：**
- 新建：`robot-console/vitest.config.ts`
- 修改：`robot-console/package.json`
- 修改：`robot-console/package-lock.json`

- [ ] **步骤 1：先添加测试脚本与 Vitest 配置**

```ts
// vitest.config.ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", clearMocks: true },
});
```

将 `package.json` 的 scripts 增加 `"test": "vitest"`，随后运行：

```powershell
npm install --save-dev vitest
```

- [ ] **步骤 2：运行全部针对性测试**

运行：`npm test -- --run src/lib/deepseek.test.ts app/api/ai-chat/route.test.ts`

预期：全部通过。

- [ ] **步骤 3：执行项目质量检查**

运行：`npm run lint`、`npm run build`

预期：两个命令以退出码 0 结束。

- [ ] **步骤 4：提交测试工具配置**

```powershell
git add robot-console/package.json robot-console/package-lock.json robot-console/vitest.config.ts
git commit -m "test: add Vitest coverage for AI chat"
```

### 任务 4：更新 GitHub 和 Vercel 生产环境

**文件：**
- 不创建或提交任何密钥文件。

- [ ] **步骤 1：确认待发布提交与远端状态**

运行：`git status --short`、`git log --oneline origin/master..HEAD`

预期：仅包含本计划的文档和功能提交。

- [ ] **步骤 2：推送已验证提交到 GitHub**

运行：`git push origin master`

预期：远端 `master` 更新成功。

- [ ] **步骤 3：把用户提供的密钥写入 Vercel 的生产和预览环境**

在不打印密钥、不写入受版本控制文件的前提下，通过 Vercel CLI 向 `end-report` 项目的 `production` 和 `preview` 更新 `DEEPSEEK_API_KEY`。保留已存在的 `DEEPSEEK_API_URL`。

- [ ] **步骤 4：部署生产版本并记录 URL**

运行：`npx --yes vercel@latest --prod --project end-report --scope maomaobuhuijavas-projects`

预期：部署成功并返回生产访问 URL。

- [ ] **步骤 5：线上冒烟验证**

向生产 `/api/ai-chat` 发起一个能命中两条以上资料的请求，确认响应中的 `provider` 为 `deepseek`、`sources` 非空；再发起图片提问，确认 `photos` 未丢失。不得在终端输出密钥。

## 自检结果

- 规格覆盖：任务 1 和 2 实现“每次检索后调用模型”、资料约束和兜底；任务 2 保持来源、图片和两个既有前端入口的契约；任务 3 验证代码质量；任务 4 覆盖密钥配置、GitHub 推送和 Vercel 发布。
- 占位检查：文档不含 TBD、TODO 或未定义的操作；每个代码步骤给出了具体接口、测试和命令。
- 类型一致性：`ConversationMessage` 作为模型历史的唯一类型；模型函数统一返回 `string | null`，路由以此决定 `provider` 和兜底行为。
