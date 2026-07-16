# 国科二幼 · 科小贝实验室

温州市龙湾区国科温州第二幼儿园园本知识资源网站。首页展示园所与精选科学活动，`/lab` 提供按学期、内容类别和资源类型筛选的科小贝实验室。

## 功能

- GooeyNav 主导航与镜面动效按钮
- 178 条园本知识资料，包含科学诗、教师实验和家庭实验
- 图片、教案、视频三类资源筛选与资料详情
- Codex 官方精灵帧动画与科小贝 AI 气泡对话
- Neon Postgres 数据库，静态知识数据作为故障兜底

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run export:knowledge
npm run seed:knowledge
npm run dev
```

默认访问 `http://localhost:3000`。

## 环境变量

```env
DATABASE_URL=postgresql://...
COZE_API_TOKEN=可选；未配置时使用园本知识库本地回答
COZE_BOT_ID=7623419481909542946
PORT=3000
```

`.env.local` 不会提交到 Git。生产环境应在 Vercel 项目中配置 `DATABASE_URL` 和可选的 Coze 变量。

## 验证

```bash
npm run lint
npm run build
```

知识库导出脚本默认从同级工作区的 `国科二幼智能体知识库` 读取资料。幼儿活动情境图会写入数据库但标记为受限，不在公开页面及静态资源中发布。
