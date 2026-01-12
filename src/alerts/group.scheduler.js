import cron from "node-cron";
import { sendGroupMessage } from "./telegram.group.js";
import { loadReminders } from "../reminders/reminder.service.js";

console.log("[Group Scheduler] Initialized");

/* Every 10 minutes */
cron.schedule("*/10 * * * *", async () => {
  const reminders = await prisma.reminders.findMany({
  orderBy: { created_at: "desc" },
  take: 5,
});
  const pending = reminders.filter(r => !r.sent).length;

  if (pending === 0) return;

  await sendGroupMessage(
    `⏰ *RepoReply Update*\nPending reminders: ${pending}`
  );
});