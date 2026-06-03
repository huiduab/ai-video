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
AI_TTS_VOICE="Li"
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
- `AI_TTS_VOICE` 默认使用中文音色 `Li`，可按服务支持的音色名称调整。
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
