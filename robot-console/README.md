# 星芽陪伴机器人云端控制台

面向幼儿园陪伴机器人的 Web 控制与监控平台。教师可以在浏览器中查看机器人状态、下发移动和教学指令、查看日志，并通过右下角悬浮窗调用 AI 助手进行校园问答与陪伴话术生成。

## 当前实现程度

- 艺术化管理后台首页：设备总览、班级机器人列表、设备状态、教学任务、运行日志。
- 教师端控制面板：前进、后退、左转、右转、停止、学习模式、陪伴模式、休眠、故事、儿歌。
- AI 悬浮窗：服务端 API 调用 DeepSeek，未配置密钥时自动使用本地模拟回复。
- 硬件预留接口：设备心跳上报接口和教师指令下发接口已经完成。
- 数据库模型：Prisma 定义了用户、设备、指令、日志、AI 对话、学习任务等表，后续可接 Vercel Postgres。

## 技术栈

- Next.js App Router
- TypeScript
- Tailwind CSS
- Prisma ORM
- Vercel Postgres / Neon PostgreSQL
- DeepSeek Chat API
- lucide-react 图标组件

## 本地运行

```bash
npm install
npm run dev
```

默认地址：

```text
http://localhost:3000
```

## 环境变量

复制 `.env.example` 为 `.env.local`，然后填写：

```bash
DATABASE_URL="Vercel Postgres 提供的连接字符串"
DEEPSEEK_API_KEY="你的 DeepSeek API Key"
DEEPSEEK_API_URL="https://api.deepseek.com/chat/completions"
```

注意：`.env.local` 已被 `.gitignore` 忽略，不能把真实密钥提交到 GitHub。

## 主要接口

```text
GET  /api/overview
获取控制台总览数据。

POST /api/commands
教师端下发机器人控制指令。

POST /api/devices/[id]/heartbeat
开发板/模拟设备上报电量、模式、心跳。

POST /api/ai-chat
调用 DeepSeek 生成校园问答回复。
```

## 源码结构

```text
app/
  page.tsx                         控制台主页面
  api/overview/route.ts             总览接口
  api/commands/route.ts             指令下发接口
  api/devices/[id]/heartbeat/route.ts
  api/ai-chat/route.ts              DeepSeek 对话接口

src/components/
  FloatingChat.tsx                  右下角 AI 悬浮窗
  CommandButton.tsx                 教师端控制按钮

src/lib/
  mock-data.ts                      模拟设备、日志、任务数据
  store.ts                          演示阶段的数据读写逻辑
  prisma.ts                         Prisma Client
  types.ts                          业务类型

prisma/
  schema.prisma                     数据库表结构
```

## Vercel 部署思路

1. 将代码推送到 GitHub 仓库。
2. 在 Vercel 中导入 GitHub 项目。
3. 在 Vercel 项目中添加 Postgres 数据库。
4. 将 `DATABASE_URL` 和 `DEEPSEEK_API_KEY` 添加到 Vercel 环境变量。
5. 部署后运行 Prisma 建表，或在本地使用 Vercel 提供的连接字符串执行：

```bash
npm run prisma:push
```

## 汇报时可以这样描述

本项目采用 Next.js 构建前后端一体化控制台，前端负责设备状态展示、教师控制和 AI 交互，后端 API 负责指令下发、AI 模型调用和硬件通信接口预留。当前版本使用模拟数据完成演示闭环，后续接入开发板时，只需要让开发板调用心跳接口并轮询或订阅指令接口即可。
