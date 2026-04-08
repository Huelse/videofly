import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
    const passwordHash = await bcrypt.hash("Admin123!", 10);
    await prisma.user.upsert({
        where: { email: "admin@videofly.local" },
        update: {},
        create: {
            email: "admin@videofly.local",
            passwordHash,
            role: Role.ADMIN
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
