export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";
export const tokenStorageKey = "videofly.token";

export type Role = "VIEWER" | "UPLOADER" | "ADMIN";

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    videos: number;
  };
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};

export type UserListResponse = {
  items: AuthUser[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type UserStorageUsage = {
  totalSizeBytes: string;
  videoCount: number;
};

export type UploadSessionState = {
  uploadId: string;
  status: string;
  partSizeBytes: number;
  uploadedParts?: number[];
  fileSizeBytes?: string;
  uploadedPartDetails?: Array<{
    number: number;
    checksum: string;
  }>;
  totalParts?: number;
  title?: string;
  filename?: string;
  mimeType?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type UploadHistoryItem = UploadSessionState;

export type VideoItem = {
  id: string;
  title: string;
  status: string;
  sizeBytes: string;
  createdAt: string;
  playbackUrl?: string;
  uploader: {
    email: string;
  };
};

export type VideoDetail = VideoItem & {
  ossKey: string;
  updatedAt: string;
  uploaderId: string;
  deletedAt?: string | null;
};

export async function apiRequest<T>(path: string, init: RequestInit = {}, token?: string) {
  const headers = new Headers(init.headers);

  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers
  });

  if (response.status === 204) {
    return null as T;
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(payload?.message ?? "Request failed");
  }

  return payload as T;
}
