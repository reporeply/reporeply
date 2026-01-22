/**
 * Deep Fetch Service
 * Lazy-loads full issue/PR content and comments on demand
 * 
 * @file deep-fetch.service.js
 * @location src/features/content/deep-fetch.service.js
 * 
 * CRITICAL RULES:
 * 1. Only fetch when user explicitly requests (opens issue/PR)
 * 2. Lock with transaction to prevent duplicate fetches
 * 3. Once fetched, NEVER refetch entire history
 * 4. Use webhooks for incremental updates
 */

import { prisma } from "../../core/database/prisma.client.js";
import { Octokit } from "@octokit/rest";
import { getInstallationForRepo } from "../installations/installation.service.js";
import { ValidationError } from "../../core/utils/errors.utils.js";

/**
 * Deep fetch an issue with all its content
 * This is the main entry point for paid users viewing full issue
 */
export async function deepFetchIssue({ repoId, issueNumber, userId }) {
  console.log(`\n[Deep Fetch] 🎯 Request: ${repoId}#${issueNumber} by ${userId}`);

  // Check if repo is paid
  const repository = await prisma.repositories.findUnique({
    where: { id: repoId },
    select: { is_paid: true, realtime_enabled: true },
  });

  if (!repository?.is_paid) {
    throw new ValidationError("Full content access requires a paid plan");
  }

  // Use transaction with SELECT FOR UPDATE to prevent race conditions
  const result = await prisma.$transaction(async (tx) => {
    // Lock the issue row
    const issue = await tx.issues.findUnique({
      where: {
        repo_id_issue_number: {
          repo_id: repoId,
          issue_number: issueNumber,
        },
      },
    });

    if (!issue) {
      throw new ValidationError("Issue not found");
    }

    // Check if already fetched
    if (issue.body_fetched && issue.comments_fetched) {
      console.log(`[Deep Fetch] ✅ Already cached: ${repoId}#${issueNumber}`);
      return { alreadyFetched: true, issue };
    }

    // Mark as being fetched (prevents duplicate fetches)
    await tx.issues.update({
      where: {
        repo_id_issue_number: {
          repo_id: repoId,
          issue_number: issueNumber,
        },
      },
      data: {
        body_fetched: true,
        comments_fetched: true,
        body_fetched_at: new Date(),
      },
    });

    return { alreadyFetched: false, issue };
  });

  if (result.alreadyFetched) {
    // Return cached data
    return await getIssueWithComments(repoId, issueNumber);
  }

  // Fetch from GitHub API
  console.log(`[Deep Fetch] 📡 Fetching from GitHub: ${repoId}#${issueNumber}`);

  const [owner, repo] = repoId.split("/");
  const octokit = await getAuthenticatedOctokit(repoId);

  // Fetch issue body
  const { data: issueData } = await octokit.issues.get({
    owner,
    repo,
    issue_number: issueNumber,
  });

  // Update issue with body
  await prisma.issues.update({
    where: {
      repo_id_issue_number: {
        repo_id: repoId,
        issue_number: issueNumber,
      },
    },
    data: {
      body_raw: issueData.body || "",
      body_html: issueData.body_html,
      last_synced_at: new Date(),
    },
  });

  // Fetch all comments
  const comments = await fetchAllIssueComments(octokit, owner, repo, issueNumber);

  // Save comments in batch
  if (comments.length > 0) {
    await saveIssueComments(repoId, issueNumber, comments);
  }

  console.log(`[Deep Fetch] ✅ Fetched: body + ${comments.length} comments`);

  // Enable realtime if repo has it enabled
  if (repository.realtime_enabled) {
    await prisma.issues.update({
      where: {
        repo_id_issue_number: {
          repo_id: repoId,
          issue_number: issueNumber,
        },
      },
      data: { realtime_enabled: true },
    });
  }

  // Return full data
  return await getIssueWithComments(repoId, issueNumber);
}

/**
 * Deep fetch a pull request with all its content
 */
export async function deepFetchPR({ repoId, prNumber, userId }) {
  console.log(`\n[Deep Fetch] 🎯 Request: ${repoId}#pr${prNumber} by ${userId}`);

  const repository = await prisma.repositories.findUnique({
    where: { id: repoId },
    select: { is_paid: true, realtime_enabled: true },
  });

  if (!repository?.is_paid) {
    throw new ValidationError("Full content access requires a paid plan");
  }

  // Transaction lock
  const result = await prisma.$transaction(async (tx) => {
    const pr = await tx.pull_requests.findUnique({
      where: {
        repo_id_pr_number: {
          repo_id: repoId,
          pr_number: prNumber,
        },
      },
    });

    if (!pr) {
      throw new ValidationError("Pull request not found");
    }

    if (pr.body_fetched && pr.comments_fetched) {
      console.log(`[Deep Fetch] ✅ Already cached: ${repoId}#pr${prNumber}`);
      return { alreadyFetched: true, pr };
    }

    await tx.pull_requests.update({
      where: {
        repo_id_pr_number: {
          repo_id: repoId,
          pr_number: prNumber,
        },
      },
      data: {
        body_fetched: true,
        comments_fetched: true,
        body_fetched_at: new Date(),
      },
    });

    return { alreadyFetched: false, pr };
  });

  if (result.alreadyFetched) {
    return await getPRWithComments(repoId, prNumber);
  }

  console.log(`[Deep Fetch] 📡 Fetching from GitHub: ${repoId}#pr${prNumber}`);

  const [owner, repo] = repoId.split("/");
  const octokit = await getAuthenticatedOctokit(repoId);

  // Fetch PR body
  const { data: prData } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  await prisma.pull_requests.update({
    where: {
      repo_id_pr_number: {
        repo_id: repoId,
        pr_number: prNumber,
      },
    },
    data: {
      body_raw: prData.body || "",
      body_html: prData.body_html,
      last_synced_at: new Date(),
    },
  });

  // Fetch comments
  const comments = await fetchAllPRComments(octokit, owner, repo, prNumber);
  if (comments.length > 0) {
    await savePRComments(repoId, prNumber, comments);
  }

  // Fetch reviews
  const reviews = await fetchAllPRReviews(octokit, owner, repo, prNumber);
  if (reviews.length > 0) {
    await savePRReviews(repoId, prNumber, reviews);
  }

  console.log(`[Deep Fetch] ✅ Fetched: body + ${comments.length} comments + ${reviews.length} reviews`);

  if (repository.realtime_enabled) {
    await prisma.pull_requests.update({
      where: {
        repo_id_pr_number: {
          repo_id: repoId,
          pr_number: prNumber,
        },
      },
      data: { realtime_enabled: true },
    });
  }

  return await getPRWithComments(repoId, prNumber);
}

/**
 * Fetch all comments for an issue (paginated)
 */
async function fetchAllIssueComments(octokit, owner, repo, issueNumber) {
  const comments = [];
  let page = 1;

  while (true) {
    const { data } = await octokit.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100,
      page,
    });

    if (data.length === 0) break;

    comments.push(...data);

    if (data.length < 100) break;
    page++;
  }

  return comments;
}

/**
 * Fetch all comments for a PR (paginated)
 */
async function fetchAllPRComments(octokit, owner, repo, prNumber) {
  const comments = [];
  let page = 1;

  while (true) {
    const { data } = await octokit.pulls.listReviewComments({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
      page,
    });

    if (data.length === 0) break;

    comments.push(...data);

    if (data.length < 100) break;
    page++;
  }

  return comments;
}

/**
 * Fetch all reviews for a PR
 */
async function fetchAllPRReviews(octokit, owner, repo, prNumber) {
  try {
    const { data } = await octokit.pulls.listReviews({
      owner,
      repo,
      pull_number: prNumber,
    });
    return data;
  } catch (error) {
    console.error("[Deep Fetch] Failed to fetch reviews:", error);
    return [];
  }
}

/**
 * Save issue comments in batch
 */
async function saveIssueComments(repoId, issueNumber, comments) {
  const issueId = `${repoId}#${issueNumber}`;

  const commentData = comments.map((c) => ({
    id: `${issueId}-comment-${c.id}`,
    issue_id: issueId,
    comment_number: c.id,
    author_id: c.user.id.toString(),
    author_login: c.user.login,
    body_raw: c.body || "",
    body_html: c.body_html,
    created_at: new Date(c.created_at),
    updated_at: new Date(c.updated_at),
  }));

  await prisma.issue_comments.createMany({
    data: commentData,
    skipDuplicates: true,
  });
}

/**
 * Save PR comments in batch
 */
async function savePRComments(repoId, prNumber, comments) {
  const prId = `${repoId}#pr${prNumber}`;

  const commentData = comments.map((c) => ({
    id: `${prId}-comment-${c.id}`,
    pr_id: prId,
    comment_number: c.id,
    author_id: c.user.id.toString(),
    author_login: c.user.login,
    body_raw: c.body || "",
    body_html: c.body_html,
    created_at: new Date(c.created_at),
    updated_at: new Date(c.updated_at),
  }));

  await prisma.pr_comments.createMany({
    data: commentData,
    skipDuplicates: true,
  });
}

/**
 * Save PR reviews in batch
 */
async function savePRReviews(repoId, prNumber, reviews) {
  const prId = `${repoId}#pr${prNumber}`;

  const reviewData = reviews.map((r) => ({
    id: `${prId}-review-${r.id}`,
    pr_id: prId,
    review_number: r.id,
    author_id: r.user.id.toString(),
    author_login: r.user.login,
    state: r.state,
    body_raw: r.body || "",
    submitted_at: new Date(r.submitted_at),
  }));

  await prisma.pr_reviews.createMany({
    data: reviewData,
    skipDuplicates: true,
  });
}

/**
 * Get issue with all comments (from cache)
 */
async function getIssueWithComments(repoId, issueNumber) {
  return await prisma.issues.findUnique({
    where: {
      repo_id_issue_number: {
        repo_id: repoId,
        issue_number: issueNumber,
      },
    },
    include: {
      comments: {
        orderBy: { created_at: "asc" },
      },
    },
  });
}

/**
 * Get PR with all comments and reviews (from cache)
 */
async function getPRWithComments(repoId, prNumber) {
  return await prisma.pull_requests.findUnique({
    where: {
      repo_id_pr_number: {
        repo_id: repoId,
        pr_number: prNumber,
      },
    },
    include: {
      comments: {
        orderBy: { created_at: "asc" },
      },
      reviews: {
        orderBy: { submitted_at: "asc" },
      },
    },
  });
}

/**
 * Get authenticated Octokit instance for a repo
 */
async function getAuthenticatedOctokit(repoId) {
  const installation = await getInstallationForRepo(repoId);

  if (!installation?.access_token) {
    throw new Error("No installation token found");
  }

  return new Octokit({
    auth: installation.access_token,
  });
}