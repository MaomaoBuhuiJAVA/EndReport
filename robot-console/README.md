# 科小贝智慧成长平台应用

这是国科二幼智慧成长平台的 Next.js 应用目录，负责官网、科学资源库、教学智能体、账号体系、投稿审核、管理员用户管理和幼儿科学游戏。

## 开发

```bash
npm install
npm run dev
```

常用检查：

```bash
npm test
npx tsc --noEmit
npm run build
```

## 目录约定

- `app/` 页面与 API 路由
- `src/components/` React 界面组件
- `src/lib/` 服务端边界、认证、短信、AI 与业务逻辑
- `prisma/` schema、seed 和增量 SQL 补丁
- `public/` 需要随应用发布的静态资源
- `docs/` 功能与运维说明

## 账号与管理员门禁

用户通过手机号或用户名登录。管理员用户页是 `/admin/users`，必须使用绑定手机号 `13967719299` 的 `ADMIN` 账号完成短信验证码验证。用户列表只展示必要的账号资料、注册时间和最近登录方式，不返回密码或密码哈希。

短信与数据库配置只从服务端环境变量读取。生产环境变更前必须备份 PostgreSQL，并按 `prisma/patches/` 中的增量补丁执行；不要把 `.env`、数据库 dump、依赖目录或临时生成物提交到仓库。
