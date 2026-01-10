// import cron from "node-cron";
// import { sendChannelMessage } from "./telegram.channel.js";
// import { loadReminders } from "../reminders/reminder.service.js";

// /* -------------------- System Startup Notification -------------------- */

// // Send wakeup message when server restarts
// (async () => {
//   const success = await sendChannelMessage(
//     "*System Startup Notification*\n\n" +
//       "This is a system-generated message to verify the system wakeup is working.\n\n" +
//       "RepoReply channel permissions verified and system is now active."
//   );
  
//   if (success) {
//     console.log("[Channel Scheduler] System wakeup message sent");
//   } else {
//     console.error("[Channel Scheduler] Failed to send system wakeup message");
//   }
// })();

// /* -------------------- Periodic Status Update Scheduler -------------------- */

// // Runs every 15 minute to send status updates
// cron.schedule("*/15 * * * *", async () => {
//   try {
//     // Load all reminders from the system
//     const reminders = loadReminders();

//     // Count pending reminders (not yet sent)
//     const pending = reminders.filter((r) => !r.sent).length;

//     // Count completed reminders (already sent)
//     const sent = reminders.filter((r) => r.sent).length;

//     // Send formatted status update to Telegram channel
//     const success = await sendChannelMessage(
//       `*From Reporeply Team*\n` +
//         `• System uptime 100%\n` +
//         `• Pending reminders: ${pending}\n` +
//         `• Sent reminders: ${sent}\n` +
//         `• Time: ${new Date().toLocaleDateString("en-US", {
//           weekday: "short",
//         })}, ${new Date().toLocaleTimeString("en-GB", { hour12: false })}`
//     );

//     // Log only if message was sent successfully
//     if (success) {
//       console.log("[Channel Scheduler] Status update message sent");
//     }
//   } catch (err) {
//     console.error("[Channel Scheduler] Error:", err.message);
//   }
// });

/* -------------------- Telegram Channel Messaging -------------------- */

/**
 * Sends a message to the Telegram channel
 * @param {string} text - The message text to send (supports Markdown formatting)
 * @returns {Promise<boolean>} - Returns true if message sent successfully
 */
export async function sendChannelMessage(text) {
  // Load environment variables
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
  const ENABLED = process.env.TELEGRAM_CHANNEL_NOTIFICATIONS === "true";

  // DEBUG: Print configuration
  console.log("[DEBUG] ENABLED:", ENABLED);
  console.log("[DEBUG] BOT_TOKEN exists:", !!BOT_TOKEN);
  console.log("[DEBUG] CHANNEL_ID:", CHANNEL_ID);

  // Validate configuration - return false if any required value is missing
  if (!ENABLED || !BOT_TOKEN || !CHANNEL_ID) {
    console.log("[DEBUG] Validation failed - returning false");
    return false;
  }

  try {
    // Send message to Telegram Bot API
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: CHANNEL_ID,
          text,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }),
      }
    );

    const data = await res.json();

    // Check if message was sent successfully
    if (!res.ok) {
      console.error("[Telegram Channel] API Error:", data);
      return false;
    }

    console.log("[DEBUG] Message sent successfully!");
    return true;
  } catch (err) {
    console.error("[Telegram Channel] Error:", err.message);
    return false;
  }
}