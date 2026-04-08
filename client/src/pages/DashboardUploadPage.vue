<script setup lang="ts">
import type { UploadFile, UploadFiles, UploadRawFile } from "element-plus";
import { computed, reactive, ref } from "vue";
import { useRouter } from "vue-router";

import type { UploadPartTicket, UploadSessionState } from "../api";
import { apiRequest } from "../api";
import { authStore } from "../stores/auth";

const router = useRouter();
const form = reactive({
  title: "",
  filename: "",
  mimeType: "video/mp4",
  fileSizeBytes: 8 * 1024 * 1024
});

const uploadSession = ref<UploadSessionState | null>(null);
const selectedFile = ref<File | null>(null);
const selectedFiles = ref<UploadFile[]>([]);
const message = ref("");
const progress = ref(0);
const cancelRequested = ref(false);
const durationSeconds = ref<number | null>(null);
const videoPosterDataUrl = ref<string>("");
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

const formattedFileSize = computed(() => {
  if (!selectedFile.value) {
    return "--";
  }

  return formatBytes(selectedFile.value.size);
});

const formattedDuration = computed(() => {
  if (durationSeconds.value === null) {
    return "--";
  }

  return formatDuration(durationSeconds.value);
});

const canInitialize = computed(() => {
  return authStore.canUpload.value && Boolean(selectedFile.value) && !loading.init;
});

const isUploadLocked = computed(() => {
  return loading.init || loading.part || loading.complete || loading.cancel || uploadSession.value?.status === "COMPLETED";
});

const canUploadParts = computed(() => {
  return Boolean(uploadSession.value) && uploadSession.value?.status !== "CANCELED" && !loading.part;
});

const canComplete = computed(() => {
  if (!uploadSession.value || loading.complete) {
    return false;
  }

  return progress.value === 100 && uploadSession.value.status !== "COMPLETED" && uploadSession.value.status !== "CANCELED";
});

const canRefresh = computed(() => {
  return Boolean(uploadSession.value) && !loading.status;
});

const canCancel = computed(() => {
  if (!uploadSession.value || loading.cancel) {
    return false;
  }

  return uploadSession.value.status !== "COMPLETED" && uploadSession.value.status !== "CANCELED";
});

const workflowSteps = computed(() => {
  const currentStatus = uploadSession.value?.status;

  return [
    {
      id: "init",
      index: 1,
      title: "初始化",
      description: currentStatus ? "上传会话已创建" : "创建 OSS 上传会话",
      tone: currentStatus ? "done" : "active"
    },
    {
      id: "upload",
      index: 2,
      title: "上传分片",
      description: progress.value > 0 ? `当前进度 ${progress.value}%` : "开始上传视频分片",
      tone: progress.value >= 100 ? "done" : currentStatus ? "active" : "idle"
    },
    {
      id: "complete",
      index: 3,
      title: "完成上传",
      description: currentStatus === "COMPLETED" ? "视频已入库" : "合并分片并完成入库",
      tone: currentStatus === "COMPLETED" ? "done" : progress.value === 100 ? "active" : "idle"
    }
  ];
});

async function handleFileChange(uploadFile: UploadFile, uploadFiles: UploadFiles) {
  if (isUploadLocked.value) {
    message.value = "当前上传流程进行中，暂时不能更换文件";
    return;
  }

  const rawFile = uploadFile.raw as UploadRawFile | undefined;
  selectedFiles.value = uploadFiles.slice(-1);

  if (!rawFile) {
    clearSelection();
    return;
  }

  const file = rawFile as File;
  selectedFile.value = file;
  form.filename = file.name;
  form.mimeType = file.type || "video/mp4";
  form.fileSizeBytes = file.size;
  form.title = file.name.replace(/\.[^/.]+$/, "");
  durationSeconds.value = await readVideoDuration(file);
  videoPosterDataUrl.value = (await readVideoPoster(file)) ?? "";
  progress.value = 0;
  uploadSession.value = null;
  cancelRequested.value = false;
  message.value = "文件已就绪，请确认名称后初始化上传";
}

function handleFileRemove() {
  if (isUploadLocked.value) {
    message.value = "当前上传流程进行中，暂时不能移除文件";
    return;
  }

  clearSelection();
}

function clearSelection() {
  if (isUploadLocked.value) {
    message.value = "当前上传流程进行中，暂时不能清空文件";
    return;
  }

  selectedFile.value = null;
  selectedFiles.value = [];
  durationSeconds.value = null;
  videoPosterDataUrl.value = "";
  form.title = "";
  form.filename = "";
  form.mimeType = "video/mp4";
  form.fileSizeBytes = 8 * 1024 * 1024;
  progress.value = 0;
  uploadSession.value = null;
  cancelRequested.value = false;
}

async function initializeUpload() {
  if (!selectedFile.value) {
    message.value = "请先拖拽或选择一个视频文件";
    return;
  }

  loading.init = true;
  message.value = "";

  try {
    uploadSession.value = await apiRequest<UploadSessionState>(
      "/upload/init",
      {
        method: "POST",
        body: JSON.stringify(form)
      },
      authStore.token.value
    );
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
      const chunk = selectedFile.value.slice(start, end);

      const ticket = await apiRequest<UploadPartTicket>(
        "/upload/part",
        {
          method: "POST",
          body: JSON.stringify({ uploadId: uploadSession.value.uploadId, partNumber })
        },
        authStore.token.value
      );

      await uploadChunkWithRetry(ticket, chunk);
      uploadSession.value.status = ticket.status;
      uploadSession.value.uploadedParts = [...new Set([...(uploadSession.value.uploadedParts ?? []), partNumber])].sort(
        (a, b) => a - b
      );

      progress.value = Math.round((partNumber / totalParts) * 100);
    }

    if (!cancelRequested.value) {
      message.value = `已完成 ${totalParts} 个分片上传`;
    }
  } catch (error) {
    message.value = error instanceof Error ? error.message : "分片上传失败";
  } finally {
    loading.part = false;
  }
}

async function uploadChunkWithRetry(ticket: UploadPartTicket, chunk: Blob, maxAttempts = 3) {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(ticket.url, {
        method: ticket.method,
        body: chunk,
        headers: {
          "Content-Type": selectedFile.value?.type || "application/octet-stream"
        }
      });

      if (!response.ok) {
        throw new Error(`OSS upload failed with status ${response.status}`);
      }

      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("OSS upload failed");

      if (attempt === maxAttempts) {
        break;
      }

      const delay = 500 * 2 ** (attempt - 1);
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error("OSS upload failed");
}

async function refreshStatus() {
  if (!uploadSession.value) {
    return;
  }

  loading.status = true;
  try {
    uploadSession.value = await apiRequest<UploadSessionState>(
      `/upload/status/${uploadSession.value.uploadId}`,
      {},
      authStore.token.value
    );
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
    const completedVideo = await apiRequest<{ id: string }>(
      "/upload/complete",
      {
        method: "POST",
        body: JSON.stringify({ uploadId: uploadSession.value.uploadId })
      },
      authStore.token.value
    );
    message.value = "上传已完成";
    await refreshStatus();
    await router.push(`/dashboard/videos/${completedVideo.id}`);
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
    uploadSession.value = await apiRequest<UploadSessionState>(
      "/upload/cancel",
      {
        method: "DELETE",
        body: JSON.stringify({ uploadId: uploadSession.value.uploadId })
      },
      authStore.token.value
    );
    message.value = "上传已取消";
  } catch (error) {
    message.value = error instanceof Error ? error.message : "取消上传失败";
  } finally {
    loading.cancel = false;
  }
}

async function readVideoDuration(file: File) {
  return await new Promise<number | null>((resolve) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : null;
      URL.revokeObjectURL(objectUrl);
      resolve(duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    video.src = objectUrl;
  });
}

async function readVideoPoster(file: File) {
  return await new Promise<string | null>((resolve) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    video.onloadeddata = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      const context = canvas.getContext("2d");

      if (!context) {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const poster = canvas.toDataURL("image/jpeg", 0.85);
      URL.revokeObjectURL(objectUrl);
      resolve(poster);
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };

    video.src = objectUrl;
  });
}

function formatBytes(size: number) {
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

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
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

    <div class="top-actions">
      <button class="primary-button" :disabled="!canInitialize" @click="initializeUpload">
        {{ loading.init ? "步骤 1 创建中..." : "步骤 1 初始化上传" }}
      </button>
      <button class="ghost-button" :disabled="!canUploadParts" @click="uploadSelectedFile">
        {{ loading.part ? "步骤 2 上传中..." : "步骤 2 上传分片" }}
      </button>
      <button class="ghost-button" :disabled="!canRefresh" @click="refreshStatus">
        {{ loading.status ? "刷新中..." : "刷新状态" }}
      </button>
      <button class="ghost-button" :disabled="!canComplete" @click="completeUpload">
        {{ loading.complete ? "步骤 3 完成中..." : "步骤 3 完成上传" }}
      </button>
      <button class="danger-button" :disabled="!canCancel" @click="cancelUpload">
        {{ loading.cancel ? "取消中..." : "取消上传" }}
      </button>
    </div>

    <div class="progress-panel">
      <div class="step-row">
        <div v-for="step in workflowSteps" :key="step.id" class="step-card" :class="`step-${step.tone}`">
          <span class="step-index">0{{ step.index }}</span>
          <strong>{{ step.title }}</strong>
          <small>{{ step.description }}</small>
        </div>
      </div>
      <div>
        <p class="section-label">上传进度</p>
        <p class="progress-copy">{{ uploadSession ? `${uploadSession.uploadedParts?.length ?? 0} / ${partCount} 个分片` : "等待初始化上传" }}</p>
      </div>
      <el-progress :percentage="progress" :stroke-width="14" :show-text="true" />
    </div>

    <div class="upload-grid">
      <div class="dropzone-card">
        <div v-if="selectedFile" class="poster-panel">
          <img v-if="videoPosterDataUrl" :src="videoPosterDataUrl" :alt="form.title || form.filename" class="poster-image" />
          <div v-else class="poster-fallback">
            <strong>{{ form.filename }}</strong>
            <span>未能提取首帧预览</span>
          </div>
          <button class="ghost-button" type="button" :disabled="isUploadLocked" @click="clearSelection">重新选择文件</button>
        </div>
        <el-upload
          v-else
          v-model:file-list="selectedFiles"
          drag
          :auto-upload="false"
          :limit="1"
          :multiple="false"
          :show-file-list="false"
          :disabled="!authStore.canUpload.value || isUploadLocked"
          accept="video/*,.mp4,.mov,.avi,.mkv"
          @change="handleFileChange"
          @remove="handleFileRemove"
          @exceed="() => (message = '一次只能选择一个视频文件')"
        >
          <div class="drag-content">
            <strong>拖拽视频到这里</strong>
            <span>或点击选择 MP4 / MOV / AVI / MKV 文件</span>
          </div>
        </el-upload>
      </div>

      <div class="meta-card">
        <div class="meta-head">
          <p class="section-label">文件信息</p>
          <button v-if="selectedFile" class="ghost-button" type="button" :disabled="isUploadLocked" @click="clearSelection">清空选择</button>
        </div>

        <div v-if="selectedFile" class="meta-grid">
          <label class="field">
            <span>自定义名称</span>
            <input v-model="form.title" :disabled="!authStore.canUpload.value" placeholder="输入上传后展示的名称" />
          </label>
          <div class="info-row">
            <span>原始文件名</span>
            <strong>{{ form.filename }}</strong>
          </div>
          <div class="info-row">
            <span>文件大小</span>
            <strong>{{ formattedFileSize }}</strong>
          </div>
          <div class="info-row">
            <span>视频时长</span>
            <strong>{{ formattedDuration }}</strong>
          </div>
          <div class="info-row">
            <span>MIME 类型</span>
            <strong>{{ form.mimeType }}</strong>
          </div>
        </div>

        <p v-else class="helper">还没有选择文件，拖拽视频后将在这里显示大小、时长和自定义名称。</p>
      </div>
    </div>

    <p v-if="message" class="helper">{{ message }}</p>

    <div v-if="uploadSession" class="session-card">
      <p><strong>Upload ID:</strong> {{ uploadSession.uploadId }}</p>
      <p><strong>状态:</strong> {{ uploadSession.status }}</p>
      <p><strong>总分片数:</strong> {{ partCount }}</p>
      <p><strong>已上传分片:</strong> {{ uploadSession.uploadedParts?.join(", ") || "无" }}</p>
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

.upload-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
  gap: 18px;
}

.top-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}

.progress-panel {
  display: grid;
  gap: 14px;
  margin-bottom: 18px;
  padding: 18px;
  border-radius: 22px;
  background: #f8fbff;
}

.step-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.step-card {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 16px;
  background: white;
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.step-card strong {
  color: #102a43;
}

.step-card small {
  color: #52606d;
}

.step-index {
  font-size: 0.78rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #486581;
}

.step-active {
  border-color: rgba(14, 116, 144, 0.35);
  background: linear-gradient(135deg, #f0f9ff 0%, #ecfeff 100%);
}

.step-done {
  border-color: rgba(15, 118, 110, 0.28);
  background: linear-gradient(135deg, #ecfdf5 0%, #f0fdfa 100%);
}

.step-idle {
  opacity: 0.72;
}

.progress-copy {
  margin: 6px 0 0;
  color: #52606d;
}

.dropzone-card,
.meta-card,
.session-card {
  padding: 18px;
  border-radius: 22px;
  background: #f8fbff;
}

.drag-content {
  display: grid;
  gap: 8px;
  padding: 18px 0;
  color: #102a43;
}

.poster-panel {
  display: grid;
  gap: 14px;
}

.poster-image,
.poster-fallback {
  width: 100%;
  min-height: 220px;
  border-radius: 18px;
  background: linear-gradient(135deg, #dbeafe 0%, #ecfeff 100%);
}

.poster-image {
  display: block;
  object-fit: cover;
}

.poster-fallback {
  display: grid;
  place-content: center;
  gap: 8px;
  padding: 24px;
  text-align: center;
  color: #102a43;
}

.drag-content strong {
  font-size: 1.05rem;
}

.drag-content span {
  color: #52606d;
}

:deep(.el-upload) {
  width: 100%;
}

:deep(.el-upload-dragger) {
  width: 100%;
  min-height: 220px;
  border-radius: 18px;
  border: 1.5px dashed rgba(15, 118, 110, 0.35);
  background:
    radial-gradient(circle at top, rgba(20, 184, 166, 0.12), transparent 45%),
    linear-gradient(135deg, #f5fbff 0%, #eefaf6 100%);
}

.meta-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.section-label {
  margin: 0;
  font-size: 0.8rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #486581;
}

.meta-grid {
  display: grid;
  gap: 14px;
}

.field {
  display: grid;
  gap: 8px;
}

.field span,
.info-row span {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #486581;
}

.field input {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 12px;
  padding: 12px 14px;
  font: inherit;
  background: white;
}

.info-row {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 16px;
  background: white;
}

.info-row strong {
  color: #102a43;
  word-break: break-word;
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

.primary-button:disabled,
.ghost-button:disabled,
.danger-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.primary-button {
  background: linear-gradient(135deg, #0f766e, #0f172a);
  color: white;
}

.ghost-button {
  background: #eaf2f8;
  color: #102a43;
}

.danger-button {
  background: rgba(185, 28, 28, 0.12);
  color: #b91c1c;
}

.helper {
  color: #52606d;
}

@media (max-width: 900px) {
  .upload-grid {
    grid-template-columns: 1fr;
  }

  .step-row {
    grid-template-columns: 1fr;
  }
}
</style>
