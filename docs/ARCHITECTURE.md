# 架构索引

## 系统分层

```text
Next.js App Router
  pages: landing / create / workspace
  api: projects / storyboard / agent
React components
  landing components
  workspace components
Domain helpers
  project mappers
  agent prompts, validators, display builders
Persistence
  Prisma Client
  PostgreSQL
```

## 主流程

```text
/ -> /create?mode=slideshow|html-animation
  -> POST /api/projects
  -> /workspace?projectId=...
  -> GET project list/detail
  -> AssistantPanel sends prompt
  -> Agent API stores user message
  -> model intent analysis
  -> optional script/storyboard generation
  -> stores assistant message
  -> workspace reads active generated storyboard
```

## 主要模块

| 模块 | 代码路径 | 说明 |
| --- | --- | --- |
| 首页 | `src/app/page.tsx`, `src/components/landing/` | 品牌展示和创作模式入口 |
| 创建页 | `src/app/create/page.tsx` | 根据 URL mode 创建项目并跳转工作区 |
| 工作区 | `src/app/workspace/page.tsx`, `src/components/workspace/` | 项目列表、预览、时间线、AI 助手 |
| 项目 API | `src/app/api/projects/` | 项目、分镜、Agent 消息和生成分镜版本 |
| Agent 领域层 | `src/lib/agent/` | 提示词、OpenAI 兼容调用、JSON 校验、展示映射 |
| 类型 | `src/types/` | 前后端共享 UI/domain 类型 |
| 数据库 | `prisma/schema.prisma` | Prisma schema |

## 数据来源约定

- 项目历史来自 `GET /api/projects`。
- 项目详情来自 `GET /api/projects/[projectId]`。
- 初始数据库分镜来自 `GET /api/projects/[projectId]/storyboard`。
- 当前工作区主时间线优先来自 Agent 生成分镜：`GET /api/projects/[projectId]/agent/storyboards`。
- Agent 对话历史来自 `GET /api/projects/[projectId]/agent/messages`。

## 边界

- `src/lib/agent/` 不直接渲染 UI。
- `src/components/workspace/` 不直接访问 Prisma。
- API 层负责数据库读写、模型调用、JSON 校验和错误响应。
- UI 层负责 loading/error/empty 状态和展示映射，不绕过 API 直接读数据库。
