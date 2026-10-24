# 国科二幼 · 科小贝智慧成长平台

龙湾区国科温州第二幼儿园的园所官网、科学资源库、教学智能体与成长互动平台。项目包含公开网站、手机号账号体系、管理员审核与用户管理、科学实验资源、幼儿科学小游戏，以及面向园所资料的 AI 问答和教学文档生成。

## 项目结构

```text
robot-console/       Next.js 应用源码与 Prisma 数据模型
robot-console/app/   页面与 App Router API
robot-console/src/   React 组件、业务逻辑与测试
robot-console/prisma/数据库 schema、seed 与增量补丁
robot-console/public/公开静态资源、品牌素材与科学游戏素材
robot-console/docs/  应用功能、媒体、短信与教学流程说明
docs/                项目设计、验收与部署计划
```

## 本地运行

```bash
cd robot-console
npm install
npm run dev
```

默认地址为 `http://localhost:3000`。复制 `.env.example` 为 `.env.local`，填写本地数据库、认证和服务端提供商配置。真实密钥、数据库连接、短信凭据和生产环境文件不会提交到 GitHub。

## 主要功能

- `/` 园所官网与科小贝入口
- `/auth` 手机号、用户名、密码和短信验证码账号流程
- `/lab` 科学诗、科学故事、科学实验和资源导航
- `/games` 幼儿科学小游戏、成长记录和周榜
- `/admin/reviews` 投稿内容审核
- `/admin/users` 管理员短信验证后的用户注册与登录记录

管理员用户页只展示账号资料、注册时间和最近登录方式；密码以单向哈希保存，接口和页面不会返回明文密码或密码哈希。管理员门禁固定核对 `13967719299`、数据库 `ADMIN` 角色和短信验证码。

## 验证

```bash
npm test
npx tsc --noEmit
npm run build
```

短信数据库集成测试需要专用隔离 PostgreSQL；生产数据库变更必须先备份，再执行 `prisma/patches/` 中经过审查的增量 SQL。禁止在生产环境运行未经审查的全量 seed 或 `prisma db push`。

## 生产环境

生产服务部署在阿里云 ECS，由 Nginx、systemd、Node.js 和 PostgreSQL 组成；媒体资源使用杭州私有 OSS。部署采用独立 release 目录、锁定清单、数据库备份、候选构建、HTTP 验收和原子切换。生产凭据只存在服务器受限环境文件中。

项目历史验收与部署记录保存在本地交接材料中，不把构建缓存、临时截图、数据库 dump、依赖目录、实验输出或部署包提交到 GitHub。
