// ============================================================================
// TELEGRAM CHANNEL MESSAGING
// Sends messages to a configured Telegram channel
// ============================================================================

/**
 * Sends a message to the Telegram channel
 * @param {string} text - The message text to send (supports Markdown formatting)
 */
export async function sendChannelMessage(text) {
  // ----------------------------------------------------------------------------
  // Load environment variables fresh on each call
  // This ensures we always have the latest configuration
  // ----------------------------------------------------------------------------
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
  const ENABLED = process.env.TELEGRAM_CHANNEL_NOTIFICATIONS === "true";

  // ----------------------------------------------------------------------------
  // Validation: Check if channel notifications are enabled
  // ----------------------------------------------------------------------------
  if (!ENABLED) {
    return;
  }

  // ----------------------------------------------------------------------------
  // Validation: Check if bot token is configured
  // ----------------------------------------------------------------------------
  if (!BOT_TOKEN) {
    return;
  }

  // ----------------------------------------------------------------------------
  // Validation: Check if channel ID is configured
  // ----------------------------------------------------------------------------
  if (!CHANNEL_ID) {
    return;
  }

  // ----------------------------------------------------------------------------
  // Send message to Telegram channel via Bot API
  // ----------------------------------------------------------------------------
  try {
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
    } else {
      // Success: Message delivered to Telegram
      console.log("[Telegram Channel] Message sent successfully");
    }
  } catch (err) {
    // Handle network or other errors
    console.error("[Telegram Channel] Error:", err.message);
  }
}

// ============================================================================
// End of Telegram Channel Module
// ============================================================================