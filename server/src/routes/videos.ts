import { Router } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const videoRouter = Router();
const videoQuerySchema = z.object({
  scope: z.enum(["all", "mine"]).default("all")
});
const videoParamsSchema = z.object({
  id: z.string().min(1)
});

videoRouter.get("/videos", requireAuth, requireRole([Role.VIEWER, Role.UPLOADER, Role.ADMIN]), async (req, res, next) => {
  try {
    const { scope } = videoQuerySchema.parse(req.query);
    const videos = await prisma.video.findMany({
      where: scope === "mine" ? { uploaderId: req.auth!.userId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        title: true,
        status: true,
        sizeBytes: true,
        createdAt: true,
        uploader: {
          select: {
            email: true
          }
        }
      }
    });

    res.json({
      items: videos.map((video) => ({
        ...video,
        sizeBytes: video.sizeBytes.toString()
      }))
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

    res.json({
      ...video,
      sizeBytes: video.sizeBytes.toString()
    });
  } catch (error) {
    next(error);
  }
});
