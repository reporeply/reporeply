/* ================================================================
 * GITHUB WEBHOOK HANDLER
 * ================================================================
 * Handles all GitHub webhook events including:
 * - Issue mentions (reminders)
 * - Issue labeling (auto-comment, auto-close)
 * - Installation events (label bootstrap)
 * 
 * Location: src/features/webhooks/handlers/github.handler.js
 * ================================================================ */

import logger from '../../../core/utils/logger.utils.js';
import { createReminder } from '../../reminders/reminder.service.js';
import { ensureRepositoryExists } from '../../../services/shared/repository.service.js';
import { ValidationError, withRetry } from '../../../core/utils/errors.utils.js';
import { checkGitHubPermissions } from '../processors/permissions.processor.js';
import { sendGitHubComment, sendGitHubErrorComment } from '../processors/comments.processor.js';
import {
  isValidCommand,
  isAdminCommand,
  extractCommandText,
  validateReminder,
} from '../processors/validation.processor.js';

/* -------------------- Issue Labels Integration -------------------- */
import { 
  processIssueLabeledEvent, 
  processIssueUnlabeledEvent, 
  isValidLabelPayload 
} from '../../issue-labels/issue-labeled.processor.js';
import { 
  handleIssueOpened, 
  handleIssueEdited 
} from '../../issue-labels/label.orchestrator.js';
import { ensureDefaultLabels } from '../../issue-labels/label.bootstrap.js';

/* ================================================================
 * MAIN WEBHOOK ROUTER
 * ================================================================ */

/**
 * Main GitHub webhook event router
 * @param {string} event - GitHub event type (e.g., 'issues', 'installation')
 * @param {Object} payload - GitHub webhook payload
 * @returns {Promise<Object>} - Processing result
 */
export async function handleGitHubWebhook(event, payload) {
  logger.info(`[GitHubHandler] Processing webhook: ${event} (action: ${payload.action || 'N/A'})`);

  try {
    switch (event) {
      /* -------------------- Installation Events -------------------- */
      case 'installation':
      case 'installation_repositories':
        return await handleInstallationEvent(event, payload);

      /* -------------------- Issue Events -------------------- */
      case 'issues':
        return await handleIssueEvent(payload);

      /* -------------------- Issue Comment Events -------------------- */
      case 'issue_comment':
        return await handleIssueCommentEvent(payload);

      /* -------------------- Pull Request Events -------------------- */
      case 'pull_request':
        return await handlePullRequestEvent(payload);

      /* -------------------- Other Events -------------------- */
      default:
        logger.debug(`[GitHubHandler] Unhandled event type: ${event}`);
        return { success: true, event, action: 'ignored' };
    }
  } catch (error) {
    logger.error(`[GitHubHandler] Error processing ${event}:`, error);
    return { 
      success: false, 
      event, 
      error: error.message 
    };
  }
}

/* ================================================================
 * INSTALLATION EVENT HANDLER
 * ================================================================ */

/**
 * Handle installation and installation_repositories events
 * Auto-creates labels when RepoReply is installed
 */
async function handleInstallationEvent(event, payload) {
  if (payload.action === 'created' || payload.action === 'added') {
    const repos = payload.repositories || [payload.repository];
    
    logger.info(`[GitHubHandler] Installing labels for ${repos.length} repositories`);

    const results = {
      total: repos.length,
      successful: 0,
      failed: 0,
      details: [],
    };

    for (const repo of repos) {
      try {
        const labelResult = await ensureDefaultLabels(payload.installation, repo);
        results.successful++;
        results.details.push({
          repository: repo.full_name,
          success: true,
          labelResult,
        });
        logger.info(`[GitHubHandler] ✅ Labels installed for ${repo.full_name}`);
      } catch (error) {
        results.failed++;
        results.details.push({
          repository: repo.full_name,
          success: false,
          error: error.message,
        });
        logger.error(`[GitHubHandler] ❌ Failed to install labels for ${repo.full_name}:`, error);
      }
    }

    logger.info(
      `[GitHubHandler] Installation complete: ${results.successful}/${results.total} successful`
    );

    return {
      success: true,
      event,
      action: payload.action,
      results,
    };
  }

  return {
    success: true,
    event,
    action: payload.action,
    message: 'No action required',
  };
}

/* ================================================================
 * ISSUE EVENT HANDLER
 * ================================================================ */

/**
 * Handle all issue events (opened, edited, labeled, unlabeled, etc.)
 */
async function handleIssueEvent(payload) {
  const action = payload.action;
  
  logger.info(
    `[GitHubHandler] Issue event: ${action} on ${payload.repository.full_name}#${payload.issue.number}`
  );

  switch (action) {
    /* -------------------- Issue Opened -------------------- */
    case 'opened':
      // Auto-analyze and label new issues
      return await handleIssueOpened(payload);

    /* -------------------- Issue Edited -------------------- */
    case 'edited':
      // Re-analyze if title or body changed
      return await handleIssueEdited(payload);

    /* -------------------- Issue Labeled -------------------- */
    case 'labeled':
      // Process label application (auto-comment, schedule close)
      if (isValidLabelPayload(payload)) {
        return await processIssueLabeledEvent(payload);
      }
      return {
        success: false,
        action,
        error: 'Invalid label payload',
      };

    /* -------------------- Issue Unlabeled -------------------- */
    case 'unlabeled':
      // Handle label removal (cancel auto-close if needed)
      if (isValidLabelPayload(payload)) {
        return await processIssueUnlabeledEvent(payload);
      }
      return {
        success: false,
        action,
        error: 'Invalid unlabel payload',
      };

    /* -------------------- Issue Reopened -------------------- */
    case 'reopened':
      // Re-analyze reopened issues
      return await handleIssueOpened(payload);

    /* -------------------- Other Issue Actions -------------------- */
    case 'closed':
    case 'assigned':
    case 'unassigned':
    case 'milestoned':
    case 'demilestoned':
      logger.debug(`[GitHubHandler] Issue action "${action}" - no handler configured`);
      return {
        success: true,
        action,
        message: 'No handler for this action',
      };

    default:
      logger.debug(`[GitHubHandler] Unhandled issue action: ${action}`);
      return {
        success: true,
        action,
        message: 'Unhandled action',
      };
  }
}

/* ================================================================
 * ISSUE COMMENT EVENT HANDLER (REMINDERS)
 * ================================================================ */

/**
 * Handle issue comment events - process @RepoReply mentions for reminders
 */
async function handleIssueCommentEvent(payload) {
  const action = payload.action;

  // Only process created comments
  if (action !== 'created') {
    return {
      success: true,
      action,
      message: 'Only processing created comments',
    };
  }

  // Delegate to mention handler
  return await handleGitHubMention(payload);
}

/**
 * Handle RepoReply commands from GitHub issue comments
 * @param {Object} payload - GitHub webhook payload
 * @returns {Promise<Object>} - Processing result
 */
async function handleGitHubMention(payload) {
  logger.info(
    `[GitHubHandler] Processing mention: ${payload.repository.full_name}#${payload.issue.number}`
  );

  const body = payload.comment?.body;
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
    const octokit = await getOctokitInstance(payload.installation.id);
    const allowed = await checkGitHubPermissions(payload, octokit);

    if (!allowed) {
      await sendGitHubErrorComment(
        octokit,
        payload,
        '❌ Reminder not created.\n\n' +
          'Only the issue author, repository collaborators, organization members, ' +
          'or prior contributors are permitted to create reminders for this issue.'
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
      repo_id: payload.repository.full_name,
      issue_number: payload.issue.number,
      skipRateLimit: isAdmin,
    });

    /* -------------------- Ensure Repository Exists -------------------- */
    await ensureRepositoryExists(payload);

    /* -------------------- Save Reminder -------------------- */
    const reminderData = {
      repo_id: payload.repository.full_name,
      issue_number: payload.issue.number,
      message: `Scheduled reminder for @${payload.sender.login}. Please review when convenient.`,
      scheduled_at: parsed.remindAt,
      created_by: payload.sender.login,
    };

    const reminder = await withRetry(
      () => createReminder(reminderData),
      3,
      1000
    );

    logger.info(`[GitHubHandler] ✅ Reminder created: ${reminder.id}`);

    /* -------------------- Send Confirmation -------------------- */
    await sendGitHubComment(
      octokit,
      payload,
      `Got it. I will remind you on **${parsed.remindAt.toLocaleString(
        'en-IN',
        { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }
      )}**.`
    );

    return {
      success: true,
      action: 'reminder_created',
      reminderId: reminder.id,
    };

  } catch (error) {
    logger.error('[GitHubHandler] ❌ Reminder error:', {
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

    const octokit = await getOctokitInstance(payload.installation.id);
    await sendGitHubErrorComment(octokit, payload, userMessage);

    return {
      success: false,
      action: 'reminder_failed',
      error: error.message,
    };
  }
}

/* ================================================================
 * PULL REQUEST EVENT HANDLER
 * ================================================================ */

/**
 * Handle pull request events
 */
async function handlePullRequestEvent(payload) {
  const action = payload.action;

  logger.debug(`[GitHubHandler] PR event: ${action} on ${payload.repository.full_name}#${payload.pull_request.number}`);

  // Add your PR logic here if needed
  // For now, just log and return

  return {
    success: true,
    action,
    message: 'PR handling not yet implemented',
  };
}

/* ================================================================
 * HELPER FUNCTIONS
 * ================================================================ */

/**
 * Get authenticated Octokit instance for GitHub API calls
 * @param {number} installationId - GitHub App installation ID
 * @returns {Promise<Object>} - Octokit instance
 */
async function getOctokitInstance(installationId) {
  // This should be implemented based on your authentication setup
  // Example:
  // const { Octokit } = await import('@octokit/rest');
  // const token = await getInstallationAccessToken(installationId);
  // return new Octokit({ auth: token });
  
  // Placeholder - replace with your actual implementation
  throw new Error('getOctokitInstance not implemented - add your GitHub auth logic');
}

/* ================================================================
 * EXPORTS
 * ================================================================ */

export {
  handleGitHubMention,
  handleInstallationEvent,
  handleIssueEvent,
  handleIssueCommentEvent,
  handlePullRequestEvent,
};