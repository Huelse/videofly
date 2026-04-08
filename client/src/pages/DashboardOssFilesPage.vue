<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";

import type { VideoItem } from "../api";
import { apiRequest } from "../api";
import { authStore } from "../stores/auth";

const videos = ref<VideoItem[]>([]);
const loading = ref(false);
const errorMessage = ref("");
const keyword = ref("");

const filteredVideos = computed(() => {
  const query = keyword.value.trim().toLowerCase();

  if (!query) {
    return videos.value;
  }

  return videos.value.filter((video) => {
    return [video.title, video.status, video.uploader.email, video.id].some((value) => value.toLowerCase().includes(query));
  });
});

async function fetchVideos() {
  loading.value = true;
  errorMessage.value = "";

  try {
    const response = await apiRequest<{ items: VideoItem[] }>("/videos?scope=all", {}, authStore.token.value);
    videos.value = response.items;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "OSS 文件列表获取失败";
  } finally {
    loading.value = false;
  }
}

onMounted(fetchVideos);
</script>

<template>
  <section class="page-panel">
    <div class="page-head">
      <div>
        <p class="eyebrow">OSS Files</p>
        <h2>OSS 文件管理</h2>
      </div>
      <button class="ghost-button" :disabled="loading" @click="fetchVideos">
        {{ loading ? "刷新中..." : "刷新列表" }}
      </button>
    </div>

    <div class="toolbar">
      <label class="search-field">
        <span>检索</span>
        <input v-model="keyword" placeholder="按标题、状态、上传者、视频 ID 搜索" />
      </label>
      <div class="stat-card">
        <span>当前文件数</span>
        <strong>{{ filteredVideos.length }}</strong>
      </div>
    </div>

    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

    <ul class="file-list">
      <li v-for="video in filteredVideos" :key="video.id" class="file-item">
        <div class="file-main">
          <div class="title-row">
            <RouterLink class="title-link" :to="`/dashboard/videos/${video.id}`">{{ video.title }}</RouterLink>
            <span class="status-pill">{{ video.status }}</span>
          </div>
          <p class="meta-line">
            <span>{{ video.uploader.email }}</span>
            <span>{{ video.sizeBytes }} bytes</span>
            <span>{{ new Date(video.createdAt).toLocaleString() }}</span>
          </p>
          <p class="id-line">Video ID: {{ video.id }}</p>
        </div>
        <RouterLink class="manage-link" :to="`/dashboard/videos/${video.id}`">查看详情</RouterLink>
      </li>
      <li v-if="!loading && filteredVideos.length === 0" class="empty-inline">当前没有可管理的 OSS 文件记录</li>
    </ul>
  </section>
</template>

<style scoped>
.page-panel {
  padding: 24px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
}

.page-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 18px;
}

.eyebrow {
  margin: 0 0 10px;
  font-size: 0.8rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #9a3412;
}

h2 {
  margin: 0;
  color: #102a43;
}

.toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px;
  gap: 14px;
  margin-bottom: 18px;
}

.search-field,
.stat-card {
  display: grid;
  gap: 8px;
  padding: 16px;
  border-radius: 18px;
  background: #f8fbff;
}

.search-field span,
.stat-card span {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #486581;
}

.search-field input {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 12px;
  padding: 12px 14px;
  font: inherit;
  background: white;
}

.stat-card strong {
  font-size: 1.8rem;
  color: #102a43;
}

.ghost-button,
.manage-link {
  border: none;
  border-radius: 14px;
  padding: 12px 16px;
  background: #eaf2f8;
  color: #102a43;
  font: inherit;
  cursor: pointer;
  text-decoration: none;
}

.file-list {
  display: grid;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.file-item {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 18px;
  border-radius: 18px;
  background: linear-gradient(135deg, #f8fbff 0%, #eef7f2 100%);
}

.file-main {
  min-width: 0;
}

.title-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 8px;
}

.title-link {
  color: #102a43;
  text-decoration: none;
  font-weight: 700;
}

.title-link:hover {
  text-decoration: underline;
}

.status-pill {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(14, 116, 144, 0.12);
  color: #0f766e;
  font-size: 0.8rem;
}

.meta-line,
.id-line,
.empty-inline,
.error-text {
  margin: 0;
  color: #52606d;
}

.meta-line {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.id-line {
  margin-top: 6px;
  font-family: "IBM Plex Mono", monospace;
  font-size: 0.85rem;
}

.error-text {
  color: #b91c1c;
}

@media (max-width: 800px) {
  .toolbar {
    grid-template-columns: 1fr;
  }

  .file-item {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
