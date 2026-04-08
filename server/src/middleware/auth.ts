import type { Role } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";

import { verifyToken } from "../lib/auth.js";
import { HttpError } from "../lib/errors.js";

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

  if (!token) {
    return next(new HttpError(401, "Authentication required"));
  }

  try {
    const payload = verifyToken(token);
    req.auth = {
      userId: payload.sub,
      email: payload.email,
      role: payload.role
    };
    return next();
  } catch {
    return next(new HttpError(401, "Invalid or expired token"));
  }
}

export function requireRole(roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(new HttpError(401, "Authentication required"));
    }

    if (!roles.includes(req.auth.role)) {
      return next(new HttpError(403, "Insufficient permissions"));
    }

    return next();
  };
}
