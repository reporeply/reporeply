/**
 * Provider Detection Utilities
 * Determines which Git provider (GitHub, GitLab, Bitbucket) based on repo URL
 */

/**
 * Detect provider from repository URL or ID
 */
export function getProviderFromRepo(repoIdentifier) {
  if (!repoIdentifier) return "github"; // Default fallback

  const lower = repoIdentifier.toLowerCase();

  if (lower.includes("gitlab.com") || lower.includes("gitlab")) {
    return "gitlab";
  }

  if (lower.includes("bitbucket.org") || lower.includes("bitbucket")) {
    return "bitbucket";
  }

  // Default to GitHub
  return "github";
}

/**
 * Normalize repo ID to standard format
 * GitHub: "owner/repo"
 * GitLab: "namespace/project"
 * Bitbucket: "workspace/repo"
 */
export function normalizeRepoId(repoIdentifier, provider) {
  if (!repoIdentifier) return null;

  // Remove protocol and domain if present
  let normalized = repoIdentifier
    .replace(/^https?:\/\//, "")
    .replace(/^(github\.com|gitlab\.com|bitbucket\.org)\//, "")
    .replace(/\.git$/, "");

  return normalized;
}

/**
 * Get API base URL for provider
 */
export function getProviderApiUrl(provider) {
  switch (provider) {
    case "github":
      return "https://api.github.com";
    case "gitlab":
      return process.env.GITLAB_API_URL || "https://gitlab.com/api/v4";
    case "bitbucket":
      return "https://api.bitbucket.org/2.0";
    default:
      return "https://api.github.com";
  }
}

/**
 * Get web URL for repo
 */
export function getRepoWebUrl(repoId, provider) {
  switch (provider) {
    case "github":
      return `https://github.com/${repoId}`;
    case "gitlab":
      return `https://gitlab.com/${repoId}`;
    case "bitbucket":
      return `https://bitbucket.org/${repoId}`;
    default:
      return `https://github.com/${repoId}`;
  }
}

/**
 * Get issue/MR URL
 */
export function getIssueUrl(repoId, issueNumber, provider) {
  const baseUrl = getRepoWebUrl(repoId, provider);
  
  switch (provider) {
    case "github":
      return `${baseUrl}/issues/${issueNumber}`;
    case "gitlab":
      return `${baseUrl}/-/issues/${issueNumber}`;
    case "bitbucket":
      return `${baseUrl}/issues/${issueNumber}`;
    default:
      return `${baseUrl}/issues/${issueNumber}`;
  }
}