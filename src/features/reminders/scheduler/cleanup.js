/**
 * scheduler/cleanup.js
 *
 * Purpose: Cleanup stale processing locks
 * Releases locks from crashed or timed-out processes
 */

import { prisma } from "./../../../core/database/prisma.client.js";
import { CONFIG } from "./config.js";

/* -------------------- Stale Lock Cleanup -------------------- */
export async function cleanupStaleLocks() {
  const staleThreshold = new Date(Date.now() - CONFIG.PROCESSING_TIMEOUT_MS);

  const result = await prisma.reminders.updateMany({
    where: {
      status: "processing",
      created_at: { lt: staleThreshold },
    },
    data: {
      status: "pending",
    },
  });

  if (result.count > 0) {
    console.warn(`[Cleanup] Released ${result.count} stale locks`);
  }

  return result.count;
}