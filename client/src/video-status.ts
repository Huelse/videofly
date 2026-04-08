export function formatVideoStatus(status: string) {
  switch (status) {
    case "PENDING":
      return "待处理";
    case "PROCESSING":
      return "处理中";
    case "READY":
      return "已就绪";
    case "FAILED":
      return "处理失败";
    case "DELETED":
      return "已删除";
    default:
      return status;
  }
}
