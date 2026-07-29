# 智能体实验室详情直达 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 让智能体回复中的科小贝实验室命中项可直接打开实验室页面中的对应详情弹窗。

**Architecture:** 新增一个浏览器和服务端都可使用的纯函数模块，负责从已检索的实验室 chunk 生成可信链接，并从 URL 查询参数找回对应实验摘要。AI 接口将该链接列表附加到原有响应；两个聊天组件只展示它；实验室组件复用既有 openDetail 请求流程自动打开弹窗。

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Tailwind CSS, global CSS.

---

### Task 1: 建立可验证的实验室导航模型

**Files:**
- Create: robot-console/src/lib/science-lab-links.ts
- Create: robot-console/src/lib/science-lab-links.test.ts

- [ ] **Step 1: 写入失败的纯函数测试**

~~~ts
import { describe, expect, it } from "vitest";
import {
  buildScienceLabLinks,
  findScienceSummaryFromSearch,
} from "./science-lab-links";

const summary = {
  id: "exp-1",
  baseId: "base-1",
  semester: "小班上册",
  category: "科学诗" as const,
  title: "水会跳舞",
  ageLabel: "3-4岁",
  topic: "水的张力",
  author: "国科二幼",
  excerpt: "观察水滴。",
  tags: ["水"],
  resourceTypes: [],
  resources: [],
};

describe("science lab links", () => {
  it("only returns the first three unique packaged science items in rank order", () => {
    expect(buildScienceLabLinks([
      { id: "science-exp-1", documentId: "exp-1", title: "水会跳舞" },
      { id: "doc-99", documentId: "99", title: "园所概览" },
      { id: "science-exp-1", documentId: "exp-1", title: "水会跳舞" },
      { id: "science-exp-2", documentId: "exp-2", title: "空气在哪里" },
      { id: "science-exp-3", documentId: "exp-3", title: "影子朋友" },
      { id: "science-exp-4", documentId: "exp-4", title: "磁铁游戏" },
    ])).toEqual([
      { id: "exp-1", title: "水会跳舞", href: "/lab?item=exp-1" },
      { id: "exp-2", title: "空气在哪里", href: "/lab?item=exp-2" },
      { id: "exp-3", title: "影子朋友", href: "/lab?item=exp-3" },
    ]);
  });

  it("encodes links and resolves only known summaries from the item parameter", () => {
    expect(buildScienceLabLinks([
      { id: "science-a/b", documentId: "a/b", title: "编码实验" },
    ])).toEqual([{ id: "a/b", title: "编码实验", href: "/lab?item=a%2Fb" }]);
    expect(findScienceSummaryFromSearch("?item=exp-1", [summary])).toBe(summary);
    expect(findScienceSummaryFromSearch("?item=missing", [summary])).toBeNull();
    expect(findScienceSummaryFromSearch("", [summary])).toBeNull();
  });
});
~~~

- [ ] **Step 2: 运行测试，确认因模块尚不存在而失败**

Run: npm test -- src/lib/science-lab-links.test.ts

Expected: FAIL with module-not-found for ./science-lab-links.

- [ ] **Step 3: 实现无副作用的链接与查询参数解析器**

~~~ts
import type { ScienceKnowledgeSummary } from "@/lib/science-types";

export type ScienceLabLink = {
  id: string;
  title: string;
  href: string;
};

type SearchChunk = {
  id: string;
  documentId?: string | null;
  title: string;
};

export function buildScienceLabLinks(chunks: SearchChunk[]): ScienceLabLink[] {
  const seen = new Set<string>();
  const links: ScienceLabLink[] = [];

  for (const chunk of chunks) {
    if (
      !chunk.documentId ||
      !chunk.id.startsWith("science-") ||
      chunk.id !== "science-" + chunk.documentId ||
      seen.has(chunk.documentId)
    ) {
      continue;
    }

    seen.add(chunk.documentId);
    links.push({
      id: chunk.documentId,
      title: chunk.title,
      href: "/lab?item=" + encodeURIComponent(chunk.documentId),
    });
    if (links.length === 3) break;
  }

  return links;
}

export function findScienceSummaryFromSearch(
  search: string,
  summaries: ScienceKnowledgeSummary[],
): ScienceKnowledgeSummary | null {
  const itemId = new URLSearchParams(search).get("item")?.trim();
  return itemId ? summaries.find((item) => item.id === itemId) ?? null : null;
}
~~~

- [ ] **Step 4: 重新运行该测试并确认通过**

Run: npm test -- src/lib/science-lab-links.test.ts

Expected: PASS with 2 passing tests.

- [ ] **Step 5: 提交纯函数和测试**

~~~bash
git add robot-console/src/lib/science-lab-links.ts robot-console/src/lib/science-lab-links.test.ts
git commit -m "feat: add science lab link helpers"
~~~

### Task 2: 为 AI 聊天响应附加可信实验链接

**Files:**
- Modify: robot-console/app/api/ai-chat/route.ts
- Modify: robot-console/app/api/ai-chat/route.test.ts

- [ ] **Step 1: 在 API 路由测试中增加实验室链接断言**

在现有 mock 中加入以下实验室 chunk，并断言响应包含链接：

~~~ts
vi.mocked(searchKnowledge).mockResolvedValue({
  chunks: [{
    id: "science-exp-1",
    documentId: "exp-1",
    title: "水会跳舞",
    document: { title: "科小贝实验室：水会跳舞" },
    content: "水滴实验",
  }],
  photos: [],
} as never);
vi.mocked(wantsPhotoResults).mockReturnValue(false);
vi.mocked(generateDeepSeekReply).mockResolvedValue("可以试试这个实验。");

const response = await POST(new Request("http://localhost/api/ai-chat", {
  method: "POST",
  body: JSON.stringify({ message: "推荐一个水实验" }),
}));

await expect(response.json()).resolves.toMatchObject({
  labLinks: [{ id: "exp-1", title: "水会跳舞", href: "/lab?item=exp-1" }],
});
~~~

同时在现有非实验室用例的响应断言中加入 labLinks: []。

- [ ] **Step 2: 运行路由测试，确认新断言失败**

Run: npm test -- app/api/ai-chat/route.test.ts

Expected: FAIL because the API response does not yet contain labLinks.

- [ ] **Step 3: 在路由中生成并返回链接**

~~~ts
import { buildScienceLabLinks } from "@/lib/science-lab-links";

// After searchKnowledge:
const labLinks = buildScienceLabLinks(search.chunks);

// Add to the existing NextResponse payload:
labLinks,
~~~

保留所有既有 DeepSeek 参数、图片条件和来源去重逻辑，不从模型文本中解析链接。

- [ ] **Step 4: 运行 API 与链接测试，确认均通过**

Run: npm test -- src/lib/science-lab-links.test.ts app/api/ai-chat/route.test.ts

Expected: PASS with links, DeepSeek, images, and fallback tests passing.

- [ ] **Step 5: 提交 API 契约变更**

~~~bash
git add robot-console/app/api/ai-chat/route.ts robot-console/app/api/ai-chat/route.test.ts
git commit -m "feat: return lab detail links from chat"
~~~

### Task 3: 在两个聊天入口展示实验资料操作

**Files:**
- Modify: robot-console/src/components/FloatingChat.tsx
- Modify: robot-console/src/components/SciencePet.tsx
- Modify: robot-console/app/globals.css

- [ ] **Step 1: 以现有 API 测试确认聊天数据已包含点击所需完整 href**

Run: npm test -- app/api/ai-chat/route.test.ts

Expected: PASS; labLinks assertions prove the components do not re-search or construct URLs.

- [ ] **Step 2: 让 FloatingChat 存储并显示链接**

~~~tsx
import { ArrowUpRight, Bot, CornerDownLeft, MessageCircle, Minus, Sparkles } from "lucide-react";
import type { ScienceLabLink } from "@/lib/science-lab-links";

type ChatMessage = ConversationMessage & {
  photos?: Array<{ id: string; title: string; url: string; description?: string | null }>;
  labLinks?: ScienceLabLink[];
};

// Include labLinks in the response data type and store data.labLinks on the assistant message.

{message.labLinks?.length ? (
  <div className="mt-3 flex flex-wrap gap-2">
    {message.labLinks.map((link) => (
      <a
        className="inline-flex max-w-full items-center gap-1 rounded-[8px] border border-[#a8c9c1] bg-[#eef8f5] px-2.5 py-1.5 text-xs font-medium text-[#176b5d] transition hover:border-[#176b5d] hover:bg-[#dff1ec]"
        href={link.href}
        key={link.id}
      >
        <span className="truncate">查看《{link.title}》</span>
        <ArrowUpRight aria-hidden="true" size={14} />
      </a>
    ))}
  </div>
) : null}
~~~

- [ ] **Step 3: 让 SciencePet 存储并显示同一链接**

~~~tsx
import type { ScienceLabLink } from "@/lib/science-lab-links";

type PetMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  photos?: PetPhoto[];
  labLinks?: ScienceLabLink[];
};

// Include labLinks in the response data type and store data.labLinks on the assistant message.

{message.labLinks?.length ? (
  <div className="pet-message__lab-links">
    {message.labLinks.map((link) => (
      <a className="pet-message__lab-link" href={link.href} key={link.id}>
        查看《{link.title}》
      </a>
    ))}
  </div>
) : null}
~~~

在 app/globals.css 紧接 .pet-message__photos 前增加：

~~~css
.pet-message__lab-links {
  display: grid;
  gap: 6px;
  margin-top: 8px;
}

.pet-message__lab-link {
  overflow: hidden;
  border: 1px solid #b4d7ce;
  border-radius: 8px;
  background: #fff;
  padding: 7px 8px;
  color: #176b5d;
  font-weight: 700;
  line-height: 1.35;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pet-message__lab-link:hover {
  border-color: #176b5d;
  background: #e3f3ee;
}
~~~

- [ ] **Step 4: 运行静态检查，确认 JSX、类型和样式引用正确**

Run: npm run lint

Expected: PASS with no lint errors.

- [ ] **Step 5: 提交聊天入口 UI 变更**

~~~bash
git add robot-console/src/components/FloatingChat.tsx robot-console/src/components/SciencePet.tsx robot-console/app/globals.css
git commit -m "feat: show lab detail links in chat"
~~~

### Task 4: 由实验室 URL 自动打开现有详情弹窗

**Files:**
- Modify: robot-console/src/components/ScienceLab.tsx

- [ ] **Step 1: 运行导航解析器测试，确认有效和无效 item 参数的期望已覆盖**

Run: npm test -- src/lib/science-lab-links.test.ts

Expected: PASS; tests specify valid summary matching and null for missing or unknown values.

- [ ] **Step 2: 接入 URL 解析并复用现有详情加载函数**

~~~tsx
import { findScienceSummaryFromSearch } from "@/lib/science-lab-links";

// Import useRef, then add near existing state:
const openedFromUrlRef = useRef<string | null>(null);

// Convert openDetail to useCallback, keeping its current body.
const openDetail = useCallback(async (summary: ScienceKnowledgeSummary) => {
  setSelectedSummary(summary);
  setSelectedItem(null);
  setDetailLoading(true);

  try {
    const response = await fetch(
      "/api/science-resources?item=" + encodeURIComponent(summary.id),
    );
    if (!response.ok) throw new Error("Knowledge detail request failed");
    const payload = (await response.json()) as { item?: ScienceKnowledgeItem };
    setSelectedItem(payload.item ?? null);
  } catch {
    setSelectedItem(null);
  } finally {
    setDetailLoading(false);
  }
}, []);

useEffect(() => {
  const summary = findScienceSummaryFromSearch(window.location.search, initialItems);
  if (!summary || openedFromUrlRef.current === summary.id) return;

  openedFromUrlRef.current = summary.id;
  void openDetail(summary);
}, [initialItems, openDetail]);
~~~

保留卡片 onOpen 和关闭逻辑；无效 ID 不调用 API，因此页面保持当前实验列表。

- [ ] **Step 3: 执行全套自动验证**

Run: npm test

Expected: PASS with all Vitest tests.

Run: npm run lint

Expected: PASS with no lint errors.

Run: npm run build

Expected: PASS with a production build.

- [ ] **Step 4: 在本地浏览器进行完整交互验证**

Run: npm run dev -- --port 3001

Expected: 启动本地应用。验证以下情形：

1. 在任一聊天入口提问一个已收录实验，助手回复下出现查看实验名称的链接。
2. 点击该链接后地址为 /lab?item=<id>，并显示该实验的现有详情弹窗。
3. 直接访问 /lab?item=missing 时仅显示实验室列表，不显示弹窗。
4. 非实验室问题不显示实验链接，原有图片和 DeepSeek 回复不受影响。

- [ ] **Step 5: 提交、推送并部署生产版本**

~~~bash
git add robot-console/src/components/ScienceLab.tsx
git commit -m "feat: open lab details from chat links"
git push origin HEAD:master
vercel --prod
~~~

Expected: GitHub master contains all feature commits and Vercel returns a production deployment URL.
