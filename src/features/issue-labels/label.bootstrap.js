import { DEFAULT_LABEL_RULES, isValidRule } from './defaults.js';
import * as githubService from '../../services/external/github/github.service.js';
import logger from '../../core/utils/logger.utils.js';

/* -------------------- Label Bootstrap -------------------- */

export async function ensureDefaultLabels(installation, repository) {
  const results = {
    created: [],
    updated: [],
    skipped: [],
    errors: [],
  };

  logger.info(`[LabelBootstrap] Starting label sync for ${repository.full_name}`);

  try {
    const existingLabels = await githubService.getRepositoryLabels(
      installation.id,
      repository.owner.login,
      repository.name
    );

    const existingLabelMap = new Map(
      existingLabels.map(label => [label.name.toLowerCase(), label])
    );

    for (const rule of DEFAULT_LABEL_RULES) {
      if (!isValidRule(rule)) {
        logger.warn(`[LabelBootstrap] Invalid rule configuration for: ${rule.label}`);
        results.errors.push({ label: rule.label, error: 'Invalid rule structure' });
        continue;
      }

      try {
        const existingLabel = existingLabelMap.get(rule.label.toLowerCase());

        if (!existingLabel) {
          await githubService.createLabel(
            installation.id,
            repository.owner.login,
            repository.name,
            {
              name: rule.label,
              color: rule.color,
              description: rule.description || '',
            }
          );

          results.created.push(rule.label);
          logger.info(`[LabelBootstrap] Created label: ${rule.label}`);
        } else if (
          existingLabel.color.toLowerCase() !== rule.color.toLowerCase() ||
          existingLabel.description !== (rule.description || '')
        ) {
          await githubService.updateLabel(
            installation.id,
            repository.owner.login,
            repository.name,
            rule.label,
            {
              color: rule.color,
              description: rule.description || '',
            }
          );

          results.updated.push(rule.label);
          logger.info(`[LabelBootstrap] Updated label: ${rule.label}`);
        } else {
          results.skipped.push(rule.label);
        }
      } catch (error) {
        logger.error(`[LabelBootstrap] Error processing label ${rule.label}:`, error);
        results.errors.push({ label: rule.label, error: error.message });
      }
    }

    logger.info(
      `[LabelBootstrap] Completed for ${repository.full_name}: ` +
      `${results.created.length} created, ${results.updated.length} updated, ` +
      `${results.skipped.length} skipped, ${results.errors.length} errors`
    );

    return results;
  } catch (error) {
    logger.error(`[LabelBootstrap] Fatal error for ${repository.full_name}:`, error);
    throw error;
  }
}

/* -------------------- Batch Operations -------------------- */

export async function bootstrapMultipleRepositories(installation, repositories) {
  const aggregateResults = {
    totalRepos: repositories.length,
    successful: 0,
    failed: 0,
    details: [],
  };

  logger.info(`[LabelBootstrap] Starting batch bootstrap for ${repositories.length} repositories`);

  for (const repo of repositories) {
    try {
      const result = await ensureDefaultLabels(installation, repo);
      aggregateResults.successful++;
      aggregateResults.details.push({
        repository: repo.full_name,
        success: true,
        result,
      });
    } catch (error) {
      aggregateResults.failed++;
      aggregateResults.details.push({
        repository: repo.full_name,
        success: false,
        error: error.message,
      });
    }
  }

  logger.info(
    `[LabelBootstrap] Batch complete: ${aggregateResults.successful}/${aggregateResults.totalRepos} successful`
  );

  return aggregateResults;
}

/* -------------------- Validation -------------------- */

export async function validateLabels(installation, repository) {
  try {
    const existingLabels = await githubService.getRepositoryLabels(
      installation.id,
      repository.owner.login,
      repository.name
    );

    const existingLabelNames = new Set(
      existingLabels.map(label => label.name.toLowerCase())
    );

    const missing = DEFAULT_LABEL_RULES
      .map(rule => rule.label)
      .filter(labelName => !existingLabelNames.has(labelName.toLowerCase()));

    return {
      hasAllLabels: missing.length === 0,
      missingLabels: missing,
      totalRequired: DEFAULT_LABEL_RULES.length,
      totalExisting: existingLabels.length,
    };
  } catch (error) {
    logger.error(`[LabelBootstrap] Validation failed for ${repository.full_name}:`, error);
    throw error;
  }
}