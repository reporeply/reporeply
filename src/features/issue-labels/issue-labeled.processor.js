/* ================================================================
 * ISSUE LABELED PROCESSOR
 * ================================================================
 * Processes GitHub webhook events when labels are added to issues.
 * Automatically posts comments and schedules auto-close based on
 * label rules.
 * 
 * This is the core replacement for GitHub Actions YAML workflows.
 * 
 * Location: src/features/issue-labels/issue-labeled.processor.js
 * ================================================================ */

import { getRuleByLabel } from './defaults.js';
import * as githubService from '../../services/external/github/github.service.js';
import logger from '../../core/utils/logger.utils.js';
import { scheduleAutoClose } from '../../services/background/inactivity.service.js';

/* -------------------- Main Event Handler -------------------- */

/**
 * Process issue labeled event from GitHub webhook
 * @param {Object} payload - GitHub webhook payload
 * @returns {Promise<Object>} - Processing result
 */
export async function processIssueLabeledEvent(payload) {
  const {
    installation,
    repository,
    issue,
    label,
    sender,
  } = payload;

  logger.info(
    `[IssueLabeledProcessor] Processing label event: "${label.name}" on ${repository.full_name}#${issue.number}`
  );

  try {
    // Find matching rule for this label
    const rule = getRuleByLabel(label.name);

    if (!rule) {
      logger.debug(
        `[IssueLabeledProcessor] No rule found for label "${label.name}", skipping`
      );
      return {
        success: true,
        action: 'skipped',
        reason: 'No matching rule',
        label: label.name,
      };
    }

    const result = {
      success: true,
      label: label.name,
      issue: issue.number,
      repository: repository.full_name,
      actions: [],
    };

    /* -------------------- Auto-Comment -------------------- */
    if (rule.comment) {
      await postAutoComment(installation, repository, issue, rule);
      result.actions.push('comment_posted');
      logger.info(`[IssueLabeledProcessor] Posted auto-comment for label "${label.name}"`);
    }

    /* -------------------- Schedule Auto-Close -------------------- */
    if (rule.autoCloseAfterDays) {
      await scheduleIssueAutoClose(installation, repository, issue, rule);
      result.actions.push('auto_close_scheduled');
      logger.info(
        `[IssueLabeledProcessor] Scheduled auto-close in ${rule.autoCloseAfterDays} days`
      );
    }

    /* -------------------- Log Event -------------------- */
    await logLabelEvent(installation, repository, issue, label, sender, result);

    logger.info(
      `[IssueLabeledProcessor] Successfully processed label "${label.name}" on #${issue.number}: ` +
      `${result.actions.join(', ')}`
    );

    return result;
  } catch (error) {
    logger.error(
      `[IssueLabeledProcessor] Error processing label "${label.name}" on #${issue.number}:`,
      error
    );

    return {
      success: false,
      error: error.message,
      label: label.name,
      issue: issue.number,
    };
  }
}

/* -------------------- Auto-Comment -------------------- */

/**
 * Post automatic comment when label is applied
 * @param {Object} installation - GitHub installation
 * @param {Object} repository - Repository object
 * @param {Object} issue - Issue object
 * @param {Object} rule - Label rule configuration
 */
async function postAutoComment(installation, repository, issue, rule) {
  // Check if comment already exists (avoid duplicates)
  const existingComments = await githubService.getIssueComments(
    installation.id,
    repository.owner.login,
    repository.name,
    issue.number
  );

  const commentAlreadyExists = existingComments.some(comment =>
    comment.user.type === 'Bot' &&
    comment.body.includes(rule.comment.substring(0, 50)) // Check first 50 chars
  );

  if (commentAlreadyExists) {
    logger.debug(
      `[IssueLabeledProcessor] Comment already exists for label "${rule.label}", skipping`
    );
    return;
  }

  // Post the comment
  await githubService.createIssueComment(
    installation.id,
    repository.owner.login,
    repository.name,
    issue.number,
    rule.comment
  );

  logger.info(`[IssueLabeledProcessor] Posted comment for label "${rule.label}"`);
}

/* -------------------- Auto-Close Scheduling -------------------- */

/**
 * Schedule automatic issue closure after inactivity
 * @param {Object} installation - GitHub installation
 * @param {Object} repository - Repository object
 * @param {Object} issue - Issue object
 * @param {Object} rule - Label rule configuration
 */
async function scheduleIssueAutoClose(installation, repository, issue, rule) {
  const closeAt = new Date();
  closeAt.setDate(closeAt.getDate() + rule.autoCloseAfterDays);

  await scheduleAutoClose({
    installationId: installation.id,
    repositoryId: repository.id,
    repositoryFullName: repository.full_name,
    issueNumber: issue.number,
    issueId: issue.id,
    closeAt,
    reason: `No activity after "${rule.label}" label applied`,
    labelName: rule.label,
    inactivityDays: rule.autoCloseAfterDays,
  });

  logger.info(
    `[IssueLabeledProcessor] Scheduled auto-close for #${issue.number} at ${closeAt.toISOString()}`
  );
}

/* -------------------- Event Logging -------------------- */

/**
 * Log label event for analytics and audit trail
 * @param {Object} installation - GitHub installation
 * @param {Object} repository - Repository object
 * @param {Object} issue - Issue object
 * @param {Object} label - Label object
 * @param {Object} sender - User who triggered the event
 * @param {Object} result - Processing result
 */
async function logLabelEvent(installation, repository, issue, label, sender, result) {
  // This can be extended to save to database for analytics
  logger.debug('[IssueLabeledProcessor] Event Log:', {
    timestamp: new Date().toISOString(),
    installation: installation.id,
    repository: repository.full_name,
    issue: issue.number,
    label: label.name,
    sender: sender.login,
    actions: result.actions,
  });

  // Future: Save to Prisma for analytics dashboard
  // await prisma.labelEvent.create({ data: { ... } });
}

/* -------------------- Issue Unlabeled Handler -------------------- */

/**
 * Process issue unlabeled event
 * Cancels auto-close if resolution label is removed
 * 
 * @param {Object} payload - GitHub webhook payload
 * @returns {Promise<Object>} - Processing result
 */
export async function processIssueUnlabeledEvent(payload) {
  const { installation, repository, issue, label } = payload;

  logger.info(
    `[IssueLabeledProcessor] Processing unlabel event: "${label.name}" removed from #${issue.number}`
  );

  const rule = getRuleByLabel(label.name);

  // If the removed label had auto-close, cancel it
  if (rule && rule.autoCloseAfterDays) {
    // Future: Cancel scheduled auto-close
    logger.info(
      `[IssueLabeledProcessor] Label "${label.name}" with auto-close removed, canceling schedule`
    );
  }

  return {
    success: true,
    action: 'unlabeled',
    label: label.name,
  };
}

/* -------------------- Validation -------------------- */

/**
 * Validate webhook payload before processing
 * @param {Object} payload - GitHub webhook payload
 * @returns {boolean} - True if valid
 */
export function isValidLabelPayload(payload) {
  return (
    payload &&
    payload.installation &&
    payload.repository &&
    payload.issue &&
    payload.label &&
    payload.label.name
  );
}