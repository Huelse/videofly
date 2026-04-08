import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

import type { Role } from "@prisma/client";

import { config } from "../config.js";

export type AuthTokenPayload = {
  sub: string;
  role: Role;
  email: string;
};

export function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export function signToken(payload: AuthTokenPayload) {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: "1h" });
}

export function verifyToken(token: string) {
  return jwt.verify(token, config.JWT_SECRET) as AuthTokenPayload;
}

export function createPasswordResetToken() {
  const token = crypto.randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashResetToken(token)
  };
}

export function hashResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
