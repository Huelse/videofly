import { ElMessage, ElMessageBox } from "element-plus";

export function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function showApiError(error: unknown, fallback: string) {
  const message = getErrorMessage(error, fallback);
  ElMessage.error(message);
  return message;
}

export async function showAlert(message: string, title = "提示") {
  await ElMessageBox.alert(message, title, {
    type: "warning"
  });
}
