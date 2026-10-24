# OSS 媒体迁移

目标存储空间为 `guokemeitiku`，地域为 `oss-cn-hangzhou`。本次迁移媒体文件，数据库继续使用 PostgreSQL。数据库备份可以保存在 OSS，但数据库不能在 OSS 中运行。

## 实际结果（2026 年 10 月 9 日）

新增 RAM 授权后迁移成功。69 个主资源全部上传并从 OSS 回读，逐字节比较通过，合计 444,492,764 字节（约 444.5 MB / 423.9 MiB），失败数为 0。

| 来源 | 数量 | OSS 存放目录 |
| --- | ---: | --- |
| 旧托管存储中的现存资源 | 13 | 已迁移至 OSS 的历史媒体目录 |
| GitHub Release 故事视频 | 28 | `migrated/github-release/science-media-v1/` |
| 从本地恢复的失效故事封面 | 28 | 已迁移至 OSS 的历史封面目录 |

GitHub 视频使用实际发布版本，28 个文件的大小和 SHA256 均与 GitHub 资产元数据一致。旧托管存储中的 13 个现存文件大小均与完整列表一致。28 张封面的旧链接为 404，使用 `public/science-story-covers` 中的对应 WEBP 恢复。

另保留前期上传的 28 个本地原始视频备份，位于 `migrated/github/science-media-v1/`，合计 770,378,834 字节。部分原始视频与 GitHub 发布压缩版不同，因此主资源采用 `github-release/` 中经过发布版本校验的文件。备份不在网站媒体访问清单中。`migrated/` 共 97 个对象，总计约 1.215 GB，均未删除。

Bucket ACL 经查询仍为私有，匿名直接访问抽检视频返回 403。旧来源文件、GitHub 视频及本地原文件保留；网站后续上传均写入阿里云 OSS。

AccessKey 保存在 Git 忽略的 `.env.oss.local`，文档和清单不保存密钥。媒体访问清单已更新到 `src/data/oss-media-manifest.json`。本次没有发布网站、启用线上切换开关或修改生产数据库；后续上传由服务端接口写入阿里云私有 OSS。

## 操作命令

在 `robot-console` 目录执行。脚本以自身位置定位文件，不依赖调用目录。

```powershell
node scripts/migrate-media-to-oss.mjs --plan --include-github
node scripts/migrate-media-to-oss.mjs --backup --include-github
node scripts/migrate-media-to-oss.mjs --copy --include-github
```

`--plan` 只列清单。`--backup` 将来源文件复制到本机并记录 SHA256。`--copy` 读取来源文件、上传到 OSS，然后重新读取 OSS 对象并逐字节校验。重复执行时，相同文件会复用；目标同名文件内容不同则停止，不覆盖。大文件下载使用可续传的分段缓存，保存在输出目录的 `range-cache/`。

所有新对象显式设为私有。脚本不删除源文件，不修改 Bucket ACL，不执行数据库 seed，也不自动修改线上数据库。

## 权限与凭证

使用创建 Bucket 的主账号或其授权 RAM 用户。RAM 权限策略示例保存在 `../../tmp/oss-migration-20261009/guokemeitiku-ram-policy.json`，只允许目标 Bucket 的必要查询以及 `migrated/` 和 `uploads/` 前缀下的读取、上传，不包含删除权限。

凭证使用 `ALIBABA_CLOUD_ACCESS_KEY_ID`、`ALIBABA_CLOUD_ACCESS_KEY_SECRET`，临时 STS 凭证还需 `ALIBABA_CLOUD_SECURITY_TOKEN`。这些变量只用于服务端，不添加 `NEXT_PUBLIC_` 前缀。

迁移完成后，应更换已在聊天中出现的凭证并停用旧凭证。

## 清单及网站切换

实际清单和校验结果保存在项目外的 `../../tmp/oss-migration-20261009`：

- `verified-migration.json`：经回读校验的对象记录。
- `science-knowledge-oss-preview.json`：替换内置目录媒体地址后的预览。
- `oss-media-manifest-preview.json`：服务端媒体访问清单。
- `migration-verification-report.json`：OSS 对象数量、大小、Bucket ACL 和本机真实接口验证结果。
- `source-backup/`：迁移来源文件的本机备份。

清单已应用到仓库，但默认开关仍关闭。部署时配置服务端 OSS 凭证、`OSS_BUCKET=guokemeitiku`、`OSS_REGION=oss-cn-hangzhou` 和 `OSS_MEDIA_ENABLED=1`。Next.js 不会自动读取自定义的 `.env.oss.local`，部署系统需将变量注入应用运行环境。凭证不得放进浏览器环境变量。

`resolveMediaReferences` 在服务端读取资料及作品时，将清单中的旧链接转为本站 `/api/media/...` 地址，支持内置目录和数据库返回的数据，因此启用读取切换无需批量改写数据库旧地址。关闭开关可回到原地址。本次不直接覆盖原始资源目录。

切换前仍需核对实际生产数据库中的动态资料访问权限，以及迁移清单生成后新增的文件。本地常规环境文件中的数据库地址是占位符，本次无法据此核对生产账号、作品和投稿，也不能以页面静态兜底视为数据库迁移成功。

`/api/media/[...key]` 是已准备的服务端读取接口。它只允许清单中的对象；目录公开资源按清单读取，其他文件按数据库公开状态或作品所有者/管理员权限读取。数据库无法核验时拒绝访问。OSS 签名地址不返回浏览器。图片和视频经网站转发，支持单段 Range 请求；未知类型按附件返回。

文件保存不需要自定义域名。通过网站转发读取，可先不绑定 OSS 媒体域名；这部分流量会经过网站服务器。后续绑定媒体域名或 CDN 时，需要重新确认资源授权和缓存方式。

新增作品和投稿的上传接口尚需改为 OSS；这项工作应在现存文件复制验证和账号权限核对后完成，不能仅替换链接就认为新上传也已切换。

## 本机验证

```powershell
node --test scripts/lib/oss-media-migration.test.mjs
node node_modules/vitest/vitest.mjs run src/lib/oss-media.test.ts app/api/media/[...key]/route.test.ts app/api/student-works/route.test.ts app/api/science-resources/route.test.ts src/lib/science-cover-sync.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

本次实际验证：

- 69 个主资源回读比较通过，目标对象大小与迁移清单全部一致。
- 本机启动生产构建、注入 OSS 配置后，实际视频和 WEBP 图片 Range 请求均返回 206、正确的 `Content-Range` 和媒体类型，并按 inline 展示。
- 未列入清单的原始视频备份请求返回 404，多段 Range 返回 416，匿名直连 OSS 视频返回 403。
- 修正 GitHub 视频标为普通二进制文件时的播放类型；未知文件类型继续作为附件。`ali-oss` 使用 Next.js 服务端外部依赖，避免可选代理依赖导致打包失败。
- 8 个相关 Vitest 文件共 44 项测试、7 项迁移脚本测试通过；相关 ESLint 检查通过。
- Next.js 生产构建通过。构建仍提示本机数据库占位地址无效，因此构建成功不代表生产数据库已验证。

上述真实媒体请求是在本机生产构建上验证，线上切换和线上完整业务验证尚未执行。
