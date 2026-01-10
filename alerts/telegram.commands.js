import { loadReminders } from "../reminders/reminder.service.js";
import { sendChannelMessage } from "./telegram.channel.js";

/**
 * Handles Telegram bot commands (DMs)
 */
export const handleTelegramCommand = async (message) => {
  if (!message || !message.text) return null;

  const text = message.text.trim();

  /* ---------- /status ---------- */
  if (text === "/status") {
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
  }

  /* ---------- /channel <message> ---------- */
  if (text.startsWith("/channel ")) {
    const channelText = text.replace("/channel", "").trim();

    if (!channelText) {
      return "⚠️ Usage:\n/channel <message>";
    }

    // Send to channel
    await sendChannelMessage(`📢 *Channel Update*\n\n${channelText}`);

    return "✅ Message posted to channel.";
  }

  return null;
};
