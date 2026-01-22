/**
 * RepoReply Chat Service
 * Native in-platform collaboration and discussion threads
 * 
 * @file reporeply-chat.service.js
 * @location src/features/collaboration/reporeply-chat.service.js
 * 
 * This is the product moat - features GitHub doesn't have:
 * - Internal team discussions on issues/PRs
 * - AI-generated suggestions inline
 * - Annotations and notes
 * - Team coordination without GitHub noise
 */

import { prisma } from "../../core/database/prisma.client.js";
import { v4 as uuidv4 } from "uuid";
import { ValidationError } from "../../core/utils/errors.utils.js";

/**
 * Create a new discussion thread on an issue or PR
 */
export async function createThread({
  repoId,
  issueId = null,
  prId = null,
  threadType = "discussion",
  title = null,
  createdBy,
  username,
}) {
  if (!issueId && !prId) {
    throw new ValidationError("Must attach thread to either an issue or PR");
  }

  try {
    const threadId = uuidv4();

    const thread = await prisma.reporeply_threads.create({
      data: {
        id: threadId,
        repo_id: repoId,
        issue_id: issueId,
        pr_id: prId,
        thread_type: threadType,
        title,
        status: "open",
        created_by: createdBy,
      },
    });

    console.log(`[RepoReply Chat] ✅ Thread created: ${threadId}`);

    return thread;
  } catch (error) {
    console.error("[RepoReply Chat] Failed to create thread:", error);
    throw error;
  }
}

/**
 * Post a message in a thread
 */
export async function postMessage({
  threadId,
  userId,
  username,
  message,
  messageType = "text",
  isAiGenerated = false,
  aiConfidence = null,
}) {
  try {
    const messageId = uuidv4();

    const newMessage = await prisma.reporeply_messages.create({
      data: {
        id: messageId,
        thread_id: threadId,
        user_id: userId,
        username,
        message,
        message_type: messageType,
        is_ai_generated: isAiGenerated,
        ai_confidence: aiConfidence,
      },
    });

    // Update thread updated_at
    await prisma.reporeply_threads.update({
      where: { id: threadId },
      data: { updated_at: new Date() },
    });

    console.log(`[RepoReply Chat] 💬 Message posted: ${messageId}`);

    return newMessage;
  } catch (error) {
    console.error("[RepoReply Chat] Failed to post message:", error);
    throw error;
  }
}

/**
 * Get all threads for an issue
 */
export async function getIssueThreads(issueId) {
  try {
    return await prisma.reporeply_threads.findMany({
      where: { issue_id: issueId },
      include: {
        messages: {
          orderBy: { created_at: "asc" },
          take: 50, // Latest 50 messages per thread
        },
      },
      orderBy: { created_at: "desc" },
    });
  } catch (error) {
    console.error("[RepoReply Chat] Failed to get threads:", error);
    return [];
  }
}

/**
 * Get all threads for a PR
 */
export async function getPRThreads(prId) {
  try {
    return await prisma.reporeply_threads.findMany({
      where: { pr_id: prId },
      include: {
        messages: {
          orderBy: { created_at: "asc" },
          take: 50,
        },
      },
      orderBy: { created_at: "desc" },
    });
  } catch (error) {
    console.error("[RepoReply Chat] Failed to get threads:", error);
    return [];
  }
}

/**
 * Get all messages in a thread
 */
export async function getThreadMessages(threadId, limit = 100) {
  try {
    return await prisma.reporeply_messages.findMany({
      where: { thread_id: threadId },
      orderBy: { created_at: "asc" },
      take: limit,
    });
  } catch (error) {
    console.error("[RepoReply Chat] Failed to get messages:", error);
    return [];
  }
}

/**
 * Resolve a thread
 */
export async function resolveThread(threadId, resolvedBy) {
  try {
    return await prisma.reporeply_threads.update({
      where: { id: threadId },
      data: {
        status: "resolved",
        resolved_at: new Date(),
        resolved_by: resolvedBy,
      },
    });
  } catch (error) {
    console.error("[RepoReply Chat] Failed to resolve thread:", error);
    throw error;
  }
}

/**
 * Reopen a thread
 */
export async function reopenThread(threadId) {
  try {
    return await prisma.reporeply_threads.update({
      where: { id: threadId },
      data: {
        status: "open",
        resolved_at: null,
        resolved_by: null,
      },
    });
  } catch (error) {
    console.error("[RepoReply Chat] Failed to reopen thread:", error);
    throw error;
  }
}

/**
 * Edit a message
 */
export async function editMessage(messageId, newMessage, userId) {
  try {
    // Verify ownership
    const existing = await prisma.reporeply_messages.findUnique({
      where: { id: messageId },
      select: { user_id: true },
    });

    if (!existing) {
      throw new ValidationError("Message not found");
    }

    if (existing.user_id !== userId) {
      throw new ValidationError("Not authorized to edit this message");
    }

    return await prisma.reporeply_messages.update({
      where: { id: messageId },
      data: {
        message: newMessage,
        edited_at: new Date(),
      },
    });
  } catch (error) {
    console.error("[RepoReply Chat] Failed to edit message:", error);
    throw error;
  }
}

/**
 * Post an AI-generated suggestion
 */
export async function postAISuggestion({
  threadId,
  suggestion,
  confidence,
  aiModel = "claude-4",
}) {
  try {
    return await postMessage({
      threadId,
      userId: "ai-system",
      username: "RepoReply AI",
      message: suggestion,
      messageType: "ai_suggestion",
      isAiGenerated: true,
      aiConfidence: confidence,
    });
  } catch (error) {
    console.error("[RepoReply Chat] Failed to post AI suggestion:", error);
    throw error;
  }
}

/**
 * Create annotation thread (for code snippets, specific comments, etc.)
 */
export async function createAnnotation({
  repoId,
  issueId = null,
  prId = null,
  title,
  initialMessage,
  createdBy,
  username,
}) {
  try {
    // Create thread
    const thread = await createThread({
      repoId,
      issueId,
      prId,
      threadType: "annotation",
      title,
      createdBy,
      username,
    });

    // Post initial message
    await postMessage({
      threadId: thread.id,
      userId: createdBy,
      username,
      message: initialMessage,
      messageType: "text",
    });

    return thread;
  } catch (error) {
    console.error("[RepoReply Chat] Failed to create annotation:", error);
    throw error;
  }
}

/**
 * Get thread statistics for a repo
 */
export async function getRepoThreadStats(repoId) {
  try {
    const total = await prisma.reporeply_threads.count({
      where: { repo_id: repoId },
    });

    const open = await prisma.reporeply_threads.count({
      where: { repo_id: repoId, status: "open" },
    });

    const resolved = await prisma.reporeply_threads.count({
      where: { repo_id: repoId, status: "resolved" },
    });

    const messageCount = await prisma.reporeply_messages.count({
      where: {
        reporeply_threads: {
          repo_id: repoId,
        },
      },
    });

    return {
      total_threads: total,
      open_threads: open,
      resolved_threads: resolved,
      total_messages: messageCount,
    };
  } catch (error) {
    console.error("[RepoReply Chat] Failed to get stats:", error);
    return null;
  }
}

/**
 * Search messages across threads
 */
export async function searchMessages(repoId, query, limit = 50) {
  try {
    return await prisma.reporeply_messages.findMany({
      where: {
        reporeply_threads: {
          repo_id: repoId,
        },
        message: {
          contains: query,
          mode: "insensitive",
        },
      },
      include: {
        reporeply_threads: {
          select: {
            id: true,
            issue_id: true,
            pr_id: true,
            title: true,
            thread_type: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
      take: limit,
    });
  } catch (error) {
    console.error("[RepoReply Chat] Failed to search messages:", error);
    return [];
  }
}