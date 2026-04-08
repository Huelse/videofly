<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";

import type { VideoItem } from "../api";
import { apiBaseUrl, apiRequest } from "../api";
import VideoFeedDialog from "../components/video/VideoFeedDialog.vue";
import VideoListCard from "../components/video/VideoListCard.vue";
import { formatBytes } from "../lib/storage";
import { authStore } from "../stores/auth";

const videos = ref<VideoItem[]>([]);
const loading = ref(false);
const errorMessage = ref("");
const failedPreviewIds = ref(new Set<string>());
const selectedVideoId = ref<string | null>(null);
const dialogVisible = ref(false);

async function fetchVideos() {
  loading.value = true;
  errorMessage.value = "";

  try {
    const response = await apiRequest<{ items: VideoItem[] }>("/videos?scope=all&limit=10&random=true", {}, authStore.token.value);
    videos.value = response.items;
    failedPreviewIds.value = new Set();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "视频流获取失败";
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

function openVideoDialog(videoId: string) {
  selectedVideoId.value = videoId;
  dialogVisible.value = true;
}

onMounted(fetchVideos);
</script>

<template>
  <main class="feed-shell">
    <section class="feed-panel">
      <div class="page-head">
        <div>
          <p class="eyebrow">Video Feed</p>
          <h2>视频流</h2>
        </div>
        <div class="head-actions">
          <button class="ghost-button" :disabled="loading" @click="fetchVideos">
            {{ loading ? "刷新中..." : "换一批视频" }}
          </button>
          <RouterLink class="ghost-link" to="/dashboard/me">返回后台</RouterLink>
        </div>
      </div>

      <p class="helper-text">该页面会在新浏览器窗口打开，展示随机视频瀑布流。</p>
      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

      <div v-if="!loading && videos.length === 0" class="empty-card">
        当前还没有可观看的视频
      </div>

      <div v-else class="waterfall-flow">
        <div v-for="video in videos" :key="video.id" class="waterfall-item">
          <VideoListCard
            :title="video.title"
            :preview-url="previewUrl(video.id)"
            :preview-enabled="!failedPreviewIds.has(video.id)"
            :size-label="formatBytes(video.sizeBytes)"
            :created-at-label="new Date(video.createdAt).toLocaleString()"
            @preview-error="handlePreviewError(video.id)"
            @select="openVideoDialog(video.id)"
          />
        </div>
      </div>
    </section>

    <VideoFeedDialog v-model="dialogVisible" :video-id="selectedVideoId" />
  </main>
</template>

<style scoped>
.feed-shell {
  min-height: 100vh;
  padding: 24px;
  background:
    radial-gradient(circle at top right, rgba(251, 191, 36, 0.16), transparent 24%),
    linear-gradient(180deg, #f6fbff, #edf4fb 46%, #f8fafc);
}

.feed-panel {
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px;
  border-radius: 32px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
}

.page-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
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

.head-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.ghost-button {
  text-decoration: none;
  border: none;
  border-radius: 14px;
  padding: 10px 14px;
  font: inherit;
  background: #eaf2f8;
  color: #102a43;
  cursor: pointer;
}

.ghost-link {
  text-decoration: none;
  border-radius: 14px;
  padding: 10px 14px;
  background: #eaf2f8;
  color: #102a43;
}

.helper-text {
  margin: 0 0 18px;
  color: #52606d;
}

.waterfall-flow {
  column-count: 3;
  column-gap: 16px;
}

.waterfall-item {
  break-inside: avoid;
  margin-bottom: 16px;
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

@media (max-width: 1080px) {
  .waterfall-flow {
    column-count: 2;
  }
}

@media (max-width: 720px) {
  .feed-shell {
    padding: 14px;
  }

  .page-head {
    flex-direction: column;
  }

  .waterfall-flow {
    column-count: 1;
  }
}
</style>
