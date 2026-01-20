import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import { Octokit } from "@octokit/rest";

/* ================================================================
 * JWT & AUTHENTICATION
 * ================================================================ */

export function createAppJWT() {
  // ✅ Read private key from file or env var
  let privateKey;

  if (process.env.GITHUB_PRIVATE_KEY_PATH) {
    // Resolve relative path from project root
    const keyPath = path.resolve(
      process.cwd(),
      process.env.GITHUB_PRIVATE_KEY_PATH
    );
    console.log(`[GitHub Service] Reading private key from: ${keyPath}`);
    privateKey = fs.readFileSync(keyPath, "utf8");
    console.log("[GitHub Service] ✅ Private key loaded from file");
  } else if (process.env.GITHUB_PRIVATE_KEY) {
    privateKey = process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, "\n");
    console.log("[GitHub Service] ✅ Private key loaded from env var");
  } else {
    throw new Error(
      "No GITHUB_PRIVATE_KEY or GITHUB_PRIVATE_KEY_PATH found in environment"
    );
  }

  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      iat: now - 30,
      exp: now + 540,
      iss: Number(process.env.GITHUB_APP_ID),
    },
    privateKey,
    { algorithm: "RS256" }
  );
}

export async function getInstallationOctokit(installationId) {
  const appJWT = createAppJWT();
  const appOctokit = new Octokit({ auth: appJWT });

  const { data } = await appOctokit.request(
    "POST /app/installations/{installation_id}/access_tokens",
    { installation_id: installationId }
  );

  return new Octokit({ auth: data.token });
}

/* ================================================================
 * ISSUE OPERATIONS
 * ================================================================ */

/**
 * Get issue details
 * @param {number} installationId - GitHub installation ID
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} issueNumber - Issue number
 * @returns {Promise<Object>} - Issue data
 */
export async function getIssue(installationId, owner, repo, issueNumber) {
  const octokit = await getInstallationOctokit(installationId);
  
  const { data } = await octokit.rest.issues.get({
    owner,
    repo,
    issue_number: issueNumber,
  });

  return data;
}

/**
 * Get issue comments
 * @param {number} installationId - GitHub installation ID
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} issueNumber - Issue number
 * @returns {Promise<Array>} - Array of comments
 */
export async function getIssueComments(installationId, owner, repo, issueNumber) {
  const octokit = await getInstallationOctokit(installationId);
  
  const { data } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: issueNumber,
  });

  return data;
}

/**
 * Create issue comment
 * @param {number} installationId - GitHub installation ID
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} issueNumber - Issue number
 * @param {string} body - Comment body
 * @returns {Promise<Object>} - Comment data
 */
export async function createIssueComment(installationId, owner, repo, issueNumber, body) {
  const octokit = await getInstallationOctokit(installationId);
  
  const { data } = await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });

  return data;
}

/* ================================================================
 * LABEL OPERATIONS
 * ================================================================ */

/**
 * Add label to issue
 * @param {number} installationId - GitHub installation ID
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} issueNumber - Issue number
 * @param {string} labelName - Label name to add
 * @returns {Promise<Array>} - Updated labels
 */
export async function addLabel(installationId, owner, repo, issueNumber, labelName) {
  const octokit = await getInstallationOctokit(installationId);
  
  const { data } = await octokit.rest.issues.addLabels({
    owner,
    repo,
    issue_number: issueNumber,
    labels: [labelName],
  });

  return data;
}

/**
 * Remove label from issue
 * @param {number} installationId - GitHub installation ID
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} issueNumber - Issue number
 * @param {string} labelName - Label name to remove
 * @returns {Promise<void>}
 */
export async function removeLabel(installationId, owner, repo, issueNumber, labelName) {
  const octokit = await getInstallationOctokit(installationId);
  
  await octokit.rest.issues.removeLabel({
    owner,
    repo,
    issue_number: issueNumber,
    name: labelName,
  });
}

/**
 * Get repository labels
 * @param {number} installationId - GitHub installation ID
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<Array>} - Array of labels
 */
export async function getRepositoryLabels(installationId, owner, repo) {
  const octokit = await getInstallationOctokit(installationId);
  
  const { data } = await octokit.rest.issues.listLabelsForRepo({
    owner,
    repo,
    per_page: 100,
  });

  return data;
}

/**
 * Create label
 * @param {number} installationId - GitHub installation ID
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} labelData - Label data (name, color, description)
 * @returns {Promise<Object>} - Created label
 */
export async function createLabel(installationId, owner, repo, labelData) {
  const octokit = await getInstallationOctokit(installationId);
  
  const { data } = await octokit.rest.issues.createLabel({
    owner,
    repo,
    name: labelData.name,
    color: labelData.color,
    description: labelData.description || '',
  });

  return data;
}

/**
 * Update label
 * @param {number} installationId - GitHub installation ID
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} currentName - Current label name
 * @param {Object} labelData - Updated label data (color, description, new_name)
 * @returns {Promise<Object>} - Updated label
 */
export async function updateLabel(installationId, owner, repo, currentName, labelData) {
  const octokit = await getInstallationOctokit(installationId);
  
  const { data } = await octokit.rest.issues.updateLabel({
    owner,
    repo,
    name: currentName,
    color: labelData.color,
    description: labelData.description || '',
    new_name: labelData.new_name || undefined,
  });

  return data;
}

/* ================================================================
 * DEFAULT EXPORT (for backward compatibility)
 * ================================================================ */

export default {
  createAppJWT,
  getInstallationOctokit,
  getIssue,
  getIssueComments,
  createIssueComment,
  addLabel,
  removeLabel,
  getRepositoryLabels,
  createLabel,
  updateLabel,
};