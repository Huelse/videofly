import { Router } from "express";
import { Role } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const videoRouter = Router();

videoRouter.get("/videos", requireAuth, requireRole([Role.VIEWER, Role.UPLOADER, Role.ADMIN]), async (_req, res, next) => {
  try {
    const videos = await prisma.video.findMany({
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

    res.json({ items: videos });
  } catch (error) {
    next(error);
  }
});
