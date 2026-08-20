# Dify 多年龄多模态教学智能体 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将园内已有的科学诗、科学故事、实验教案、图片、视频与二维码资料整理为 Dify 可检索知识库，并配置一个能够按托班、小班、中班、大班自适应生成教案与回答问题的 Chatflow。

**Architecture:** 资料导出脚本从 `src/data/science-knowledge.json` 读取 160 条已审核资源，为每个年龄段和资源类型生成独立 Markdown 文档；每个条目保留标题、主题、年龄、正文、步骤、公开图片、视频与二维码 URL。Dify Chatflow 使用“用户输入 → 知识检索 → 教学 LLM → 直接回复”链路，LLM 从检索上下文中选择相关资源并输出可直接执行的教案或问答。

**Tech Stack:** Node.js、现有 JSON 科学目录、Dify Cloud Chatflow / 知识库、Markdown、GPT-5 Chat 模型。

---

### Task 1: 生成可上传的分龄知识文件

**Files:**
- Create: `robot-console/scripts/export-dify-teaching-knowledge.mjs`
- Create: `robot-console/scripts/export-dify-teaching-knowledge.test.mjs`
- Create: `robot-console/dify/knowledge/README.md`
- Create: `robot-console/dify/knowledge/*.md`（由脚本生成）
- Modify: `robot-console/package.json`

- [ ] **Step 1: 写出失败的导出契约测试**

```js
assert.equal(result.totalItems, 160);
assert.deepEqual(result.documents.map((doc) => doc.fileName), [
  "科学诗-托班.md", "科学诗-小班.md", "科学诗-中班.md", "科学诗-大班.md",
  "科学故事-托班.md", "科学故事-小班.md", "科学故事-中班.md", "科学故事-大班.md",
  "科学实验-托班.md", "科学实验-小班.md", "科学实验-中班.md", "科学实验-大班.md",
  "多媒体资源索引.md",
]);
assert.match(scienceExperimentDocument, /## 图片与视频资源/);
assert.match(scienceExperimentDocument, /https:\/\/www\.qyfck\.icu\//);
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test scripts/export-dify-teaching-knowledge.test.mjs`

Expected: FAIL because the exporter does not exist.

- [ ] **Step 3: 实现最小的确定性导出器**

```js
export function buildDifyKnowledgeDocuments(items, publicBaseUrl) {
  // 按 category 与 ageLabel 分组；每条记录生成带元数据、正文、资源 URL 的 Markdown 段落。
}

export async function writeDifyKnowledgeDocuments({ catalogPath, outputDir, publicBaseUrl }) {
  // 使用 UTF-8 写入 12 个分龄主题文档与 1 个媒体索引，并返回统计信息。
}
```

导出规则：
- 仅导出 `科学诗`、`科学故事`、`科学实验` 的公开教学内容；不导出账号、密钥、日志或个人资料。
- 每条记录以 `# 《标题》` 开始，并写入“资源类型、年龄段、主题、标签、正文、公开资源”。
- 图片、视频、二维码以绝对公开 URL 写入；没有公开链接的本地原稿只输出文本正文。
- 文件名固定，保证重复运行结果可比较。

- [ ] **Step 4: 运行测试和导出命令**

Run:
```powershell
node --test scripts/export-dify-teaching-knowledge.test.mjs
node scripts/export-dify-teaching-knowledge.mjs
```

Expected: 13 个 Markdown 文件生成，汇总数为 160。

- [ ] **Step 5: 提交导出器与知识文件**

```powershell
git add robot-console/scripts/export-dify-teaching-knowledge.mjs robot-console/scripts/export-dify-teaching-knowledge.test.mjs robot-console/dify/knowledge robot-console/package.json
git commit -m "feat: export Dify teaching knowledge"
```

### Task 2: 固化 Dify 的教学策略和工作流配置

**Files:**
- Create: `robot-console/dify/国科二幼多年龄教学智能体配置.md`
- Create: `robot-console/dify/国科二幼多年龄教学智能体测试用例.md`

- [ ] **Step 1: 写出教学系统提示词**

提示词必须明确：
- 优先使用知识检索结果，不虚构园本资料；
- 从用户明示年龄、班级、发展水平中确定托班/小班/中班/大班，缺失时给出默认和调整选项；
- 对“完整教案”输出活动目标、材料、详细过程、教师话术、幼儿可能反应、差异化支持、观察记录、安全提示、家庭延伸；
- 对资料检索输出来源标题和最多三项相关图片、视频或二维码 Markdown 链接；
- 对用户上传图片，先描述教学相关观察，再结合检索资料提出可操作建议；
- 对无资料命中的事实问题说明“资料库暂未收录明确内容”。

- [ ] **Step 2: 写入节点级配置表**

```text
开始：query、files（图片和文档）
知识检索：query -> 国科二幼科学教学资源库，Top K=5，Score=0.35
LLM：query + files + 知识检索.result，开启视觉和 6 轮聊天记忆
直接回复：LLM.text
```

- [ ] **Step 3: 写入 8 个验收样例和断言**

样例覆盖：托班科学活动、中班完整实验教案、大班图片观察、科学诗检索、故事推荐、视频二维码索取、连续追问、无资料命中。

### Task 3: 在 Dify Cloud 创建知识库并配置 Chatflow

**Browser surfaces:**
- `https://cloud.dify.ai/datasets`
- `https://cloud.dify.ai/app/8f367498-36ed-4115-808e-231f1d907e2f/workflow`

- [ ] **Step 1: 创建知识库“国科二幼科学教学资源库”**

上传 13 个由 Task 1 生成的 Markdown 文档，使用高质量索引，中文检索，自动分段。确认资料只包含公开教学内容和公开资源 URL。

- [ ] **Step 2: 将 Chatflow 扩展为检索工作流**

在现有 Start → LLM → Answer 基础上添加知识检索节点并连接：

```text
Start.query -> Knowledge Retrieval.query
Knowledge Retrieval.result + Start.query + Start.files -> LLM
LLM.text -> Answer.answer
```

为 LLM 粘贴 Task 2 的系统提示词，开启视觉输入与聊天记忆，设置温度 0.2、最大 token 1800。

- [ ] **Step 3: 发布并记录版本**

发布当前工作流版本，记录 Dify App URL、知识库名称、已上传文档数和模型名到配置文档。

### Task 4: 验证真实教学流程

**Files:**
- Modify: `robot-console/dify/国科二幼多年龄教学智能体测试用例.md`

- [ ] **Step 1: 使用 Dify 预览运行 8 个样例**

每个结果记录“年龄适配、检索依据、活动过程完整性、多媒体链接、安全边界”。

- [ ] **Step 2: 修正不符合断言的提示词或节点参数**

每次只调整一个明确问题，再重复相应样例。

- [ ] **Step 3: 运行本地回归检查并交付**

Run:
```powershell
node --test scripts/export-dify-teaching-knowledge.test.mjs
npm test -- --run
npx tsc --noEmit
```

Expected: 所有导出契约和项目现有测试通过；交付文档能够让其他园所替换资料并复现同一智能体。
