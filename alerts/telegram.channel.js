// ============================================================================
// TELEGRAM CHANNEL MESSAGING
// Sends messages to a configured Telegram channel
// ============================================================================

/**
 * Sends a message to the Telegram channel
 * @param {string} text - The message text to send (supports Markdown formatting)
 */
export async function sendChannelMessage(text) {
  // Load environment variables
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
  const ENABLED = process.env.TELEGRAM_CHANNEL_NOTIFICATIONS === "true";

  // Validate configuration
  if (!ENABLED || !BOT_TOKEN || !CHANNEL_ID) {
    return;
  }

  // Send message to Telegram channel
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

    if (!res.ok) {
      console.error("[Telegram Channel] API Error:", data);
    }
  } catch (err) {
    console.error("[Telegram Channel] Error:", err.message);
  }
}

// ============================================================================
// End of Telegram Channel Module
// ============================================================================