<script setup lang="ts">
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

const todoGroups = [
  {
    title: "认证与用户",
    items: ["邮箱注册", "JWT 登录", "角色管理", "受保护路由", "密码重置"]
  },
  {
    title: "视频上传",
    items: ["分片上传", "断点续传", "重试与取消", "并发上传", "进度展示"]
  },
  {
    title: "存储与统计",
    items: ["元数据落库", "软删除", "配额统计", "预签名播放"]
  }
];
</script>

<template>
  <main class="page-shell">
    <section class="hero">
      <p class="eyebrow">Videofly / Bootstrap</p>
      <h1>视频上传平台项目骨架已初始化</h1>
      <p class="lead">
        当前已提供 Express + Prisma + PostgreSQL 后端基础、Vue 3 + Vite + Element Plus 前端入口，以及 Docker Compose 数据库编排。
      </p>
      <div class="meta-row">
        <span>API Base URL</span>
        <code>{{ apiBaseUrl }}</code>
      </div>
    </section>

    <section class="board">
      <article v-for="group in todoGroups" :key="group.title" class="card">
        <h2>{{ group.title }}</h2>
        <ul>
          <li v-for="item in group.items" :key="item">{{ item }}</li>
        </ul>
      </article>
    </section>
  </main>
</template>

<style scoped>
.page-shell {
  padding: 48px 20px 72px;
}

.hero {
  max-width: 960px;
  margin: 0 auto 28px;
  padding: 32px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(14px);
  box-shadow: 0 22px 60px rgba(16, 42, 67, 0.12);
}

.eyebrow {
  margin: 0 0 12px;
  font-size: 0.85rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #486581;
}

h1 {
  margin: 0;
  font-size: clamp(2.2rem, 4vw, 4.6rem);
  line-height: 1;
}

.lead {
  max-width: 720px;
  margin: 18px 0 0;
  font-size: 1.05rem;
  line-height: 1.7;
  color: #243b53;
}

.meta-row {
  display: inline-flex;
  gap: 12px;
  margin-top: 24px;
  padding: 12px 14px;
  border-radius: 999px;
  background: #102a43;
  color: #f0f4f8;
  flex-wrap: wrap;
}

.meta-row code {
  font-family: "IBM Plex Mono", monospace;
}

.board {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
  max-width: 960px;
  margin: 0 auto;
}

.card {
  padding: 24px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 18px 40px rgba(16, 42, 67, 0.08);
}

.card h2 {
  margin: 0 0 12px;
}

.card ul {
  margin: 0;
  padding-left: 20px;
  color: #334e68;
  line-height: 1.8;
}

@media (max-width: 640px) {
  .hero {
    padding: 24px;
  }

  .page-shell {
    padding-top: 24px;
  }
}
</style>
