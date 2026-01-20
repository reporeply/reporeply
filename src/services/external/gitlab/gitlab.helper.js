/**
 * GitLab Helper Utilities
 * GitLab-specific helper functions for URL generation and data normalization
 */

/**
 * Normalize GitLab repo ID to standard format "namespace/project"
 * @param {string} repoIdentifier - Repository identifier (URL or namespace/project format)
 * @returns {string|null} Normalized repo ID
 */
export function normalizeGitLabRepoId(repoIdentifier) {
  if (!repoIdentifier) return null;

  // Remove protocol, domain, and .git suffix if present
  let normalized = repoIdentifier
    .replace(/^https?:\/\//, "")
    .replace(/^gitlab\.com\//, "")
    .replace(/\.git$/, "")
    .trim();

  // GitLab supports nested groups, so we keep the full path
  return normalized;
}

/**
 * Get GitLab API base URL
 * @returns {string} GitLab API base URL
 */
export function getGitLabApiUrl() {
  return process.env.GITLAB_API_URL || "https://gitlab.com/api/v4";
}

/**
 * Get GitLab web URL for repository
 * @param {string} repoId - Repository ID in "namespace/project" format
 * @returns {string} Full GitLab repository URL
 */
export function getGitLabRepoUrl(repoId) {
  return `https://gitlab.com/${repoId}`;
}

/**
 * Get GitLab issue URL
 * @param {string} repoId - Repository ID in "namespace/project" format
 * @param {number|string} issueNumber - Issue number (iid)
 * @returns {string} Full GitLab issue URL
 */
export function getGitLabIssueUrl(repoId, issueNumber) {
  return `https://gitlab.com/${repoId}/-/issues/${issueNumber}`;
}

/**
 * Get GitLab merge request URL
 * @param {string} repoId - Repository ID in "namespace/project" format
 * @param {number|string} mrNumber - Merge request number (iid)
 * @returns {string} Full GitLab merge request URL
 */
export function getGitLabMergeRequestUrl(repoId, mrNumber) {
  return `https://gitlab.com/${repoId}/-/merge_requests/${mrNumber}`;
}

/**
 * Get GitLab commit URL
 * @param {string} repoId - Repository ID in "namespace/project" format
 * @param {string} commitSha - Commit SHA
 * @returns {string} Full GitLab commit URL
 */
export function getGitLabCommitUrl(repoId, commitSha) {
  return `https://gitlab.com/${repoId}/-/commit/${commitSha}`;
}

/**
 * Get GitLab branch URL
 * @param {string} repoId - Repository ID in "namespace/project" format
 * @param {string} branch - Branch name
 * @returns {string} Full GitLab branch URL
 */
export function getGitLabBranchUrl(repoId, branch) {
  return `https://gitlab.com/${repoId}/-/tree/${encodeURIComponent(branch)}`;
}

/**
 * Get GitLab file URL
 * @param {string} repoId - Repository ID in "namespace/project" format
 * @param {string} branch - Branch name
 * @param {string} filePath - File path
 * @returns {string} Full GitLab file URL
 */
export function getGitLabFileUrl(repoId, branch, filePath) {
  return `https://gitlab.com/${repoId}/-/blob/${encodeURIComponent(branch)}/${filePath}`;
}

/**
 * Parse GitLab repository URL to extract namespace and project
 * @param {string} url - GitLab repository URL
 * @returns {{namespace: string, project: string, fullPath: string}|null} Parsed components
 */
export function parseGitLabRepoUrl(url) {
  if (!url) return null;

  const normalized = normalizeGitLabRepoId(url);
  if (!normalized) return null;

  const parts = normalized.split('/');
  if (parts.length >= 2) {
    // GitLab supports nested namespaces (e.g., group/subgroup/project)
    const project = parts[parts.length - 1];
    const namespace = parts.slice(0, -1).join('/');
    
    return {
      namespace,
      project,
      fullPath: normalized
    };
  }

  return null;
}

/**
 * Validate GitLab repository ID format
 * @param {string} repoId - Repository ID
 * @returns {boolean} True if valid format
 */
export function isValidGitLabRepoId(repoId) {
  if (!repoId || typeof repoId !== 'string') return false;
  
  const parts = repoId.split('/');
  return parts.length >= 2 && parts.every(part => part.length > 0);
}

/**
 * Encode GitLab project ID for API calls
 * GitLab API requires URL-encoded project paths
 * @param {string} repoId - Repository ID in "namespace/project" format
 * @returns {string} URL-encoded project ID
 */
export function encodeGitLabProjectId(repoId) {
  return encodeURIComponent(repoId);
}

/**
 * Get GitLab API headers with authentication
 * @param {string} token - GitLab personal access token
 * @returns {Object} Headers object for API requests
 */
export function getGitLabApiHeaders(token) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers['PRIVATE-TOKEN'] = token;
  }

  return headers;
}

/**
 * Convert GitLab project path to numeric project ID
 * Note: This requires an API call to get the numeric ID
 * @param {string} projectPath - Project path (namespace/project)
 * @returns {string} Encoded project path (use this for most API calls)
 */
export function getGitLabProjectIdentifier(projectPath) {
  // For most GitLab API endpoints, we can use the URL-encoded path
  // instead of the numeric ID
  return encodeGitLabProjectId(projectPath);
}

/**
 * Parse GitLab webhook payload to extract relevant information
 * @param {Object} payload - GitLab webhook payload
 * @returns {Object} Extracted information
 */
export function parseGitLabWebhook(payload) {
  if (!payload) return null;

  return {
    objectKind: payload.object_kind,
    eventType: payload.event_type,
    projectId: payload.project?.id,
    projectPath: payload.project?.path_with_namespace,
    user: payload.user?.username,
    ref: payload.ref,
    before: payload.before,
    after: payload.after
  };
}