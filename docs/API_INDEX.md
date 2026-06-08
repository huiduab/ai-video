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
2. 读取项目和轻量分镜上下文；优先使用当前 active 生成脚本的 `index`、`title` 和短旁白摘要，缺失时回退数据库分镜。
3. 保存用户消息。
4. 调用模型做意图识别；该阶段不传完整 `memory`、`visualPrompt`、`animationPrompt` 或 `htmlAnimation`。
5. 校验意图 JSON。
6. 若意图是生成/重生成大纲，则加载已验证 Agent 记忆并继续生成完整脚本和分镜。
7. 保存助手消息和结构化 `intentJson`。
8. 必要时更新 `Project.metadata.activeGeneratedStoryboardMessageId`。

重新生成大纲的特殊处理：

- 普通发送请求体仍为 `{ "content": "..." }`。
- 当意图为 `REGENERATE_OUTLINE`，且当前 active 脚本已有任意分镜画面、HTML 动画或旁白音频生成结果时，接口会在意图分析后立即返回确认助手消息，不进入导演脚本生成。该消息的 `intentJson.payload.requiresConfirmation` 为 `true`，并包含 `pendingAction.type = "CONFIRM_REGENERATE_OUTLINE"`。`ADD_SCENE` 和 `DELETE_SCENE` 是局部结构操作，不触发整片覆盖确认。
- 确认请求体为 `{ "action": "confirm-regenerate-outline", "confirmationMessageId": "..." }`。接口会校验该确认消息仍是当前项目最新消息；校验通过后更新原确认消息为新的 `generatedScript`，并将其设为 active 分镜版本。
- 当当前 active 脚本还没有任何生成资源时，`REGENERATE_OUTLINE` 直接生成新大纲。导演请求会附带 `regenerationContext`，包含原始用户提示词、现有分镜大纲和用户新的修改需求。
- `ADD_SCENE`、`DELETE_SCENE`、`REGENERATE_SCENE` 会作为局部大纲修改继续生成更新后的 `generatedScript`，而不是只返回意图分析卡片；返回成功后同样会更新 `activeGeneratedStoryboardMessageId`。其中 `ADD_SCENE` 只生成一个新分镜并插入当前大纲；`DELETE_SCENE` 只移除目标分镜并重排剩余分镜编号；二者都会保留其它已有分镜素材。
- `REGENERATE_SCENE` 要求意图 JSON 在 `payload.sceneIndex` 返回目标分镜编号。后端会调用单分镜导演请求，输入包含完整当前分镜摘要、目标旧分镜、前后相邻分镜和用户修改需求，不再传原始用户提示词；导演只返回 `{ sceneIndex, scene }`，后端只替换该分镜的脚本字段，其它分镜保持当前 active 脚本不变。HTML 动画模式下单分镜导演直接返回 `htmlAnimation.htmlPrompt` 等编排字段，不再额外调用 HTML 编排模型。保存助手消息后会内部调用单分镜素材接口并传入 `force: true`，图片轮播模式重生成 `kind: "image"`，HTML 动画模式重生成 `kind: "html"`。完成或失败状态会以助手消息气泡文案返回。

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
  "kind": "image",
  "force": true,
  "revisionContext": {
    "userModificationRequest": "把第 2 个分镜改成更有科技感",
    "originalVisualPrompt": "原始画面提示词",
    "originalNarration": "原始旁白",
    "originalHtmlCode": "<!doctype html>...",
    "revisedVisualPrompt": "导演改写后的画面提示词",
    "revisedNarration": "导演改写后的旁白"
  }
}
```

`force` 和 `revisionContext` 是可选字段。`revisionContext` 主要由 Agent 消息 API 在 `REGENERATE_SCENE` 后内部传入；HTML 动画模式会把其中的 `originalHtmlCode` 交给 HTML 执行模型作为当前分镜旧源码参考，且旧源码只传一次，避免同一请求重复携带整段 HTML。图片轮播模式会把旧提示词、旧旁白和用户修改需求追加到生图 prompt。

处理流程：

1. 校验目标 Agent 消息必须属于当前项目且包含 `generatedScript`。
2. 跳过已经 `succeeded` 且有可访问本地 URL 的分镜画面；如果历史 JSON 指向的 `/generated/...` 文件已不存在，则不会跳过，会重新生成。
3. 使用 OpenAI 兼容 `POST /images/generations` 生成图片，配置来自 `IMAGE_API_BASE_URL`、`IMAGE_API_KEY`、`IMAGE_MODEL` 和 `IMAGE_SIZE`，未配置 `IMAGE_API_*` 时回退到 `AI_BASE_URL` 和 `AI_API_KEY`。默认使用 OpenAI 官方 `gpt-image-1` 和 `1536x1024`；OpenAI 官方模型会限制为官方支持尺寸，第三方模型才会对小尺寸按原比例自动放大。图片请求不强制传 `response_format`，以兼容不支持该参数的中转服务或模型通道。
4. 接口兼容 `data[0].url` 和 `data[0].b64_json` 两种结果；URL 结果会下载到本地，base64 结果会直接写入本地文件。
5. 图片保存到 `public/generated/storyboards/{projectId}/`，避免供应商临时链接过期。
6. 创建 `assets` 图片记录，`url` 保存本地可访问路径，`storageKey` 保存本地文件路径。
7. `generation_tasks.input/output` 保存请求参数、供应商响应、本地文件信息等排查数据。
8. 将图片状态写回 `agent_messages.intentJson.payload.generatedScript.scenes[].generation.image`。
9. 前端图片生成成功后会继续用 `kind: "audio"` 生成旁白音频。

HTML 动画处理流程：

1. 仅 `generatedScript.mode === "html-animation"` 时允许生成。
2. 使用 `AI_BASE_URL`、`AI_API_KEY` 和 `AI_HTML_ANIMATION_MODEL ?? AI_MODEL` 调用 OpenAI 兼容 `/chat/completions`。
3. 请求中包含统一 `styleConsistency`、当前分镜 `animationPrompt` 和相邻分镜轻量上下文 `previousSceneContext`、`nextSceneContext`；相邻上下文只包含标题、视觉风格摘要、色彩/材质提示、运动节奏和转场意图，不再传前后分镜完整 HTML 代码。
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

## 2026-06-06 Agent 新增分镜 API 行为

- `POST /api/projects/[projectId]/agent/messages` 识别到 `ADD_SCENE` 后，意图 JSON 使用 `payload.insertAfterSceneIndex` 表示插入到哪个分镜后；未指定位置时为 `0`。
- 有 active `generatedScript` 时，接口不会重写整片大纲，而是调用单分镜导演生成 `{ insertAfterSceneIndex, scene }`，把新分镜插入当前大纲并重排 `scenes[].index`。
- 插入后的助手消息 `intentJson.payload` 会包含 `insertAfterSceneIndex`、`insertedSceneIndex`、`outline` 和新的 `generatedScript`，并更新 `projects.metadata.activeGeneratedStoryboardMessageId`。
- 接口随后内部调用素材接口：`html-animation` 项目生成 `kind: "html"`，`slideshow` 项目生成 `kind: "image"`，然后继续生成 `kind: "audio"`。
- 最终返回的助手消息气泡会提示新增分镜和素材生成完成；素材失败时返回已插入分镜的大纲结果，并在气泡文案中说明失败。

## 2026-06-06 Agent 删除分镜 API 行为

- `POST /api/projects/[projectId]/agent/messages` 识别到 `DELETE_SCENE` 后，意图 JSON 使用 `payload.sceneIndex` 表示要删除的目标分镜编号。
- 接口要求当前项目存在 active `generatedScript`，且目标分镜存在；如果当前只有 1 个分镜，不允许继续删除。
- 删除操作是确定性本地结构更新：从 `generatedScript.scenes` 移除目标分镜，重排剩余 `scenes[].index`，并用剩余旁白重建 `transcript`。
- 删除后的助手消息 `intentJson.payload` 会包含 `deletedSceneIndex`、`deletedSceneTitle`、`outline` 和新的 `generatedScript`，并更新 `projects.metadata.activeGeneratedStoryboardMessageId`。
- 删除不会清理 `public/generated/`、`public/generated/storyboards/` 或历史 `assets` 记录；剩余分镜已有的 `generation.image/html/audio` 会原样保留。

## 2026-06-06 MP4 导出 API

### `POST /api/projects/[projectId]/exports`

导出当前 active Agent 分镜版本为 MP4。当前版本先支持 `slideshow` 项目，`html-animation` 项目会返回明确错误，后续需要接入 Playwright 截帧管线后再支持。

处理流程：

1. 读取 `projects.metadata.activeGeneratedStoryboardMessageId` 指向的助手消息。
2. 从 `agent_messages.intentJson.payload.generatedScript` 取当前脚本。
3. 校验每个分镜都有 `generation.image.status === "succeeded"` 和可访问的本地图片 URL。
4. 创建 `generation_tasks` 记录，`type` 为 `EXPORT_VIDEO`。
5. 使用系统 `ffmpeg` 为每个分镜生成临时 MP4 片段；有旁白时混入对应 `generation.audio.url`，没有旁白时使用静音音轨。
6. 按分镜顺序拼接片段，输出到 `public/generated/storyboards/{projectId}/exports/`。
7. 创建 `AssetType.VIDEO` 资产记录，URL 形如 `/generated/storyboards/{projectId}/exports/export-*.mp4`。
8. 更新导出任务为 `SUCCEEDED` 或 `FAILED`。

成功响应：

```json
{
  "taskId": "generation-task-uuid",
  "asset": {
    "id": "asset-uuid",
    "url": "/generated/storyboards/project-id/exports/export-123.mp4",
    "mimeType": "video/mp4",
    "sizeBytes": 123456
  }
}
```

## 2026-06-06 MP4 导出修正

- `POST /api/projects/[projectId]/exports` 请求体支持 `{ "includeSubtitles": true }`，用于控制是否把旁白字幕烧录进导出 MP4。
- 导出时长优先使用 `ffprobe` 读取本地旁白音频文件真实长度；读取失败时才回退到 `scene.generation.audio.durationMs`，再回退到默认 3 秒。
- 每个分镜之间继续追加 1 秒气口；气口不显示字幕。
- 字幕开启时，后端会为每个分镜生成临时 ASS 字幕并通过 `ffmpeg` 烧录到画面底部。
- 导出失败响应会尽量返回 `help` 字段，前端用于展示可操作的失败说明。
