/**
 * Installation Controller
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
import { getInstallationForRepo } from "./installation.service.js";

/**
 * Main webhook handler for installation events
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

/**
 * Get installation status for a repository
 */
export async function getInstallationStatus(req, res) {
  const { repoFullName } = req.params;

  try {
    const installation = await getInstallationForRepo(repoFullName);

    if (!installation) {
      return res.status(404).json({
        installed: false,
        message: "Repository is not installed",
      });
    }

    res.status(200).json({
      installed: true,
      installation: {
        id: installation.installation_id.toString(),
        owner_type: installation.owner_type,
        owner_login: installation.owner_login,
        installed_scope: installation.installed_scope,
        created_at: installation.created_at,
      },
    });
  } catch (error) {
    console.error("[Installation Controller] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}