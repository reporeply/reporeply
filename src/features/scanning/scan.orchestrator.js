/**
 * Scan Orchestrator
 * Production-grade scanning with GitHub API integration
 * 
 * @file scan.orchestrator.js
 * @location src/features/scanning/scan.orchestrator.js
 * 
 * Integrates with GitHub API scanner and manages the full scan lifecycle
 */

import { Octokit } from "@octokit/rest";
import { prisma } from "../../core/database/prisma.client.js";
import {
  fetchRepoMetadata,
  fetchOpenIssues,
  fetchOpenPullRequests,
  fetchContributors,
  checkRateLimit,
} from "./scanners/github.scanner.js";
import { getInstallationForRepo } from "../installations/installation.service.js";

/**
 * Execute full repository scan with GitHub API
 */
export async function executeFullScanWithAPI(jobId) {
  console.log(`\n[Scan Orchestrator] 🚀 Starting full scan: ${jobId}`);

  let octokit;

  try {
    // Get job details
    const job = await prisma.scan_jobs.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Parse repo owner and name
    const [owner, repo] = job.repo_id.split("/");

    // Get installation and create authenticated Octokit
    const installation = await getInstallationForRepo(job.repo_id);
    if (!installation) {
      throw new Error(`No installation found for ${job.repo_id}`);
    }

    // Create Octokit with installation token
    // In production, you'd fetch a fresh installation token
    octokit = new Octokit({
      auth: installation.access_token || process.env.GITHUB_TOKEN,
    });

    // Update job status
    await updateJobStatus(jobId, "running", { started_at: new Date() });

    // Check rate limit before starting
    const rateLimit = await checkRateLimit(octokit);
    if (rateLimit.shouldWait) {
      console.warn(
        `[Scan Orchestrator] ⚠️  Rate limit low, waiting until ${rateLimit.resetTime}`
      );
      // In production, reschedule job
    }

    // Phase 1: Repo metadata
    console.log(`[Scan Orchestrator] 📊 Phase 1: Metadata`);
    const metadata = await fetchRepoMetadata(octokit, owner, repo);
    await saveRepoMetadata(job.repo_id, metadata);
    await updateJobProgress(jobId, 20);

    // Phase 2: Issues
    console.log(`[Scan Orchestrator] 🎫 Phase 2: Issues`);
    const issues = await fetchOpenIssues(octokit, owner, repo, job.repo_id);
    await saveIssues(issues);
    await updateJobStatus(jobId, "running", {
      total_items: issues.length,
      processed_items: issues.length,
    });
    await updateJobProgress(jobId, 50);

    // Phase 3: Pull Requests
    console.log(`[Scan Orchestrator] 🔀 Phase 3: Pull Requests`);
    const prs = await fetchOpenPullRequests(octokit, owner, repo, job.repo_id);
    await savePullRequests(prs);
    await updateJobProgress(jobId, 70);

    // Phase 4: Contributors
    console.log(`[Scan Orchestrator] 👥 Phase 4: Contributors`);
    const contributors = await fetchContributors(octokit, owner, repo, job.repo_id);
    await saveContributors(contributors);
    await updateJobProgress(jobId, 90);

    // Phase 5: Compute insights
    console.log(`[Scan Orchestrator] 🧮 Phase 5: Insights`);
    await computeAndSaveInsights(job.repo_id);
    await updateJobProgress(jobId, 100);

    // Mark repo as indexed
    await prisma.repositories.update({
      where: { id: job.repo_id },
      data: {
        indexed: true,
        indexed_at: new Date(),
      },
    });

    // Mark job complete
    await updateJobStatus(jobId, "completed", {
      completed_at: new Date(),
    });

    console.log(`[Scan Orchestrator] ✅ Completed: ${job.repo_id}`);

    return { success: true, jobId };
  } catch (error) {
    console.error(`[Scan Orchestrator] ❌ Failed: ${jobId}`, error);

    await updateJobStatus(jobId, "failed", {
      error_message: error.message,
      completed_at: new Date(),
    });

    throw error;
  }
}

/**
 * Save repository metadata
 */
async function saveRepoMetadata(repoId, metadata) {
  await prisma.repo_metadata.upsert({
    where: { repo_id: repoId },
    create: { repo_id: repoId, ...metadata },
    update: metadata,
  });
}

/**
 * Save issues in batches
 */
async function saveIssues(issues) {
  if (issues.length === 0) return;

  // Batch insert in chunks of 100
  const chunkSize = 100;
  for (let i = 0; i < issues.length; i += chunkSize) {
    const chunk = issues.slice(i, i + chunkSize);

    await prisma.issues.createMany({
      data: chunk,
      skipDuplicates: true,
    });
  }

  console.log(`[Scan Orchestrator] 💾 Saved ${issues.length} issues`);
}

/**
 * Save pull requests in batches
 */
async function savePullRequests(prs) {
  if (prs.length === 0) return;

  const chunkSize = 100;
  for (let i = 0; i < prs.length; i += chunkSize) {
    const chunk = prs.slice(i, i + chunkSize);

    await prisma.pull_requests.createMany({
      data: chunk,
      skipDuplicates: true,
    });
  }

  console.log(`[Scan Orchestrator] 💾 Saved ${prs.length} PRs`);
}

/**
 * Save contributors
 */
async function saveContributors(contributors) {
  if (contributors.length === 0) return;

  await prisma.contributors.createMany({
    data: contributors,
    skipDuplicates: true,
  });

  console.log(`[Scan Orchestrator] 💾 Saved ${contributors.length} contributors`);
}

/**
 * Compute and save insights
 */
async function computeAndSaveInsights(repoId) {
  // Count open issues
  const openIssues = await prisma.issues.count({
    where: { repo_id: repoId, state: "open" },
  });

  // Count open PRs
  const openPRs = await prisma.pull_requests.count({
    where: { repo_id: repoId, state: "open" },
  });

  // Count stale issues (>30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const staleIssues = await prisma.issues.count({
    where: {
      repo_id: repoId,
      state: "open",
      updated_at: { lt: thirtyDaysAgo },
    },
  });

  // Get avg issue close time (for closed issues)
  const closedIssues = await prisma.issues.findMany({
    where: {
      repo_id: repoId,
      state: "closed",
      closed_at: { not: null },
    },
    select: {
      created_at: true,
      closed_at: true,
    },
    take: 100, // Sample last 100
  });

  let avgIssueCloseDays = null;
  if (closedIssues.length > 0) {
    const totalDays = closedIssues.reduce((sum, issue) => {
      const days =
        (issue.closed_at.getTime() - issue.created_at.getTime()) /
        (1000 * 60 * 60 * 24);
      return sum + days;
    }, 0);
    avgIssueCloseDays = totalDays / closedIssues.length;
  }

  // Count contributors
  const totalContributors = await prisma.contributors.count({
    where: { repo_id: repoId },
  });

  const activeContributors = await prisma.contributors.count({
    where: {
      repo_id: repoId,
      last_active_at: { gte: thirtyDaysAgo },
    },
  });

  // Get latest activity
  const latestIssue = await prisma.issues.findFirst({
    where: { repo_id: repoId },
    orderBy: { created_at: "desc" },
    select: { created_at: true },
  });

  const latestPR = await prisma.pull_requests.findFirst({
    where: { repo_id: repoId },
    orderBy: { created_at: "desc" },
    select: { created_at: true },
  });

  // Save insights
  await prisma.repo_insights.upsert({
    where: { repo_id: repoId },
    create: {
      repo_id: repoId,
      open_issues_count: openIssues,
      open_pr_count: openPRs,
      stale_issues_count: staleIssues,
      avg_issue_close_days: avgIssueCloseDays,
      total_contributors: totalContributors,
      active_contributors: activeContributors,
      last_issue_at: latestIssue?.created_at,
      last_pr_at: latestPR?.created_at,
    },
    update: {
      open_issues_count: openIssues,
      open_pr_count: openPRs,
      stale_issues_count: staleIssues,
      avg_issue_close_days: avgIssueCloseDays,
      total_contributors: totalContributors,
      active_contributors: activeContributors,
      last_issue_at: latestIssue?.created_at,
      last_pr_at: latestPR?.created_at,
    },
  });

  console.log(`[Scan Orchestrator] 💾 Saved insights`);
}

/**
 * Update job status
 */
async function updateJobStatus(jobId, status, additionalData = {}) {
  await prisma.scan_jobs.update({
    where: { id: jobId },
    data: {
      status,
      ...additionalData,
    },
  });
}

/**
 * Update job progress
 */
async function updateJobProgress(jobId, progress) {
  await prisma.scan_jobs.update({
    where: { id: jobId },
    data: { progress },
  });
}