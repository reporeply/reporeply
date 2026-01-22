/**
 * Installation Routes
 * 
 * @file installation.routes.js
 * @location src/features/installations/installation.routes.js
 */

import express from "express";
import {
  handleInstallationWebhook,
  getInstallationStatus,
} from "./installation.controller.js";
import { prisma } from "../../core/database/prisma.client.js";

const router = express.Router();

// Get repository installation status
router.get("/status/:owner/:repo", async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const repoId = `${owner}/${repo}`;
    
    const repository = await prisma.repositories.findUnique({
      where: { id: repoId },
      select: {
        id: true,
        full_name: true,
        is_active: true,
        installation_id: true,
        indexed: true,
        indexed_at: true,
        is_paid: true,
        plan_tier: true,
        realtime_enabled: true,
      },
    });

    if (!repository) {
      return res.status(404).json({
        success: false,
        error: "Repository not found or not installed",
      });
    }

    return res.json({
      success: true,
      repository,
    });
  } catch (error) {
    console.error("[Installation] Status check failed:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to check installation status",
    });
  }
});

// Webhook endpoint for GitHub App installation events
router.post("/webhook", handleInstallationWebhook);

// Get installation status for a repository
router.get("/status/:repoFullName", getInstallationStatus);

export default router;