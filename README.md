# Videofly

视频上传平台-技术作业

## 已初始化内容

- `server/`: Express + TypeScript + Prisma + PostgreSQL 基础骨架
- `client/`: Vue 3 + TypeScript + Vite + Element Plus 基础骨架
- `docker-compose.yml`: PostgreSQL 本地开发编排
- `.env.example`: 根目录与服务端环境变量样例
- `pnpm-workspace.yaml`: monorepo workspace 配置

## 快速开始

1. 安装依赖

   ```bash
   pnpm install
   ```

2. 复制环境变量

   ```bash
   cp .env.example .env
   ```

3. 启动 PostgreSQL

   ```bash
   docker compose up -d postgres
   ```

4. 生成 Prisma Client 并执行迁移

   ```bash
   pnpm --filter @videofly/server prisma:generate
   pnpm --filter @videofly/server prisma:migrate
   ```

5. 启动前后端开发环境

   ```bash
   pnpm dev
   ```

## Docker Compose 部署

项目现在支持通过 Docker Compose 在 Ubuntu 服务器直接运行完整服务，包含：

- `postgres`: PostgreSQL 17
- `server`: Express + Prisma API
- `client`: Nginx 托管的 Vue 前端静态站点
- `nginx`: 对外入口网关，绑定域名 `videofly.oini.top`，转发 `/` 到前端、`/api/*` 到 API，并承载 HTTPS
- `certbot`: 通过 Let's Encrypt 申请和续期证书

### 本地或服务器启动

1. 准备 `.env`

   ```bash
   cp .env.example .env
   ```

2. 启动完整服务

   ```bash
   docker compose up -d --build
   ```

3. 查看状态

   ```bash
   docker compose ps
   docker compose logs -f
   ```

默认由 `nginx` 服务对外暴露 `80` 端口。

如果 DNS 已将 `videofly.oini.top` 指向服务器公网 IP，可直接访问：

```text
https://videofly.oini.top
```

### 一键发布到 Ubuntu 服务器

仓库已提供部署脚本 [scripts/deploy.sh](/Users/max/projects/videofly/scripts/deploy.sh)，默认会发布到：

- SSH: `root@42.121.218.102`
- Key: `~/.ssh/platform-eng-2.pem`
- Remote Dir: `/opt/videofly`
- Domain: `videofly.oini.top`

执行方式：

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

首次申请 HTTPS 证书前，请确认：

- `videofly.oini.top` 已解析到服务器公网 IP
- 服务器安全组已放通 `80` 和 `443`
- `.env` 中已配置 `LETSENCRYPT_EMAIL`

如需覆盖默认值，可以临时传入：

```bash
REMOTE_HOST=root@42.121.218.102 REMOTE_DIR=/opt/videofly ./scripts/deploy.sh
```

## 当前已提供的基础接口

- `GET /api/v1/health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/reset-password`
- `PUT /api/v1/auth/reset-password`
- `GET /api/v1/users/me`
- `GET /api/v1/users`
- `PUT /api/v1/users/:id/role`
- `POST /api/v1/upload/init`
- `POST /api/v1/upload/part`
- `POST /api/v1/upload/complete`
- `DELETE /api/v1/upload/cancel`
- `GET /api/v1/upload/status/:uploadId`
- `GET /api/v1/videos`

## 技术栈

Server: Express, PostgreSQL, Prisma

Client: Vue 3, TypeScript, Tailwind, Element Plus

部署：Docker Compose

## TODO

* [ ] 身份认证与用户管理

1. 用户通过邮箱密码注册（密码须加密存储bcrypt或同等方案）
2. 用户登录后返回JWT或Session Token
3. 注册时或由管理员分配角色（角色：上传者、观看者、管理员）
4. 受保护路由（所有上传/管理接口须携带有效Token）
5. 通过邮件重置密码（ip限制次数）

* [ ] 视频上传

1. 将视频文件上传至阿里云OSS（支持 MP4、MOV、AVI、MKV格式）
2. 大文件分片/分块上传（文件可达TB级，不可接受单流上传，WebWorker）
3. 断点续传 — 上传失败或中断后可恢复（通过服务端或OSS分片API追踪分片状态）
4. 向客户端返回上传进度（显示百分比或已上传字节数）
5. 分片失败自动重试（可配置重试次数，每个分片至少重试3次，采用指数退避策略）
6. 上传前进行文件大小和类型校验（尽早拒绝不支持的格式）
7. 并发上传 — 同时上传多个文件（适当排队和限流）
8. 取消上传（中止分片上传并清理OSS 中的临时数据）


* [ ] 存储与文件管理

1. 在数据库中存储视频元数据（标题、上传者、大小、状态、OSS Key）
2. 软删除 — 将视频标记为已删除，不立即从OSS移除（通过定时任务或管理员操作执行永久删除）
3. 按用户统计存储使用量（可用于配额管理）
4. 通过OSS预签名URL实现浏览器内视频预览/播放

* [ ] 角色与权限

1. 上传者：上传视频、查看自己的上传、删除自己的视频、查看自己的存储用量
2. 观看者：浏览和观看视频；不能上传或管理内容
3. 管理员： 拥有上传者和观看者的所有权限；管理所有用户、删除任意视频、查看全部存储用量、分配/撤销角色

* [ ] OpenAPI/Swagger文档

## API

基础路径：/api/v1
认证方式：Authorization: Bearer <JWT>（除 /auth/* 外）

* 认证与用户（Auth & User）
方法	路径	说明	权限
POST	/auth/register	邮箱+密码注册，返回用户信息	公开
POST	/auth/login	登录，返回 JWT	公开
POST	/auth/logout	注销（可选，前端清除 token）	任何已登录用户
POST	/auth/refresh	刷新 Token（如实现 Refresh Token）	任何已登录用户
POST	/auth/reset-password	请求重置密码邮件	公开
PUT	/auth/reset-password	使用 token 重置密码	公开
GET	/users/me	获取当前用户信息	任何已登录用户
GET	/users	获取所有用户（分页）	管理员
PUT	/users/:id/role	修改用户角色	管理员

* 视频上传（Upload）
方法	路径	说明	权限
POST	/upload/init	初始化上传，返回 uploadId 与分片大小	上传者
POST	/upload/part	上传单个分片	上传者
POST	/upload/complete	完成上传，合并分片并写入元数据	上传者
DELETE	/upload/cancel	取消上传，清理 OSS 临时分片	上传者
GET	/upload/status/:uploadId	查询已上传分片状态（断点续传）	上传者

* 视频管理（Video）
方法	路径	说明	权限
POST	/videos	保存视频元数据（完成上传后调用）	上传者
GET	/videos	获取视频列表（分页、过滤）	观看者 / 上传者 / 管理员
GET	/videos/:id	获取视频详情 + 预签名播放 URL	观看者 / 上传者 / 管理员
GET	/videos/:id/play	直接返回预签名播放 URL	观看者 / 上传者 / 管理员
DELETE	/videos/:id	软删除视频	上传者（仅自己）/ 管理员
DELETE	/videos/:id/permanent	永久删除视频（OSS + DB）	管理员

* 统计与仪表盘（Stats）
方法	路径	说明	权限
GET	/stats/usage	当前用户的存储用量	上传者 / 管理员
GET	/stats/admin/overview	平台总用量、用户数、视频数	管理员

* 健康检查与运维
方法	路径	说明
GET	/health	返回服务健康状态
GET	/metrics	（可选）Prometheus 指标
