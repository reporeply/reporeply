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

const router = express.Router();

// Webhook endpoint for GitHub App installation events
router.post("/webhook", handleInstallationWebhook);

// Get installation status for a repository
router.get("/status/:repoFullName", getInstallationStatus);

export default router;