/**
 * Collaboration API Routes
 * RepoReply native chat and threads
 * 
 * @file collaboration.routes.js
 * @location src/features/collaboration/collaboration.routes.js
 */

import express from "express";
import {
  createNewThread,
  postMessageToThread,
  getThreadsForIssue,
  getThreadsForPR,
  resolveThreadById,
  reopenThreadById,
  editThreadMessage,
  searchRepoMessages,
  getRepoThreadStatsController,
} from "./collaboration.controller.js";

const router = express.Router();

// Thread management
router.post("/threads", createNewThread);
router.get("/issues/:issueId/threads", getThreadsForIssue);
router.get("/prs/:prId/threads", getThreadsForPR);
router.patch("/threads/:threadId/resolve", resolveThreadById);
router.patch("/threads/:threadId/reopen", reopenThreadById);

// Messaging
router.post("/threads/:threadId/messages", postMessageToThread);
router.patch("/messages/:messageId", editThreadMessage);

// Search & stats
router.get("/repos/:repoId/messages/search", searchRepoMessages);
router.get("/repos/:repoId/threads/stats", getRepoThreadStatsController);

export default router;