import dotenv from "dotenv";
dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

console.log("=== Configuration Check ===");
console.log("BOT_TOKEN exists:", !!BOT_TOKEN);
console.log("BOT_TOKEN length:", BOT_TOKEN?.length);
console.log("CHANNEL_ID:", CHANNEL_ID);
console.log("CHANNEL_NOTIFICATIONS:", process.env.TELEGRAM_CHANNEL_NOTIFICATIONS);

async function testChannelMessage() {
  if (!BOT_TOKEN) {
    console.error("❌ TELEGRAM_BOT_TOKEN is missing!");
    return;
  }

  if (!CHANNEL_ID) {
    console.error("❌ TELEGRAM_CHANNEL_ID is missing!");
    return;
  }

  console.log("\n=== Sending Test Message ===");
  
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: CHANNEL_ID,
          text: "🧪 Test message from RepoReply",
          parse_mode: "Markdown",
        }),
      }
    );

    const data = await res.json();
    
    console.log("\n=== Response ===");
    console.log("Status:", res.status);
    console.log("Success:", data.ok);
    
    if (!data.ok) {
      console.error("Error Code:", data.error_code);
      console.error("Error Description:", data.description);
      
      // Common errors
      if (data.error_code === 400) {
        console.error("\n❌ Bad Request - Check your CHANNEL_ID format");
      } else if (data.error_code === 403) {
        console.error("\n❌ Forbidden - Bot is not an admin in the channel or channel doesn't exist");
      } else if (data.error_code === 401) {
        console.error("\n❌ Unauthorized - Invalid BOT_TOKEN");
      }
    } else {
      console.log("✅ Message sent successfully!");
      console.log("Message ID:", data.result.message_id);
    }
    
    return data;
  } catch (err) {
    console.error("\n=== Network Error ===");
    console.error(err.message);
  }
}

testChannelMessage();