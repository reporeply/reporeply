/**
 * GitHub Helper Utilities
 * GitHub-specific helper functions for URL generation and data normalization
 */

/**
 * Normalize GitHub repo ID to standard format "owner/repo"
 * @param {string} repoIdentifier - Repository identifier (URL or owner/repo format)
 * @returns {string|null} Normalized repo ID
 */
export function normalizeGitHubRepoId(repoIdentifier) {
  if (!repoIdentifier) return null;

  // Remove protocol, domain, and .git suffix if present
  let normalized = repoIdentifier
    .replace(/^https?:\/\//, "")
    .replace(/^github\.com\//, "")
    .replace(/\.git$/, "")
    .trim();

  // Validate format (should be owner/repo)
  const parts = normalized.split('/');
  if (parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }

  return normalized;
}

/**
 * Get GitHub API base URL
 * @returns {string} GitHub API base URL
 */
export function getGitHubApiUrl() {
  return process.env.GITHUB_API_URL || "https://api.github.com";
}

/**
 * Get GitHub web URL for repository
 * @param {string} repoId - Repository ID in "owner/repo" format
 * @returns {string} Full GitHub repository URL
 */
export function getGitHubRepoUrl(repoId) {
  return `https://github.com/${repoId}`;
}

/**
 * Get GitHub issue URL
 * @param {string} repoId - Repository ID in "owner/repo" format
 * @param {number|string} issueNumber - Issue number
 * @returns {string} Full GitHub issue URL
 */
export function getGitHubIssueUrl(repoId, issueNumber) {
  return `https://github.com/${repoId}/issues/${issueNumber}`;
}

/**
 * Get GitHub pull request URL
 * @param {string} repoId - Repository ID in "owner/repo" format
 * @param {number|string} prNumber - Pull request number
 * @returns {string} Full GitHub pull request URL
 */
export function getGitHubPullRequestUrl(repoId, prNumber) {
  return `https://github.com/${repoId}/pull/${prNumber}`;
}

/**
 * Get GitHub commit URL
 * @param {string} repoId - Repository ID in "owner/repo" format
 * @param {string} commitSha - Commit SHA
 * @returns {string} Full GitHub commit URL
 */
export function getGitHubCommitUrl(repoId, commitSha) {
  return `https://github.com/${repoId}/commit/${commitSha}`;
}

/**
 * Get GitHub branch URL
 * @param {string} repoId - Repository ID in "owner/repo" format
 * @param {string} branch - Branch name
 * @returns {string} Full GitHub branch URL
 */
export function getGitHubBranchUrl(repoId, branch) {
  return `https://github.com/${repoId}/tree/${branch}`;
}

/**
 * Get GitHub file URL
 * @param {string} repoId - Repository ID in "owner/repo" format
 * @param {string} branch - Branch name
 * @param {string} filePath - File path
 * @returns {string} Full GitHub file URL
 */
export function getGitHubFileUrl(repoId, branch, filePath) {
  return `https://github.com/${repoId}/blob/${branch}/${filePath}`;
}

/**
 * Parse GitHub repository URL to extract owner and repo
 * @param {string} url - GitHub repository URL
 * @returns {{owner: string, repo: string}|null} Parsed owner and repo
 */
export function parseGitHubRepoUrl(url) {
  if (!url) return null;

  const normalized = normalizeGitHubRepoId(url);
  if (!normalized) return null;

  const parts = normalized.split('/');
  if (parts.length >= 2) {
    return {
      owner: parts[0],
      repo: parts[1]
    };
  }

  return null;
}

/**
 * Validate GitHub repository ID format
 * @param {string} repoId - Repository ID
 * @returns {boolean} True if valid format
 */
export function isValidGitHubRepoId(repoId) {
  if (!repoId || typeof repoId !== 'string') return false;
  
  const parts = repoId.split('/');
  return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
}

/**
 * Get GitHub API headers with authentication
 * @param {string} token - GitHub personal access token
 * @returns {Object} Headers object for API requests
 */
export function getGitHubApiHeaders(token) {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}