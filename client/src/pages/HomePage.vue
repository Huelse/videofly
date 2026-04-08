<script setup lang="ts">
import { RouterLink } from "vue-router";
</script>

<template>
  <main class="marketing-shell">
    <section class="hero-card">
      <p class="eyebrow">Videofly</p>
      <h1>视频上传平台管理后台</h1>
      <p class="lead">
        从主页进入登录或注册。认证成功后将跳转到后台，可从侧边栏以新浏览器窗口打开独立的视频流页面。
      </p>
      <div class="hero-actions">
        <RouterLink class="primary-link" to="/login">登录</RouterLink>
        <RouterLink class="ghost-link" to="/register">注册</RouterLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.marketing-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}

.hero-card {
  width: min(960px, 100%);
  padding: 48px;
  border-radius: 36px;
  background:
    linear-gradient(140deg, rgba(255, 255, 255, 0.92), rgba(255, 247, 237, 0.88)),
    radial-gradient(circle at right top, rgba(249, 115, 22, 0.18), transparent 34%);
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.12);
}

.eyebrow {
  margin: 0 0 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-size: 0.82rem;
  color: #9a3412;
}

h1 {
  margin: 0;
  font-size: clamp(2.8rem, 6vw, 5.2rem);
  line-height: 0.95;
  color: #102a43;
}

.lead {
  max-width: 680px;
  margin: 20px 0 0;
  line-height: 1.8;
  color: #334e68;
}

.hero-actions {
  display: flex;
  gap: 14px;
  margin-top: 30px;
  flex-wrap: wrap;
}

.primary-link,
.ghost-link {
  padding: 14px 20px;
  border-radius: 999px;
  text-decoration: none;
  font-weight: 600;
}

.primary-link {
  background: linear-gradient(135deg, #ea580c, #c2410c);
  color: #fff;
}

.ghost-link {
  background: #fff;
  color: #102a43;
  border: 1px solid #d9e2ec;
}

@media (max-width: 640px) {
  .hero-card {
    padding: 28px;
  }
}
</style>
