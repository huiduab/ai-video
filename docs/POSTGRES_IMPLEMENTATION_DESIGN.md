# MotionWeave AI PostgreSQL 功能改造设计文档

## 1. 背景与目标

当前项目是 Next.js 前端应用，首页通过创作模式入口进入 `/workspace`，工作台项目历史和分镜数据来自前端 mock 文件：

- `src/data/mockProjects.ts`
- `src/data/mockStoryboard.ts`
- `src/app/workspace/page.tsx`
- `src/components/workspace/ProjectSidebar.tsx`
- `src/components/workspace/StoryboardTimeline.tsx`

本次改造目标：

1. 使用 PostgreSQL 作为项目、创作模式、分镜、素材、导出任务等核心数据的真实存储。
2. 提供 `.env.local` 数据库参数配置文件，由开发者填写实际 PostgreSQL 连接信息。
3. 首页点击两个创作模式之一后，先进入创建 loading 界面，由后端创建项目及默认数据库记录，创建完成后再进入工作台。
4. 历史项目、项目详情、分镜参数全部来自数据库，不再使用 mock 数据。
5. 数据库模型需要可扩展，支持后续用户体系、协作、版本、素材、异步生成任务、导出记录等能力。

## 2. 技术选型

### 2.1 数据库

使用 PostgreSQL。

原因：

- 适合结构化项目数据、时间线数据和任务状态管理。
- `jsonb` 可存储 AI 生成参数、画面配置、动画配置等高变化字段。
- 支持事务，适合“创建项目 + 创建默认场景 + 创建任务记录”的原子流程。
- 支持索引、全文搜索、软删除和后续多用户隔离。

### 2.2 ORM 建议

建议使用 Prisma。

原因：

- Next.js 集成简单。
- schema 可读性强，迁移文件清晰。
- 类型自动生成，减少接口层和组件层字段不一致。
- 后续可替换为连接池部署方案，例如 Supabase、Neon、Railway、RDS。

依赖建议：

```bash
npm install prisma @prisma/client
npx prisma init
```

## 3. 环境变量设计

已新增：

- `.env.example`：提交到仓库，作为配置示例。
- `.env.local`：本地真实配置文件，已被 `.gitignore` 忽略。

字段：

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
DIRECT_DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
APP_ENV="development"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

说明：

- `DATABASE_URL`：应用运行时连接 PostgreSQL。
- `DIRECT_DATABASE_URL`：迁移工具直连数据库，使用云数据库连接池时保留。
- `APP_ENV`：区分开发、测试、生产。
- `NEXT_PUBLIC_APP_URL`：前端可访问的应用地址。

## 4. 用户流程设计

### 4.1 首页创作入口

首页应把两个模式卡片改为可点击入口：

- 图片轮播模式：`slideshow`
- HTML 动画模式：`html-animation`

点击后不直接进入 `/workspace`，而是进入创建 loading 页面。

推荐路由：

```text
/create?mode=slideshow
/create?mode=html-animation
```

### 4.2 创建 loading 页面流程

页面：`src/app/create/page.tsx`

状态机：

```text
idle -> creating -> success -> redirect
                 -> failed
```

流程：

1. 读取 query 参数 `mode`。
2. 校验 mode 是否为 `slideshow` 或 `html-animation`。
3. 调用 `POST /api/projects`。
4. 服务端在一个事务中创建：
   - project
   - project_setting
   - 默认 storyboard_scene
   - 默认 timeline_track
   - 可选 initialization_task
5. API 返回 `projectId`。
6. 前端跳转到 `/workspace?projectId={projectId}`。
7. 如果失败，展示错误和“重试”按钮。

### 4.3 工作台加载流程

页面：`src/app/workspace/page.tsx`

流程：

1. 从 URL 获取 `projectId`。
2. 调用 `GET /api/projects` 获取左侧历史项目列表。
3. 调用 `GET /api/projects/{projectId}` 获取当前项目详情。
4. 调用 `GET /api/projects/{projectId}/storyboard` 获取分镜。
5. 渲染工作台。

如果 URL 没有 `projectId`：

- 默认打开最近编辑的项目。
- 如果没有项目，展示空状态，引导返回首页选择模式。

## 5. API 设计

### 5.1 创建项目

```http
POST /api/projects
Content-Type: application/json
```

请求：

```json
{
  "mode": "slideshow",
  "title": "未命名项目"
}
```

响应：

```json
{
  "project": {
    "id": "uuid",
    "title": "未命名项目",
    "mode": "slideshow",
    "status": "draft",
    "createdAt": "2026-05-31T14:30:00.000Z",
    "updatedAt": "2026-05-31T14:30:00.000Z"
  }
}
```

服务端要求：

- 使用事务。
- mode 必须白名单校验。
- 初始记录创建失败时整体回滚。

### 5.2 项目历史列表

```http
GET /api/projects?sort=updatedAt&order=desc&limit=50
```

响应：

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "星际探索：新纪元",
      "mode": "slideshow",
      "status": "draft",
      "durationMs": 30000,
      "thumbnailUrl": null,
      "updatedAt": "2026-05-31T14:20:00.000Z"
    }
  ]
}
```

替换位置：

- `src/components/workspace/ProjectSidebar.tsx`
- 删除对 `mockProjects` 的依赖。

### 5.3 项目详情

```http
GET /api/projects/{projectId}
```

响应：

```json
{
  "project": {
    "id": "uuid",
    "title": "未命名项目",
    "mode": "html-animation",
    "status": "draft",
    "durationMs": 45000,
    "settings": {
      "aspectRatio": "16:9",
      "resolution": "1920x1080",
      "fps": 30
    }
  }
}
```

### 5.4 分镜列表

```http
GET /api/projects/{projectId}/storyboard
```

响应：

```json
{
  "items": [
    {
      "id": "uuid",
      "index": 1,
      "title": "开场：星球全景",
      "startMs": 0,
      "durationMs": 4000,
      "thumbnailUrl": null,
      "prompt": "",
      "visualConfig": {},
      "animationConfig": {}
    }
  ]
}
```

替换位置：

- `src/components/workspace/StoryboardTimeline.tsx`
- 删除对 `mockStoryboard` 的运行时依赖。

### 5.5 更新项目

```http
PATCH /api/projects/{projectId}
```

请求：

```json
{
  "title": "产品发布会开场",
  "mode": "slideshow"
}
```

### 5.6 删除项目

推荐软删除：

```http
DELETE /api/projects/{projectId}
```

行为：

- 设置 `deletedAt`。
- 历史列表默认不返回。
- 回收站页面可以查询 `deletedAt IS NOT NULL`。

## 6. 数据库模型设计

### 6.1 枚举

```sql
CREATE TYPE project_mode AS ENUM ('slideshow', 'html_animation');
CREATE TYPE project_status AS ENUM ('draft', 'initializing', 'generating', 'ready', 'failed', 'archived');
CREATE TYPE asset_type AS ENUM ('image', 'video', 'audio', 'html', 'json', 'thumbnail');
CREATE TYPE task_type AS ENUM ('initialize_project', 'generate_storyboard', 'generate_asset', 'render_video', 'export_video');
CREATE TYPE task_status AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');
```

注意：前端使用 `html-animation`，数据库可使用 `html_animation`，API 层负责转换；也可以统一使用 `html-animation` 文本字段。若使用 Prisma enum，推荐数据库和代码统一为 `HTML_ANIMATION`，API 序列化成前端格式。

### 6.2 projects

项目主表，承载历史项目列表所需的稳定字段。

```sql
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  mode project_mode NOT NULL,
  status project_status NOT NULL DEFAULT 'draft',
  duration_ms integer NOT NULL DEFAULT 0,
  thumbnail_asset_id uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);
```

索引：

```sql
CREATE INDEX idx_projects_updated_at ON projects (updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_mode ON projects (mode) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_status ON projects (status) WHERE deleted_at IS NULL;
```

### 6.3 project_settings

项目渲染和编辑配置，和主表一对一。

```sql
CREATE TABLE project_settings (
  project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  aspect_ratio text NOT NULL DEFAULT '16:9',
  width integer NOT NULL DEFAULT 1920,
  height integer NOT NULL DEFAULT 1080,
  fps integer NOT NULL DEFAULT 30,
  default_scene_duration_ms integer NOT NULL DEFAULT 5000,
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

扩展点：

- `theme` 存储字体、主色、转场风格。
- `ai_config` 存储模型、提示词策略、生成参数。

### 6.4 storyboard_scenes

分镜表，替代 `mockStoryboard`。

```sql
CREATE TABLE storyboard_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_index integer NOT NULL,
  title text NOT NULL,
  prompt text NOT NULL DEFAULT '',
  narration text NOT NULL DEFAULT '',
  start_ms integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 5000,
  thumbnail_asset_id uuid NULL,
  visual_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  animation_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  UNIQUE (project_id, scene_index)
);
```

索引：

```sql
CREATE INDEX idx_storyboard_project_order ON storyboard_scenes (project_id, scene_index) WHERE deleted_at IS NULL;
```

### 6.5 timeline_tracks

时间线轨道，支持后续多轨编辑。

```sql
CREATE TABLE timeline_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  track_type text NOT NULL,
  track_index integer NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, track_index)
);
```

默认轨道：

- `scene`
- `audio`
- `caption`

### 6.6 timeline_clips

轨道片段，可关联分镜或素材。

```sql
CREATE TABLE timeline_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES timeline_tracks(id) ON DELETE CASCADE,
  scene_id uuid NULL REFERENCES storyboard_scenes(id) ON DELETE SET NULL,
  asset_id uuid NULL,
  start_ms integer NOT NULL,
  duration_ms integer NOT NULL,
  clip_index integer NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

索引：

```sql
CREATE INDEX idx_timeline_clips_project_time ON timeline_clips (project_id, start_ms);
CREATE INDEX idx_timeline_clips_track_order ON timeline_clips (track_id, clip_index);
```

### 6.7 assets

素材表，存储图片、视频、HTML 动画、缩略图等资源引用。

```sql
CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type asset_type NOT NULL,
  url text NULL,
  storage_key text NULL,
  mime_type text NULL,
  width integer NULL,
  height integer NULL,
  duration_ms integer NULL,
  size_bytes bigint NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

设计说明：

- 数据库只存素材元数据和地址，不直接存二进制文件。
- 本地开发可先使用 `/public/uploads`，生产建议对象存储。

### 6.8 generation_tasks

异步任务表，支持 loading、AI 生成、渲染和导出。

```sql
CREATE TABLE generation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type task_type NOT NULL,
  status task_status NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text NULL,
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

索引：

```sql
CREATE INDEX idx_generation_tasks_project ON generation_tasks (project_id, created_at DESC);
CREATE INDEX idx_generation_tasks_status ON generation_tasks (status, created_at);
```

### 6.9 project_versions

版本快照表，用于后续撤销、历史版本、协作冲突处理。

```sql
CREATE TABLE project_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version integer NOT NULL,
  label text NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);
```

## 7. Prisma Schema 草案

```prisma
enum ProjectMode {
  SLIDESHOW
  HTML_ANIMATION
}

enum ProjectStatus {
  DRAFT
  INITIALIZING
  GENERATING
  READY
  FAILED
  ARCHIVED
}

model Project {
  id               String             @id @default(uuid()) @db.Uuid
  title            String
  mode             ProjectMode
  status           ProjectStatus      @default(DRAFT)
  durationMs       Int                @default(0)
  metadata         Json               @default("{}")
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt
  deletedAt        DateTime?
  settings         ProjectSetting?
  scenes           StoryboardScene[]
  tracks           TimelineTrack[]
  assets           Asset[]
  generationTasks  GenerationTask[]

  @@index([updatedAt])
  @@index([mode])
  @@index([status])
}

model ProjectSetting {
  projectId              String   @id @db.Uuid
  project                Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  aspectRatio            String   @default("16:9")
  width                  Int      @default(1920)
  height                 Int      @default(1080)
  fps                    Int      @default(30)
  defaultSceneDurationMs Int      @default(5000)
  theme                  Json     @default("{}")
  aiConfig               Json     @default("{}")
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
}

model StoryboardScene {
  id              String   @id @default(uuid()) @db.Uuid
  projectId       String   @db.Uuid
  project         Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  sceneIndex      Int
  title           String
  prompt          String   @default("")
  narration       String   @default("")
  startMs         Int      @default(0)
  durationMs      Int      @default(5000)
  thumbnailAssetId String? @db.Uuid
  visualConfig    Json     @default("{}")
  animationConfig Json     @default("{}")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  @@unique([projectId, sceneIndex])
  @@index([projectId, sceneIndex])
}
```

## 8. 前端数据模型调整

当前：

```ts
export type ProjectMode = "slideshow" | "html-animation";

export interface ProjectItem {
  id: string;
  title: string;
  mode: ProjectMode;
  updatedAt: string;
  duration: string;
  thumbnailClass: string;
}
```

建议改为：

```ts
export type ProjectMode = "slideshow" | "html-animation";
export type ProjectStatus = "draft" | "initializing" | "generating" | "ready" | "failed" | "archived";

export interface ProjectItem {
  id: string;
  title: string;
  mode: ProjectMode;
  status: ProjectStatus;
  updatedAt: string;
  durationMs: number;
  thumbnailUrl: string | null;
}
```

UI 展示层负责格式化：

- `durationMs` -> `00:30`
- `updatedAt` -> `今天 14:20`
- `thumbnailUrl === null` -> 默认占位缩略图

不要把已经格式化的中文时间和 CSS class 当作数据库字段。

## 9. Mock 数据迁移策略

第一阶段保留 mock 作为 seed 数据，不再作为运行时数据源。

新增：

```text
prisma/seed.ts
```

seed 内容：

- 创建 3 个示例项目。
- 每个项目创建 settings。
- 每个项目创建 3 到 5 个 storyboard_scenes。
- 创建默认 timeline_tracks 和 timeline_clips。

删除运行时依赖：

- `ProjectSidebar` 不再 import `mockProjects`。
- `workspace/page.tsx` 不再用 `useState(mockProjects[0])`。
- `StoryboardTimeline` 不再 import `mockStoryboard`。

`WorkflowSection` 是首页展示区，可以继续使用静态展示数据，但建议改名为 `demoStoryboard`，避免和业务数据混淆。

## 10. 创建项目事务设计

伪代码：

```ts
await prisma.$transaction(async (tx) => {
  const project = await tx.project.create({
    data: {
      title,
      mode,
      status: "INITIALIZING",
    },
  });

  await tx.projectSetting.create({
    data: {
      projectId: project.id,
      aspectRatio: "16:9",
      width: 1920,
      height: 1080,
      fps: 30,
    },
  });

  const scene = await tx.storyboardScene.create({
    data: {
      projectId: project.id,
      sceneIndex: 1,
      title: "未命名分镜",
      startMs: 0,
      durationMs: 5000,
    },
  });

  const track = await tx.timelineTrack.create({
    data: {
      projectId: project.id,
      name: "Scene",
      trackType: "scene",
      trackIndex: 1,
    },
  });

  await tx.timelineClip.create({
    data: {
      projectId: project.id,
      trackId: track.id,
      sceneId: scene.id,
      startMs: 0,
      durationMs: 5000,
      clipIndex: 1,
    },
  });

  await tx.generationTask.create({
    data: {
      projectId: project.id,
      type: "INITIALIZE_PROJECT",
      status: "SUCCEEDED",
      progress: 100,
    },
  });

  await tx.project.update({
    where: { id: project.id },
    data: {
      status: "DRAFT",
      durationMs: 5000,
    },
  });

  return project;
});
```

## 11. Loading 页面设计

UI 要展示真实创建状态，而不是固定延迟。

建议文案：

```text
正在创建项目
正在初始化数据库记录
正在生成默认分镜
正在准备工作台
```

交互：

- 创建中禁用返回工作台。
- 失败时显示错误、重试、返回首页。
- 成功后自动跳转，不需要用户手动点击。

技术实现：

- `useEffect` 中调用 `fetch('/api/projects', { method: 'POST' })`。
- 使用 `AbortController` 避免组件卸载后继续 setState。
- 重试时复用同一个创建函数。

## 12. 可扩展性设计

### 12.1 用户体系

未来增加：

```text
users
workspaces
workspace_members
```

`projects` 增加：

```text
owner_id
workspace_id
```

当前可以暂不加，避免无认证状态下过度设计；但所有 API 查询应预留权限过滤位置。

### 12.2 协作

可通过 `project_versions` 和 `updated_at` 做乐观锁。

后续增强：

- project_events：记录每次编辑操作。
- comments：分镜级评论。
- presence：在线协作状态。

### 12.3 AI 生成任务

`generation_tasks` 不只服务初始化，也用于：

- 文案生成分镜。
- 分镜生成图片。
- HTML 动画生成。
- 视频渲染。
- 导出任务。

长任务不要阻塞 HTTP 请求。短期可以同步写入任务成功状态；后续接入队列时保留同一张表。

### 12.4 素材存储

数据库只保存 metadata 和 URL。

生产建议：

- S3 / R2 / OSS / Supabase Storage 存文件。
- `assets.storage_key` 保存对象存储 key。
- `assets.url` 可以是 CDN URL 或临时签名 URL。

## 13. 实施步骤

### 第一步：数据库基础设施

1. 安装 Prisma。
2. 新增 `prisma/schema.prisma`。
3. 配置 `.env.local`。
4. 执行迁移。
5. 新增 Prisma Client 单例：`src/lib/db.ts`。

### 第二步：项目创建链路

1. 新增 `src/app/create/page.tsx`。
2. 修改首页两个模式卡片，点击跳转到 `/create?mode=...`。
3. 新增 `POST /api/projects`。
4. 创建成功后跳转 `/workspace?projectId=...`。

### 第三步：历史项目替换 mock

1. 新增 `GET /api/projects`。
2. `ProjectSidebar` 改为接收数据库项目列表。
3. 删除运行时 `mockProjects` 依赖。
4. 增加 loading、empty、error 状态。

### 第四步：工作台项目详情

1. 新增 `GET /api/projects/[projectId]`。
2. 工作台按 `projectId` 加载当前项目。
3. 模式切换写回数据库。
4. 标题、状态、时长来自接口。

### 第五步：分镜数据替换 mock

1. 新增 `GET /api/projects/[projectId]/storyboard`。
2. 新增 `POST /api/projects/[projectId]/storyboard`。
3. 新增 `PATCH /api/storyboard/[sceneId]`。
4. `StoryboardTimeline` 改为从接口读取和更新。

### 第六步：seed 和测试

1. 把 mock 数据迁移到 seed。
2. 本地执行 `prisma db seed`。
3. 验证首页创建、工作台打开、历史列表、分镜列表。

## 14. 验收标准

1. `.env.local` 填入 PostgreSQL 参数后，应用可以连接数据库。
2. 首页点击图片轮播模式，显示 loading，数据库创建项目，成功后进入工作台。
3. 首页点击 HTML 动画模式，显示 loading，数据库创建项目，成功后进入工作台。
4. 左侧历史项目列表来自 `GET /api/projects`，不再来自 `mockProjects`。
5. 分镜时间线来自数据库，不再来自 `mockStoryboard`。
6. 刷新页面后，项目历史和当前项目仍然存在。
7. 删除项目后，默认历史列表不显示，数据仍可在回收站恢复。
8. 创建失败时不会留下半初始化项目，或项目状态明确为 `failed` 并可重试。

## 15. 风险与处理

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| 数据库未配置 | API 全部失败 | 启动时检查 `DATABASE_URL`，loading 页面显示明确错误 |
| 事务中部分记录失败 | 项目数据不完整 | 使用 `prisma.$transaction` |
| 前端仍引用 mock | 历史数据不真实 | 通过 `rg "mockProjects|mockStoryboard"` 验证 |
| 时间格式混乱 | UI 和数据库耦合 | 数据库存毫秒和 ISO 时间，UI 层格式化 |
| 长任务阻塞请求 | 页面等待过久 | 初始化同步完成，AI 生成和渲染走任务表 |

## 16. 推荐文件结构

```text
prisma/
  schema.prisma
  seed.ts

src/
  app/
    api/
      projects/
        route.ts
        [projectId]/
          route.ts
          storyboard/
            route.ts
    create/
      page.tsx
    workspace/
      page.tsx
  lib/
    db.ts
    project-mappers.ts
  types/
    project.ts
    storyboard.ts
```

## 17. 结论

本设计把当前前端 mock 项目升级为真实 PostgreSQL 数据模型，并把“首页选择创作模式 -> loading 初始化数据库 -> 进入工作台”的链路设计成可事务化、可扩展、可验证的流程。短期重点是项目创建、历史列表和分镜数据真实化；长期可以自然扩展到用户、协作、AI 任务队列、素材管理和版本历史。

