export async function startServer(app, port) {
  app.listen(port, "0.0.0.0", async () => {
    console.log(`Server running on http://localhost:${port}`);

    // Send system startup notification to Telegram
    const { sendChannelMessage } = await import("../alerts/telegram.channel.js");

    const success1 = await sendChannelMessage(
      "*System Startup Notification*\n\n" +
        "This is a system-generated message to verify the system wakeup sequence."
    );

    const success2 = await sendChannelMessage(
      "Automated check complete. System is operational & fully functional."
    );

    if (success1 && success2) {
      console.log("[Server] System wakeup messages sent to Telegram");
    } else {
      await sendChannelMessage(
        "*System Startup Warning*\n\n" +
          "Failed to send one or more startup messages.\n" +
          "Please check system configuration."
      );
      console.error("[Server] Failed to send system wakeup messages");
    }
  });
}
