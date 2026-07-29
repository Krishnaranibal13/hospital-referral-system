import { PrismaClient } from "@prisma/client";

// Reuse a single Prisma client instance across the app
const prisma = new PrismaClient();

export default prisma;
