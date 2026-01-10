/**
 * File: alerts/telegram.commands.js
 *
 * Purpose:
 * - Handle Telegram bot commands (DMs)
 */

import { loadReminders } from "../reminders/reminder.service.js";

/**
 * Named export (IMPORTANT)
 * Must match:
 *   import { handleTelegramCommand } from "./alerts/telegram.commands.js";
 */
export const handleTelegramCommand = (message) => {
  if (!message || !message.text) return null;

  const text = message.text.trim();

  if (text !== "/status") return null;

  const reminders = loadReminders();
  const pending = reminders.filter((r) => !r.sent).length;
  const sent = reminders.filter((r) => r.sent).length;

  return (
    "📊 *RepoReply Status*\n\n" +
    `Scheduler: running\n` +
    `Pending reminders: ${pending}\n` +
    `Sent reminders: ${sent}\n` +
    `Last check: ${new Date().toLocaleString()}`
  );
};
