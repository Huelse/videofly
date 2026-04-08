<script setup lang="ts">
import { reactive, ref } from "vue";
import { ElMessage } from "element-plus";

import type { AuthUser, UserStorageUsage } from "../../api";
import { apiRequest } from "../../api";
import { showAlert, showApiError } from "../../lib/feedback";
import { formatBytes } from "../../lib/storage";
import { authStore } from "../../stores/auth";

const loading = ref(false);
const user = ref<AuthUser | null>(null);
const usage = ref<UserStorageUsage>({
  totalSizeBytes: "0",
  reservedUploadBytes: "0",
  uploadQuotaBytes: "0",
  remainingQuotaBytes: "0",
  videoCount: 0
});
const passwordDialogVisible = ref(false);
const passwordSubmitting = ref(false);
const passwordForm = reactive({
  currentPassword: "",
  newPassword: "",
  confirmPassword: ""
});

async function fetchProfile() {
  loading.value = true;

  try {
    const [currentUser, storageUsage] = await Promise.all([
      apiRequest<AuthUser>("/users/me", {}, authStore.token.value),
      apiRequest<UserStorageUsage>("/users/me/storage", {}, authStore.token.value)
    ]);

    user.value = currentUser;
    usage.value = storageUsage;
  } catch (error) {
    showApiError(error, "我的信息获取失败");
  } finally {
    loading.value = false;
  }
}

function openPasswordDialog() {
  passwordDialogVisible.value = true;
}

function resetPasswordForm() {
  passwordDialogVisible.value = false;
  passwordForm.currentPassword = "";
  passwordForm.newPassword = "";
  passwordForm.confirmPassword = "";
}

function closePasswordDialog() {
  if (passwordSubmitting.value) {
    return;
  }

  resetPasswordForm();
}

async function submitPasswordChange() {
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    await showAlert("两次输入的新密码不一致");
    return;
  }

  passwordSubmitting.value = true;

  try {
    const response = await apiRequest<{ message: string }>(
      "/users/me/password",
      {
        method: "PUT",
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      },
      authStore.token.value
    );

    ElMessage.success(response.message);
    resetPasswordForm();
  } catch (error) {
    showApiError(error, "密码修改失败");
  } finally {
    passwordSubmitting.value = false;
  }
}

void fetchProfile();
</script>

<template>
  <section class="page-panel">
    <div class="page-head">
      <div>
        <p class="eyebrow">My Profile</p>
        <h2>我的信息</h2>
      </div>
      <button class="ghost-button" :disabled="loading" type="button" @click="fetchProfile">
        {{ loading ? "刷新中..." : "刷新信息" }}
      </button>
    </div>

    <div class="panel-grid">
      <article class="info-card">
        <p class="card-title">账号信息</p>
        <div class="info-row">
          <span>邮箱</span>
          <strong>{{ user?.email ?? "--" }}</strong>
        </div>
        <div class="info-row">
          <span>角色</span>
          <strong>{{ user?.role ?? "--" }}</strong>
        </div>
        <div class="info-row">
          <span>注册时间</span>
          <strong>{{ user?.createdAt ? new Date(user.createdAt).toLocaleString() : "--" }}</strong>
        </div>
      </article>

      <article class="info-card">
        <p class="card-title">存储用量</p>
        <div class="usage-value">{{ formatBytes(usage.totalSizeBytes) }} / {{ formatBytes(usage.uploadQuotaBytes) }}</div>
        <p class="usage-caption">当前有效视频 {{ usage.videoCount }} 个</p>
        <p class="usage-caption">待完成上传 {{ formatBytes(usage.reservedUploadBytes) }}</p>
        <p class="usage-caption">剩余额度 {{ formatBytes(usage.remainingQuotaBytes) }}</p>
        <button class="primary-button" type="button" @click="openPasswordDialog">修改密码</button>
      </article>
    </div>

    <ElDialog
      v-model="passwordDialogVisible"
      title="修改密码"
      width="420px"
      :close-on-click-modal="false"
      @close="closePasswordDialog"
    >
      <div class="dialog-form">
        <label class="field">
          <span>当前密码</span>
          <input v-model="passwordForm.currentPassword" type="password" autocomplete="current-password" />
        </label>
        <label class="field">
          <span>新密码</span>
          <input v-model="passwordForm.newPassword" type="password" autocomplete="new-password" />
        </label>
        <label class="field">
          <span>确认新密码</span>
          <input v-model="passwordForm.confirmPassword" type="password" autocomplete="new-password" />
        </label>
      </div>

      <template #footer>
        <div class="dialog-actions">
          <button class="ghost-button" type="button" :disabled="passwordSubmitting" @click="closePasswordDialog">取消</button>
          <button class="primary-button" type="button" :disabled="passwordSubmitting" @click="submitPasswordChange">
            {{ passwordSubmitting ? "提交中..." : "确认修改" }}
          </button>
        </div>
      </template>
    </ElDialog>
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

.panel-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.info-card {
  display: grid;
  gap: 14px;
  padding: 20px;
  border-radius: 22px;
  background: #f8fbff;
}

.card-title {
  margin: 0;
  font-size: 0.82rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #9a3412;
}

.info-row {
  display: grid;
  gap: 8px;
}

.info-row span,
.usage-caption,
.field span {
  color: #52606d;
}

.info-row strong {
  color: #102a43;
}

.usage-value {
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: 700;
  color: #102a43;
}

.usage-caption {
  margin: 0;
}

.ghost-button,
.primary-button {
  border: none;
  border-radius: 14px;
  padding: 12px 16px;
  font: inherit;
  cursor: pointer;
}

.ghost-button {
  background: #eaf2f8;
  color: #102a43;
}

.primary-button {
  background: linear-gradient(135deg, #ea580c, #c2410c);
  color: #fff;
}

.dialog-form {
  display: grid;
  gap: 14px;
}

.field {
  display: grid;
  gap: 8px;
}

.field input {
  padding: 12px 14px;
  border: 1px solid #d9e2ec;
  border-radius: 14px;
  font: inherit;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 780px) {
  .page-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .panel-grid {
    grid-template-columns: 1fr;
  }

  .dialog-actions {
    flex-direction: column-reverse;
  }
}
</style>
