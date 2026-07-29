# 智能体实验室详情直达设计

## 目标

当智能体检索命中科小贝实验室的科学诗、教师实验或家庭实验资料时，用户可以在该条助手回复中点击实验名称，直接进入实验室页面并自动打开对应资料的现有详情弹窗。

## 范围

- 保留现有 DeepSeek 自然对话、资料来源、图片卡片和资料库兜底回复。
- 仅为来自打包实验室资料的检索结果增加可验证的 `labLinks`。
- 两个聊天入口都展示同一种“查看《实验名称》”操作：右下角资料问答 `FloatingChat` 和科小贝 `SciencePet`。
- 实验室页使用现有详情接口 `/api/science-resources?item=<id>` 加载完整资料并显示既有详情弹窗。

不新增实验室详情页，不修改实验室数据文件，不让模型生成链接，不改变普通资料库命中的聊天展示。

## 方案比较

1. 由模型在回复 Markdown 中生成实验室 URL：改动少，但模型可能生成错误 ID 或非预期地址，且链接难以统一展示。
2. 后端依据确定性检索结果返回结构化 `labLinks`：链接只对应实际命中的实验项目，前端能统一展示和测试。采用此方案。
3. 聊天组件在浏览器端再次搜索实验室数据：会重复检索逻辑并可能与后端回复上下文不一致，因此不采用。

## 数据流

1. `searchKnowledge(message)` 返回排序后的检索 chunks；打包实验室资料的 chunk ID 形如 `science-<itemId>`，其 `documentId` 为实验 ID，`title` 为实验名称。
2. `POST /api/ai-chat` 从本次检索结果中筛选实验室 chunks，按检索排序去重，最多生成 3 项：

```ts
type LabLink = {
  id: string;
  title: string;
  href: string; // /lab?item=<encodeURIComponent(id)>
};
```

3. API 在现有 `reply`、`provider`、`photos`、`sources` 字段之外返回 `labLinks: LabLink[]`。没有实验室命中时始终返回空数组。
4. `FloatingChat` 和 `SciencePet` 将 `labLinks` 存到助手消息，仅在数组非空时显示每个条目的链接按钮。链接以正常导航打开 `/lab?item=...`。
5. `ScienceLab` 在初次挂载时读取 `item` 查询参数。若该 ID 对应已加载的实验室摘要，则调用已有 `openDetail(summary)`，由既有接口加载详情并打开当前 `KnowledgeDetail` 弹窗。

## 组件边界

- `app/api/ai-chat/route.ts`：仅负责由检索结果组装可信的 `labLinks` 并附加到响应；不依赖 DeepSeek 输出。
- `FloatingChat.tsx` 与 `SciencePet.tsx`：只负责读取响应和显示链接，不判断资料是否属于实验室。
- `ScienceLab.tsx`：只负责把有效 URL 参数映射为现有摘要并复用 `openDetail`。弹窗关闭后保持当前实验室页面状态。

## 异常与兼容性

- 空检索、普通资料库命中、实验室条目不足 3 项：正常响应，按实际数量返回 `labLinks`。
- 同一实验被多个 chunk 命中：按 ID 去重，只显示一次。
- `item` 缺失、无效或无法在实验室摘要中找到：页面保持原有实验列表，不显示弹窗，也不抛出错误。
- 详情加载失败：沿用现有详情弹窗的加载/空内容表现，不影响实验室列表与聊天能力。
- 旧客户端忽略新增字段仍可照常工作；新增客户端对缺失 `labLinks` 按空数组处理。

## 验收与测试

1. AI 聊天 API 对实验室 chunk 返回最多 3 条正确编码且去重的 `labLinks`；普通 chunk 返回空数组。
2. 两个聊天入口在收到 `labLinks` 时显示实验资料链接；没有链接时不显示额外操作。
3. 访问 `/lab?item=<真实实验ID>` 自动请求现有详情接口并显示对应详情弹窗。
4. 访问 `/lab?item=<无效ID>` 保持正常实验室列表且不显示弹窗。
5. 现有 AI 聊天测试、lint 和生产构建继续通过。
