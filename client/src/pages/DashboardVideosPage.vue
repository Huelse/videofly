<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";

import type { VideoItem } from "../api";
import { apiRequest } from "../api";
import { authStore } from "../stores/auth";
import { formatVideoStatus } from "../video-status";

const videos = ref<VideoItem[]>([]);
const loading = ref(false);
const errorMessage = ref("");
const deletingVideoId = ref<string | null>(null);

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

async function deleteVideo(video: VideoItem) {
  if (deletingVideoId.value) {
    return;
  }

  const confirmed = window.confirm(`确认删除《${video.title}》吗？视频会先从列表隐藏，OSS 文件会由后台定时清理。`);
  if (!confirmed) {
    return;
  }

  deletingVideoId.value = video.id;
  errorMessage.value = "";

  try {
    await apiRequest<null>(`/videos/${video.id}`, { method: "DELETE" }, authStore.token.value);
    videos.value = videos.value.filter((item) => item.id !== video.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "视频删除失败";
  } finally {
    deletingVideoId.value = null;
  }
}

function formatBytes(sizeBytes: string) {
  const size = Number(sizeBytes);
  if (!Number.isFinite(size) || size <= 0) {
    return "--";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
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

    <div v-if="!loading && videos.length === 0" class="empty-card">
      当前还没有属于你的视频记录
    </div>

    <div v-else class="video-grid">
      <article v-for="video in videos" :key="video.id" class="video-card">
        <RouterLink class="card-link" :to="`/dashboard/videos/${video.id}`">
          <div class="card-poster">
            <span class="poster-chip">{{ formatVideoStatus(video.status) }}</span>
            <strong>{{ video.title }}</strong>
            <small>点击查看详情并播放</small>
          </div>
        </RouterLink>

        <div class="card-body">
          <p class="meta-line">{{ formatBytes(video.sizeBytes) }}</p>
          <p class="meta-line">{{ new Date(video.createdAt).toLocaleString() }}</p>
          <div class="card-actions">
            <RouterLink class="detail-link" :to="`/dashboard/videos/${video.id}`">查看详情</RouterLink>
            <button class="danger-button" type="button" :disabled="deletingVideoId === video.id" @click="deleteVideo(video)">
              {{ deletingVideoId === video.id ? "删除中..." : "删除" }}
            </button>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.page-panel {
  padding: 24px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.9);
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

.ghost-button,
.danger-button,
.detail-link {
  border: none;
  border-radius: 14px;
  padding: 10px 14px;
  font: inherit;
}

.ghost-button,
.detail-link {
  background: #eaf2f8;
  color: #102a43;
  text-decoration: none;
  cursor: pointer;
}

.danger-button {
  background: #fee2e2;
  color: #991b1b;
  cursor: pointer;
}

.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}

.video-card {
  overflow: hidden;
  border-radius: 20px;
  background: #f8fbff;
  border: 1px solid rgba(148, 163, 184, 0.16);
}

.card-link {
  color: inherit;
  text-decoration: none;
}

.card-poster {
  min-height: 140px;
  display: grid;
  align-content: end;
  gap: 8px;
  padding: 16px;
  background:
    radial-gradient(circle at top right, rgba(255, 200, 87, 0.48), transparent 30%),
    linear-gradient(135deg, #0f172a, #1e3a5f 60%, #244d7c);
  color: #f8fafc;
}

.poster-chip {
  justify-self: start;
  padding: 4px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  font-size: 0.75rem;
}

.card-poster strong {
  font-size: 1rem;
  line-height: 1.35;
}

.card-poster small {
  color: rgba(248, 250, 252, 0.76);
}

.card-body {
  display: grid;
  gap: 8px;
  padding: 14px 16px 16px;
}

.meta-line {
  margin: 0;
  color: #52606d;
  font-size: 0.92rem;
}

.card-actions {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
}

.empty-card {
  padding: 32px;
  border-radius: 24px;
  background: #f8fbff;
  color: #52606d;
  text-align: center;
}

.error-text {
  margin-bottom: 14px;
  color: #b91c1c;
}

@media (max-width: 720px) {
  .page-head,
  .card-actions {
    flex-direction: column;
    align-items: flex-start;
  }

  .detail-link,
  .danger-button {
    width: 100%;
    text-align: center;
  }
}
</style>
