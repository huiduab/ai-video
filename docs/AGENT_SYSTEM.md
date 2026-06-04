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
AI_TTS_VOICE=Neil
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

HTML 动画模式下，脚本生成系统提示词会切换为“视频内容导演”角色，只生成基础脚本、完整逐字稿、分镜旁白、基础画面意图和统一风格摘要。每个分镜的 `visualPrompt` 和 `animationPrompt` 只描述画面要表达什么、主体是什么、基础视觉方向和字幕安全区意识，不直接生成详细 HTML/CSS/JS 编排。

HTML 动画素材生成使用 OpenAI 兼容 `/chat/completions` 接口，要求模型只返回 `{ "html": "<!doctype html>..." }` JSON 对象；风格示例 HTML 只用于参考视觉语言，不是输出格式示例。兼容服务直接返回完整单文件 HTML（包括 `<html>...` 或 ```html 代码块）时，后端也会识别并保存到本地。以 `{` 或 `[` 开头的模型响应会先按 JSON 解包，避免把 JSON 字符串中的转义 HTML 误判为页面源码；保存前 QA 会拦截 `<!doctype html>{ "html": ... }` 这类外层包装被写进 HTML 文件的坏结果：

```text
public/generated/storyboards/{projectId}/scene-{index}-animation-*.html
```

HTML 动画模式下，脚本生成完成后会调用 `src/lib/agent/html-layout-planner.ts` 进行单分镜 HTML 编排。编排阶段默认按 `HTML_LAYOUT_CONCURRENCY=4` 并发处理分镜，并为每个分镜补齐 `htmlAnimation` 动画导演蓝图，用于减少“只生成静态大字”或自由排版导致的交错问题。该蓝图包含：

- `templateId`：动画模板，支持 `auto`、`kinetic-title`、`data-flow-network`、`layered-stack`、`comparison-split`、`timeline-process`、`matrix-grid`、`three-d-card`、`ppt-cover-impact`。
- `visualMetaphor`：本分镜用什么图形隐喻解释概念。
- `motionBeats`：按毫秒描述开场、主体出现、关键运动和收束定格。
- `focusPath`：观众视线移动路径。
- `emphasisMoments`：需要高亮、放大、闪光或描边的关键词。
- `transitionIntent`：与前后分镜的视觉和运动衔接方式。

单分镜 HTML 生成时，后端会根据编排阶段写入的 `htmlAnimation.templateId` 和分镜内容选择模板规则，并把模板的 `layoutRules`、`motionRules` 和 `safeAreaRules` 注入模型请求。模板库维护在 `src/lib/html-animation-templates.ts`，用于约束数据流、分层结构、流程时间线、矩阵网格、3D 卡片、PPT 章节页等常见演示套路。

生成某个 HTML 分镜时，后端会把当前 active 脚本里的统一画风、当前分镜提示词、前一个已生成分镜的 `generation.html.code` 和后一个已生成分镜的 `generation.html.code` 一并传给模型，并用 `previousSceneHtml`、`nextSceneHtml` 标注来源。顺序生成时通常只有前一个代码；后续局部重生成时如果前后分镜都已生成，接口会自动附带两侧代码，用于生成更平滑的过渡分镜。

HTML 生成提示词会强制要求固定 16:9 舞台、标题区、主体区、辅助区和底部字幕/播放器安全区。保存前后端会向 HTML 注入 `motionweave-runtime-guard` 与 `motionweave-runtime-bridge`，兜底设置 `html/body` 和舞台容器为无滚动条布局，并提供 `motionweave:play`、`motionweave:pause`、`motionweave:seek` 的 `postMessage` 播放协议。

脚本生成和素材生成都会附加强制高级画面提示词标准，规则维护在 `src/lib/agent/visual-prompt-standards.ts`。该标准要求每个 `visualPrompt` 或 `animationPrompt` 都包含主体、构图、镜头、光线、材质、色彩、空间层次、细节密度和 negative constraints，避免低级、口语化或只写“大标题+背景”的提示词。HTML 动画还会附加 `src/lib/agent/html-animation-patterns.ts` 中的策略库，把数据流、分层结构、PPT 演示、3D 对象、动态关键词和版式安全规则作为严格附加规则传给模型。

HTML 动画生成完成后会执行基础静态 QA：禁止远程资源、`window.top`/`parent`、`localStorage`、`cookie`、弹窗 API 等；缺少 `html/body`、未隐藏 overflow 或运行时 bridge 注入失败时会直接标记生成失败。

前端 `AI 生成` 只补齐失败或缺失素材；已成功的 HTML 会跳过。HTML 动画模式下时间线操作区不再提供强制重生成入口，再次点击 `AI 生成` 会继续补齐失败或未完成的 HTML 动画与旁白。

HTML 动画素材请求失败时，素材接口会把失败状态写回当前 active 脚本的 `scene.generation.html`，同时更新对应 `generation_tasks` 记录。这样用户刷新页面后仍能看到具体分镜处于 `failed` 状态和错误原因，后续再次点击 `AI 生成` 会按现有跳过规则继续补齐失败或未完成的素材。

HTML 动画风格规则维护在 `src/config/html-animation-styles/styles.json`，示例 HTML 维护在 `public/html-animation-styles/`，`src/lib/html-animation-styles.ts` 只负责读取和校验配置。当前项目选择保存在 `Project.metadata.htmlAnimationStyleId`，缺省为 `minimalist-tech` 极简科技风；旧项目如果保存了已删除的风格 id，会自动回退到当前默认风格。当前可选风格为极简科技风、赛博终端黑客风、优雅学术纪录片、动力学完播风、数据杂志风和产品蓝图风。所有风格提示词都要求避免“单一大标题页”，需要包含标题、辅助信息、图形/数据/节点等多层内容，并把关键信息放在画面上方约 72% 区域，底部 18-22% 作为字幕安全区。生成脚本和生成单个 HTML 动画素材时，后端都会把所选风格拆成独立会话消息传给模型：一条 `htmlAnimationStyleRule` 风格提示词消息，一条 `htmlAnimationStyleExample` 示例 HTML 消息，再跟随实际生成请求。模型必须把风格提示词吸收进 `styleConsistency` 和每个 `animationPrompt`，并参考示例的视觉语言、CSS 技法、DOM 组织和动效节奏，保证后续重新生成仍然使用当前项目风格。

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

## 2026-06-04 导演模型与 HTML 执行模型拆分

AI 生成链路拆为四个职责：

- 意图识别：继续使用 `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`，用于快速判断用户输入意图。
- 基础导演脚本：使用 `DIRECTOR_API_BASE_URL`、`DIRECTOR_API_KEY`、`DIRECTOR_MODEL`，默认面向 DeepSeek 官方 `deepseek-v4-pro`，只生成标题、摘要、逐字稿、基础分镜、旁白、基础画面意图和统一风格摘要。
- HTML 编排：使用 `HTML_LAYOUT_API_BASE_URL`、`HTML_LAYOUT_API_KEY`、`HTML_LAYOUT_MODEL`，未配置时回退到 `DIRECTOR_*`；默认按 `HTML_LAYOUT_CONCURRENCY=4` 并发为每个分镜补齐 `htmlAnimation` 施工图。
- HTML 执行：使用 `HTML_API_BASE_URL`、`HTML_API_KEY`、`HTML_MODEL`，默认面向当前 Gemini Flash 中转站。

如果没有配置新的 `DIRECTOR_*`、`HTML_LAYOUT_*` 或 `HTML_*`，代码会回退到旧的 `AI_*` 配置，便于旧环境继续运行。

基础导演模型请求默认超时为 90 秒，可通过 `DIRECTOR_REQUEST_TIMEOUT_MS` 调整；HTML 编排单请求默认复用该超时，可通过 `HTML_LAYOUT_REQUEST_TIMEOUT_MS` 调整；意图识别默认 30 秒，可通过 `AI_INTENT_REQUEST_TIMEOUT_MS` 调整。超时会写入 AI 会话日志并返回可控错误，避免前端一直等待。基础导演阶段只接收风格规则，不再接收完整 HTML 风格示例；完整示例仍保留给后续 HTML 执行模型使用，以减少 DeepSeek 输入长度和等待时间。

HTML 动画模式下，DeepSeek V4 Pro 基础导演不直接生成 HTML，也不再一次性生成所有镜头的详细 HTML 施工图。基础导演返回脚本后，HTML 编排阶段按分镜并发生成每个 `scene.htmlAnimation`，其中额外保存：

- `directorPrompt`：给人看的完整导演说明。
- `layerPrompt`：背景层、中景层、前景层说明。
- `animationTimeline`：start、middle、end 三段动画时间轴。
- `cameraPrompt`：镜头运动和安全区说明。
- `motionTechniques`：本镜头必须执行的动画技法。
- `htmlPrompt`：给 Gemini Flash 的单镜头 HTML 动画执行提示词。
- `negativePrompt`：禁止事项。
- `revisionHints`：人工返修时的局部修改建议。

`src/lib/agent/script-validator.ts` 会对 HTML 动画脚本执行最低详细度校验和 fallback 补全：基础导演阶段只需产出可用的 `visualPrompt`、`animationPrompt`；HTML 编排阶段会补齐 `htmlAnimation.htmlPrompt`、三层 `layerPrompt`、镜头运动说明、`motionTechniques`、`negativePrompt` 和 `revisionHints`。如果某个分镜编排请求失败，后端会输出 `[ai:html-layout:scene:fallback]` 并使用结构化 fallback 蓝图，不阻塞其它分镜并发编排。

为避免导演模型反复只修复上一个短字段、又在下一个字段失败，校验器会在最终校验前根据分镜标题、旁白、`visualPrompt` 和 `animationPrompt` 对 HTML 动画导演蓝图做结构化补全。补全只用于缺失或过短的导演细节字段，并且同一段 fallback 不会循环追加，避免提示词出现重复段落。

Gemini Flash 只接收当前分镜、当前分镜的 `htmlAnimation.htmlPrompt`、风格约束和相邻 HTML 代码，不接收完整故事。HTML 执行模型允许使用 GSAP CDN：`https://cdnjs.cloudflare.com/ajax/libs/gsap/3.x.x/gsap.min.js`；除此之外仍禁止远程字体、远程图片、其他远程脚本和网络请求。即使使用 GSAP，也要求提供 CSS keyframes 或 Web Animations API 兜底。

## 2026-06-04 AI 会话日志

后端会把与 AI 对话相关的请求和响应写入本地日志，便于实时排查提示词、模型输出和格式错误。

默认配置：

```env
AI_CONVERSATION_LOG_ENABLED=true
AI_CONVERSATION_LOG_TO_CONSOLE=true
AI_CONVERSATION_LOG_PATH=logs/ai-conversations.log
AI_CONVERSATION_LOG_MAX_CHARS=20000
```

开启后，AI 请求和响应会直接输出到 `npm run dev` 所在终端，格式类似：

```text
[ai:director:request] {...}
[ai:director:response] {...}
[ai:html-layout:request] {...}
[ai:html-layout:response] {...}
[ai:html-animation:request] {...}
```

同时也会写入 `AI_CONVERSATION_LOG_PATH` 指向的本地文件，方便回看。日志覆盖四个阶段：

- `intent`：意图识别模型请求和响应。
- `director`：DeepSeek 基础导演脚本请求、响应和失败重试。
- `html-layout`：单分镜 HTML 编排请求和响应；批量编排时默认 4 个分镜并发。
- `html-animation`：Gemini Flash 单镜头 HTML 请求、响应和错误。

日志是一行一个 JSON 记录，包含 `timestamp`、`requestId`、`stage`、`event`、`model`、`baseUrl` 和 `payload`。日志工具会隐藏 `apiKey`、`authorization`、`token`、`secret`、`password` 等敏感字段，但 prompt 和模型响应本身会被写入本地文件；不要把该日志提交或分享给第三方。
