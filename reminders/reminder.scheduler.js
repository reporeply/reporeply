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
 * Metrics:
 * - scheduler.status
 * - reminders.checked
 * - reminders.sent
 * - reminders.failed
 *
 * Alerts:
 * - Telegram alert on reminder failure
 * - Daily summary at 06:00 and 23:00
 */

import cron from "node-cron";
import jwt from "jsonwebtoken";
import fs from "fs";
import { Octokit } from "@octokit/rest";
import { loadReminders, saveReminders } from "./reminder.service.js";
import { sendTelegramAlert } from "../alerts/telegram.alert.js";

/* -------------------- GitHub Auth Helpers -------------------- */

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

async function getInstallationOctokit(installationId) {
  const appJWT = createAppJWT();
  const appOctokit = new Octokit({ auth: appJWT });

  const { data } = await appOctokit.request(
    "POST /app/installations/{installation_id}/access_tokens",
    { installation_id: installationId }
  );

  return new Octokit({ auth: data.token });
}

/* -------------------- Alert Throttling -------------------- */

let lastFailureAlertAt = 0;

function canSendFailureAlert() {
  const now = Date.now();
  if (now - lastFailureAlertAt > 10 * 60 * 1000) {
    lastFailureAlertAt = now;
    return true;
  }
  return false;
}

/* -------------------- Reminder Scheduler -------------------- */

/**
 * Runs every 2 minutes (production-safe).
 */
cron.schedule("*/2 * * * *", async () => {
  console.log("[Metric] scheduler.status=running");

  const reminders = loadReminders();
  if (reminders.length === 0) return;

  const pending = reminders.filter((r) => !r.sent);
  console.log(`[Metric] reminders.checked=${pending.length}`);

  const now = new Date();
  let updated = false;

  for (const reminder of pending) {
    // Safety guard
    if (!reminder.installationId || !reminder.repo || !reminder.issue) {
      reminder.sent = true;
      updated = true;
      continue;
    }

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
          `[Metric] reminders.sent=1 repo=${owner}/${repo} issue=${reminder.issue}`
        );
      } catch (err) {
        console.error(`[Metric] reminders.failed=1 error="${err.message}"`);

        if (canSendFailureAlert()) {
          await sendTelegramAlert(
            "RepoReply Alert\n\n" +
              "Reminder delivery failed.\n" +
              `Repository: ${reminder.repo}\n` +
              `Issue: #${reminder.issue}\n` +
              `User: @${reminder.user}\n` +
              `Error: ${err.message}`
          );
        }
      }
    }
  }

  if (updated) {
    saveReminders(reminders);
  }
});

/* -------------------- Daily Summary Alerts -------------------- */

async function sendDailySummary(label) {
  const reminders = loadReminders();

  const total = reminders.length;
  const pending = reminders.filter((r) => !r.sent).length;
  const sent = reminders.filter((r) => r.sent).length;

  await sendTelegramAlert(
    `RepoReply Daily Summary (${label})\n\n` +
      `Total reminders: ${total}\n` +
      `Pending reminders: ${pending}\n` +
      `Sent reminders: ${sent}\n` +
      `Timestamp: ${new Date().toLocaleString()}`
  );
}

/**
 * Morning summary – 06:00
 */
cron.schedule("0 6 * * *", async () => {
  sendTelegramAlert("RepoReply test alert");

  await sendDailySummary("Morning");
});

/**
 * Night summary – 23:00
 */
cron.schedule("0 23 * * *", async () => {
  await sendDailySummary("Night");
});
