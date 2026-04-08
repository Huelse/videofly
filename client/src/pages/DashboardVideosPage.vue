<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";

import type { VideoItem } from "../api";
import { apiRequest } from "../api";
import { authStore } from "../stores/auth";

const videos = ref<VideoItem[]>([]);
const loading = ref(false);
const errorMessage = ref("");

async function fetchVideos() {
  loading.value = true;
  errorMessage.value = "";

  try {
    const response = await apiRequest<{ items: VideoItem[] }>("/videos?scope=mine", {}, authStore.token.value);
    videos.value = response.items;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "视频获取失败";
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
        <p class="eyebrow">My Videos</p>
        <h2>我的视频列表</h2>
      </div>
      <button class="ghost-button" :disabled="loading" @click="fetchVideos">
        {{ loading ? "刷新中..." : "刷新列表" }}
      </button>
    </div>

    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

    <ul class="video-list">
      <li v-for="video in videos" :key="video.id">
        <div>
          <RouterLink class="title-link" :to="`/dashboard/videos/${video.id}`">{{ video.title }}</RouterLink>
          <span>{{ video.status }}</span>
        </div>
        <div class="video-meta">
          <span>{{ video.sizeBytes }} bytes</span>
          <span>{{ new Date(video.createdAt).toLocaleString() }}</span>
        </div>
      </li>
      <li v-if="!loading && videos.length === 0" class="empty-inline">当前还没有属于你的视频记录</li>
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

.ghost-button {
  border: none;
  border-radius: 14px;
  padding: 12px 16px;
  background: #eaf2f8;
  color: #102a43;
  font: inherit;
  cursor: pointer;
}

.video-list {
  display: grid;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.video-list li {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  padding: 16px;
  border-radius: 18px;
  background: #f8fbff;
}

.video-list strong {
  display: block;
  margin-bottom: 6px;
}

.title-link {
  display: block;
  margin-bottom: 6px;
  color: #102a43;
  text-decoration: none;
  font-weight: 700;
}

.title-link:hover {
  text-decoration: underline;
}

.video-meta {
  display: grid;
  gap: 6px;
  justify-items: end;
  color: #52606d;
}

.empty-inline,
.error-text {
  color: #52606d;
}

.error-text {
  color: #b91c1c;
}
</style>
