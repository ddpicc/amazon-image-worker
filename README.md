# Image Worker

独立的图片生成 Worker 服务，配备 Next.js 管理工作台。

- **BullMQ 队列**：Redis 驱动的任务队列，并发处理
- **Provider 智能路由**：基于成功率/延迟/成本的评分排序、渐进冷却、熔断器
- **REST API**：提交任务、管理 Provider、查看统计
- **管理后台**：Provider 管理、任务监控、统计图表、告警配置

## 架构

```
┌─────────────┐     ┌─────────────┐
│  主应用/客户端  │────▶│  REST API    │
└─────────────┘     │  (Next.js)   │
                    │  :3001       │
                    └──────┬───────┘
                           │ enqueue
                    ┌──────▼───────┐
                    │    Redis     │
                    │   BullMQ     │
                    └──────┬───────┘
                           │ consume
                    ┌──────▼───────┐
                    │   Worker     │
                    │  (BullMQ)    │
                    │  concurrency=3│
                    └──────┬───────┘
                           │ failover
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         Provider 1   Provider 2   Provider N
              │            │            │
              └────────────┼────────────┘
                           │
                    ┌──────▼───────┐
                    │ PostgreSQL   │
                    │ (独立数据库)  │
                    └──────────────┘
```

## 快速开始

```bash
# 安装依赖
npm install

# 生成 Prisma Client
npx prisma generate --schema prisma/schema.prisma

# 初始化数据库（首次）
npx prisma migrate dev --schema prisma/schema.prisma

# 运行数据库迁移
npm run db:migrate
```

## 环境变量

```bash
# 数据库（独立，非共享）
DATABASE_URL=postgresql://user:pass@host:5432/image_worker

# Redis 队列
REDIS_URL=redis://localhost:6379

# Dashboard 管理员密码
ADMIN_PASSWORD=your-password

# Provider API Key 加密密钥
PROVIDER_KEY_ENCRYPTION_KEY=

# 应用密钥（API Key 哈希）
APP_SECRET=

# 对象存储后端：cos | r2
STORAGE_BACKEND=cos

# 腾讯云 COS
COS_SECRET_ID=
COS_SECRET_KEY=
COS_BUCKET=
COS_REGION=ap-guangzhou
COS_PUBLIC_BASE_URL=    # 可选

# Cloudflare R2（仅 STORAGE_BACKEND=r2 时需要）
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=
R2_ENDPOINT=            # 可选，默认 https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
```

## 运行

```bash
# 启动 Worker 进程（队列消费 + 定时任务）
npm start          # 生产
npm run dev        # 开发（热重载）

# 启动 Web 服务（API + Dashboard）
npm run start:web  # 生产 :3001
npm run dev:web    # 开发 :3001

# 构建
npm run build:web
```

生产部署需要同时运行两个进程：Worker + Web Server。

## 对象存储切换

默认后端是腾讯云 COS。

如果要切到 Cloudflare R2：

```bash
STORAGE_BACKEND=r2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=
```

说明：

- `R2_PUBLIC_BASE_URL` 应该是你给桶配置的公开访问域名或自定义域名
- `R2_ENDPOINT` 可选，不填时默认使用 `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`
- 数据库里的 `cosUrl` / `cosKey` 字段名会继续沿用，避免迁移历史数据，但实际上传后端由 `STORAGE_BACKEND` 决定

## API 端点

### 任务接口（API Key 鉴权）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/tasks` | 提交图片生成任务 |
| GET | `/api/v1/tasks` | 任务列表（分页） |
| GET | `/api/v1/tasks/:id` | 任务详情（含 attempts） |

### 管理接口（Admin Cookie 鉴权）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/v1/providers` | Provider 列表/创建 |
| GET/PUT/DELETE | `/api/v1/providers/:id` | Provider 详情/更新/删除 |
| POST | `/api/v1/providers/:id/move` | 调整优先级 |
| POST | `/api/v1/providers/:id/rotate-key` | 轮转 API Key |
| POST | `/api/v1/providers/:id/reset-breaker` | 重置熔断器 |
| GET | `/api/v1/stats/overview` | 总览统计 |
| GET | `/api/v1/stats/providers/:id` | Provider 统计 |
| GET/POST | `/api/v1/api-keys` | API Key 管理 |
| PUT/DELETE | `/api/v1/api-keys/:id` | 更新/吊销 |
| GET/POST | `/api/v1/alerts/rules` | 告警规则 |
| GET | `/api/v1/alerts/events` | 告警事件 |

## 智能路由

Provider 选择不再是简单的静态优先级，而是综合评分：

```
finalScore = 0.3 × priorityScore
           + 0.4 × successRateScore   (24h 滚动窗口)
           + 0.2 × latencyScore       (24h 平均延迟)
           + 0.1 × costScore
```

### 渐进冷却

根据错误类型和连续失败次数递增冷却时间：

| 错误类型 | 第1次 | 第2次 | 第3次+ |
|---------|-------|-------|--------|
| RATE_LIMIT (429) | 2min | 10min | 30min |
| AUTH_FAILURE (401) | **立即禁用** | - | - |
| TIMEOUT | 1min | 5min | 15min |
| PROVIDER_ERROR (5xx) | 3min | 10min | 30min |

### 熔断器

- 最近 10 次请求失败率 > 50% → 自动禁用 Provider
- 记录 `circuitBreakerTrippedAt` 和原因
- 管理员手动重置

### 告警

- 支持 Webhook 通知（企业微信/飞书/Slack 等）
- 告警条件：熔断触发、失败率超阈值、延迟超阈值
- 告警事件记录，可确认/过滤

## Dashboard

访问 `http://localhost:3001/dashboard`，使用 `ADMIN_PASSWORD` 登录。

- **Overview**：今日任务、成功率、活跃 Provider、平均耗时、最近失败
- **Providers**：Provider 管理、优先级排序、启停、密钥轮转、状态监控
- **Tasks**：任务列表、状态筛选、尝试详情、图片预览、重试
- **Statistics**：Provider 成功率对比、延迟趋势图表
- **Settings**：API Key 管理、配额设置、告警规则、告警事件

## 项目结构

```
src/
├── app/                          # Next.js App Router
│   ├── api/
│   │   ├── internal/             # 内部接口（middleware 用）
│   │   └── v1/                   # REST API v1
│   │       ├── tasks/            # 任务 API
│   │       ├── providers/        # Provider API
│   │       ├── stats/            # 统计 API
│   │       ├── api-keys/         # API Key 管理
│   │       └── alerts/           # 告警 API
│   └── dashboard/                # 管理后台前端
│       ├── login/                # 登录页
│       ├── providers/            # Provider 管理
│       ├── tasks/                # 任务列表
│       ├── stats/                # 统计图表
│       └── settings/             # 设置
├── lib/
│   ├── auth/                     # API Key 鉴权 + 配额
│   ├── db/                       # Prisma 客户端
│   ├── providers/                # 智能路由引擎
│   │   ├── provider-service.ts   # Provider CRUD + 选择
│   │   ├── provider-scoring.ts   # 评分算法
│   │   ├── cooldown.ts           # 渐进冷却
│   │   ├── circuit-breaker.ts    # 熔断器
│   │   ├── error-classifier.ts   # 错误分类
│   │   ├── alert-dispatcher.ts   # 告警分发
│   │   └── stats-snapshot.ts     # 统计快照
│   ├── dashboard/                # 前端工具函数
│   ├── image-generation-service.ts  # 核心生成逻辑
│   ├── image-generation-worker-queue.ts  # BullMQ 队列
│   ├── image-generation.ts       # 类型定义
│   ├── image-options.ts          # 尺寸配置
│   ├── ai-operations.ts          # AI 操作追踪
│   ├── amazon-workflow.ts        # Amazon 工作流
│   ├── cos.ts                    # 腾讯云 COS 上传
│   └── crypto.ts                 # 加密工具
├── middleware.ts                 # API 鉴权中间件
└── worker/
    └── image-generation-worker.ts  # Worker 入口
```
