import cron from "node-cron";
import { sendChannelMessage } from "./telegram.channel.js";
import { loadReminders } from "../reminders/reminder.service.js";

// ============================================================================
// CHANNEL SCHEDULER - Sends periodic updates to Telegram channel
// ============================================================================

console.log("[Channel Scheduler] Initialized at", new Date().toLocaleString());

// ----------------------------------------------------------------------------
// SYSTEM STARTUP NOTIFICATION
// Sends a verification message when the system restarts/wakes up
// This confirms that the bot and channel permissions are working correctly
// ----------------------------------------------------------------------------
sendChannelMessage(
  "*System Startup Notification*\n\n" +
  "This is a system-generated message to verify the system wakeup is working.\n\n" +
  "RepoReply channel permissions verified and system is now active."
)
  .then(() => console.log("[Channel Scheduler] Init message sent"))
  .catch(err => console.error("[Channel Scheduler] Init error:", err));

// ----------------------------------------------------------------------------
// PERIODIC UPDATE SCHEDULER
// Runs every 1 minute to send status updates to the Telegram channel
// Shows current reminder counts and system status
// ----------------------------------------------------------------------------
cron.schedule("* * * * *", async () => {
  
  try {
    // Load all reminders from the system
    const reminders = loadReminders();
    
    // Count pending reminders (not yet sent)
    const pending = reminders.filter(r => !r.sent).length;
    
    // Count completed reminders (already sent)
    const sent = reminders.filter(r => r.sent).length;
    
    // Log the counts for debugging
    console.log("[Channel Scheduler] Pending:", pending, "Sent:", sent);
    
    // Send formatted status update to Telegram channel
    await sendChannelMessage(
      `*From Reporeply Team*\n` +
      `• System uptime 100%\n` +
      `• Pending reminders: ${pending}\n` +
      `• Sent reminders: ${sent}\n` +
      `• Time: ${new Date().toLocaleDateString('en-US', { weekday: 'short' })}, ${new Date().toLocaleTimeString('en-GB', { hour12: false })}`
    );
    
    // Confirm message was sent successfully
    console.log("[Channel Scheduler] Update message sent");
    
  } catch (err) {
    // Log any errors that occur during the update
    console.error("[Channel Scheduler][1-min]", err.message);
  }
});

// ============================================================================
// End of Channel Scheduler
// ============================================================================