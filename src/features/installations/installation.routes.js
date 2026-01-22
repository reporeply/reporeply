/**
 * Installation Routes - FIXED
 * 
 * @file installation.routes.js
 * @location src/features/installations/installation.routes.js
 */

import express from "express";
import { handleInstallationWebhook } from "./installation.controller.js";
import { prisma } from "../../core/database/prisma.client.js";

const router = express.Router();

/**
 * Get repository installation status
 * GET /api/installations/status/:owner/:repo
 */
router.get("/status/:owner/:repo", async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const repoId = `${owner}/${repo}`;
    
    console.log(`[Installation] Checking status for: ${repoId}`);

    // Find the repository
    const repository = await prisma.repositories.findUnique({
      where: { id: repoId },
      select: {
        id: true,
        full_name: true,
        installation_id: true,
        is_active: true,
        is_paid: true,
        plan_tier: true,
        realtime_enabled: true,
        indexed: true,
        indexed_at: true,
      },
    });

    if (!repository) {
      console.log(`[Installation] ❌ Repository not found: ${repoId}`);
      return res.status(404).json({
        success: false,
        error: "Repository not found or not installed",
      });
    }

    // Check if installation exists
    if (!repository.installation_id) {
      console.log(`[Installation] ❌ No installation linked: ${repoId}`);
      return res.status(200).json({
        success: true,
        installed: false,
        message: "Repository exists but no installation linked",
        repository: {
          full_name: repository.full_name,
          is_active: repository.is_active,
        },
      });
    }

    // Get installation details
    const installation = await prisma.installations.findUnique({
      where: { installation_id: repository.installation_id },
      select: {
        installation_id: true,
        owner_type: true,
        owner_id: true,
        owner_login: true,
        installed_scope: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!installation) {
      console.log(`[Installation] ❌ Installation not found: ${repository.installation_id}`);
      return res.status(200).json({
        success: true,
        installed: false,
        message: "Installation data missing",
      });
    }

    console.log(`[Installation] ✅ Found: ${repoId} → Installation ${installation.installation_id}`);

    // Return full status
    return res.json({
      success: true,
      installed: true,
      repository: {
        full_name: repository.full_name,
        is_active: repository.is_active,
        is_paid: repository.is_paid,
        plan_tier: repository.plan_tier,
        realtime_enabled: repository.realtime_enabled,
        indexed: repository.indexed,
        indexed_at: repository.indexed_at,
      },
      installation: {
        id: installation.installation_id.toString(), // Convert BigInt to string for JSON
        owner_type: installation.owner_type,
        owner_login: installation.owner_login,
        installed_scope: installation.installed_scope,
        created_at: installation.created_at,
        updated_at: installation.updated_at,
      },
    });
  } catch (error) {
    console.error("[Installation] ❌ Status check failed:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to check installation status",
      details: error.message,
    });
  }
});

/**
 * Webhook endpoint for GitHub App installation events
 * POST /api/installations/webhook
 */
router.post("/webhook", handleInstallationWebhook);

export default router;