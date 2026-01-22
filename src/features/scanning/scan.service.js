/**
 * Scanning Service
 * Core logic for repository scanning and data collection
 * 
 * @file scan.service.js
 * @location src/features/scanning/scan.service.js
 * 
 * DESIGN PRINCIPLES:
 * - Store metadata, NOT raw content
 * - Keep repo data under 20MB
 * - Async & resumable
 * - Respect rate limits
 */

import { prisma } from "../../core/database/prisma.client.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Queue a full repository scan
 */
export async function queueFullScan({ repoId, installationId, priority = "normal" }) {
  try {
    const jobId = uuidv4();

    const job = await prisma.scan_jobs.create({
      data: {
        id: jobId,
        repo_id: repoId,
        job_type: "full_scan",
        status: "pending",
        progress: 0,
      },
    });

    console.log(`[Scan] 📋 Queued full scan: ${repoId} (Job: ${jobId})`);

    // Add to background job queue (Redis/BullMQ in production)
    // For now, we'll process immediately in development
    // await jobQueue.add('full_scan', { jobId, repoId, installationId });

    return job;
  } catch (error) {
    console.error("[Scan] Failed to queue scan:", error);
    throw error;
  }
}

/**
 * Execute a full repository scan
 * This is the main scanning orchestrator
 */
export async function executeFullScan(jobId) {
  console.log(`\n[Scan] 🚀 Starting full scan: ${jobId}`);

  try {
    // Get job details
    const job = await prisma.scan_jobs.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Update job status
    await updateJobStatus(jobId, "running", { started_at: new Date() });

    // Execute scan phases
    await scanRepoMetadata(job.repo_id, jobId);
    await scanIssues(job.repo_id, jobId);
    await scanPullRequests(job.repo_id, jobId);
    await scanContributors(job.repo_id, jobId);
    await computeInsights(job.repo_id, jobId);

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
      progress: 100,
    });

    console.log(`[Scan] ✅ Completed full scan: ${job.repo_id}`);

    return { success: true, jobId };
  } catch (error) {
    console.error(`[Scan] ❌ Scan failed: ${jobId}`, error);

    await updateJobStatus(jobId, "failed", {
      error_message: error.message,
      completed_at: new Date(),
    });

    throw error;
  }
}

/**
 * Phase 1: Scan repository metadata
 */
async function scanRepoMetadata(repoId, jobId) {
  console.log(`[Scan] 📊 Scanning metadata for ${repoId}`);

  try {
    // This would fetch from GitHub API
    // For now, placeholder implementation
    const metadata = {
      default_branch: "main",
      visibility: "public",
      language: "JavaScript",
      size_kb: 1024,
      stars_count: 0,
      forks_count: 0,
      has_issues: true,
      has_wiki: false,
      created_at: new Date(),
      pushed_at: new Date(),
    };

    await prisma.repo_metadata.upsert({
      where: { repo_id: repoId },
      create: { repo_id: repoId, ...metadata },
      update: metadata,
    });

    await updateJobProgress(jobId, 20);
  } catch (error) {
    console.error("[Scan] Failed to scan metadata:", error);
    throw error;
  }
}

/**
 * Phase 2: Scan open issues (metadata only)
 */
async function scanIssues(repoId, jobId) {
  console.log(`[Scan] 🎫 Scanning issues for ${repoId}`);

  try {
    // This would fetch from GitHub API with pagination
    // Store only metadata, NOT full bodies
    
    // Placeholder: Would normally paginate through all OPEN issues
    const issues = []; // Fetched from GitHub

    // Batch insert (production: batch in chunks of 100)
    if (issues.length > 0) {
      await prisma.issues.createMany({
        data: issues,
        skipDuplicates: true,
      });
    }

    await updateJobProgress(jobId, 50);
  } catch (error) {
    console.error("[Scan] Failed to scan issues:", error);
    throw error;
  }
}

/**
 * Phase 3: Scan open pull requests (metadata only)
 */
async function scanPullRequests(repoId, jobId) {
  console.log(`[Scan] 🔀 Scanning PRs for ${repoId}`);

  try {
    // Similar to issues - fetch metadata only
    // No diffs, no review comments

    const prs = []; // Fetched from GitHub

    if (prs.length > 0) {
      await prisma.pull_requests.createMany({
        data: prs,
        skipDuplicates: true,
      });
    }

    await updateJobProgress(jobId, 70);
  } catch (error) {
    console.error("[Scan] Failed to scan PRs:", error);
    throw error;
  }
}

/**
 * Phase 4: Scan contributors (aggregated stats)
 */
async function scanContributors(repoId, jobId) {
  console.log(`[Scan] 👥 Scanning contributors for ${repoId}`);

  try {
    // Fetch contributor stats from GitHub
    // Aggregate: commits, PRs, issues

    const contributors = []; // Fetched and aggregated

    if (contributors.length > 0) {
      await prisma.contributors.createMany({
        data: contributors,
        skipDuplicates: true,
      });
    }

    await updateJobProgress(jobId, 90);
  } catch (error) {
    console.error("[Scan] Failed to scan contributors:", error);
    throw error;
  }
}

/**
 * Phase 5: Compute derived insights
 */
async function computeInsights(repoId, jobId) {
  console.log(`[Scan] 🧮 Computing insights for ${repoId}`);

  try {
    // Aggregate data from issues, PRs, contributors
    const openIssues = await prisma.issues.count({
      where: { repo_id: repoId, state: "open" },
    });

    const openPRs = await prisma.pull_requests.count({
      where: { repo_id: repoId, state: "open" },
    });

    const totalContributors = await prisma.contributors.count({
      where: { repo_id: repoId },
    });

    // Compute stale issues (>30 days no update)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const staleIssues = await prisma.issues.count({
      where: {
        repo_id: repoId,
        state: "open",
        updated_at: { lt: thirtyDaysAgo },
      },
    });

    // Get latest activity timestamps
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
        total_contributors: totalContributors,
        last_issue_at: latestIssue?.created_at,
        last_pr_at: latestPR?.created_at,
      },
      update: {
        open_issues_count: openIssues,
        open_pr_count: openPRs,
        stale_issues_count: staleIssues,
        total_contributors: totalContributors,
        last_issue_at: latestIssue?.created_at,
        last_pr_at: latestPR?.created_at,
      },
    });

    await updateJobProgress(jobId, 100);
  } catch (error) {
    console.error("[Scan] Failed to compute insights:", error);
    throw error;
  }
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