import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { config } from "../config.js";

export type AuthTokenPayload = {
  sub: string;
  role: string;
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
