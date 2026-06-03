# motionweave-ai Agent Entry

## Mandatory Documentation Rule

- 每次修改代码必须同步增加或更新文档；文档改动应落在最贴近本次代码变更的索引文档、专题文档或 `docs/DEVELOPMENT_LOG.md`。

本文件是给 Codex/Agent 使用的总入口。只保留项目地图、加载顺序和进一步索引，避免一次性读入过多上下文。

## 先读顺序

1. 当前文件：确认项目边界、常用命令、文档索引。
2. [docs/README.md](docs/README.md)：查看文档目录和渐进式加载规则。
3. 按任务类型继续读取对应文档：
   - 架构、模块边界：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
   - 功能入口和代码路径：[docs/FEATURE_INDEX.md](docs/FEATURE_INDEX.md)
   - API 路由：[docs/API_INDEX.md](docs/API_INDEX.md)
   - 数据模型和 Prisma：[docs/DATA_MODEL.md](docs/DATA_MODEL.md)
   - 前端工作区和 UI：[docs/FRONTEND_INDEX.md](docs/FRONTEND_INDEX.md)
   - AI Agent 流程：[docs/AGENT_SYSTEM.md](docs/AGENT_SYSTEM.md)
   - 本地运行、验证、环境变量：[docs/OPERATIONS.md](docs/OPERATIONS.md)
4. 需要历史背景时再读取旧文档：
   - [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md)
   - [docs/POSTGRES_IMPLEMENTATION_DESIGN.md](docs/POSTGRES_IMPLEMENTATION_DESIGN.md)
   - [docs/FRONTEND_UI_IMPLEMENTATION.md](docs/FRONTEND_UI_IMPLEMENTATION.md)

## 项目概览

motionweave-ai 是一个 Next.js 15 + React 19 的 AI 视频创作工具原型。核心链路是：

```text
landing page -> create project -> workspace -> assistant -> generated script/storyboard -> active storyboard preview
```

当前实现重点：

- 首页选择创作模式，进入 `/create?mode=...` 创建项目。
- PostgreSQL + Prisma 持久化项目、分镜、时间线、素材、任务、Agent 消息。
- 工作区从数据库和 Agent 生成结果读取项目状态。
- AI Assistant 通过 OpenAI 兼容 `/chat/completions` 接口做意图识别和脚本/分镜生成。
- Agent 生成的脚本保存在 `agent_messages.intentJson.payload.generatedScript`。
- 当前工作区分镜版本由 `projects.metadata.activeGeneratedStoryboardMessageId` 指定。

## 技术栈

- Next.js App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Prisma 7
- PostgreSQL
- lucide-react

## 常用命令

```bash
npm run dev
npm run build
npm run db:push
npm run db:generate
```

注意：`package.json` 中有 `npm run lint`，但 Next.js 15 项目不一定内置 `next lint` 行为。验证优先使用 `npm run build`。

## 关键路径

```text
src/app/page.tsx
src/app/create/page.tsx
src/app/workspace/page.tsx
src/app/api/projects/
src/components/workspace/
src/lib/agent/
src/types/
prisma/schema.prisma
```

## 工作约定

- 修改代码前先按任务读取对应索引文档，不要默认通读所有历史文档。
- 涉及数据库字段时先读 [docs/DATA_MODEL.md](docs/DATA_MODEL.md) 和 `prisma/schema.prisma`。
- 涉及 Agent 行为时先读 [docs/AGENT_SYSTEM.md](docs/AGENT_SYSTEM.md) 和 `src/lib/agent/`。
- 涉及工作区 UI 时先读 [docs/FRONTEND_INDEX.md](docs/FRONTEND_INDEX.md) 和对应组件。
- 新增重要设计决策时更新最贴近的索引文档；阶段性日志写入 [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md)。
- 文档使用中文、UTF-8、Markdown；路径和命令使用代码格式。
