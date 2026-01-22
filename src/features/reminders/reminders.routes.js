/**
 * reminders.routes.js (FINAL VERSION)
 * 
 * Purpose: Define HTTP routes for reminder endpoints
 * Location: src/features/reminders/reminders.routes.js
 */

import express from "express";
import { handleCreateReminder, handleHealthCheck } from "./reminders.controller.js";

const router = express.Router();

/* -------------------- Routes -------------------- */

/**
 * POST /api/reminders
 * Create a new reminder
 * 
 * Body:
 * {
 *   "repo_id": "owner/repo",
 *   "issue_number": 123,
 *   "message": "remind me in 2 hours",
 *   "created_by": "username" (optional)
 * }
 */
router.post("/", handleCreateReminder);

/**
 * GET /api/reminders/health
 * Check scheduler health status
 */
router.get("/health", handleHealthCheck);

export default router;