import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

import { DEFAULT_UPLOAD_QUOTA_BYTES } from "../src/lib/users.js";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Admin123!", 10);

  await prisma.user.upsert({
    where: { email: "admin@videofly.local" },
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

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
