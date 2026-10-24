# 千问语音播报

科小贝的消息播报及语音通话回复通过 `POST /api/voice/tts` 调用千问 Qwen-Audio 3.0 TTS Flash（`qwen-audio-3.0-tts-flash`），默认使用龙泡泡童声音色（`longpaopao_v3.6`）。客户端收到 `audio/wav` 音频 Blob，继续沿用原有播放、停止及语音通话流程。

网页消息播报和电话回复默认以 1.2 倍速度播放，保留原音高；每段音频加载时同步设置默认与当前播放速度，避免复用播放器或切换音频后回到慢速。文字、图片和语音继续共用当前千问密钥与 API 主机。

2026-10-20 接口修复：用户模型市场截图显示的是 `qwen-audio-3.0-tts-flash`，它与旧 `qwen3-tts-flash` 使用不同的接口和音色。按 [Qwen-Audio-TTS HTTP API](https://help.aliyun.com/zh/model-studio/qwen-audio-tts-http-api) 改为 `/services/audio/tts/SpeechSynthesizer`，输入 `format: "wav"`、`sample_rate: 24000`，使用其[支持的音色](https://help.aliyun.com/zh/model-studio/qwen-audio-tts-voice-list)。同一主机、同一新密钥真实调用返回 HTTP 200，短句合成 667ms、下载完成共 873ms，得到 192044 字节的 WAV。可据此确认正确模型、接口及音色组合可用；此前旧模型的 400 空响应不足以认定余额或平台服务异常。保留下面的历史排查记录，不代表修复后的当前状态。

修复验收：隔离源码 71 个测试文件 / 688 项通过，原本地项目 6 个相关文件 / 72 项通过，类型检查、本轮 ESLint 和原项目生产构建通过，独立审查无重要缺陷。更新本地模型与音色配置并重启 3100 预览后，网站 `/api/voice/tts` 的通话短句 HTTP 200 / 1248ms / 192044 字节，完整模型回复播报 HTTP 200 / 1467ms / 468524 字节；两份 WAV 长度头正确，均为 24kHz、16 位、单声道且含非静音采样。文字对话首个 delta 496ms、完成 692ms。仅为本次接口样本，实际设备麦克风与扬声器听感仍需在浏览器试听；本轮未部署服务器。

长消息在网页端按句分批请求语音：首批最多 100 个 Unicode 字符，后续每批最多 240 个，优先在句末或停顿处分开。首批音频就绪即播放，同时提前生成下一批；最多保留当前和下一批两份音频，按原文顺序完整播报。停止、切换回复或关闭聊天会取消待生成音频，并忽略迟到的播放结果。所有批次保留 1.2 倍速与原音高。

电话回复在文字流生成期间持续按句合成，首句较长时优先在自然逗号处分开，首段最多 32 个 Unicode 字符，后段最多 48 个；无标点时保留尾部余量再切分。准备当前和下一段音频，严格按顺序播放，已预生成的内容不重复请求。流式与最终文本共用清洗逻辑，总回复最多 72 字符；跨块链接、隐藏推理及长度截断不会撤回已提交的正常语音前缀。

电话识别实时展示临时转写，只提交最终识别结果。稳定结果等待 220ms（原 480ms），浏览器自然结束识别时立即提交已有最终文本；累计识别快照不会重复拼接。回复文字实时显示，不等待语音完成。“打断重说”、静音及挂断会取消识别定时器、模型和合成请求，并停止实际播放器；迟到结果不能覆盖新一轮。语音失败时显示提示，保留文字并继续监听。语音历史仅携带最近 6 条、每条最多 800 字符，不携带或覆盖长文稿工作流状态；电话中的导出要求不会触发文档生成。

2026-10-20 验证：71 个 Vitest 测试文件 / 686 项通过，类型检查和本轮文件 ESLint 通过。独立复审验证了 143 种常见文本分块组合以及旧音频取消不会停止新播放。旧 SciencePet Node 源码合同测试仍有 7 项历史断言失败，与基线相同，本轮语音断言已同步到转写缓冲器；未将其计为通过。真实新密钥文字调用 HTTP 200（一次样本 521ms），同一网关、原 qwen3-tts-flash/Mochi 语音请求仍 HTTP 400、正文为空对象，未收到音频。因此尚不能验收真实播报延迟和设备听感，也未完成浏览器麦克风/扬声器实测。

合入原本地项目时通过三方合并保留了已有科小贝形象更新，14 个本轮文件已合入，其余 254 个受保护路径内容未变；按用户要求仅另行更新本地密钥配置。原项目构建及本轮文件 ESLint 通过，78 个测试文件 / 726 项中 725 项通过，唯一失败是原项目既有短信登录模板默认值与断言不一致（SMS_512515901 对 SMS_51215901），本轮未修改短信源码或测试。已重启 `http://127.0.0.1:3100`：真实语音对话 HTTP 200，首个文字 delta 为 442ms、完成 760ms；语音合成 HTTP 503（275ms），对应上游 400。以上均为单次本地接口测量。

2026-10-10 分批验证：52 项语音相关测试通过，原项目与隔离源码为 63 个文件 / 604 项通过，服务器源码候选为 63 个文件 / 603 项通过；本地与单进程候选生产构建完成。独立审查发现的旧浏览器 `AbortSignal.any` 依赖已用取消事件转发修复，回归测试先失败后通过，复审无新增问题。330 字真实千问接口样本分为 3 批，首批 WAV 在 1086ms 就绪，全部批次在 9863ms 完成；这是单次接口与调度测量，未验证实际设备播放。构建/测试同时运行时曾出现既有文件淘汰测试超时，构建结束后顺序重跑全部通过，未改测试超时或文件存储实现。

2026-10-10 语速调整验证：原项目与隔离源码均为 62 个测试文件 / 589 项通过，服务器源码候选为 62 个文件 / 588 项通过；本地与候选生产构建完成。新增速度回归测试先在原实现失败、修改后通过，独立审查未留下问题。本地预览已重启，HTTP 200，客户端构建包含默认/当前 1.2 倍速与保留音高的设置。实际听感由用户在设备上试听确认；本轮未部署服务器。

服务端配置：

```dotenv
QWEN_TTS_API_KEY="现有有效千问密钥"
QWEN_API_BASE_URL="https://maas.qianwenaiapi.com/api/v1"
QWEN_TTS_MODEL="qwen-audio-3.0-tts-flash"
QWEN_TTS_VOICE="longpaopao_v3.6"
```

未设置 `QWEN_TTS_API_KEY` 时使用 `DASHSCOPE_API_KEY`。密钥只在服务端使用，不能设置为 `NEXT_PUBLIC_` 变量。文字、识图和图片生成复用同一密钥。Qwen-Audio 模型使用 `https://maas.qianwenaiapi.com/api/v1/services/audio/tts/SpeechSynthesizer`；也可通过共用的 `QWEN_API_BASE_URL` 设置其他千问地域接口。显式设置旧 `qwen3-tts-flash` 模型时保留旧多模态接口及 Mochi 默认音色，不能将两代模型的音色混用。

接口接收 `{ "text": "需要播报的内容" }`，拒绝空文本、非字符串和超过 6000 个 UTF-16 单元的文本。超过千问单次 600 字符限制时按句分段，完整合成后合并 PCM 为一个 WAV；保留汉字、标点和 Unicode 代理对。千问实际下载音频使用 WAV 流式占位长度，接口会按真实字节数重建文件头，使浏览器正确识别时长。

普通消息整次合成与下载最长 120 秒；电话批次请求增加 `voiceCall: true`，每批最长 12 秒，避免上游无响应时长时间阻塞下一轮。音频累计大小最多 64 MiB。客户端停止播放时通过 AbortSignal 取消上游请求。缺少配置、上游失败或音频异常返回 503 和通用错误提示，不返回密钥、签名 URL 或部分音频。非法输入返回 400，所有响应禁止缓存。

音频只从千问结果 OSS 主机下载，下载使用 HTTPS 且不转发 API Key；禁止跳转到其他主机。

验证：

```sh
npx vitest run app/api/voice/tts/route.test.ts src/lib/voice-call.test.ts src/lib/voice-session.test.ts
npx vitest run src/lib/speech-batches.test.ts src/lib/voice-speech.test.ts
npx eslint src/lib/qwen-tts.ts app/api/voice/tts/route.ts app/api/voice/tts/route.test.ts
```

阿里云部署使用 `/etc/guoke/qwen-tts.env`，权限为 `root:guoke 0640`，由 systemd 配置 `/etc/systemd/system/guoke-web.service.d/qwen-tts.conf` 加载。环境文件不纳入源码发布包。发布目录为 `/opt/guoke/releases/20261009-ecs-qwen-tts`，回退来源记录在 `/opt/guoke/qwen-tts-previous-release.txt`。部署脚本位于 `E:\国科二幼\output\deploy\40-build-qwen-tts.sh`、`41-check-qwen-tts.sh`、`42-activate-qwen-tts.sh`。
