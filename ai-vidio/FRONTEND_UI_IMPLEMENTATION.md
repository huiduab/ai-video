# MotionWeave AI 前端 UI 编写文档

## 1. 项目目标

本项目开发一个 AI 制作视频的网站，产品名为 `MotionWeave AI`。本轮只完成前端 UI，不实现真实视频生成、AI 推理、文件上传处理、导出渲染、支付、登录注册等后端或业务逻辑。

前端需要完整呈现两类创作模式：

- 图片轮播模式：用户通过多张分镜图片、时长、顺序和转场组织成视频。
- HTML 动画视频模式：用户通过 HTML/CSS/动画模板或代码化场景生成动画视频。

设计参考包含两类核心界面：

- 官网首页：品牌展示、产品价值、两种创作模式介绍、工作流说明、客户信任与页脚。
- 工作台：项目列表、视频预览、模式切换、分镜时间轴、AI 助手对话与生成进度。

技术栈使用 Next.js。建议使用 App Router、TypeScript、Tailwind CSS、lucide-react 图标库。

## 2. 技术栈建议

### 2.1 基础框架

- Next.js 15 或当前稳定版本
- React 19 或当前 Next.js 默认版本
- TypeScript
- Tailwind CSS
- App Router

### 2.2 UI 与工具库

- `lucide-react`：图标库，覆盖导航、播放、下载、设置、全屏、字幕、语言、通知等图标。
- `clsx` 或 `class-variance-authority`：处理组件状态样式。
- `tailwind-merge`：合并 Tailwind 类名。
- 可选 `framer-motion`：仅用于轻量 UI 动效，如卡片 hover、模式切换淡入，不实现视频动画逻辑。

### 2.3 推荐目录结构

```txt
src/
  app/
    layout.tsx
    page.tsx
    workspace/
      page.tsx
    globals.css
  components/
    common/
      Button.tsx
      IconButton.tsx
      Logo.tsx
      ModeSwitch.tsx
      VideoPreview.tsx
    landing/
      LandingHeader.tsx
      HeroSection.tsx
      ConceptCards.tsx
      WorkflowSection.tsx
      TrustLogos.tsx
      LandingFooter.tsx
    workspace/
      WorkspaceHeader.tsx
      ProjectSidebar.tsx
      EditorCanvas.tsx
      StoryboardTimeline.tsx
      AssistantPanel.tsx
      GenerationActivity.tsx
      HtmlAnimationPanel.tsx
  data/
    mockProjects.ts
    mockStoryboard.ts
    mockAssistant.ts
  lib/
    cn.ts
  types/
    project.ts
    storyboard.ts
```

## 3. 页面路由规划

### 3.1 官网首页

路径：`/`

目标：

- 展示品牌与产品定位。
- 明确引导用户开始创作。
- 展示两种核心创作模式。
- 说明从创意到成片的基础流程。

主要模块：

- 顶部导航
- Hero 首屏
- 设计理念与模式卡片
- 工作流演示
- 信任品牌区域
- 页脚

### 3.2 工作台

路径：`/workspace`

目标：

- 模拟用户进入创作环境后的主界面。
- 提供模式切换：图片轮播模式、HTML 动画模式。
- 展示项目列表、视频预览、分镜时间轴、AI 助手面板。
- 所有操作仅做 UI 状态反馈，不调用真实生成逻辑。

主要模块：

- 顶部工作台导航
- 左侧项目列表
- 中间编辑区
- 右侧 AI 助手
- 分镜时间轴或 HTML 动画编辑面板

## 4. 视觉规范

### 4.1 整体风格

整体风格应保持干净、专业、偏 SaaS 工具感。界面重点是清晰的信息层级和可操作性，不做过度营销式装饰。

关键词：

- 清爽
- 科技感
- 高对比但不刺眼
- 留白充足
- 工具界面信息密度适中

### 4.2 主色与辅助色

建议颜色：

```css
:root {
  --color-primary: #1554ff;
  --color-primary-dark: #0f3fd4;
  --color-bg: #f6f8fe;
  --color-surface: #ffffff;
  --color-surface-soft: #eef4ff;
  --color-border: #dbe3f5;
  --color-text: #0f172a;
  --color-muted: #64748b;
  --color-success: #16a34a;
  --color-cyan: #5eead4;
}
```

注意：

- 蓝色是主操作色，用于 CTA、选中态、进度条、重点图标。
- 浅蓝背景用于卡片或工作台选中状态。
- 绿色只用于完成状态。
- 不要让页面变成单一蓝色调，需要用白色、浅灰、青绿色、深色预览图形成层次。

### 4.3 字体

中文环境建议：

```css
font-family:
  Inter,
  "PingFang SC",
  "Microsoft YaHei",
  system-ui,
  sans-serif;
```

字号建议：

- Hero 标题：48px 左右，移动端 36px。
- 页面大标题：28px 到 32px。
- 模块标题：20px 到 24px。
- 正文：14px 到 16px。
- 辅助说明：12px 到 13px。

### 4.4 圆角与阴影

- 普通按钮：999px 或 12px，按设计图可使用胶囊按钮。
- 卡片：8px 到 14px，工作台卡片建议 12px。
- 视频预览：12px。
- 阴影保持轻量，避免大面积厚重阴影。

## 5. 首页 UI 编写说明

### 5.1 顶部导航

组件：`LandingHeader`

布局：

- 左侧：Logo + `MotionWeave AI`
- 中间：导航项
  - 首页
  - 功能
  - 解决方案
  - 模板中心
  - 定价
  - 帮助中心
- 右侧：
  - 语言选择：简体中文
  - 开始创作按钮

交互：

- 当前页导航项显示蓝色文字和底部细线。
- 点击“开始创作”跳转 `/workspace`。
- 本轮语言选择仅展示，不实现切换逻辑。

### 5.2 Hero 首屏

组件：`HeroSection`

左侧内容：

- 标签：`AI 驱动 · 专业级视频生成`
- 标题：
  - 第一行：让创意流动，
  - 第二行：让视频更出色
- 描述文案：说明 MotionWeave AI 可通过智能生成与模块化工作流，将故事、分镜、脚本转化为视频。
- 按钮：
  - 主按钮：开始创作
  - 次按钮：观看演示

右侧内容：

- 使用一张静态视觉预览卡片。
- 卡片内放置模拟 3D 视频设备图或渐变科技感预览图。
- 中心使用播放按钮图标。

实现边界：

- 播放按钮点击后只改变按钮状态或弹出占位提示。
- 不播放真实视频。

### 5.3 设计理念与创作模式

组件：`ConceptCards`

布局为三列卡片：

1. 设计理念卡片
   - 标题：我们的设计理念
   - 副标题：以人为本 · AI 增强 · 控制在你手中
   - 四个理念点：
     - 化繁为简
     - 可控可调
     - 模块化生成
     - AI 辅助创意

2. 图片轮播模式卡片
   - 标题：图片轮播模式
   - 英文说明：Image Slideshow Mode
   - 描述：AI 生成分镜图片，通过播放与平移营造动画感。
   - 图标：图片图标
   - 右下角：箭头按钮

3. HTML 动画模式卡片
   - 标题：HTML动画模式
   - 英文说明：HTML Animation Mode
   - 描述：AI 基于分镜镜头生成 HTML 动画，再组合成完整视频。
   - 图标：代码图标
   - 右下角：箭头按钮

响应式：

- 桌面端三列。
- 平板端两列。
- 移动端单列。

### 5.4 工作流演示

组件：`WorkflowSection`

顶部：

- 标题：从分镜到成片，只需简单几步
- 右侧链接：查看工作流演示

步骤条：

1. 输入创意
2. AI 生成分镜
3. 编辑与调整
4. 生成视频
5. 导出与分享

下方左侧：分镜示例

- 展示 5 张分镜缩略图。
- 每张图显示序号和标题。
- 使用本地 mock 图片或 CSS 背景占位。

下方右侧：成片预览

- 视频预览卡片。
- 中心播放按钮。
- 底部模拟控制条。

实现边界：

- 分镜图片使用静态 mock 数据。
- 视频控件是 UI，不接入真实播放器。

### 5.5 信任品牌与页脚

组件：

- `TrustLogos`
- `LandingFooter`

信任品牌：

- 文案：被全球创意团队信赖
- 品牌名示例：
  - PIXORA
  - VisionFlow
  - Nebula Studio
  - CraftVision
  - FRAMEWORKS

页脚：

- 左侧 Logo
- 中间链接：
  - 隐私政策
  - 服务条款
  - 联系我们
  - 文档中心
- 右侧版权：`© 2024 MotionWeave AI. 保留所有权利。`

## 6. 工作台 UI 编写说明

### 6.1 工作台整体布局

组件：`WorkspacePage`

桌面端布局：

```txt
┌──────────────────────────────────────────────┐
│ WorkspaceHeader                              │
├──────────────┬────────────────┬──────────────┤
│ ProjectSidebar│ EditorCanvas   │ AssistantPanel│
│              │ Timeline/Panel │              │
└──────────────┴────────────────┴──────────────┘
```

建议尺寸：

- 顶部高度：80px
- 左侧栏宽度：300px 到 340px
- 右侧 AI 面板宽度：360px 到 420px
- 中间区域自适应

移动端：

- 可先实现为横向滚动或将左侧栏、右侧栏折叠。
- 本轮优先保证桌面端还原度。

### 6.2 顶部工作台导航

组件：`WorkspaceHeader`

内容：

- 左侧 Logo + `MotionWeave AI`
- 中间导航：
  - 工作台
  - 模板中心
  - 素材库
  - 解决方案
  - 帮助中心
- 右侧：
  - 语言
  - 通知图标
  - 用户头像 `MW`

交互：

- 当前导航 `工作台` 高亮。
- 通知和头像仅展示。

### 6.3 左侧项目列表

组件：`ProjectSidebar`

内容：

- 标题：我的项目
- 新建项目按钮
- 排序选择：最近编辑
- 搜索按钮
- 项目列表
- 底部回收站入口

项目卡片字段：

```ts
type ProjectMode = "slideshow" | "html-animation";

interface ProjectItem {
  id: string;
  title: string;
  mode: ProjectMode;
  updatedAt: string;
  duration: string;
  thumbnail: string;
}
```

项目示例：

- 星际探险：新纪元，图片轮播，00:30
- 未来之城：黎明，HTML动画，00:45
- 产品发布会开场，图片轮播，00:28

交互：

- 点击项目后高亮选中。
- 只更新本地 React state，不请求接口。

### 6.4 中间编辑区顶部工具条

组件：`EditorToolbar`

内容：

- 模式切换：
  - 图片轮播模式
  - HTML动画模式
- 字幕按钮
- 全屏按钮
- 导出视频按钮

交互：

- 模式切换影响中间下方面板显示。
- 点击导出视频只显示下拉样式或 toast 占位状态。
- 字幕、全屏按钮仅做选中态或 hover。

状态建议：

```ts
const [activeMode, setActiveMode] = useState<"slideshow" | "html-animation">("slideshow");
```

### 6.5 视频预览区域

组件：`VideoPreview`

内容：

- 大图预览。
- 中心播放按钮。
- 底部模拟播放器控制：
  - 播放图标
  - 当前时间 / 总时长
  - 进度条
  - 音量
  - 设置
  - 全屏

实现边界：

- 不使用真实 video 标签也可以。
- 可以使用 div + 图片背景 + 控制条模拟。
- 点击播放按钮时切换 `isPlaying` 状态，改变图标即可。

### 6.6 图片轮播模式时间轴

组件：`StoryboardTimeline`

内容：

- 标题：分镜时间轴
- 说明：点击分镜可精确修改时长片段
- 操作按钮：
  - 添加分镜
  - 调整顺序
- 总时长：00:30
- 分镜卡片横向滚动列表
- 底部时间刻度

分镜数据结构：

```ts
interface StoryboardFrame {
  id: string;
  index: number;
  title: string;
  duration: string;
  thumbnail: string;
  startTime: string;
}
```

示例分镜：

- 开场：星球全景，00:04
- 航行：穿越云层，00:06
- 降落：未来都市，00:06

交互：

- 点击分镜卡片后显示蓝色边框。
- 添加分镜按钮仅追加一条 mock 分镜。
- 调整顺序按钮可以只显示选中态，不需要实现拖拽。

### 6.7 HTML 动画模式面板

组件：`HtmlAnimationPanel`

该面板用于展示第二种创作模式的 UI，替代图片轮播时间轴。

建议内容：

- 左侧：动画场景列表
  - 场景 1：Logo 入场
  - 场景 2：标题文字动效
  - 场景 3：图形路径运动
  - 场景 4：数据卡片浮现
- 中间：代码/结构预览卡片
  - 显示伪代码或 HTML 片段占位
  - 标签：HTML / CSS / Keyframes
- 右侧：动画参数
  - 时长
  - 缓动曲线
  - 背景色
  - 文字进入方式

实现边界：

- 不执行用户 HTML。
- 不使用 iframe 渲染真实动画。
- 只展示 UI 状态和静态代码块。

### 6.8 AI 助手面板

组件：`AssistantPanel`

结构：

- 顶部标题：AI 助手
- 刷新按钮
- 用户消息气泡
- AI 回复卡片
- 生成活动时间线
- 底部输入框

用户消息示例：

```txt
想要制作一个关于未来星际探索的宣传视频，时长 30 秒，风格科幻，史诗感。
```

AI 回复卡片：

- 标题：已生成视频大纲
- 内容：
  1. 开场：星球全景，宇宙深邃
  2. 航行：飞船穿越云层，前往未知星系
  3. 降落：未来都市，科技感建筑群
  4. 探索：探索高科技通道遗迹
  5. 结尾：希望之光，展望未来
- 按钮：查看大纲详情

生成活动示例：

- 生成分镜图像 (5/5)
- 合成视频中... 进度：80%
- 视频已生成完成！

输入框：

- placeholder：告诉 AI 你的想法，或输入 / 选择指令
- 字数统计：0/1000
- 附件按钮
- 魔法棒按钮
- 发送按钮

实现边界：

- 输入内容不发送到后端。
- 点击发送后可把用户输入追加到本地消息列表。
- 生成进度固定展示或用前端定时器模拟。

## 7. Mock 数据设计

### 7.1 项目数据

```ts
export const mockProjects = [
  {
    id: "p1",
    title: "星际探险：新纪元",
    mode: "slideshow",
    updatedAt: "今天 14:20",
    duration: "00:30",
    thumbnail: "/images/project-space-1.jpg",
  },
  {
    id: "p2",
    title: "未来之城：黎明",
    mode: "html-animation",
    updatedAt: "今天 11:45",
    duration: "00:45",
    thumbnail: "/images/project-city-1.jpg",
  },
  {
    id: "p3",
    title: "产品发布会开场",
    mode: "slideshow",
    updatedAt: "今天 10:20",
    duration: "00:28",
    thumbnail: "/images/project-launch-1.jpg",
  },
];
```

### 7.2 分镜数据

```ts
export const mockStoryboard = [
  {
    id: "s1",
    index: 1,
    title: "开场：星球全景",
    duration: "00:04",
    startTime: "00:00",
    thumbnail: "/images/storyboard-1.jpg",
  },
  {
    id: "s2",
    index: 2,
    title: "航行：穿越云层",
    duration: "00:06",
    startTime: "00:06",
    thumbnail: "/images/storyboard-2.jpg",
  },
  {
    id: "s3",
    index: 3,
    title: "降落：未来都市",
    duration: "00:06",
    startTime: "00:12",
    thumbnail: "/images/storyboard-3.jpg",
  },
];
```

### 7.3 资源图片策略

本轮可以采用以下方式之一：

- 使用 `public/images/` 中的静态示例图。
- 使用 CSS 渐变和半透明遮罩模拟预览图。
- 使用远程占位图片，但正式实现建议落成本地静态图，减少网络依赖。

建议最少准备：

- 首页 Hero 预览图 1 张
- 工作台主预览图 1 张
- 项目缩略图 3 张
- 分镜缩略图 5 张

## 8. 组件状态与交互清单

本轮需要实现的前端状态：

- 首页“开始创作”跳转工作台。
- 工作台项目选中状态。
- 创作模式切换状态。
- 视频播放按钮切换状态。
- 分镜选中状态。
- 添加分镜的 mock 追加效果。
- AI 输入框内容状态。
- 点击发送后追加用户消息。

本轮不实现：

- 登录注册
- 真实 AI 生成
- 图片上传
- 视频导出
- 后端 API
- 数据持久化
- 支付订阅
- 多语言真实切换
- 真实 HTML 动画渲染与视频合成

## 9. 响应式要求

### 9.1 首页

桌面端：

- 最大内容宽度建议 1200px。
- Hero 左右两列。
- 模式卡片三列。
- 工作流区域保持左右分栏。

平板端：

- Hero 可上下堆叠。
- 模式卡片两列。
- 工作流预览上下排列。

移动端：

- 顶部导航隐藏中间菜单，只保留 Logo 和 CTA 或菜单按钮。
- Hero 单列。
- 卡片单列。
- 工作流步骤改为纵向。

### 9.2 工作台

桌面端优先：

- 保持三栏结构。
- 中间视频区域不能被挤压过小。
- 分镜列表支持横向滚动。

小屏处理：

- 左侧项目栏可以变为顶部抽屉入口。
- 右侧 AI 助手可以变为底部抽屉或标签页。
- 本轮如时间有限，可仅保证 1440px 以上桌面端高保真。

## 10. 可访问性要求

- 所有按钮必须有明确文字或 `aria-label`。
- 图标按钮必须提供 `title` 或 `aria-label`。
- 交互元素需要可聚焦状态。
- 文本与背景对比度保持清晰。
- 不用仅靠颜色表达状态，选中项同时使用边框、背景或图标。

## 11. Tailwind 编写约定

### 11.1 基础布局

建议在 `globals.css` 中加入：

```css
html {
  scroll-behavior: smooth;
}

body {
  background: #f6f8fe;
  color: #0f172a;
}
```

### 11.2 通用容器

```tsx
<main className="mx-auto w-full max-w-[1200px] px-6">
  {children}
</main>
```

### 11.3 通用按钮

按钮建议抽象为：

- `variant="primary"`
- `variant="secondary"`
- `variant="ghost"`
- `size="sm" | "md" | "lg"`

不要在页面里重复手写大量按钮类名。

## 12. 开发步骤建议

### 第一步：初始化项目

```bash
npx create-next-app@latest motionweave-ai --typescript --tailwind --eslint --app --src-dir
```

安装图标库：

```bash
npm install lucide-react clsx tailwind-merge
```

### 第二步：建立基础结构

- 配置全局字体、背景色、基础样式。
- 创建 `cn` 工具函数。
- 创建 Logo、Button、IconButton 等基础组件。

### 第三步：首页

按以下顺序实现：

1. `LandingHeader`
2. `HeroSection`
3. `ConceptCards`
4. `WorkflowSection`
5. `TrustLogos`
6. `LandingFooter`

完成后检查：

- 首页在 1440px 宽度接近设计图。
- CTA 可跳转工作台。
- 卡片间距、边框、背景一致。

### 第四步：工作台布局

按以下顺序实现：

1. `WorkspaceHeader`
2. `ProjectSidebar`
3. `EditorToolbar`
4. `VideoPreview`
5. `StoryboardTimeline`
6. `AssistantPanel`

完成后检查：

- 三栏布局稳定。
- 中间视频预览区域比例正确。
- 分镜时间轴横向滚动不撑破页面。

### 第五步：HTML 动画模式

实现 `HtmlAnimationPanel`。

要求：

- 点击顶部 `HTML动画模式` 后显示该面板。
- 保留视频预览区域。
- 下方内容从分镜时间轴切换为 HTML 动画场景和参数面板。

### 第六步：交互补齐

实现以下 UI 状态：

- 项目选中
- 模式切换
- 播放按钮切换
- 分镜选中
- 添加分镜
- AI 消息输入与追加

## 13. 验收标准

### 13.1 首页验收

- 页面包含完整导航、Hero、模式卡片、工作流、信任品牌、页脚。
- 品牌名、主标题、按钮文案与设计一致。
- 两种创作模式清晰展示。
- 点击开始创作可进入 `/workspace`。

### 13.2 工作台验收

- 页面包含顶部导航、项目侧栏、中间编辑区、右侧 AI 助手。
- 支持图片轮播模式与 HTML 动画模式切换。
- 图片轮播模式展示分镜时间轴。
- HTML 动画模式展示动画场景、代码预览、参数设置。
- AI 助手区域展示用户消息、AI 大纲、生成进度、输入框。
- 所有交互均为前端状态，不依赖后端。

### 13.3 代码验收

- TypeScript 无明显类型错误。
- 组件拆分清晰，不把所有 UI 写在单个页面文件中。
- mock 数据与组件分离。
- 图标统一使用 `lucide-react`。
- 样式无明显重叠、溢出、文字挤压。

## 14. 后续扩展预留

虽然本轮不实现真实逻辑，但建议保留以下扩展点：

- `ProjectItem.mode` 用于后续区分渲染流程。
- `StoryboardFrame` 用于后续接入图片生成结果。
- `AssistantMessage` 用于后续接入 AI 对话接口。
- `GenerationActivity` 用于后续接入任务状态轮询。
- `ExportVideoButton` 用于后续接入导出任务。

后续真实业务可分阶段接入：

1. 用户项目持久化
2. 图片生成接口
3. HTML 动画代码生成
4. 分镜编辑与排序
5. 视频合成任务
6. 导出与下载
7. 模板中心与素材库

## 15. 页面文案汇总

### 首页核心文案

- MotionWeave AI
- 让创意流动，让视频更出色
- AI 驱动 · 专业级视频生成
- MotionWeave AI 通过智能生成与模块化工作流，将你的故事从分镜脚本无缝转化为惊艳视频。
- 开始创作
- 观看演示
- 我们的设计理念
- 图片轮播模式
- HTML动画模式
- 从分镜到成片，只需简单几步

### 工作台核心文案

- 我的项目
- 新建项目
- 最近编辑
- 图片轮播模式
- HTML动画模式
- 字幕
- 全屏
- 导出视频
- 分镜时间轴
- 添加分镜
- 调整顺序
- AI 助手
- 告诉 AI 你的想法，或输入 / 选择指令

