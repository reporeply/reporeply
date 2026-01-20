// config/routes.config.js

import { asyncHandler } from "../src/core/utils/errors.utils.js";
import { getInstallationOctokit } from "../src/services/external/github/github.service.js";
import { handleMention } from "../src/features/webhooks/webhooks.service.js";
import { handleDailyCron } from "../src/services/background/cron.service.js";
import gitlabRoutes from "../src/features/auth/providers/gitlab.provider.js";
import { setupTelegramWebhooks } from "../config/telegram.config.js";

/* -------------------- Import GitHub Handler -------------------- */
import { handleGitHubWebhook } from "../src/features/webhooks/handlers/github.handler.js";

/* -------------------- Import GitLab Handler -------------------- */
import { handleGitLabWebhook } from "../src/features/webhooks/handlers/gitlab.handler.js";

export function setupRoutes(app) {
  /* -------------------- Health Checks -------------------- */
  app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/", (req, res) => {
    res.status(200).send("RepoReply server is running");
  });

  /* ================================================================
   * GITHUB WEBHOOK - UPDATED WITH ISSUE-LABELS INTEGRATION
   * ================================================================ */
  app.post(
    "/webhook",
    asyncHandler(async (req, res) => {
      const event = req.headers["x-github-event"];
      const action = req.body?.action;

      /* -------------------- Ignore Bot Events -------------------- */
      if (req.body?.sender?.type === "Bot") {
        return res.sendStatus(200);
      }

      const installationId = req.body.installation?.id;
      console.log(
        `[Webhook] Event: ${event}, Action: ${action}, Installation ID: ${installationId}`,
      );

      if (!installationId) {
        return res.sendStatus(200);
      }

      /* -------------------- Route to Unified Handler -------------------- */
      try {
        const result = await handleGitHubWebhook(event, req.body);

        console.log(`[Webhook] Result:`, {
          success: result.success,
          event: result.event || event,
          action: result.action,
        });

        res.sendStatus(200);
      } catch (error) {
        console.error(`[Webhook] Error processing ${event}:`, error);
        res.sendStatus(500);
      }
    }),
  );

  /* ================================================================
   * GITLAB WEBHOOK - UPDATED WITH ISSUE-LABELS INTEGRATION
   * ================================================================ */
  app.post(
    "/webhook/gitlab",
    asyncHandler(async (req, res) => {
      const event = req.headers["x-gitlab-event"];
      const accessToken =
        req.headers["x-gitlab-token"] || process.env.GITLAB_ACCESS_TOKEN;

      console.log(`[GitLab Webhook] Event: ${event}`);

      /* -------------------- Route to Unified Handler -------------------- */
      try {
        const result = await handleGitLabWebhook(event, req.body, accessToken);

        console.log(`[GitLab Webhook] Result:`, {
          success: result.success,
          event: result.event || event,
          action: result.action,
        });

        res.sendStatus(200);
      } catch (error) {
        console.error(`[GitLab Webhook] Error processing ${event}:`, error);
        res.sendStatus(500);
      }
    }),
  );

  /* -------------------- GitLab Auth Routes -------------------- */
  app.use("/gitlab", gitlabRoutes);
  app.use("/auth/gitlab", gitlabRoutes);

  /* -------------------- Telegram Webhooks -------------------- */
  setupTelegramWebhooks(app);

  /* -------------------- Daily Cron -------------------- */
  app.post(
    "/cron/daily",
    asyncHandler(async (req, res) => {
      await handleDailyCron();
      res.send("Daily inactivity scan completed");
    }),
  );

  /* ================================================================
   * ADMIN ENDPOINTS FOR ISSUE LABELS
   * ================================================================ */

  /* -------------------- Manually Bootstrap Labels -------------------- */
  app.post(
    "/admin/labels/bootstrap",
    asyncHandler(async (req, res) => {
      const { installationId, repositoryFullName } = req.body;

      if (!installationId || !repositoryFullName) {
        return res.status(400).json({
          error: "installationId and repositoryFullName are required",
        });
      }

      // Import bootstrap function
      const { ensureDefaultLabels } =
        await import("../src/features/issue-labels/label.bootstrap.js");
      const { getInstallationOctokit } =
        await import("../src/services/external/github/github.service.js");

      const octokit = await getInstallationOctokit(installationId);
      const [owner, repo] = repositoryFullName.split("/");

      // Get repository details
      const { data: repository } = await octokit.rest.repos.get({
        owner,
        repo,
      });

      const installation = { id: installationId };

      const result = await ensureDefaultLabels(installation, repository);

      res.json({
        success: true,
        repository: repositoryFullName,
        result,
      });
    }),
  );

  /* -------------------- Manually Label an Issue -------------------- */
  app.post(
    "/admin/labels/apply",
    asyncHandler(async (req, res) => {
      const { installationId, repositoryFullName, issueNumber, labelName } =
        req.body;

      if (
        !installationId ||
        !repositoryFullName ||
        !issueNumber ||
        !labelName
      ) {
        return res.status(400).json({
          error:
            "installationId, repositoryFullName, issueNumber, and labelName are required",
        });
      }

      // Import applier function
      const { applyLabel } =
        await import("../src/features/issue-labels/label.applier.js");
      const { getInstallationOctokit } =
        await import("../src/services/external/github/github.service.js");

      const octokit = await getInstallationOctokit(installationId);
      const [owner, repo] = repositoryFullName.split("/");

      const { data: repository } = await octokit.rest.repos.get({
        owner,
        repo,
      });

      const installation = { id: installationId };

      const result = await applyLabel(
        installation,
        repository,
        issueNumber,
        labelName,
        {
          triggeredBy: "manual-admin",
          metadata: {
            timestamp: new Date().toISOString(),
            source: "admin-api",
          },
        },
      );

      res.json({
        success: result.success,
        result,
      });
    }),
  );

  /* -------------------- Check Label Health -------------------- */
  app.get(
    "/admin/labels/health/:installationId/:owner/:repo",
    asyncHandler(async (req, res) => {
      const { installationId, owner, repo } = req.params;

      // Import health check function
      const { checkLabelHealth } =
        await import("../src/features/issue-labels/label.orchestrator.js");
      const { getInstallationOctokit } =
        await import("../src/services/external/github/github.service.js");

      const octokit = await getInstallationOctokit(Number(installationId));

      const { data: repository } = await octokit.rest.repos.get({
        owner,
        repo,
      });

      const installation = { id: Number(installationId) };

      const health = await checkLabelHealth(installation, repository);

      res.json(health);
    }),
  );

  console.log("[Routes] All routes configured successfully");
}
