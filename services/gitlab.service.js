import "dotenv/config";

/**
 * GitLab API Service (OAuth-based)
 * Handles all GitLab API interactions using OAuth tokens
 */

const GITLAB_API_BASE = process.env.GITLAB_API_URL || "https://gitlab.com/api/v4";
const GITLAB_OAUTH_BASE = "https://gitlab.com/oauth";

/**
 * Get authenticated GitLab headers
 */
function getGitLabHeaders(accessToken) {
  return {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeGitLabCode(code) {
  const url = `${GITLAB_OAUTH_BASE}/token`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITLAB_CLIENT_ID,
      client_secret: process.env.GITLAB_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: process.env.GITLAB_REDIRECT_URL,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitLab OAuth failed: ${response.status} ${error}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    created_at: data.created_at,
  };
}

/**
 * Refresh expired access token
 */
export async function refreshGitLabToken(refreshToken) {
  const url = `${GITLAB_OAUTH_BASE}/token`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITLAB_CLIENT_ID,
      client_secret: process.env.GITLAB_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitLab token refresh failed: ${response.status} ${error}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    created_at: data.created_at,
  };
}

/**
 * Get current user info
 */
export async function getGitLabUser(accessToken) {
  const url = `${GITLAB_API_BASE}/user`;
  
  const response = await fetch(url, {
    headers: getGitLabHeaders(accessToken),
  });

  if (!response.ok) {
    throw new Error(`Failed to get GitLab user: ${response.status}`);
  }

  return await response.json();
}

/**
 * Post a comment to GitLab issue/MR
 */
export async function postGitLabComment({ projectId, issueIid, message, accessToken }) {
  const url = `${GITLAB_API_BASE}/projects/${encodeURIComponent(projectId)}/issues/${issueIid}/notes`;

  const response = await fetch(url, {
    method: "POST",
    headers: getGitLabHeaders(accessToken),
    body: JSON.stringify({ body: message }),
  });

  if (!response.ok) {
    const text = await response.text();
    
    if (response.status === 404 || response.status === 410) {
      throw new Error(`PERMANENT: Issue not found or deleted (${response.status})`);
    }
    
    if (response.status === 401 || response.status === 403) {
      throw new Error(`PERMANENT: Authentication failed (${response.status})`);
    }

    throw new Error(`GitLab API failed: ${response.status} ${text}`);
  }

  return await response.json();
}

/**
 * Check if user has permission on GitLab project
 */
export async function hasGitLabPermission({ projectId, username, accessToken }) {
  try {
    // Get project members
    const url = `${GITLAB_API_BASE}/projects/${encodeURIComponent(projectId)}/members/all`;
    
    const response = await fetch(url, {
      headers: getGitLabHeaders(accessToken),
    });

    if (!response.ok) return false;

    const members = await response.json();
    const member = members.find((m) => m.username === username);

    // Access levels: 50=Owner, 40=Maintainer, 30=Developer, 20=Reporter, 10=Guest
    return member && member.access_level >= 20;
  } catch (err) {
    console.error("[GitLab] Permission check failed:", err.message);
    return false;
  }
}

/**
 * Get GitLab issue/MR author
 */
export async function getGitLabIssueAuthor({ projectId, issueIid, accessToken }) {
  try {
    const url = `${GITLAB_API_BASE}/projects/${encodeURIComponent(projectId)}/issues/${issueIid}`;
    
    const response = await fetch(url, {
      headers: getGitLabHeaders(accessToken),
    });

    if (!response.ok) return null;

    const issue = await response.json();
    return issue.author?.username;
  } catch (err) {
    console.error("[GitLab] Failed to get issue author:", err.message);
    return null;
  }
}

/**
 * Check if user is project contributor (has commits)
 */
export async function isGitLabContributor({ projectId, username, accessToken }) {
  try {
    const url = `${GITLAB_API_BASE}/projects/${encodeURIComponent(projectId)}/repository/contributors`;
    
    const response = await fetch(url, {
      headers: getGitLabHeaders(accessToken),
    });

    if (!response.ok) return false;

    const contributors = await response.json();
    return contributors.some((c) => c.name === username || c.email?.includes(username));
  } catch (err) {
    console.error("[GitLab] Contributor check failed:", err.message);
    return false;
  }
}

/**
 * Validate GitLab webhook signature
 */
export function validateGitLabWebhook(payload, signature) {
  const expectedToken = process.env.GITLAB_WEBHOOK_TOKEN;
  
  if (!expectedToken) {
    console.warn("[GitLab] GITLAB_WEBHOOK_TOKEN not configured");
    return true; // Allow if not configured (for development)
  }

  return signature === expectedToken;
}

/**
 * Get GitLab OAuth authorization URL
 */
export function getGitLabAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GITLAB_CLIENT_ID,
    redirect_uri: process.env.GITLAB_REDIRECT_URL,
    response_type: "code",
    state: state || "",
    scope: "api read_user read_repository write_repository",
  });

  return `${GITLAB_OAUTH_BASE}/authorize?${params.toString()}`;
}