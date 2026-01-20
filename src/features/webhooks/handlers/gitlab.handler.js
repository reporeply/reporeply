/* ================================================================
 * GITLAB WEBHOOK HANDLER
 * ================================================================
 * Handles all GitLab webhook events including:
 * - Issue mentions (reminders)
 * - Issue labeling (auto-comment, auto-close)
 * - Installation events (label bootstrap)
 * 
 * Location: src/features/webhooks/handlers/gitlab.handler.js
 * ================================================================ */

import logger from '../../../core/utils/logger.utils.js';
import { createReminder } from '../../reminders/reminder.service.js';
import { ensureRepositoryExists } from '../../../services/shared/repository.service.js';
import { ValidationError, withRetry } from '../../../core/utils/errors.utils.js';
import { checkGitLabPermissions } from '../processors/permissions.processor.js';
import { sendGitLabComment, sendGitLabErrorComment } from '../processors/comments.processor.js';
import {
  isValidCommand,
  isAdminCommand,
  extractCommandText,
  validateReminder,
} from '../processors/validation.processor.js';

/* -------------------- Issue Labels Integration -------------------- */
import { 
  processIssueLabeledEvent as processGitHubIssueLabeledEvent,
  processIssueUnlabeledEvent as processGitHubIssueUnlabeledEvent,
  isValidLabelPayload 
} from '../../issue-labels/issue-labeled.processor.js';
import { 
  handleIssueOpened as handleGitHubIssueOpened,
  handleIssueEdited as handleGitHubIssueEdited 
} from '../../issue-labels/label.orchestrator.js';
import { ensureDefaultLabels as ensureGitHubDefaultLabels } from '../../issue-labels/label.bootstrap.js';

/* ================================================================
 * MAIN WEBHOOK ROUTER
 * ================================================================ */

/**
 * Main GitLab webhook event router
 * @param {string} event - GitLab event type (e.g., 'Issue Hook', 'Note Hook')
 * @param {Object} payload - GitLab webhook payload
 * @param {string} accessToken - GitLab access token
 * @returns {Promise<Object>} - Processing result
 */
export async function handleGitLabWebhook(event, payload, accessToken) {
  logger.info(`[GitLabHandler] Processing webhook: ${event}`);

  try {
    switch (event) {
      /* -------------------- Issue Events -------------------- */
      case 'Issue Hook':
        return await handleIssueEvent(payload, accessToken);

      /* -------------------- Note (Comment) Events -------------------- */
      case 'Note Hook':
        return await handleNoteEvent(payload, accessToken);

      /* -------------------- Merge Request Events -------------------- */
      case 'Merge Request Hook':
        return await handleMergeRequestEvent(payload, accessToken);

      /* -------------------- Other Events -------------------- */
      default:
        logger.debug(`[GitLabHandler] Unhandled event type: ${event}`);
        return { success: true, event, action: 'ignored' };
    }
  } catch (error) {
    logger.error(`[GitLabHandler] Error processing ${event}:`, error);
    return { 
      success: false, 
      event, 
      error: error.message 
    };
  }
}

/* ================================================================
 * ISSUE EVENT HANDLER
 * ================================================================ */

/**
 * Handle GitLab issue events (open, update, close, reopen)
 */
async function handleIssueEvent(payload, accessToken) {
  const action = payload.object_attributes?.action;
  const issueId = payload.object_attributes?.iid;
  const projectPath = payload.project?.path_with_namespace;

  logger.info(
    `[GitLabHandler] Issue event: ${action} on ${projectPath}#${issueId}`
  );

  // Convert GitLab payload to GitHub-compatible format for label processing
  const normalizedPayload = normalizeGitLabPayload(payload);

  switch (action) {
    /* -------------------- Issue Opened -------------------- */
    case 'open':
      return await handleGitHubIssueOpened(normalizedPayload);

    /* -------------------- Issue Updated -------------------- */
    case 'update':
      return await handleGitHubIssueEdited(normalizedPayload);

    /* -------------------- Issue Reopened -------------------- */
    case 'reopen':
      return await handleGitHubIssueOpened(normalizedPayload);

    /* -------------------- Issue Closed -------------------- */
    case 'close':
      logger.debug(`[GitLabHandler] Issue closed - no handler configured`);
      return {
        success: true,
        action,
        message: 'Issue closed event processed',
      };

    /* -------------------- Other Actions -------------------- */
    default:
      logger.debug(`[GitLabHandler] Unhandled issue action: ${action}`);
      return {
        success: true,
        action,
        message: 'Unhandled action',
      };
  }
}

/* ================================================================
 * NOTE (COMMENT) EVENT HANDLER
 * ================================================================ */

/**
 * Handle GitLab note (comment) events
 */
async function handleNoteEvent(payload, accessToken) {
  const noteableType = payload.object_attributes?.noteable_type;

  // Only process issue comments
  if (noteableType !== 'Issue') {
    return {
      success: true,
      action: 'skipped',
      reason: 'Not an issue comment',
    };
  }

  // Delegate to mention handler
  return await handleGitLabMention(payload, accessToken);
}

/**
 * Handle RepoReply commands from GitLab issue comments
 * @param {Object} payload - GitLab webhook payload
 * @param {string} accessToken - GitLab access token
 * @returns {Promise<Object>} - Processing result
 */
export async function handleGitLabMention(payload, accessToken) {
  logger.info(
    `[GitLabHandler] Processing mention: ${payload.project.path_with_namespace}#${payload.object_attributes.iid}`
  );

  const body = payload.object_attributes?.note;
  if (!body) {
    return {
      success: true,
      action: 'skipped',
      reason: 'No comment body',
    };
  }

  /* -------------------- Validate Command -------------------- */
  if (!isValidCommand(body)) {
    return {
      success: true,
      action: 'skipped',
      reason: 'Not a valid RepoReply command',
    };
  }

  const isAdmin = isAdminCommand(body);

  try {
    /* -------------------- Permission Check -------------------- */
    const allowed = await checkGitLabPermissions(payload, accessToken);

    if (!allowed) {
      await sendGitLabErrorComment(
        payload,
        '❌ Reminder not created.\n\n' +
          'Only the issue author, project members, or contributors are permitted to create reminders for this issue.',
        accessToken
      );
      return {
        success: false,
        action: 'permission_denied',
      };
    }

    /* -------------------- Extract and Validate -------------------- */
    const commandText = extractCommandText(body);

    const parsed = await validateReminder({
      commandText,
      repo_id: payload.project.path_with_namespace,
      issue_number: payload.object_attributes.iid,
      skipRateLimit: isAdmin,
    });

    /* -------------------- Ensure Repository Exists -------------------- */
    await ensureRepositoryExists({
      repository: {
        full_name: payload.project.path_with_namespace,
        owner: { login: payload.project.namespace },
      },
    });

    /* -------------------- Save Reminder -------------------- */
    const reminderData = {
      repo_id: payload.project.path_with_namespace,
      issue_number: payload.object_attributes.iid,
      message: `Scheduled reminder for @${payload.user.username}. Please review when convenient.`,
      scheduled_at: parsed.remindAt,
      created_by: payload.user.username,
    };

    const reminder = await withRetry(
      () => createReminder(reminderData),
      3,
      1000
    );

    logger.info(`[GitLabHandler] ✅ Reminder created: ${reminder.id}`);

    /* -------------------- Send Confirmation -------------------- */
    await sendGitLabComment(
      payload,
      `Got it. I will remind you on **${parsed.remindAt.toLocaleString(
        'en-IN',
        { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }
      )}**.`,
      accessToken
    );

    return {
      success: true,
      action: 'reminder_created',
      reminderId: reminder.id,
    };

  } catch (error) {
    logger.error('[GitLabHandler] ❌ Reminder error:', {
      name: error.name,
      message: error.message,
    });

    /* -------------------- Error Response -------------------- */
    let userMessage = '❌ Failed to create reminder.\n\n';

    if (error instanceof ValidationError) {
      userMessage += error.message;
    } else if (error.name === 'DatabaseError') {
      userMessage += 'Database error occurred. Please try again in a moment.';
    } else if (error.code === 'P2002') {
      userMessage += 'A reminder already exists with these details.';
    } else {
      userMessage +=
        'An unexpected error occurred. Please contact support if this persists.';
    }

    await sendGitLabErrorComment(payload, userMessage, accessToken);

    return {
      success: false,
      action: 'reminder_failed',
      error: error.message,
    };
  }
}

/* ================================================================
 * MERGE REQUEST EVENT HANDLER
 * ================================================================ */

/**
 * Handle merge request events
 */
async function handleMergeRequestEvent(payload, accessToken) {
  const action = payload.object_attributes?.action;
  const mrId = payload.object_attributes?.iid;
  const projectPath = payload.project?.path_with_namespace;

  logger.debug(`[GitLabHandler] MR event: ${action} on ${projectPath}!${mrId}`);

  // Add your MR logic here if needed
  // For now, just log and return

  return {
    success: true,
    action,
    message: 'MR handling not yet implemented',
  };
}

/* ================================================================
 * GITLAB-TO-GITHUB PAYLOAD NORMALIZATION
 * ================================================================ */

/**
 * Convert GitLab webhook payload to GitHub-compatible format
 * This allows us to reuse the GitHub label processing logic
 * 
 * @param {Object} gitlabPayload - GitLab webhook payload
 * @returns {Object} - GitHub-compatible payload
 */
function normalizeGitLabPayload(gitlabPayload) {
  // Note: This is a simplified normalization
  // You may need to adjust based on your specific needs

  const project = gitlabPayload.project;
  const issue = gitlabPayload.object_attributes;
  const user = gitlabPayload.user;

  return {
    installation: {
      id: `gitlab-${project.id}`, // Synthetic installation ID
    },
    repository: {
      id: project.id,
      full_name: project.path_with_namespace,
      name: project.name,
      owner: {
        login: project.namespace,
      },
    },
    issue: {
      id: issue.id,
      number: issue.iid,
      title: issue.title,
      body: issue.description || '',
      state: issue.state,
      labels: issue.labels?.map(label => ({
        name: label.title || label.name || label,
        color: label.color || 'cccccc',
      })) || [],
      user: {
        login: issue.author?.username || user?.username,
      },
    },
    sender: {
      login: user?.username || 'unknown',
    },
    label: issue.labels && issue.labels.length > 0 ? {
      name: issue.labels[issue.labels.length - 1].title || 
            issue.labels[issue.labels.length - 1].name ||
            issue.labels[issue.labels.length - 1],
      color: issue.labels[issue.labels.length - 1].color || 'cccccc',
    } : null,
    changes: gitlabPayload.changes,
  };
}

/* ================================================================
 * GITLAB LABEL OPERATIONS (WRAPPER FUNCTIONS)
 * ================================================================ */

/**
 * Ensure default labels exist in GitLab project
 * Wraps the GitHub label bootstrap with GitLab API calls
 */
async function ensureDefaultLabels(projectId, accessToken) {
  logger.info(`[GitLabHandler] Label bootstrap for GitLab project ${projectId} not yet implemented`);
  
  // TODO: Implement GitLab-specific label creation
  // This would call GitLab API instead of GitHub API
  // For now, return success to prevent errors
  
  return {
    created: [],
    updated: [],
    skipped: [],
    errors: [],
    message: 'GitLab label bootstrap not yet implemented',
  };
}

/**
 * Process GitLab label events
 * Wraps the GitHub label processor with GitLab normalization
 */
async function processIssueLabeledEvent(payload, accessToken) {
  const normalizedPayload = normalizeGitLabPayload(payload);
  
  if (!isValidLabelPayload(normalizedPayload)) {
    return {
      success: false,
      error: 'Invalid label payload',
    };
  }

  return await processGitHubIssueLabeledEvent(normalizedPayload);
}

/**
 * Process GitLab unlabel events
 * Wraps the GitHub unlabel processor with GitLab normalization
 */
async function processIssueUnlabeledEvent(payload, accessToken) {
  const normalizedPayload = normalizeGitLabPayload(payload);
  
  if (!isValidLabelPayload(normalizedPayload)) {
    return {
      success: false,
      error: 'Invalid label payload',
    };
  }

  return await processGitHubIssueUnlabeledEvent(normalizedPayload);
}

/* ================================================================
 * EXPORTS
 * ================================================================ */

export {
  handleIssueEvent,
  handleNoteEvent,
  handleMergeRequestEvent,
  normalizeGitLabPayload,
  ensureDefaultLabels,
  processIssueLabeledEvent,
  processIssueUnlabeledEvent,
};