import { Role } from "@prisma/client";

import { hashPassword, signToken } from "../src/lib/auth.js";
import { prisma } from "../src/lib/prisma.js";

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
      role: Role.ADMIN
    },
    create: {
      email: "admin@videofly.local",
      passwordHash,
      role: Role.ADMIN
    }
  });
}

export async function createUser(email: string, role: Role = Role.VIEWER) {
  const passwordHash = await hashPassword("Viewer1234");

  return prisma.user.create({
    data: {
      email,
      passwordHash,
      role
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
