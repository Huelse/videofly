<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";

import type { VideoDetail } from "../../api";
import { apiBaseUrl, apiRequest } from "../../api";
import { authStore } from "../../stores/auth";
import { formatVideoStatus } from "../../video-status";

const route = useRoute();
const router = useRouter();
const video = ref<VideoDetail | null>(null);
const loading = ref(false);
const errorMessage = ref("");
const playbackErrorMessage = ref("");
const deleting = ref(false);

const playbackUrl = computed(() => {
  if (!video.value || !authStore.token.value) {
    return "";
  }

  return `${apiBaseUrl}/videos/${video.value.id}/playback?token=${encodeURIComponent(authStore.token.value)}`;
});

async function fetchVideo() {
  loading.value = true;
  errorMessage.value = "";

  try {
    video.value = await apiRequest<VideoDetail>(`/videos/${route.params.id}`, {}, authStore.token.value);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "视频详情获取失败";
  } finally {
    loading.value = false;
  }
}

function handlePlaybackError() {
  playbackErrorMessage.value = "视频播放失败，请刷新页面后重试";
}

async function deleteVideo() {
  if (!video.value || deleting.value) {
    return;
  }

  const confirmed = window.confirm(`确认删除《${video.value.title}》吗？视频会先从列表隐藏，OSS 文件会由后台定时清理。`);
  if (!confirmed) {
    return;
  }

  deleting.value = true;
  errorMessage.value = "";

  try {
    await apiRequest<null>(`/videos/${video.value.id}`, { method: "DELETE" }, authStore.token.value);
    await router.push("/dashboard/videos");
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "视频删除失败";
  } finally {
    deleting.value = false;
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

onMounted(fetchVideo);
</script>

<template>
  <section class="page-panel">
    <div class="page-head">
      <div>
        <p class="eyebrow">Video Detail</p>
        <h2>视频详情</h2>
      </div>
      <RouterLink class="ghost-link" to="/dashboard/videos">返回列表</RouterLink>
    </div>

    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    <p v-else-if="loading" class="helper">加载中...</p>

    <div v-if="video" class="detail-layout">
      <div class="player-card">
        <video class="player" :src="playbackUrl" controls playsinline preload="metadata" @error="handlePlaybackError" />
        <p v-if="playbackErrorMessage" class="error-text">{{ playbackErrorMessage }}</p>
      </div>

      <div class="info-card">
        <div class="info-row">
          <span>标题</span>
          <strong>{{ video.title }}</strong>
        </div>
        <div class="info-row">
          <span>状态</span>
          <strong>{{ formatVideoStatus(video.status) }}</strong>
        </div>
        <div class="info-row">
          <span>大小</span>
          <strong>{{ formatBytes(video.sizeBytes) }}</strong>
        </div>
        <div class="info-row">
          <span>上传者</span>
          <strong>{{ video.uploader.email }}</strong>
        </div>
        <div class="info-row">
          <span>创建时间</span>
          <strong>{{ new Date(video.createdAt).toLocaleString() }}</strong>
        </div>
        <div class="info-row">
          <span>更新时间</span>
          <strong>{{ new Date(video.updatedAt).toLocaleString() }}</strong>
        </div>
        <div class="info-row full">
          <span>OSS Key</span>
          <strong class="mono">{{ video.ossKey }}</strong>
        </div>
        <div class="info-actions">
          <button class="danger-button" type="button" :disabled="deleting" @click="deleteVideo">
            {{ deleting ? "删除中..." : "删除视频" }}
          </button>
        </div>
      </div>
    </div>
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

.ghost-link {
  padding: 12px 16px;
  border-radius: 14px;
  background: #eaf2f8;
  color: #102a43;
  text-decoration: none;
}

.danger-button {
  border: none;
  border-radius: 14px;
  padding: 12px 16px;
  background: rgba(185, 28, 28, 0.12);
  color: #b91c1c;
  font: inherit;
  cursor: pointer;
}

.danger-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.detail-layout {
  display: grid;
  gap: 16px;
}

.player-card,
.info-card {
  padding: 18px;
  border-radius: 22px;
  background: #f8fbff;
}

.player-card {
  display: grid;
  gap: 12px;
}

.player {
  width: 100%;
  aspect-ratio: 16 / 9;
  display: block;
  border-radius: 18px;
  background: #0f172a;
}

.info-card {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.info-row {
  display: grid;
  gap: 8px;
}

.info-row span {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #486581;
}

.info-row strong {
  color: #102a43;
}

.info-row.full {
  grid-column: 1 / -1;
}

.info-actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
}

.mono {
  font-family: "IBM Plex Mono", monospace;
  word-break: break-all;
}

.error-text {
  color: #b91c1c;
}

.helper {
  color: #52606d;
}

@media (max-width: 720px) {
  .page-head,
  .info-card {
    grid-template-columns: 1fr;
  }

  .info-actions {
    justify-content: stretch;
  }

  .danger-button {
    width: 100%;
  }
}
</style>
