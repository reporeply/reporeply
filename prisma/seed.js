import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1️⃣ Create user (ONLY valid fields)
  const user = await prisma.users.upsert({
    where: { id: "sample-user-1" },
    update: {},
    create: {
      id: "sample-user-1",
      username: "x10developers",
      type: "USER",
    },
  });

  // 2️⃣ Create repository linked to user
  const repo = await prisma.repositories.upsert({
    where: { full_name: "x10developers/reporeply" },
    update: {},
    create: {
      id: "sample-repo-1",
      full_name: "x10developers/reporeply",
      is_active: true,
      userId: user.id,
    },
  });

  // 3️⃣ Create reminders
  await prisma.reminders.createMany({
    data: [
      {
        id: "r1",
        repoId: repo.id,
        issueNumber: 1,
        message: "Sample reminder (sent)",
        status: "sent",
        scheduledAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        sentAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        id: "r2",
        repoId: repo.id,
        issueNumber: 2,
        message: "Sample reminder (pending)",
        status: "pending",
        scheduledAt: new Date(),
      },
    ],
  });

  console.log("✅ Sample data inserted successfully");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
