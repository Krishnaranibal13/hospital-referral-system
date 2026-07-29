// Run with: node src/utils/createReceptionUser.js
// Creates a reception login. Edit the values below first, or pass as env vars.
import "dotenv/config";
import bcrypt from "bcryptjs";
import prisma from "./prismaClient.js";

async function main() {
  const email = process.env.RECEPTION_EMAIL || "reception@hospital.com";
  const password = process.env.RECEPTION_PASSWORD || "Reception123!";
  const name = process.env.RECEPTION_NAME || "Reception Desk";

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.staffUser.upsert({
    where: { email },
    update: { passwordHash, name, role: "RECEPTION" },
    create: { email, passwordHash, name, role: "RECEPTION" },
  });

  console.log(`Reception user ready: ${user.email} (password: ${password} — change it after first login)`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});