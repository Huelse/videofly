import crypto from "node:crypto";

import { Role, VideoStatus } from "@prisma/client";
import { Router, raw } from "express";
import { z } from "zod";

import { HttpError } from "../lib/errors.js";
import {
  abortMultipartUpload,
  buildOssObjectKey,
  completeMultipartUpload,
  headObject,
  initMultipartUpload,
  uploadMultipartPart
} from "../lib/oss.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const ALLOWED_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska"
]);

const DEFAULT_PART_SIZE_BYTES = 8 * 1024 * 1024;
const UPLOAD_SESSION_STATUS = {
  INITIATED: "INITIATED",
  UPLOADING: "UPLOADING",
  COMPLETED: "COMPLETED",
  CANCELED: "CANCELED"
} as const;

const initUploadSchema = z.object({
  title: z.string().min(1).max(200),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  fileSizeBytes: z.coerce.bigint().positive()
});

const uploadPartSchema = z.object({
  uploadId: z.string().min(1),
  partNumber: z.coerce.number().int().positive()
});

const completeUploadSchema = z.object({
  uploadId: z.string().min(1)
});
const EXPIRED_UPLOAD_MESSAGE = "Upload session expired in OSS. Please continue upload to resend all parts.";

const uploadParamsSchema = z.object({
  uploadId: z.string().min(1)
});

export const uploadRouter = Router();

uploadRouter.use(requireAuth, requireRole([Role.UPLOADER, Role.ADMIN]));

type StoredUploadPart = {
  number: number;
  etag: string;
  checksum: string;
};

type SerializedUploadSessionInput = {
  uploadId: string;
  status: string;
  partSizeBytes: number;
  fileSizeBytes: bigint;
  uploadedParts: unknown;
  title?: string;
  filename?: string;
  mimeType?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

type UploadSessionStoreLike = {
  create: (...args: any[]) => Promise<any>;
  findFirst: (...args: any[]) => Promise<any>;
  findMany: (...args: any[]) => Promise<any>;
  findUnique: (...args: any[]) => Promise<any>;
  update: (...args: any[]) => Promise<any>;
};

function getUploadSessionStore(client: { uploadSession: UploadSessionStoreLike }) {
  return client.uploadSession;
}

const uploadSessionStore = getUploadSessionStore(prisma);

function normalizeStoredUploadParts(value: unknown): StoredUploadPart[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item: unknown) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const typedItem = item as { number?: unknown; etag?: unknown; checksum?: unknown };
      const number = Number(typedItem.number);
      const etag = typeof typedItem.etag === "string" ? typedItem.etag.trim() : "";
      const checksum = typeof typedItem.checksum === "string" ? typedItem.checksum.trim().toLowerCase() : "";

      if (!Number.isInteger(number) || number <= 0 || !etag || !checksum) {
        return null;
      }

      return {
        number,
        etag,
        checksum
      };
    })
    .filter((item): item is StoredUploadPart => Boolean(item))
    .sort((a, b) => a.number - b.number);
}

function partNumbers(parts: StoredUploadPart[]) {
  return parts.map((part) => part.number);
}

function serializeUploadSession(session: SerializedUploadSessionInput) {
  const uploadedPartDetails = normalizeStoredUploadParts(session.uploadedParts).map((part) => ({
    number: part.number,
    checksum: part.checksum
  }));

  return {
    uploadId: session.uploadId,
    status: session.status,
    partSizeBytes: session.partSizeBytes,
    fileSizeBytes: session.fileSizeBytes.toString(),
    uploadedParts: uploadedPartDetails.map((part) => part.number),
    uploadedPartDetails,
    totalParts: Math.ceil(Number(session.fileSizeBytes) / session.partSizeBytes),
    ...(session.title ? { title: session.title } : {}),
    ...(session.filename ? { filename: session.filename } : {}),
    ...(session.mimeType ? { mimeType: session.mimeType } : {}),
    ...(session.createdAt ? { createdAt: session.createdAt.toISOString() } : {}),
    ...(session.updatedAt ? { updatedAt: session.updatedAt.toISOString() } : {})
  };
}

uploadRouter.post("/init", async (req, res, next) => {
  try {
    const input = initUploadSchema.parse(req.body);

    if (!ALLOWED_TYPES.has(input.mimeType)) {
      throw new HttpError(400, "Unsupported video type");
    }

    const uploadId = crypto.randomUUID();
    const filename = input.filename;
    const ossKey = buildOssObjectKey(input.filename);
    const existingVideo = await prisma.video.findFirst({
      where: {
        ossKey,
        deletedAt: null
      },
      select: { id: true }
    });

    if (existingVideo) {
      throw new HttpError(409, "Filename already exists. Please rename the file and try again");
    }

    const activeSession = await uploadSessionStore.findFirst({
      where: {
        ossKey,
        status: {
          in: [UPLOAD_SESSION_STATUS.INITIATED, UPLOAD_SESSION_STATUS.UPLOADING]
        }
      },
      select: {
        uploadId: true,
        uploaderId: true,
        partSizeBytes: true,
        status: true,
        uploadedParts: true
      }
    });

    if (activeSession) {
      throw new HttpError(409, "Filename already exists. Please rename the file and try again");
    }

    const ossUploadId = await initMultipartUpload(ossKey, input.mimeType);
    const session = await uploadSessionStore.create({
      data: {
        title: input.title,
        filename,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        uploadId,
        ossKey,
        ossUploadId,
        partSizeBytes: DEFAULT_PART_SIZE_BYTES,
        uploaderId: req.auth!.userId
      },
      select: {
        uploadId: true,
        partSizeBytes: true,
        status: true,
        uploadedParts: true,
        fileSizeBytes: true
      }
    });

    res.status(201).json(serializeUploadSession(session));
  } catch (error) {
    next(error);
  }
});

uploadRouter.post("/part", async (req, res, next) => {
  try {
    const input = uploadPartSchema.parse(req.body);
    const session = await uploadSessionStore.findUnique({
      where: { uploadId: input.uploadId }
    });

    if (!session || session.uploaderId !== req.auth!.userId) {
      throw new HttpError(404, "Upload session not found");
    }

    if (session.status === UPLOAD_SESSION_STATUS.CANCELED) {
      throw new HttpError(400, "Upload session has been canceled");
    }

    if (session.status === UPLOAD_SESSION_STATUS.COMPLETED) {
      throw new HttpError(400, "Upload session has already completed");
    }

    if (!session.ossKey || !session.ossUploadId) {
      throw new HttpError(500, "Upload session is missing OSS metadata");
    }

    res.json({
      uploadId: session.uploadId,
      status: UPLOAD_SESSION_STATUS.UPLOADING
    });
  } catch (error) {
    next(error);
  }
});

uploadRouter.put("/part/upload", raw({ type: "*/*", limit: "20mb" }), async (req, res, next) => {
  try {
    const input = uploadPartSchema.parse(req.query);
    const chunk = req.body;

    if (!Buffer.isBuffer(chunk) || chunk.length === 0) {
      throw new HttpError(400, "Missing upload chunk");
    }

    const session = await uploadSessionStore.findUnique({
      where: { uploadId: input.uploadId },
      select: {
        uploadId: true,
        uploadedParts: true,
        uploaderId: true,
        status: true,
        partSizeBytes: true,
        fileSizeBytes: true,
        ossKey: true,
        ossUploadId: true
      }
    });

    if (!session || session.uploaderId !== req.auth!.userId) {
      throw new HttpError(404, "Upload session not found");
    }

    if (session.status === UPLOAD_SESSION_STATUS.CANCELED) {
      throw new HttpError(400, "Upload session has been canceled");
    }

    if (session.status === UPLOAD_SESSION_STATUS.COMPLETED) {
      throw new HttpError(400, "Upload session has already completed");
    }

    if (!session.ossKey || !session.ossUploadId) {
      throw new HttpError(500, "Upload session is missing OSS metadata");
    }

    const providedChecksum = req.header("x-part-sha256")?.trim().toLowerCase();
    if (!providedChecksum) {
      throw new HttpError(400, "Missing x-part-sha256 header");
    }

    const computedChecksum = crypto.createHash("sha256").update(chunk).digest("hex");
    if (computedChecksum !== providedChecksum) {
      throw new HttpError(400, `Part checksum mismatch for part ${input.partNumber}`);
    }

    if (chunk.length > session.partSizeBytes) {
      throw new HttpError(400, "Chunk exceeds configured part size");
    }

    const etag = await uploadMultipartPart(session.ossKey, session.ossUploadId, input.partNumber, chunk);
    if (!etag) {
      throw new HttpError(502, "OSS upload did not return an ETag");
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT 1
        FROM "UploadSession"
        WHERE "uploadId" = ${input.uploadId}
        FOR UPDATE
      `;

      const txUploadSessionStore = getUploadSessionStore(tx);
      const lockedSession = await txUploadSessionStore.findUnique({
        where: { uploadId: input.uploadId },
        select: {
          status: true,
          uploadedParts: true
        }
      });

      if (!lockedSession) {
        throw new HttpError(404, "Upload session not found");
      }

      if (lockedSession.status === UPLOAD_SESSION_STATUS.CANCELED) {
        throw new HttpError(400, "Upload session has been canceled");
      }

      if (lockedSession.status === UPLOAD_SESSION_STATUS.COMPLETED) {
        throw new HttpError(400, "Upload session has already completed");
      }

      const uploadedParts = normalizeStoredUploadParts(lockedSession?.uploadedParts);
      const dedupedParts = [
        ...uploadedParts.filter((part) => part.number !== input.partNumber),
        {
          number: input.partNumber,
          etag,
          checksum: computedChecksum
        }
      ].sort((a, b) => a.number - b.number);

      return await txUploadSessionStore.update({
        where: { uploadId: input.uploadId },
        data: {
          status: UPLOAD_SESSION_STATUS.UPLOADING,
          uploadedParts: dedupedParts
        },
        select: {
          uploadId: true,
          status: true,
          partSizeBytes: true,
          fileSizeBytes: true,
          uploadedParts: true
        }
      });
    });

    res.json(serializeUploadSession(updated));
  } catch (error) {
    next(error);
  }
});

uploadRouter.post("/complete", async (req, res, next) => {
  try {
    const input = completeUploadSchema.parse(req.body);
    const session = await uploadSessionStore.findUnique({
      where: { uploadId: input.uploadId }
    });

    if (!session || session.uploaderId !== req.auth!.userId) {
      throw new HttpError(404, "Upload session not found");
    }

    if (session.status === UPLOAD_SESSION_STATUS.CANCELED) {
      throw new HttpError(400, "Upload session has been canceled");
    }

    if (session.status === UPLOAD_SESSION_STATUS.COMPLETED) {
      throw new HttpError(400, "Upload session has already completed");
    }

    if (!session.ossKey || !session.ossUploadId) {
      throw new HttpError(500, "Upload session is missing OSS metadata");
    }

    const uploadedParts = normalizeStoredUploadParts(session.uploadedParts);
    const expectedPartCount = Math.ceil(Number(session.fileSizeBytes) / session.partSizeBytes);

    if (uploadedParts.length !== expectedPartCount) {
      throw new HttpError(400, "Upload is incomplete");
    }

    try {
      await completeMultipartUpload(session.ossKey, session.ossUploadId, uploadedParts);
    } catch (error) {
      try {
        await headObject(session.ossKey);
      } catch {
        if ((error as { code?: string } | undefined)?.code === "NoSuchUpload") {
          const replacementOssUploadId = await initMultipartUpload(session.ossKey, session.mimeType);

          await uploadSessionStore.update({
            where: { uploadId: input.uploadId },
            data: {
              status: UPLOAD_SESSION_STATUS.INITIATED,
              ossUploadId: replacementOssUploadId,
              uploadedParts: []
            }
          });

          throw new HttpError(409, EXPIRED_UPLOAD_MESSAGE);
        }

        throw error;
      }
    }

    const video = await prisma.$transaction(async (tx) => {
      const txUploadSessionStore = getUploadSessionStore(tx);
      const existingDeletedVideo = await tx.video.findFirst({
        where: {
          ossKey: session.ossKey,
          deletedAt: {
            not: null
          }
        },
        select: {
          id: true
        }
      });

      if (existingDeletedVideo) {
        await tx.video.delete({
          where: {
            id: existingDeletedVideo.id
          }
        });
      }

      await txUploadSessionStore.update({
        where: { uploadId: input.uploadId },
        data: {
          status: UPLOAD_SESSION_STATUS.COMPLETED,
          uploadedParts
        }
      });

      return await tx.video.create({
        data: {
          title: session.title,
          ossKey: session.ossKey,
          sizeBytes: session.fileSizeBytes,
          status: VideoStatus.READY,
          uploaderId: req.auth!.userId
        },
        select: {
          id: true,
          title: true,
          status: true,
          sizeBytes: true,
          ossKey: true
        }
      });
    });

    res.status(201).json({
      ...video,
      sizeBytes: video.sizeBytes.toString()
    });
  } catch (error) {
    next(error);
  }
});

uploadRouter.delete("/cancel", async (req, res, next) => {
  try {
    const { uploadId } = completeUploadSchema.parse(req.body);
    const session = await uploadSessionStore.findUnique({
      where: { uploadId }
    });

    if (!session || session.uploaderId !== req.auth!.userId) {
      throw new HttpError(404, "Upload session not found");
    }

    if (session.ossKey && session.ossUploadId && session.status !== UPLOAD_SESSION_STATUS.COMPLETED) {
      try {
        await abortMultipartUpload(session.ossKey, session.ossUploadId);
      } catch (error) {
        console.warn("Failed to abort multipart upload in OSS, marking session canceled locally.", error);
      }
    }

    const canceled = await uploadSessionStore.update({
      where: { uploadId },
      data: {
        status: UPLOAD_SESSION_STATUS.CANCELED,
        uploadedParts: []
      },
      select: {
        uploadId: true,
        status: true
      }
    });

    res.json(canceled);
  } catch (error) {
    next(error);
  }
});

uploadRouter.get("/history", async (req, res, next) => {
  try {
    const sessions = await uploadSessionStore.findMany({
      where: {
        uploaderId: req.auth!.userId
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        uploadId: true,
        title: true,
        filename: true,
        mimeType: true,
        status: true,
        partSizeBytes: true,
        fileSizeBytes: true,
        uploadedParts: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json({
      items: (sessions as SerializedUploadSessionInput[]).map((session) => serializeUploadSession(session))
    });
  } catch (error) {
    next(error);
  }
});

uploadRouter.get("/status/:uploadId", async (req, res, next) => {
  try {
    const { uploadId } = uploadParamsSchema.parse(req.params);
    const session = await uploadSessionStore.findUnique({
      where: { uploadId },
      select: {
        uploadId: true,
        status: true,
        partSizeBytes: true,
        uploadedParts: true,
        fileSizeBytes: true,
        uploaderId: true,
        ossKey: true,
        ossUploadId: true
      }
    });

    if (!session || session.uploaderId !== req.auth!.userId) {
      throw new HttpError(404, "Upload session not found");
    }

    res.json(serializeUploadSession(session));
  } catch (error) {
    next(error);
  }
});
