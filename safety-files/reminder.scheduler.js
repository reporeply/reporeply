/**
 * File: reminder.scheduler.js
 *
 * Purpose:
 * - Background worker that delivers reminders when due.
 *
 * Responsibilities:
 * - Runs on a cron schedule.
 * - Loads pending reminders.
 * - Checks if reminder time has passed.
 * - Generates GitHub App installation tokens dynamically.
 * - Posts reminder comments on GitHub issues.
 * - Marks reminders as sent.
 *
 * Why this file exists:
 * - Decouples time-based logic from request-based logic.
 * - Ensures reminders work even without new webhooks.
 */

import cron from "node-cron";
import jwt from "jsonwebtoken";
import fs from "fs";
import { Octokit } from "@octokit/rest";
import { loadReminders, saveReminders } from "./reminder.service.js";

/* -------------------- GitHub Auth Helpers -------------------- */

/**
 * Create GitHub App JWT
 */
function createAppJWT() {
  const privateKey = fs.readFileSync(
    process.env.GITHUB_PRIVATE_KEY_PATH,
    "utf8"
  );

  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      iat: now - 30,
      exp: now + 540,
      iss: Number(process.env.GITHUB_APP_ID),
    },
    privateKey,
    { algorithm: "RS256" }
  );
}

/**
 * Get Octokit client for a GitHub App installation
 */
async function getInstallationOctokit(installationId) {
  const appJWT = createAppJWT();
  const appOctokit = new Octokit({ auth: appJWT });

  const { data } = await appOctokit.request(
    "POST /app/installations/{installation_id}/access_tokens",
    { installation_id: installationId }
  );

  return new Octokit({ auth: data.token });
}

/* -------------------- Scheduler -------------------- */

/**
 * Runs every minute (suitable for testing).
 * In production, this can safely be changed to 2 or 5 minutes.
 */
cron.schedule("*/2 * * * *", async () => {
  const reminders = loadReminders();

  // No reminders at all → exit immediately
  if (reminders.length === 0) return;

  const pendingCount = reminders.filter((r) => !r.sent).length;

  // Log only when there is actual work
  if (pendingCount > 0) {
    console.log(
      `[Scheduler] Evaluating ${pendingCount} pending reminder(s) at ${new Date().toLocaleTimeString()}`
    );
  }

  const now = new Date();
  let updated = false;

  for (const reminder of reminders) {
    if (reminder.sent) continue;

    if (new Date(reminder.remindAt) <= now) {
      try {
        const octokit = await getInstallationOctokit(reminder.installationId);

        const [owner, repo] = reminder.repo.split("/");

        await octokit.issues.createComment({
          owner,
          repo,
          issue_number: reminder.issue,
          body:
            "Reminder notification.\n\n" +
            `@${reminder.user}, you requested to be notified about this issue.`,
        });

        reminder.sent = true;
        reminder.sentAt = new Date().toISOString();
        updated = true;

        console.log(
          `[Reminder] Notification sent for ${owner}/${repo}#${reminder.issue}`
        );
      } catch (err) {
        console.error(
          "[Scheduler] System has failed to send reminder:",
          err.message
        );
      }
    }
  }

  if (updated) {
    saveReminders(reminders);
  }
});
