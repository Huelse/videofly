<script setup lang="ts">
import { onMounted, ref } from "vue";

import type { VideoItem } from "../../api";
import { apiBaseUrl, apiRequest } from "../../api";
import VideoListCard from "../../components/video/VideoListCard.vue";
import { formatBytes } from "../../lib/storage";
import { authStore } from "../../stores/auth";

const videos = ref<VideoItem[]>([]);
const loading = ref(false);
const errorMessage = ref("");
const failedPreviewIds = ref(new Set<string>());

async function fetchVideos() {
  loading.value = true;
  errorMessage.value = "";

  try {
    const response = await apiRequest<{ items: VideoItem[] }>("/videos?scope=mine", {}, authStore.token.value);
    videos.value = response.items;
    failedPreviewIds.value = new Set();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "视频获取失败";
  } finally {
    loading.value = false;
  }
}

function previewUrl(videoId: string) {
  if (!authStore.token.value) {
    return "";
  }

  return `${apiBaseUrl}/videos/${videoId}/preview?token=${encodeURIComponent(authStore.token.value)}`;
}

function handlePreviewError(videoId: string) {
  const next = new Set(failedPreviewIds.value);
  next.add(videoId);
  failedPreviewIds.value = next;
}

onMounted(fetchVideos);
</script>

<template>
  <section class="page-panel">
    <div class="page-head">
      <div>
        <p class="eyebrow">My Videos</p>
        <h2>我的视频</h2>
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
      <VideoListCard
        v-for="video in videos"
        :key="video.id"
        :title="video.title"
        :detail-to="`/dashboard/videos/${video.id}`"
        :preview-url="previewUrl(video.id)"
        :preview-enabled="!failedPreviewIds.has(video.id)"
        :size-label="formatBytes(video.sizeBytes)"
        :created-at-label="new Date(video.createdAt).toLocaleString()"
        @preview-error="handlePreviewError(video.id)"
      />
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

.ghost-button {
  border: none;
  border-radius: 14px;
  padding: 10px 14px;
  font: inherit;
  background: #eaf2f8;
  color: #102a43;
  cursor: pointer;
}

.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
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
  .page-head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
