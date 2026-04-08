import { Role } from "@prisma/client";

import { hashPassword, signToken } from "../src/lib/auth.js";
import { prisma } from "../src/lib/prisma.js";
import { DEFAULT_UPLOAD_QUOTA_BYTES } from "../src/lib/users.js";

export async function resetDatabase() {
  await prisma.video.deleteMany();
  await (prisma as typeof prisma & { uploadSession: any }).uploadSession.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.user.deleteMany();
}

export async function seedAdmin() {
  const passwordHash = await hashPassword("Admin123!");

  return prisma.user.upsert({
    where: {
      email: "admin@videofly.local"
    },
    update: {
      passwordHash,
      role: Role.ADMIN,
      uploadQuotaBytes: DEFAULT_UPLOAD_QUOTA_BYTES
    },
    create: {
      email: "admin@videofly.local",
      passwordHash,
      role: Role.ADMIN,
      uploadQuotaBytes: DEFAULT_UPLOAD_QUOTA_BYTES
    }
  });
}

export async function createUser(email: string, role: Role = Role.VIEWER, uploadQuotaBytes: bigint = DEFAULT_UPLOAD_QUOTA_BYTES) {
  const passwordHash = await hashPassword("Viewer1234");

  return prisma.user.create({
    data: {
      email,
      passwordHash,
      role,
      uploadQuotaBytes
    }
  });
}

export function createAuthHeader(user: { id: string; email: string; role: Role }) {
  const token = signToken({
    sub: user.id,
    email: user.email,
    role: user.role
  });

  return `Bearer ${token}`;
}
