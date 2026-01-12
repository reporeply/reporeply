import cron from "node-cron";
import { sendGroupMessage } from "./telegram.group.js";
import { prisma } from "../lib/prisma.js";

console.log("[Group Scheduler] Initialized");

/* Every 10 minutes */
cron.schedule("*/10 * * * *", async () => {
  try {
    const reminders = await prisma.reminders.findMany({
      where: { status: "pending" },
      orderBy: { created_at: "desc" },
      take: 5,
    });

    const pending = reminders.length;
    if (pending === 0) return;

    await sendGroupMessage(
      `⏰ *RepoReply Update*\nPending reminders: ${pending}`
    );
  } catch (err) {
    console.error("[Group Scheduler] Error:", err.message);
  }
});
