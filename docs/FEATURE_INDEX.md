# 功能索引

## 首页和创建

| 功能 | 入口 | 关键文件 |
| --- | --- | --- |
| 首页展示 | `/` | `src/app/page.tsx`, `src/components/landing/*` |
| 选择图片轮播模式 | 首页模式卡片 | `src/components/landing/ConceptCards.tsx` |
| 选择 HTML 动画模式 | 首页模式卡片 | `src/components/landing/ConceptCards.tsx` |
| 创建项目 loading | `/create?mode=...` | `src/app/create/page.tsx` |
| 创建项目 API | `POST /api/projects` | `src/app/api/projects/route.ts` |

## 工作区

| 功能 | 入口 | 关键文件 |
| --- | --- | --- |
| 工作区页面 | `/workspace?projectId=...` | `src/app/workspace/page.tsx` |
| 顶部工具栏 | 工作区顶部 | `WorkspaceHeader.tsx`, `EditorToolbar.tsx` |
| 项目列表 | 左侧栏 | `ProjectSidebar.tsx` |
| 视频预览 | 中央预览区 | `EditorCanvas.tsx`, `VideoPreview.tsx` |
| 分镜时间线 | 底部面板 | `StoryboardTimeline.tsx`, `TimelinePanel.tsx` |
| HTML 动画面板 | 模式切换后 | `HtmlAnimationPanel.tsx` |
| AI 助手 | 右侧栏 | `AssistantPanel.tsx` |

## Agent

| 功能 | API/入口 | 关键文件 |
| --- | --- | --- |
| 加载聊天历史 | `GET /api/projects/[projectId]/agent/messages` | Agent messages route |
| 发送用户提示词 | `POST /api/projects/[projectId]/agent/messages` | Agent messages route |
| 保存脚本编辑 | `PATCH /api/projects/[projectId]/agent/messages` | Agent messages route |
| 获取生成分镜版本 | `GET /api/projects/[projectId]/agent/storyboards` | Agent storyboards route |
| 切换 active 分镜版本 | `PATCH /api/projects/[projectId]/agent/storyboards` | Agent storyboards route |

## 数据持久化

| 功能 | 表/字段 | 说明 |
| --- | --- | --- |
| 项目 | `projects` | 标题、模式、状态、时长、metadata |
| 默认分镜 | `storyboard_scenes` | 项目初始化时创建的基础分镜 |
| 时间线 | `timeline_tracks`, `timeline_clips` | 轨道和片段 |
| Agent 消息 | `agent_messages` | 用户/助手消息、意图、结构化 JSON |
| 当前生成分镜 | `projects.metadata.activeGeneratedStoryboardMessageId` | 指向某条包含 `generatedScript` 的 Agent 消息 |
