# API 索引

所有路由位于 `src/app/api/projects/`。

## 项目

### `GET /api/projects`

读取项目列表。常用于工作区左侧项目历史。

查询参数：

- `limit`：默认 50，最大 100。

### `POST /api/projects`

创建项目、默认设置、默认分镜、默认时间线轨道和片段。

请求体：

```json
{
  "mode": "slideshow",
  "title": "未命名项目"
}
```

`mode` 支持：

- `slideshow`
- `html-animation`

### `GET /api/projects/[projectId]`

读取项目详情和 settings。

### `PATCH /api/projects/[projectId]`

更新项目基础字段。修改前先检查 route 当前支持的字段。

### `DELETE /api/projects/[projectId]`

软删除项目，设置 `deletedAt`。

## 数据库分镜

### `GET /api/projects/[projectId]/storyboard`

读取 `storyboard_scenes` 中未删除分镜。

### `POST /api/projects/[projectId]/storyboard`

追加一个数据库分镜，并同步创建对应 timeline clip。

## Agent 消息

### `GET /api/projects/[projectId]/agent/messages`

读取当前项目 Agent 聊天历史，返回 UI 可用消息结构。

### `POST /api/projects/[projectId]/agent/messages`

核心流程：

1. 校验用户 `content`。
2. 读取项目和数据库分镜上下文。
3. 保存用户消息。
4. 加载已验证 Agent 记忆。
5. 调用模型做意图识别。
6. 校验意图 JSON。
7. 若意图是生成/重生成大纲，则继续生成完整脚本和分镜。
8. 保存助手消息和结构化 `intentJson`。
9. 必要时更新 `Project.metadata.activeGeneratedStoryboardMessageId`。

### `PATCH /api/projects/[projectId]/agent/messages`

保存用户在脚本编辑弹窗中的修改，更新同一条助手消息的 `intentJson.payload.generatedScript`。

## Agent 生成分镜版本

### `GET /api/projects/[projectId]/agent/storyboards`

从历史 Agent 消息中收集包含 `generatedScript` 的版本，并返回当前 active 版本。

### `PATCH /api/projects/[projectId]/agent/storyboards`

切换当前项目使用的生成分镜版本。写入：

```text
Project.metadata.activeGeneratedStoryboardMessageId
```

### `POST /api/projects/[projectId]/agent/storyboards/assets`

按分镜生成并保存素材状态。支持 `kind: "image"`、`kind: "html"` 和 `kind: "audio"`；重新生成时可传入 `force: true`，成功后会用新的本地文件路径替换对应分镜的 `generation.image`、`generation.html` 或 `generation.audio`。

请求体：

```json
{
  "messageId": "agent-message-uuid",
  "sceneIndex": 1,
  "kind": "image"
}
```

处理流程：

1. 校验目标 Agent 消息必须属于当前项目且包含 `generatedScript`。
2. 跳过已经 `succeeded` 且有可访问本地 URL 的分镜画面；如果历史 JSON 指向的 `/generated/...` 文件已不存在，则不会跳过，会重新生成。
3. 使用 Evolink `POST /v1/images/generations` 创建异步生图任务，默认模型为 `z-image-turbo`。
4. 按 `EVOLINK_IMAGE_POLL_INTERVAL_MS` 轮询 `GET /v1/tasks/{task_id}`，最长等待 `EVOLINK_IMAGE_POLL_TIMEOUT_MS`。
5. 任务完成后下载 `results[0]` 到 `public/generated/storyboards/{projectId}/`，避免 Evolink 临时链接过期。
6. 创建 `assets` 图片记录，`url` 保存本地可访问路径，`storageKey` 保存本地文件路径。
7. `generation_tasks.input/output` 保存请求参数、Evolink task id、远端结果、本地文件信息等排查数据。
8. 将图片状态写回 `agent_messages.intentJson.payload.generatedScript.scenes[].generation.image`。
9. 前端图片生成成功后会继续用 `kind: "audio"` 生成旁白音频。

HTML 动画处理流程：

1. 仅 `generatedScript.mode === "html-animation"` 时允许生成。
2. 使用 `AI_BASE_URL`、`AI_API_KEY` 和 `AI_HTML_ANIMATION_MODEL ?? AI_MODEL` 调用 OpenAI 兼容 `/chat/completions`。
3. 请求中包含统一 `styleConsistency`、当前分镜 `animationPrompt`、前一个已生成 HTML 代码 `previousSceneHtml` 和后一个已生成 HTML 代码 `nextSceneHtml`；后两个字段没有可用代码时为 `null`。
4. 模型必须只返回 `{ "html": "<!doctype html>..." }` JSON 对象；风格示例 HTML 只作为视觉参考，不作为输出格式示例。若兼容服务直接返回完整 HTML 字符串（包括 `<!doctype html>...`、`<html>...` 或 ```html 代码块），后端也会兼容保存；以 `{` 或 `[` 开头的响应会先按 JSON 解包，避免把 JSON 字符串里的转义 HTML 误存成页面。保存前 QA 会拦截 `<!doctype html>{ "html": ... }`、`"html": "<!doctype html...` 等坏包装。HTML 需为不依赖外部网络资源的单文件 16:9 网页动画。
5. HTML 保存到 `public/generated/storyboards/{projectId}/`，并创建 `AssetType.HTML` 素材记录。
6. 将结果写回 `agent_messages.intentJson.payload.generatedScript.scenes[].generation.html`，包含 `url`、`assetId`、`prompt`、`durationMs` 和 `code`。
7. 前端 HTML 动画生成成功后继续用 `kind: "audio"` 生成旁白音频。

音频处理流程：

1. 使用 `AI_BASE_URL` 和 `AI_API_KEY` 调用 TTS 服务，默认模型 `qwen3-tts-flash`。
2. 音色由 `AI_TTS_VOICE` 配置，默认 `Neil`（平直、清晰的普通旁白音色）；输出格式由 `AI_TTS_RESPONSE_FORMAT` 配置，默认 `mp3`。
3. 默认先尝试 `{AI_BASE_URL}/audio/speech`，再尝试 `{AI_BASE_URL}/tts`；如服务路径不同，可用 `AI_TTS_PATH` 固定覆盖。
4. 接口兼容二进制音频响应，以及返回 `audio.url` / `output.audio.url` / base64 音频数据的 JSON 响应。
5. 音频保存到 `public/generated/storyboards/{projectId}/`，并创建 `assets` 音频记录。
6. 将音频状态写回 `agent_messages.intentJson.payload.generatedScript.scenes[].generation.audio`，前端会用 `audio.url` 播放，用 `audio.durationMs` 覆盖分镜时长。
7. 后端会校验 TTS 返回内容必须是可用音频：本地音频文件至少 128 bytes，响应应为 `audio/*` 或具备常见音频魔数；类似 `ok` 的文本响应不会保存为成功音频，会写入失败状态并继续尝试下一个 TTS 路径。

## 错误策略

- API 使用 JSON 错误响应。
- AI 意图 JSON 非法时应记录 `AI output JSON invalid`。
- AI 脚本 JSON 非法时应记录 `AI script JSON invalid`。
- 缺少 `AI_BASE_URL` 或 `AI_API_KEY` 时返回可控错误，不应让前端无响应。

## 2026-06-04 Agent 模型拆分补充

`POST /api/projects/[projectId]/agent/messages` 在生成或重生成大纲时，会先使用 `AI_*` 配置完成意图识别，再使用 `DIRECTOR_*` 配置生成完整脚本和 HTML 动画导演稿。导演稿校验失败时，接口会把具体字段错误反馈给导演模型并重试，最终仍不合格时返回脚本生成失败。

`POST /api/projects/[projectId]/agent/storyboards/assets` 在 `kind: "html"` 时使用 `HTML_*` 配置生成单镜头 HTML。请求会把 `scene.htmlAnimation.htmlPrompt` 作为导演压缩后的单镜头执行提示词传给 Gemini Flash，并允许 GSAP CDN；除 GSAP 外的远程资源、远程字体、远程图片和网络请求仍会被 QA 拦截。
