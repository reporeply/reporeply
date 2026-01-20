import { analyzeIssue, shouldAnalyze } from './issue.analyzer.js';
import { applyMultipleLabels, applyLabelWithConflictResolution } from './label.applier.js';
import { ensureDefaultLabels, validateLabels } from './label.bootstrap.js';
import * as githubService from '../../services/external/github/github.service.js';
import logger from '../../core/utils/logger.utils.js';

/* -------------------- Issue Creation Handler -------------------- */

export async function handleIssueOpened(payload) {
  const { installation, repository, issue } = payload;

  logger.info(
    `[LabelOrchestrator] Handling new issue: ${repository.full_name}#${issue.number}`
  );

  try {
    if (!shouldAnalyze(issue)) {
      logger.debug(
        `[LabelOrchestrator] Issue #${issue.number} skipped (closed or pull request)`
      );
      return {
        success: true,
        action: 'skipped',
        reason: 'Issue not eligible for analysis',
      };
    }

    /* -------------------- Step 1: Ensure Labels Exist -------------------- */
    await ensureDefaultLabels(installation, repository);

    /* -------------------- Step 2: Analyze Issue -------------------- */
    const suggestedLabels = await analyzeIssue(issue);

    if (suggestedLabels.length === 0) {
      logger.info(`[LabelOrchestrator] No labels suggested for #${issue.number}`);
      return {
        success: true,
        action: 'no_labels',
        issue: issue.number,
      };
    }

    /* -------------------- Step 3: Apply Labels -------------------- */
    const result = await applyMultipleLabels(
      installation,
      repository,
      issue.number,
      suggestedLabels,
      {
        skipIfExists: true,
        triggeredBy: 'auto-analysis',
        metadata: {
          timestamp: new Date().toISOString(),
          source: 'issue_opened_webhook',
        },
      }
    );

    logger.info(
      `[LabelOrchestrator] Completed auto-labeling for #${issue.number}: ` +
      `${result.applied} applied, ${result.skipped} skipped`
    );

    return {
      success: true,
      action: 'auto_labeled',
      issue: issue.number,
      labels: suggestedLabels,
      result,
    };
  } catch (error) {
    logger.error(
      `[LabelOrchestrator] Error handling issue #${issue.number}:`,
      error
    );

    return {
      success: false,
      error: error.message,
      issue: issue.number,
    };
  }
}

/* -------------------- Issue Edit Handler -------------------- */

export async function handleIssueEdited(payload) {
  const { installation, repository, issue, changes } = payload;

  if (!changes?.title && !changes?.body) {
    logger.debug(`[LabelOrchestrator] Issue #${issue.number} edited but no title/body change`);
    return {
      success: true,
      action: 'skipped',
      reason: 'No relevant changes',
    };
  }

  logger.info(
    `[LabelOrchestrator] Re-analyzing edited issue: ${repository.full_name}#${issue.number}`
  );

  return handleIssueOpened(payload);
}

/* -------------------- Manual Label Application -------------------- */

export async function manuallyApplyLabel(
  installation,
  repository,
  issueNumber,
  labelName,
  options = {}
) {
  logger.info(
    `[LabelOrchestrator] Manual label application: "${labelName}" to #${issueNumber}`
  );

  try {
    await ensureDefaultLabels(installation, repository);

    const result = await applyLabelWithConflictResolution(
      installation,
      repository,
      issueNumber,
      labelName
    );

    return result;
  } catch (error) {
    logger.error(
      `[LabelOrchestrator] Error applying label "${labelName}" to #${issueNumber}:`,
      error
    );

    return {
      success: false,
      error: error.message,
    };
  }
}

/* -------------------- Batch Operations -------------------- */

export async function batchAutoLabel(installation, repository, issueNumbers) {
  logger.info(
    `[LabelOrchestrator] Batch auto-labeling ${issueNumbers.length} issues in ${repository.full_name}`
  );

  const results = {
    total: issueNumbers.length,
    successful: 0,
    failed: 0,
    details: [],
  };

  await ensureDefaultLabels(installation, repository);

  for (const issueNumber of issueNumbers) {
    try {
      const issue = await githubService.getIssue(
        installation.id,
        repository.owner.login,
        repository.name,
        issueNumber
      );

      const mockPayload = { installation, repository, issue };
      const result = await handleIssueOpened(mockPayload);

      results.successful++;
      results.details.push({
        issue: issueNumber,
        success: true,
        result,
      });
    } catch (error) {
      results.failed++;
      results.details.push({
        issue: issueNumber,
        success: false,
        error: error.message,
      });
    }
  }

  logger.info(
    `[LabelOrchestrator] Batch complete: ${results.successful}/${results.total} successful`
  );

  return results;
}

/* -------------------- Analytics -------------------- */

export async function getLabelingStats(repositoryFullName, days = 30) {
  logger.info(`[LabelOrchestrator] Generating stats for ${repositoryFullName} (${days} days)`);

  return {
    repository: repositoryFullName,
    period: days,
    totalAutoLabeled: 0,
    totalManualLabeled: 0,
    mostCommonLabels: [],
    averageLabelsPerIssue: 0,
  };
}

/* -------------------- Health Check -------------------- */

export async function checkLabelHealth(installation, repository) {
  logger.info(`[LabelOrchestrator] Running health check for ${repository.full_name}`);

  try {
    const validation = await validateLabels(installation, repository);

    return {
      healthy: validation.hasAllLabels,
      repository: repository.full_name,
      totalRequired: validation.totalRequired,
      totalExisting: validation.totalExisting,
      missingLabels: validation.missingLabels,
    };
  } catch (error) {
    logger.error(`[LabelOrchestrator] Health check failed for ${repository.full_name}:`, error);

    return {
      healthy: false,
      error: error.message,
    };
  }
}