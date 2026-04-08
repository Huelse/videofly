import { Role } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { hashPassword, verifyPassword } from "../lib/auth.js";
import { HttpError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { getRemainingQuotaBytes, getUserStorageUsage, serializeUser } from "../lib/users.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const updateRoleSchema = z.object({
  role: z.nativeEnum(Role)
});

const updateUploadQuotaSchema = z.object({
  uploadQuotaBytes: z.coerce.bigint().nonnegative()
});

const userParamsSchema = z.object({
  id: z.string().min(1)
});

const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8)
});

export const userRouter = Router();

userRouter.use(requireAuth);

userRouter.get("/me", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      select: {
        id: true,
        email: true,
        role: true,
        uploadQuotaBytes: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            videos: true
          }
        }
      }
    });

    if (!user) {
      throw new HttpError(404, "User not found");
    }

    res.json(serializeUser(user));
  } catch (error) {
    next(error);
  }
});

userRouter.get("/me/storage", async (req, res, next) => {
  try {
    const [user, usage] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.auth!.userId },
        select: {
          uploadQuotaBytes: true
        }
      }),
      getUserStorageUsage(prisma, req.auth!.userId)
    ]);

    if (!user) {
      throw new HttpError(404, "User not found");
    }

    const remainingQuotaBytes = getRemainingQuotaBytes(
      user.uploadQuotaBytes,
      usage.totalSizeBytes,
      usage.reservedUploadBytes
    );

    res.json({
      totalSizeBytes: usage.totalSizeBytes.toString(),
      reservedUploadBytes: usage.reservedUploadBytes.toString(),
      uploadQuotaBytes: user.uploadQuotaBytes.toString(),
      remainingQuotaBytes: remainingQuotaBytes.toString(),
      videoCount: usage.videoCount
    });
  } catch (error) {
    next(error);
  }
});

userRouter.put("/me/password", async (req, res, next) => {
  try {
    const input = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId }
    });

    if (!user) {
      throw new HttpError(404, "User not found");
    }

    const valid = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!valid) {
      throw new HttpError(400, "Current password is incorrect");
    }

    if (input.currentPassword === input.newPassword) {
      throw new HttpError(400, "New password must be different");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(input.newPassword)
      }
    });

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    next(error);
  }
});

userRouter.get("/", requireRole([Role.ADMIN]), async (req, res, next) => {
  try {
    const { page, pageSize } = listUsersQuerySchema.parse(req.query);
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          role: true,
          uploadQuotaBytes: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              videos: true
            }
          }
        }
      }),
      prisma.user.count()
    ]);

    res.json({
      items: items.map((item) => serializeUser(item)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (error) {
    next(error);
  }
});

userRouter.put("/:id/role", requireRole([Role.ADMIN]), async (req, res, next) => {
  try {
    const { id } = userParamsSchema.parse(req.params);
    const { role } = updateRoleSchema.parse(req.body);

    const user = await prisma.user.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        email: true,
        role: true,
        uploadQuotaBytes: true,
        updatedAt: true
      }
    });

    res.json(serializeUser(user));
  } catch (error) {
    next(error);
  }
});

userRouter.put("/:id/quota", requireRole([Role.ADMIN]), async (req, res, next) => {
  try {
    const { id } = userParamsSchema.parse(req.params);
    const { uploadQuotaBytes } = updateUploadQuotaSchema.parse(req.body);

    const user = await prisma.user.update({
      where: { id },
      data: { uploadQuotaBytes },
      select: {
        id: true,
        email: true,
        role: true,
        uploadQuotaBytes: true,
        updatedAt: true
      }
    });

    res.json(serializeUser(user));
  } catch (error) {
    next(error);
  }
});
