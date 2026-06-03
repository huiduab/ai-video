# 文档目录

本目录采用渐进式加载：先读轻量索引，再按任务进入具体文档或源码。不要把历史长文档作为默认上下文。

## 推荐加载路径

```text
AGENT.md
  -> docs/README.md
    -> one of:
       ARCHITECTURE.md
       FEATURE_INDEX.md
       API_INDEX.md
       DATA_MODEL.md
       FRONTEND_INDEX.md
       AGENT_SYSTEM.md
       OPERATIONS.md
```

## 索引文档

| 文档 | 用途 | 继续下钻 |
| --- | --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 系统结构、模块边界、数据流 | `src/app/`, `src/components/`, `src/lib/agent/` |
| [FEATURE_INDEX.md](FEATURE_INDEX.md) | 功能入口和代码路径速查 | 对应页面、组件、API |
| [API_INDEX.md](API_INDEX.md) | API 路由、请求职责、响应用途 | `src/app/api/projects/` |
| [DATA_MODEL.md](DATA_MODEL.md) | Prisma 模型和关键 JSON 字段 | `prisma/schema.prisma` |
| [FRONTEND_INDEX.md](FRONTEND_INDEX.md) | 前端页面、工作区组件、UI 数据流 | `src/components/` |
| [AGENT_SYSTEM.md](AGENT_SYSTEM.md) | AI Agent 意图识别、脚本生成、记忆、分镜版本 | `src/lib/agent/`, Agent API |
| [OPERATIONS.md](OPERATIONS.md) | 本地运行、环境变量、验证命令 | `.env.example`, `package.json` |

## 历史文档

以下文档保留历史方案和阶段记录，仅在需要背景时读取：

- [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md)
- [POSTGRES_IMPLEMENTATION_DESIGN.md](POSTGRES_IMPLEMENTATION_DESIGN.md)
- [FRONTEND_UI_IMPLEMENTATION.md](FRONTEND_UI_IMPLEMENTATION.md)

这些文件可能较长，且部分内容已被实现演进覆盖。以当前源码和索引文档为准。

## 更新规则

- 每次修改代码必须同步增加或更新文档；文档改动应落在最贴近本次代码变更的索引文档、专题文档或 `docs/DEVELOPMENT_LOG.md`。
- 新增模块：更新 [ARCHITECTURE.md](ARCHITECTURE.md) 和 [FEATURE_INDEX.md](FEATURE_INDEX.md)。
- 新增或变更 API：更新 [API_INDEX.md](API_INDEX.md)。
- 新增或变更 Prisma 字段：更新 [DATA_MODEL.md](DATA_MODEL.md)。
- 改动 Agent 行为、提示词、JSON 结构：更新 [AGENT_SYSTEM.md](AGENT_SYSTEM.md)。
- 改动工作区 UI 数据流：更新 [FRONTEND_INDEX.md](FRONTEND_INDEX.md)。
- 改动环境变量或启动命令：更新 [OPERATIONS.md](OPERATIONS.md)。
