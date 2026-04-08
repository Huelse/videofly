const GIGABYTE_BYTES = 1024 ** 3;

export function formatBytes(sizeBytes: string) {
  const size = Number(sizeBytes);
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }

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

export function quotaBytesToGbInput(sizeBytes: string) {
  const value = Number(sizeBytes) / GIGABYTE_BYTES;
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  return value.toFixed(2).replace(/\.?0+$/, "");
}

export function parseQuotaGbToBytes(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * GIGABYTE_BYTES).toString();
}
