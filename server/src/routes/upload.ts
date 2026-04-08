import crypto from "node:crypto";
import path from "node:path";

import { Role, VideoStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { HttpError } from "../lib/errors.js";
import {
  abortMultipartUpload,
  buildOssObjectKey,
  completeMultipartUpload,
  getSignedUploadPartUrl,
  initMultipartUpload,
  listUploadedParts
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
const uploadSessionStore = (prisma as typeof prisma & { uploadSession: any }).uploadSession;
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

const uploadParamsSchema = z.object({
  uploadId: z.string().min(1)
});

export const uploadRouter = Router();

uploadRouter.use(requireAuth, requireRole([Role.UPLOADER, Role.ADMIN]));

uploadRouter.post("/init", async (req, res, next) => {
  try {
    const input = initUploadSchema.parse(req.body);

    if (!ALLOWED_TYPES.has(input.mimeType)) {
      throw new HttpError(400, "Unsupported video type");
    }

    const uploadId = crypto.randomUUID();
    const filename = `${uploadId}${path.extname(input.filename) || ".mp4"}`;
    const ossKey = buildOssObjectKey(req.auth!.userId, uploadId, filename);
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
        uploadedParts: true
      }
    });

    res.status(201).json({
      uploadId: session.uploadId,
      partSizeBytes: session.partSizeBytes,
      status: session.status,
      uploadedParts: session.uploadedParts
    });
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

    const updated = await uploadSessionStore.update({
      where: { uploadId: input.uploadId },
      data: {
        status: UPLOAD_SESSION_STATUS.UPLOADING
      },
      select: {
        uploadId: true,
        status: true
      }
    });

    const signedUpload = await getSignedUploadPartUrl(session.ossKey, session.ossUploadId, input.partNumber);

    res.json({
      ...updated,
      ...signedUpload
    });
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

    const uploadedParts = await listUploadedParts(session.ossKey, session.ossUploadId);
    const expectedPartCount = Math.ceil(Number(session.fileSizeBytes) / session.partSizeBytes);

    if (uploadedParts.length !== expectedPartCount) {
      throw new HttpError(400, "Upload is incomplete");
    }

    await completeMultipartUpload(session.ossKey, session.ossUploadId, uploadedParts);

    const [, video] = await prisma.$transaction([
      uploadSessionStore.update({
        where: { uploadId: input.uploadId },
        data: {
          status: UPLOAD_SESSION_STATUS.COMPLETED,
          uploadedParts: uploadedParts.map((part) => part.number)
        }
      }),
      prisma.video.create({
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
      })
    ]);

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
      await abortMultipartUpload(session.ossKey, session.ossUploadId);
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

    let uploadedParts = Array.isArray(session.uploadedParts)
      ? (session.uploadedParts as unknown[])
          .map((value: unknown) => Number(value))
          .filter((value: number) => Number.isInteger(value) && value > 0)
      : [];

    if (
      session.status !== UPLOAD_SESSION_STATUS.CANCELED &&
      session.status !== UPLOAD_SESSION_STATUS.COMPLETED &&
      session.ossKey &&
      session.ossUploadId
    ) {
      const ossParts = await listUploadedParts(session.ossKey, session.ossUploadId);
      uploadedParts = ossParts.map((part) => part.number);

      await uploadSessionStore.update({
        where: { uploadId },
        data: {
          uploadedParts
        }
      });
    }

    res.json({
      uploadId: session.uploadId,
      status: session.status,
      partSizeBytes: session.partSizeBytes,
      fileSizeBytes: session.fileSizeBytes.toString(),
      uploadedParts
    });
  } catch (error) {
    next(error);
  }
});
