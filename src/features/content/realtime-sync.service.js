/**
 * Real-time Sync Service
 * Handles incremental updates via webhooks for issues/PRs that have been deep-fetched
 * 
 * @file realtime-sync.service.js
 * @location src/features/content/realtime-sync.service.js
 * 
 * CRITICAL: Only applies updates to items that have body_fetched = true
 * Never creates new full content from webhooks alone
 */

import { prisma } from "../../core/database/prisma.client.js";

/**
 * Handle new issue comment from webhook
 * Only saves if issue is already deep-fetched
 */
export async function handleIssueCommentCreated(payload) {
  const repoId = payload.repository.full_name;
  const issueNumber = payload.issue.number;

  console.log(`\n[Realtime Sync] 💬 Comment created: ${repoId}#${issueNumber}`);

  try {
    // Check if issue is deep-fetched
    const issue = await prisma.issues.findUnique({
      where: {
        repo_id_issue_number: {
          repo_id: repoId,
          issue_number: issueNumber,
        },
      },
      select: { body_fetched: true, realtime_enabled: true },
    });

    if (!issue?.body_fetched || !issue?.realtime_enabled) {
      console.log(`[Realtime Sync] ⏭️  Skipped - issue not deep-fetched or realtime disabled`);
      return;
    }

    // Save new comment
    const comment = payload.comment;
    const issueId = `${repoId}#${issueNumber}`;

    await prisma.issue_comments.upsert({
      where: {
        issue_id_comment_number: {
          issue_id: issueId,
          comment_number: comment.id,
        },
      },
      create: {
        id: `${issueId}-comment-${comment.id}`,
        issue_id: issueId,
        comment_number: comment.id,
        author_id: comment.user.id.toString(),
        author_login: comment.user.login,
        body_raw: comment.body || "",
        body_html: comment.body_html,
        created_at: new Date(comment.created_at),
        updated_at: new Date(comment.updated_at),
      },
      update: {
        body_raw: comment.body || "",
        body_html: comment.body_html,
        updated_at: new Date(comment.updated_at),
      },
    });

    // Update issue metadata
    await prisma.issues.update({
      where: {
        repo_id_issue_number: {
          repo_id: repoId,
          issue_number: issueNumber,
        },
      },
      data: {
        comments_count: { increment: 1 },
        last_comment_at: new Date(comment.created_at),
        last_synced_at: new Date(),
      },
    });

    console.log(`[Realtime Sync] ✅ Comment saved`);

    // TODO: Trigger WebSocket notification to connected clients
    // await notifyClients(repoId, issueNumber, 'new_comment', comment);
  } catch (error) {
    console.error("[Realtime Sync] Failed to handle comment:", error);
  }
}

/**
 * Handle issue comment edited
 */
export async function handleIssueCommentEdited(payload) {
  const repoId = payload.repository.full_name;
  const issueNumber = payload.issue.number;
  const issueId = `${repoId}#${issueNumber}`;

  console.log(`[Realtime Sync] ✏️  Comment edited: ${repoId}#${issueNumber}`);

  try {
    const issue = await prisma.issues.findUnique({
      where: {
        repo_id_issue_number: {
          repo_id: repoId,
          issue_number: issueNumber,
        },
      },
      select: { body_fetched: true, realtime_enabled: true },
    });

    if (!issue?.body_fetched || !issue?.realtime_enabled) {
      return;
    }

    const comment = payload.comment;

    await prisma.issue_comments.update({
      where: {
        issue_id_comment_number: {
          issue_id: issueId,
          comment_number: comment.id,
        },
      },
      data: {
        body_raw: comment.body || "",
        body_html: comment.body_html,
        updated_at: new Date(comment.updated_at),
      },
    });

    await prisma.issues.update({
      where: {
        repo_id_issue_number: {
          repo_id: repoId,
          issue_number: issueNumber,
        },
      },
      data: {
        last_synced_at: new Date(),
      },
    });

    console.log(`[Realtime Sync] ✅ Comment updated`);
  } catch (error) {
    console.error("[Realtime Sync] Failed to update comment:", error);
  }
}

/**
 * Handle issue body edited
 */
export async function handleIssueEdited(payload) {
  const repoId = payload.repository.full_name;
  const issueNumber = payload.issue.number;

  console.log(`[Realtime Sync] ✏️  Issue edited: ${repoId}#${issueNumber}`);

  try {
    const issue = await prisma.issues.findUnique({
      where: {
        repo_id_issue_number: {
          repo_id: repoId,
          issue_number: issueNumber,
        },
      },
      select: { body_fetched: true },
    });

    // Only update body if it was previously fetched
    const updateData = {
      title: payload.issue.title,
      labels: payload.issue.labels.map((l) => l.name),
      updated_at: new Date(payload.issue.updated_at),
      last_synced_at: new Date(),
    };

    if (issue?.body_fetched) {
      updateData.body_raw = payload.issue.body || "";
      updateData.body_html = payload.issue.body_html;
    }

    await prisma.issues.update({
      where: {
        repo_id_issue_number: {
          repo_id: repoId,
          issue_number: issueNumber,
        },
      },
      data: updateData,
    });

    console.log(`[Realtime Sync] ✅ Issue updated`);
  } catch (error) {
    console.error("[Realtime Sync] Failed to update issue:", error);
  }
}

/**
 * Handle PR review comment created
 */
export async function handlePRReviewCommentCreated(payload) {
  const repoId = payload.repository.full_name;
  const prNumber = payload.pull_request.number;

  console.log(`[Realtime Sync] 💬 PR comment created: ${repoId}#pr${prNumber}`);

  try {
    const pr = await prisma.pull_requests.findUnique({
      where: {
        repo_id_pr_number: {
          repo_id: repoId,
          pr_number: prNumber,
        },
      },
      select: { body_fetched: true, realtime_enabled: true },
    });

    if (!pr?.body_fetched || !pr?.realtime_enabled) {
      console.log(`[Realtime Sync] ⏭️  Skipped - PR not deep-fetched or realtime disabled`);
      return;
    }

    const comment = payload.comment;
    const prId = `${repoId}#pr${prNumber}`;

    await prisma.pr_comments.upsert({
      where: {
        pr_id_comment_number: {
          pr_id: prId,
          comment_number: comment.id,
        },
      },
      create: {
        id: `${prId}-comment-${comment.id}`,
        pr_id: prId,
        comment_number: comment.id,
        author_id: comment.user.id.toString(),
        author_login: comment.user.login,
        body_raw: comment.body || "",
        body_html: comment.body_html,
        created_at: new Date(comment.created_at),
        updated_at: new Date(comment.updated_at),
      },
      update: {
        body_raw: comment.body || "",
        body_html: comment.body_html,
        updated_at: new Date(comment.updated_at),
      },
    });

    await prisma.pull_requests.update({
      where: {
        repo_id_pr_number: {
          repo_id: repoId,
          pr_number: prNumber,
        },
      },
      data: {
        last_synced_at: new Date(),
      },
    });

    console.log(`[Realtime Sync] ✅ PR comment saved`);
  } catch (error) {
    console.error("[Realtime Sync] Failed to handle PR comment:", error);
  }
}

/**
 * Handle PR review submitted
 */
export async function handlePRReviewSubmitted(payload) {
  const repoId = payload.repository.full_name;
  const prNumber = payload.pull_request.number;

  console.log(`[Realtime Sync] 👀 PR review submitted: ${repoId}#pr${prNumber}`);

  try {
    const pr = await prisma.pull_requests.findUnique({
      where: {
        repo_id_pr_number: {
          repo_id: repoId,
          pr_number: prNumber,
        },
      },
      select: { body_fetched: true, realtime_enabled: true },
    });

    if (!pr?.body_fetched || !pr?.realtime_enabled) {
      return;
    }

    const review = payload.review;
    const prId = `${repoId}#pr${prNumber}`;

    await prisma.pr_reviews.upsert({
      where: {
        pr_id_review_number: {
          pr_id: prId,
          review_number: review.id,
        },
      },
      create: {
        id: `${prId}-review-${review.id}`,
        pr_id: prId,
        review_number: review.id,
        author_id: review.user.id.toString(),
        author_login: review.user.login,
        state: review.state,
        body_raw: review.body || "",
        submitted_at: new Date(review.submitted_at),
      },
      update: {
        state: review.state,
        body_raw: review.body || "",
      },
    });

    await prisma.pull_requests.update({
      where: {
        repo_id_pr_number: {
          repo_id: repoId,
          pr_number: prNumber,
        },
      },
      data: {
        last_synced_at: new Date(),
      },
    });

    console.log(`[Realtime Sync] ✅ PR review saved`);
  } catch (error) {
    console.error("[Realtime Sync] Failed to handle PR review:", error);
  }
}

/**
 * Handle PR edited
 */
export async function handlePREdited(payload) {
  const repoId = payload.repository.full_name;
  const prNumber = payload.pull_request.number;

  console.log(`[Realtime Sync] ✏️  PR edited: ${repoId}#pr${prNumber}`);

  try {
    const pr = await prisma.pull_requests.findUnique({
      where: {
        repo_id_pr_number: {
          repo_id: repoId,
          pr_number: prNumber,
        },
      },
      select: { body_fetched: true },
    });

    const updateData = {
      title: payload.pull_request.title,
      labels: payload.pull_request.labels?.map((l) => l.name) || [],
      updated_at: new Date(payload.pull_request.updated_at),
      last_synced_at: new Date(),
    };

    if (pr?.body_fetched) {
      updateData.body_raw = payload.pull_request.body || "";
      updateData.body_html = payload.pull_request.body_html;
    }

    await prisma.pull_requests.update({
      where: {
        repo_id_pr_number: {
          repo_id: repoId,
          pr_number: prNumber,
        },
      },
      data: updateData,
    });

    console.log(`[Realtime Sync] ✅ PR updated`);
  } catch (error) {
    console.error("[Realtime Sync] Failed to update PR:", error);
  }
}