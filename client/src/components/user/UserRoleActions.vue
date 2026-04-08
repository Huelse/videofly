<script setup lang="ts">
import type { Role } from "../../api";

const props = defineProps<{
  role: Role;
  pending?: boolean;
}>();

const emit = defineEmits<{
  select: [role: Role];
}>();

const roleOptions: Array<{ value: Role; label: string }> = [
  { value: "VIEWER", label: "访客" },
  { value: "UPLOADER", label: "上传者" },
  { value: "ADMIN", label: "管理员" }
];

function selectRole(role: Role) {
  if (props.pending || role === props.role) {
    return;
  }

  emit("select", role);
}
</script>

<template>
  <div class="role-actions">
    <button
      v-for="option in roleOptions"
      :key="option.value"
      class="role-button"
      :class="[`role-${option.value.toLowerCase()}`, { 'is-current': option.value === props.role }]"
      type="button"
      :disabled="props.pending || option.value === props.role"
      @click="selectRole(option.value)"
    >
      {{ props.pending && option.value !== props.role ? "处理中..." : option.label }}
    </button>
  </div>
</template>

<style scoped>
.role-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.role-button {
  border: none;
  border-radius: 999px;
  padding: 8px 12px;
  font: inherit;
  font-size: 0.84rem;
  cursor: pointer;
  transition:
    transform 0.16s ease,
    opacity 0.16s ease,
    box-shadow 0.16s ease;
}

.role-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.role-button:disabled {
  cursor: not-allowed;
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

.is-current {
  box-shadow: inset 0 0 0 1px currentColor;
  opacity: 0.92;
}
</style>
