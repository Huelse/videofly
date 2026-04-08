<script setup lang="ts">
import { onMounted, ref } from "vue";

import type { AuthUser, Role, UserListResponse } from "../../api";
import { apiRequest } from "../../api";
import { formatBytes, parseQuotaGbToBytes, quotaBytesToGbInput } from "../../lib/storage";
import { authStore } from "../../stores/auth";

const users = ref<AuthUser[]>([]);
const loading = ref(false);
const errorMessage = ref("");
const pendingUserId = ref("");
const roleDialogVisible = ref(false);
const quotaDialogVisible = ref(false);
const selectedUser = ref<AuthUser | null>(null);
const roleDraft = ref<Role>("VIEWER");
const quotaDraft = ref("");

const roleLabels: Record<Role, string> = {
  VIEWER: "访客",
  UPLOADER: "上传者",
  ADMIN: "管理员"
};

async function fetchUsers() {
  loading.value = true;
  errorMessage.value = "";

  try {
    const response = await apiRequest<UserListResponse>("/users?page=1&pageSize=20", {}, authStore.token.value);
    users.value = response.items;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "用户获取失败";
  } finally {
    loading.value = false;
  }
}

async function updateRole(userId: string, role: Role) {
  if (pendingUserId.value) {
    return;
  }

  pendingUserId.value = userId;
  errorMessage.value = "";

  try {
    await apiRequest(`/users/${userId}/role`, {
      method: "PUT",
      body: JSON.stringify({ role })
    }, authStore.token.value);
    await fetchUsers();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "角色更新失败";
  } finally {
    pendingUserId.value = "";
  }
}

async function updateQuota(userId: string) {
  if (pendingUserId.value) {
    return;
  }

  const uploadQuotaBytes = parseQuotaGbToBytes(quotaDraft.value);
  if (uploadQuotaBytes === null) {
    errorMessage.value = "请输入大于或等于 0 的额度（GB）";
    return;
  }

  pendingUserId.value = userId;
  errorMessage.value = "";

  try {
    await apiRequest(`/users/${userId}/quota`, {
      method: "PUT",
      body: JSON.stringify({ uploadQuotaBytes })
    }, authStore.token.value);
    await fetchUsers();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "上传额度更新失败";
  } finally {
    pendingUserId.value = "";
  }
}

function openRoleDialog(user: AuthUser) {
  if (pendingUserId.value) {
    return;
  }

  selectedUser.value = user;
  roleDraft.value = user.role;
  errorMessage.value = "";
  roleDialogVisible.value = true;
}

function closeRoleDialog() {
  if (pendingUserId.value) {
    return;
  }

  roleDialogVisible.value = false;
  selectedUser.value = null;
}

async function submitRoleUpdate() {
  if (!selectedUser.value) {
    return;
  }

  await updateRole(selectedUser.value.id, roleDraft.value);

  if (!pendingUserId.value) {
    roleDialogVisible.value = false;
    selectedUser.value = null;
  }
}

function openQuotaDialog(user: AuthUser) {
  if (pendingUserId.value) {
    return;
  }

  selectedUser.value = user;
  quotaDraft.value = quotaBytesToGbInput(user.uploadQuotaBytes);
  errorMessage.value = "";
  quotaDialogVisible.value = true;
}

function closeQuotaDialog() {
  if (pendingUserId.value) {
    return;
  }

  quotaDialogVisible.value = false;
  selectedUser.value = null;
  quotaDraft.value = "";
}

async function submitQuotaUpdate() {
  if (!selectedUser.value) {
    return;
  }

  await updateQuota(selectedUser.value.id);

  if (!pendingUserId.value) {
    quotaDialogVisible.value = false;
    selectedUser.value = null;
    quotaDraft.value = "";
  }
}

function formatRole(role: Role) {
  return roleLabels[role];
}

function roleBadgeClass(role: Role) {
  return `role-${role.toLowerCase()}`;
}

onMounted(fetchUsers);
</script>

<template>
  <section class="page-panel">
    <div class="page-head">
      <div>
        <p class="eyebrow">Users</p>
        <h2>用户管理</h2>
      </div>
      <button class="ghost-button" :disabled="loading" @click="fetchUsers">
        {{ loading ? "刷新中..." : "刷新列表" }}
      </button>
    </div>

    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

    <div class="table-shell">
      <table>
        <thead>
          <tr>
            <th>邮箱</th>
            <th>角色</th>
            <th>视频数</th>
            <th>上传额度</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id">
            <td>{{ user.email }}</td>
            <td>
              <span class="role-badge" :class="roleBadgeClass(user.role)">
                {{ formatRole(user.role) }}
              </span>
            </td>
            <td>{{ user._count?.videos ?? 0 }}</td>
            <td class="quota-cell">
              <strong>{{ formatBytes(user.uploadQuotaBytes) }}</strong>
            </td>
            <td class="actions-cell">
              <div class="action-buttons">
                <button class="ghost-button action-button" type="button" :disabled="pendingUserId === user.id" @click="openRoleDialog(user)">
                  修改权限
                </button>
                <button class="ghost-button action-button" type="button" :disabled="pendingUserId === user.id" @click="openQuotaDialog(user)">
                  修改额度
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ElDialog
      v-model="roleDialogVisible"
      title="修改权限"
      width="420px"
      :close-on-click-modal="false"
      @close="closeRoleDialog"
    >
      <div v-if="selectedUser" class="dialog-form">
        <p class="dialog-copy">用户：{{ selectedUser.email }}</p>
        <label class="field">
          <span>角色</span>
          <select v-model="roleDraft" :disabled="pendingUserId === selectedUser.id">
            <option value="VIEWER">访客</option>
            <option value="UPLOADER">上传者</option>
            <option value="ADMIN">管理员</option>
          </select>
        </label>
      </div>

      <template #footer>
        <div class="dialog-actions">
          <button class="ghost-button" type="button" :disabled="Boolean(pendingUserId)" @click="closeRoleDialog">取消</button>
          <button class="primary-button" type="button" :disabled="Boolean(pendingUserId) || !selectedUser" @click="submitRoleUpdate">
            {{ pendingUserId && selectedUser && pendingUserId === selectedUser.id ? "提交中..." : "确认修改" }}
          </button>
        </div>
      </template>
    </ElDialog>

    <ElDialog
      v-model="quotaDialogVisible"
      title="修改额度"
      width="420px"
      :close-on-click-modal="false"
      @close="closeQuotaDialog"
    >
      <div v-if="selectedUser" class="dialog-form">
        <p class="dialog-copy">用户：{{ selectedUser.email }}</p>
        <p class="dialog-copy">当前额度：{{ formatBytes(selectedUser.uploadQuotaBytes) }}</p>
        <label class="field">
          <span>额度（GB）</span>
          <input
            v-model="quotaDraft"
            type="number"
            min="0"
            step="0.1"
            :disabled="pendingUserId === selectedUser.id"
            @keyup.enter="submitQuotaUpdate"
          />
        </label>
      </div>

      <template #footer>
        <div class="dialog-actions">
          <button class="ghost-button" type="button" :disabled="Boolean(pendingUserId)" @click="closeQuotaDialog">取消</button>
          <button class="primary-button" type="button" :disabled="Boolean(pendingUserId) || !selectedUser" @click="submitQuotaUpdate">
            {{ pendingUserId && selectedUser && pendingUserId === selectedUser.id ? "提交中..." : "确认修改" }}
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

.ghost-button {
  border: none;
  border-radius: 14px;
  padding: 12px 16px;
  background: #eaf2f8;
  color: #102a43;
  font: inherit;
  cursor: pointer;
}

.table-shell {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 12px 10px;
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
  vertical-align: middle;
}

.role-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 0.84rem;
  font-weight: 600;
}

.role-viewer {
  background: #eef2ff;
  color: #3730a3;
}

.role-uploader {
  background: #ecfeff;
  color: #155e75;
}

.role-admin {
  background: #fff1f2;
  color: #be123c;
}

.actions-cell {
  min-width: 280px;
}

.quota-cell {
  min-width: 220px;
}

.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.action-button {
  padding: 8px 12px;
}

.error-text {
  color: #b91c1c;
}

.dialog-form {
  display: grid;
  gap: 14px;
}

.dialog-copy,
.field span {
  color: #52606d;
}

.dialog-copy {
  margin: 0;
}

.field {
  display: grid;
  gap: 8px;
}

.field input,
.field select {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 14px;
  padding: 12px 14px;
  color: #102a43;
  font: inherit;
  background: #fff;
  box-sizing: border-box;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.primary-button {
  border: none;
  border-radius: 14px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #ea580c, #f97316);
  color: white;
  font: inherit;
  cursor: pointer;
}

@media (max-width: 880px) {
  .quota-cell,
  .actions-cell {
    min-width: 220px;
  }
}
</style>
