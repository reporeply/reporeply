/**
 * Enhanced Routes Configuration
 * Integrates installation, scanning, content, collaboration, AND REMINDERS
 * 
 * @file routes.config.js
 * @location config/routes.config.js
 */

import { asyncHandler } from "../src/core/utils/errors.utils.js";
import { getInstallationOctokit } from "../src/services/external/github/github.service.js";
import { handleMention } from "../src/features/webhooks/webhooks.service.js";
import { handleDailyCron } from "../src/services/background/cron.service.js";

// Installation & Scanning
import {
  handleInstallationCreated,
  handleInstallationDeleted,
  handleReposAdded,
  handleReposRemoved,
} from "../src/features/installations/handlers/installation.handler.js";

// Incremental Sync (from Phase 1)
import {
  handleIssueOpened,
  handleIssueClosed,
  handleIssueEdited as handleIssueEditedIncremental,
  handlePROpened,
  handlePRClosed,
  handlePush,
  handleMemberAdded,
} from "../src/features/scanning/handlers/incremental.handler.js";

// Real-time Sync (Phase 2 - Full Content)
import {
  handleIssueCommentCreated,
  handleIssueCommentEdited,
  handleIssueEdited,
  handlePRReviewCommentCreated,
  handlePRReviewSubmitted,
  handlePREdited,
} from "../src/features/content/realtime-sync.service.js";

// API Routes
import installationRoutes from "../src/features/installations/installation.routes.js";
import contentRoutes from "../src/features/content/content.routes.js";
import collaborationRoutes from "../src/features/collaboration/collaboration.routes.js";
import reminderRoutes from "../src/features/reminders/reminders.routes.js"; // ✅ ADD THIS

// GitLab & Telegram
import gitlabRoutes from "../src/features/auth/providers/gitlab.provider.js";
import { setupTelegramWebhooks } from "../config/telegram.config.js";

export function setupRoutes(app) {
  // Health checks
  app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/", (req, res) => {
    res.status(200).send("RepoReply server is running");
  });

  /* ==================== GitHub Webhook (Main) ==================== */
  app.post(
    "/webhook",
    asyncHandler(async (req, res) => {
      const event = req.headers["x-github-event"];
      const action = req.body?.action;

      // Ignore bot events
      if (req.body?.sender?.type === "Bot") {
        return res.sendStatus(200);
      }

      const installationId = req.body.installation?.id;
      console.log(`\n[Webhook] Event: ${event}, Action: ${action}, Installation: ${installationId}`);

      /* -------------------- Installation Events -------------------- */
      if (event === "installation") {
        if (action === "created") {
          await handleInstallationCreated(req.body);
        } else if (action === "deleted") {
          await handleInstallationDeleted(req.body);
        }
        return res.sendStatus(200);
      }

      if (event === "installation_repositories") {
        if (action === "added") {
          await handleReposAdded(req.body);
        } else if (action === "removed") {
          await handleReposRemoved(req.body);
        }
        return res.sendStatus(200);
      }

      /* -------------------- Require Installation ID -------------------- */
      if (!installationId) return res.sendStatus(200);

      const octokit = await getInstallationOctokit(installationId);

      /* -------------------- Issue Events -------------------- */
      if (event === "issues") {
        if (action === "opened") {
          // Metadata-only update
          await handleIssueOpened(req.body);

          // Auto-comment on new issues
          await octokit.issues.createComment({
            owner: req.body.repository.owner.login,
            repo: req.body.repository.name,
            issue_number: req.body.issue.number,
            body:
              "Thank you for opening this issue. " +
              "We have started monitoring this issue.",
          });
        } else if (action === "closed") {
          await handleIssueClosed(req.body);
        } else if (action === "edited") {
          // Metadata update
          await handleIssueEditedIncremental(req.body);
          // Real-time body update (if deep-fetched)
          await handleIssueEdited(req.body);
        }
        return res.sendStatus(200);
      }

      /* -------------------- Issue Comment Events -------------------- */
      if (event === "issue_comment") {
        if (action === "created") {
          // Handle @reporeply mentions (existing feature)
          await handleMention({
            provider: "github",
            payload: req.body,
            octokit,
          });

          // Real-time sync comment (if issue is deep-fetched)
          await handleIssueCommentCreated(req.body);
        } else if (action === "edited") {
          await handleIssueCommentEdited(req.body);
        }
        return res.sendStatus(200);
      }

      /* -------------------- Pull Request Events -------------------- */
      if (event === "pull_request") {
        if (action === "opened") {
          await handlePROpened(req.body);
        } else if (action === "closed") {
          await handlePRClosed(req.body);
        } else if (action === "edited") {
          await handlePREdited(req.body);
        }
        return res.sendStatus(200);
      }

      /* -------------------- PR Review Comment Events -------------------- */
      if (event === "pull_request_review_comment") {
        if (action === "created") {
          await handlePRReviewCommentCreated(req.body);
        }
        return res.sendStatus(200);
      }

      /* -------------------- PR Review Events -------------------- */
      if (event === "pull_request_review") {
        if (action === "submitted") {
          await handlePRReviewSubmitted(req.body);
        }
        return res.sendStatus(200);
      }

      /* -------------------- Push Events -------------------- */
      if (event === "push") {
        await handlePush(req.body);
        return res.sendStatus(200);
      }

      /* -------------------- Member Events -------------------- */
      if (event === "member") {
        if (action === "added") {
          await handleMemberAdded(req.body);
        }
        return res.sendStatus(200);
      }

      // Unknown event
      res.sendStatus(200);
    })
  );

  /* ==================== API Routes ==================== */
  
  // Installation management
  app.use("/api/installations", installationRoutes);

  // Content access (deep fetch)
  app.use("/api/content", contentRoutes);

  // Collaboration (RepoReply chat)
  app.use("/api/collaboration", collaborationRoutes);

  // ✅ ADD THIS - Reminders
  app.use("/api/reminders", reminderRoutes);

  /* ==================== GitLab Routes ==================== */
  app.use("/gitlab", gitlabRoutes);
  app.use("/auth/gitlab", gitlabRoutes);

  /* ==================== Telegram Webhooks ==================== */
  setupTelegramWebhooks(app);

  /* ==================== Daily Cron ==================== */
  app.post(
    "/cron/daily",
    asyncHandler(async (req, res) => {
      await handleDailyCron();
      res.send("Daily inactivity scan completed");
    })
  );

  /* ==================== 404 Handler ==================== */
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: "Endpoint not found",
    });
  });
}

export default setupRoutes;