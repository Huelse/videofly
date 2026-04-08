<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";

import { authStore } from "../stores/auth";

const backTarget = computed(() => (authStore.isAuthenticated.value ? "/dashboard/me" : "/"));
const backLabel = computed(() => (authStore.isAuthenticated.value ? "返回后台" : "返回首页"));
</script>

<template>
  <main class="not-found-shell">
    <section class="not-found-card">
      <p class="eyebrow">404</p>
      <h1>页面不存在</h1>
      <p class="lead">你访问的地址不存在，或者该页面已经被移动。</p>
      <div class="actions">
        <RouterLink class="primary-link" :to="backTarget">{{ backLabel }}</RouterLink>
        <RouterLink class="ghost-link" to="/feed">打开视频流</RouterLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.not-found-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(circle at top, rgba(251, 191, 36, 0.18), transparent 28%),
    linear-gradient(180deg, #f8fbff, #eef5fb);
}

.not-found-card {
  width: min(720px, 100%);
  padding: 44px;
  border-radius: 32px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.1);
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
  font-size: clamp(2.4rem, 6vw, 4.8rem);
  line-height: 0.95;
  color: #102a43;
}

.lead {
  max-width: 560px;
  margin: 20px 0 0;
  line-height: 1.8;
  color: #334e68;
}

.actions {
  display: flex;
  gap: 14px;
  margin-top: 28px;
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
  .not-found-card {
    padding: 28px;
  }
}
</style>
