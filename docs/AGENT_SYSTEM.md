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

HTML 动画模式下，脚本生成系统提示词会切换为“网页动画工程设计师”角色，不再生成图片导向提示词。每个分镜的 `visualPrompt` 和 `animationPrompt` 都必须面向网页动画实现，描述可用 HTML、CSS、SVG、JavaScript、Canvas 等技术完成的画面结构、动效时序、转场节奏、16:9 画布、安全区和本地单文件约束。

HTML 动画素材生成使用 OpenAI 兼容 `/chat/completions` 接口，返回完整单文件 HTML，并保存到本地：

```text
public/generated/storyboards/{projectId}/scene-{index}-animation-*.html
```

生成某个 HTML 分镜时，后端会把当前 active 脚本里的统一画风、当前分镜提示词、前一个已生成分镜的 `generation.html.code` 和后一个已生成分镜的 `generation.html.code` 一并传给模型，并用 `previousSceneHtml`、`nextSceneHtml` 标注来源。顺序生成时通常只有前一个代码；后续局部重生成时如果前后分镜都已生成，接口会自动附带两侧代码，用于生成更平滑的过渡分镜。

HTML 动画素材请求失败时，素材接口会把失败状态写回当前 active 脚本的 `scene.generation.html`，同时更新对应 `generation_tasks` 记录。这样用户刷新页面后仍能看到具体分镜处于 `failed` 状态和错误原因，后续再次点击 `AI 生成` 会按现有跳过规则继续补齐失败或未完成的素材。

HTML 动画风格来源于 `D:/Downloads/html-animation-generator (1).zip` 提供的动效配置。风格规则维护在 `src/config/html-animation-styles/styles.json`，示例 HTML 维护在 `public/html-animation-styles/`，`src/lib/html-animation-styles.ts` 只负责读取和校验配置。当前项目选择保存在 `Project.metadata.htmlAnimationStyleId`，缺省为 `tech-flow`；旧项目如果保存了已删除的风格 id，会自动回退到当前默认风格。生成脚本和生成单个 HTML 动画素材时，后端都会把所选风格拆成独立会话消息传给模型：一条 `htmlAnimationStyleRule` 风格提示词消息，一条 `htmlAnimationStyleExample` 示例 HTML 消息，再跟随实际生成请求。模型必须把风格提示词吸收进 `styleConsistency` 和每个 `animationPrompt`，并参考示例的视觉语言、CSS 技法、DOM 组织和动效节奏，保证后续重新生成仍然使用当前项目风格。

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
- 脚本 JSON 失败：查日志 `AI script JSON invalid`。JSON 解析会先尝试完整解析，再在模型输出末尾多出说明或多余字符时提取第一个完整 JSON 对象作为容错。
- 前端没有出现新分镜：检查 assistant message 是否有 `intentJson.payload.generatedScript`。
- 工作区没有切换版本：检查项目 metadata 中的 `activeGeneratedStoryboardMessageId`。
