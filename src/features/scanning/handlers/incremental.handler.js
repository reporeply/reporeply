/**
 * Incremental Sync Handler
 * Handles real-time webhook events to keep data fresh without full rescans
 * 
 * @file incremental.handler.js
 * @location src/features/scanning/handlers/incremental.handler.js
 * 
 * PHASE 2 - Incremental updates via webhooks
 */

import { prisma } from "../../../core/database/prisma.client.js";

/**
 * Handle issues.opened webhook
 */
export async function handleIssueOpened(payload) {
  console.log(`\n[Incremental] 🎫 Issue opened: ${payload.repository.full_name}#${payload.issue.number}`);

  const repoId = payload.repository.full_name;
  const issue = payload.issue;

  try {
    // Save new issue metadata
    await prisma.issues.create({
      data: {
        id: `${repoId}#${issue.number}`,
        repo_id: repoId,
        issue_number: issue.number,
        state: issue.state,
        is_pull_request: false,
        author_id: issue.user.id.toString(),
        assignees: issue.assignees.map((a) => a.id.toString()),
        labels: issue.labels.map((l) => l.name),
        comments_count: 0,
        body_length: issue.body?.length || 0,
        created_at: new Date(issue.created_at),
        updated_at: new Date(issue.updated_at),
        closed_at: null,
      },
    });

    // Update insights
    await updateRepoInsights(repoId, {
      increment_open_issues: 1,
      last_issue_at: new Date(issue.created_at),
    });

    // Update contributor stats
    await updateContributorStats(repoId, issue.user.id.toString(), {
      increment_issues_opened: 1,
    });

    console.log(`[Incremental] ✅ Issue saved and insights updated`);
  } catch (error) {
    console.error("[Incremental] Failed to handle issue opened:", error);
  }
}

/**
 * Handle issues.closed webhook
 */
export async function handleIssueClosed(payload) {
  console.log(`\n[Incremental] 🎫 Issue closed: ${payload.repository.full_name}#${payload.issue.number}`);

  const repoId = payload.repository.full_name;
  const issue = payload.issue;

  try {
    // Update issue state
    await prisma.issues.update({
      where: {
        repo_id_issue_number: {
          repo_id: repoId,
          issue_number: issue.number,
        },
      },
      data: {
        state: "closed",
        closed_at: new Date(issue.closed_at),
        updated_at: new Date(issue.updated_at),
      },
    });

    // Update insights
    await updateRepoInsights(repoId, {
      decrement_open_issues: 1,
    });

    console.log(`[Incremental] ✅ Issue marked closed and insights updated`);
  } catch (error) {
    console.error("[Incremental] Failed to handle issue closed:", error);
  }
}

/**
 * Handle issues.edited webhook
 */
export async function handleIssueEdited(payload) {
  console.log(`\n[Incremental] 🎫 Issue edited: ${payload.repository.full_name}#${payload.issue.number}`);

  const repoId = payload.repository.full_name;
  const issue = payload.issue;

  try {
    // Update issue metadata
    await prisma.issues.update({
      where: {
        repo_id_issue_number: {
          repo_id: repoId,
          issue_number: issue.number,
        },
      },
      data: {
        labels: issue.labels.map((l) => l.name),
        assignees: issue.assignees.map((a) => a.id.toString()),
        body_length: issue.body?.length || 0,
        updated_at: new Date(issue.updated_at),
      },
    });

    console.log(`[Incremental] ✅ Issue updated`);
  } catch (error) {
    console.error("[Incremental] Failed to handle issue edited:", error);
  }
}

/**
 * Handle pull_request.opened webhook
 */
export async function handlePROpened(payload) {
  console.log(`\n[Incremental] 🔀 PR opened: ${payload.repository.full_name}#${payload.pull_request.number}`);

  const repoId = payload.repository.full_name;
  const pr = payload.pull_request;

  try {
    // Save new PR metadata
    await prisma.pull_requests.create({
      data: {
        id: `${repoId}#pr${pr.number}`,
        repo_id: repoId,
        pr_number: pr.number,
        state: pr.state,
        author_id: pr.user.id.toString(),
        reviewers: [],
        labels: pr.labels.map((l) => l.name),
        commits_count: pr.commits || 0,
        files_changed: pr.changed_files || 0,
        additions: pr.additions || 0,
        deletions: pr.deletions || 0,
        created_at: new Date(pr.created_at),
        updated_at: new Date(pr.updated_at),
        merged_at: null,
        closed_at: null,
      },
    });

    // Update insights
    await updateRepoInsights(repoId, {
      increment_open_prs: 1,
      last_pr_at: new Date(pr.created_at),
    });

    // Update contributor stats
    await updateContributorStats(repoId, pr.user.id.toString(), {
      increment_prs_opened: 1,
    });

    console.log(`[Incremental] ✅ PR saved and insights updated`);
  } catch (error) {
    console.error("[Incremental] Failed to handle PR opened:", error);
  }
}

/**
 * Handle pull_request.closed webhook
 */
export async function handlePRClosed(payload) {
  console.log(`\n[Incremental] 🔀 PR closed: ${payload.repository.full_name}#${payload.pull_request.number}`);

  const repoId = payload.repository.full_name;
  const pr = payload.pull_request;

  try {
    // Update PR state
    await prisma.pull_requests.update({
      where: {
        repo_id_pr_number: {
          repo_id: repoId,
          pr_number: pr.number,
        },
      },
      data: {
        state: pr.merged ? "merged" : "closed",
        merged_at: pr.merged_at ? new Date(pr.merged_at) : null,
        closed_at: new Date(pr.closed_at),
        updated_at: new Date(pr.updated_at),
      },
    });

    // Update insights
    await updateRepoInsights(repoId, {
      decrement_open_prs: 1,
    });

    console.log(`[Incremental] ✅ PR marked closed and insights updated`);
  } catch (error) {
    console.error("[Incremental] Failed to handle PR closed:", error);
  }
}

/**
 * Handle push webhook (for commit stats)
 */
export async function handlePush(payload) {
  console.log(`\n[Incremental] 📤 Push to ${payload.repository.full_name}`);

  const repoId = payload.repository.full_name;
  const pusher = payload.pusher;
  const commits = payload.commits || [];

  try {
    // Update repo metadata
    await prisma.repo_metadata.update({
      where: { repo_id: repoId },
      data: {
        pushed_at: new Date(payload.repository.pushed_at),
      },
    });

    // Update contributor last_active_at
    if (pusher?.name) {
      await updateContributorLastActive(repoId, pusher.name);
    }

    // Update insights
    await updateRepoInsights(repoId, {
      last_commit_at: new Date(),
    });

    console.log(`[Incremental] ✅ Push processed: ${commits.length} commits`);
  } catch (error) {
    console.error("[Incremental] Failed to handle push:", error);
  }
}

/**
 * Handle member.added webhook
 */
export async function handleMemberAdded(payload) {
  console.log(`\n[Incremental] 👤 Member added: ${payload.member.login}`);

  const repoId = payload.repository.full_name;
  const member = payload.member;

  try {
    // Add member as contributor if not exists
    await prisma.contributors.upsert({
      where: {
        repo_id_user_id: {
          repo_id: repoId,
          user_id: member.id.toString(),
        },
      },
      create: {
        repo_id: repoId,
        user_id: member.id.toString(),
        username: member.login,
        commits_count: 0,
        prs_opened: 0,
        issues_opened: 0,
        reviews_done: 0,
        last_active_at: new Date(),
      },
      update: {
        last_active_at: new Date(),
      },
    });

    console.log(`[Incremental] ✅ Member added to contributors`);
  } catch (error) {
    console.error("[Incremental] Failed to handle member added:", error);
  }
}

/**
 * Update repository insights incrementally
 */
async function updateRepoInsights(repoId, updates) {
  try {
    const current = await prisma.repo_insights.findUnique({
      where: { repo_id: repoId },
    });

    if (!current) {
      // Create if doesn't exist
      await prisma.repo_insights.create({
        data: {
          repo_id: repoId,
          open_issues_count: updates.increment_open_issues || 0,
          open_pr_count: updates.increment_open_prs || 0,
          ...updates,
        },
      });
      return;
    }

    // Calculate new values
    const newData = {
      updated_at: new Date(),
    };

    if (updates.increment_open_issues) {
      newData.open_issues_count = current.open_issues_count + updates.increment_open_issues;
    }
    if (updates.decrement_open_issues) {
      newData.open_issues_count = Math.max(0, current.open_issues_count - updates.decrement_open_issues);
    }
    if (updates.increment_open_prs) {
      newData.open_pr_count = current.open_pr_count + updates.increment_open_prs;
    }
    if (updates.decrement_open_prs) {
      newData.open_pr_count = Math.max(0, current.open_pr_count - updates.decrement_open_prs);
    }
    if (updates.last_issue_at) {
      newData.last_issue_at = updates.last_issue_at;
    }
    if (updates.last_pr_at) {
      newData.last_pr_at = updates.last_pr_at;
    }
    if (updates.last_commit_at) {
      newData.last_commit_at = updates.last_commit_at;
    }

    await prisma.repo_insights.update({
      where: { repo_id: repoId },
      data: newData,
    });
  } catch (error) {
    console.error("[Incremental] Failed to update insights:", error);
  }
}

/**
 * Update contributor statistics incrementally
 */
async function updateContributorStats(repoId, userId, updates) {
  try {
    const current = await prisma.contributors.findUnique({
      where: {
        repo_id_user_id: {
          repo_id: repoId,
          user_id: userId,
        },
      },
    });

    if (!current) return; // Skip if contributor doesn't exist yet

    const newData = {
      last_active_at: new Date(),
    };

    if (updates.increment_issues_opened) {
      newData.issues_opened = current.issues_opened + updates.increment_issues_opened;
    }
    if (updates.increment_prs_opened) {
      newData.prs_opened = current.prs_opened + updates.increment_prs_opened;
    }
    if (updates.increment_reviews_done) {
      newData.reviews_done = current.reviews_done + updates.increment_reviews_done;
    }

    await prisma.contributors.update({
      where: {
        repo_id_user_id: {
          repo_id: repoId,
          user_id: userId,
        },
      },
      data: newData,
    });
  } catch (error) {
    console.error("[Incremental] Failed to update contributor stats:", error);
  }
}

/**
 * Update contributor last active time
 */
async function updateContributorLastActive(repoId, username) {
  try {
    await prisma.contributors.updateMany({
      where: {
        repo_id: repoId,
        username: username,
      },
      data: {
        last_active_at: new Date(),
      },
    });
  } catch (error) {
    console.error("[Incremental] Failed to update last active:", error);
  }
}