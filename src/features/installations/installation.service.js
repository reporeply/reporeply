/**
 * Installation Service
 * Handles GitHub App installation tracking and scope management
 * 
 * @file installation.service.js
 * @location src/features/installations/installation.service.js
 */

import { prisma } from "../../core/database/prisma.client.js";
import { DatabaseError } from "../../core/utils/errors.utils.js";

/**
 * Save installation details when app is installed
 */
export async function createInstallation({
  installationId,
  ownerType,
  ownerId,
  ownerLogin,
  installedBy,
  installedScope,
  accessToken = null,
  expiresAt = null,
}) {
  try {
    const installation = await prisma.installations.create({
      data: {
        installation_id: BigInt(installationId),
        owner_type: ownerType.toUpperCase(),
        owner_id: ownerId,
        owner_login: ownerLogin,
        installed_by: installedBy,
        installed_scope: installedScope,
        access_token: accessToken,
        expires_at: expiresAt,
      },
    });

    console.log(
      `[Installation] ✅ Created: ${ownerLogin} (${ownerType}) - ${installedScope}`
    );

    return installation;
  } catch (error) {
    console.error("[Installation] Failed to create:", error);
    throw new DatabaseError("Failed to save installation", error);
  }
}

/**
 * Update installation (e.g., new access token)
 */
export async function updateInstallation(installationId, data) {
  try {
    return await prisma.installations.update({
      where: { installation_id: BigInt(installationId) },
      data: {
        ...data,
        updated_at: new Date(),
      },
    });
  } catch (error) {
    console.error("[Installation] Failed to update:", error);
    throw new DatabaseError("Failed to update installation", error);
  }
}

/**
 * Delete installation when uninstalled
 */
export async function deleteInstallation(installationId) {
  try {
    await prisma.installations.delete({
      where: { installation_id: BigInt(installationId) },
    });

    console.log(`[Installation] 🗑️  Deleted: ${installationId}`);
  } catch (error) {
    console.error("[Installation] Failed to delete:", error);
    throw new DatabaseError("Failed to delete installation", error);
  }
}

/**
 * Get installation by ID
 */
export async function getInstallation(installationId) {
  try {
    return await prisma.installations.findUnique({
      where: { installation_id: BigInt(installationId) },
    });
  } catch (error) {
    console.error("[Installation] Failed to fetch:", error);
    return null;
  }
}

/**
 * Add repositories to installation tracking
 */
export async function addInstallationRepos(installationId, repositories) {
  try {
    const repoData = repositories.map((repo) => ({
      installation_id: BigInt(installationId),
      repo_id: repo.full_name,
      repo_full_name: repo.full_name,
      is_active: true,
    }));

    await prisma.installation_repos.createMany({
      data: repoData,
      skipDuplicates: true,
    });

    console.log(
      `[Installation] ✅ Added ${repoData.length} repos to installation ${installationId}`
    );

    return repoData;
  } catch (error) {
    console.error("[Installation] Failed to add repos:", error);
    throw new DatabaseError("Failed to add installation repos", error);
  }
}

/**
 * Remove repositories from installation tracking
 */
export async function removeInstallationRepos(installationId, repoIds) {
  try {
    await prisma.installation_repos.deleteMany({
      where: {
        installation_id: BigInt(installationId),
        repo_id: { in: repoIds },
      },
    });

    console.log(
      `[Installation] 🗑️  Removed ${repoIds.length} repos from installation ${installationId}`
    );
  } catch (error) {
    console.error("[Installation] Failed to remove repos:", error);
    throw new DatabaseError("Failed to remove installation repos", error);
  }
}

/**
 * Get all active repositories for an installation
 */
export async function getInstallationRepos(installationId) {
  try {
    return await prisma.installation_repos.findMany({
      where: {
        installation_id: BigInt(installationId),
        is_active: true,
      },
    });
  } catch (error) {
    console.error("[Installation] Failed to fetch repos:", error);
    return [];
  }
}

/**
 * Check if a repository is covered by an installation
 */
export async function isRepoInstalled(repoFullName) {
  try {
    const installationRepo = await prisma.installation_repos.findFirst({
      where: {
        repo_full_name: repoFullName,
        is_active: true,
      },
      include: {
        installations: true,
      },
    });

    return !!installationRepo;
  } catch (error) {
    console.error("[Installation] Failed to check repo:", error);
    return false;
  }
}

/**
 * Get installation for a specific repository
 */
export async function getInstallationForRepo(repoFullName) {
  try {
    const installationRepo = await prisma.installation_repos.findFirst({
      where: {
        repo_full_name: repoFullName,
        is_active: true,
      },
      include: {
        installations: true,
      },
    });

    return installationRepo?.installations || null;
  } catch (error) {
    console.error("[Installation] Failed to get installation for repo:", error);
    return null;
  }
}