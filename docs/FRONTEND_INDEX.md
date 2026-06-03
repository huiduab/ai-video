# 前端索引

## 页面

| 页面 | 文件 | 说明 |
| --- | --- | --- |
| `/` | `src/app/page.tsx` | 首页 |
| `/create` | `src/app/create/page.tsx` | 创建项目 loading 页 |
| `/workspace` | `src/app/workspace/page.tsx` | 主工作区 |

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
      -> PATCH edited generated script
      -> GET/PATCH project htmlAnimationStyleId
      -> notify workspace to refresh StoryboardTimeline when generatedScript changes
```

## 分镜画面生成

- `StoryboardTimeline` 的主按钮会在 `AI 生成` 和 `中断生成` 之间切换。
- 分镜生成操作区在时间轴面板顶部左侧显示，右侧只保留总时长等汇总信息。
- 点击 `AI 生成` 后按当前 active 分镜版本顺序生成画面；已保存为 `succeeded` 的分镜会跳过，再次点击会从未生成处继续。
- 生成过程中会记录当前分镜序号，时间线对应分镜缩略图和分镜详情预览上方都会显示加载动画。
- 点击 `AI 生成` 后会按分镜顺序先生成画面，再调用同一素材接口生成该分镜旁白音频；已成功的画面或音频会跳过，未完成的部分会继续补齐。
- `AI 生成` 的资产队列把画面和旁白都作为分镜素材处理：会先补齐所有分镜画面或 HTML 动画，再补齐旁白音频。生成旁白时，当前分镜会立即标记为 `旁白生成中`，完成后写回本地音频 URL；旁白失败时显示可重试状态，但不会阻塞后续分镜画面或 HTML 动画生成，再次点击 `AI 生成` 会继续补齐。
- HTML 动画模式下，点击 `AI 生成` 会先按分镜顺序生成所有本地 HTML 动画文件，再调用同一素材接口补齐分镜旁白音频；已成功的 HTML 或音频会跳过，未完成的部分会继续补齐。
- HTML 动画生成结果保存在 `scene.generation.html`，`url` 指向本地 HTML 文件，主预览、时间线缩略图和分镜详情弹窗都会通过 sandbox iframe 展示该动画。
- HTML 动画生成失败时，后端会把 `scene.generation.html.status` 写为 `failed` 并保留错误文本；刷新页面后时间线和分镜详情会显示“生成失败”，再次点击 `AI 生成` 会从失败或未完成的分镜继续补齐。
- AI 助手输入区提供绿色魔法棒风格按钮，点击后弹出居中的 HTML 动画风格大卡片；卡片展示风格提示词和 iframe 示例。风格规则维护在 `src/config/html-animation-styles/styles.json`，示例 HTML 维护在 `public/html-animation-styles/`。选择风格后写入当前项目 `metadata.htmlAnimationStyleId` 并自动关闭弹窗，后续脚本生成和 HTML 动画生成都会附加该风格；未选择或旧项目保存了已删除风格时，默认使用 `tech-flow` 酷炫黑金数据流风格。
- 声音生成结果保存在 `scene.generation.audio`，音频完成后由 `audio.durationMs` 驱动该分镜时长。
- 所有播放和汇总时长统一按 `scene.generation.audio.durationMs ?? 3000` 计算；没有旁白音频的分镜默认展示 3 秒。
- 分镜小卡片右上角显示喇叭图标：有 `audio.url` 时为蓝色并可点击播放；没有音频时为灰色禁用。
- 已生成图片或 HTML 动画会同步显示在 `VideoPreview`、时间轴缩略图和分镜详情卡片中。
- `VideoPreview` 中左上角的分镜介绍卡片只在画面尚未生成时显示；分镜图片生成后，预览画面只保留播放控件和字幕等视频层。
- `VideoPreview` 接收当前 active 分镜列表，点击预览底部进度条左侧播放按钮会从第一个分镜开始播放图片轮播；底部时间显示为当前播放进度和视频总时长，例如 `00:32 / 01:34`。
- `VideoPreview` 播放总视频时会按当前播放头所在分镜切换 `frame.audioUrl`，让已生成旁白音频随图片轮播连续播放；单段旁白按钮仍由时间轴独立播放。
- 播放器底部进度条可随时拖动；点击下方分镜卡片会把播放头跳到该分镜开始位置并暂停，再点击播放会从当前播放头继续。
- 播放器支持点击画面区域播放/暂停、底部音量滑块调整旁白音量、底部全屏按钮进入或退出浏览器全屏；顶部工具栏不再重复显示音量滑块和全屏按钮。
- 分镜时长优先使用对应旁白音频长度，没有音频时回退到 3 秒；旧数据缺失 `audio.durationMs` 时，`StoryboardTimeline` 会在浏览器端读取音频 metadata，重算预览总时长、底部分镜卡片时长和左侧项目列表当前项目时长。
- 旧数据里的 `generation.image`、`generation.html` 或 `generation.audio` 如果指向已不存在的 `/generated/...` 本地文件，`StoryboardTimeline` 加载时会校验 URL，将该素材临时标记为失败并清空 URL，避免继续显示“已生成”但加载 404；再次点击 `AI 生成` 会补齐缺失素材。后端读取分镜和生成素材时也会校正缺失文件；音频文件还必须满足最小可播放大小，避免 2 bytes 文本响应被当成成功旁白。
- 每两个分镜之间会额外插入 1 秒气口并计入视频总时长；气口期间 `VideoPreview` 保持显示上一分镜画面，不显示字幕，也不提前播放下一分镜音频。
- `VideoPreview` 会把当前分镜旁白按中英文句末标点拆成短句，再优先按逗号、顿号、空格和浏览器中文分词组合成不超过 16 个有效字符的字幕片段，尽量避免把词切到两个字幕里。
- 每条字幕最多 1 行，显示在预览画面靠近底部的居中位置；只在播放中、非气口、字幕开关开启时显示，并按“当前字幕有效字数 / 当前分镜旁白有效总字数 * 当前分镜时长”分配展示时间。
- 播放过程中按每个分镜的 `playbackEffect` 执行图片运动、叠化/淡入淡出/滑动等转场和可选画面处理；缺失或非法配置会回退到慢速推进和叠化。
- 点击 `AI 生成` 完成画面和旁白后，工作区会刷新左侧项目列表；项目卡片名称使用 Agent 脚本标题，封面使用首个已生成分镜图片，总时长使用全部分镜音频时长相加，缺失音频按 3 秒计算。
- AI 助手生成新脚本或保存脚本编辑后，会通过工作区父组件刷新 `StoryboardTimeline`，让中间预览和底部分镜立即同步 active generated storyboard。
- 双击时间轴分镜卡片会打开全部分镜卡片，并自动定位到对应分镜详情；详情弹窗关闭按钮固定在弹窗右上角。

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
