<script setup lang="ts">
import { computed, ref, watch } from "vue";

import type { VideoDetail } from "../../api";
import { apiBaseUrl, apiRequest } from "../../api";
import { showApiError } from "../../lib/feedback";
import { formatBytes } from "../../lib/storage";
import { authStore } from "../../stores/auth";
import { formatVideoStatus } from "../../video-status";

const props = defineProps<{
  modelValue: boolean;
  videoId: string | null;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const video = ref<VideoDetail | null>(null);
const loading = ref(false);
const playbackErrorMessage = ref("");

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value)
});

const playbackUrl = computed(() => {
  if (!video.value || !authStore.token.value) {
    return "";
  }

  return `${apiBaseUrl}/videos/${video.value.id}/playback?token=${encodeURIComponent(authStore.token.value)}`;
});

async function fetchVideoDetail(videoId: string) {
  loading.value = true;
  playbackErrorMessage.value = "";

  try {
    video.value = await apiRequest<VideoDetail>(`/videos/${videoId}`, {}, authStore.token.value);
  } catch (error) {
    video.value = null;
    showApiError(error, "视频详情获取失败");
  } finally {
    loading.value = false;
  }
}

function closeDialog() {
  dialogVisible.value = false;
}

function handlePlaybackError() {
  playbackErrorMessage.value = "视频播放失败，请刷新页面后重试";
}

watch(
  () => [props.modelValue, props.videoId] as const,
  ([visible, videoId]) => {
    if (!visible || !videoId) {
      if (!visible) {
        video.value = null;
        playbackErrorMessage.value = "";
      }
      return;
    }

    void fetchVideoDetail(videoId);
  },
  { immediate: true }
);
</script>

<template>
  <ElDialog
    v-model="dialogVisible"
    width="min(960px, calc(100vw - 32px))"
    :close-on-click-modal="true"
    :destroy-on-close="true"
    class="video-feed-dialog"
  >
    <template #header>
      <div class="dialog-head">
        <p class="eyebrow">Quick Watch</p>
        <h3>视频预览</h3>
      </div>
    </template>

    <div class="dialog-body">
      <p v-if="loading" class="helper-text">视频详情加载中...</p>

      <div v-if="video" class="dialog-layout">
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
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-actions">
        <button class="ghost-button" type="button" @click="closeDialog">关闭</button>
      </div>
    </template>
  </ElDialog>
</template>

<style scoped>
.dialog-head {
  display: grid;
  gap: 6px;
}

.eyebrow {
  margin: 0;
  font-size: 0.78rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #9a3412;
}

h3 {
  margin: 0;
  color: #102a43;
}

.dialog-body {
  min-height: 220px;
}

.dialog-layout {
  display: grid;
  gap: 16px;
}

.player-card,
.info-card {
  padding: 18px;
  border-radius: 22px;
  background: #f8fbff;
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

.info-row span,
.helper-text {
  color: #52606d;
}

.info-row strong {
  color: #102a43;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
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

.error-text {
  color: #b91c1c;
}

@media (max-width: 720px) {
  .info-card {
    grid-template-columns: 1fr;
  }
}
</style>
