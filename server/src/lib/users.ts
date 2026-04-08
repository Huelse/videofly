import { type Role, UploadSessionStatus } from "@prisma/client";

export const DEFAULT_UPLOAD_QUOTA_BYTES = 10n * 1024n * 1024n * 1024n;

type SerializedUserInput = {
  id: string;
  email: string;
  role: Role;
  uploadQuotaBytes: bigint;
  createdAt?: Date;
  updatedAt?: Date;
  _count?: {
    videos: number;
  };
};

export function serializeUser(user: SerializedUserInput) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    uploadQuotaBytes: user.uploadQuotaBytes.toString(),
    ...(user.createdAt ? { createdAt: user.createdAt.toISOString() } : {}),
    ...(user.updatedAt ? { updatedAt: user.updatedAt.toISOString() } : {}),
    ...(user._count ? { _count: user._count } : {})
  };
}

export async function getUserStorageUsage(client: any, userId: string) {
  const [videoUsage, reservedUsage] = await Promise.all([
    client.video.aggregate({
      where: {
        uploaderId: userId,
        deletedAt: null
      },
      _sum: {
        sizeBytes: true
      },
      _count: {
        _all: true
      }
    }),
    client.uploadSession.aggregate({
      where: {
        uploaderId: userId,
        status: {
          in: [UploadSessionStatus.INITIATED, UploadSessionStatus.UPLOADING]
        }
      },
      _sum: {
        fileSizeBytes: true
      }
    })
  ]);

  return {
    totalSizeBytes: videoUsage?._sum?.sizeBytes ?? 0n,
    reservedUploadBytes: reservedUsage?._sum?.fileSizeBytes ?? 0n,
    videoCount: videoUsage?._count?._all ?? 0
  };
}

export function getRemainingQuotaBytes(uploadQuotaBytes: bigint, totalSizeBytes: bigint, reservedUploadBytes: bigint) {
  const remaining = uploadQuotaBytes - totalSizeBytes - reservedUploadBytes;
  return remaining > 0n ? remaining : 0n;
}
