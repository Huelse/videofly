<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";

import type { VideoDetail } from "../api";
import { apiRequest } from "../api";
import { authStore } from "../stores/auth";

const route = useRoute();
const video = ref<VideoDetail | null>(null);
const loading = ref(false);
const errorMessage = ref("");

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

    <div v-if="video" class="detail-grid">
      <div class="detail-card">
        <span>标题</span>
        <strong>{{ video.title }}</strong>
      </div>
      <div class="detail-card">
        <span>状态</span>
        <strong>{{ video.status }}</strong>
      </div>
      <div class="detail-card">
        <span>大小</span>
        <strong>{{ video.sizeBytes }} bytes</strong>
      </div>
      <div class="detail-card">
        <span>上传者</span>
        <strong>{{ video.uploader.email }}</strong>
      </div>
      <div class="detail-card full">
        <span>OSS Key</span>
        <strong class="mono">{{ video.ossKey }}</strong>
      </div>
      <div class="detail-card">
        <span>创建时间</span>
        <strong>{{ new Date(video.createdAt).toLocaleString() }}</strong>
      </div>
      <div class="detail-card">
        <span>更新时间</span>
        <strong>{{ new Date(video.updatedAt).toLocaleString() }}</strong>
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

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.detail-card {
  display: grid;
  gap: 8px;
  padding: 16px;
  border-radius: 18px;
  background: #f8fbff;
}

.detail-card span {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #486581;
}

.detail-card strong {
  color: #102a43;
}

.detail-card.full {
  grid-column: 1 / -1;
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
  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
