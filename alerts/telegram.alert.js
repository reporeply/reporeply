/**
 * File: telegram.alert.js
 *
 * Purpose:
 * - Sends critical alerts to Telegram.
 *
 * Notes:
 * - Uses built-in fetch (Node.js 18+)
 * - Never throws errors (alerts must not crash the app)
 */

export async function sendTelegramAlert(message) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      console.log("[Alert] Telegram credentials missing");
      return;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error("[Alert] Telegram API error:", data);
    }
  } catch (err) {
    console.error("[Alert] Telegram alert failed:", err.message);
  }
}
