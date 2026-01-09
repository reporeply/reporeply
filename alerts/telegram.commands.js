import { loadReminders } from "../reminders/reminder.service.js";

export function handleTelegramCommand(message) {
  const text = message.text?.trim();
  if (text !== "/status") return null;

  const reminders = loadReminders();
  const pending = reminders.filter((r) => !r.sent).length;
  const sent = reminders.filter((r) => r.sent).length;

  return (
    "RepoReply Status\n\n" +
    `Scheduler: running\n` +
    `Pending reminders: ${pending}\n` +
    `Sent reminders: ${sent}\n` +
    `Last check: ${new Date().toLocaleString()}`
  );
}
