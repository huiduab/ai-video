# AI Agent 系统索引

## 目标

Agent 负责把用户自然语言转成视频创作相关的结构化结果，并在需要时生成完整视频脚本和分镜。

## 关键文件

| 文件 | 用途 |
| --- | --- |
| `src/types/agent.ts` | Agent 类型、展示类型、脚本类型 |
| `src/lib/agent/prompt.ts` | 意图识别系统提示词 |
| `src/lib/agent/script-prompt.ts` | 视频脚本生成提示词 |
| `src/lib/agent/openai-compatible.ts` | OpenAI 兼容模型调用 |
| `src/lib/agent/intent-validator.ts` | 意图 JSON 解析和校验 |
| `src/lib/agent/script-validator.ts` | 脚本 JSON 校验 |
| `src/lib/agent/display.ts` | 结构化意图到 UI 展示的映射 |
| `src/lib/agent/mappers.ts` | 数据库消息到前端消息映射 |
| `src/app/api/projects/[projectId]/agent/messages/route.ts` | Agent 消息主 API |
| `src/app/api/projects/[projectId]/agent/storyboards/route.ts` | 生成分镜版本 API |

## 意图类型

- `GENERATE_OUTLINE`
- `REGENERATE_OUTLINE`
- `ADD_SCENE`
- `DELETE_SCENE`
- `REGENERATE_SCENE`
- `OTHER_REJECTED`

## 模型调用

环境变量：

```env
AI_BASE_URL=https://your-provider.example.com/v1
AI_API_KEY=your_api_key
AI_MODEL=gemini-3-flash-preview
AI_TTS_MODEL=qwen3-tts-flash
AI_TTS_VOICE=Li
```

调用目标：

```text
{AI_BASE_URL}/chat/completions
```

请求使用 OpenAI Chat Completions 兼容格式。

分镜旁白音频生成复用 `AI_BASE_URL` 和 `AI_API_KEY`，默认模型为 `qwen3-tts-flash`，音色由 `AI_TTS_VOICE` 控制。后端会将音频文件保存到本地项目素材目录，并把结果写回对应分镜的 `generation.audio`。

## POST 消息流程

```text
user content
  -> save USER message
  -> load project + storyboard context
  -> load validated Agent memory
  -> call intent model
  -> parseAgentJson
  -> validateAgentIntent
  -> if generate/regenerate outline:
       call script model
       validateVideoScript
       attach generatedScript to intent payload
       set activeGeneratedStoryboardMessageId
  -> save ASSISTANT message
  -> return display data
```

## 记忆策略

Agent 只记忆已经结构化保存且可通过校验的结果：

- 已生成脚本标题、摘要、分镜。
- 非拒绝意图的最终 payload。

Agent 不记忆：

- 用户原始聊天全文。
- AI 原始输出。
- `reason`。
- `confidence`。
- 错误消息。
- 被拒绝任务。

## 生成分镜版本

一个项目可以有多条历史生成结果，但同时只有一个 active 版本。

生成完整脚本时会同步生成 `styleConsistency`，用于约束整支视频的统一画风。该结构包含：

- `visualStyle`：统一视觉风格。
- `colorPalette`：统一色彩方案。
- `lighting`：统一光线方案。
- `cameraLanguage`：统一镜头语言。
- `characterDesign`：统一角色或主体设计，可选。
- `renderingRules`：统一材质、纹理、清晰度和禁止风格漂移规则。

模型提示词要求每个分镜的 `visualPrompt` 或 `animationPrompt` 都详细写入这些画风约束，不能只写“保持一致”。分镜画面生成接口还会把 `styleConsistency` 追加到最终生图 prompt 前部，作为运行时兜底约束。

图片轮播模式下，模型还必须为每个分镜生成 `playbackEffect`，播放器会按该 JSON 执行画面运动和转场：

- `imageMotion.type`：支持 `none`、`slow-zoom-in`、`slow-zoom-out`、`pan-left`、`pan-right`、`pan-up`、`pan-down`、`ken-burns-in-left`、`ken-burns-in-right`、`ken-burns-out-left`、`ken-burns-out-right`。
- `transition.type`：支持 `cut`、`fade`、`crossfade`、`dip-to-black`、`dip-to-white`、`slide-left`、`slide-right`、`slide-up`、`slide-down`、`zoom-blur`。
- `treatment.type`：支持 `none`、`soft-vignette`、`cinematic-contrast`、`warm-film`、`cool-documentary`、`dreamy-glow`、`subtle-grain`。
- `src/lib/agent/script-validator.ts` 会规范化非法或缺失的 `playbackEffect`，默认回退到慢速推进、叠化转场和无额外画面处理。

生成脚本或保存脚本编辑时，项目名称会同步为 `generatedScript.title`；素材生成后会继续用音频时长和首个生成画面更新项目总时长与封面。

active 版本记录在：

```text
Project.metadata.activeGeneratedStoryboardMessageId
```

读取和切换 API：

```text
GET /api/projects/[projectId]/agent/storyboards
PATCH /api/projects/[projectId]/agent/storyboards
```

## 调试要点

- 意图 JSON 失败：查日志 `AI output JSON invalid`。
- 脚本 JSON 失败：查日志 `AI script JSON invalid`。
- 前端没有出现新分镜：检查 assistant message 是否有 `intentJson.payload.generatedScript`。
- 工作区没有切换版本：检查项目 metadata 中的 `activeGeneratedStoryboardMessageId`。
