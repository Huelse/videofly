import type { Request } from "express";
import { Router } from "express";
import { Role, VideoStatus } from "@prisma/client";
import { z } from "zod";

import { HttpError } from "../lib/errors.js";
import { verifyToken } from "../lib/auth.js";
import { getObjectStream, getVideoSnapshotStream } from "../lib/oss.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const videoRouter = Router();
const videoQuerySchema = z.object({
  scope: z.enum(["all", "mine"]).default("all"),
  limit: z.coerce.number().int().positive().max(100).default(20),
  random: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true")
});
const videoParamsSchema = z.object({
  id: z.string().min(1)
});

async function serializeVideoWithPlayback<T extends { id: string; ossKey: string; sizeBytes: bigint }>(video: T) {
  return {
    ...video,
    sizeBytes: video.sizeBytes.toString(),
    playbackUrl: `/api/v1/videos/${video.id}/playback`
  };
}

function authenticatePlaybackRequest(req: Request) {
  const authorization = req.headers.authorization;
  const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const queryToken = typeof req.query.token === "string" ? req.query.token : null;
  const token = bearerToken ?? queryToken;

  if (!token) {
    throw new HttpError(401, "Authentication required");
  }

  try {
    const payload = verifyToken(token);

    if (![Role.VIEWER, Role.UPLOADER, Role.ADMIN].includes(payload.role)) {
      throw new HttpError(403, "Insufficient permissions");
    }

    return payload;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(401, "Invalid or expired token");
  }
}

videoRouter.get("/videos", requireAuth, requireRole([Role.VIEWER, Role.UPLOADER, Role.ADMIN]), async (req, res, next) => {
  try {
    const { scope, limit, random } = videoQuerySchema.parse(req.query);
    const videos = await prisma.video.findMany({
      where: {
        ...(scope === "mine" ? { uploaderId: req.auth!.userId } : {}),
        deletedAt: null
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        sizeBytes: true,
        createdAt: true,
        ossKey: true,
        uploader: {
          select: {
            email: true
          }
        }
      }
    });

    const selectedVideos = random
      ? videos
          .map((video) => ({ video, sortKey: Math.random() }))
          .sort((left, right) => left.sortKey - right.sortKey)
          .slice(0, limit)
          .map(({ video }) => video)
      : videos.slice(0, limit);

    res.json({
      items: await Promise.all(selectedVideos.map((video) => serializeVideoWithPlayback(video)))
    });
  } catch (error) {
    next(error);
  }
});

videoRouter.get("/videos/:id", requireAuth, requireRole([Role.VIEWER, Role.UPLOADER, Role.ADMIN]), async (req, res, next) => {
  try {
    const { id } = videoParamsSchema.parse(req.params);
    const video = await prisma.video.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
        sizeBytes: true,
        ossKey: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        uploaderId: true,
        uploader: {
          select: {
            email: true
          }
        }
      }
    });

    if (!video) {
      return res.status(404).json({ message: "Resource not found" });
    }

    if (video.deletedAt) {
      return res.status(404).json({ message: "Resource not found" });
    }

    res.json(await serializeVideoWithPlayback(video));
  } catch (error) {
    next(error);
  }
});

videoRouter.delete("/videos/:id", requireAuth, requireRole([Role.UPLOADER, Role.ADMIN]), async (req, res, next) => {
  try {
    const { id } = videoParamsSchema.parse(req.params);
    const video = await prisma.video.findUnique({
      where: { id },
      select: {
        id: true,
        uploaderId: true,
        deletedAt: true
      }
    });

    if (!video || video.deletedAt) {
      return res.status(404).json({ message: "Resource not found" });
    }

    if (req.auth!.role !== Role.ADMIN && video.uploaderId !== req.auth!.userId) {
      throw new HttpError(403, "Insufficient permissions");
    }

    await prisma.video.update({
      where: { id },
      data: {
        status: VideoStatus.DELETED,
        deletedAt: new Date()
      }
    });

    return res.status(204).send();
  } catch (error) {
    next(error);
  }
});

videoRouter.get("/videos/:id/playback", async (req, res, next) => {
  try {
    const { id } = videoParamsSchema.parse(req.params);
    authenticatePlaybackRequest(req);
    const video = await prisma.video.findUnique({
      where: { id },
      select: {
        id: true,
        ossKey: true,
        uploaderId: true,
        deletedAt: true
      }
    });

    if (!video || video.deletedAt) {
      throw new HttpError(404, "Resource not found");
    }

    const result = await getObjectStream(video.ossKey, req.header("range"));
    const headers = result.res.headers;

    if (headers["content-type"]) {
      res.setHeader("Content-Type", headers["content-type"]);
    }
    if (headers["content-length"]) {
      res.setHeader("Content-Length", headers["content-length"]);
    }
    if (headers["content-range"]) {
      res.setHeader("Content-Range", headers["content-range"]);
    }
    if (headers.etag) {
      res.setHeader("ETag", headers.etag);
    }
    if (headers["last-modified"]) {
      res.setHeader("Last-Modified", headers["last-modified"]);
    }

    res.setHeader("Accept-Ranges", "bytes");
    res.status(result.res.status);
    result.stream.on("error", next);
    result.stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

videoRouter.get("/videos/:id/preview", async (req, res, next) => {
  try {
    const { id } = videoParamsSchema.parse(req.params);
    authenticatePlaybackRequest(req);
    const video = await prisma.video.findUnique({
      where: { id },
      select: {
        id: true,
        ossKey: true,
        uploaderId: true,
        deletedAt: true
      }
    });

    if (!video || video.deletedAt) {
      throw new HttpError(404, "Resource not found");
    }

    const result = await getVideoSnapshotStream(video.ossKey);
    const headers = result.res.headers;

    if (headers["content-type"]) {
      res.setHeader("Content-Type", headers["content-type"]);
    }
    if (headers["content-length"]) {
      res.setHeader("Content-Length", headers["content-length"]);
    }
    if (headers.etag) {
      res.setHeader("ETag", headers.etag);
    }
    if (headers["last-modified"]) {
      res.setHeader("Last-Modified", headers["last-modified"]);
    }

    res.setHeader("Cache-Control", "private, max-age=86400, stale-while-revalidate=604800");
    res.status(result.res.status);
    result.stream.on("error", next);
    result.stream.pipe(res);
  } catch (error) {
    next(error);
  }
});
