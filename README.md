# Videofly

视频上传与观看平台，包含 Vue 3 前端、Express + Prisma 后端、PostgreSQL 数据库，以及基于 Docker Compose 的部署方案。

## 部署说明

### 本地开发

1. 安装依赖

```bash
pnpm install
```

2. 准备环境变量

```bash
cp .env.example .env
```

3. 启动数据库

```bash
docker compose up -d postgres
```

4. 初始化 Prisma

```bash
pnpm --filter @videofly/server prisma:generate
pnpm --filter @videofly/server prisma:migrate
```

5. 启动前后端

```bash
pnpm dev
```

默认开发入口：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3000/api/v1`
- OpenAPI：`http://localhost:3000/api/v1/openapi.json`

### Docker Compose 运行

仓库根目录提供完整编排：

- `postgres`：PostgreSQL
- `server`：Express API + Prisma
- `nginx`：静态前端托管与反向代理
- `certbot`：Let's Encrypt 证书申请与续期

启动命令：

```bash
docker compose up -d --build
```

常用排查命令：

```bash
docker compose ps
docker compose logs -f
```

### 服务器发布

项目内置部署脚本 [deploy.sh](/Users/max/projects/videofly/scripts/deploy.sh)，默认发布到：

- 服务器：`root@42.121.218.102`
- 目录：`/opt/videofly`
- 域名：`videofly.oini.top`

执行方式：

```bash
bash scripts/deploy.sh
```

脚本会执行以下流程：

1. 构建前端静态资源
2. 通过 `rsync` 同步项目到远端
3. 使用 HTTP 配置启动 `postgres`、`server`、`nginx`
4. 通过 `certbot` 申请或续期证书
5. 切换到 HTTPS Nginx 配置并重载

部署前需要确保：

- `.env` 已存在且包含生产可用配置
- 域名 DNS 已指向目标服务器
- 服务器已开放 `80` 与 `443` 端口
- OSS 访问密钥、JWT 密钥、`LETSENCRYPT_EMAIL` 已正确配置

## 架构概述

### Monorepo 结构

- `client/`：Vue 3 + Vite + TypeScript + Element Plus
- `server/`：Express 5 + TypeScript + Prisma
- `server/prisma/`：数据库模型、迁移、种子
- `server/test/`：Vitest 集成测试
- `deploy/nginx/`：HTTP/HTTPS Nginx 配置
- `scripts/`：部署与运维脚本

### 核心业务链路

1. 用户通过邮箱密码注册和登录，服务端返回 JWT
2. 前端使用 Bearer Token 访问受保护接口
3. 上传者初始化分片上传会话，服务端在数据库和 OSS 中建立状态
4. 浏览器通过 Web Worker 并发上传分片，服务端校验分片校验和并记录进度
5. 上传完成后，服务端合并 OSS 分片并写入视频元数据
6. 观看者、上传者、管理员都可以浏览视频流并播放视频
7. 视频删除采用软删除，OSS 文件由后台清理任务延迟移除

### 当前主要页面

- `/register`：注册
- `/login`：登录
- `/dashboard/profile`：个人信息、密码修改、存储用量
- `/dashboard/upload`：上传中心
- `/dashboard/my-videos`：我的视频
- `/dashboard/users`：用户管理
- `/feed`：独立视频流页面，新窗口打开

### 当前主要 API

- 认证：`/api/v1/auth/*`
- 用户：`/api/v1/users/*`
- 上传：`/api/v1/upload/*`
- 视频：`/api/v1/videos*`
- 文档：`/api/v1/openapi.json`、`/api/v1/openapi.yaml`

## 设计决策

### 角色模型

系统使用三种角色：

- `VIEWER`：浏览和播放视频
- `UPLOADER`：上传视频、查看自己的上传内容
- `ADMIN`：管理用户权限、管理额度、删除任意视频

权限校验在后端中间件完成，前端只做导航和交互层限制，不作为安全边界。

### 上传方案

选择服务端协调的 OSS 分片上传，而不是单次直传：

- 支持大文件上传与断点续传
- 可以在服务端统一做配额校验、重名判断和上传状态持久化
- 可以在每个分片上传时校验 `SHA-256`，减少损坏分片入库风险

上传对象键当前采用“自定义名称优先”的策略：

- `title` 作为主名称参与存储文件名生成
- 原始文件扩展名优先保留
- 这样用户修改展示名称后，重名判断会随之变化

### 播放方案

当前视频播放和预览图不是直接暴露 OSS 地址，而是由服务端代理：

- 服务端统一做鉴权
- 前端不需要处理 OSS 域名、签名与 CORS
- 支持 `Range` 请求，适配浏览器视频流播放

### 文档方案

OpenAPI 文档采用代码内维护、静态文件导出的方式：

- 源定义位于 [openapi.ts](/Users/max/projects/videofly/server/src/openapi.ts)
- 可生成 [openapi.json](/Users/max/projects/videofly/server/openapi/openapi.json) 与 [openapi.yaml](/Users/max/projects/videofly/server/openapi/openapi.yaml)
- 服务运行时也提供 `/api/v1/openapi.json` 和 `/api/v1/openapi.yaml`

这种方式比注释驱动更直接，适合当前规模下快速保持文档和实现一致。

## 已知限制

- 当前上传中心仍是单文件工作流，不支持同时排队上传多个文件。
- 视频流列表当前是随机取样 10 条，不支持分页、搜索、推荐排序和无限滚动。
- 播放和预览由服务端代理 OSS，请求会经过应用层，带来额外带宽和连接压力。
- 密码找回当前只在服务端日志中输出重置链接，没有接入真实邮件发送通道。
