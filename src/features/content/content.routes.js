/**
 * Content API Routes
 * 
 * @file content.routes.js
 * @location src/features/content/content.routes.js
 */

import express from "express";
import {
  getIssueFullContent,
  getPRFullContent,
  enableRealtimeForIssue,
  enableRealtimeForPR,
} from "./content.controller.js";

const router = express.Router();

// Get full issue content (lazy fetch on first request)
router.get("/repos/:owner/:repo/issues/:number/full", getIssueFullContent);

// Get full PR content (lazy fetch on first request)
router.get("/repos/:owner/:repo/pulls/:number/full", getPRFullContent);

// Enable real-time sync for specific issue
router.post("/repos/:owner/:repo/issues/:number/realtime", enableRealtimeForIssue);

// Enable real-time sync for specific PR
router.post("/repos/:owner/:repo/pulls/:number/realtime", enableRealtimeForPR);

export default router;