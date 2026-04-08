import { computed, ref } from "vue";

import type { AuthUser, LoginResponse } from "../api";
import { apiRequest, tokenStorageKey } from "../api";
import { showApiError } from "../lib/feedback";

const token = ref(localStorage.getItem(tokenStorageKey) ?? "");
const currentUser = ref<AuthUser | null>(null);
const initialized = ref(false);
const statusMessage = ref("");

async function fetchCurrentUser() {
  if (!token.value) {
    currentUser.value = null;
    return;
  }

  try {
    currentUser.value = await apiRequest<AuthUser>("/users/me", {}, token.value);
  } catch (error) {
    currentUser.value = null;
    token.value = "";
    localStorage.removeItem(tokenStorageKey);
    statusMessage.value = showApiError(error, "登录态已失效");
  }
}

export const authStore = {
  token,
  currentUser,
  initialized: false,
  statusMessage,
  isAuthenticated: computed(() => Boolean(token.value)),
  canUpload: computed(() => currentUser.value?.role === "UPLOADER" || currentUser.value?.role === "ADMIN"),
  isAdmin: computed(() => currentUser.value?.role === "ADMIN"),
  async bootstrap() {
    if (initialized.value) {
      return;
    }

    await fetchCurrentUser();
    initialized.value = true;
    this.initialized = true;
  },
  async login(email: string, password: string) {
    const response = await apiRequest<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    token.value = response.token;
    localStorage.setItem(tokenStorageKey, response.token);
    currentUser.value = response.user;
    statusMessage.value = `已登录：${response.user.email}`;
  },
  async register(email: string, password: string) {
    await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    await this.login(email, password);
    statusMessage.value = `注册并登录成功：${email}`;
  },
  async logout() {
    try {
      await apiRequest("/auth/logout", {
        method: "POST"
      }, token.value);
    } catch {
      // Ignore transport failures while clearing local session.
    }

    token.value = "";
    currentUser.value = null;
    localStorage.removeItem(tokenStorageKey);
    statusMessage.value = "已退出登录";
  },
  async refreshCurrentUser() {
    await fetchCurrentUser();
  }
};
