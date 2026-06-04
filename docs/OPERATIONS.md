# 运行和验证

## 环境

项目需要 Node.js、PostgreSQL 和 Prisma。

主要环境变量：

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
DIRECT_DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
APP_ENV="development"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
AI_BASE_URL="https://your-provider.example.com/v1"
AI_API_KEY="your_api_key"
AI_MODEL="gemini-3-flash-preview"
AI_HTML_ANIMATION_MODEL="gemini-3-flash-preview"
AI_TTS_MODEL="qwen3-tts-flash"
AI_TTS_VOICE="Neil"
AI_TTS_RESPONSE_FORMAT="mp3"
# AI_TTS_PATH="/audio/speech"
EVOLINK_API_KEY="your_evolink_api_key"
EVOLINK_BASE_URL="https://api.evolink.ai/v1"
EVOLINK_IMAGE_MODEL="z-image-turbo"
EVOLINK_IMAGE_SIZE="16:9"
EVOLINK_IMAGE_POLL_INTERVAL_MS="3000"
EVOLINK_IMAGE_POLL_TIMEOUT_MS="120000"
```

示例文件：`.env.example`

本地真实配置：`.env.local`

## 常用命令

```bash
npm run dev
npm run build
npm run db:push
npm run db:generate
```

## Git 忽略规则

`.gitignore` 会忽略本地 dev 日志、构建缓存、临时探测目录、上传压缩包和 `public/generated/` 下的运行时生成素材，避免这些实时产物被误传到 GitHub。需要提交的静态示例资产应放在明确的项目目录中，例如 `public/html-animation-styles/`。

## 本地启动

```bash
npm run dev
```

默认访问：

```text
http://localhost:3000
```

如果端口被占用，Next.js 可能使用下一个可用端口，以终端输出为准。

## 数据库同步

schema 改动后：

```bash
npm run db:push
npm run db:generate
```

## 验证建议

最小验证：

```bash
npm run build
```

如果构建验证后还要继续在浏览器中检查本地页面，并且 `npm run dev` 当时仍在运行，需要重启开发服务再刷新页面。`npm run build` 会重写 `.next`，可能让仍在运行的 dev server 继续引用已失效的 CSS 资源，表现为页面退回原生 HTML 样式、CSS 资源 404 或 stylesheet 规则为空。发现这种情况时，必须先恢复样式加载并完成浏览器验证，再结束任务。

手动验证：

1. 打开首页。
2. 选择一种创作模式。
3. 确认进入创建页并生成项目。
4. 确认跳转 `/workspace?projectId=...`。
5. 在 AI 助手输入生成视频大纲请求。
6. 确认聊天区出现结构化结果。
7. 确认分镜时间线读取 active generated storyboard。

## 常见问题

### 数据库连接失败

检查：

- `.env.local` 是否存在。
- `DATABASE_URL` 是否可连接。
- PostgreSQL 是否启动。
- 是否已运行 `npm run db:push`。

### AI 请求失败

检查：

- `AI_BASE_URL` 是否包含 `/v1` 但不要包含 `/chat/completions`。
- `AI_API_KEY` 是否有效。
- 第三方服务是否支持 OpenAI Chat Completions 格式。
- 如服务不支持 `response_format`，需要调整 `src/lib/agent/openai-compatible.ts`。

### 分镜旁白音频生成失败

检查：

- `AI_BASE_URL` 和 `AI_API_KEY` 是否可用于当前 AI 服务。
- HTML 动画生成默认使用 `AI_HTML_ANIMATION_MODEL ?? AI_MODEL`，生成成功后的 HTML 会保存到 `public/generated/storyboards/{projectId}/`，并写入 `generation.html.url`。
- `AI_TTS_MODEL` 默认使用 `qwen3-tts-flash`。
- `AI_TTS_VOICE` 默认使用 `Neil`，作为平直、清晰的普通旁白音色；可按服务支持的音色名称调整。
- 如果旁白生成报错包含 `Invalid voice specified`，说明当前 `AI_TTS_VOICE` 在供应商侧不存在或未授权，应改回 `Neil` 或供应商明确支持的音色。后端会保留 `/audio/speech` 和 `/tts` 各路径的错误，避免 fallback 路径覆盖真实原因。
- 默认会尝试 `/audio/speech` 和 `/tts` 两种 TTS 路径；如果服务只支持固定路径，设置 `AI_TTS_PATH`。
- 生成成功后的音频会保存到 `public/generated/storyboards/{projectId}/`，并写入 `generation.audio.url`。

### Evolink 生图失败

检查：

- `EVOLINK_API_KEY` 是否存在且有效。
- `EVOLINK_BASE_URL` 默认使用 `https://api.evolink.ai/v1`，不要包含 `/images/generations`。
- `EVOLINK_IMAGE_MODEL` 默认使用 `z-image-turbo`。
- `EVOLINK_IMAGE_SIZE` 可使用 `16:9`、`1:1` 等 Evolink 支持的比例。
- `EVOLINK_IMAGE_POLL_INTERVAL_MS` 和 `EVOLINK_IMAGE_POLL_TIMEOUT_MS` 控制轮询频率和单张图最长等待时间。
- 生成成功后的图片会保存到 `public/generated/storyboards/{projectId}/`。

### 构建失败但代码看似正确

可清理 `.next` 后重试。不要删除用户未确认的源码改动。

清理标准：

- 可以清理 `.next` 这类构建缓存。
- 不要删除 `public/generated/`、`public/generated/storyboards/` 下的图片、音频、HTML 动画等已生成项目素材。
- 只有用户明确要求删除生成结果时，才可以清理这些生成文件。

### 页面样式突然不显示

常见原因是运行 `npm run build` 后，仍在运行的 `next dev` 继续服务旧页面，但 `.next` 已被生产构建覆盖，导致 `/_next/static/css/...` 返回 404 或浏览器中的 stylesheet 规则数为 0。

处理步骤：

1. 停止当前 `next dev` 进程。
2. 重新运行 `npm run dev`。
3. 刷新浏览器页面。
4. 确认页面恢复 Tailwind/全局样式后再继续验收。

## 2026-06-04 AI 模型配置拆分

视频创作 Agent 现在支持按职责配置模型：

```env
AI_BASE_URL="https://your-provider.example.com/v1"
AI_API_KEY="your_api_key"
AI_MODEL="gemini-3-flash-preview"

DIRECTOR_API_BASE_URL="https://api.deepseek.com"
DIRECTOR_API_KEY="your_deepseek_api_key"
DIRECTOR_MODEL="deepseek-v4-pro"

HTML_LAYOUT_API_BASE_URL="https://api.deepseek.com"
HTML_LAYOUT_API_KEY="your_deepseek_api_key"
HTML_LAYOUT_MODEL="deepseek-v4-pro"
HTML_LAYOUT_CONCURRENCY="4"

HTML_API_BASE_URL="https://your-gemini-proxy.example.com/v1"
HTML_API_KEY="your_gemini_proxy_api_key"
HTML_MODEL="gemini-3-flash-preview"
```

- `AI_*`：意图识别和旧配置回退。
- `DIRECTOR_*`：基础脚本、逐字稿、分镜和统一风格摘要生成，默认 DeepSeek 官方 API。
- `HTML_LAYOUT_*`：HTML 动画分镜编排，默认复用 DeepSeek 官方 API；`HTML_LAYOUT_CONCURRENCY` 控制并发编排分镜数，默认 4。
- `HTML_*`：单镜头 HTML 动画执行，默认当前 Gemini Flash 中转站。

`DIRECTOR_API_BASE_URL`、`HTML_LAYOUT_API_BASE_URL` 和 `HTML_API_BASE_URL` 只填写到 `/v1` 或服务根路径，不要包含 `/chat/completions`。HTML 动画生成安全检查只允许 GSAP CDN 脚本，其他远程资源仍会被拦截。

请求超时配置：

```env
AI_INTENT_REQUEST_TIMEOUT_MS="30000"
DIRECTOR_REQUEST_TIMEOUT_MS="90000"
HTML_LAYOUT_REQUEST_TIMEOUT_MS="90000"
AI_REQUEST_TIMEOUT_MS="90000"
```

`DIRECTOR_REQUEST_TIMEOUT_MS` 控制 DeepSeek 基础导演模型等待时间，`HTML_LAYOUT_REQUEST_TIMEOUT_MS` 控制单分镜 HTML 编排模型等待时间。超时后终端会出现对应 `[ai:director:error]` 或 `[ai:html-layout:error]`，前端会收到脚本生成失败或使用编排 fallback，而不是一直等待。

## AI 会话日志

本地调试 AI 提示词和响应时，可以打开会话日志：

```env
AI_CONVERSATION_LOG_ENABLED="true"
AI_CONVERSATION_LOG_TO_CONSOLE="true"
AI_CONVERSATION_LOG_PATH="logs/ai-conversations.log"
AI_CONVERSATION_LOG_MAX_CHARS="20000"
```

开启 `AI_CONVERSATION_LOG_TO_CONSOLE` 后，AI 对话会直接显示在 `npm run dev` 的终端输出中。也可以通过文件日志回看：

```powershell
Get-Content logs\ai-conversations.log -Wait
```

每行是一个 JSON 记录，`stage` 会标识 `intent`、`director`、`html-layout` 或 `html-animation`。`html-layout` 会按分镜记录并发编排请求和响应，终端还会输出 `[ai:html-layout:batch:start]`、`[ai:html-layout:scene:fallback]`、`[ai:html-layout:batch:complete]` 便于查看批量编排进度。该日志包含 prompt 和模型响应内容，只应本地调试使用；`.gitignore` 已忽略 `logs/ai-conversations*.log`。
