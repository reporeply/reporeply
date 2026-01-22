/**
 * Collaboration Controller
 * 
 * @file collaboration.controller.js
 * @location src/features/collaboration/collaboration.controller.js
 */

import {
  createThread,
  postMessage,
  getIssueThreads,
  getPRThreads,
  resolveThread,
  reopenThread,
  editMessage,
  searchMessages,
  getRepoThreadStats,
} from "./reporeply-chat.service.js";

/**
 * POST /api/collaboration/threads
 * Create a new discussion thread
 */
export async function createNewThread(req, res) {
  const {
    repoId,
    issueId,
    prId,
    threadType = "discussion",
    title,
    initialMessage,
  } = req.body;

  // TODO: Get from auth middleware
  const userId = req.user?.id || "demo-user";
  const username = req.user?.username || "Demo User";

  try {
    const thread = await createThread({
      repoId,
      issueId,
      prId,
      threadType,
      title,
      createdBy: userId,
      username,
    });

    // Post initial message if provided
    if (initialMessage) {
      await postMessage({
        threadId: thread.id,
        userId,
        username,
        message: initialMessage,
      });
    }

    res.status(201).json({
      success: true,
      data: { thread },
    });
  } catch (error) {
    console.error("[Collaboration API] Failed to create thread:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * POST /api/collaboration/threads/:threadId/messages
 * Post a message in a thread
 */
export async function postMessageToThread(req, res) {
  const { threadId } = req.params;
  const { message, messageType = "text" } = req.body;

  const userId = req.user?.id || "demo-user";
  const username = req.user?.username || "Demo User";

  try {
    const newMessage = await postMessage({
      threadId,
      userId,
      username,
      message,
      messageType,
    });

    res.status(201).json({
      success: true,
      data: { message: newMessage },
    });
  } catch (error) {
    console.error("[Collaboration API] Failed to post message:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * GET /api/collaboration/issues/:issueId/threads
 * Get all threads for an issue
 */
export async function getThreadsForIssue(req, res) {
  const { issueId } = req.params;

  try {
    const threads = await getIssueThreads(issueId);

    res.status(200).json({
      success: true,
      data: { threads },
    });
  } catch (error) {
    console.error("[Collaboration API] Failed to get threads:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * GET /api/collaboration/prs/:prId/threads
 * Get all threads for a PR
 */
export async function getThreadsForPR(req, res) {
  const { prId } = req.params;

  try {
    const threads = await getPRThreads(prId);

    res.status(200).json({
      success: true,
      data: { threads },
    });
  } catch (error) {
    console.error("[Collaboration API] Failed to get threads:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * PATCH /api/collaboration/threads/:threadId/resolve
 * Mark thread as resolved
 */
export async function resolveThreadById(req, res) {
  const { threadId } = req.params;
  const userId = req.user?.id || "demo-user";

  try {
    const thread = await resolveThread(threadId, userId);

    res.status(200).json({
      success: true,
      data: { thread },
    });
  } catch (error) {
    console.error("[Collaboration API] Failed to resolve thread:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * PATCH /api/collaboration/threads/:threadId/reopen
 * Reopen a resolved thread
 */
export async function reopenThreadById(req, res) {
  const { threadId } = req.params;

  try {
    const thread = await reopenThread(threadId);

    res.status(200).json({
      success: true,
      data: { thread },
    });
  } catch (error) {
    console.error("[Collaboration API] Failed to reopen thread:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * PATCH /api/collaboration/messages/:messageId
 * Edit a message
 */
export async function editThreadMessage(req, res) {
  const { messageId } = req.params;
  const { message } = req.body;
  const userId = req.user?.id || "demo-user";

  try {
    const updatedMessage = await editMessage(messageId, message, userId);

    res.status(200).json({
      success: true,
      data: { message: updatedMessage },
    });
  } catch (error) {
    console.error("[Collaboration API] Failed to edit message:", error);

    if (error.message.includes("Not authorized")) {
      return res.status(403).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * GET /api/collaboration/repos/:repoId/messages/search?q=query
 * Search messages across all threads in a repo
 */
export async function searchRepoMessages(req, res) {
  const { repoId } = req.params;
  const { q } = req.query;

  if (!q) {
    return res.status(400).json({
      success: false,
      error: "Query parameter 'q' is required",
    });
  }

  try {
    const results = await searchMessages(repoId, q);

    res.status(200).json({
      success: true,
      data: { results, query: q },
    });
  } catch (error) {
    console.error("[Collaboration API] Failed to search messages:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * GET /api/collaboration/repos/:repoId/threads/stats
 * Get thread statistics for a repo
 */
export async function getRepoThreadStatsController(req, res) {
  const { repoId } = req.params;

  try {
    const stats = await getRepoThreadStats(repoId);

    res.status(200).json({
      success: true,
      data: { stats },
    });
  } catch (error) {
    console.error("[Collaboration API] Failed to get stats:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}