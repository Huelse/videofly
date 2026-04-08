<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";

import { authStore } from "../../stores/auth";

const route = useRoute();
const router = useRouter();

const navItems = computed(() => {
  const items = [
    { to: "/dashboard/videos", label: "我的视频" },
    { to: "/dashboard/upload", label: "上传中心" }
  ];

  if (authStore.isAdmin.value) {
    items.push({ to: "/dashboard/oss", label: "OSS 文件管理" });
    items.push({ to: "/dashboard/users", label: "用户管理" });
  }

  return items;
});

async function logout() {
  await authStore.logout();
  await router.push({ name: "home" });
}
</script>

<template>
  <main class="dashboard-shell">
    <aside class="sidebar">
      <div>
        <p class="eyebrow">Videofly Admin</p>
        <h1>管理后台</h1>
        <p class="user-line">{{ authStore.currentUser.value?.email }}</p>
        <p class="role-pill">{{ authStore.currentUser.value?.role }}</p>
      </div>

      <nav class="nav-list">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          :class="{ active: route.path === item.to }"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <button class="logout-button" @click="logout">退出登录</button>
    </aside>

    <section class="content-area">
      <RouterView />
    </section>
  </main>
</template>

<style scoped>
.dashboard-shell {
  height: 100vh;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  overflow: hidden;
}

.sidebar {
  display: grid;
  align-content: start;
  gap: 24px;
  position: sticky;
  top: 0;
  height: 100vh;
  padding: 28px 22px;
  overflow-y: auto;
  background: linear-gradient(180deg, #102a43, #0f172a);
  color: #f8fafc;
}

.eyebrow {
  margin: 0;
  font-size: 0.78rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #fdba74;
}

h1 {
  margin: 10px 0 8px;
  font-size: 2rem;
}

.user-line,
.role-pill {
  margin: 0;
}

.user-line {
  color: #cbd5e1;
  word-break: break-word;
}

.role-pill {
  display: inline-flex;
  width: fit-content;
  margin-top: 10px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(251, 146, 60, 0.16);
  color: #fed7aa;
  font-size: 0.8rem;
}

.nav-list {
  display: grid;
  gap: 10px;
}

.nav-link,
.logout-button {
  padding: 12px 14px;
  border-radius: 14px;
  text-decoration: none;
  color: inherit;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.08);
  font: inherit;
}

.nav-link.active {
  background: rgba(255, 255, 255, 0.12);
}

.logout-button {
  margin-top: auto;
  cursor: pointer;
  color: #fecaca;
  background: rgba(127, 29, 29, 0.18);
}

.content-area {
  min-width: 0;
  height: 100vh;
  padding: 28px;
  overflow-y: auto;
}

.sidebar,
.content-area {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.sidebar::-webkit-scrollbar,
.content-area::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

@media (max-width: 900px) {
  .dashboard-shell {
    height: auto;
    grid-template-columns: 1fr;
    overflow: visible;
  }

  .sidebar {
    position: static;
    height: auto;
    overflow: visible;
    padding-bottom: 18px;
  }

  .content-area {
    height: auto;
    overflow: visible;
  }
}
</style>
