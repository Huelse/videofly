<script setup lang="ts">
import { onMounted, ref } from "vue";

import type { AuthUser, Role, UserListResponse } from "../../api";
import { apiRequest } from "../../api";
import UserRoleActions from "../../components/user/UserRoleActions.vue";
import { authStore } from "../../stores/auth";

const users = ref<AuthUser[]>([]);
const loading = ref(false);
const errorMessage = ref("");
const pendingUserId = ref("");

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
            <td class="actions-cell">
              <UserRoleActions
                :role="user.role"
                :pending="pendingUserId === user.id"
                @select="updateRole(user.id, $event)"
              />
            </td>
          </tr>
        </tbody>
      </table>
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

.error-text {
  color: #b91c1c;
}

@media (max-width: 880px) {
  .actions-cell {
    min-width: 220px;
  }
}
</style>
