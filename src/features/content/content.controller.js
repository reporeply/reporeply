/**
 * Content Controller
 * 
 * @file content.controller.js
 * @location src/features/content/content.controller.js
 */

import { deepFetchIssue, deepFetchPR } from "./deep-fetch.service.js";
import { prisma } from "../../core/database/prisma.client.js";
import { ValidationError } from "../../core/utils/errors.utils.js";

/**
 * GET /api/content/repos/:owner/:repo/issues/:number/full
 * Fetch full issue content (body + all comments)
 */
export async function getIssueFullContent(req, res) {
  const { owner, repo, number } = req.params;
  const repoId = `${owner}/${repo}`;
  const issueNumber = parseInt(number);

  // TODO: Get userId from auth middleware
  const userId = req.user?.id || "demo-user";

  try {
    console.log(`\n[Content API] 📖 Request full issue: ${repoId}#${issueNumber}`);

    // Deep fetch (will use cache if already fetched)
    const issue = await deepFetchIssue({
      repoId,
      issueNumber,
      userId,
    });

    res.status(200).json({
      success: true,
      data: {
        issue: {
          id: issue.id,
          number: issue.issue_number,
          title: issue.title,
          state: issue.state,
          body: issue.body_raw,
          body_html: issue.body_html,
          author: {
            id: issue.author_id,
            login: issue.author_login,
          },
          labels: issue.labels,
          assignees: issue.assignees,
          comments_count: issue.comments_count,
          created_at: issue.created_at,
          updated_at: issue.updated_at,
          closed_at: issue.closed_at,
        },
        comments: issue.comments.map((c) => ({
          id: c.id,
          author: {
            id: c.author_id,
            login: c.author_login,
          },
          body: c.body_raw,
          body_html: c.body_html,
          created_at: c.created_at,
          updated_at: c.updated_at,
        })),
        metadata: {
          cached: issue.body_fetched_at < new Date(Date.now() - 60000), // Cached if >1min old
          realtime_enabled: issue.realtime_enabled,
          last_synced: issue.last_synced_at,
        },
      },
    });
  } catch (error) {
    console.error("[Content API] Error:", error);

    if (error instanceof ValidationError) {
      return res.status(403).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to fetch issue content",
    });
  }
}

/**
 * GET /api/content/repos/:owner/:repo/pulls/:number/full
 * Fetch full PR content (body + all comments + reviews)
 */
export async function getPRFullContent(req, res) {
  const { owner, repo, number } = req.params;
  const repoId = `${owner}/${repo}`;
  const prNumber = parseInt(number);

  const userId = req.user?.id || "demo-user";

  try {
    console.log(`\n[Content API] 📖 Request full PR: ${repoId}#pr${prNumber}`);

    const pr = await deepFetchPR({
      repoId,
      prNumber,
      userId,
    });

    res.status(200).json({
      success: true,
      data: {
        pull_request: {
          id: pr.id,
          number: pr.pr_number,
          title: pr.title,
          state: pr.state,
          body: pr.body_raw,
          body_html: pr.body_html,
          author: {
            id: pr.author_id,
            login: pr.author_login,
          },
          labels: pr.labels,
          reviewers: pr.reviewers,
          commits_count: pr.commits_count,
          files_changed: pr.files_changed,
          additions: pr.additions,
          deletions: pr.deletions,
          created_at: pr.created_at,
          updated_at: pr.updated_at,
          merged_at: pr.merged_at,
          closed_at: pr.closed_at,
        },
        comments: pr.comments.map((c) => ({
          id: c.id,
          author: {
            id: c.author_id,
            login: c.author_login,
          },
          body: c.body_raw,
          body_html: c.body_html,
          created_at: c.created_at,
          updated_at: c.updated_at,
        })),
        reviews: pr.reviews.map((r) => ({
          id: r.id,
          author: {
            id: r.author_id,
            login: r.author_login,
          },
          state: r.state,
          body: r.body_raw,
          submitted_at: r.submitted_at,
        })),
        metadata: {
          cached: pr.body_fetched_at < new Date(Date.now() - 60000),
          realtime_enabled: pr.realtime_enabled,
          last_synced: pr.last_synced_at,
        },
      },
    });
  } catch (error) {
    console.error("[Content API] Error:", error);

    if (error instanceof ValidationError) {
      return res.status(403).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to fetch PR content",
    });
  }
}

/**
 * POST /api/content/repos/:owner/:repo/issues/:number/realtime
 * Enable real-time sync for an issue
 */
export async function enableRealtimeForIssue(req, res) {
  const { owner, repo, number } = req.params;
  const repoId = `${owner}/${repo}`;
  const issueNumber = parseInt(number);

  try {
    // Check if repo has realtime feature enabled
    const repository = await prisma.repositories.findUnique({
      where: { id: repoId },
      select: { is_paid: true, realtime_enabled: true },
    });

    if (!repository?.is_paid || !repository?.realtime_enabled) {
      return res.status(403).json({
        success: false,
        error: "Real-time collaboration requires a paid plan with the feature enabled",
      });
    }

    // Enable realtime for this issue
    await prisma.issues.update({
      where: {
        repo_id_issue_number: {
          repo_id: repoId,
          issue_number: issueNumber,
        },
      },
      data: {
        realtime_enabled: true,
      },
    });

    res.status(200).json({
      success: true,
      message: "Real-time sync enabled for this issue",
    });
  } catch (error) {
    console.error("[Content API] Failed to enable realtime:", error);
    res.status(500).json({
      success: false,
      error: "Failed to enable real-time sync",
    });
  }
}

/**
 * POST /api/content/repos/:owner/:repo/pulls/:number/realtime
 * Enable real-time sync for a PR
 */
export async function enableRealtimeForPR(req, res) {
  const { owner, repo, number } = req.params;
  const repoId = `${owner}/${repo}`;
  const prNumber = parseInt(number);

  try {
    const repository = await prisma.repositories.findUnique({
      where: { id: repoId },
      select: { is_paid: true, realtime_enabled: true },
    });

    if (!repository?.is_paid || !repository?.realtime_enabled) {
      return res.status(403).json({
        success: false,
        error: "Real-time collaboration requires a paid plan with the feature enabled",
      });
    }

    await prisma.pull_requests.update({
      where: {
        repo_id_pr_number: {
          repo_id: repoId,
          pr_number: prNumber,
        },
      },
      data: {
        realtime_enabled: true,
      },
    });

    res.status(200).json({
      success: true,
      message: "Real-time sync enabled for this pull request",
    });
  } catch (error) {
    console.error("[Content API] Failed to enable realtime:", error);
    res.status(500).json({
      success: false,
      error: "Failed to enable real-time sync",
    });
  }
}