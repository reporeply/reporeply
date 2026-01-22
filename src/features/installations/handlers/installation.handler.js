/**
 * Installation Webhook Handler
 * Processes GitHub App installation/uninstallation events
 * 
 * @file installation.handler.js
 * @location src/features/installations/handlers/installation.handler.js
 */

import {
  createInstallation,
  deleteInstallation,
  addInstallationRepos,
  removeInstallationRepos,
} from "../installation.service.js";
import { queueFullScan } from "../../scanning/scan.service.js";

/**
 * Handle installation.created event
 */
export async function handleInstallationCreated(payload) {
  console.log("\n[Installation] 📦 New installation event");

  const {
    installation,
    repositories = [],
    sender,
  } = payload;

  try {
    // Determine installation scope
    const ownerType = installation.account.type; // "User" or "Organization"
    const installedScope = repositories.length > 0 ? "repo" : "org";

    // Save installation
    await createInstallation({
      installationId: installation.id,
      ownerType,
      ownerId: installation.account.id.toString(),
      ownerLogin: installation.account.login,
      installedBy: sender?.login,
      installedScope,
    });

    // If specific repos selected, track them
    if (repositories.length > 0) {
      await addInstallationRepos(installation.id, repositories);
      
      // Queue scan for each repository
      for (const repo of repositories) {
        await queueFullScan({
          repoId: repo.full_name,
          installationId: installation.id,
          priority: "high",
        });
      }

      console.log(`[Installation] 🚀 Queued scans for ${repositories.length} repos`);
    } else if (installedScope === "org") {
      // Organization-wide install - need to fetch all repos
      console.log(`[Installation] 🏢 Org-wide install - will fetch all repos`);
      
      // This will be handled by a separate job that fetches all org repos
      // and queues them for scanning
      await queueOrgReposFetch(installation.id);
    }

    return { success: true, installedScope, repoCount: repositories.length };
  } catch (error) {
    console.error("[Installation] ❌ Failed to process installation:", error);
    throw error;
  }
}

/**
 * Handle installation.deleted event
 */
export async function handleInstallationDeleted(payload) {
  console.log("\n[Installation] 🗑️  Uninstallation event");

  const { installation } = payload;

  try {
    await deleteInstallation(installation.id);

    // Mark all associated repos as inactive
    // (They'll be handled by cascade delete in DB)

    console.log(`[Installation] ✅ Cleaned up installation ${installation.id}`);

    return { success: true };
  } catch (error) {
    console.error("[Installation] ❌ Failed to process uninstallation:", error);
    throw error;
  }
}

/**
 * Handle installation_repositories.added event
 */
export async function handleReposAdded(payload) {
  console.log("\n[Installation] ➕ Repositories added");

  const { installation, repositories_added = [] } = payload;

  try {
    if (repositories_added.length === 0) {
      return { success: true, repoCount: 0 };
    }

    // Add repos to tracking
    await addInstallationRepos(installation.id, repositories_added);

    // Queue scans for new repos
    for (const repo of repositories_added) {
      await queueFullScan({
        repoId: repo.full_name,
        installationId: installation.id,
        priority: "high",
      });
    }

    console.log(`[Installation] ✅ Added and queued ${repositories_added.length} repos`);

    return { success: true, repoCount: repositories_added.length };
  } catch (error) {
    console.error("[Installation] ❌ Failed to add repos:", error);
    throw error;
  }
}

/**
 * Handle installation_repositories.removed event
 */
export async function handleReposRemoved(payload) {
  console.log("\n[Installation] ➖ Repositories removed");

  const { installation, repositories_removed = [] } = payload;

  try {
    if (repositories_removed.length === 0) {
      return { success: true, repoCount: 0 };
    }

    const repoIds = repositories_removed.map((r) => r.full_name);

    // Remove repos from tracking
    await removeInstallationRepos(installation.id, repoIds);

    // Optionally: Mark repos as deleted or inactive in main repos table

    console.log(`[Installation] ✅ Removed ${repoIds.length} repos`);

    return { success: true, repoCount: repoIds.length };
  } catch (error) {
    console.error("[Installation] ❌ Failed to remove repos:", error);
    throw error;
  }
}

/**
 * Queue job to fetch all organization repositories
 * This is called when app is installed org-wide
 */
async function queueOrgReposFetch(installationId) {
  // Implementation will be in scanning service
  // This creates a background job to:
  // 1. Fetch all org repos via GitHub API
  // 2. Add them to installation_repos
  // 3. Queue scans for each
  
  console.log(`[Installation] 📋 Queued org repos fetch for installation ${installationId}`);
  
  // TODO: Implement in Phase 2
  // For now, just log
}