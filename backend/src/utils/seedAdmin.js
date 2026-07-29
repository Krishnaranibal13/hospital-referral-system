// Run with: npm run seed
// Bootstraps the very first login: a SUPER_ADMIN account, not tied to any hospital.
// Log in with this account, then use the Super Admin dashboard to create your first
// hospital (e.g. "Vedansh Medicare" / branch "Surya Hospital") and its admin account.
import "dotenv/config";
import bcrypt from "bcryptjs";
import prisma from "./prismaClient.js";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || "superadmin@hospital.com";
  const password = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";
  const name = process.env.SEED_ADMIN_NAME || "Super Admin";

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.staffUser.upsert({
    where: { email },
    update: { passwordHash, name, role: "SUPER_ADMIN", hospitalId: null },
    create: { email, passwordHash, name, role: "SUPER_ADMIN" },
  });

  console.log(`Super Admin ready: ${user.email} (password: ${password} — change it after first login)`);
  console.log("Log in, then use the Super Admin dashboard to create your first hospital + its admin.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
