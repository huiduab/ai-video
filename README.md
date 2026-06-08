# motionweave-ai

motionweave-ai 是一个基于 Next.js 15、React 19、Prisma 和 PostgreSQL 的 AI 视频创作工具原型。核心流程是从首页选择创作模式，创建项目，进入工作区，通过 AI Assistant 生成脚本、分镜、画面素材、HTML 动画和旁白音频，并在工作区预览和导出。

## 功能概览

- 首页选择创作模式，进入 `/create?mode=...` 创建项目。
- 工作区管理项目列表、预览、分镜时间线和 AI 对话。
- AI Agent 支持意图识别、脚本生成、分镜生成、局部分镜增删改。
- 图片轮播模式支持 OpenAI 兼容 `/images/generations` 生图。
- HTML 动画模式支持按分镜生成单文件 16:9 HTML 动画。
- 旁白音频通过 OpenAI 兼容 TTS 接口生成并保存到本地素材目录。
- MP4 导出当前支持图片轮播项目，依赖本机 `ffmpeg` / `ffprobe`。

## 技术栈

- Next.js App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Prisma 7
- PostgreSQL
- lucide-react

## 本地启动

安装依赖：

```bash
npm install
```

复制环境变量示例并填写真实值：

```bash
cp .env.example .env.local
```

同步数据库：

```bash
npm run db:push
npm run db:generate
```

启动开发服务：

```bash
npm run dev
```

默认访问：

```text
http://localhost:3000
```

## 环境变量

主要配置集中在 `.env.example`，本地真实配置写入 `.env.local`。

关键变量：

- `DATABASE_URL`：PostgreSQL 连接字符串。
- `DIRECT_DATABASE_URL`：迁移或直连数据库时使用，可与 `DATABASE_URL` 相同。
- `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL`：意图识别和通用 OpenAI 兼容模型配置。
- `DIRECTOR_*`：基础脚本、逐字稿、分镜和统一风格摘要生成模型。
- `HTML_LAYOUT_*`：HTML 动画分镜编排模型。
- `HTML_*`：单镜头 HTML 动画执行模型。
- `IMAGE_*`：图片轮播分镜生图模型，默认面向 OpenAI 官方 `gpt-image-1`。
- `AI_TTS_*`：旁白音频生成配置。

不要提交 `.env.local`、日志或运行时生成素材。仓库 `.gitignore` 已忽略 `.env.local`、`logs/`、`.next/` 和 `public/generated/`。

## 常用命令

```bash
npm run dev
npm run build
npm run db:push
npm run db:generate
```

说明：

- `npm run build` 是主要验证命令。
- `npm run lint` 在 `package.json` 中存在，但 Next.js 15 项目不一定内置 `next lint` 行为。
- 如果运行 `npm run build` 后继续使用已启动的 `next dev`，建议重启开发服务，避免 `.next` 被生产构建覆盖后导致 dev CSS 失效。

## 项目结构

```text
src/app/                      Next.js 页面和 API 路由
src/app/api/projects/         项目、分镜、Agent、素材和导出 API
src/components/               页面和工作区 UI 组件
src/lib/agent/                Agent 提示词、模型调用、校验和展示映射
src/types/                    前后端共享类型
prisma/schema.prisma          数据库模型
docs/                         架构、API、数据模型、运维和 Agent 文档
public/html-animation-styles/ HTML 动画风格示例
```

## 文档入口

详细文档从 [docs/README.md](docs/README.md) 开始：

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：系统结构和模块边界。
- [docs/FEATURE_INDEX.md](docs/FEATURE_INDEX.md)：功能入口和代码路径。
- [docs/API_INDEX.md](docs/API_INDEX.md)：API 路由职责。
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md)：Prisma 模型和关键 JSON 字段。
- [docs/FRONTEND_INDEX.md](docs/FRONTEND_INDEX.md)：前端工作区和 UI 数据流。
- [docs/AGENT_SYSTEM.md](docs/AGENT_SYSTEM.md)：AI Agent 流程。
- [docs/OPERATIONS.md](docs/OPERATIONS.md)：本地运行、环境变量和故障排查。

## 安全和生成文件

- `.env.local` 只用于本地真实配置，不应提交。
- `logs/ai-conversations*.log` 可能包含 prompt 和模型响应，只能本地调试使用。
- `public/generated/` 保存用户生成的图片、音频、HTML 动画和导出文件，不应作为源码提交。
- 清理缓存时可以删除 `.next/`，不要删除 `public/generated/` 下的用户生成素材，除非明确需要清理生成结果。
