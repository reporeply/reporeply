import * as githubService from '../../services/external/github/github.service.js';
import logger from '../../core/utils/logger.utils.js';
import { getRuleByLabel } from './defaults.js';

/* -------------------- Label Application -------------------- */

export async function applyLabel(installation, repository, issueNumber, labelName, options = {}) {
  const { 
    skipIfExists = true,
    triggeredBy = 'auto',
    metadata = {}
  } = options;

  logger.info(
    `[LabelApplier] Applying label "${labelName}" to ${repository.full_name}#${issueNumber}`
  );

  try {
    const issue = await githubService.getIssue(
      installation.id,
      repository.owner.login,
      repository.name,
      issueNumber
    );

    const hasLabel = issue.labels?.some(
      label => label.name.toLowerCase() === labelName.toLowerCase()
    );

    if (hasLabel && skipIfExists) {
      logger.info(`[LabelApplier] Label "${labelName}" already exists on issue #${issueNumber}`);
      return {
        success: true,
        action: 'skipped',
        label: labelName,
        issue: issueNumber,
      };
    }

    await githubService.addLabel(
      installation.id,
      repository.owner.login,
      repository.name,
      issueNumber,
      labelName
    );

    logger.info(`[LabelApplier] Successfully applied label "${labelName}" to #${issueNumber}`);

    return {
      success: true,
      action: 'applied',
      label: labelName,
      issue: issueNumber,
      triggeredBy,
      metadata,
    };
  } catch (error) {
    logger.error(
      `[LabelApplier] Failed to apply label "${labelName}" to #${issueNumber}:`,
      error
    );

    return {
      success: false,
      action: 'failed',
      label: labelName,
      issue: issueNumber,
      error: error.message,
    };
  }
}

/* -------------------- Batch Application -------------------- */

export async function applyMultipleLabels(
  installation,
  repository,
  issueNumber,
  labelNames,
  options = {}
) {
  logger.info(
    `[LabelApplier] Applying ${labelNames.length} labels to ${repository.full_name}#${issueNumber}`
  );

  const results = {
    total: labelNames.length,
    applied: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  for (const labelName of labelNames) {
    const result = await applyLabel(installation, repository, issueNumber, labelName, options);
    results.details.push(result);

    if (result.success) {
      if (result.action === 'applied') results.applied++;
      else if (result.action === 'skipped') results.skipped++;
    } else {
      results.failed++;
    }
  }

  logger.info(
    `[LabelApplier] Batch complete for #${issueNumber}: ` +
    `${results.applied} applied, ${results.skipped} skipped, ${results.failed} failed`
  );

  return results;
}

/* -------------------- Smart Label Management -------------------- */

export async function applyLabelWithConflictResolution(
  installation,
  repository,
  issueNumber,
  labelName
) {
  const conflictGroups = {
    'Type:': ['Type: Bug', 'Type: Feature Request'],
    'Resolution:': ['Resolution: Duplicate', 'Resolution: Cannot Replicate'],
    'Status:': ['Status: Needs Reproducer', 'Status: Needs More Info'],
  };

  let conflictingLabels = [];
  for (const [prefix, labels] of Object.entries(conflictGroups)) {
    if (labelName.startsWith(prefix)) {
      conflictingLabels = labels.filter(l => l !== labelName);
      break;
    }
  }

  if (conflictingLabels.length > 0) {
    logger.info(`[LabelApplier] Resolving conflicts for "${labelName}" on #${issueNumber}`);
    
    for (const conflictLabel of conflictingLabels) {
      try {
        await githubService.removeLabel(
          installation.id,
          repository.owner.login,
          repository.name,
          issueNumber,
          conflictLabel
        );
        logger.info(`[LabelApplier] Removed conflicting label "${conflictLabel}"`);
      } catch (error) {
        logger.debug(`[LabelApplier] Could not remove "${conflictLabel}": ${error.message}`);
      }
    }
  }

  return applyLabel(installation, repository, issueNumber, labelName);
}

/* -------------------- Label Removal -------------------- */

export async function removeLabel(installation, repository, issueNumber, labelName) {
  logger.info(
    `[LabelApplier] Removing label "${labelName}" from ${repository.full_name}#${issueNumber}`
  );

  try {
    await githubService.removeLabel(
      installation.id,
      repository.owner.login,
      repository.name,
      issueNumber,
      labelName
    );

    logger.info(`[LabelApplier] Successfully removed label "${labelName}" from #${issueNumber}`);

    return {
      success: true,
      action: 'removed',
      label: labelName,
      issue: issueNumber,
    };
  } catch (error) {
    logger.error(
      `[LabelApplier] Failed to remove label "${labelName}" from #${issueNumber}:`,
      error
    );

    return {
      success: false,
      action: 'failed',
      label: labelName,
      issue: issueNumber,
      error: error.message,
    };
  }
}

/* -------------------- Validation -------------------- */

export async function validateLabelExists(installation, repository, labelName) {
  try {
    const labels = await githubService.getRepositoryLabels(
      installation.id,
      repository.owner.login,
      repository.name
    );

    return labels.some(label => label.name.toLowerCase() === labelName.toLowerCase());
  } catch (error) {
    logger.error(`[LabelApplier] Failed to validate label "${labelName}":`, error);
    return false;
  }
}