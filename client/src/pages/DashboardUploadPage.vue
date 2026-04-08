<script setup lang="ts">
import type { UploadFile, UploadFiles, UploadRawFile } from "element-plus";
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";

import type { UploadHistoryItem, UploadSessionState } from "../api";
import { apiBaseUrl, apiRequest } from "../api";
import { authStore } from "../stores/auth";

const router = useRouter();
const PARALLEL_UPLOAD_WORKERS = 4;
const PART_UPLOAD_RETRY_COUNT = 3;
const MAX_VALIDATION_REUPLOAD_PASSES = 2;
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
const pauseRequested = ref(false);
const durationSeconds = ref<number | null>(null);
const videoPreviewUrl = ref<string>("");
const videoPosterDataUrl = ref<string>("");
const previewVideoRef = ref<HTMLVideoElement | null>(null);
const uploadHistory = ref<UploadHistoryItem[]>([]);
const uploadRuntimeState = ref<"idle" | "uploading" | "paused">("idle");
const loading = reactive({
  init: false,
  part: false,
  status: false,
  complete: false,
  cancel: false,
  history: false
});
const activeWorkers = new Set<Worker>();
const selectedFilePartChecksumCache = new Map<number, string>();

const isUploading = computed(() => uploadRuntimeState.value === "uploading");
const isPaused = computed(() => uploadRuntimeState.value === "paused");

const partCount = computed(() => {
  if (selectedFile.value && uploadSession.value?.partSizeBytes) {
    return Math.ceil(selectedFile.value.size / uploadSession.value.partSizeBytes);
  }

  return uploadSession.value?.totalParts ?? 0;
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
  return (
    authStore.canUpload.value &&
    Boolean(selectedFile.value) &&
    !loading.init &&
    uploadRuntimeState.value === "idle" &&
    (!uploadSession.value || uploadSession.value.status === "COMPLETED" || uploadSession.value.status === "CANCELED")
  );
});

const isUploadLocked = computed(() => {
  return uploadRuntimeState.value !== "idle" || loading.init || loading.complete || loading.cancel;
});

const canUploadParts = computed(() => {
  return (
    Boolean(uploadSession.value) &&
    Boolean(selectedFile.value) &&
    uploadRuntimeState.value !== "uploading" &&
    uploadSession.value?.status !== "CANCELED" &&
    uploadSession.value?.status !== "COMPLETED" &&
    !loading.part &&
    !loading.cancel
  );
});

const canPause = computed(() => {
  return uploadRuntimeState.value === "uploading" && !loading.cancel;
});

const canComplete = computed(() => {
  if (!uploadSession.value || loading.complete) {
    return false;
  }

  return (
    uploadRuntimeState.value === "idle" &&
    progress.value === 100 &&
    uploadSession.value.status !== "COMPLETED" &&
    uploadSession.value.status !== "CANCELED"
  );
});

const canRefresh = computed(() => {
  return Boolean(uploadSession.value) && uploadRuntimeState.value === "idle" && !loading.status;
});

const canCancel = computed(() => {
  if (!uploadSession.value || loading.cancel) {
    return false;
  }

  return uploadSession.value.status !== "COMPLETED" && uploadSession.value.status !== "CANCELED";
});

function isSessionReadyToComplete(session: UploadSessionState | null) {
  if (!session || session.status === "COMPLETED" || session.status === "CANCELED") {
    return false;
  }

  const totalParts = session.totalParts ?? Math.ceil(Number(session.fileSizeBytes ?? 0) / session.partSizeBytes);
  return totalParts > 0 && (session.uploadedParts?.length ?? 0) >= totalParts;
}

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
  resetChecksumCache();
  resetPreviewUrl();
  selectedFile.value = file;
  form.filename = file.name;
  form.mimeType = file.type || "video/mp4";
  form.fileSizeBytes = file.size;
  form.title = file.name.replace(/\.[^/.]+$/, "");
  videoPreviewUrl.value = URL.createObjectURL(file);
  durationSeconds.value = await readVideoDuration(file);
  videoPosterDataUrl.value = (await readVideoPoster(file)) ?? "";
  progress.value = 0;
  cancelRequested.value = false;
  pauseRequested.value = false;
  uploadRuntimeState.value = "idle";

  if (uploadSession.value && !matchesSelectedFile(uploadSession.value)) {
    uploadSession.value = null;
  }

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
  resetChecksumCache();
  resetPreviewUrl();
  videoPosterDataUrl.value = "";
  form.title = "";
  form.filename = "";
  form.mimeType = "video/mp4";
  form.fileSizeBytes = 8 * 1024 * 1024;
  progress.value = 0;
  uploadSession.value = null;
  cancelRequested.value = false;
  pauseRequested.value = false;
  uploadRuntimeState.value = "idle";
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
    syncProgressFromSession(uploadSession.value);
    await fetchUploadHistory();
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

  pausePreviewPlayback();
  loading.part = true;
  cancelRequested.value = false;
  pauseRequested.value = false;
  uploadRuntimeState.value = "uploading";
  message.value = "";

  try {
    const file = selectedFile.value;
    let validationPass = 0;
    let pendingPartNumbers: number[] = [];
    let totalParts = 0;

    do {
      const session: UploadSessionState | null = uploadSession.value;
      if (!session) {
        throw new Error("Upload session not found");
      }

      totalParts = Math.ceil(file.size / session.partSizeBytes);
      const invalidPartNumbers = await findInvalidUploadedParts(file, session);

      if (invalidPartNumbers.length > 0) {
        const invalidSet = new Set(invalidPartNumbers);
        uploadSession.value = {
          ...session,
          uploadedParts: (session.uploadedParts ?? []).filter((partNumber: number) => !invalidSet.has(partNumber)),
          uploadedPartDetails: (session.uploadedPartDetails ?? []).filter((part: { number: number; checksum: string }) => !invalidSet.has(part.number))
        };
        syncProgressFromSession(uploadSession.value);
        message.value = `检测到 ${invalidPartNumbers.length} 个异常分片，正在按分片重传`;
      }

      const currentSession = uploadSession.value;
      if (!currentSession) {
        throw new Error("Upload session not found");
      }

      const completedParts = new Set<number>(currentSession.uploadedParts ?? []);
      pendingPartNumbers = Array.from({ length: totalParts }, (_, index) => index + 1).filter(
        (partNumber) => !completedParts.has(partNumber)
      );

      if (pendingPartNumbers.length === 0) {
        break;
      }

      let queueIndex = 0;
      const runnerCount = Math.min(PARALLEL_UPLOAD_WORKERS, pendingPartNumbers.length);

      await Promise.all(
        Array.from({ length: runnerCount }, async () => {
          while (!cancelRequested.value && !pauseRequested.value) {
            const partNumber = pendingPartNumbers[queueIndex];
            queueIndex += 1;

            if (!partNumber) {
              return;
            }

            await uploadSinglePart(file, uploadSession.value!.uploadId, uploadSession.value!.partSizeBytes, partNumber, totalParts);
          }
        })
      );

      if (cancelRequested.value) {
        uploadRuntimeState.value = "idle";
        message.value = "上传已中止";
        await fetchUploadHistory();
        return;
      }

      if (pauseRequested.value) {
        uploadRuntimeState.value = "paused";
        message.value = "上传已暂停，可继续上传";
        await fetchUploadHistory();
        return;
      }

      validationPass += 1;
    } while (pendingPartNumbers.length > 0 && validationPass <= MAX_VALIDATION_REUPLOAD_PASSES);

    if (uploadSession.value) {
      const invalidPartNumbers = await findInvalidUploadedParts(file, uploadSession.value);

      if (invalidPartNumbers.length > 0) {
        const invalidSet = new Set(invalidPartNumbers);
        uploadSession.value = {
          ...uploadSession.value,
          uploadedParts: (uploadSession.value.uploadedParts ?? []).filter((partNumber) => !invalidSet.has(partNumber)),
          uploadedPartDetails: (uploadSession.value.uploadedPartDetails ?? []).filter((part) => !invalidSet.has(part.number))
        };
        uploadRuntimeState.value = "idle";
        syncProgressFromSession(uploadSession.value);
        message.value = `仍有 ${invalidPartNumbers.length} 个分片校验失败，请继续上传重传`;
        await fetchUploadHistory();
        return;
      }
    }

    uploadRuntimeState.value = "idle";
    syncProgressFromSession(uploadSession.value);

    if (isSessionReadyToComplete(uploadSession.value)) {
      message.value = `已完成 ${totalParts} 个分片上传，正在合并并入库`;
      await finalizeUploadSession(uploadSession.value.uploadId);
      return;
    }

    message.value = `已完成 ${totalParts} 个分片上传`;
    await fetchUploadHistory();
  } catch (error) {
    uploadRuntimeState.value = "idle";
    message.value = error instanceof Error ? error.message : "分片上传失败";
  } finally {
    terminateActiveWorkers();
    loading.part = false;
  }
}

async function uploadSinglePart(file: File, uploadId: string, partSizeBytes: number, partNumber: number, totalParts: number) {
  const start = (partNumber - 1) * partSizeBytes;
  const end = Math.min(start + partSizeBytes, file.size);
  const chunk = file.slice(start, end, file.type || "application/octet-stream");

  if (cancelRequested.value) {
    return;
  }

  const session = await uploadChunkInWorker(uploadId, chunk, partNumber, file.type || "application/octet-stream");

  if (cancelRequested.value) {
    return;
  }

  uploadSession.value = session;
  progress.value = Math.round(((uploadSession.value.uploadedParts?.length ?? 0) / totalParts) * 100);
}

async function uploadChunkInWorker(uploadId: string, chunk: Blob, partNumber: number, contentType: string) {
  return await new Promise<UploadSessionState>((resolve, reject) => {
    const worker = new Worker(new URL("../workers/upload-part.worker.ts", import.meta.url), {
      type: "module"
    });

    activeWorkers.add(worker);

    const cleanup = () => {
      activeWorkers.delete(worker);
      worker.terminate();
    };

    worker.onmessage = (
      event: MessageEvent<{ type: string; partNumber: number; session?: UploadSessionState; message?: string }>
    ) => {
      const payload = event.data;
      cleanup();

      if (payload.type === "success" && payload.session) {
        resolve(payload.session);
        return;
      }

      reject(new Error(payload.message ?? `Part ${partNumber} upload failed`));
    };

    worker.onerror = () => {
      cleanup();
      reject(new Error(`Part ${partNumber} worker failed`));
    };

    worker.postMessage({
      type: "upload",
      partNumber,
      chunk,
      method: "PUT",
      url: `${apiBaseUrl}/upload/part/upload?uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`,
      token: authStore.token.value ?? "",
      contentType,
      maxAttempts: PART_UPLOAD_RETRY_COUNT
    });
  });
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
    syncProgressFromSession(uploadSession.value);
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
    if (selectedFile.value) {
      const invalidPartNumbers = await findInvalidUploadedParts(selectedFile.value, uploadSession.value);

      if (invalidPartNumbers.length > 0) {
        const invalidSet = new Set(invalidPartNumbers);
        uploadSession.value = {
          ...uploadSession.value,
          uploadedParts: (uploadSession.value.uploadedParts ?? []).filter((partNumber) => !invalidSet.has(partNumber)),
          uploadedPartDetails: (uploadSession.value.uploadedPartDetails ?? []).filter((part) => !invalidSet.has(part.number))
        };
        syncProgressFromSession(uploadSession.value);
        message.value = `检测到 ${invalidPartNumbers.length} 个异常分片，请点击继续上传进行重传`;
        return;
      }
    }

    await finalizeUploadSession(uploadSession.value.uploadId, true);
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
  pauseRequested.value = false;
  try {
    uploadSession.value = await apiRequest<UploadSessionState>(
      "/upload/cancel",
      {
        method: "DELETE",
        body: JSON.stringify({ uploadId: uploadSession.value.uploadId })
      },
      authStore.token.value
    );
    uploadRuntimeState.value = "idle";
    syncProgressFromSession(uploadSession.value);
    await fetchUploadHistory();
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
    let settled = false;

    const finalize = (value: string | null) => {
      if (settled) {
        return;
      }

      settled = true;
      URL.revokeObjectURL(objectUrl);
      resolve(value);
    };

    const captureFrame = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      const context = canvas.getContext("2d");

      if (!context) {
        finalize(null);
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      finalize(canvas.toDataURL("image/jpeg", 0.85));
    };

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const targetTime = video.duration > 1 ? 1 : 0.1;

      if (targetTime > 0) {
        video.currentTime = targetTime;
        return;
      }

      captureFrame();
    };
    video.onseeked = () => {
      captureFrame();
    };

    video.onerror = () => {
      finalize(null);
    };

    video.src = objectUrl;
  });
}

function resetPreviewUrl() {
  pausePreviewPlayback();

  if (!videoPreviewUrl.value) {
    return;
  }

  URL.revokeObjectURL(videoPreviewUrl.value);
  videoPreviewUrl.value = "";
}

function pausePreviewPlayback() {
  previewVideoRef.value?.pause();
}

function terminateActiveWorkers() {
  for (const worker of activeWorkers) {
    worker.terminate();
  }

  activeWorkers.clear();
}

function resetChecksumCache() {
  selectedFilePartChecksumCache.clear();
}

function syncProgressFromSession(session: UploadSessionState | null) {
  if (!session || !partCount.value) {
    progress.value = 0;
    return;
  }

  progress.value = Math.round(((session.uploadedParts?.length ?? 0) / partCount.value) * 100);
}

function matchesSelectedFile(session: UploadSessionState) {
  if (!selectedFile.value) {
    return false;
  }

  return (
    session.filename === selectedFile.value.name &&
    Number(session.fileSizeBytes ?? 0) === selectedFile.value.size &&
    (!session.mimeType || session.mimeType === selectedFile.value.type || !selectedFile.value.type)
  );
}

async function sha256Hex(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function getLocalPartChecksum(file: File, partSizeBytes: number, partNumber: number) {
  const cached = selectedFilePartChecksumCache.get(partNumber);
  if (cached) {
    return cached;
  }

  const start = (partNumber - 1) * partSizeBytes;
  const end = Math.min(start + partSizeBytes, file.size);
  const checksum = await sha256Hex(file.slice(start, end));
  selectedFilePartChecksumCache.set(partNumber, checksum);
  return checksum;
}

async function findInvalidUploadedParts(file: File, session: UploadSessionState) {
  const details = session.uploadedPartDetails ?? [];
  const invalidPartNumbers: number[] = [];

  for (const detail of details) {
    const checksum = await getLocalPartChecksum(file, session.partSizeBytes, detail.number);
    if (checksum !== detail.checksum) {
      invalidPartNumbers.push(detail.number);
    }
  }

  return invalidPartNumbers;
}

function pauseUpload() {
  if (!canPause.value) {
    return;
  }

  pauseRequested.value = true;
  message.value = "正在暂停上传，会在当前分片完成后停止";
}

async function fetchUploadHistory() {
  if (!authStore.token.value) {
    return;
  }

  loading.history = true;
  try {
    const response = await apiRequest<{ items: UploadHistoryItem[] }>("/upload/history", {}, authStore.token.value);
    uploadHistory.value = response.items;
  } catch (error) {
    message.value = error instanceof Error ? error.message : "上传历史获取失败";
  } finally {
    loading.history = false;
  }
}

function applyHistorySession(item: UploadHistoryItem) {
  uploadSession.value = item;
  form.title = item.title ?? "";
  form.filename = item.filename ?? "";
  form.mimeType = item.mimeType ?? "video/mp4";
  form.fileSizeBytes = Number(item.fileSizeBytes ?? 0);
  uploadRuntimeState.value = "idle";
  pauseRequested.value = false;
  cancelRequested.value = false;
  syncProgressFromSession(item);
}

async function continueHistoryUpload(item: UploadHistoryItem) {
  applyHistorySession(item);

  if (isSessionReadyToComplete(item)) {
    message.value = `检测到历史会话分片已齐，正在完成上传：${item.uploadId}`;
    await finalizeUploadSession(item.uploadId);
    return;
  }

  if (!matchesSelectedFile(item)) {
    message.value = `已载入历史会话，请重新选择同名文件 ${item.filename ?? ""} 后继续上传`;
    return;
  }

  message.value = `正在恢复历史会话：${item.uploadId}`;
  await uploadSelectedFile();
}

async function finalizeUploadSession(uploadId: string, redirectToVideo = false) {
  const completedVideo = await apiRequest<{ id: string }>(
    "/upload/complete",
    {
      method: "POST",
      body: JSON.stringify({ uploadId })
    },
    authStore.token.value
  );

  if (uploadSession.value?.uploadId === uploadId) {
    uploadSession.value = {
      ...uploadSession.value,
      status: "COMPLETED"
    };
    syncProgressFromSession(uploadSession.value);
  }

  await fetchUploadHistory();
  message.value = "上传已完成并已入库";

  if (redirectToVideo) {
    await router.push(`/dashboard/videos/${completedVideo.id}`);
  }
}

async function cancelHistoryUpload(item: UploadHistoryItem) {
  if (uploadRuntimeState.value === "uploading") {
    return;
  }

  loading.cancel = true;
  try {
    await apiRequest<UploadSessionState>(
      "/upload/cancel",
      {
        method: "DELETE",
        body: JSON.stringify({ uploadId: item.uploadId })
      },
      authStore.token.value
    );

    if (uploadSession.value?.uploadId === item.uploadId) {
      uploadSession.value = {
        ...item,
        status: "CANCELED",
        uploadedParts: [],
        uploadedPartDetails: []
      };
      syncProgressFromSession(uploadSession.value);
      uploadRuntimeState.value = "idle";
    }

    await fetchUploadHistory();
    message.value = `已取消历史会话：${item.uploadId}`;
  } catch (error) {
    message.value = error instanceof Error ? error.message : "取消历史上传失败";
  } finally {
    loading.cancel = false;
  }
}

onMounted(async () => {
  await fetchUploadHistory();
});

onBeforeUnmount(() => {
  resetPreviewUrl();
  resetChecksumCache();
  terminateActiveWorkers();
});

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
        {{ loading.part ? "分片处理中..." : isPaused ? "继续上传" : "步骤 2 上传分片" }}
      </button>
      <button class="ghost-button" :disabled="!canPause" @click="pauseUpload">
        暂停上传
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
          <div class="preview-media">
            <video
              v-if="videoPreviewUrl"
              ref="previewVideoRef"
              :src="videoPreviewUrl"
              :poster="videoPosterDataUrl || undefined"
              class="preview-video"
              :class="{ 'preview-video-disabled': isUploading }"
              :controls="!isUploading"
              playsinline
              preload="metadata"
            />
            <img v-else-if="videoPosterDataUrl" :src="videoPosterDataUrl" :alt="form.title || form.filename" class="poster-image" />
            <div v-else class="poster-fallback">
              <strong>{{ form.filename }}</strong>
              <span>当前浏览器未能生成本地预览，可继续上传</span>
            </div>
            <div v-if="isUploading" class="preview-overlay">上传中，预览已锁定</div>
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
            <input v-model="form.title" :disabled="!authStore.canUpload.value || isUploadLocked" placeholder="输入上传后展示的名称" />
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

    <div class="history-card">
      <div class="meta-head">
        <p class="section-label">上传历史</p>
        <button class="ghost-button" type="button" :disabled="loading.history || uploadRuntimeState === 'uploading'" @click="fetchUploadHistory">
          {{ loading.history ? "刷新中..." : "刷新历史" }}
        </button>
      </div>

      <ul v-if="uploadHistory.length > 0" class="history-list">
        <li v-for="item in uploadHistory" :key="item.uploadId" class="history-item">
          <div class="history-copy">
            <strong>{{ item.title || item.filename || item.uploadId }}</strong>
            <span>{{ item.filename }}</span>
            <span>{{ item.status }} · {{ item.uploadedParts?.length ?? 0 }}/{{ item.totalParts ?? 0 }} 个分片</span>
            <span>{{ item.createdAt ? new Date(item.createdAt).toLocaleString() : item.uploadId }}</span>
          </div>
          <div class="history-actions">
            <button
              v-if="item.status !== 'COMPLETED' && item.status !== 'CANCELED'"
              class="ghost-button"
              type="button"
              :disabled="uploadRuntimeState === 'uploading' || loading.cancel"
              @click="continueHistoryUpload(item)"
            >
              {{ isSessionReadyToComplete(item) ? "完成上传" : "继续上传" }}
            </button>
            <button
              v-if="item.status !== 'COMPLETED' && item.status !== 'CANCELED'"
              class="danger-button"
              type="button"
              :disabled="uploadRuntimeState === 'uploading' || loading.cancel"
              @click="cancelHistoryUpload(item)"
            >
              取消
            </button>
          </div>
        </li>
      </ul>

      <p v-else class="helper">当前还没有上传历史。</p>
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
.session-card,
.history-card {
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

.preview-media {
  position: relative;
}

.preview-video,
.poster-image,
.poster-fallback {
  width: 100%;
  min-height: 220px;
  border-radius: 18px;
  background: linear-gradient(135deg, #dbeafe 0%, #ecfeff 100%);
}

.preview-video {
  display: block;
  object-fit: contain;
  background: #020617;
}

.preview-video-disabled {
  pointer-events: none;
}

.preview-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  padding: 24px;
  border-radius: 18px;
  background: rgba(2, 6, 23, 0.42);
  color: white;
  text-align: center;
  pointer-events: none;
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

.history-card {
  margin-top: 18px;
}

.history-list {
  display: grid;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.history-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 16px;
  background: white;
}

.history-copy {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.history-copy strong,
.history-copy span {
  color: #102a43;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.history-copy span {
  color: #52606d;
}

.history-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

@media (max-width: 900px) {
  .upload-grid {
    grid-template-columns: 1fr;
  }

  .step-row {
    grid-template-columns: 1fr;
  }

  .history-item {
    flex-direction: column;
  }

  .history-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
