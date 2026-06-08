# 数据模型索引

权威来源是 `prisma/schema.prisma`。本文只记录模型用途和关键字段。

## 枚举

| 枚举 | 用途 |
| --- | --- |
| `ProjectMode` | `SLIDESHOW`, `HTML_ANIMATION` |
| `ProjectStatus` | 草稿、初始化、生成中、完成、失败、归档 |
| `AssetType` | 图片、视频、音频、HTML、JSON、缩略图 |
| `TaskType` | 初始化、生成分镜、生成素材、渲染、导出 |
| `TaskStatus` | 排队、运行、成功、失败、取消 |
| `AgentMessageRole` | `USER`, `ASSISTANT`, `SYSTEM` |
| `AgentIntentType` | 生成大纲、重生成大纲、新增/删除/重生成分镜、拒绝 |

## 核心表

### `Project`

映射表：`projects`

关键字段：

- `mode`：内部枚举，API 映射到 `slideshow` 或 `html-animation`。
- `durationMs`：项目总时长。Agent 素材生成后按所有分镜 `generation.audio.durationMs` 相加；缺失音频的分镜按 3000ms 计算。
- `thumbnailAssetId`：项目封面素材 ID。Agent 素材生成后优先指向首个已生成分镜图片。
- `metadata`：项目扩展状态。当前用于保存 active 生成分镜消息 ID 和项目卡片封面 URL。
- `deletedAt`：软删除。

关键 JSON：

```json
{
  "activeGeneratedStoryboardMessageId": "agent-message-uuid",
  "coverImageUrl": "/generated/storyboards/project-id/scene-1.png",
  "coverImageAssetId": "asset-uuid"
}
```

### `ProjectSetting`

映射表：`project_settings`

保存分辨率、fps、默认分镜时长、主题和 AI 配置。

### `StoryboardScene`

映射表：`storyboard_scenes`

项目初始化和手动追加分镜使用。当前工作区主时间线已优先使用 Agent 生成分镜版本，而不是只依赖此表。

### `TimelineTrack` / `TimelineClip`

映射表：

- `timeline_tracks`
- `timeline_clips`

保存基础时间线结构。当前 Agent 生成分镜版本没有直接写入这些表。

### `Asset`

映射表：`assets`

只保存素材元数据和 URL/key，不直接保存二进制内容。

分镜生图成功后：

- `url` 保存本地可访问路径，例如 `/generated/storyboards/{projectId}/scene-1-...png`。
- `storageKey` 保存本地文件路径，例如 `public/generated/storyboards/{projectId}/scene-1-...png`。
- `metadata` 保存 `provider: "openai-compatible-image"`、`model`、`size`、`prompt`、供应商响应、远端临时 URL（如有）和本地文件名。

分镜旁白音频生成成功后：

- `type` 使用 `AUDIO`。
- `url` 保存本地可访问路径，例如 `/generated/storyboards/{projectId}/scene-1-narration-...mp3`。
- `storageKey` 保存本地文件路径，例如 `public/generated/storyboards/{projectId}/scene-1-narration-...mp3`。
- `durationMs` 在 TTS 服务返回可用时保存音频时长。
- `metadata` 保存 `provider: "ai-tts"`、`model`、`voice`、`responseFormat`、分镜文本和 TTS 原始响应排查信息。

HTML 动画分镜生成成功后：

- `type` 使用 `HTML`。
- `url` 保存本地可访问路径，例如 `/generated/storyboards/{projectId}/scene-1-animation-...html`。
- `storageKey` 保存本地文件路径，例如 `public/generated/storyboards/{projectId}/scene-1-animation-...html`。
- `durationMs` 保存对应分镜建议时长。
- `metadata` 保存 `provider: "ai-html-animation"`、`model`、`messageId`、`sceneIndex`、动画提示词和本地文件名。

### `GenerationTask`

映射表：`generation_tasks`

为后续长任务、渲染、导出保留。

分镜生图时用于记录一次 OpenAI 兼容图片生成调用：

- `input` 保存 provider、模型、比例、分镜索引和最终 prompt。
- `output` 保存供应商响应模式、供应商响应摘要、本地文件信息和最终结果。
- `status/progress/errorMessage` 反映当前生成状态。

### `AgentMessage`

映射表：`agent_messages`

关键字段：

- `role`：用户或助手。
- `content`：聊天展示内容。
- `intentType`：结构化意图类型。
- `intentJson`：通过校验的 Agent 结构化结果。
- `errorJson`：模型或校验失败时的错误信息。

生成脚本保存位置：

```text
agent_messages.intentJson.payload.generatedScript
```

## Agent 脚本结构

前端和后端类型在 `src/types/agent.ts`。

核心结构：

```text
VideoScriptResult
  title
  summary
  mode
  fullScript
  scenes[]
```

每个 scene 包含：

- `index`
- `title`
- `narration`
- `visualPrompt`
- `durationMs`
- `playbackEffect`：图片轮播播放配置，包含 `imageMotion`、`transition` 和可选 `treatment`；脚本校验器会规范化非法值。
- `generation.image`：分镜画面生成状态，包含 `status`、`assetId`、`url`、`prompt`、`generatedAt`。
- `generation.html`：HTML 动画模式的本地网页动画状态，包含 `status`、`assetId`、`url`、`prompt`、`generatedAt`、`durationMs` 和 `code`；后端在局部重生成时会把前后已生成分镜的 `code` 作为上下文传给模型。
- `generation.audio`：旁白音频生成状态，保存 `status`、`assetId`、`url`、`prompt`、`generatedAt`、`durationMs`；当声音完成后，前端使用 `audio.durationMs` 作为对应分镜时长，没有声音时默认 3000ms。
- `styleConsistency`：生成脚本级别的画风一致性约束，包含统一视觉风格、色彩、光线、镜头语言、角色或主体设计和渲染规则。生图接口会将其写入最终 prompt，减少跨分镜画风漂移。

## 修改规则

- 改 schema 后运行 `npm run db:push` 和 `npm run db:generate`。
- API 对外字段不要直接泄漏 Prisma enum 命名，使用 mapper 转换。
- 新增 JSON 字段时同步更新校验器和本文档。
