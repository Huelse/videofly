import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import { createPasswordResetToken, hashPassword, hashResetToken, signToken, verifyPassword } from "../lib/auth.js";
import { config } from "../config.js";
import { HttpError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { createIpRateLimiter } from "../middleware/rate-limit.js";
import { serializeUser } from "../lib/users.js";

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8)
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8)
});

const resetPasswordRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email()
});

const resetPasswordSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(8)
});

export const authRouter = Router();
const passwordResetTokenStore = (prisma as typeof prisma & { passwordResetToken: any }).passwordResetToken;
const registerRateLimiter = createIpRateLimiter({
  keyPrefix: "auth:register",
  limit: config.AUTH_RATE_LIMIT_REGISTER_MAX_REQUESTS,
  windowSeconds: config.AUTH_RATE_LIMIT_WINDOW_SECONDS,
  message: "Too many registration attempts from this IP"
});
const loginRateLimiter = createIpRateLimiter({
  keyPrefix: "auth:login",
  limit: config.AUTH_RATE_LIMIT_LOGIN_MAX_REQUESTS,
  windowSeconds: config.AUTH_RATE_LIMIT_WINDOW_SECONDS,
  message: "Too many login attempts from this IP"
});
const resetPasswordRateLimiter = createIpRateLimiter({
  keyPrefix: "auth:reset-password",
  limit: config.AUTH_RATE_LIMIT_RESET_PASSWORD_MAX_REQUESTS,
  windowSeconds: config.AUTH_RATE_LIMIT_WINDOW_SECONDS,
  message: "Too many password reset requests from this IP"
});

authRouter.post("/register", registerRateLimiter, async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const passwordHash = await hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash
      },
      select: {
        id: true,
        email: true,
        role: true,
        uploadQuotaBytes: true,
        createdAt: true
      }
    });

    res.status(201).json(serializeUser(user));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return next(new HttpError(409, "Email already exists"));
    }
    next(error);
  }
});

authRouter.post("/login", loginRateLimiter, async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signToken({
      sub: user.id,
      email: user.email,
      role: user.role
    });

    return res.json({
      token,
      user: serializeUser(user)
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", requireAuth, (_req, res) => {
  res.status(204).send();
});

authRouter.post("/reset-password", resetPasswordRateLimiter, async (req, res, next) => {
  try {
    const input = resetPasswordRequestSchema.parse(req.body);
    const requesterIp = req.ip;
    const windowStart = new Date(Date.now() - 60 * 60 * 1000);

    const requestsFromIp = await passwordResetTokenStore.count({
      where: {
        requesterIp,
        createdAt: {
          gte: windowStart
        }
      }
    });

    if (requestsFromIp >= config.PASSWORD_RESET_MAX_REQUESTS_PER_HOUR) {
      throw new HttpError(429, "Too many reset attempts from this IP");
    }

    const user = await prisma.user.findUnique({
      where: { email: input.email }
    });

    if (!user) {
      return res.json({
        message: "If the account exists, a password reset link has been generated."
      });
    }

    const { token, tokenHash } = createPasswordResetToken();
    const expiresAt = new Date(Date.now() + config.PASSWORD_RESET_WINDOW_MINUTES * 60 * 1000);

    await prisma.$transaction([
      passwordResetTokenStore.updateMany({
        where: {
          userId: user.id,
          usedAt: null
        },
        data: {
          usedAt: new Date()
        }
      }),
      passwordResetTokenStore.create({
        data: {
          tokenHash,
          expiresAt,
          userId: user.id,
          requesterIp
        }
      })
    ]);

    console.log(`Password reset URL for ${user.email}: ${config.APP_BASE_URL}/reset-password?token=${token}`);

    return res.json({
      message: "If the account exists, a password reset link has been generated."
    });
  } catch (error) {
    next(error);
  }
});

authRouter.put("/reset-password", resetPasswordRateLimiter, async (req, res, next) => {
  try {
    const input = resetPasswordSchema.parse(req.body);
    const tokenHash = hashResetToken(input.token);

    const resetRecord = await passwordResetTokenStore.findUnique({
      where: { tokenHash },
      include: { user: true }
    });

    if (!resetRecord || resetRecord.usedAt || resetRecord.expiresAt < new Date()) {
      throw new HttpError(400, "Invalid or expired password reset token");
    }

    const passwordHash = await hashPassword(input.password);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash }
      }),
      passwordResetTokenStore.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() }
      }),
      passwordResetTokenStore.updateMany({
        where: {
          userId: resetRecord.userId,
          usedAt: null,
          id: {
            not: resetRecord.id
          }
        },
        data: { usedAt: new Date() }
      })
    ]);

    return res.json({ message: "Password updated successfully" });
  } catch (error) {
    next(error);
  }
});
