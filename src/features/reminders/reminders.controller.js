/**
 * reminders.controller.js (FINAL VERSION)
 * 
 * Purpose: Handle HTTP requests for creating reminders
 * Location: src/features/reminders/reminders.controller.js
 */

import { createReminder, hasRecentReminder } from "./reminder.service.js";
import { parseReminder } from "./parser/reminder.parser.js";

/* -------------------- Create Reminder Endpoint -------------------- */
export async function handleCreateReminder(req, res) {
  try {
    const { repo_id, issue_number, message, created_by } = req.body;

    /* -------------------- Validation -------------------- */
    if (!repo_id || !issue_number || !message) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: repo_id, issue_number, message",
      });
    }

    /* -------------------- Parse Reminder Time -------------------- */
    const parsed = parseReminder(message);
    
    if (!parsed || !parsed.remindAt) {
      return res.status(400).json({
        success: false,
        error: "Could not parse reminder time from message. Try formats like 'remind me in 2 hours' or 'remind me tomorrow at 3pm'",
        examples: [
          "remind me in 5 minutes",
          "remind me tomorrow at 2pm",
          "remind me on January 25th",
          "notify me in 2 hours"
        ]
      });
    }

    /* -------------------- Rate Limiting Check -------------------- */
    const hasRecent = await hasRecentReminder({
      repo_id,
      issue_number,
      minutes: 5,
    });

    if (hasRecent) {
      return res.status(429).json({
        success: false,
        error: "Rate limit: A reminder was already created for this issue in the last 5 minutes",
      });
    }

    /* -------------------- Create Reminder -------------------- */
    const reminder = await createReminder({
      repo_id,
      issue_number,
      message,
      scheduled_at: parsed.remindAt,
      created_by: created_by || "system",
    });

    /* -------------------- Success Response -------------------- */
    return res.status(201).json({
      success: true,
      reminder: {
        id: reminder.id,
        scheduled_at: reminder.scheduled_at,
        message: reminder.message,
        repo_id: reminder.repo_id,
        issue_number: reminder.issue_number,
      },
    });

  } catch (error) {
    console.error("[Controller] Failed to create reminder:", error);
    
    return res.status(500).json({
      success: false,
      error: "Failed to create reminder",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

/* -------------------- Health Check Endpoint -------------------- */
export async function handleHealthCheck(req, res) {
  try {
    // Import dynamically to avoid circular dependencies
    const { getHealthStatus } = await import("./scheduler/state.js");
    const health = getHealthStatus();
    
    const statusCode = health.status === "healthy" ? 200 : 503;
    
    return res.status(statusCode).json({
      success: true,
      status: health.status,
      uptime: health.uptime,
      lastRun: health.lastRun,
      lastSuccess: health.lastSuccess,
      processedTotal: health.processedTotal,
      activeProcessing: health.activeProcessing,
      circuitBreakers: health.circuitBreakers,
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      status: "error",
      error: error.message,
    });
  }
}