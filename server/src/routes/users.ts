import { Role } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { HttpError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const updateRoleSchema = z.object({
  role: z.nativeEnum(Role)
});

const userParamsSchema = z.object({
  id: z.string().min(1)
});

const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20)
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

    res.json(user);
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
      items,
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
        updatedAt: true
      }
    });

    res.json(user);
  } catch (error) {
    next(error);
  }
});
