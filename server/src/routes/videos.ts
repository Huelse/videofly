import { Router } from "express";

import { prisma } from "../lib/prisma.js";

export const videoRouter = Router();

videoRouter.get("/videos", async (_req, res, next) => {
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
