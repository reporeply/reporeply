/**
 * Installation Controller - FIXED
 * 
 * @file installation.controller.js
 * @location src/features/installations/installation.controller.js
 */

import {
  handleInstallationCreated,
  handleInstallationDeleted,
  handleReposAdded,
  handleReposRemoved,
} from "./handlers/installation.handler.js";

/**
 * Main webhook handler for installation events
 * POST /api/installations/webhook
 */
export async function handleInstallationWebhook(req, res) {
  const event = req.headers["x-github-event"];
  const payload = req.body;

  console.log(`\n[Installation Webhook] Event: ${event}`);

  try {
    let result;

    switch (event) {
      case "installation":
        if (payload.action === "created") {
          result = await handleInstallationCreated(payload);
        } else if (payload.action === "deleted") {
          result = await handleInstallationDeleted(payload);
        }
        break;

      case "installation_repositories":
        if (payload.action === "added") {
          result = await handleReposAdded(payload);
        } else if (payload.action === "removed") {
          result = await handleReposRemoved(payload);
        }
        break;

      default:
        console.log(`[Installation Webhook] Unhandled event: ${event}`);
        return res.status(200).json({ message: "Event ignored" });
    }

    res.status(200).json({
      success: true,
      event,
      action: payload.action,
      ...result,
    });
  } catch (error) {
    console.error("[Installation Webhook] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}