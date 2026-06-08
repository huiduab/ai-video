# 前端索引

## 页面

| 页面 | 文件 | 说明 |
| --- | --- | --- |
| `/` | `src/app/page.tsx` | 首页 |
| `/create` | `src/app/create/page.tsx` | 创建项目 loading 页 |
| `/workspace` | `src/app/workspace/page.tsx` | 主工作区 |

根布局 `src/app/layout.tsx` 的 `<html>` 使用 `suppressHydrationWarning`，用于兼容浏览器插件在 hydration 前向根节点注入属性（例如沉浸式翻译的 `data-immersive-translate-page-theme`）导致的开发环境 hydration 告警。根节点同时声明 `data-scroll-behavior="smooth"`，与全局 `html { scroll-behavior: smooth; }` 对齐，避免 Next.js 开发环境滚动行为提示。

## 组件分组

### 通用组件

路径：`src/components/common/`

- `Button.tsx`
- `IconButton.tsx`
- `Logo.tsx`
- `VideoPreview.tsx`

### 首页组件

路径：`src/components/landing/`

- `LandingHeader.tsx`
- `HeroSection.tsx`
- `ConceptCards.tsx`
- `WorkflowSection.tsx`
- `TrustLogos.tsx`
- `LandingFooter.tsx`

### 工作区组件

路径：`src/components/workspace/`

- `WorkspaceHeader.tsx`
- `ProjectSidebar.tsx`
- `EditorCanvas.tsx`
- `EditorToolbar.tsx`
- `StoryboardTimeline.tsx`
- `TimelinePanel.tsx`
- `HtmlAnimationPanel.tsx`
- `AssistantPanel.tsx`

## 工作区数据流

```text
workspace page
  -> load projects
  -> select project
  -> load project detail
  -> EditorCanvas
      -> VideoPreview
      -> StoryboardTimeline
          -> GET agent/storyboards
          -> PATCH active generated storyboard
          -> POST agent/storyboards/assets
  -> AssistantPanel
      -> GET agent/messages
      -> POST agent/messages
      -> POST agent/messages confirm-regenerate-outline
      -> PATCH edited generated script
      -> HTML 动画模式 GET/PATCH project htmlAnimationStyleId
      -> notify workspace to refresh StoryboardTimeline when generatedScript changes
```

## AI 助手确认气泡

- 当后端返回 `display.type === "confirmation"` 时，`AssistantPanel` 会在助手消息气泡内渲染确认卡片。
- `REGENERATE_OUTLINE` 的确认按钮位于卡片 footer，只在该消息是当前对话列表最后一条消息时显示；用户继续发送新消息后，旧确认按钮自动隐藏，避免点击过时操作。
- 确认气泡使用蓝色/深蓝主题，footer 的“确认重新生成”按钮使用红色，强调该操作会覆盖已有大纲版本。
- 点击“确认重新生成”会向同一消息 API 发送 `{ action: "confirm-regenerate-outline", confirmationMessageId }`，成功后用返回的助手消息替换原确认气泡，并在包含 `generatedScript` 时刷新工作区分镜。
- AI 等待气泡会轮播“导演正在修饰叙事细节”“动画师正在编辑分镜提示词”“画师正在会话中确认画面风格”“剪辑师正在整理大纲表格”等阶段文案；确认重新生成处理中也会显示紧凑版等待状态。
- 大纲结果气泡除标题、摘要和逐字稿外，会预览前三个分镜的旁白和画面/动画提示词摘要，让用户在不打开编辑弹窗时也能看到部分模型返回内容。
- 当后端对局部修改意图继续生成完整大纲时，前端的等待气泡会一直保留到 `generatedScript` 返回；完成后才替换为新的大纲结果卡片和分镜预览。
- 当 AI 正在生成或确认修改时，输入框和风格选择按钮会禁用，不能再次发送新任务；原发送按钮会切换为红色停止按钮，点击后中断当前前端请求并移除等待气泡。

## 分镜画面生成

- `StoryboardTimeline` 的主按钮会在 `AI 生成` 和 `中断生成` 之间切换。
- 分镜生成操作区在时间轴面板顶部左侧显示，右侧只保留总时长等汇总信息。
- 点击 `AI 生成` 后按当前 active 分镜版本顺序生成画面；已保存为 `succeeded` 的分镜会跳过，再次点击会从未生成处继续。
- 生成过程中会记录当前分镜序号，时间线对应分镜缩略图和分镜详情预览上方都会显示加载动画。
- 点击 `AI 生成` 后会按分镜顺序先生成画面，再调用同一素材接口生成该分镜旁白音频；已成功的画面或音频会跳过，未完成的部分会继续补齐。
- 批量生成画面或 HTML 动画时，单个分镜请求失败不会再中断整个队列；前端会把该分镜标记为失败、记录第一条错误，并继续生成后续分镜。再次点击 `AI 生成` 会继续补齐失败或未完成的素材。
- 图片生成后端调用 OpenAI 兼容 `/images/generations` 时，遇到 `fetch failed`、`ECONNRESET`、`ETIMEDOUT`、`ECONNREFUSED` 或 `EAI_AGAIN` 会短重试 3 次；重试后仍失败时会返回“图片生成服务连接失败”，通常表示当前机器到 `IMAGE_API_BASE_URL` 的 TLS 连接被供应商、代理或网络链路中断。
- `AI 生成` 的资产队列把画面和旁白都作为分镜素材处理：会先补齐所有分镜画面或 HTML 动画，再补齐旁白音频。生成旁白时，当前分镜会立即标记为 `旁白生成中`，完成后写回本地音频 URL；旁白失败时显示可重试状态，但不会阻塞后续分镜画面或 HTML 动画生成，再次点击 `AI 生成` 会继续补齐。
- HTML 动画模式下，点击 `AI 生成` 会先按分镜顺序生成所有本地 HTML 动画文件，再调用同一素材接口补齐分镜旁白音频；已成功的 HTML 或音频会跳过，未完成的部分会继续补齐。
- HTML 动画模式下，时间线操作区只保留 `AI 生成` 入口；已成功的 HTML 会跳过，失败或未完成的 HTML 会在再次点击 `AI 生成` 时继续补齐。
- HTML 动画生成结果保存在 `scene.generation.html`，`url` 指向本地 HTML 文件，主预览、时间线缩略图和分镜详情弹窗都会通过 sandbox iframe 展示该动画。
- HTML 动画脚本现在可包含 `scene.htmlAnimation` 动画导演蓝图，描述模板、图形隐喻、运动节拍、视线移动、强调时刻和转场意图；后端会用 `src/lib/html-animation-templates.ts` 选择模板规则，减少自由排版导致的元素交错。
- 主预览里的 HTML iframe 支持外层播放器同步协议。`VideoPreview` 会在播放、暂停、拖动和 iframe 加载时发送 `motionweave:play`、`motionweave:pause`、`motionweave:seek` 消息；新生成 HTML 会注入基础 bridge，尽量让 CSS/Web Animations 跟随外层播放状态。
- 主预览、时间线缩略图和分镜详情里的 HTML iframe key 都包含当前 `htmlUrl`。同一分镜重新生成 HTML 后，即使分镜 id 不变，只要本地 HTML URL 变化，前端也会重建 iframe，避免继续显示旧 iframe 内容。
- HTML 动画生成失败时，后端会把 `scene.generation.html.status` 写为 `failed` 并保留错误文本；刷新页面后时间线和分镜详情会显示“生成失败”，再次点击 `AI 生成` 会从失败或未完成的分镜继续补齐。
- HTML 动画模式下，AI 助手输入区提供绿色魔法棒风格按钮，点击后弹出居中的 HTML 动画风格大卡片；图片轮播模式不显示该按钮，也不会加载、保存或传入 HTML 动画风格信息。卡片展示风格提示词和 iframe 示例。风格示例 iframe 使用固定 1280x720 舞台等比例缩小到卡片预览框，避免大字号示例被裁剪成局部画面。风格规则维护在 `src/config/html-animation-styles/styles.json`，示例 HTML 维护在 `public/html-animation-styles/`。当前示例不再使用单一大标题页，而是包含标题、辅助信息、图形/数据/节点等多层内容，并统一把关键信息放在画面上方约 72% 区域，底部 18-22% 留作字幕安全区。选择风格后写入当前项目 `metadata.htmlAnimationStyleId` 并自动关闭弹窗，后续脚本生成和 HTML 动画生成都会附加该风格；未选择或旧项目保存了已删除风格时，默认使用 `minimalist-tech` 极简科技风。当前可选风格包含极简科技风、赛博终端黑客风、优雅学术纪录片、动力学完播风、数据杂志风和产品蓝图风。
- 声音生成结果保存在 `scene.generation.audio`，音频完成后由 `audio.durationMs` 驱动该分镜时长。
- 所有播放和汇总时长统一按 `scene.generation.audio.durationMs ?? 3000` 计算；没有旁白音频的分镜默认展示 3 秒。
- 分镜小卡片右上角显示喇叭图标：有 `audio.url` 时为蓝色并可点击播放；没有音频时为灰色禁用。
- 已生成图片或 HTML 动画会同步显示在 `VideoPreview`、时间轴缩略图和分镜详情卡片中。
- 时间线底部分镜卡片保持紧凑尺寸；HTML iframe 缩略图使用内部 16:9 虚拟画布等比例缩小并居中展示，避免卡片变大或动画画面被拉伸。
- `VideoPreview` 中左上角的分镜介绍卡片只在画面尚未生成时显示；分镜图片生成后，预览画面只保留播放控件和字幕等视频层。
- `VideoPreview` 接收当前 active 分镜列表，点击预览底部进度条左侧播放按钮会从第一个分镜开始播放图片轮播；底部时间显示为当前播放进度和视频总时长，例如 `00:32 / 01:34`。
- `VideoPreview` 播放总视频时会按当前播放头所在分镜切换 `frame.audioUrl`，让已生成旁白音频随图片轮播连续播放；单段旁白按钮仍由时间轴独立播放。
- 播放器底部进度条可随时拖动；点击下方分镜卡片会把播放头跳到该分镜开始位置并暂停，再点击播放会从当前播放头继续。
- 点击下方分镜卡片会生成独立的 seek 请求号；即使重复点击当前已选分镜，`VideoPreview` 也会重新跳到该分镜起点，并清空上一帧转场叠加，避免暂停在转场第 0 帧时显示旧画面或旧 HTML 动画。
- 播放器支持点击画面区域播放/暂停、底部音量滑块调整旁白音量、底部全屏按钮进入或退出浏览器全屏；预览画面不再显示中央播放浮层，顶部工具栏不再重复显示音量滑块和全屏按钮。
- 分镜时长优先使用对应旁白音频长度，没有音频时回退到 3 秒；旧数据缺失 `audio.durationMs` 时，`StoryboardTimeline` 会在浏览器端读取音频 metadata，重算预览总时长、底部分镜卡片时长和左侧项目列表当前项目时长。
- 旧数据里的 `generation.image`、`generation.html` 或 `generation.audio` 如果指向已不存在的 `/generated/...` 本地文件，`StoryboardTimeline` 加载时会校验 URL，将该素材临时标记为失败并清空 URL，避免继续显示“已生成”但加载 404；再次点击 `AI 生成` 会补齐缺失素材。后端读取分镜和生成素材时也会校正缺失文件；音频文件还必须满足最小可播放大小，避免 2 bytes 文本响应被当成成功旁白。
- 每两个分镜之间会额外插入 1 秒气口并计入视频总时长；气口期间 `VideoPreview` 保持显示上一分镜画面，不显示字幕，也不提前播放下一分镜音频。
- `VideoPreview` 会把当前分镜旁白按中英文句末标点拆成短句，再优先按逗号、顿号、空格和浏览器中文分词组合成不超过 16 个有效字符的字幕片段，尽量避免把词切到两个字幕里。
- 每条字幕最多 1 行，显示在预览画面靠近底部的居中位置；只在播放中、非气口、字幕开关开启时显示，并按“当前字幕有效字数 / 当前分镜旁白有效总字数 * 当前分镜时长”分配展示时间。
- 播放过程中按每个分镜的 `playbackEffect` 执行图片运动、叠化/淡入淡出/滑动等转场和可选画面处理；缺失或非法配置会回退到慢速推进和叠化。
- 点击 `AI 生成` 完成画面和旁白后，工作区会刷新左侧项目列表；项目卡片名称使用 Agent 脚本标题，封面使用首个已生成分镜图片，总时长使用全部分镜音频时长相加，缺失音频按 3 秒计算。
- AI 助手生成新脚本或保存脚本编辑后，会通过工作区父组件刷新 `StoryboardTimeline`，让中间预览和底部分镜立即同步 active generated storyboard。
- 双击时间轴分镜卡片会打开全部分镜卡片，并自动定位到对应分镜详情；详情弹窗关闭按钮固定在弹窗右上角。
- 分镜详情弹窗会展示当前分镜的 `旁白` 和 `画面提示词`。弹窗内提供 `重新生成画面` 和 `重新生成旁白` 两个单分镜按钮：HTML 动画模式下画面按钮强制重生成当前分镜 HTML，静态图像视频模式下画面按钮强制重生成当前分镜图片；旁白按钮在两种模式下都会强制重生成当前分镜音频。
- 分镜详情弹窗使用固定视口高度，左右两栏都有独立的细滚动条；右侧内容区在长旁白或长画面提示词时保持弹窗尺寸不变，用户可在弹窗内滚动查看全部内容。

## UI 约定

- 工作区是工具型界面，优先信息密度、稳定布局和可扫描性。
- 图标按钮优先使用 `lucide-react`。
- 可点击元素需要 `aria-label` 或明确文本。
- 数据加载必须有 loading/error/empty 状态。
- 不在组件中直接访问 Prisma。
- 涉及 API 响应结构时先查 `src/types/` 和对应 route。

## Mock 数据

仍存在：

- `src/data/mockProjects.ts`
- `src/data/mockStoryboard.ts`

运行时应优先使用 API 数据。首页展示可以继续使用静态演示数据，但业务数据不要重新依赖 mock。

## 2026-06-06 对话触发视频生成

- `AssistantPanel` 支持快捷指令“开始生成视频”“生成视频”“开始生成画面”“开始生成素材”“开始渲染视频”等。
- 这些指令不会进入后端意图模型，而是在前端追加本地助手气泡，并通过 `WorkspaceContent -> EditorCanvas -> StoryboardTimeline` 的 `videoGenerationRequestKey` 触发时间线现有 `AI 生成` 队列。
- 触发后的行为等同于点击时间线里的 `AI 生成`：先补齐分镜画面或 HTML 动画，再补齐旁白音频；已成功的素材会跳过。
- 分镜大纲结果气泡会显示提示，告知用户既可以点击 `AI 生成`，也可以直接在对话里输入“开始生成视频”。

## 2026-06-06 MP4 导出入口

- `EditorToolbar` 顶部右侧提供 `导出 MP4` 按钮。
- `EditorCanvas` 调用 `POST /api/projects/[projectId]/exports`，导出期间显示 `导出中`，成功后显示 `下载 MP4` 链接。
- 当前导出入口依赖 active Agent 分镜版本；没有 active storyboard 时按钮禁用。
- 当前后端导出只支持 `slideshow` 图片轮播项目，`html-animation` 项目会显示后端返回的暂不支持提示。

## 2026-06-06 MP4 导出交互修正

- 导出请求会把当前顶部字幕开关作为 `includeSubtitles` 传给后端；字幕开启时导出文件烧录字幕，关闭时不烧录。
- 导出 MP4 时，后端会对每张分镜图片裁掉右侧和底部约 10% 后再铺满 16:9，去除供应商常见的右下角 `AI generated` 水印；裁切发生在字幕烧录前，不会切掉后续字幕。后续图片生成提示词也会明确禁止水印、Logo、签名和角标。
- 导出成功后，`EditorCanvas` 会自动创建临时下载链接并触发浏览器下载，同时保留 `下载 MP4` 链接用于再次下载。
- 导出失败时不再只把错误挤在顶部工具栏，而是弹出 `无法导出 MP4` 说明弹窗，展示后端错误和可操作处理建议；前端会先按文本读取导出响应并安全解析 JSON，普通字符串、空响应或非 JSON 错误都会转成弹窗错误，不再通过 `Error.message` 二次 `JSON.parse` 传递错误信息。
- 工作区加载项目列表时会兼容空响应或非 JSON 响应，转为可重试的加载错误提示，避免开发服务临时返回异常内容时把 `/workspace` 页面打崩。

## 2026-06-06 图片轮播和 HTML 动画预览隔离

- `StoryboardTimeline` 在把 Agent 分镜转换为 `StoryboardFrame` 时按项目模式过滤视觉素材：图片轮播模式只暴露 `generation.image` 给主预览、底部缩略图和分镜详情；HTML 动画模式只暴露 `generation.html` 给这些 UI。
- 即使历史分镜数据里同时残留图片和 HTML 生成结果，`VideoPreview` 也只会收到当前模式对应的 URL，避免图片轮播预览继续显示 HTML iframe。
- 生成和重新生成入口仍按当前项目 `mode` 决定请求 `image` 或 `html`，旁白音频逻辑不变。
