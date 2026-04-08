<script setup lang="ts">
import { RouterView } from "vue-router";
</script>

<template>
  <RouterView v-slot="{ Component, route }">
    <Suspense>
      <component :is="Component" :key="route.fullPath" />

      <template #fallback>
        <section class="route-loading-shell">
          <div class="route-loading-card">
            <span class="loading-chip">Loading</span>
            <strong>页面加载中</strong>
            <p>正在准备当前页面内容。</p>
          </div>
        </section>
      </template>
    </Suspense>
  </RouterView>
</template>

<style scoped>
.route-loading-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px;
  background:
    radial-gradient(circle at top, rgba(255, 214, 153, 0.2), transparent 28%),
    linear-gradient(180deg, #f8fbff, #eef5fb);
}

.route-loading-card {
  display: grid;
  gap: 10px;
  min-width: min(420px, 100%);
  padding: 26px 28px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
}

.loading-chip {
  display: inline-flex;
  width: fit-content;
  padding: 5px 10px;
  border-radius: 999px;
  background: #fff2d8;
  color: #9a3412;
  font-size: 0.78rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.route-loading-card strong {
  color: #102a43;
  font-size: 1.1rem;
}

.route-loading-card p {
  margin: 0;
  color: #52606d;
}
</style>
