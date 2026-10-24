# 原生教学文档与附件

原生工作流通过 `extractAttachment` 读取真实附件内容，通过 `createTeachingDocument` 生成真实 DOCX、PDF、PPTX、XLSX 文件，再通过 `storeTeachingArtifact` 生成本站下载链接。接口与实现位于 `src/lib/native-workflow/`，不需要 Dify 文档插件或 Dify 密钥。

## 附件支持与限制

| 输入 | 行为 |
| --- | --- |
| TXT | 读取 UTF-8 或带 BOM 的 UTF-16，拒绝二进制和非法编码 |
| DOCX | 读取 Word 正文，保留文字和表格内文字；不执行宏或访问外部链接 |
| DOC | 通过现有 `word-extractor` 读取旧版 Word 正文 |
| PDF | 读取文字层，支持本地 PDF.js CMap；扫描件需要上传图片或提供文字层 |
| PPTX | 按 presentation relationship 中的真实顺序读取幻灯片文字与讲者备注 |
| XLSX / XLS | 读取工作表单元格值；不执行公式或宏 |
| PNG / JPEG / WebP / GIF / AVIF | 校验实际图片字节、解码及类型，生成正确 MIME 的 data URL |
| BMP | 校验并解码未压缩的 BITMAPINFOHEADER BMP；其他 BMP 编码请转 PNG |
| PPT | 明确提示另存为 PPTX，不假装解析成功 |
| HEIC / HEIF | 当前原生依赖未包含相应解码器，明确提示转换 PNG/JPEG |
| 公开 HTTP(S) 链接 | 实际下载 HTML、TXT/Markdown 或支持的 Office/PDF 文件；HTML 提取标题和主正文，不执行网页脚本 |

每个附件最大 4MB，图片最大 2000 万像素，提取文本最大 50000 字符，截断时文本包含明确说明。电子表格每页读取最多 20000 行，超出时附截断说明；过宽的表格拒绝并提示拆分。空附件、空工作表、无文字幻灯片、空白或扫描件 PDF、损坏内容和不支持格式均返回可读错误。`AbortSignal` 用于取消附件读取和下载。

ZIP/OOXML 在解析前检查中央目录及本地条目，限制 2000 条目、单条目 16MB、总解压 32MB，以及异常压缩比例；实际 inflate 也设置输出上限，防止伪造大小字段绕过限制。拒绝路径穿越、重复条目、加密、分卷、ZIP64、不支持压缩和损坏 XML。

链接读取限 20 秒、4MB 和最多 3 次重定向，每次请求都验证全部 DNS 地址，并将已验证地址绑定到实际请求，避免再次解析。拒绝本机、私网、保留地址、带账号密码的 URL 和非标准端口；重定向重新检查目标。页面导航、脚本和页脚不作为正文；只有标题而无正文的页面仍返回读取失败。需登录、动态脚本生成正文、扫描 PDF 或不支持的文件应上传可读取的原始文件，系统不补造内容。

文档处理按交付意图选择输出：提取、概括、改写和家长活动回顾返回普通文稿，显式诊断、分析、检查等请求保留结构化诊断。格式不明确时保留已读证据和待完成需求并询问四种格式；仅转换格式使用已完成正文，不重新改写活动回顾。

明确的正文提取直接交付解析器读到的全部文字；同时要求摘要时，原文保持不变，模型仅生成补充摘要。原文可以先通过流式响应展示；摘要失败时仍保留已读原文，避免把漏段落的模型转述作为完整提取结果。

包含隐去姓名、删除、脱敏、替换等明确修改要求时，交付处理后的文稿，避免原样提取绕过修改要求。

## 输出约定

- DOCX 普通文稿保留中文 Markdown 正文、标题、列表与表格。明确生成或导出的完整教案套用园所活动设计表；聊天分隔符不强制分页，过程按有界段落组续页，阶段标题和首段保持同页，续页重复基本信息。原文提取、家长通知和活动回顾使用普通文档格式。
- PDF 使用 npm 依赖 `@embedpdf/fonts-sc` 内的 `NotoSansHans-Regular.otf`（SIL OFL 1.1），实际嵌入字体，生产 Linux 不依赖 Windows 字体。表格单元格过长时分页；列过多时提示拆分。
- PPTX 使用 `---`、`***` 或 `<!-- pagebreak -->` 分页，保留页序；长内容生成续页以避免裁剪。每页 `备注：`、`讲者备注：`、`演讲者备注：`、`讲稿：` 或 `notes:` 起始内容写入讲者备注。标题、正文、列表、可编辑表格保留。PPTX 字体使用 Noto Sans CJK SC，查看器缺少此字体时可自行替代；PDF 字体则已经嵌入。
- XLSX 仅将真正的 Markdown 表格导出为工作表，多表格对应多个工作表，支持转义的 `\|`。无表格输入明确报错。

## 存储配置

| 环境变量 | 默认与要求 |
| --- | --- |
| `AI_ARTIFACT_DIR` | 默认进程工作目录下 `.ai-artifacts`；生产建议指定有持久卷的绝对路径，放在 Web 静态目录之外 |
| `AI_ARTIFACT_SECRET` | 可选，至少 32 字符；未设置则在存储目录持久创建独立随机 `.signing-secret`，完全不使用 Dify key |

每个生成文件最大 20MB，存储最多 128 个文件且合计不超过 256MB。新写入时删除过期文件、残留文件；必要时移除最早生成的文件。链接有效期约 24 小时；容量淘汰可能让较早链接提前不可用。链接只包含随机 opaque ID、到期时间和 HMAC，不包含本地路径、原始文件名或凭据。

新 GET 路由 `/api/ai-chat/artifact?token=...` 校验签名及到期时间，拒绝篡改、路径穿越、符号链接和缺失文件，以附件方式返回真实文件字节。响应使用 `private, no-store`、`nosniff` 和 sandbox。无效或到期链接返回统一 404，错误响应不会包含磁盘路径或签名秘密。

生产容器必须持久挂载整个存储目录，包括 `.signing-secret`。多实例需要同一共享存储目录与相同 `AI_ARTIFACT_SECRET`；只有共享秘密而各实例磁盘不同仍会随机下载失败。临时 Serverless 文件系统无法保证跨请求或重启持久性，应使用持久服务/卷，或另行实现对象存储适配。共享文件系统还需可靠的原子 mkdir/open 语义，目录写锁用于避免多进程容量维护冲突。此版本没有对象存储实现。

## Next.js 生产打包

保留已有外置依赖，并在 `next.config.ts` 中包含以下配置，避免 PDF.js worker 和字体文件被构建裁掉：

```ts
serverExternalPackages: [
  "ali-oss",
  "pdfjs-dist",
  "pdfkit",
  "pptxgenjs",
  "mammoth",
  "word-extractor",
  "@embedpdf/fonts-sc",
],
outputFileTracingIncludes: {
  "/api/ai-chat": [
    "./node_modules/@embedpdf/fonts-sc/fonts/NotoSansHans-Regular.otf",
    "./node_modules/pdfjs-dist/package.json",
    "./node_modules/pdfjs-dist/legacy/build/pdf.mjs",
    "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    "./node_modules/pdfjs-dist/cmaps/**/*",
    "./node_modules/pdfjs-dist/standard_fonts/**/*",
    "./node_modules/@napi-rs/canvas/**/*",
    "./node_modules/@napi-rs/canvas-*/**/*",
  ],
},
```

`sharp` 由 Next 默认外置；部署平台还需要适合目标 OS/CPU 的 sharp 可选原生包，以及 PDF.js Node polyfill 使用的 `@napi-rs/canvas` 原生包。PDF.js 通过解析包的 JSON 元数据定位真实绝对模块文件，再用 URL 原生动态 import；不会对 ESM 入口使用 `require.resolve()`，从源头避开 Turbopack 的 CommonJS 外置检查。字体与 PDF.js 包路径通过 `createRequire(import.meta.url).resolve.bind(null)` 间接解析，避免构建器把直接 `require.resolve()` 的结果替换成数字模块编号；精确 tracing includes 则负责保留资产。生产 HTTP 已验证中文 PDF 导出和相同 PDF 重新上传提取。私有存储目录默认为明确的 `.ai-artifacts` 子目录，运行时私有文件的路径拼接和读取操作使用 `turbopackIgnore` 参数注释，避免文件追踪将整个项目视为可能的附件目录；这些生成文件本就不属于构建资产。使用支持当前 Next/PDF.js 的 Node.js 20.19+ 或 22.13+。Windows 下 PDF.js CMap/标准字体路径也使用正斜杠并以 `/` 结尾。

## 验证

```powershell
npx vitest run src/lib/native-workflow/documents.test.ts src/lib/native-workflow/attachments.test.ts src/lib/native-workflow/artifacts.test.ts app/api/ai-chat/artifact/route.test.ts
npx tsc --noEmit --incremental false
```

测试检查实际 OOXML 结构、中文 PDF 文字与嵌入字体、PPT 页序/续页/讲者备注/可编辑表格、XLSX 实际单元格、附件字节、ZIP 安全限制、取消、签名篡改/到期、跨操作系统进程读取和下载头。PDF 长表格测试同时检查每段文字位于页面可见范围内。使用 LibreOffice 与 Poppler 对生成的两页中文 PDF/PPTX 做了实际渲染和目检，并验证 LibreOffice 生成的 Word 97 DOC 可被解析。

已存在的 SheetJS `xlsx@0.18.5` 等依赖存在 npm advisories；新 `pptxgenjs` 的 `image-size` 传递依赖也有 advisory（本组件未导入或解析远程图片）。这些依赖风险未通过盲目跨版本更新隐藏，迁移报告记录了当前审计结果。附件内容提取不包含 OCR、图片表格识别、Excel 公式计算或演示动画解析。

## 2026-10-10 页数、原文与重启验证

明确要求的 PPT 总页数包含中文数字，并与节次编号、各部分页数、范围/上下限区分。续问中的新总体范围撤销旧精确总数，部分页数要求仍沿用总体约束。仅在多出的单独标题确为教师要求的主题且未要求保留封面时，将该标题并入第一内容页。原文正文和讲者备注保持完整；逻辑页和渲染后页数不符时返回可重试错误并保留完整文稿。

先前真实生成的空气主题课件已重放为实际 10 页，11 段原文全部保留。新生成十页课件也已用实际千问 API 验证。普通文档的自动分页仍按原逻辑运行。

本站链接标准化仅用于新生成教学文稿。上传原文及复用文稿的文字、原链接在多次 Word/PPT 导出中保持一致。XLSX 导出使用文稿中的 Markdown 表格；无表格时明确拒绝，不以空文件代替结果。

最新核心测试 62 个文件 / 585 项通过。本地真实 DOCX、PDF、PPTX、XLSX 下载已检查文件结构及关键文字/原链接。服务重启前的同一文档链接在重启后可下载，字节哈希相同。服务器候选 standalone 中的中文字体和 PDF worker 均已检查存在。

服务器更新包拟采用 `/var/lib/guoke/artifacts` 私有临时文档目录及稳定签名环境，链接保留 24 小时，缓存 128 个文件 / 256MiB。生产切换验收会读回暂存时的同一文档；该在线操作尚未授权或执行，不能将本地验证写作生产验收。
