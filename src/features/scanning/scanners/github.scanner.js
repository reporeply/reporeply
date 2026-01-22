/**
 * GitHub Scanner
 * Fetches repository data from GitHub API
 * 
 * @file github.scanner.js
 * @location src/features/scanning/scanners/github.scanner.js
 * 
 * IMPORTANT: Only fetches metadata, NOT full content
 * Implements pagination and rate limit handling
 */

import { Octokit } from "@octokit/rest";

/**
 * Fetch repository metadata
 */
export async function fetchRepoMetadata(octokit, owner, repo) {
  try {
    const { data } = await octokit.repos.get({ owner, repo });

    return {
      default_branch: data.default_branch,
      visibility: data.visibility,
      language: data.language,
      size_kb: data.size,
      stars_count: data.stargazers_count,
      forks_count: data.forks_count,
      has_issues: data.has_issues,
      has_wiki: data.has_wiki,
      created_at: new Date(data.created_at),
      pushed_at: new Date(data.pushed_at),
    };
  } catch (error) {
    console.error("[GitHub Scanner] Failed to fetch repo metadata:", error);
    throw error;
  }
}

/**
 * Fetch open issues (metadata only, paginated)
 * Returns array of issue metadata objects
 */
export async function fetchOpenIssues(octokit, owner, repo, repoId) {
  const issues = [];
  let page = 1;
  const perPage = 100;

  try {
    while (true) {
      const { data } = await octokit.issues.listForRepo({
        owner,
        repo,
        state: "open",
        per_page: perPage,
        page,
      });

      if (data.length === 0) break;

      // Transform to our lightweight format
      for (const issue of data) {
        // Skip pull requests (they have pull_request field)
        if (issue.pull_request) continue;

        issues.push({
          id: `${repoId}#${issue.number}`,
          repo_id: repoId,
          issue_number: issue.number,
          state: issue.state,
          is_pull_request: false,
          author_id: issue.user.id.toString(),
          assignees: issue.assignees.map((a) => a.id.toString()),
          labels: issue.labels.map((l) => l.name),
          comments_count: issue.comments,
          body_length: issue.body?.length || 0, // Store length, not content
          created_at: new Date(issue.created_at),
          updated_at: new Date(issue.updated_at),
          closed_at: issue.closed_at ? new Date(issue.closed_at) : null,
        });
      }

      // Check if there are more pages
      if (data.length < perPage) break;

      page++;

      // Respect rate limits (simple delay)
      await sleep(100);
    }

    console.log(`[GitHub Scanner] ✅ Fetched ${issues.length} open issues`);
    return issues;
  } catch (error) {
    console.error("[GitHub Scanner] Failed to fetch issues:", error);
    throw error;
  }
}

/**
 * Fetch open pull requests (metadata only, paginated)
 */
export async function fetchOpenPullRequests(octokit, owner, repo, repoId) {
  const prs = [];
  let page = 1;
  const perPage = 100;

  try {
    while (true) {
      const { data } = await octokit.pulls.list({
        owner,
        repo,
        state: "open",
        per_page: perPage,
        page,
      });

      if (data.length === 0) break;

      for (const pr of data) {
        prs.push({
          id: `${repoId}#pr${pr.number}`,
          repo_id: repoId,
          pr_number: pr.number,
          state: pr.state,
          author_id: pr.user.id.toString(),
          reviewers: [], // Would need separate API call for detailed reviewers
          labels: pr.labels.map((l) => l.name),
          commits_count: pr.commits || 0,
          files_changed: pr.changed_files || 0,
          additions: pr.additions || 0,
          deletions: pr.deletions || 0,
          created_at: new Date(pr.created_at),
          updated_at: new Date(pr.updated_at),
          merged_at: pr.merged_at ? new Date(pr.merged_at) : null,
          closed_at: pr.closed_at ? new Date(pr.closed_at) : null,
        });
      }

      if (data.length < perPage) break;

      page++;
      await sleep(100);
    }

    console.log(`[GitHub Scanner] ✅ Fetched ${prs.length} open PRs`);
    return prs;
  } catch (error) {
    console.error("[GitHub Scanner] Failed to fetch PRs:", error);
    throw error;
  }
}

/**
 * Fetch repository contributors (aggregated stats)
 */
export async function fetchContributors(octokit, owner, repo, repoId) {
  const contributors = [];

  try {
    // Get contributors with stats
    const { data } = await octokit.repos.listContributors({
      owner,
      repo,
      per_page: 100,
    });

    for (const contributor of data) {
      contributors.push({
        repo_id: repoId,
        user_id: contributor.id.toString(),
        username: contributor.login,
        commits_count: contributor.contributions,
        prs_opened: 0, // Would need additional queries
        issues_opened: 0, // Would need additional queries
        reviews_done: 0, // Would need additional queries
        last_active_at: new Date(), // Would determine from recent activity
      });
    }

    console.log(`[GitHub Scanner] ✅ Fetched ${contributors.length} contributors`);
    return contributors;
  } catch (error) {
    console.error("[GitHub Scanner] Failed to fetch contributors:", error);
    throw error;
  }
}

/**
 * Fetch all organization repositories
 * Used when app is installed org-wide
 */
export async function fetchOrgRepositories(octokit, org) {
  const repos = [];
  let page = 1;
  const perPage = 100;

  try {
    while (true) {
      const { data } = await octokit.repos.listForOrg({
        org,
        per_page: perPage,
        page,
      });

      if (data.length === 0) break;

      repos.push(...data);

      if (data.length < perPage) break;

      page++;
      await sleep(100);
    }

    console.log(`[GitHub Scanner] ✅ Fetched ${repos.length} org repositories`);
    return repos;
  } catch (error) {
    console.error("[GitHub Scanner] Failed to fetch org repos:", error);
    throw error;
  }
}

/**
 * Check GitHub API rate limit
 */
export async function checkRateLimit(octokit) {
  try {
    const { data } = await octokit.rateLimit.get();

    const remaining = data.resources.core.remaining;
    const resetTime = new Date(data.resources.core.reset * 1000);

    console.log(`[GitHub Scanner] Rate limit: ${remaining} remaining, resets at ${resetTime}`);

    return {
      remaining,
      resetTime,
      shouldWait: remaining < 100,
    };
  } catch (error) {
    console.error("[GitHub Scanner] Failed to check rate limit:", error);
    return { remaining: 0, shouldWait: true };
  }
}

/**
 * Sleep helper for rate limiting
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}