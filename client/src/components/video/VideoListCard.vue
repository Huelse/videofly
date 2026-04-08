<script setup lang="ts">
const props = defineProps<{
  title: string;
  detailTo?: string;
  previewUrl: string;
  previewEnabled: boolean;
  sizeLabel?: string;
  createdAtLabel: string;
}>();

const emit = defineEmits<{
  previewError: [];
  select: [];
}>();

function handlePreviewError() {
  emit("previewError");
}

function handleSelect() {
  emit("select");
}
</script>

<template>
  <article class="video-card">
    <RouterLink v-if="props.detailTo" class="card-link" :to="props.detailTo">
      <div class="card-poster">
        <img
          v-if="props.previewEnabled"
          class="poster-image"
          :src="props.previewUrl"
          :alt="props.title"
          loading="lazy"
          @error="handlePreviewError"
        />
      </div>
    </RouterLink>
    <button v-else class="card-link card-button" type="button" @click="handleSelect">
      <div class="card-poster">
        <img
          v-if="props.previewEnabled"
          class="poster-image"
          :src="props.previewUrl"
          :alt="props.title"
          loading="lazy"
          @error="handlePreviewError"
        />
      </div>
    </button>

    <div class="card-body">
      <p class="card-title">{{ props.title }}</p>
      <div class="meta-row">
        <p v-if="props.sizeLabel" class="meta-line">{{ props.sizeLabel }}</p>
        <p class="meta-line">{{ props.createdAtLabel }}</p>
      </div>
    </div>
  </article>
</template>

<style scoped>
.video-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 20px;
  background: #f8fbff;
  border: 1px solid rgba(148, 163, 184, 0.16);
  min-width: 0;
}

.card-link {
  color: inherit;
  text-decoration: none;
}

.card-button {
  width: 100%;
  border: none;
  padding: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.card-poster {
  position: relative;
  overflow: hidden;
  min-height: 140px;
  display: grid;
  align-content: end;
  gap: 8px;
  padding: 16px;
  background:
    radial-gradient(circle at top right, rgba(255, 200, 87, 0.48), transparent 30%),
    linear-gradient(135deg, #0f172a, #1e3a5f 60%, #244d7c);
  color: #f8fafc;
}

.poster-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card-body {
  display: grid;
  gap: 8px;
  padding: 14px 16px 16px;
}

.card-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.4;
  color: #102a43;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.meta-line {
  margin: 0;
  color: #52606d;
  font-size: 0.88rem;
}
</style>
