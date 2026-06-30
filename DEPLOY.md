# Railway 部署指南

## 架构：一个项目，两个 Service

```
Railway Project: image-worker
├── Service: web      → Next.js API + Dashboard  (:3001)
├── Service: worker   → BullMQ Worker（消费任务）
├── Database: PostgreSQL（Railway 内置）
└── Service: Redis    → BullMQ 队列（Railway 内置或外部）
```

---

## 步骤 1：创建 Railway 项目

1. 打开 [railway.app](https://railway.app)，登录
2. **New Project** → **Deploy from GitHub Repo** → 选择你的仓库

## 步骤 2：添加 PostgreSQL

1. 在项目里点 **+ New** → **Database** → **PostgreSQL**
2. 创建完成后，记下连接信息（Railway 会自动注入 `DATABASE_URL`）

## 步骤 3：添加 Redis

1. 在项目里点 **+ New** → **Database** → **Redis**
   - 如果 Railway 没有内置 Redis，可以用 [Upstash](https://upstash.com) 免费版
   - 或者用任何外部 Redis，只需要 `REDIS_URL`

## 步骤 4：部署 Web Service

你刚导入的 GitHub repo 默认会创建一个 Service，把它当作 Web：

1. 点进该 Service → **Settings**
2. **Service Name**: `web`
3. 确认 **Build** 使用 Nixpacks（默认）
4. **Networking** → **Generate Domain** → 得到公开地址如 `image-worker-web.up.railway.app`

### 配置环境变量（web）

在 web Service → **Variables** 中添加：

```env
# 数据库和 Redis（Railway 会自动注入，如果你用 Railway 内置的）
# DATABASE_URL=postgresql://...   ← Railway 自动注入（引用 PostgreSQL Service）
# REDIS_URL=redis://...           ← Railway 自动注入（引用 Redis Service）

# 以下需要手动设置：
ADMIN_PASSWORD=你的管理密码
PROVIDER_KEY_ENCRYPTION_KEY=随机32位字符串
APP_SECRET=随机字符串
STORAGE_BACKEND=cos

# 腾讯云 COS
COS_SECRET_ID=你的COS_SecretId
COS_SECRET_KEY=你的COS_SecretKey
COS_BUCKET=你的桶名
COS_REGION=ap-guangzhou
COS_PUBLIC_BASE_URL=https://你的桶.cos.ap-guangzhou.myqcloud.com

# Cloudflare R2（仅 STORAGE_BACKEND=r2 时需要）
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=
R2_ENDPOINT=
```

### Railway 变量引用

如果用 Railway 内置的 PostgreSQL 和 Redis，可以用引用语法：

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
```

## 步骤 5：部署 Worker Service

1. 在同一个项目里点 **+ New** → **Empty Service**
2. **Service Name**: `worker`
3. **Source** → **GitHub Repo** → 选择同一个仓库
4. Worker 不需要公开端口，不需要 Generate Domain

### 配置环境变量（worker）

Worker 需要和 Web **完全相同的环境变量**。最快的方式：

1. 在 worker Service → **Variables**
2. 用引用语法共享：
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   ADMIN_PASSWORD=${{web.ADMIN_PASSWORD}}
   PROVIDER_KEY_ENCRYPTION_KEY=${{web.PROVIDER_KEY_ENCRYPTION_KEY}}
   APP_SECRET=${{web.APP_SECRET}}
   STORAGE_BACKEND=${{web.STORAGE_BACKEND}}
   COS_SECRET_ID=${{web.COS_SECRET_ID}}
   COS_SECRET_KEY=${{web.COS_SECRET_KEY}}
   COS_BUCKET=${{web.COS_BUCKET}}
   COS_REGION=${{web.COS_REGION}}
   COS_PUBLIC_BASE_URL=${{web.COS_PUBLIC_BASE_URL}}
   R2_ACCOUNT_ID=${{web.R2_ACCOUNT_ID}}
   R2_ACCESS_KEY_ID=${{web.R2_ACCESS_KEY_ID}}
   R2_SECRET_ACCESS_KEY=${{web.R2_SECRET_ACCESS_KEY}}
   R2_BUCKET=${{web.R2_BUCKET}}
   R2_PUBLIC_BASE_URL=${{web.R2_PUBLIC_BASE_URL}}
   R2_ENDPOINT=${{web.R2_ENDPOINT}}
   ```

### 关键：设置 SERVICE_ROLE=worker

```env
SERVICE_ROLE=worker
```

这会让启动脚本执行 Worker 而不是 Web Server。

## 步骤 6：首次部署 & 数据库迁移

两个 Service 都部署完成后，Web 的启动脚本会自动执行 `prisma migrate deploy` 应用迁移。

如果没有自动执行，可以手动操作：

1. 在 web Service → **Deployments** → 最新的 deployment → 点开
2. 在 **Railway Shell**（或终端）中执行：
   ```bash
   npx prisma migrate deploy --schema prisma/schema.prisma
   ```

## 步骤 7：验证

### 检查 Web

```bash
# 替换为你的 Railway 域名
curl https://你的域名.up.railway.app/api/v1/stats/overview
# 应返回 401（需要 admin cookie）
```

### 打开 Dashboard

浏览器访问 `https://你的域名.up.railway.app/dashboard/login`，用 `ADMIN_PASSWORD` 登录。

### 检查 Worker

在 Railway 的 worker Service 日志中，应该看到：

```
[worker] starting image-generation worker
[scheduler] scheduled jobs started
[worker] image-generation worker ready, waiting for jobs...
```

---

## 首次使用流程

1. **登录 Dashboard** → `https://你的域名/dashboard/login`
2. **创建 API Key** → Settings 页 → 点 "Create Key" → 保存好返回的密钥（只显示一次）
3. **添加 Provider** → Providers 页 → "Add Provider" → 填写 AI 服务的 API 信息
4. **提交测试任务**：
   ```bash
   curl -X POST https://你的域名/v1/images/generations \
     -H "Authorization: Bearer imgw_你拿到的密钥" \
     -H "Content-Type: application/json" \
     -d '{"model":"gpt-image-2","prompt":"test image","size":"1024x1024"}'
   ```
5. **查询单个任务**：
   ```bash
   curl https://你的域名/v1/images/tasks/任务ID \
     -H "Authorization: Bearer imgw_你拿到的密钥"
   ```
6. **查看任务列表** → Dashboard → Tasks 页（内部走 `/api/v1/tasks`）

---

## 其他项目调用示例

```javascript
// 主应用调用示例
const response = await fetch('https://你的域名/v1/images/generations', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer imgw_你的API_KEY',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-image-2',
    prompt: '产品图片描述',
    size: '1024x1024',
    image_urls: ['https://example.com/reference.png'],
  }),
})

const { id, status } = await response.json()

// 查询结果
const result = await fetch(`https://你的域名/v1/images/tasks/${id}`, {
  headers: { 'Authorization': 'Bearer imgw_你的API_KEY' },
})
```

---

## Evolink Provider 清理

如果你之前配置过 `vendor = evolink` 或 `baseUrl` 指向 Evolink 的 provider，升级到当前版本后建议执行一次清理：

```bash
npm run providers:evolink:report
npm run providers:evolink:disable
npm run providers:evolink:purge
```

建议顺序：

1. 先 `report` 看命中的 provider
2. 确认已经有替代 provider 后执行 `disable`
3. 观察一段时间没问题后再 `purge`

---

## 费用参考

| Railway 资源 | 估算 |
|-------------|------|
| Web Service | ~$5/月（Eco plan 或 Hobby） |
| Worker Service | ~$5/月 |
| PostgreSQL | 免费额度内 / ~$1-5/月 |
| Redis | 免费额度内 / 用 Upstash 免费版 |

总计大约 **$10-15/月**。
