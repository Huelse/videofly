<script setup lang="ts">
import { computed, reactive, ref } from "vue";

import type { UploadSessionState } from "../api";
import { apiRequest } from "../api";
import { authStore } from "../stores/auth";

const form = reactive({
  title: "",
  filename: "",
  mimeType: "video/mp4",
  fileSizeBytes: 8 * 1024 * 1024
});

const uploadSession = ref<UploadSessionState | null>(null);
const selectedFile = ref<File | null>(null);
const message = ref("");
const progress = ref(0);
const cancelRequested = ref(false);
const loading = reactive({
  init: false,
  part: false,
  status: false,
  complete: false,
  cancel: false
});

const partCount = computed(() => {
  if (!selectedFile.value || !uploadSession.value?.partSizeBytes) {
    return 0;
  }

  return Math.ceil(selectedFile.value.size / uploadSession.value.partSizeBytes);
});

function handleFileSelect(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null;
  selectedFile.value = file;

  if (!file) {
    return;
  }

  form.filename = file.name;
  form.mimeType = file.type || "video/mp4";
  form.fileSizeBytes = file.size;
  form.title = form.title || file.name.replace(/\.[^/.]+$/, "");
  progress.value = 0;
  uploadSession.value = null;
  cancelRequested.value = false;
}

async function initializeUpload() {
  if (!selectedFile.value) {
    message.value = "请先选择一个视频文件";
    return;
  }

  loading.init = true;
  message.value = "";

  try {
    uploadSession.value = await apiRequest<UploadSessionState>("/upload/init", {
      method: "POST",
      body: JSON.stringify(form)
    }, authStore.token.value);
    message.value = `上传会话已创建：${uploadSession.value.uploadId}`;
  } catch (error) {
    message.value = error instanceof Error ? error.message : "上传初始化失败";
  } finally {
    loading.init = false;
  }
}

async function uploadSelectedFile() {
  if (!uploadSession.value || !selectedFile.value) {
    return;
  }

  loading.part = true;
  cancelRequested.value = false;

  try {
    const totalParts = Math.ceil(selectedFile.value.size / uploadSession.value.partSizeBytes);

    for (let index = 0; index < totalParts; index += 1) {
      if (cancelRequested.value) {
        message.value = "上传已中止";
        break;
      }

      const partNumber = index + 1;
      const start = index * uploadSession.value.partSizeBytes;
      const end = Math.min(start + uploadSession.value.partSizeBytes, selectedFile.value.size);

      selectedFile.value.slice(start, end);

      uploadSession.value = await apiRequest<UploadSessionState>("/upload/part", {
        method: "POST",
        body: JSON.stringify({ uploadId: uploadSession.value.uploadId, partNumber })
      }, authStore.token.value);

      progress.value = Math.round((partNumber / totalParts) * 100);
    }

    if (!cancelRequested.value) {
      message.value = `已完成 ${totalParts} 个分片的本地切片与上传登记`;
    }
  } catch (error) {
    message.value = error instanceof Error ? error.message : "分片上传失败";
  } finally {
    loading.part = false;
  }
}

async function refreshStatus() {
  if (!uploadSession.value) {
    return;
  }

  loading.status = true;
  try {
    uploadSession.value = await apiRequest<UploadSessionState>(`/upload/status/${uploadSession.value.uploadId}`, {}, authStore.token.value);
  } catch (error) {
    message.value = error instanceof Error ? error.message : "状态获取失败";
  } finally {
    loading.status = false;
  }
}

async function completeUpload() {
  if (!uploadSession.value) {
    return;
  }

  loading.complete = true;
  try {
    await apiRequest("/upload/complete", {
      method: "POST",
      body: JSON.stringify({ uploadId: uploadSession.value.uploadId })
    }, authStore.token.value);
    message.value = "上传已完成";
    await refreshStatus();
  } catch (error) {
    message.value = error instanceof Error ? error.message : "上传完成失败";
  } finally {
    loading.complete = false;
  }
}

async function cancelUpload() {
  if (!uploadSession.value) {
    return;
  }

  loading.cancel = true;
  cancelRequested.value = true;
  try {
    uploadSession.value = await apiRequest<UploadSessionState>("/upload/cancel", {
      method: "DELETE",
      body: JSON.stringify({ uploadId: uploadSession.value.uploadId })
    }, authStore.token.value);
    message.value = "上传已取消";
  } catch (error) {
    message.value = error instanceof Error ? error.message : "取消上传失败";
  } finally {
    loading.cancel = false;
  }
}
</script>

<template>
  <section class="page-panel">
    <div class="page-head">
      <div>
        <p class="eyebrow">Upload</p>
        <h2>上传中心</h2>
      </div>
      <span class="role-badge">{{ authStore.canUpload.value ? "可上传" : "当前角色不可上传" }}</span>
    </div>

    <form class="form-grid" @submit.prevent="initializeUpload">
      <label class="field">
        <span>选择文件</span>
        <input :disabled="!authStore.canUpload.value" accept="video/*,.mp4,.mov,.avi,.mkv" type="file" @change="handleFileSelect" />
      </label>
      <label class="field">
        <span>标题</span>
        <input v-model="form.title" :disabled="!authStore.canUpload.value" />
      </label>
      <label class="field">
        <span>文件名</span>
        <input v-model="form.filename" :disabled="!authStore.canUpload.value" />
      </label>
      <label class="field">
        <span>MIME 类型</span>
        <select v-model="form.mimeType" :disabled="!authStore.canUpload.value">
          <option value="video/mp4">video/mp4</option>
          <option value="video/quicktime">video/quicktime</option>
          <option value="video/x-msvideo">video/x-msvideo</option>
          <option value="video/x-matroska">video/x-matroska</option>
        </select>
      </label>
      <label class="field">
        <span>文件大小</span>
        <input v-model.number="form.fileSizeBytes" :disabled="!authStore.canUpload.value" type="number" min="1" />
      </label>
      <button class="primary-button" :disabled="!authStore.canUpload.value || loading.init">
        {{ loading.init ? "创建中..." : "初始化上传" }}
      </button>
    </form>

    <p v-if="message" class="helper">{{ message }}</p>

    <div v-if="uploadSession" class="session-card">
      <p><strong>Upload ID:</strong> {{ uploadSession.uploadId }}</p>
      <p><strong>状态:</strong> {{ uploadSession.status }}</p>
      <p><strong>总分片数:</strong> {{ partCount }}</p>
      <p><strong>已上传分片:</strong> {{ uploadSession.uploadedParts?.join(", ") || "无" }}</p>
      <p><strong>当前进度:</strong> {{ progress }}%</p>
      <div class="action-row">
        <button class="ghost-button" :disabled="loading.part" @click="uploadSelectedFile">
          {{ loading.part ? "上传中..." : "开始文件上传" }}
        </button>
        <button class="ghost-button" :disabled="loading.status" @click="refreshStatus">
          {{ loading.status ? "刷新中..." : "刷新状态" }}
        </button>
        <button class="ghost-button" :disabled="loading.complete" @click="completeUpload">
          {{ loading.complete ? "完成中..." : "完成上传" }}
        </button>
        <button class="danger-button" :disabled="loading.cancel" @click="cancelUpload">
          {{ loading.cancel ? "取消中..." : "取消上传" }}
        </button>
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
  align-items: center;
  gap: 12px;
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

.role-badge {
  padding: 6px 10px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #475569;
  font-size: 0.82rem;
}

.form-grid {
  display: grid;
  gap: 14px;
}

.field {
  display: grid;
  gap: 8px;
}

.field span {
  font-size: 0.82rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #486581;
}

.field input,
.field select {
  padding: 12px 14px;
  border: 1px solid #d9e2ec;
  border-radius: 14px;
  font: inherit;
}

.primary-button,
.ghost-button,
.danger-button {
  border: none;
  border-radius: 14px;
  padding: 12px 16px;
  font: inherit;
  cursor: pointer;
}

.primary-button {
  background: linear-gradient(135deg, #ea580c, #c2410c);
  color: #fff;
}

.ghost-button {
  background: #eaf2f8;
  color: #102a43;
}

.danger-button {
  background: #fee2e2;
  color: #991b1b;
}

.helper {
  margin: 16px 0 0;
  color: #52606d;
}

.session-card {
  margin-top: 20px;
  padding: 18px;
  border-radius: 20px;
  background: #f8fbff;
}

.action-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 14px;
}
</style>
