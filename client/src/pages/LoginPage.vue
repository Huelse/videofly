<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRouter, RouterLink } from "vue-router";

import { authStore } from "../stores/auth";

const router = useRouter();
const form = reactive({
  email: "",
  password: ""
});
const errorMessage = ref("");
const loading = ref(false);

async function submit() {
  loading.value = true;
  errorMessage.value = "";

  try {
    await authStore.login(form.email, form.password);
    await router.push({ name: "dashboard-me" });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "登录失败";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="auth-shell">
    <section class="auth-card">
      <div>
        <p class="eyebrow">Login</p>
        <h1>登录后台</h1>
      </div>

      <form class="auth-form" @submit.prevent="submit">
        <label class="field">
          <span>邮箱</span>
          <input v-model="form.email" type="email" autocomplete="username" />
        </label>
        <label class="field">
          <span>密码</span>
          <input v-model="form.password" type="password" autocomplete="current-password" />
        </label>
        <button class="primary-button" :disabled="loading">
          {{ loading ? "登录中..." : "登录并进入后台" }}
        </button>
      </form>

      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
      <p class="helper">
        还没有账号？
        <RouterLink to="/register">去注册</RouterLink>
      </p>
    </section>
  </main>
</template>

<style scoped>
.auth-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}

.auth-card {
  width: min(480px, 100%);
  padding: 32px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.1);
}

.eyebrow,
.field span {
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #9a3412;
}

h1 {
  margin: 12px 0 0;
  color: #102a43;
}

.caption {
  color: #52606d;
}

.auth-form {
  display: grid;
  gap: 14px;
  margin-top: 24px;
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

.primary-button {
  border: none;
  border-radius: 14px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #ea580c, #c2410c);
  color: #fff;
  font: inherit;
  cursor: pointer;
}

.error-text {
  margin-top: 16px;
  color: #b91c1c;
}

.helper {
  margin-top: 16px;
  color: #52606d;
}
</style>
