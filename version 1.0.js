import express from "express";
import fs from "fs";
import jwt from "jsonwebtoken";
import { Octokit } from "@octokit/rest";
import dotenv from "dotenv";

const INACTIVITY_DAYS = 30;
const GRACE_PERIOD_DAYS = 7;
const MS_IN_DAY = 24 * 60 * 60 * 1000;

dotenv.config();

const app = express();
app.use(express.json());

/* -------------------- Configuration -------------------- */

const INACTIVITY_DAYS = 30;
const MS_IN_DAY = 24 * 60 * 60 * 1000;

/* -------------------- Auth Helpers -------------------- */

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
    {
      installation_id: installationId,
    }
  );

  return new Octokit({ auth: data.token });
}

function daysSince(date) {
  return Math.floor((Date.now() - new Date(date).getTime()) / MS_IN_DAY);
}

async function hasInactivityWarning(octokit, owner, repo, issueNumber) {
  const comments = await octokit.paginate(
    octokit.issues.listComments,
    {
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100,
    }
  );

  return comments.some(comment =>
    comment.user?.type === "Bot" &&
    comment.body?.includes("inactive for")
  );
}

/* -------------------- Inactivity Logic -------------------- */

function isInactive(updatedAt) {
  const lastUpdate = new Date(updatedAt).getTime();
  const now = Date.now();
  const diffDays = Math.floor((now - lastUpdate) / MS_IN_DAY);

  return diffDays >= INACTIVITY_DAYS;
}

async function scanInactiveIssues(octokit, owner, repo) {
  const issues = await octokit.paginate(
    octokit.issues.listForRepo,
    {
      owner,
      repo,
      state: "open",
      per_page: 100,
    }
  );

  for (const issue of issues) {
    if (issue.pull_request) continue;

    const labels = issue.labels.map(l =>
      typeof l === "string" ? l : l.name
    );

    if (labels.includes("do-not-close")) continue;

    const inactiveDays = daysSince(issue.updated_at);

    // STEP 1: Post warning
    if (inactiveDays >= INACTIVITY_DAYS) {
      const alreadyWarned = await hasInactivityWarning(
        octokit,
        owner,
        repo,
        issue.number
      );

      if (!alreadyWarned) {
        await octokit.issues.createComment({
          owner,
          repo,
          issue_number: issue.number,
          body:
            `This issue has been inactive for ${INACTIVITY_DAYS} days.\n\n` +
            `If no further activity occurs, it will be automatically closed in ` +
            `${GRACE_PERIOD_DAYS} days.`,
        });

        console.log(`Warning posted on issue #${issue.number}`);
        continue;
      }
    }

    // STEP 2: Auto-close after grace period
    if (inactiveDays >= INACTIVITY_DAYS + GRACE_PERIOD_DAYS) {
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: issue.number,
        body:
          `Closing this issue due to prolonged inactivity.\n\n` +
          `If this is still relevant, please reopen with updated information.`,
      });

      await octokit.issues.update({
        owner,
        repo,
        issue_number: issue.number,
        state: "closed",
      });

      console.log(`Issue #${issue.number} closed due to inactivity`);
    }
  }
}

  for (const issue of issues) {
    if (issue.pull_request) continue;

    if (isInactive(issue.updated_at)) {
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: issue.number,
        body:
          `This issue has been inactive for ${INACTIVITY_DAYS} days.\n\n` +
          `Please add an update if this is still relevant. ` +
          `Inactive issues may be closed automatically to keep the tracker clean.`,
      });

      console.log(`Inactivity notice posted on issue #${issue.number}`);
    }
  }
}

/* -------------------- Webhook Handler -------------------- */

app.post("/webhook", async (req, res) => {
  const event = req.headers["x-github-event"];
  const action = req.body?.action;

  // Ignore bot events to prevent loops
  if (req.body?.sender?.type === "Bot") {
    return res.sendStatus(200);
  }

  console.log(`Received event: ${event}, action: ${action}`);

  const installationId = req.body.installation?.id;
  const { owner, name } = req.body.repository || {};

  console.log("Repo:", owner?.login, "/", name);
  console.log("Installation ID:", installationId);

  try {
    const octokit = await getInstallationOctokit(installationId);
    console.log("Octokit ready");

    // 1️⃣ AUTO-COMMENT ON ISSUE OPEN
    if (event === "issues" && action === "opened") {
      await octokit.issues.createComment({
        owner: owner.login,
        repo: name,
        issue_number: req.body.issue.number,
        body:
          "Thank you for opening this issue. " +
          "Repo-Wizrd is monitoring activity and will follow up if this issue becomes inactive.",
      });

      console.log("Comment API call succeeded");
    }

    // 2️⃣ INACTIVITY SCAN (safe to run on issue + comment events)
    if (event === "issues" || event === "issue_comment") {
      await scanInactiveIssues(octokit, owner.login, name);
    }
  } catch (err) {
    console.error("Webhook processing failed:", err.status, err.message);
  }

  res.sendStatus(200);
});

/* -------------------- Server -------------------- */

app.get("/", (req, res) => {
  res.send("Repo-Wizrd webhook server is running");
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
